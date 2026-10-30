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
Input actions and Playwright locators are not implemented by this provider yet.`;

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
    const command = async (method, params) => {
      const current = (await targets()).find(item => item.id === target.id);
      if (!current) throw new Error("Tab closed or no longer available");
      return withConnection(current.webSocketDebuggerUrl, send => send(method, params));
    };
    async function ax(options = {}) {
      const result = await command("Accessibility.getFullAXTree");
      const state = result.nodes.filter(node => !node.ignored).map(node => `[${node.nodeId}] ${node.role?.value ?? ""} ${JSON.stringify(node.name?.value ?? "")}${node.value ? ` value=${JSON.stringify(node.value.value)}` : ""}`).join("\n");
      if (options.emit !== false) activeOutput().write(state, "cua.state");
      return state;
    }
    async function screenshot(options = {}) {
      const result = await command("Page.captureScreenshot", { format: "png" });
      const bytes = Buffer.from(result.data, "base64");
      if (options.emit !== false) await activeOutput().emitImage({ bytes, mimeType: "image/png" });
      return bytes;
    }
    return Object.freeze({
      ...info(target),
      getAXState: ax,
      getScreenshot: screenshot,
      async getAXStateAndScreenshot(options = {}) { return { state: await ax(options), screenshot: await screenshot(options) }; },
      async goto(url) {
        const parsed = new URL(url);
        if (!["http:", "https:", "about:"].includes(parsed.protocol)) throw new Error("Unsupported navigation URL protocol");
        const result = await command("Page.navigate", { url: parsed.href });
        if (result.errorText) throw new Error(result.errorText);
      },
      async back() { await traverse(-1); },
      async forward() { await traverse(1); },
      async reload() { await command("Page.reload"); },
      async close() {
        const result = await browserCommand("Target.closeTarget", { targetId: target.id });
        if (!result.success) throw new Error("Browser refused to close tab");
      },
    });
    async function traverse(offset) {
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
