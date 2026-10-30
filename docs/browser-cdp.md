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
remains open, along with formatted paste,
extension transports and in-app browser integration remain open work. Native app bindings retain their existing input methods.

`cua.getState()` returns `{apps, browsers, errors?}`; browsers contain their tabs.
Each inventory can fail independently. `cua.listApps()` only queries native apps.
Unconfigured browser discovery returns an empty list. Unsupported browser IDs,
creation options and navigation protocols fail explicitly. Commands and discovery
have 10-second timeouts; ordinary commands close their CDP connection after use; file chooser handles retain an attached connection until consumed. Tabs survive
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

## Playwright locators

Run `npm ci` in a source checkout. Published npm packages declare the pinned
`playwright-core` dependency; the Codex plugin installer copies it into the
installed plugin. The npm/REPL runtime requires Node.js 22 or newer. No browser
binary is downloaded or launched by this dependency.

```js
var name = tab.playwright.getByLabel("User name");
await name.fill("Hello", {timeoutMs: 5000});
await tab.playwright.getByRole("checkbox", {name: "Accept"}).check();
await tab.playwright.getByTestId("save").click();
nodeRepl.write(await tab.playwright.domSnapshot());
```

The locator adapter delegates selectors and actions to Playwright Core. It supports
role, text, label, placeholder, test-id, title, alt-text and CSS locators, nested
locators, frameLocator, filter, nth/first/last, all and and/or composition. Text
matchers can be strings or regular expressions. Actions include click/dblclick,
fill, press/type/pressSequentially, check/uncheck/setChecked, selectOption, hover
and scrollIntoViewIfNeeded. Reads include count, textContent/innerText,
allTextContents, inputValue, getAttribute, isVisible/isEnabled/isChecked, waitFor
and ariaSnapshot. `domSnapshot()` returns Playwright accessibility snapshots for
the main page and available child frames. It returns text for explicit output
with nodeRepl.write; it does not emit automatically.

Locators resolve again for each operation, including after navigation, and retain
Playwright's actionability checks and strict matching. The default operation timeout
is 10 seconds; `timeoutMs` maps to Playwright's timeout. Each ordinary operation connects to
the exact CDP target and disconnects afterwards, preserving browser tabs. File
chooser handles retain their event connection until consumed. Action
operations temporarily emulate focus for the target's frame-based stability
checks and explicitly disable that emulation during cleanup. The page's internal
focus can change as a result of input. Success and failure cleanup were checked
against background-page visibility. Concurrent focus emulation by other CDP clients
is not coordinated; use one harness for a configured browser.

Playwright actions discard prior native AX and screenshot indices. Read fresh
state after an action. Read-only evaluation isolation, artifact export/retention and other browser lifecycle integrations remain open.

Worker locator actions acquire an exclusive focus lease owned by the host before
starting input. The host keeps its own CDP connection until release, independently
of the Worker. Timeout, reset, close and unexpected Worker exit terminate the
Worker and restore focus before completing cancellation or starting its replacement.
Lease acquisition is registered before any asynchronous enable request, so cleanup
also covers a Worker that dies while acquisition is in flight. Concurrent actions
on the same target in one host are refused until its existing input lease ends.

Cleanup failure retains ownership and stops the session. New evaluations are
refused until reset retries cleanup successfully. Cleanup can extend the requested
JavaScript timeout while CDP recovery completes. No interrupted action is replayed.
A timeout can leave an action's application result uncertain; inspect current
browser state before retrying. This protects Worker cancellation while the host is
alive; separate host processes or other CDP clients are not jointly coordinated.

## Navigation waits

```js
var result = await tab.playwright.expectNavigation(async () => {
  await tab.playwright.getByRole("link", {name:"Continue"}).click();
  return "clicked";
}, {url:"**/result", waitUntil:"load", timeoutMs:5000});
await tab.playwright.waitForURL("**/result", {waitUntil:"domcontentloaded"});
await tab.playwright.waitForLoadState({state:"load", timeoutMs:5000});
```

