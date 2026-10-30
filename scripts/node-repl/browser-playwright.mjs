export const PLAYWRIGHT_VERSION = "1.64.1";

export function createPlaywrightApi(endpoint, targetId, invalidate) {
  const recipes = new WeakMap();
  const selectors = ["locator", "getByRole", "getByText", "getByLabel", "getByPlaceholder", "getByTestId", "getByTitle", "getByAltText", "frameLocator"];
  const chains = [...selectors, "filter", "nth", "first", "last", "and", "or"];
  const reads = ["count", "innerText", "textContent", "allTextContents", "getAttribute", "inputValue", "isVisible", "isEnabled", "isChecked", "waitFor", "ariaSnapshot"];
  const actions = ["click", "dblclick", "fill", "press", "check", "uncheck", "setChecked", "selectOption", "hover", "scrollIntoViewIfNeeded", "pressSequentially", "type"];
  async function invoke(path, method, args) {
    const {chromium} = await import("playwright-core");
    const browser = await chromium.connectOverCDP(endpoint(), {timeout:10_000, noDefaults:true});
    // shortcut: forced Worker termination can skip focus cleanup; move cleanup leases to the host for cancellation safety.
    let focusSession, emulatedFocus = false;
    try {
      let page;
      for (const context of browser.contexts()) {
        for (const candidate of context.pages()) {
          const session = await context.newCDPSession(candidate);
          try {
            const {targetInfo} = await session.send("Target.getTargetInfo");
            if (targetInfo.targetId === targetId) { page = candidate; focusSession = session; }
          } finally { if (session !== focusSession) await session.detach(); }
          if (page) break;
        }
        if (page) break;
      }
      if (!page) throw new Error("Tab closed or no longer available");
      page.setDefaultTimeout(10_000);
      const convert = value => {
        if (value && recipes.has(value)) return resolve(recipes.get(value));
        if (Array.isArray(value)) return value.map(convert);
        if (value && Object.prototype.toString.call(value) === "[object Object]") return Object.fromEntries(Object.entries(value).map(([key,item]) => [key === "timeoutMs" ? "timeout" : key, convert(item)]));
        return value;
      };
      const resolve = steps => {
        let locator = page;
        for (const step of steps) locator = locator[step.method](...step.args.map(convert));
        return locator;
      };
      const locator = resolve(path);
      if (actions.includes(method)) {
        // Background CDP tabs need virtual focus for Playwright's frame-based stability check.
        await focusSession.send("Emulation.setFocusEmulationEnabled", {enabled:true});
        emulatedFocus = true;
        invalidate();
      }
      try {
        if (method === "domSnapshot") {
          const snapshots = [];
          for (const frame of page.frames()) snapshots.push(`${frame === page.mainFrame() ? "Page" : "Frame"}: ${frame.url()}\n${await frame.locator("body").ariaSnapshot()}`);
          return snapshots.join("\n\n");
        }
        return await locator[method](...args.map(convert));
      }
      finally { if (actions.includes(method)) invalidate(); }
    } finally {
      // Closing a CDP-attached Playwright Browser disconnects; existing tabs survive.
      try { if (emulatedFocus) await focusSession.send("Emulation.setFocusEmulationEnabled", {enabled:false}); }
      finally {
        try { if (focusSession) await focusSession.detach(); }
        finally { await browser.close(); }
      }
    }
  }
  function binding(path = []) {
    const api = {};
    for (const method of path.length ? chains : selectors) {
      api[method] = (...args) => binding([...path, {method, args}]);
    }
    if (!path.length) api.domSnapshot = () => invoke([], "domSnapshot", []);
    if (path.length) api.all = async () => Array.from({length:await invoke(path, "count", [])}, (_,index) => binding([...path, {method:"nth",args:[index]}]));
    if (path.length) for (const method of [...reads, ...actions]) {
      api[method] = (...args) => invoke(path, method, args);
    }
    recipes.set(api, path);
    return Object.freeze(api);
  }
  return binding();
}
