import { BrowserDownloads } from "./browser-downloads.mjs";
import { BrowserClipboard } from "./browser-clipboard.mjs";
import { createPlaywrightApi, waitForBrowserEventReady } from "./browser-playwright.mjs";
import { format } from "node:util";

export function screenshotPoint(point, image) {
  if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)) throw new Error("Coordinates must be two finite screenshot pixels");
  if (!image) throw new Error("No fresh screenshot; capture the tab before coordinate input");
  const [x,y] = point;
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) throw new Error("Coordinates are outside the screenshot");
  return {x:x * image.viewport.clientWidth / image.width, y:y * image.viewport.clientHeight / image.height};
}

export function keyEvent(key) {
  if (typeof key !== "string" || !key) throw new Error("pressKey requires a key");
  const parts = key.split("+");
  const value = parts.pop();
  let modifiers = 0;
  for (const part of parts) {
    const mask = {alt:1,ctrl:2,control:2,meta:4,super:4,cmd:4,shift:8}[part.toLowerCase()];
    if (!mask) throw new Error(`Unsupported key modifier: ${part}`);
    modifiers |= mask;
  }
  const named = {Return:["Enter",13],Enter:["Enter",13],Tab:["Tab",9],Escape:["Escape",27],BackSpace:["Backspace",8],Delete:["Delete",46],Up:["ArrowUp",38],Down:["ArrowDown",40],Left:["ArrowLeft",37],Right:["ArrowRight",39],Home:["Home",36],End:["End",35],Page_Up:["PageUp",33],Page_Down:["PageDown",34],space:[" ",32]};
  const entry = named[value];
  if (!entry && [...value].length !== 1) throw new Error(`Unsupported key: ${value}`);
  const result = {key:entry?.[0] ?? value, windowsVirtualKeyCode:entry?.[1] ?? (/^[a-z0-9]$/iu.test(value) ? value.toUpperCase().charCodeAt(0) : 0), modifiers};
  if (!(modifiers & 7) && ([...value].length === 1 || value === "space")) result.text = modifiers & 8 ? result.key.toUpperCase() : result.key;
  if (/^[a-z]$/iu.test(value)) result.code = `Key${value.toUpperCase()}`;
  // macOS CDP requires explicit editor commands for these shortcuts.
  const command = {a:"selectAll",c:"copy",x:"cut",v:"paste"}[value.toLowerCase()];
  if (process.platform === "darwin" && modifiers === 4 && command) result.commands = [command];
  return result;
}

// Runs in the page realm; keep all dependencies inside the function.
function editText(operation, text, options) {
  const control = this instanceof HTMLInputElement || this instanceof HTMLTextAreaElement;
  if (!this.isConnected || (!control && !this.isContentEditable)) throw new Error("Target is not an attached editable element");
  if (this.matches(":disabled") || (operation === "set" && (this.readOnly || this.getAttribute("aria-readonly") === "true"))) throw new Error("Target is disabled or read-only");
  if (this instanceof HTMLInputElement && !["text", "search", "url", "tel", "email", "password"].includes(this.type)) throw new Error("Unsupported input type for text editing");
  if (control && operation === "select" && this.selectionStart === null) throw new Error("Input type does not support selection");
  this.focus();
  if (!this.isConnected) throw new Error("Target changed while focusing");
  if (operation === "set") {
    if (control) {
      const prototype = this instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value").set.call(this, text);
    } else this.textContent = text;
    this.dispatchEvent(new InputEvent("input", {bubbles:true, inputType:"insertReplacementText", data:text}));
    this.dispatchEvent(new Event("change", {bubbles:true}));
    if (!this.isConnected || (control ? this.value : this.textContent) !== text) throw new Error("Value verification failed");
    return;
  }
  const value = control ? this.value : this.textContent;
  const matches = [];
  for (let position = value.indexOf(text); position !== -1; position = value.indexOf(text, position + 1)) {
    if (options.prefix !== undefined && !value.slice(0, position).endsWith(options.prefix)) continue;
    if (options.suffix !== undefined && !value.slice(position + text.length).startsWith(options.suffix)) continue;
    matches.push(position);
    if (matches.length > 1) break;
  }
  if (matches.length !== 1) throw new Error(matches.length ? "Ambiguous selection text; supply prefix or suffix" : "Selection text not found");
  let start = matches[0], end = start + text.length;
  if (options.selectionType === "cursor_before") end = start;
  if (options.selectionType === "cursor_after") start = end;
  if (control) {
    this.setSelectionRange(start, end);
    if (!this.isConnected || this.value !== value || this.selectionStart !== start || this.selectionEnd !== end) throw new Error("Selection verification failed");
  } else {
    const walker = this.ownerDocument.createTreeWalker(this, NodeFilter.SHOW_TEXT);
    const nodes = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
    const locate = offset => {
      for (const node of nodes) {
        if (offset <= node.length) return [node, offset];
        offset -= node.length;
      }
      throw new Error("Text changed during selection");
    };
    const range = this.ownerDocument.createRange();
    range.setStart(...locate(start));
    range.setEnd(...locate(end));
    const selection = this.ownerDocument.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    const applied = selection.rangeCount === 1 ? selection.getRangeAt(0) : null;
    const offsetOf = (node, offset) => {
      const prefix = this.ownerDocument.createRange();
      prefix.selectNodeContents(this);
      prefix.setEnd(node, offset);
      return prefix.toString().length;
    };
    if (!this.isConnected || this.textContent !== value || !applied || offsetOf(applied.startContainer, applied.startOffset) !== start || offsetOf(applied.endContainer, applied.endOffset) !== end) throw new Error("Selection verification failed");
  }
}

const TIMEOUT = 10_000;

