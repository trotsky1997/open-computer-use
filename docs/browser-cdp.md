# CDP browser provider

The REPL can connect to one explicitly configured Chromium debugging origin.
Set `OPEN_COMPUTER_USE_CDP_URL=http://127.0.0.1:9222` in the agent process that
starts the REPL. Node.js 22 or newer is required for the built-in WebSocket client.
The harness never enables debugging or scans browser profiles by itself.
See [viewport and screenshots](browser-viewport.md) for browser capability discovery,
explicit responsive sizing, JPEG/full-page/cropped captures and coordinate rules.
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
await tab.pressKey(elementIndex, "Return", {durationMs:100});
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
`ctrl`, `alt`, `shift`, `meta`, `super`, `cmd` modifiers; on macOS, select-all,
copy, cut and paste shortcuts send their required editor commands. typeText uses
CDP `Input.insertText` and preserves Unicode. paste uses the native isolated
clipboard with text/HTML support and trusted browser paste events; see its
headless requirements below.
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

Pointer-widget dragging and native HTML/file payload drops are verified; see
[native drag-and-drop](browser-drop.md) for the locator API and frame limits.
Extension transports and in-app browser integration remain open work. Native app
bindings retain their existing input methods.

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
`playwright-core` dependency; the Codex plugin installer copies production runtime
dependencies, including the pinned QuickJS engine, into the
installed plugin. The npm/REPL runtime requires Node.js 22 or newer. No browser
binary is downloaded or launched by this dependency.

```js
var name = tab.playwright.getByLabel("User name");
await name.fill("Hello", {timeoutMs: 5000});
await tab.playwright.getByRole("checkbox", {name: "Accept"}).check();
await tab.playwright.getByTestId("save").click();
nodeRepl.write(await tab.playwright.domSnapshot());
```

Read-only `evaluate`, `locator.evaluate` and `locator.evaluateAll` use a separate
QuickJS Worker with host-owned native DOM reads. See [read-only browser evaluation](browser-evaluate.md)
for arguments, frame scopes, supported reads and cleanup.

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
including frames attached during the wait and newly opened descendant popups.
Native opener identity and the browser context establish new-window lineage;
native Page events/frame trees establish frame ownership. Existing popups and
unrelated windows stay outside that wait. Bind an existing popup separately and
start its own download wait when needed. The host records browser-generated
GUIDs; response filenames are not used to construct local paths. `path()` waits
for completion and verifies a regular local file before returning its absolute
path. It throws for canceled, missing or incomplete artifacts. Completed paths
can be read repeatedly and files survive Worker reset/close; they remain in the
OS temporary directory until normal external cleanup. Artifact retention/export
management is still open work.

An additional startup observer is installed before input proceeds. It captures
new page metadata, resumes targets after Page capture is installed, and keeps
frame discovery asynchronous so waiting for renderer startup cannot block the
navigation that produces the download. Up to 128 unmatched download events are
buffered until frame identity arrives; terminal progress received before frame
attribution is retained. The first proven matching event resolves the waiter.
A closed temporary popup can still produce its completed artifact. Observer
connections and pending startup work are released during completion/cancellation.

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
runs a local download fixture. macOS and arm64 Linux headless Chromium check byte contents,
untrusted filenames, repeated paths, cross-call Worker handles, active cancellation,
reset/close, context exclusivity, policy restore failure/retry and file-chooser to
download sequencing. `node scripts/run-popup-download-smoke.mjs` additionally
checks direct attachment links, scripted/nested popup downloads, byte contents,
existing/unrelated window rejection, observer disconnect, active reset/close
cancellation and context policy/transport release in both JS hosts. Host process
crashes, broader iframe/provider races, remote browser filesystems and headful
presentation remain unverified. The artifact directory must
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

## JavaScript dialogs

```js
await tab.playwright.getByRole("button", {name:"Continue"}).click();
var dialog = await tab.getJsDialog();
if (dialog?.type === "confirm") await dialog.accept();
if (dialog?.type === "prompt") await dialog.accept("requested value");
if (dialog?.type === "alert" || dialog?.type === "beforeunload") await dialog.dismiss();
```

`getJsDialog()` returns `undefined` when no dialog is observed. The handle exposes
`type` and `dismiss()`. Confirm handles also expose `accept()`; prompt handles
expose `accept(text)`, requiring a string and preserving Unicode. Alert and
beforeunload handles expose dismissal only. Dismissing beforeunload cancels the
navigation. Invalid response arguments fail before consuming the handle. A
response dispatch consumes the captured identity, including command failure;
reset the session to clean up an uncertain failed response. Old handles fail
when a dialog closes or the next dialog opens.

