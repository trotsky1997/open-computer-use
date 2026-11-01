# Tab CDP capability

```javascript
await tab.goto(url);
await tab.playwright.waitForURL(url);
const cdp = await tab.capabilities.get("cdp");
await cdp.send("Network.enable");
const {cursor} = await cdp.readEvents();
await tab.playwright.getByRole("button", {name:"Load"}).click();
let page = await cdp.readEvents({
  afterSequence:cursor, methods:["Network.requestWillBeSent"], limit:100,
});
while (page.hasMore) {
  // Process page.events before advancing; keep the same filters.
  page = await cdp.readEvents({
    afterSequence:page.cursor, methods:["Network.requestWillBeSent"], limit:100,
  });
}
```

Discover with `tab.capabilities.list()` and read `cdp.documentation()`. This
optional developer surface requires a committed HTTP(S) page. It operates on the
bound tab and automatically attached iframe/worker descendants. Discover selectors
from `Target.attachedToTarget`, then pass either `{target:{sessionId}}` or
`{target:{targetId}}` to send/readEvents. Cross-origin descendants are supported;
unrelated browser targets cannot be selected. Detached children retain buffered
history, while sends to their old sessions fail.

`send(method, params?, {target?,timeoutMs?})` returns the protocol result, including
normal browser protocol errors. Default command timeout is ten seconds; zero uses
the surrounding execution budget without a separate command deadline. All sends
invalidate that binding's higher-level AX and screenshot coordinates. Read fresh
state before ordinary input. A command timeout preserves JS variables and does
not imply cancellation of page execution. `Runtime.terminateExecution` can stop
an explicitly started running script; arbitrary effects/promises/timers are not
rolled back. CPU/renderer and host-crash recovery need broader work.

Command deadlines count time outside JavaScript dialogs reported by active
`Page` event streams in this capture. Multiple root/child sources share the pause;
`Page` observation is host-owned and raw `Page.disable` is refused. Child
detachment and origin rotation retire their source state. Detached late events cannot pause commands again.
Capture discovery/bootstrap, event-read waits and dialogs predating observation
remain outside this clock. Other developer capabilities retain their own clocks.

Keep a raw command Promise when its script can open a dialog, then respond in a
later JS call and await the stored Promise for its protocol result:

```javascript
// First JS call; retain bindings across calls.
var pending = cdp.send("Runtime.evaluate", {expression:'prompt("Continue?")'});
// Later JS call, after the dialog opens.
var dialog = await tab.getJsDialog();
await dialog.accept("yes");
var protocolResult = await pending;
```

`readEvents({afterSequence?,limit?,methods?,target?,timeoutMs?})` returns
`{cursor,events,hasMore,truncated}`. Each event includes method, optional params,
sequence and source targetId, plus sessionId for child sources. Omitting a cursor
starts at the current position. Limit is 1...1000. A positive timeout waits for
matching events; zero returns immediately. Filters apply before pagination, and
an exhausted page advances the cursor through nonmatching events too. Buffers
retain at most 2048 events and eight MiB per capture. Oversized events are dropped
with a cursor boundary; older requested history reports truncated. Main-page
origin changes evict prior history and child-session bindings while retaining a
monotonic cursor. Navigate with the normal tab API before debugging a new origin.

The current policy supports Accessibility, Audits, Console, CSS, Debugger, DOM,
DOMDebugger, DOMSnapshot, Emulation, Fetch, IO, Input, Inspector, Log, Network,
Overlay, Page, Performance, Profiler, Runtime, Tracing and WebAudio. Browser,
CacheStorage, Database, Security, Storage, Target and WebAuthn domains are refused.
Native method availability still depends on the browser backend/version. Global
cookie/cache commands and Network.loadNetworkResource are refused. The remaining
static method exclusions are:

- Input.dispatchKeyEvent, Input.dispatchDragEvent and Input.setInterceptDrags;
  use higher-level key, chooser and drop APIs.
- DOM.getFileInfo and DOM.setFileInputFiles; use the file-chooser API for uploads.
- Network.continueInterceptedRequest, Network.getCertificate and Network.replayXHR.
- Page.navigate/navigateToHistoryEntry/getNavigationHistory/resetNavigationHistory;
  use tab.goto/back/forward for supported navigation.
