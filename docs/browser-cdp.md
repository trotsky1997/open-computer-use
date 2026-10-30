# CDP browser provider

The REPL can connect to one explicitly configured Chromium debugging origin.
Set `OPEN_COMPUTER_USE_CDP_URL=http://127.0.0.1:9222` in the agent process that
starts the REPL. Node.js 22 or newer is required for the built-in WebSocket client.
The harness never enables debugging or scans browser profiles by itself.
Use a dedicated browser profile: the debugging endpoint controls that profile's
tabs. Keep it bound to loopback or behind an authenticated transport.

```js
var browsers = await cua.listBrowsers();
var tabs = await cua.listTabs({ browser: "cdp" });
var browser = await cua.getBrowser({ id: "cdp" });
var tab = await cua.createBrowserTab(browser.browserId, "https://example.com", { visible: false });
await tab.getAXState();
await tab.getScreenshot();
await tab.goto("https://example.org");
await tab.getAXStateAndScreenshot();
await tab.back();
await tab.forward();
await tab.reload();
await tab.close();
```

`cua.getTab(id)` and `cua.getTab({url})` bind an existing page and emit its initial
AX state. URL matching is exact and ambiguous matches fail explicitly. Tabs expose
`id`, `providerTabId`, `browserId`, `title` and `url`; metadata describes the binding
at creation time. Refresh the tab inventory to obtain current titles and URLs.
Observation methods support `{emit:false}` and return full state / PNG bytes.
Browser AX node IDs are supplied by Chromium. Input actions, Playwright locators,
formatted paste, extension transports and in-app browser integration are still
open work. Native app bindings retain their existing input methods.

`cua.getState()` returns `{apps, browsers, errors?}`; browsers contain their tabs.
Each inventory can fail independently. `cua.listApps()` only queries native apps.
Unconfigured browser discovery returns an empty list. Unsupported browser IDs,
creation options and navigation protocols fail explicitly. Commands and discovery
have 10-second timeouts; each operation closes its CDP connection. Tabs survive
REPL resets. Navigation commands dispatch navigation; read state afterwards and
verify that the requested content is present before continuing.

## Repeatable verification

Start a disposable Chrome instance with a new user-data directory and a loopback
remote-debugging port. Then run:

```sh
OPEN_COMPUTER_USE_CDP_URL=http://127.0.0.1:9222 node scripts/run-browser-smoke.mjs
```

The smoke runner serves a local HTML fixture, creates and closes its own tab,
checks AX and PNG output, exercises history and reload, and verifies browser
inventory through a Worker while native app discovery fails. It leaves existing
tabs intact. This was exercised with headless Chrome on macOS; other platforms
and headful browser focus behavior remain unverified.