`expectNavigation` registers a main-frame navigation listener before calling the
action, then waits for the optional URL pattern and requested load state. It
returns the action's value. Same-document navigation and same-URL reloads are
supported; child-frame navigation alone does not satisfy the wait. URL strings
use Playwright's glob matching. Main-frame navigation and load/URL waits share
the supplied wait deadline; the callback also remains subject to the REPL's
execution budget. Callback errors are propagated and pending watcher rejections
are consumed during disconnect. The callback is never retried.

`waitForURL` resolves when the current or future URL matches, with the requested
load state. It additionally accepts `waitUntil:"commit"`. `waitForLoadState`
accepts `state:"load"`, `"domcontentloaded"` or `"networkidle"`. The default wait
timeout is 10 seconds; `timeoutMs:0` disables that local wait timeout while the
Worker execution budget still applies. Invalid options fail before an action
callback runs. Prefer a concrete URL or visible page state over network-idle on
pages with persistent connections. Forced Worker termination closes its watcher
connections through the existing cancellation path.


## File chooser events

```js
var pending = tab.playwright.waitForEvent("filechooser", {timeoutMs:5000});
await tab.playwright.getByLabel("Upload").click();
var chooser = await pending;
nodeRepl.write(chooser.isMultiple());
await chooser.setFiles(["/absolute/path/to/report.txt"], {timeoutMs:5000});
```

Start the event wait before triggering the chooser. A per-tab readiness barrier
holds subsequent Playwright and native AX/coordinate input until interception is
acknowledged. One waiter of each event type can be pending in a JavaScript kernel for each tab.
Starting another before consuming the first is rejected. The default event wait
timeout is 10 seconds; zero disables the local timeout while the Worker budget
still applies. Events other than filechooser and download fail explicitly.

`isMultiple()` returns the captured control's multiple-file flag. `setFiles`
accepts an absolute path or array of absolute paths; an empty array clears the
selection. Single-file controls reject multiple paths. Relative paths and invalid
options are rejected before consuming the handle, so callers can correct them.
The first dispatch attempt consumes the handle, including native file errors;
obtain a fresh chooser before another attempt. The attached event connection is
closed and file interception is disabled after dispatch success or failure.
AX and screenshot history are invalidated after setting files.

Handles can be retained across REPL calls. Consume them promptly; an unused
captured handle retains its connection until Worker reset/close. Worker timeout
or reset terminates the owning event connection. Real headless Chrome verified
subsequent chooser use and independently checked that interception was absent
after error/reset. Desktop picker presentation and remote CDP filesystem access
remain unverified. Paths must refer to files available to the Playwright/browser
host; remote browsers may require shared paths or an additional transfer layer.

## Downloads

```js
var pending = tab.playwright.waitForEvent("download", {timeoutMs:10000});
await tab.playwright.getByRole("link", {name:"Download"}).click();
var download = await pending;
nodeRepl.write(await download.path({timeoutMs:30000}));
```

The host prepares a private temporary directory and enables CDP download events
before input proceeds. A download is attributed to the selected tab's frames,
including frames attached during the wait. The host records browser-generated
GUIDs; response filenames are not used to construct local paths. `path()` waits
for completion and verifies a regular local file before returning its absolute
path. It throws for canceled, missing or incomplete artifacts. Completed paths
can be read repeatedly and files survive Worker reset/close; they remain in the
OS temporary directory until normal external cleanup. Artifact retention/export
management is still open work.

Event and completion timeouts default to 10 seconds and accept `timeoutMs:0` for
an unlimited local wait within the Worker execution budget. Handles can be saved
across REPL calls. A file chooser and a download watcher may coexist; setFiles
also waits for download preparation, covering pages that generate a download
immediately after file selection.

CDP download policy applies to a browser context. One active download watcher in
a context is allowed per host process; competing watchers fail explicitly. The
host restores Chromium's **default** download behavior after completion or failure.
It cannot read/restore another client's previous custom CDP policy. Use a dedicated
browser profile: unrelated downloads in the same context temporarily share that
download destination, although their artifacts are not returned to the waiter.
Separate host processes are not coordinated.

