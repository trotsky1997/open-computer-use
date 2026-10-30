import { createPlaywrightApi } from "./browser-playwright.mjs";

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
  // macOS CDP requires an explicit editor command for the select-all shortcut.
  if (process.platform === "darwin" && modifiers === 4 && value.toLowerCase() === "a") result.commands = ["selectAll"];
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

async function withConnection(url, operation) {
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
    try { message = JSON.parse(event.data); } catch { fail(new Error("Invalid CDP response")); socket.close(); return; }
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  socket.addEventListener("close", () => fail(new Error("Browser connection closed")));
  socket.addEventListener("error", () => fail(new Error("Browser connection failed")));
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
    return await operation(send);
  } finally {
    clearTimeout(timer);
    fail(new Error("Browser operation ended"));
    socket.close();
  }
}

const DOCUMENTATION = `## CDP browser
Use cua.listTabs(), cua.getTab(id or {url}), and cua.createBrowserTab("cdp", url).
Tab bindings expose getAXState(), getScreenshot(), getAXStateAndScreenshot(),
goto(url), back(), forward(), reload(), and close(). Observations emit by default;
pass {emit:false} to suppress output. AX state uses browser accessibility node IDs.
Tab input: click(elementIndex, {mouseButton?, clickCount?}), typeText(elementIndexOrNull, text),
pressKey(elementIndexOrNull, key), paste(elementIndexOrNull, text, {format:"text"}),
and scroll(elementIndex, direction, pages). Read fresh AX state after actions.
Screenshot-only reads invalidate element indices. Navigation invalidates all indices.
setValue(elementIndex, value) replaces editable text; selectText(elementIndex, text, {prefix?,suffix?,selectionType?}) selects exact text or positions the cursor.
click and scroll also accept screenshot pixel pairs. drag(fromPixelPair, toPixelPair) performs a pointer drag. Capture a new screenshot after input; changed document or viewport geometry invalidates coordinates. Pinch zoom is unsupported.
tab.playwright exposes locator/getByRole/getByText/getByLabel/getByPlaceholder/getByTestId/getByTitle/getByAltText/frameLocator.
Chain locator/filter({hasText})/nth/first/last; read count/innerText/textContent/allTextContents/getAttribute/inputValue/isVisible/isEnabled/isChecked/waitFor;
act with click/dblclick/fill/press/check/uncheck/setChecked/selectOption/hover/scrollIntoViewIfNeeded.
Playwright resolves fresh elements and waits for actionability; ambiguous matches fail. Default action timeout is 10 seconds.
Playwright actions invalidate prior AX and screenshot indices. Read current state afterwards. Formatted paste remains unsupported.`;

export function createBrowserApi(activeOutput, environment = process.env) {
  function endpoint() {
    if (!environment.OPEN_COMPUTER_USE_CDP_URL) return null;
    const url = new URL(environment.OPEN_COMPUTER_USE_CDP_URL);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
      throw new Error("OPEN_COMPUTER_USE_CDP_URL must be an HTTP(S) browser debugging origin");
    }
    return url;
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
    return result.filter(target => target.type === "page");
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
      try { return await withConnection(current.webSocketDebuggerUrl, operation); }
      catch (error) { invalidate(); throw error; }
    };
    const command = (method, params) => operate(send => send(method, params));
    const input = operation => operate(async send => {
      try { return await operation(send); }
      finally { capture = undefined; }
    });
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
      playwright: createPlaywrightApi(() => { const value = endpoint(); if (!value) throw new Error("No CDP browser configured"); return value.href; }, target.id, invalidate),
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
        if (Object.keys(options).some(key => key !== "format") || (options.format !== undefined && options.format !== "text")) throw new Error("CDP paste currently supports text format only");
        if (typeof text !== "string") throw new Error("paste requires text");
        await input(async send => { await focus(send, index); await send("Input.insertText", {text}); });
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
        const result = await command("Page.navigate", { url: parsed.href });
        if (result.errorText) throw new Error(result.errorText);
      },
      async back() { await traverse(-1); },
      async forward() { await traverse(1); },
      async reload() { invalidate(); await command("Page.reload"); },
      async close() {
        const result = await browserCommand("Target.closeTarget", { targetId: target.id });
        if (!result.success) throw new Error("Browser refused to close tab");
      },
    });
    async function traverse(offset) {
      invalidate();
      const history = await command("Page.getNavigationHistory");
      const entry = history.entries[history.currentIndex + offset];
      if (!entry) throw new Error("No navigation history entry in that direction");
      await command("Page.navigateToHistoryEntry", { entryId: entry.id });
    }
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
      const tab = bind(matches[0]);
      activeOutput().write(DOCUMENTATION, "cua.browser");
      await tab.getAXState();
      return tab;
    },
    async createBrowserTab(browserId, url = "about:blank", options = {}) {
      if (browserId !== "cdp") throw new Error(`Unknown browser: ${browserId}`);
      for (const key of Object.keys(options)) {
        if (key !== "visible") throw new Error(`Unsupported CDP tab creation option: ${key}`);
      }
      if (options.visible !== undefined && typeof options.visible !== "boolean") throw new Error("visible must be a boolean");
      const parsed = new URL(url);
      if (!["http:", "https:", "about:"].includes(parsed.protocol)) throw new Error("Unsupported navigation URL protocol");
      const result = await browserCommand("Target.createTarget", { url: parsed.href, background: options.visible === false });
      return api.getTab(result.targetId);
    },
  };
  return Object.freeze(api);
}