Browser and tab discovery install an endpoint-wide CDP observer that remains
host-owned across JS calls. New page targets wait for their capture session to
enable Page events before Runtime.runIfWaitingForDebugger is dispatched. A
Page-domain event also establishes readiness when renderer startup or a dialog
delays the enable reply. Capture uses the attached session directly; a second renderer connection
can stall while a target is paused. An
input/navigation action that opens a dialog returns at that point, so the next
call can inspect and respond. Native CDP input, locator actions and file-chooser
setFiles use the same boundary. After a response, the harness waits for the
triggering action's connection cleanup, or yields when another sequential dialog
opens. Inspect page state after the final response. Page reads and new input fail
explicitly while a known dialog is active. Playwright connection setup also fails
explicitly if another observed tab has an active dialog, since CDP connection
initialization can stall on such pages.

One observer per endpoint/tab is shared inside the host process. An action's
dialog belongs to its initiating session; an unclaimed asynchronous dialog belongs
to the first session that obtains a handle. Other sessions cannot respond to that
handle, and closing a passive observer preserves the owner's dialog. Reset,
timeout and close dismiss owned active dialogs before releasing the observer and
focus resources. Immediate sequential dialogs are drained during cleanup; dialogs
that keep opening beyond the bounded cleanup interval stop reuse. A live target with a broken observer gets a fresh observation/control connection
that stays alive through cleanup and retries. Its identity guards late events
from replaced connections. Failed cleanup retains ownership and stops session
reuse until reset successfully retries. Source-level
PersistentJavaScriptSession reset()/close() are asynchronous; run() also waits for
the pending cleanup barrier and reports cleanup failure.

New tabs start at about:blank, install observers, then navigate to the requested
URL, covering scripts that open a dialog during initial loading. Rebinding a
known active dialog emits its type instead of requesting blocked AX data. Console
startup for that new observer is deferred until a successful dev.logs call after
dialog resolution. A dialog that predates observer startup can still block Page.enable without
replaying its opening event; resolve it through existing browser/native controls
before observation starts. The early observer catches dialogs opened after
discovery and before a tab binding, including initial popup scripts.
When the resumed browser action fails, accept()/dismiss() reports its error,
including a failure that settles during the response. An initial observation
interrupted by a page dialog still returns the dialog for handling.

Popup capture follows native opener IDs to the nearest active action watcher.
It preserves that action's session ownership, completion barrier and resumed error
reporting even though the dialog is in another target. A passive inventory owner
neither consumes a dialog nor explicitly dismisses it during cleanup. Binding a
tab promotes that owner; subsequent inventory does not demote it. The last owner
releases auto-attach and its root connection. Stale capture-session events are
ignored; a lost root observer fails discovery until reset releases it and allows
fresh observation. No document content is rewritten for capture.

Chromium's [PageHandler implementation](https://github.com/chromium/chromium/blob/main/content/browser/devtools/protocol/page_handler.cc)
stores dialog callbacks in the observing session. A replacement handler reports
only its own callbacks. After capture loss, cleanup requires renderer progress or
new dialog events before clearing an older dialog identity. If that check times
out, reset fails with an explicit unconfirmed-cleanup error, retains the dialog
and owner, and keeps further JavaScript blocked. An existing native/browser
control or an already-observing CDP session can close the old dialog. The retained
recovery observer then captures synchronous follow-ups; retry reset to drain
those dialogs and release input/focus/observer resources. A renderer barrier is
always sent over the recovered connection. Closed CDP connections reject new
requests immediately, including timeoutMs:0 calls.

A prompt during a cross-process frame drop has real Chrome coverage. macOS and
arm64 Linux disposable Chromium verified pre-binding prompts, synchronous popup
prompts, Unicode response, competing-owner rejection, passive cleanup, root
outage/reset recovery and popup dismissal during reset/close before obtaining a
dialog handle. Real Chrome initial-load/alert/confirm/prompt/beforeunload,
sequential and failure-recovery flows also passed. Broader frame flows, system
permission prompts, dialogs predating observer startup, headful/external-client
behavior and native Windows remain open validation. Independent host processes and
external browser clients are not coordinated by the in-process identity guard.

`OPEN_COMPUTER_USE_CDP_URL=http://127.0.0.1:9222 node scripts/run-dialog-smoke.mjs`
checks real alert/confirm/prompt/beforeunload flows, initial-load and sequential
dialogs, Unicode and argument validation, stale handles, native/locator/file input,
shared-observer ownership, active tab close, Worker/direct-session reset, timeout,
close and cleanup failure/retry against a disposable Chrome and local fixture.

## Browser clipboard and native paste

```js
await tab.clipboard.writeText("Hello 中文🙂");
nodeRepl.write(await tab.clipboard.readText());
await tab.clipboard.write([{entries:[
  {mimeType:"text/plain", text:"Formatted"},
  {mimeType:"text/html", text:"<b>Formatted</b>"},
]}]);
nodeRepl.write(await tab.clipboard.read());
await tab.pressKey(elementIndex, "meta+v"); // macOS; ctrl+v on Linux/Windows
await tab.paste(elementIndex, "<i>Formatted</i>", {format:"html"});
```