Worker timeout/reset/close cancels active transfers, waits for a browser terminal
progress event, restores the default policy and then releases ownership. A restoration
failure retains the context lease while the host stops the owning Worker and
retries cleanup. A replacement starts only after cleanup succeeds; persistent
failure keeps the session stopped and reset can retry. Background completion
cleanup failures notify the owning session
even when no JavaScript path read is currently awaiting them. Interrupted clicks/transfers are not replayed. Partial downloads
never produce a path; private partial files/directories may remain for OS cleanup.

`OPEN_COMPUTER_USE_CDP_URL=http://127.0.0.1:9222 node scripts/run-download-smoke.mjs`
runs a local download fixture. Real macOS headless Chrome checks byte contents,
untrusted filenames, repeated paths, cross-call Worker handles, active cancellation,
reset/close, context exclusivity, policy restore failure/retry and file-chooser to
download sequencing. Host process crashes, remote browser filesystems, popup-owned
downloads and headful presentation remain unverified. The artifact directory must
be visible to the browser and host; a remote transfer layer is not implemented.

## Browser-only runtime

A package built from this fork can run `ocu js` / `ocu repl` and its plugin MCP
adapter without a native artifact. Configure OPEN_COMPUTER_USE_CDP_URL normally.
Native APIs initialize lazily on first use and report their own startup errors.
getState can return browser results plus an apps error when native discovery is
unavailable. The capability report checks Node and all required runtime modules
independently of native artifact availability.

`OPEN_COMPUTER_USE_CDP_URL=http://127.0.0.1:9222 node scripts/run-browser-only-smoke.mjs`
verifies CLI and MCP browser discovery, native-error isolation and real field input
against a disposable Chrome, with no usable native path. Healthy native handshake
and initialization-cancellation behavior have subprocess fixture checks. Real
native desktop behavior and a native-free source installer remain separate work.

## Developer console logs

```js
await tab.playwright.getByRole("button", {name:"Save"}).click();
nodeRepl.write(await tab.dev.logs({levels:["warn", "error"], limit:20}));
```

`dev.logs({filter?, levels?, limit?})` returns chronological console messages with
`level`, `message`, ISO `timestamp` and a source `url` when Chromium provides one.
`filter` is a case-sensitive message substring. Levels are `debug`, `info`, `log`,
`warn` and `error`; `warning` is accepted as an alias for `warn`. An omitted limit
returns the newest 100 matching entries; a non-negative integer selects the bound,
and zero returns an empty array. Reads do not consume entries. Unknown options,
invalid levels and invalid bounds fail explicitly.

Capture starts during tab binding after Runtime.enable has replayed its cached
history. Older console history is excluded. The host holds the observer across JS
calls and main-frame navigation, scoped to the Worker session and tab. Rebinding a
live tab in that session reuses capture. A fresh session starts a fresh buffer.
Reset, timeout and close release listeners, including pending startup; tab close
also ends capture. An unexpected disconnection makes reads fail explicitly;
rebinding starts fresh capture. Observers execute no page getters or application
code: object payloads use Chromium's shallow previews/descriptions and printf
placeholders are formatted from protocol values.

Retention is bounded to 1,000 entries per session/tab and 16,384 UTF-16 code units per
rendered message. DOM nodes, object graphs and tables are shallow descriptions. Console
messages from workers and out-of-process frames, network logs and uncaught
exception events are outside this implementation. Host process crash recovery
and headful/Linux/Windows coverage remain open.

`OPEN_COMPUTER_USE_CDP_URL=http://127.0.0.1:9222 node scripts/run-console-smoke.mjs`
checks real console levels/formatting/source URLs, filtering, retention, cross-call
and navigation capture, session isolation and reset/timeout/close/startup cleanup
using a disposable Chrome and local page.