- Page.crash, Page.disable, Page.setAdBlockingEnabled, Page.setBypassCSP,
  Page.setDownloadBehavior, Page.setInterceptFileChooserDialog,
  Page.setRPHRegistrationMode and Page.setSPCTransactionMode. Download and file
  selection use the high-level event/chooser APIs.

These restrictions apply to both root and child targets before capture creation.
Other unsupported domains and previously listed exclusions remain in force.
Ordinary Network.enable buffer settings and enableDurableMessages:false remain
available. Enabling durable messages through Network.enable or a non-null
maxTotalBufferSize in Network.configureDurableMessages is refused before connecting: renderer-independent response storage can retain old
origin data after navigation. Read response/post bodies before navigating; the
native fixture confirms old IDs are unavailable after same-site port and
cross-site origin changes with ordinary Chromium buffering.
This explicit provider policy still needs a broader reference-command matrix;
matching the method signatures establishes only this implemented surface.

Cookie lookup uses Network.getCookies with a non-empty urls array of strings.
The implicit current-page lookup is refused. Network.setCookie and
Network.deleteCookies require an explicit url; Network.setCookies validates every
cookie before dispatching the batch, including each url. Cookie domain,
sourcePort and sourceScheme overrides are refused so the browser derives them
from the URL. A non-null partitionKey must be an object; topLevelSite, when present,
must be a string. Empty cookie batches remain available. Legacy Page.deleteCookie
requires url and retains native protocol/version errors.

Explicit cookie URLs may address other origins in this trusted developer API.
Cookies follow native host/domain/path rules, including sharing across ports.
These checks validate parameter shapes; consent and URL authority mediation remain
open. URL strings and unhandled native fields retain normal browser validation.
The native fixture uses synthetic cookies in disposable profiles, verifies reads
for separate hosts and multiple URLs, write/batch/delete behavior, and refusal of
a malformed batch before its valid first entry can mutate state.

On the tab root, Fetch.enable requires an explicit patterns array and every
pattern must specify a string resourceType other than Document. An omitted
pattern array, patterns without a resource type and Document patterns are refused before
capture creation. Clear raw interception with Fetch.enable({patterns:[]}); root
Fetch.disable is refused. Attached child targets retain native Fetch enable and
disable behavior, with the existing attached-target ownership check. This keeps
root document navigation outside raw interception. The provider currently relies
on normal browser navigation; a browser-managed Document-response mediator and
broader raw URL/header authority remain open.

Fetch.continueRequest accepts url only as a string when supplied. Fetch.fulfillRequest
and Fetch.continueResponse accept responseHeaders only as an array of objects with
string name and value fields;
non-null binaryResponseHeaders is refused, including an empty binary string.
Persistent script registration via Page.addScriptToEvaluateOnLoad and
Page.addScriptToEvaluateOnNewDocument is refused before capture creation. Such
hooks can execute after navigation to another origin. Ordinary per-document
Runtime evaluation remains available under the raw developer capability.
Page.reload accepts ordinary reload options and refuses non-null
scriptToEvaluateOnLoad (including an empty script). Page.createIsolatedWorld
accepts normal worlds and refuses grantUniveralAccess:true; that spelling comes
from the protocol. These parameter checks run before capture creation in both the
model facade and host. Use tab.reload() for normal interaction. Raw reload is
asynchronous; wrap it in tab.playwright.expectNavigation when subsequent work
requires the loaded page. The native fixture covers real response fulfillment and
continuation with structured headers, plus ordinary reload and isolated-world
reads. Broader method and URL/header authority policy remains open.

Chrome Tracing supports ReportEvents via readEvents, and ReturnAsStream via the
tracingComplete stream handle followed by IO.read/close. Tracing.start refuses
non-null perfettoConfig, the system backend, enable-systrace in legacy options,
traceConfig.enableSystrace:true and non-null traceConfig.memoryDumpConfig.
Tracing.requestMemoryDump is refused. Ordinary Chrome tracing remains available.
Category queries may return an empty list; the native fixture verifies actual
non-empty trace events and streamed JSON rather than a category count.

Tracing can collect data across the browser profile, beyond the selected tab.
Use an entirely controlled profile when collecting isolated traces. End a trace
and close its IO stream explicitly. The native fixture verifies that turn-end
connection retirement also stops an active trace and permits a fresh capture;
other browser/provider and host-crash cases remain open. These developer commands
retain their native semantics and the existing bounded event buffer.