The API uses Chromium's real process-specific virtual clipboard, enabled by
headless mode. Launch the dedicated browser with `--headless=new` (or `--headless`)
and `--enable-automation`. Browser.getBrowserCommandLine must confirm that mode
before a control page or permission grant is created. Ordinary headful browsers,
including unverified custom configurations, fail explicitly. Native app
clipboard/paste remains separate work. typeText stays available independently of
this clipboard support.

Items have `entries` and optional `presentationStyle` (`unspecified`, `inline`,
`attachment`). Each entry has a MIME type and exactly one `text` string or canonical
`base64` string. Reads return text for text/* types and base64 for binary types.
Write payloads and read results are bounded to 16 MiB of decoded content. Chromium
applies its own MIME/image validation, HTML sanitization, supported item counts
and native clipboard normalization; read-back metadata/bytes follow the browser's
representation. Plain text, HTML and valid PNG were tested. Unsupported formats,
invalid images and multiple-item combinations can be rejected by the native API.

Clipboard state belongs to the browser process, shared across its tabs, contexts
and JS sessions. Reset/timeout/close dispose control resources and retain browser
clipboard contents. A new browser process starts its own clipboard. Clipboard
operations use a hidden, empty loopback control page in the target browser context,
with a clipboard-read grant scoped to that private origin and temporary emulated
focus. Public inventories hide control tabs. The browser must be able to reach
the host's loopback server; remote transport is unverified. The control server
serves no clipboard data and exposes no HTTP clipboard commands.

paste writes the clipboard and sends native editor paste within one host queue,
checking the selected document loader before dispatch. Browser paste events are
trusted and support page cancellation, native undo, maxlength/readonly handling,
rich content and PNG clipboard files. Native copy/cut shortcuts feed the same
browser clipboard, including the browser's password-field protections. This uses
the browser's native clipboard/editor implementation throughout. Page handlers
remain authoritative over the result; inspect current state after pasting.

Host calls serialize by endpoint. Queued canceled operations stop before browser
access, and in-flight calls finish before their resources close. Cleanup resets
the private permission to prompt when its final observer leaves, closes control
tabs, releases temporary focus and stops the loopback server. Cleanup failure
retains ownership and prevents session reuse until reset succeeds. Paste-triggered
dialogs use the existing owned-dialog boundary. Source consumers of createBrowserApi
must register its `onDispose` callbacks and await them during shutdown, as the
in-process REPL and smoke scripts do.

`OPEN_COMPUTER_USE_CDP_URL=http://127.0.0.1:9222 node scripts/run-clipboard-smoke.mjs`
checks real text/HTML/PNG reads and writes, trusted copy/cut/paste, sanitization,
undo, beforeinput cancellation, readonly/maxlength and password behavior, hidden
control tabs, shared browser state, queued/pre-dispatch cancellation, paste dialogs,
reset/timeout/close and cleanup failure/retry. On macOS it also verifies that the
system clipboard's plain-text hash remains unchanged without logging its contents.
The general browser smoke now needs the same headless/automation flags for native
paste. Headful/CfT isolation detection, remote access, incognito concurrency, host
crashes, Linux and Windows remain open validation.

Primary references: [Chromium's headless clipboard setup](https://raw.githubusercontent.com/chromium/chromium/main/chrome/browser/chrome_for_testing/chrome_browser_main_extra_parts_cft.cc),
[virtual clipboard design](https://raw.githubusercontent.com/chromium/chromium/main/docs/chrome_for_testing/README.md),
[Browser.getBrowserCommandLine](https://chromedevtools.github.io/devtools-protocol/tot/Browser/#method-getBrowserCommandLine).


## Held native input

The tab click wrapper now accepts key/durationMs with host-owned press/release
state, duration waits, dialog continuation and cleanup recovery. See
[browser held clicks](browser-held-input.md) for semantics, verified flows and
remaining ownership/platform boundaries.

All raw tab pressKey calls now share host-owned input state with held clicks and
data drops. durationMs is optional, finite and non-negative. Chords and modifier-
only keys use real down/up events; the whole chord stays down for the duration.
No repeat is synthesized. Element focus happens under the input lease, and
reset/timeout/close releases held keys with retained ownership on cleanup failure.
See [held input](browser-held-input.md) for navigation, dialogs and limits.


Tab capabilities now advertise cdp. Use
`await (await tab.capabilities.get("cdp")).documentation()` for the permitted raw
command/event API. It provides event cursors, filtering, paging and attached child
selectors with host-owned per-turn connections. See
[tab CDP capability](browser-debugger.md) for exact policy, validation and limits.


`OPEN_COMPUTER_USE_CDP_URL=http://127.0.0.1:9222 node scripts/run-early-dialog-smoke.mjs`
verifies early capture and popup ownership/cleanup in both JS session hosts.
Use a disposable browser profile; the controller creates and closes its own page
and popup fixtures. It also intentionally closes the owned observer connection
and checks explicit failure and recovery. It does not dismiss an existing user
browser dialog to initialize capture.
