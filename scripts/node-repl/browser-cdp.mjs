import {MANAGEMENT_METHODS,MANAGEMENT_DOCUMENTATION,validateManagement} from "./chrome-browser-extension/policy.mjs";
import {BrowserChrome} from "./browser-chrome.mjs";
import {BrowserEvaluator} from "./browser-evaluate.mjs";
import {BrowserAssets,ASSETS_DOCUMENTATION} from "./browser-assets.mjs";
import {BrowserDebugger,CDP_DOCUMENTATION,cdpCommand,cdpOptions} from "./browser-debugger.mjs";
import {BrowserTabs} from "./browser-tabs.mjs";
import {BrowserInputs,validatePressKey,validateClick} from "./browser-input.mjs";
import { BrowserDownloads } from "./browser-downloads.mjs";
import { BrowserClipboard } from "./browser-clipboard.mjs";
import {BrowserDrops} from "./browser-drop.mjs";
import { BrowserViewport, VIEWPORT_DOCUMENTATION } from "./browser-viewport.mjs";
import { createPlaywrightApi, waitForBrowserEventReady } from "./browser-playwright.mjs";
import { format } from "node:util";

export function screenshotPoint(point, image) {
  if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)) throw new Error("Coordinates must be two finite screenshot pixels");
  if (!image) throw new Error("No fresh screenshot; capture the tab before coordinate input");
  if (image.coordinateInput === false) throw new Error("Full-page screenshots require a fresh viewport capture for coordinate input");
  const [x,y] = point;
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) throw new Error("Coordinates are outside the screenshot");
  const region = image.region ?? {x:image.viewport.pageX ?? 0,y:image.viewport.pageY ?? 0,width:image.viewport.clientWidth,height:image.viewport.clientHeight};
  const position = {x:region.x-(image.viewport.pageX ?? 0)+x*region.width/image.width,y:region.y-(image.viewport.pageY ?? 0)+y*region.height/image.height};
  if (position.x < 0 || position.y < 0 || position.x >= image.viewport.clientWidth || position.y >= image.viewport.clientHeight) throw new Error("Screenshot point is outside the current viewport; scroll and capture again");
  return position;
}

export function imageDimensions(bytes, format) {
  let width, height;
  if (format === "png") {
    if (bytes.length < 24 || bytes.subarray(0,8).toString("hex") !== "89504e470d0a1a0a" || bytes.subarray(12,16).toString() !== "IHDR") throw new Error("Invalid screenshot PNG");
    width=bytes.readUInt32BE(16);height=bytes.readUInt32BE(20);
  } else {
    if (bytes.length < 4 || bytes.readUInt16BE(0) !== 0xffd8 || bytes.readUInt16BE(bytes.length-2) !== 0xffd9) throw new Error("Invalid screenshot JPEG");
    let offset = 2;
    while (offset+4 <= bytes.length) {
      if (bytes[offset++] !== 0xff) break;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd8) continue;
      if (offset+2 > bytes.length) break;
      const length = bytes.readUInt16BE(offset);
      if (length < 2 || offset+length > bytes.length) break;
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker) && length >= 8) {
        height=bytes.readUInt16BE(offset+3);width=bytes.readUInt16BE(offset+5);break;
      }
      offset += length;
    }
  }
  if (!width || !height || width*height > 100_000_000) throw new Error("Invalid or oversized screenshot dimensions");
  return {width,height};
}

export function screenshotRegion(options, geometry) {
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new Error("screenshot expects an options object");
  for (const key of Object.keys(options)) if (!["emit","fullPage","clip"].includes(key)) throw new Error(`Unknown screenshot option: ${key}`);
  if (options.fullPage !== undefined && typeof options.fullPage !== "boolean" || options.emit !== undefined && typeof options.emit !== "boolean") throw new Error("Screenshot flags must be booleans");
  const viewport = geometry.viewport;
  const base = options.fullPage ? geometry.contentSize : {x:viewport.pageX,y:viewport.pageY,width:viewport.clientWidth,height:viewport.clientHeight};
  let region = {...base};
  if (options.clip !== undefined) {
    const clip = options.clip;
    if (!clip || typeof clip !== "object" || Array.isArray(clip) || Object.keys(clip).some(key=>!["x","y","width","height"].includes(key)) || ![clip.x,clip.y,clip.width,clip.height].every(Number.isFinite) || clip.x < 0 || clip.y < 0 || clip.width <= 0 || clip.height <= 0) throw new Error("Invalid screenshot clip rectangle");
    if (clip.x+clip.width > base.width+1e-6 || clip.y+clip.height > base.height+1e-6) throw new Error("Screenshot clip is outside the capture area");
    region = {x:base.x+clip.x,y:base.y+clip.y,width:clip.width,height:clip.height};
  }
  if (!Number.isFinite(region.width*region.height) || region.width <= 0 || region.height <= 0 || region.width*region.height > 100_000_000) throw new Error("Screenshot capture area exceeds 100 million CSS pixels");
  return region;
}