async function openConnection(url, onEvent = () => {}, onClose = () => {}) {
  if (typeof WebSocket !== "function") throw new Error("CDP browser support requires Node.js 22 or newer");
  const socket = new WebSocket(url);
  const pending = new Map();
  let nextId = 0;
  const fail = error => {
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };
  socket.addEventListener("message", event => {
    let message;
    try {
      message = JSON.parse(event.data);
      if (!message || typeof message !== "object" || Array.isArray(message)) throw new Error("Invalid CDP message");
    } catch { fail(new Error("Invalid CDP response")); socket.close(); return; }
    if (message.method) {
      try { onEvent(message); }
      catch (error) { fail(error); socket.close(); onClose(); }
      return;
    }
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  socket.addEventListener("close", () => { fail(new Error("Browser connection closed")); onClose(); });
  socket.addEventListener("error", () => { fail(new Error("Browser connection failed")); onClose(); });
  let timer;
  try {
    await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error("Browser connection timed out")), TIMEOUT);
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", () => reject(new Error("Browser connection failed")), { once: true });
    });
    clearTimeout(timer);
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++nextId;
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP ${method} timed out`)); }, TIMEOUT);
      pending.set(id, {
        resolve: value => { clearTimeout(timeout); resolve(value); },
        reject: error => { clearTimeout(timeout); reject(error); },
      });
      try { socket.send(JSON.stringify({ id, method, params })); }
      catch (error) { pending.delete(id); clearTimeout(timeout); reject(error); }
    });
    return {send, close() { fail(new Error("Browser operation ended")); socket.close(); }};
  } catch (error) {
    clearTimeout(timer);
    fail(error);
    socket.close();
    throw error;
  }
}

export function browserEndpoint(environment) {
  if (!environment.OPEN_COMPUTER_USE_CDP_URL) return null;
  const url = new URL(environment.OPEN_COMPUTER_USE_CDP_URL);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("OPEN_COMPUTER_USE_CDP_URL must be an HTTP(S) browser debugging origin");
  }
  return url;
}

export class BrowserConsoleLogs {
  constructor(endpoint = () => browserEndpoint(process.env)?.href) {
    this.endpoint = endpoint;
    this.owners = new Map();
    this.closedOwners = new WeakSet();
  }
  async start(owner, targetId) {
    if (this.closedOwners.has(owner)) throw new Error("Browser log session closed");
    let tabs = this.owners.get(owner);
    if (!tabs) this.owners.set(owner, tabs = new Map());
    const previous = tabs.get(targetId);
    if (previous && !previous.error) return previous.ready;
    previous?.connection?.close();
    const entry = {logs:[], capturing:false, closed:false};
    tabs.set(targetId, entry);
    entry.ready = (async () => {
      const endpoint = this.endpoint();
      if (!endpoint) throw new Error("No CDP browser configured");
      const response = await fetch(new URL("/json/list", endpoint), {signal:AbortSignal.timeout(TIMEOUT), redirect:"error"});
      if (!response.ok) throw new Error(`Browser discovery failed: HTTP ${response.status}`);
      const targets = await response.json();
      const target = targets.find(item => item.type === "page" && item.id === targetId);
      if (!target) throw new Error("Tab closed or no longer available");
      const connection = await openConnection(target.webSocketDebuggerUrl, event => {
        if (entry.closed || !entry.capturing || event.method !== "Runtime.consoleAPICalled") return;
        const {type, args = [], timestamp, stackTrace} = event.params;
        const level = ({debug:"debug",info:"info",log:"log",warning:"warn",error:"error",assert:"error",trace:"debug",dir:"log",dirxml:"log",table:"log",startGroup:"log",startGroupCollapsed:"log",count:"log",timeEnd:"log"})[type];
        if (!level || !Array.isArray(args) || !Number.isFinite(timestamp) || !Number.isFinite(new Date(timestamp).getTime())) return;
        const values = args.map(arg => {
          if (arg.subtype === "null") return null;
          if (Object.hasOwn(arg,"value")) return arg.value;
          if (arg.preview?.properties?.length) return `${arg.description ?? arg.type} {${arg.preview.properties.map(property => `${property.name}: ${property.value ?? property.type}`).join(", ")}${arg.preview.overflow ? ", …" : ""}}`;
          return arg.unserializableValue ?? arg.description ?? arg.type;
        });
        const url = stackTrace?.callFrames?.[0]?.url;
        entry.logs.push({level, message:`${type === "assert" ? "Assertion failed: " : ""}${format(...values)}`.slice(0,16_384), timestamp:new Date(timestamp).toISOString(), ...(url ? {url} : {})});
        if (entry.logs.length > 1000) entry.logs.shift();
      }, () => { if (!entry.closed) entry.error = new Error("Browser log connection closed; bind the tab again to restart capture"); });
      entry.connection = connection;
      if (entry.closed) { connection.close(); throw new Error("Browser log session closed"); }
      await connection.send("Runtime.enable");
      // Runtime.enable replays old console entries before its response.
      entry.capturing = true;
    })().catch(error => { entry.error = error; entry.connection?.close(); throw error; });
    entry.ready.catch(() => {});
    return entry.ready;
  }
  async read(owner, targetId, options = {}) {
    if (!options || typeof options !== "object" || Array.isArray(options)) throw new Error("logs expects an options object");
    for (const key of Object.keys(options)) if (!["filter","levels","limit"].includes(key)) throw new Error(`Unknown logs option: ${key}`);
    if (options.filter !== undefined && typeof options.filter !== "string") throw new Error("logs filter must be a string");
    if (options.levels !== undefined && (!Array.isArray(options.levels) || options.levels.some(level => !["debug","info","log","warn","error","warning"].includes(level)))) throw new Error("Invalid log levels");
    const limit = options.limit ?? 100;
    if (!Number.isSafeInteger(limit) || limit < 0) throw new Error("logs limit must be a non-negative integer");
    const entry = this.owners.get(owner)?.get(targetId);
    if (!entry || entry.closed) throw new Error("Browser log capture unavailable; bind the tab again");
    await entry.ready;
    if (entry.error) throw entry.error;
    await entry.connection.send("Runtime.getIsolateId");
    const levels = options.levels?.map(level => level === "warning" ? "warn" : level);
    return limit === 0 ? [] : entry.logs.filter(log => (!levels || levels.includes(log.level)) && (options.filter === undefined || log.message.includes(options.filter))).slice(-limit).map(log => ({...log}));
  }
  stop(owner, targetId) {
    const tabs = this.owners.get(owner);
    const entry = tabs?.get(targetId);
    if (entry) { entry.closed = true; entry.connection?.close(); tabs.delete(targetId); }
    if (tabs?.size === 0) this.owners.delete(owner);
  }
  cleanup(owner) {
    this.closedOwners.add(owner);
    const pending = [...(this.owners.get(owner)?.values() ?? [])].map(entry => entry.ready);
    for (const targetId of this.owners.get(owner)?.keys() ?? []) this.stop(owner,targetId);
    return Promise.allSettled(pending);
  }
}

export class BrowserDialogs {
  constructor(endpoint = () => browserEndpoint(process.env)?.href) {
    this.endpoint = endpoint;
    this.targets = new Map();
    this.owners = new Map();
    this.closedOwners = new WeakSet();
    this.waiters = new Map();
    this.nextId = 0;
  }
  async start(owner, targetId) {
    if (this.closedOwners.has(owner)) throw new Error("Browser dialog session closed");
    const endpoint = this.endpoint();
    if (!endpoint) throw new Error("No CDP browser configured");
    const key = `${endpoint}|${targetId}`;
    let entry = this.targets.get(key);
    if (!entry || entry.error) {
      entry = {key,endpoint,targetId,owners:new Set(),watches:new Set(),dialogWaiters:new Set(),closed:false};
      this.targets.set(key,entry);
      entry.ready = (async () => {
        const response = await fetch(new URL("/json/list",endpoint),{signal:AbortSignal.timeout(TIMEOUT),redirect:"error"});
        if (!response.ok) throw new Error(`Browser discovery failed: HTTP ${response.status}`);
        const target = (await response.json()).find(item => item.type === "page" && item.id === targetId);
        if (!target) throw new Error("Tab closed or no longer available");
        const connection = await openConnection(target.webSocketDebuggerUrl,event => {
          if (entry.closed) return;
          if (event.method === "Page.javascriptDialogOpening") {
            const watch = [...entry.watches].at(-1);
            entry.dialog = {id:++this.nextId,type:event.params.type,owner:watch?.owner,consumed:false};
            for (const notify of entry.dialogWaiters) notify();
            for (const waiting of entry.watches) {
              waiting.opened = true;
              waiting.resolve({opened:true});
            }
          } else if (event.method === "Page.javascriptDialogClosed") entry.dialog = undefined;
        }, () => { if (!entry.closed) entry.error = new Error("Browser dialog connection closed; bind the tab again"); });
        entry.connection = connection;
        if (entry.closed) { connection.close(); throw new Error("Browser dialog session closed"); }
        await connection.send("Page.enable");
      })().catch(error => {entry.error=error;entry.connection?.close();throw error;});
      entry.ready.catch(() => {});
    }
    entry.owners.add(owner);
    if (!this.owners.has(owner)) this.owners.set(owner,new Set());
    this.owners.get(owner).add(entry);
    await entry.ready;
  }
  entry(owner, targetId) {
    const entry = this.targets.get(`${this.endpoint()}|${targetId}`);
    if (!entry || !entry.owners.has(owner) || entry.closed) throw new Error("Browser dialog capture unavailable; bind the tab again");
    if (entry.error) throw entry.error;
    return entry;
  }
  async request(owner, args) {
    if (args?.action === "start") return this.start(owner,args.targetId);
    if (args?.action === "stop") return this.stop(owner,args.targetId);
    if (args?.action === "wait" || args?.action === "end") {
      const watch = this.waiters.get(args.id);
      if (!watch || watch.owner !== owner) throw new Error("Unknown browser action watcher");
      if (args.action === "wait") return watch.waiting;
      watch.resolve({opened:false});
      watch.finish();
      watch.entry.watches.delete(watch);
      this.waiters.delete(args.id);
      return;
    }
    const entry = this.entry(owner,args?.targetId);
    if (args.action === "state") return entry.dialog ? {type:entry.dialog.type} : undefined;
    if (args.action === "check") {
      if (entry.dialog) throw new Error("Resolve the active JavaScript dialog with getJsDialog() first");
      return;
    }
    if (args.action === "checkPlaywright") {
      const active = [...this.targets.values()].find(target => target.endpoint === entry.endpoint && target.dialog);
      if (active) throw new Error(`Resolve the active JavaScript dialog in tab ${active.targetId} with getJsDialog() first`);
      return;
    }
    if (args.action === "watch") {
      if (entry.dialog) throw new Error("Resolve the active JavaScript dialog with getJsDialog() first");
      if ([...entry.watches].some(watch => !watch.opened || watch.owner !== owner)) throw new Error("A browser input action is already active for this tab");
      const watch = {id:++this.nextId,owner,entry,opened:false};
      watch.waiting = new Promise(resolve => {watch.resolve=resolve;});
      watch.finished = new Promise(resolve => {watch.finish=resolve;});
      entry.watches.add(watch);
      this.waiters.set(watch.id,watch);
      return watch.id;
    }
    const dialog = entry.dialog;
    if (args.action === "get") {
      if (!dialog) return undefined;
      if (dialog.owner && dialog.owner !== owner) throw new Error("JavaScript dialog belongs to another browser session");
      dialog.owner = owner;
      return {id:dialog.id,type:dialog.type};
    }
    if (args.action !== "respond") throw new Error("Unknown browser dialog action");
    if (!dialog || dialog.id !== args.id || dialog.owner !== owner || dialog.consumed) throw new Error("JavaScript dialog handle is stale or already consumed");
    if (!["accept","dismiss"].includes(args.response)) throw new Error("Invalid JavaScript dialog response");
    if (args.response === "accept" && !["confirm","prompt"].includes(dialog.type)) throw new Error("This JavaScript dialog only supports dismiss()");
    if (dialog.type === "prompt" && args.response === "accept" && typeof args.text !== "string") throw new Error("Prompt accept requires text");
    if (args.text !== undefined && !(dialog.type === "prompt" && args.response === "accept")) throw new Error("Only prompt accept supports text");
    dialog.consumed = true;
    dialog.response = entry.connection.send("Page.handleJavaScriptDialog",{accept:args.response === "accept",...(args.text !== undefined ? {promptText:args.text} : {})});
    await dialog.response;
    // A transient Playwright connection can close dialogs when it disconnects.
    // Finish its action cleanup before permitting the next input, or yield for a sequential dialog.
    const watches = [...entry.watches].filter(watch => watch.owner === owner);
    if (watches.length && (!entry.dialog || entry.dialog === dialog)) {
      let notify;
      const nextDialog = new Promise(resolve => {notify=resolve;entry.dialogWaiters.add(resolve);});
      try { await Promise.race([Promise.all(watches.map(watch => watch.finished)),nextDialog]); }
      finally { entry.dialogWaiters.delete(notify); }
    }
  }
  async stop(owner, targetId) {
    const entries = [...(this.owners.get(owner) ?? [])].filter(entry => entry.targetId === targetId);
    for (const entry of entries) {
      await entry.ready.catch(() => {});
      const deadline = Date.now() + TIMEOUT;
      while (entry.dialog && (entry.dialog.owner === owner || entry.owners.size === 1)) {
        if (Date.now() > deadline) throw Object.assign(new Error("JavaScript dialogs kept opening during cleanup"),{browserCleanupFailed:true});
        await entry.dialog.response?.catch(() => {});
        if (entry.dialog) {
          const dismissed = entry.dialog;
          let notify, gone = false;
          const nextDialog = new Promise(resolve => {notify=resolve;entry.dialogWaiters.add(resolve);});
          try {
            try { await entry.connection.send("Page.handleJavaScriptDialog",{accept:false}); }
            catch (error) {
              // A closed tab needs no dismissal; a live tab gets one fresh control connection.
              const response = await fetch(new URL("/json/list",entry.endpoint),{signal:AbortSignal.timeout(TIMEOUT),redirect:"error"});
              if (!response.ok) throw new Error(`Browser discovery failed: HTTP ${response.status}`);
              const target = (await response.json()).find(item => item.id === targetId);
              gone = !target;
              if (target) await withConnection(target.webSocketDebuggerUrl,send => send("Page.handleJavaScriptDialog",{accept:false})).catch(error => {if (!/No dialog is showing/i.test(error.message)) throw error;});
            }
            if (entry.dialog === dismissed) entry.dialog = undefined;
            if (gone) break;
            if (!entry.dialog) {
              // The renderer barrier completes after synchronous continuations, or the next dialog wins.
              await Promise.race([entry.connection.send("Page.getFrameTree"),nextDialog]);
            }
          } catch (cleanupError) {cleanupError.browserCleanupFailed=true;throw cleanupError;}
          finally {entry.dialogWaiters.delete(notify);}
        }
      }
      if (!this.closedOwners.has(owner)) await Promise.all([...entry.watches].filter(watch => watch.owner === owner).map(watch => watch.finished));
      for (const watch of entry.watches) if (watch.owner === owner) {
        watch.resolve({opened:false});
        watch.finish();
        this.waiters.delete(watch.id);
        entry.watches.delete(watch);
      }
      entry.owners.delete(owner);
      this.owners.get(owner)?.delete(entry);
      if (entry.owners.size === 0) {
        entry.closed = true;
        entry.connection?.close();
        if (this.targets.get(entry.key) === entry) this.targets.delete(entry.key);
      }
    }
    if (this.owners.get(owner)?.size === 0) this.owners.delete(owner);
  }
  async cleanup(owner) {
    this.closedOwners.add(owner);
    const targetIds = new Set([...(this.owners.get(owner) ?? [])].map(entry => entry.targetId));
    const results = await Promise.allSettled([...targetIds].map(targetId => this.stop(owner,targetId)));
    const failed = results.find(result => result.status === "rejected");
    if (failed) throw failed.reason;
  }
}


export async function withConnection(url, operation) {
  const connection = await openConnection(url);
  try { return await operation(connection.send); }
  finally { connection.close(); }
}

const DOCUMENTATION = `## CDP browser
Use cua.listTabs(), cua.getTab(id or {url}), and cua.createBrowserTab("cdp", url).
Tab bindings expose getAXState(), getScreenshot(), getAXStateAndScreenshot(),
goto(url), back(), forward(), reload(), and close(). Observations emit by default;
pass {emit:false} to suppress output. AX state uses browser accessibility node IDs.
Tab input: click(elementIndex, {mouseButton?, clickCount?}), typeText(elementIndexOrNull, text),
pressKey(elementIndexOrNull, key), paste(elementIndexOrNull, text, {format:"text"|"html"}),
and scroll(elementIndex, direction, pages). Read fresh AX state after actions.
Screenshot-only reads invalidate element indices. Navigation invalidates all indices.
setValue(elementIndex, value) replaces editable text; selectText(elementIndex, text, {prefix?,suffix?,selectionType?}) selects exact text or positions the cursor.
click and scroll also accept screenshot pixel pairs. drag(fromPixelPair, toPixelPair) performs a pointer drag. Capture a new screenshot after input; changed document or viewport geometry invalidates coordinates. Pinch zoom is unsupported.
tab.playwright exposes locator/getByRole/getByText/getByLabel/getByPlaceholder/getByTestId/getByTitle/getByAltText/frameLocator.
Chain locator/filter({hasText})/nth/first/last; read count/innerText/textContent/allTextContents/getAttribute/inputValue/isVisible/isEnabled/isChecked/waitFor;
act with click/dblclick/fill/press/check/uncheck/setChecked/selectOption/hover/scrollIntoViewIfNeeded.
Playwright resolves fresh elements and waits for actionability; ambiguous matches fail. Default action timeout is 10 seconds.
Navigation waits: tab.playwright.expectNavigation(async action, {url?,waitUntil?,timeoutMs?}), waitForURL(url, {waitUntil?,timeoutMs?}), waitForLoadState({state?,timeoutMs?}). expectNavigation installs a main-frame watcher before running the action and returns its result after navigation.
Playwright actions invalidate prior AX and screenshot indices. Read current state afterwards. File chooser events: start tab.playwright.waitForEvent("filechooser", {timeoutMs?}) before clicking, then await the handle and use isMultiple() / setFiles(absolutePaths, {timeoutMs?}). The file handle is one-shot. Downloads: start waitForEvent("download") before clicking, then await download.path({timeoutMs?}) for the completed local artifact.
Developer logs: await tab.dev.logs({filter?,levels?,limit?}) returns chronological console entries with level/message/timestamp/url. Capture begins at tab binding, continues across calls/navigation, and ends on close/reset/timeout. Levels: debug/info/log/warn/error (warning aliases warn). Default limit 100; retained cap 1000 entries, each at most 16,384 UTF-16 code units. Objects use shallow CDP descriptions; no page getters are executed. Prior console history and out-of-process frame/worker logs are excluded.
JavaScript dialogs: await tab.getJsDialog() returns undefined or a handle with type. alert/beforeunload support dismiss(); confirm supports accept()/dismiss(); prompt supports accept(text)/dismiss(). Actions return when they open a dialog; answer it before further page reads/input. Handles are scoped to the observed dialog and owning session. Reset/timeout/close dismiss owned active dialogs. Beforeunload dismiss cancels navigation. Created tabs attach observers before loading their URL. A dialog predating first binding may prevent CDP initialization.
Clipboard: tab.clipboard.read()/readText()/write(items)/writeText(text) uses the browser native process clipboard. Items contain entries [{mimeType,text? ,base64?}] and optional presentationStyle. Exactly one payload per entry; native Chrome validates supported formats. Requires verified --headless / --headless=new plus --enable-automation and a browser that can reach the host loopback bridge. Browser clipboard state is shared across tabs/JS sessions and survives js_reset. Internal control tabs are hidden and cleaned up on reset/timeout/close. paste(index,text,{format:"text"|"html"}) writes the isolated clipboard and dispatches trusted native paste atomically; typeText remains clipboard-independent. Headful clipboard APIs fail explicitly.`;

export function createBrowserApi(activeOutput, environment = process.env, {focusLease, downloadRequest, logRequest, dialogRequest, clipboardRequest, onDispose = () => {}} = {}) {
  const clipboard = clipboardRequest ? undefined : new BrowserClipboard(() => endpoint()?.href,withConnection);
  const clipboardOwner = {};
  if (clipboard) onDispose(() => clipboard.cleanup(clipboardOwner));
  const requestClipboard = clipboardRequest ?? (args => clipboard.request(clipboardOwner,args));
  const dialogs = dialogRequest ? undefined : new BrowserDialogs(() => endpoint()?.href);
  const dialogOwner = {};
  if (dialogs) onDispose(() => dialogs.cleanup(dialogOwner));
  const requestDialog = dialogRequest ?? (args => dialogs.request(dialogOwner,args));
  const checkDialog = targetId => requestDialog({action:"check",targetId});
  async function withDialogAction(targetId, operation) {
    const id = await requestDialog({action:"watch",targetId});
    const opened = requestDialog({action:"wait",id});
    const work = Promise.resolve().then(operation).finally(() => requestDialog({action:"end",id}));
    work.catch(() => {});
    return Promise.race([work,opened.then(result => result.opened ? undefined : work)]);
  }
  const logs = logRequest ? undefined : new BrowserConsoleLogs(() => endpoint()?.href);
  const logOwner = {};
  if (logs) onDispose(() => logs.cleanup(logOwner));
  const requestLogs = logRequest ?? (args => {
    if (args.action === "start") return logs.start(logOwner,args.targetId);
    if (args.action === "read") return logs.read(logOwner,args.targetId,args.options);
    if (args.action === "stop") return logs.stop(logOwner,args.targetId);
    throw new Error("Unknown browser logs action");
  });
  const downloads = downloadRequest ? undefined : new BrowserDownloads(() => endpoint()?.href);
  const downloadOwner = {};
  const requestDownload = downloadRequest ?? (args => {
    if(args.action === "start") return downloads.start(downloadOwner,args.targetId,args.options);
    if(args.action === "wait") return downloads.wait(downloadOwner,args.id);
    if(args.action === "path") return downloads.path(downloadOwner,args.id,args.options);
    throw new Error("Unknown download action");
  });
  function endpoint() {
    return browserEndpoint(environment);
  }
  async function json(path) {
    const base = endpoint();
    if (!base) throw new Error("No CDP browser configured; set OPEN_COMPUTER_USE_CDP_URL");
    const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(TIMEOUT), redirect: "error" });
    if (!response.ok) throw new Error(`Browser discovery failed: HTTP ${response.status}`);
    return response.json();
  }
  async function targets() {
    const result = await json("/json/list");
    if (!Array.isArray(result)) throw new Error("Invalid browser target list");
    const hidden = await requestClipboard({method:"targets"});
    return result.filter(target => target.type === "page" && !hidden.includes(target.id));
  }
  const info = target => ({ id: target.id, providerTabId: target.id, browserId: "cdp", title: target.title, url: target.url });
  function checkBrowser(options = {}) {
    if (options.browser !== undefined && options.browser !== "cdp") throw new Error(`Unknown browser: ${options.browser}`);
  }
  async function browserCommand(method, params) {
    const version = await json("/json/version");
    return withConnection(version.webSocketDebuggerUrl, send => send(method, params));
  }
  function bind(target) {
    let elements = new Map(), documentId, capture;
    const invalidate = () => { elements.clear(); documentId = undefined; capture = undefined; };
    const operate = async operation => {
      const current = (await targets()).find(item => item.id === target.id);
      if (!current) throw new Error("Tab closed or no longer available");
      await checkDialog(target.id);
      try { return await withConnection(current.webSocketDebuggerUrl, operation); }
      catch (error) { invalidate(); throw error; }
    };
    const command = (method, params) => operate(send => send(method, params));
    const input = operation => withDialogAction(target.id, () => operate(async send => {
      await waitForBrowserEventReady(endpoint().href, target.id);
      try { return await operation(send); }
      finally { capture = undefined; }
    }));
    async function geometry(send) {
      const frame = (await send("Page.getFrameTree")).frameTree.frame;
      const metrics = await send("Page.getLayoutMetrics");
      const viewport = metrics.cssVisualViewport;
      return {loaderId:frame.loaderId, viewport};
    }
    async function coordinate(send, value) {
      const position = screenshotPoint(value, capture);
      if (capture.viewport.scale !== 1 || capture.viewport.offsetX !== 0 || capture.viewport.offsetY !== 0) throw new Error("Pinch-zoom coordinate input is unsupported");
      if (JSON.stringify(await geometry(send)) !== capture.geometry) throw new Error("Screenshot geometry changed; capture the tab again");
      return position;
    }
    async function ax(options = {}) {
      const result = await operate(async send => {
        const before = (await send("Page.getFrameTree")).frameTree.frame;
        const tree = await send("Accessibility.getFullAXTree");
        const after = (await send("Page.getFrameTree")).frameTree.frame;
        if (before.loaderId !== after.loaderId) throw new Error("Page changed during AX observation; read state again");
        documentId = after.loaderId;
        elements = new Map(tree.nodes.filter(node => !node.ignored && node.backendDOMNodeId).map(node => [String(node.nodeId), node]));
        return tree;
      });
      const state = result.nodes.filter(node => !node.ignored).map(node => `[${node.nodeId}] ${node.role?.value ?? ""} ${JSON.stringify(node.name?.value ?? "")}${node.value ? ` value=${JSON.stringify(node.value.value)}` : ""}`).join("\n");
      if (options.emit !== false) activeOutput().write(state, "cua.state");
      return state;
    }
    async function screenshot(options = {}) {
      invalidate();
      const {bytes, image} = await operate(async send => {
        const before = await geometry(send);
        const result = await send("Page.captureScreenshot", {format:"png", captureBeyondViewport:false, clip:{x:before.viewport.pageX,y:before.viewport.pageY,width:before.viewport.clientWidth,height:before.viewport.clientHeight,scale:1}});
        const after = await geometry(send);
        if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Page changed during screenshot; capture again");
        const bytes = Buffer.from(result.data, "base64");
        if (bytes.length < 24 || bytes.subarray(1,4).toString() !== "PNG") throw new Error("Invalid screenshot PNG");
        const image = {width:bytes.readUInt32BE(16), height:bytes.readUInt32BE(20), viewport:after.viewport, geometry:JSON.stringify(after)};
        if (!image.width || !image.height) throw new Error("Invalid screenshot dimensions");
        return {bytes, image};
      });
      capture = image;
      if (options.emit !== false) await activeOutput().emitImage({ bytes, mimeType: "image/png" });
      return bytes;
    }
    async function element(send, index) {
      const saved = elements.get(String(index));
      if (!saved || !documentId) throw new Error("Unknown or stale element index; read AX state again");
      const frame = (await send("Page.getFrameTree")).frameTree.frame;
      if (frame.loaderId !== documentId) throw new Error("Page navigated; read AX state again");
      const current = await send("Accessibility.getPartialAXTree", { backendNodeId: saved.backendDOMNodeId, fetchRelatives: false });
      const node = current.nodes.find(item => item.backendDOMNodeId === saved.backendDOMNodeId && !item.ignored);
      if (!node || node.role?.value !== saved.role?.value || node.name?.value !== saved.name?.value) throw new Error("Element changed; read AX state again");
      return saved.backendDOMNodeId;
    }
    async function focus(send, index) {
      if (index !== null) await send("DOM.focus", { backendNodeId: await element(send, index) });
    }
    async function point(send, index) {
      if (Array.isArray(index)) return coordinate(send, index);
      const backendNodeId = await element(send, index);
      await send("DOM.scrollIntoViewIfNeeded", { backendNodeId });
      const { object } = await send("DOM.resolveNode", { backendNodeId });
      const result = await send("Runtime.callFunctionOn", { objectId: object.objectId, returnByValue: true,
        functionDeclaration: `function() {
          const r = this.getBoundingClientRect();
          const x = Math.max(0, r.left) + (Math.min(innerWidth, r.right) - Math.max(0, r.left)) / 2;
          const y = Math.max(0, r.top) + (Math.min(innerHeight, r.bottom) - Math.max(0, r.top)) / 2;
          const hit = this.ownerDocument.elementFromPoint(x, y);
          if (!this.isConnected || r.width <= 0 || r.height <= 0 || !(hit === this || this.contains(hit))) throw new Error("Element is covered or not visible");
          return {x, y};
        }` });
      if (result.exceptionDetails) throw new Error("Element is covered or not visible; read state again");
      return result.result.value;
    }
    async function edit(index, operation, text, options = {}) {
      await input(async send => {
        const backendNodeId = await element(send, index);
        const {object} = await send("DOM.resolveNode", {backendNodeId});
        const result = await send("Runtime.callFunctionOn", {objectId:object.objectId,
          functionDeclaration:editText.toString(), arguments:[{value:operation},{value:text},{value:options}]});
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "Text operation failed");
      });
    }
    return Object.freeze({
      ...info(target),
      clipboard: Object.freeze(Object.fromEntries(["read","readText","write","writeText"].map(method => [method,async value => {
        if (!(await targets()).some(item=>item.id === target.id)) throw new Error("Tab closed or no longer available");
        await checkDialog(target.id);
        return requestClipboard({method,targetId:target.id,value});
      }]))),
      dev: Object.freeze({async logs(options = {}) {
        await checkDialog(target.id);
        await requestLogs({action:"start",targetId:target.id});
        return requestLogs({action:"read",targetId:target.id,options});
      }}),
      playwright: createPlaywrightApi(() => { const value = endpoint(); if (!value) throw new Error("No CDP browser configured"); return value.href; }, target.id, invalidate, focusLease, requestDownload, operation => withDialogAction(target.id,operation), () => requestDialog({action:"checkPlaywright",targetId:target.id})),
      async getJsDialog() {
        const dialog = await requestDialog({action:"get",targetId:target.id});
        if (!dialog) return undefined;
        const respond = (response,text) => requestDialog({action:"respond",targetId:target.id,id:dialog.id,response,text});
        return Object.freeze({type:dialog.type,dismiss:() => respond("dismiss"),...(["confirm","prompt"].includes(dialog.type) ? {accept: text => respond("accept",text)} : {})});
      },
      getAXState: ax,
      getScreenshot: screenshot,
      async getAXStateAndScreenshot(options = {}) {
        const image = await screenshot(options);
        return { state: await ax(options), screenshot: image };
      },
      async click(index, options = {}) {
        for (const key of Object.keys(options)) if (!["mouseButton", "clickCount"].includes(key)) throw new Error(`Unsupported click option: ${key}`);
        const button = ({l:"left",r:"right",m:"middle"})[options.mouseButton] ?? options.mouseButton ?? "left";
        const clickCount = options.clickCount ?? 1;
        if (!["left", "right", "middle"].includes(button) || !Number.isInteger(clickCount) || clickCount < 1 || clickCount > 3) throw new Error("Invalid click button or count");
        await input(async send => {
          const position = await point(send, index);
          for (let count = 1; count <= clickCount; count++) {
            await send("Input.dispatchMouseEvent", {type:"mousePressed", ...position, button, clickCount:count});
            await send("Input.dispatchMouseEvent", {type:"mouseReleased", ...position, button, clickCount:count});
          }
        });
      },
      async drag(from, to) {
        if (!Array.isArray(from) || !Array.isArray(to)) throw new Error("drag requires screenshot coordinate pairs");
        await input(async send => {
          const start = await coordinate(send, from), end = await coordinate(send, to);
          await send("Input.dispatchMouseEvent", {type:"mouseMoved", ...start});
          await send("Input.dispatchMouseEvent", {type:"mousePressed", ...start, button:"left", buttons:1, clickCount:1});
          try {
            for (let step=1; step<=12; step++) {
              await send("Input.dispatchMouseEvent", {type:"mouseMoved", x:start.x+(end.x-start.x)*step/12, y:start.y+(end.y-start.y)*step/12, button:"left", buttons:1});
            }
          } finally {
            await send("Input.dispatchMouseEvent", {type:"mouseReleased", ...end, button:"left", buttons:0, clickCount:1});
          }
        });
      },
      async setValue(index, value) {
        if (typeof value !== "string") throw new Error("setValue requires a string");
        await edit(index, "set", value);
      },
      async selectText(index, text, options = {}) {
        if (typeof text !== "string" || !text) throw new Error("selectText requires non-empty text");
        if (!options || typeof options !== "object" || Array.isArray(options)) throw new Error("selectText expects an options object");
        for (const key of Object.keys(options)) {
          if (!["prefix", "suffix", "selectionType"].includes(key)) throw new Error(`Unknown selectText option: ${key}`);
        }
        for (const key of ["prefix", "suffix"]) if (options[key] !== undefined && typeof options[key] !== "string") throw new Error(`${key} must be a string`);
        if (options.selectionType !== undefined && !["text", "cursor_before", "cursor_after"].includes(options.selectionType)) throw new Error("Invalid selectionType");
        await edit(index, "select", text, options);
      },
      async typeText(index, text) {
        if (typeof text !== "string") throw new Error("typeText requires text");
        await input(async send => { await focus(send, index); await send("Input.insertText", {text}); });
      },
      async paste(index, text, options = {}) {
        if (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).some(key => key !== "format") || !["text","html"].includes(options.format ?? "text")) throw new Error("paste format must be text or html");
        if (typeof text !== "string") throw new Error("paste requires text");
        await input(async send => {
          await focus(send,index);
          const frame = (await send("Page.getFrameTree")).frameTree.frame;
          await requestClipboard({method:"paste",targetId:target.id,loaderId:frame.loaderId,value:[{entries:[{mimeType:options.format === "html" ? "text/html" : "text/plain",text}]}]});
        });
      },
      async pressKey(index, key) {
        const event = keyEvent(key);
        await input(async send => {
          await focus(send, index);
          await send("Input.dispatchKeyEvent", {type:event.text ? "keyDown" : "rawKeyDown", ...event});
          await send("Input.dispatchKeyEvent", {type:"keyUp", ...event, text:undefined, commands:undefined, modifiers:0});
        });
      },
      async scroll(index, direction, pages = 1) {
        const vectors = {up:[0,-1],down:[0,1],left:[-1,0],right:[1,0],u:[0,-1],d:[0,1],l:[-1,0],r:[1,0]};
        if (!vectors[direction] || !Number.isFinite(pages) || pages <= 0) throw new Error("Invalid scroll direction or pages");
        await input(async send => {
          let backendNodeId;
          if (Array.isArray(index)) {
            const position = await coordinate(send, index);
            const hit = await send("DOM.getNodeForLocation", {x:Math.floor(position.x), y:Math.floor(position.y)});
            backendNodeId = hit.backendNodeId;
          } else backendNodeId = await element(send, index);
          const {object} = await send("DOM.resolveNode", {backendNodeId});
          const [x,y] = vectors[direction];
          const result = await send("Runtime.callFunctionOn", {objectId:object.objectId, arguments:[{value:x},{value:y},{value:pages}],
            functionDeclaration:`function(x,y,pages) {
              const document = this.nodeType === 9 ? this : this.ownerDocument;
              let target = this.nodeType === 1 ? this : this.parentElement;
              while (target && target !== document.scrollingElement) {
                const style = getComputedStyle(target);
                const axis = x ? style.overflowX : style.overflowY;
                if (/(auto|scroll|overlay)/.test(axis) && (x ? target.scrollWidth > target.clientWidth : target.scrollHeight > target.clientHeight)) break;
                target = target.parentElement;
              }
              target ??= document.scrollingElement;
              if (!target || !this.isConnected) throw new Error("Scroll target unavailable");
              target.scrollBy({left:x*target.clientWidth*pages,top:y*target.clientHeight*pages,behavior:"instant"});
            }`});
          if (result.exceptionDetails) throw new Error("Scroll target unavailable; read state again");
        });
      },
      async goto(url) {
        invalidate();
        const parsed = new URL(url);
        if (!["http:", "https:", "about:"].includes(parsed.protocol)) throw new Error("Unsupported navigation URL protocol");
        const result = await withDialogAction(target.id, () => command("Page.navigate", { url: parsed.href }));
        if (result?.errorText) throw new Error(result.errorText);
      },
      async back() { await traverse(-1); },
      async forward() { await traverse(1); },
      async reload() { invalidate(); await withDialogAction(target.id, () => command("Page.reload")); },
      async close() {
        const result = await browserCommand("Target.closeTarget", { targetId: target.id });
        if (!result.success) throw new Error("Browser refused to close tab");
        await requestDialog({action:"stop",targetId:target.id});
        await requestLogs({action:"stop",targetId:target.id});
      },
    });
    async function traverse(offset) {
      invalidate();
      const history = await command("Page.getNavigationHistory");
      const entry = history.entries[history.currentIndex + offset];
      if (!entry) throw new Error("No navigation history entry in that direction");
      await withDialogAction(target.id, () => command("Page.navigateToHistoryEntry", { entryId: entry.id }));
    }
  }
  async function prepare(target) {
    await requestDialog({action:"start",targetId:target.id});
    if (!await requestDialog({action:"state",targetId:target.id})) await requestLogs({action:"start",targetId:target.id});
    return bind(target);
  }
  async function observe(tab) {
    activeOutput().write(DOCUMENTATION,"cua.browser");
    const dialog = await requestDialog({action:"state",targetId:tab.id});
    if (dialog) activeOutput().write(`Active JavaScript ${dialog.type} dialog; use tab.getJsDialog().`,"cua.state");
    else {
      try { await withDialogAction(tab.id, () => tab.getAXState()); }
      catch (error) { if (!await requestDialog({action:"state",targetId:tab.id})) throw error; }
      const opened = await requestDialog({action:"state",targetId:tab.id});
      if (opened) activeOutput().write(`Active JavaScript ${opened.type} dialog; use tab.getJsDialog().`,"cua.state");
    }
    return tab;
  }
  const api = {
    async listBrowsers(options = {}) {
      const browsers = endpoint() ? [{ id: "cdp", name: "Configured CDP browser", type: "cdp" }] : [];
      if (options.emit !== false) activeOutput().write(browsers, "cua.state");
      return browsers;
    },
    async listTabs(options = {}) {
      checkBrowser(options);
      const tabs = endpoint() ? (await targets()).map(info) : [];
      if (options.emit !== false) activeOutput().write(tabs, "cua.state");
      return tabs;
    },
    async getBrowser(options = {}) {
      if (options.id !== undefined && options.id !== "cdp") throw new Error(`Unknown browser: ${options.id}`);
      for (const key of Object.keys(options)) {
        if (!["id", "url"].includes(key)) throw new Error(`Unsupported browser selector: ${key}`);
      }
      if (options.url !== undefined && !(await targets()).some(target => target.url === options.url)) {
        throw new Error("No configured browser contains that URL");
      }
      await json("/json/version");
      activeOutput().write(DOCUMENTATION, "cua.browser");
      return Object.freeze({ browserId: "cdp", async documentation() { return DOCUMENTATION; } });
    },
    async getTab(reference, options = {}) {
      checkBrowser(options);
      if (typeof reference !== "string" && (typeof reference?.url !== "string")) throw new Error("getTab requires a tab ID or {url}");
      const matches = (await targets()).filter(item => typeof reference === "string" ? item.id === reference : item.url === reference.url);
      if (matches.length !== 1) throw new Error(`Expected one matching tab; found ${matches.length}`);
      return observe(await prepare(matches[0]));
    },
    async createBrowserTab(browserId, url = "about:blank", options = {}) {
      if (browserId !== "cdp") throw new Error(`Unknown browser: ${browserId}`);
      for (const key of Object.keys(options)) {
        if (key !== "visible") throw new Error(`Unsupported CDP tab creation option: ${key}`);
      }
      if (options.visible !== undefined && typeof options.visible !== "boolean") throw new Error("visible must be a boolean");
      const parsed = new URL(url);
      if (!["http:", "https:", "about:"].includes(parsed.protocol)) throw new Error("Unsupported navigation URL protocol");
      const result = await browserCommand("Target.createTarget", { url: "about:blank", background: options.visible === false });
      try {
        const target = (await targets()).find(target => target.id === result.targetId);
        if (!target) throw new Error("Created tab is unavailable");
        const tab = await prepare(target);
        if (parsed.href !== "about:blank") await tab.goto(parsed.href);
        return observe(bind((await targets()).find(target => target.id === result.targetId) ?? target));
      } catch (error) {
        await browserCommand("Target.closeTarget",{targetId:result.targetId}).catch(() => {});
        await requestDialog({action:"stop",targetId:result.targetId});
        await requestLogs({action:"stop",targetId:result.targetId});
        throw error;
      }
    },
  };
  return Object.freeze(api);
}


const focusConnections = new Map();
export async function updateBrowserFocus(targetId, enabled) {
  const origin = new URL(process.env.OPEN_COMPUTER_USE_CDP_URL);
  if (!["http:","https:"].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) throw new Error("Invalid configured CDP origin");
  const key = `${origin.href}|${targetId}`;
  if (!enabled && focusConnections.has(key)) {
    const connection = focusConnections.get(key);
    try {
      await connection.send("Emulation.setFocusEmulationEnabled", {enabled:false});
      return;
    } catch {
      // A lost connection needs a fresh acknowledgement before releasing ownership.
    } finally { connection.close(); focusConnections.delete(key); }
  }
  const response = await fetch(new URL("/json/list", origin), {signal:AbortSignal.timeout(TIMEOUT), redirect:"error"});
  if (!response.ok) throw new Error(`Browser focus discovery failed: HTTP ${response.status}`);
  const targets = await response.json();
  const target = targets.find(item => item.type === "page" && item.id === targetId);
  if (!target) {
    if (enabled) throw new Error("Browser focus target closed");
    return;
  }
  if (enabled) {
    const connection = await openConnection(target.webSocketDebuggerUrl);
    focusConnections.set(key, connection);
    await connection.send("Emulation.setFocusEmulationEnabled", {enabled:true});
  } else await withConnection(target.webSocketDebuggerUrl, send => send("Emulation.setFocusEmulationEnabled", {enabled:false}));
}