Connections, event buffers, attached sessions and pending reads belong to the
execution-turn resource owner in both session implementations. Reset, endTurn,
timeout and close cancel discovery and close captures. Retained facades open fresh
captures next turn. Debugger pause release on disconnect has real Chrome evidence.
Connection loss requires reset/reconnection instead of silently reusing old
history. A discovery request canceled before dispatch cannot send a late command.
Owner cancellation also aborts an unfinished WebSocket handshake. A command
timeout removes its response waiter and ignores a late reply while leaving the
capture usable; arbitrary page execution can continue until explicit recovery.

Raw CDP is trusted developer access and can mutate DOM, change/intercept requests,
pause execution or alter persistent browser/page state. It does not provide a
read-only evaluation sandbox, automatic rollback or user-consent enforcement.
Higher-level APIs remain the normal interaction surface. As with other arbitrary
Node.js code, lifecycle guards do not isolate an adversarial script. Managed tab
retention/close checks apply to the lifecycle API; low-level developer operations
remain privileged.

## Verification

```sh
node --test scripts/node-repl/*.test.mjs
OPEN_COMPUTER_USE_CDP_URL=http://127.0.0.1:9222 node scripts/run-cdp-smoke.mjs
OPEN_COMPUTER_USE_CDP_URL=http://127.0.0.1:9222 node scripts/run-cdp-network-smoke.mjs
OPEN_COMPUTER_USE_CDP_URL=http://127.0.0.1:9222 node scripts/run-cdp-tracing-smoke.mjs
OCU_TEST_CHROME_EXECUTABLE=/path/to/chrome node scripts/run-cdp-dialog-smoke.mjs
```

Use disposable Chrome with site isolation enabled. The live smoke covers source
and Worker sessions, HTTP guard/retry, commands, filtered pagination/waits,
bounded eviction, cross-origin iframe and worker selectors, detached history,
origin changes, command-timeout recovery, paused-page release and turn/reset
cleanup. Source/Worker turn and native-free CLI/MCP regression smokes also run.
Headful/native desktop, other browser transports, full command-policy parity,
shared/service worker edge cases and renderer/host-crash recovery remain open.

The managed dialog controller uses a disposable private Chrome profile. An
optional first argument selects an installed runtime. Both JS hosts cover root
and OOP-iframe sequential prompts, protocol results, Page-disable refusal with
continued dialog observation, resumed expiry with retained REPL bindings,
timeout-zero reset and an actual blocked-handshake socket closing before a fresh
capture succeeds.

The network fixture verifies refusal of both durable-payload paths before capture
creation, ordinary request/response metadata, POST and response bodies, same-site
port changes and cross-site origin invalidation, fresh requests and turn rebind in
both engines. It also verifies Page/Fetch parameter refusal before capture,
ordinary reload/isolated-world reads, and actual structured-header fulfillment
and continuation after a rejected binary-header attempt. An optional first
argument selects an installed runtime. The same fixture covers root Fetch scope,
real OOP-child enable/disable, navigation with typed interception active, empty-
pattern cleanup, static method refusal before attachment, persistent script
refusal/absent hooks across origins, and turn-end release of an actual paused
request.

Raw Network policy also denies extra HTTP headers, device-bound session controls,
cookie controls and legacy interception/body-stream commands. The disable form
`Network.configureDurableMessages({})` remains available.

Protocol field semantics are documented by Chromium's
[Page protocol](https://github.com/ChromeDevTools/devtools-protocol/blob/master/pdl/domains/Page.pdl)
and [Fetch protocol](https://github.com/ChromeDevTools/devtools-protocol/blob/master/pdl/domains/Fetch.pdl).

The tracing fixture owns its entire disposable browser profile. Both engines
cover Audits/Console/Inspector, raw Unicode text and trusted pointer receivers,
ReportEvents, streamed JSON through IO, stream closing, configuration refusal
before attachment and active-trace turn cleanup/rebind. An optional first argument
selects an installed runtime. Chromium documents these flows in the
[Tracing protocol](https://github.com/ChromeDevTools/devtools-protocol/blob/master/pdl/domains/Tracing.pdl)
and [IO protocol](https://github.com/ChromeDevTools/devtools-protocol/blob/master/pdl/domains/IO.pdl).