export {keyEvent} from "./browser-input.mjs";

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

export async function openConnection(url, onEvent = () => {}, onClose = () => {}) {
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
    if (message.error) request.reject(Object.assign(new Error(message.error.message),{cdpError:true,cdpMethod:request.method}));
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
    const send = (method, params = {}, timeoutMs = TIMEOUT, sessionId) => new Promise((resolve, reject) => {
      const id = ++nextId;
      const timeout = timeoutMs === 0 ? undefined : setTimeout(() => { pending.delete(id); reject(new Error(`CDP ${method} timed out`)); }, timeoutMs);
      pending.set(id, {
        method,
        resolve: value => { clearTimeout(timeout); resolve(value); },
        reject: error => { clearTimeout(timeout); reject(error); },
      });
      try { socket.send(JSON.stringify({ id, method, params, ...(sessionId ? {sessionId} : {}) })); }
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
    if (args?.action === "checkBrowser") {
      const active = [...this.targets.values()].find(target=>target.endpoint === this.endpoint() && target.dialog);
      if (active) throw new Error(`Resolve the active JavaScript dialog in tab ${active.targetId} first`);
      return;
    }
    if (args?.action === "start") return this.start(owner,args.targetId);
    if (args?.action === "stop") return this.stop(owner,args.targetId);
    if (args?.action === "wait" || args?.action === "end") {
      const watch = this.waiters.get(args.id);
      if (!watch || watch.owner !== owner) throw new Error("Unknown browser action watcher");
      if (args.action === "wait") return watch.waiting;
      if(args.error!==undefined && typeof args.error!=="string") throw new Error("Invalid browser action error");
      watch.error=args.error;
      if(watch.opened && watch.entry.dialog?.owner===owner && args.error!==undefined) watch.entry.dialog.actionError=args.error;
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
    const watches = [...entry.watches].filter(watch => watch.owner === owner);
    dialog.consumed = true;
    dialog.response = entry.connection.send("Page.handleJavaScriptDialog",{accept:args.response === "accept",...(args.text !== undefined ? {promptText:args.text} : {})});
    await dialog.response;
    // A transient Playwright connection can close dialogs when it disconnects.
    // Finish its action cleanup before permitting the next input, or yield for a sequential dialog.
    if (watches.length && (!entry.dialog || entry.dialog === dialog)) {
      let notify;
      const nextDialog = new Promise(resolve => {notify=resolve;entry.dialogWaiters.add(resolve);});
      try { await Promise.race([Promise.all(watches.map(watch => watch.finished)),nextDialog]); }
      finally { entry.dialogWaiters.delete(notify); }
    }
    const error=dialog.actionError ?? watches.find(watch=>watch.error)?.error;
    if(error!==undefined) throw new Error(error);
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
Use cua.listTabs(), cua.getTab(id or {url}), and cua.createBrowserTab("cdp", url, {visible?,sessionName?}). browser.tabs exposes list/get/new/selected; new() creates a background blank tab. browser.nameSession(name) labels this logical host session across turns and JS resets. It appears in browser inventory metadata and context output. Native selected-tab identity and management require the bundled Chrome browser extension, loaded by the user in that CDP browser. A transient hidden bootstrap tab wakes its service worker and closes before requests; turn/reset/close disconnects the worker after accepted writes drain. Selected lookup leaves native tab activation unchanged and remains accurate under focus emulation. This is the CDP provider with an extension browser bridge; full extension transport remains open.
Tab bindings expose getAXState(), getScreenshot(), getAXStateAndScreenshot(), screenshot(),
title(), url(), goto(url), back(), forward(), reload(), close(), markDeliverable() and markHandoff().
Created tabs/popups are ephemeral at turn end unless marked. Latest mark wins; both marks clear when the next turn begins, so mark again as needed. User tabs stay open. js_reset retains tab ownership. Session close keeps marked survivors. Observations emit by default;
pass {emit:false} to suppress output. AX state uses browser accessibility node IDs.
Tab input: click(elementIndex, {mouseButton?, clickCount?, key?, durationMs?}), typeText(elementIndexOrNull, text),
pressKey(elementIndexOrNull, key, {durationMs?}), paste(elementIndexOrNull, text, {format:"text"|"html"}),
and scroll(elementIndex, direction, pages). Read fresh AX state after actions.
pressKey owns actual modifier/primary down and reverse up events, supports modifier-only keys and holds the chord for durationMs without synthesizing repeat. An element index focuses its validated target under the input lease; null uses the current focus. Key-induced navigation/scroll can complete before release. Held click keys/chords stay down across the click sequence; durationMs holds each press (finite, non-negative). Uses host-owned trusted CDP events and virtual focus. Ordinary keys type at the current focus before the click. Managed pointer actions block other raw input/locator actions until release; reset/timeout/close releases held state, and cleanup failure retains ownership for retry. Dialogs can be answered in later calls. Releases may finish already admitted effects.
Screenshot-only reads invalidate element indices. Navigation invalidates all indices.
setValue(elementIndex, value) replaces editable text; selectText(elementIndex, text, {prefix?,suffix?,selectionType?}) selects exact text or positions the cursor.
click and scroll also accept screenshot pixel pairs. drag(fromPixelPair, toPixelPair) performs a pointer drag. Capture a new screenshot after input; changed document or viewport geometry invalidates coordinates. Pinch zoom is unsupported.
tab.playwright exposes locator/getByRole/getByText/getByLabel/getByPlaceholder/getByTestId/getByTitle/getByAltText/frameLocator.
Chain locator/filter({hasText})/nth/first/last; read count/innerText/textContent/allTextContents/getAttribute/inputValue/isVisible/isEnabled/isChecked/waitFor;
act with click/dblclick/fill/press/check/uncheck/setChecked/selectOption/hover/scrollIntoViewIfNeeded.
locator.drop({data?:{mimeType:string},files?:absolutePaths},{position?:{x,y},timeoutMs?}) sends trusted native HTML/file drag-and-drop. Files must be regular files on the browser host. Position uses padding-box CSS pixels. Cross-process frames bind native target/frame IDs and support nested frame hit testing. Same-process owners bind by native node identity through isolated DOM/shadow traversal, supporting identical URLs and reordered siblings. A dialog pauses the action deadline until answered; reset/timeout/close cancel remaining stages. Already dispatched page effects may finish.
Playwright resolves fresh elements and waits for actionability; ambiguous matches fail. Default action timeout is 10 seconds.
Navigation waits: tab.playwright.expectNavigation(async action, {url?,waitUntil?,timeoutMs?}), waitForURL(url, {waitUntil?,timeoutMs?}), waitForLoadState({state?,timeoutMs?}). expectNavigation installs a main-frame watcher before running the action and returns its result after navigation.
Playwright actions invalidate prior AX and screenshot indices. Read current state afterwards. File chooser events: start tab.playwright.waitForEvent("filechooser", {timeoutMs?}) before clicking, then await the handle and use isMultiple() / setFiles(absolutePaths, {timeoutMs?}). The file handle is one-shot. Downloads: start waitForEvent("download") before clicking, then await download.path({timeoutMs?}) for the completed local artifact.
Developer logs: await tab.dev.logs({filter?,levels?,limit?}) returns chronological console entries with level/message/timestamp/url. Capture begins at tab binding, continues across calls/navigation, and ends on close/reset/timeout. Levels: debug/info/log/warn/error (warning aliases warn). Default limit 100; retained cap 1000 entries, each at most 16,384 UTF-16 code units. Objects use shallow CDP descriptions; no page getters are executed. Prior console history and out-of-process frame/worker logs are excluded.
JavaScript dialogs: await tab.getJsDialog() returns undefined or a handle with type. alert/beforeunload support dismiss(); confirm supports accept()/dismiss(); prompt supports accept(text)/dismiss(). Actions return when they open a dialog; answer it before further page reads/input. accept()/dismiss() reports failures from the resumed action. Handles are scoped to the observed dialog and owning session. Reset/timeout/close dismiss owned active dialogs. Beforeunload dismiss cancels navigation. Created tabs attach observers before loading their URL. A dialog predating first binding may prevent CDP initialization.
Clipboard: tab.clipboard.read()/readText()/write(items)/writeText(text) uses the browser native process clipboard. Items contain entries [{mimeType,text? ,base64?}] and optional presentationStyle. Exactly one payload per entry; native Chrome validates supported formats. Requires verified --headless / --headless=new plus --enable-automation and a browser that can reach the host loopback bridge. Browser clipboard state is shared across tabs/JS sessions and survives js_reset. Internal control tabs are hidden and cleaned up on reset/timeout/close. paste(index,text,{format:"text"|"html"}) writes the isolated clipboard and dispatches trusted native paste atomically; typeText remains clipboard-independent. Headful clipboard APIs fail explicitly.
Read-only scripting: playwright.evaluate(fnOrExpression,arg?,{timeoutMs?}), locator.evaluate(...) and locator.evaluateAll(...) run in a host-owned QuickJS Worker. Native DOM read facades support text/attributes/traversal/styles/geometry and frame scopes. Live setters, mutation methods, page functions, network/storage and Node APIs are unavailable. Functions cannot capture REPL variables. Local data, URL helpers and timers are supported. Navigation, deadline and turn/reset/close cancel execution; inner deadlines preserve JS bindings. Default 10 seconds, timeoutMs:0 disables the operation deadline. Unsupported DOM members are unavailable; this is an explicit read schema.
Tab capabilities: get("pageAssets").documentation() describes rendered resource inventory and local asset bundles. await tab.capabilities.list(); get("cdp").documentation() describes permitted developer commands and cursor-based event reads. HTTP(S) pages only. Raw commands can mutate page state and invalidate this binding's observations; normal interaction uses higher-level APIs.
Browser capabilities: get("management").documentation() describes native window/tab/group/bookmark organization and before-state audit (bundled extension required). await browser.capabilities.list(), then get("viewport") and documentation(). viewport.set({width,height}) applies explicit CSS dimensions for responsive tasks; viewport.reset() returns to normal sizing. The host cleans temporary overrides on reset/timeout/close. Competing sessions fail explicitly. Use existing sizing during normal tasks.
Screenshots: tab.screenshot({fullPage?,clip?}) returns JPEG bytes with no implicit output; use nodeRepl.emitImage(bytes). getScreenshot returns/emits PNG. clip uses CSS pixels relative to the viewport or full-page area. Pixel input maps cropped viewport images back to CSS; full-page images require a new viewport capture before input. Geometry and viewport-revision changes invalidate capture coordinates.`;

export function createBrowserApi(activeOutput, environment = process.env, {focusLease, downloadRequest, logRequest, dialogRequest, clipboardRequest, viewportRequest, dropRequest, inputRequest, tabRequest, cdpRequest, assetsRequest, evaluateRequest, chromeRequest, onDispose = () => {}} = {}) {
  const cleanups=[];
  const debuggerApi=cdpRequest ? undefined : new BrowserDebugger(()=>endpoint()?.href,openConnection);
  const assetsApi=assetsRequest ? undefined : new BrowserAssets(()=>endpoint()?.href);
  const assetsOwner={};
  if(assetsApi)cleanups.push(()=>assetsApi.cleanup(assetsOwner));
  const requestAssets=assetsRequest ?? (args=>assetsApi.request(assetsOwner,args));
  const evaluator=evaluateRequest ? undefined : new BrowserEvaluator(()=>endpoint()?.href),evaluateOwner={};
  if(evaluator)cleanups.push(()=>evaluator.cleanup(evaluateOwner));
  const requestEvaluate=evaluateRequest ?? (args=>evaluator.request(evaluateOwner,args));
  const debuggerOwner={};
  if(debuggerApi)cleanups.push(()=>debuggerApi.cleanup(debuggerOwner));
  const requestCdp=cdpRequest ?? (args=>debuggerApi.request(debuggerOwner,args));
  const chromeBridge=chromeRequest ? undefined : new BrowserChrome(()=>endpoint()?.href,openConnection),chromeOwner={};
  if(chromeBridge)cleanups.push(()=>chromeBridge.cleanup(chromeOwner));
  const requestChrome=chromeRequest ?? (args=>chromeBridge.request(chromeOwner,args));
  const tabs=tabRequest ? undefined : new BrowserTabs(()=>endpoint()?.href,openConnection);
  const tabOwner={};
  const requestTab=tabRequest ?? (args=>tabs.request(tabOwner,args));
  const clipboard = clipboardRequest ? undefined : new BrowserClipboard(() => endpoint()?.href,withConnection);
  const clipboardOwner = {};
  if (clipboard) cleanups.push(() => clipboard.cleanup(clipboardOwner));
  const requestClipboard = clipboardRequest ?? (args => clipboard.request(clipboardOwner,args));
  const viewport = viewportRequest ? undefined : new BrowserViewport(() => endpoint()?.href,openConnection,withConnection,async()=>{const hidden=await requestChrome({action:"targets"});return [...await requestClipboard({method:"targets"}),...hidden.ids,...hidden.urls];});
  const viewportOwner = {};
  if (viewport) cleanups.push(() => viewport.cleanup(viewportOwner));
  const requestViewport = viewportRequest ?? (args => viewport.request(viewportOwner,args));
  const drops = dropRequest ? undefined : new BrowserDrops(() => endpoint()?.href,openConnection,withConnection,()=>requestViewport({action:"state"}));
  const dropOwner = {};
  if (drops) cleanups.push(() => drops.cleanup(dropOwner));
  const requestDrop = dropRequest ?? (args=>drops.request(dropOwner,args));
  const dialogs = dialogRequest ? undefined : new BrowserDialogs(() => endpoint()?.href);
  const dialogOwner = {};
  if (dialogs) cleanups.push(() => dialogs.cleanup(dialogOwner));
  const requestDialog = dialogRequest ?? (args => dialogs.request(dialogOwner,args));
  const inputs=inputRequest ? undefined : new BrowserInputs(()=>endpoint()?.href,openConnection,()=>requestViewport({action:"state"}),undefined,(_owner,targetId)=>requestDialog({action:"state",targetId}));
  const inputOwner={};
  if(inputs) cleanups.push(()=>inputs.cleanup(inputOwner));
  const requestInput=inputRequest ?? (args=>inputs.request(inputOwner,args));
  const checkDialog = targetId => requestDialog({action:"check",targetId});
  async function withDialogAction(targetId, operation) {
    const id = await requestDialog({action:"watch",targetId});
    const opened = requestDialog({action:"wait",id});
    let failure;
    const work = Promise.resolve().then(() => operation(opened)).catch(error=>{
      failure=String(error?.message ?? error).slice(0,16_384);
      throw error;
    }).finally(() => requestDialog({action:"end",id,error:failure}));
    work.catch(() => {});
    return Promise.race([work,opened.then(result => result.opened ? undefined : work)]);
  }
  const logs = logRequest ? undefined : new BrowserConsoleLogs(() => endpoint()?.href);
  const logOwner = {};
  if (logs) cleanups.push(() => logs.cleanup(logOwner));
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
    const hidden = await requestClipboard({method:"targets"}),chromeHidden=await requestChrome({action:"targets"});
    return result.filter(target => target.type === "page" && !hidden.includes(target.id) && !chromeHidden.ids.includes(target.id) && !chromeHidden.urls.includes(target.url));
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
      await requestViewport({action:"sync",targetId:target.id});
      try { return await withConnection(current.webSocketDebuggerUrl, operation); }
      catch (error) { invalidate(); throw error; }
    };
    const command = (method, params) => operate(send => send(method, params));
    const input = operation => withDialogAction(target.id, () => operate(async send => {
      await requestInput({action:"check"});
      await waitForBrowserEventReady(endpoint().href, target.id);
      try { return await operation(send); }
      finally { capture = undefined; }
    }));
    async function geometry(send) {
      const frame = (await send("Page.getFrameTree")).frameTree.frame;
      const metrics = await send("Page.getLayoutMetrics");
      const viewport = metrics.cssVisualViewport;
      return {loaderId:frame.loaderId, viewport,contentSize:metrics.cssContentSize,viewportRevision:await requestViewport({action:"state"})};
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
    async function screenshot(options = {}, format = "png", emit = true) {
      invalidate();
      const {bytes, image} = await operate(async send => {
        const before = await geometry(send);
        const region = screenshotRegion(options,before);
        const params = {format,...(format === "jpeg" ? {quality:90} : {}), captureBeyondViewport:options.fullPage === true, clip:{...region,scale:1}};
        const result = await requestViewport({action:"capture",targetId:target.id,params}) ?? await send("Page.captureScreenshot",params);
        const after = await geometry(send);
        if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Page changed during screenshot; capture again");
        const bytes = Buffer.from(result.data, "base64");
        if (bytes.length > 20*1024*1024) throw new Error("Screenshot exceeds 20 MiB");
        const image = {...imageDimensions(bytes,format),region,coordinateInput:options.fullPage !== true,viewport:after.viewport,geometry:JSON.stringify(after)};
        return {bytes, image};
      });
      capture = image;
      if (options.emit ?? emit) await activeOutput().emitImage({ bytes, mimeType: `image/${format}` });
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
      capabilities:Object.freeze({
        list:async()=>[{id:"pageAssets",description:"Rendered page asset inventory and local bundles"},{id:"cdp",description:"Origin-scoped raw CDP commands and debugger event cursors"}],
        async get(id) {
          if(id==="pageAssets")return Object.freeze({documentation:async()=>ASSETS_DOCUMENTATION,list:()=>requestAssets({action:"list",targetId:target.id}),bundle:options=>requestAssets({action:"bundle",targetId:target.id,options})});
          if(id!=="cdp")throw new Error(`Unsupported tab capability: ${id}`);
          return Object.freeze({documentation:async()=>CDP_DOCUMENTATION,
            async send(method,params={},options={}) {
              cdpCommand(method,params,options);invalidate();
              try {return await requestCdp({action:"send",targetId:target.id,method,params,options});}finally{invalidate();}
            },
            readEvents:(options={})=>{cdpOptions(options,true);return requestCdp({action:"events",targetId:target.id,options});},
          });
        },
      }),
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
      playwright: createPlaywrightApi(() => { const value = endpoint(); if (!value) throw new Error("No CDP browser configured"); return value.href; }, target.id, invalidate, focusLease, requestDownload, operation => withDialogAction(target.id,operation), async action => {await requestDialog({action:"checkPlaywright",targetId:target.id});if(action) await requestInput({action:"check"});}, requestDrop,requestEvaluate),
      async getJsDialog() {
        const dialog = await requestDialog({action:"get",targetId:target.id});
        if (!dialog) return undefined;
        const respond = (response,text) => requestDialog({action:"respond",targetId:target.id,id:dialog.id,response,text});
        return Object.freeze({type:dialog.type,dismiss:() => respond("dismiss"),...(["confirm","prompt"].includes(dialog.type) ? {accept: text => respond("accept",text)} : {})});
      },
      title:async()=>(await targets()).find(item=>item.id===target.id)?.title,
      url:async()=>(await targets()).find(item=>item.id===target.id)?.url,
      markDeliverable:()=>requestTab({action:"mark",targetId:target.id,mark:"deliverable"}),
      markHandoff:()=>requestTab({action:"mark",targetId:target.id,mark:"handoff"}),
      getAXState: ax,
      getScreenshot: screenshot,
      screenshot: (options = {}) => screenshot(options,"jpeg",false),
      async getAXStateAndScreenshot(options = {}) {
        const image = await screenshot(options);
        return { state: await ax(options), screenshot: image };
      },
      async click(index, options = {}) {
        const {button,count:clickCount}=validateClick(options);
        await input(async send => {
          const position = await point(send, index);
          if(options.key!==undefined || options.durationMs!==undefined) return requestInput({targetId:target.id,position,geometry:await geometry(send),options});
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
      async pressKey(index,key,options={}) {
        validatePressKey(key,options);
        await input(async send=>{
          const backendNodeId=index===null ? undefined : await element(send,index);
          return requestInput({action:"key",targetId:target.id,key,options,backendNodeId,geometry:await geometry(send)});
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
        await requestTab({action:"close",targetId:target.id});
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
    await requestViewport({action:"sync",targetId:target.id});
    await requestDialog({action:"start",targetId:target.id});
    if (!await requestDialog({action:"state",targetId:target.id})) await requestLogs({action:"start",targetId:target.id});
    return bind(target);
  }
  async function observe(tab) {
    activeOutput().write(DOCUMENTATION,"cua.browser");
    const dialog = await requestDialog({action:"state",targetId:tab.id});
    if (dialog) activeOutput().write(`Active JavaScript ${dialog.type} dialog; use tab.getJsDialog().`,"cua.state");
    else {
      const allowDialog=async error=>{if(!await requestDialog({action:"state",targetId:tab.id})) throw error;};
      const state=await withDialogAction(tab.id,()=>tab.getAXState({emit:false}).catch(allowDialog)).catch(allowDialog);
      const opened = await requestDialog({action:"state",targetId:tab.id});
      if (opened) activeOutput().write(`Active JavaScript ${opened.type} dialog; use tab.getJsDialog().`,"cua.state");
      else if(state!==undefined) activeOutput().write(state,"cua.state");
    }
    return tab;
  }
  let browserDocsShown=false;
  async function nameSession(name){await requestTab({action:"name",name});activeOutput().write(`Browser session: ${name}`,"cua.browser.session");}
  const api = {
    async listBrowsers(options = {}) {
      const session=endpoint()?await requestTab({action:"session"}):{};
      const browsers = endpoint() ? [{ id: "cdp", name: "Configured CDP browser", type: "cdp",...(session.name?{metadata:{sessionName:session.name}}:{}) }] : [];
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
      if(!browserDocsShown){activeOutput().write(DOCUMENTATION, "cua.browser");browserDocsShown=true;}
      return Object.freeze({ browserId: "cdp",nameSession,tabs:Object.freeze({
        list:()=>api.listTabs({browser:"cdp",emit:false}),
        get:id=>{if(typeof id!=="string"||!id)throw Error('tabs.get requires a tab ID');return api.getTab(id,{browser:"cdp"});},
        new:()=>api.createBrowserTab('cdp','about:blank',{visible:false}),
        async selected(){const id=await requestChrome({action:'selected'});if(!id)return undefined;const target=(await targets()).find(item=>item.id===id);return target?observe(await prepare(target)):undefined;},
      }),async documentation() { return DOCUMENTATION; },capabilities:Object.freeze({
        list:async()=>[...await requestViewport({action:"capabilities"}),{id:"management",description:"Native windows, tabs, tab groups, bookmarks and before-state audit; bundled Chrome extension required"}],
        async get(id) {
          if(id==='management')return Object.freeze({
            documentation:async()=>MANAGEMENT_DOCUMENTATION,
            getAuditTrail:()=>requestChrome({action:'audit'}),
            ...Object.fromEntries(Object.entries(MANAGEMENT_METHODS).map(([namespace,methods])=>[namespace,Object.freeze(Object.fromEntries(methods.map(method=>[method,async(...args)=>{
              if(validateManagement(namespace,method,args))await requestDialog({action:'checkBrowser'});
              return requestChrome({action:'management',namespace,method,args});
            }])))])),
          });
          const capabilities = await requestViewport({action:"capabilities"});
          if (!capabilities.some(capability=>capability.id===id)) throw new Error(`Unsupported browser capability: ${id}`);
          return Object.freeze({documentation:async()=>VIEWPORT_DOCUMENTATION,
            async set(options) {await requestDialog({action:"checkBrowser"});return requestViewport({action:"set",options});},
            async reset() {await requestDialog({action:"checkBrowser"});return requestViewport({action:"reset"});},
          });
        },
      }) });
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
        if (!["visible","sessionName"].includes(key)) throw new Error(`Unsupported CDP tab creation option: ${key}`);
      }
      if (options.visible !== undefined && typeof options.visible !== "boolean") throw new Error("visible must be a boolean");
      const parsed = new URL(url);
      if (!["http:", "https:", "about:"].includes(parsed.protocol)) throw new Error("Unsupported navigation URL protocol");
      if(options.sessionName!==undefined)await nameSession(options.sessionName);
      const result=await requestTab({action:"create",visible:options.visible});
      try {
        const target = (await targets()).find(target => target.id === result.targetId);
        if (!target) throw new Error("Created tab is unavailable");
        const tab = await prepare(target);
        await tab.goto(parsed.href);
        return observe(bind((await targets()).find(target => target.id === result.targetId) ?? target));
      } catch (error) {
        await requestTab({action:"close",targetId:result.targetId}).catch(() => {});
        await requestDialog({action:"stop",targetId:result.targetId});
        await requestLogs({action:"stop",targetId:result.targetId});
        throw error;
      }
    },
  };
  if(cleanups.length || tabs) onDispose(async()=>{
    const results=await Promise.allSettled(cleanups.map(cleanup=>Promise.resolve().then(cleanup)));
    const failed=results.find(result=>result.status==='rejected');if(failed)throw failed.reason;
    await tabs?.end(tabOwner,{final:true});
  });
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
