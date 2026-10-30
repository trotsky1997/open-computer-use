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
Browser AX node IDs are supplied by Chromium. Supported input operations are:

```js
await tab.click(elementIndex, {mouseButton: "left", clickCount: 1});
await tab.typeText(elementIndex, "Hello 中文🙂");
await tab.pressKey(elementIndex, "Return");
await tab.paste(elementIndex, "line one\nline two", {format: "text"});
await tab.scroll(elementIndex, "down", 1);
await tab.setValue(elementIndex, "first target second target end");
await tab.selectText(elementIndex, "target", {prefix:"second ", suffix:" end"});
await tab.typeText(null, "replacement");
```

For `typeText`, `paste` and `pressKey`, pass `null` as the first argument to use
current focus. Input operations validate the latest observed document loader,
backend node, role and name before using an AX index. Changed or removed elements,
navigation and screenshot-only reads require a new AX observation. Element clicks
scroll into view and check that the center is visible and unobstructed before
sending browser mouse events. Scroll uses the closest scrollable DOM ancestor and
its client dimensions, so it works without making the browser foreground.
Keyboard input supports printable characters, standard navigation keys and
`ctrl`, `alt`, `shift`, `meta`, `super`, `cmd` modifiers; on macOS, `meta+a` sends
the required select-all editor command. Text insertion uses CDP `Input.insertText`
and preserves Unicode without touching the system clipboard. Paste currently
has plain text insertion semantics, with no clipboard or paste event emulation.
Read AX after input and verify the visible result. Asynchronous page handlers may
need another observation; the smoke uses a combined screenshot/AX observation to
allow headless rendering of scroll feedback.

`setValue` supports text inputs, textareas and contenteditable elements. It invokes
the browser's native value setter for controls, or replaces contenteditable text,
then emits input/change events and verifies the resulting value. Disabled,
read-only, detached and unsupported input types fail explicitly. Application
handlers can reject a value; verification reports that failure.

`selectText` matches exact text with optional immediately adjacent `prefix` and
`suffix`. Missing or ambiguous matches fail without changing text. `selectionType`
accepts `text` (default), `cursor_before` and `cursor_after`. Input and textarea
ranges use UTF-16 offsets; contenteditable ranges can span text nodes. The applied
range and unchanged text are verified before success. Read fresh AX state after
an error before reusing element indices. Contenteditable text matching follows
DOM textContent; structural line breaks require matching the actual DOM text.

Coordinate `click([x,y])` and `scroll([x,y], direction, pages)` use pixel
coordinates from the most recent screenshot. `drag([fromX,fromY], [toX,toY])`
performs a left-button pointer drag with interpolated movement and releases the
button in a finally block. Each input operation consumes the coordinate snapshot;
capture again before the next coordinate action. Screenshot pixels are scaled to
CSS viewport coordinates. Navigation, scrolling, viewport geometry changes and
native errors require a new screenshot. Input checks loader and viewport geometry
before dispatch, including changes made through another binding. Pinch-zoom input
fails explicitly; screenshots remain available. Browser pointer operations stay
inside the CDP target and do not move the system pointer. Layout/content changes
that preserve loader and viewport geometry still require the agent to verify the
latest observed UI.

Pointer-widget dragging is verified. HTML drag-and-drop with DataTransfer payloads
remains open, along with Playwright locators, formatted paste,
extension transports and in-app browser integration remain open work. Native app bindings retain their existing input methods.

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
checks AX and PNG output, exercises click/type/key/paste/scroll and history/reload,
checks exact selection, repeated-text disambiguation, cursor placement, multiline
Unicode replacement and cross-node contenteditable selection, checks screenshot coordinate clicks, pointer-widget drag, coordinate scroll and
geometry changes through another binding; rejects covered,
stale, out-of-bounds or read-only targets, and verifies browser inventory and input
through a Worker while native app discovery fails. It leaves existing
tabs intact. This was exercised with headless Chrome on macOS; other platforms
and headful browser focus behavior remain unverified.
