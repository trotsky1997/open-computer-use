# Harness foundation

The user requested an independent fork and the start of a modern computer-use harness. Work starts from upstream `a7fdec1` on a separate branch, preserving the existing fork's main branch.

The JavaScript `selectText` option is now `selectionType`, matching the currently observed Codex interface; it maps to the existing native `selection` argument. Guidance and the REPL reference use the same name. Existing tests cover all selection modes and input validation in both persistent and worker sessions.

The active harness plan records browser, state-diff, input and platform gaps, along with the validation needed before claiming parity. No native desktop or browser integration was exercised for this change.

AX observations now emit compact contiguous line-replacement diffs when useful,
with explicit unchanged output and a `disableDiffing` full-output option. Return
values remain full snapshots. Baselines track only visible AX output and reset
on screenshots, native failures and session reset. Snapshot option changes force
full output. Tests cover changes, full output, app isolation, silent reads,
screenshot invalidation and native failure recovery.

Validation: all 52 Node REPL, CLI and config checks passed. The staged import
check previously passed its imported file as the entry-point argument, causing
it to launch the server; it now uses the Node executable as the distinct entry
argument. This lets the check validate module import without launching native
GUI tooling. Real desktop and browser validation remain pending.

The REPL now supports an explicitly configured CDP browser: browser/tab inventory,
existing tab bindings, create/close, navigation/history/reload, AX text and PNG
observations. `getState` preserves either inventory when the other fails. The
new module is included in npm and Codex plugin installation paths. Browser input
and extension/in-app browser transports remain open.

Validation: all 55 Node checks passed, shell syntax and diff checks passed, and a
real disposable macOS headless Chrome completed the local-fixture smoke for the
browser surface, including Worker inventory error isolation. The repeatable
runner is `scripts/run-browser-smoke.mjs`; usage and boundaries are recorded in
`docs/browser-cdp.md`.

CDP tab bindings now support element clicks, typeText, pressKey, plain-text paste
and DOM scroll. Inputs revalidate document loader and AX identity. Clicks verify
visibility/occlusion. Screenshot-only observations and navigation discard element
history; combined observation captures the screenshot before refreshing AX.
macOS select-all explicitly sends the Chromium editor command. Unsupported click
options and paste formats fail before dispatch.

Real headless Chrome verified Unicode, select-all replacement, multiline input,
click results, scroll feedback, stale/covered-element refusal and Worker input.
The smoke was extended in place. Browser key mapping has a small focused check;
all 56 Node checks passed. Windows/Linux and headful focus behavior remain open.

CDP tabs now expose setValue and selectText for text controls and contenteditable
regions. Value updates use native control setters, dispatch input/change events
and verify the applied value. Selection rejects missing/ambiguous matches,
supports prefix/suffix and cursor-before/after modes, and verifies the applied
range and unchanged text. Contenteditable ranges span DOM text nodes. Disabled,
read-only writes, detached and unsupported text controls are rejected.

Real Chrome smoke now covers repeated-text disambiguation, missing-text content
preservation, Unicode and multiline selection/replacement, both cursor modes,
cross-node contenteditable selection and read-only rejection. Worker validation
also exercises setValue and selectText. All 56 Node checks and the extended real
browser smoke passed. Structural contenteditable line breaks and untrusted
application event behavior remain documented limits; no cross-platform claim is
made from this macOS run.

CDP pointer input now supports screenshot pixel click/scroll and left-button drag.
Screenshots retain PNG dimensions and loader/viewport geometry. Coordinate input
checks those values, scales pixels to CSS coordinates, rejects invalid bounds,
and consumes the coordinate snapshot after input. Independent-binding scroll
changes are detected. Pointer release is attempted in a finally block. AX-only
input remains independent of screenshot coordinates. Pinch-zoom input is explicitly
unsupported; screenshot capture remains available.

Two real Chrome smoke runs passed coordinate click, pointer-widget drag, coordinate
scroll, missing/out-of-bounds screenshot rejection and independent-binding geometry
invalidation. A focused check covers device-pixel scaling and invalid pairs. All
57 Node checks passed. The smoke cleanup closes leftover local HTTP connections.
HTML drag-and-drop payloads, real high-DPI/zoom coverage, headful focus and other
platforms remain unverified.

Browser bindings now expose Playwright Core locators with strict matching,
actionability waits, frames, chaining, filter/has, and/or composition, all/nth,
text reads, common form actions and rendered snapshots including child frames.
Recipes resolve anew for each operation and survive navigation. timeoutMs maps to
the upstream library's timeout. Actions invalidate prior AX/screenshot history.
Targeted virtual focus enables background frame stability checks, and is explicitly
disabled during normal success/error cleanup. Forced Worker termination cleanup
remains pending and is documented as a known limit.

Pinned playwright-core 1.64.1 and its lockfile were added. npm metadata declares
the dependency; the plugin installer checks/copies it before use. A separate
plugin-directory copy resolved its dependency and performed a live locator read.
Node minimum version is now 22 across manifests and capability reporting. Third
party notices and source setup instructions were updated. The expanded parity
tracking document preserves the remaining browser, native and host requirements.

Real Chrome validated labels/placeholders/roles/test IDs/regex selectors,
checkboxes/selects, ambiguous-match refusal, delayed controls, iframe input,
composition, rendered snapshots and navigation-stable recipes. Background
visibility was restored after successful and failed actions. Existing coordinate
smoke now derives its scale from visualViewport.width so scrollbar width is
accounted for. All 57 Node checks passed, including staged dependency metadata.

Final extended smoke also passed locator recipes retained across Worker calls,
including regex selectors in the Worker realm. Background visibility restoration
was verified on both success and strict-match failure. The remaining forced-Worker
termination gap is explicitly retained in the parity plan.

Worker focus cleanup is now host-owned. Locator actions acquire an exclusive
host-wide target lease through the internal native-request route. The host retains
an independent CDP connection and restores focus on timeout, reset, close and
unexpected exit, including acquisition in flight. Stale Worker responses are
ignored. Cleanup failure retains ownership and stops evaluation; reset can retry
cleanup before creating a replacement kernel. No action is replayed.

The focus registry has two focused checks for in-flight acquisition, ownership,
cleanup failure retention and retry. All 59 Node checks passed. Real Chrome smoke
covers timeout/reset/close/external Worker termination and subsequent session
recovery; cleanup-outage injection additionally checks stopped-session behavior
and successful retry. Application results after cancellation still require fresh
observation, and cross-process coordination remains open.

The browser Playwright surface now includes expectNavigation, waitForURL and
waitForLoadState. Main-frame event listeners are registered before the callback;
URL/load completion is checked afterwards against a shared wait deadline. Action
results and errors propagate, watcher rejections are consumed on disconnect, and
invalid wait options are rejected before invoking the callback. Callback options
are copied before execution. Subframe-only transitions do not complete the wait.

Local Chrome scenarios cover redirect completion, same-document navigation,
already-matching URL, slow document completion, callback failure, URL timeout and
subframe exclusion. Worker scenarios cover callback return values and cancellation
of an indefinite URL wait with subsequent session recovery. All 59 Node checks
passed. Same-URL reload and option rejection were added to the final smoke pass.

The final real-browser smoke passed same-URL reload and pre-action validation in
addition to the navigation and cancellation scenarios above.

The Playwright surface now supports waitForEvent("filechooser") with one-shot
isMultiple/setFiles handles. A readiness barrier covers locator and native input
so event preparation precedes the click. Captured handles retain their connection
across REPL calls. Absolute paths, single/multiple selection and options are
validated before dispatch; interception and connections are cleared after success
or native error. Empty selections are supported.

All 59 Node checks passed. Real Chrome smoke covers single/multiple files,
clearing, relative/missing path rejection, consumed handles, native AX clicks,
event timeouts, Worker handle persistence, timeout/reset recovery and subsequent
file selection. An independent CDP observer confirmed interception was absent on
a later ordinary click after errors/reset. Headful picker presentation and remote
CDP filesystems remain unverified. Download events remain open work.

Download events now return host-owned handles with path(). A browser-context
lease prevents competing watchers in one host. The controller listens for the
selected tab's frames, writes browser GUIDs to private temporary directories,
verifies completion/regular files, restores default download behavior and preserves
completed artifacts across Worker reset/close. Server filenames do not determine
local paths. Cancellation waits for a terminal progress event before restoration;
failed cleanup retains ownership and stops evaluation. Background cleanup failures
also notify the owning Worker.

The internal browser-host request route carries start/wait/path calls. npm and
plugin packaging copy the new controller. Shared page selection was extracted
from the existing locator implementation. Readiness barriers are scoped by event
type, and setFiles awaits download preparation for automatic-download workflows.

All 59 Node checks passed. The dedicated real Chrome download smoke covers byte
contents, untrusted names, repeated path reads, cross-call handles, event timeout,
active reset/cancellation, close, context exclusivity, cancellation-time/asynchronous policy
restore failures with retry, chooser-triggered downloads and artifact persistence.
The existing browser smoke also passed after controller/locator integration.
Remote filesystems, popup ownership, host crashes and artifact retention management
remain open. Chromium default policy is restored; preexisting custom client
policies are not reconstructed.

JavaScript and plugin MCP startup now defer native process creation until an app
request. A failed native initialization reports an explicit error while preserving
JS bindings and browser operation. Concurrent startup shares one connection;
reset/close cancels it without allowing stale failures to clobber a replacement.
Capability reporting checks Node/runtime modules separately from native artifacts,
and the shell adapter launcher no longer requires a native payload before startup.

All 62 Node checks passed, including missing native artifacts, lazy-start
cancellation and MCP binding preservation. A real Chrome smoke exercised native-free
CLI/MCP entrypoints, inventory error isolation and browser field input. Native
subprocess fixtures verified handshake/reuse. Real native desktop behavior and
native-free source installation remain open.

Browser tab.dev.logs now follows the inspected current reference signature with
filter/levels/limit and level/message/timestamp/url records. Host-owned persistent
CDP Runtime observers retain bounded shallow console messages across calls and
main-frame navigation. Cached Runtime.enable history is excluded without comparing
browser and host clocks. Worker reset/timeout/close and tab close release capture;
pending observer startup is closed before host cleanup completes. Direct REPL
sessions register observer disposal on their close event. The browser API's
internal service arguments are grouped into one options object.

All 63 Node checks passed, including malformed log-option rejection. The new real
Chrome console smoke checks formatting, object previews, source URLs, filtering,
retention/text limits, rebinding, separate sessions, navigation and reset/timeout/
close/pending-startup cleanup. Existing browser, download and native-free CLI/MCP
smokes passed. Worker/OOPIF console sources, network logs, uncaught exception events,
host crashes and cross-platform/headful validation remain open. Objects are shallow
protocol previews and messages are bounded to 16,384 UTF-16 code units.

JavaScript dialogs now expose getJsDialog() with type-specific accept/dismiss
handles and observed-identity guards. One host Page observer is shared per
endpoint/tab; input watch/wait/end routes attribute dialogs to the initiating
session and let triggering actions yield while retaining their connection.
Native inputs, locator actions, navigation and file-chooser setFiles share the
boundary. A passive session cannot consume another session's dialog. New tabs
install observers at about:blank before navigation, covering immediate alerts.

Playwright's default dialog dismissal is suppressed. Responses wait for the
triggering connection's cleanup or yield for a sequential dialog, preventing
late disconnects from consuming a later beforeunload prompt. Cleanup dismisses
owned dialogs before releasing focus, using a renderer barrier raced against
new dialog events to drain synchronous continuations. Cleanup failure retains
ownership and stops reuse until reset succeeds. In-process REPL reset/close now
await disposal, with a run barrier and retry of failed cleanup; no cleanup errors
are discarded. Known dialogs prevent blocked page reads or new Playwright setup.

All 64 Node checks passed, including cleanup wait/failure/retry. Real macOS
headless Chrome verified alert/confirm/prompt/beforeunload, immediate and sequential
dialogs, sequential cancellation, Unicode and invalid arguments, stale handles,
raw/locator/file input, session ownership, active tab close, Worker/direct reset,
timeout, close and injected cleanup failure/recovery. Existing browser, console,
download and native-free CLI/MCP smoke checks passed. Pre-binding dialog discovery,
popup/OOPIF dialogs, system prompts, independent processes/external client races,
headful and Linux/Windows validation remain open. Future asynchronous page scripts
remain page-owned; cleanup covers observed active/synchronous dialog continuations.

Browser clipboard read/readText/write/writeText now delegates to Chromium's native
process-isolated headless clipboard. The host requires verifiable headless and
automation startup flags before creating a private loopback control page or grant.
Text/HTML/PNG use the native Clipboard API and editor pipeline, preserving trusted
paste events, sanitization, image validation and browser normalization. Clipboard
contents are browser-process state shared across tabs/VMs and survive JS reset.

Native text/HTML paste writes and dispatches in one endpoint queue, validates the
document loader, and cooperates with owned JavaScript dialogs. macOS copy/cut/paste
editor commands now accompany the shortcut events. Control pages, private-origin
permissions, temporary focus and loopback servers are host-owned; public tab
inventories filter internal targets across in-process controller instances.
Cancellation prevents queued work and late pre-dispatch writes. Teardown waits
for started calls, preserves other live observers' permission grants, and retains
resources on failure until reset retries. Direct source smoke users now dispose
registered runtime resources. npm/plugin packaging and capability module checks
include browser-clipboard.mjs.

All 67 Node checks passed, including payload validation, fail-closed isolation
checks and queued cancellation. Real macOS headless Chrome verified native text,
HTML and PNG, trusted copy/cut/paste, sanitization, native undo and beforeinput
cancellation, readonly/maxlength, password copy protection, hidden bridges, shared
browser contents across VM reset, timeout/close, pre-dispatch cancellation, paste
dialog cleanup, uncertain focus acquisition and injected cleanup failure/retry. The macOS system clipboard's
plain-text hash stayed unchanged without printing its contents. Existing browser,
download, dialog, console and native-free CLI/MCP smokes passed. Headful/CfT
isolation detection, remote bridge access, incognito concurrency, native app paste,
host crashes and Linux/Windows coverage remain open.

Browser capability discovery now exposes viewport set/reset when the CDP schema
has sizing, capture and target-discovery methods. The host leases metrics by
origin, owns discovery and per-page agents, applies narrow/portrait sizes to
existing and new tabs/windows, and clears overrides on reset/timeout/close.
Native window minimum widths led to choosing device metrics, preserving native
DPR and desktop layout without changing window bounds. Screenshot operations
share the metrics-owning agent: separate agents otherwise restore cached default
sizes. A rendered frame commits both sizing and restoration before returning.
Observer loss recovers the idle Worker; cleanup failure retains ownership for retry.

New screenshot({fullPage,clip}) returns JPEG bytes without implicit output. PNG
observations use the same validated region pipeline. Header dimensions and CSS
origins map viewport crops back to pointer coordinates; document/viewport/scroll
checks plus a host revision invalidate stale captures, including resize-back
cycles. Full-page captures require a fresh viewport image before pixel input.
Encoding/capture bounds fail explicitly. Packaging/capability file checks include
browser-viewport.mjs, and the new focused viewport document records API and limits.

All 72 Node checks passed, including schema/argument/header/region boundaries and
cleanup ordering. Real macOS headless Chrome passed at native 1x and forced 2x:
responsive sizing, portrait dimensions, tabs before navigation, external windows
before binding, JPEG emission, full-page/crop dimensions, scrolled crop clicks,
stale capture rejection, lease contention, clipboard integration, reset/timeout/
close, cleanup failure/retry and idle observer disconnect recovery. Existing
browser, download, dialog, console, clipboard and native-free CLI/MCP smokes passed.
Mixed-DPI hardware, browser zoom, headful/Linux/Windows behavior, external-client
emulation, external-page initial script timing and host crash recovery remain open.


### Native MIME / HTML / file drops

Added locator.drop with validated MIME strings, absolute regular files, action
timeouts and padding-box positions. The host owns an origin-wide drag lease;
Playwright supplies fresh actionability checks while native CDP events carry
trusted DataTransfer data. Per-stage native checks cover document loaders,
receiving frames, viewport metrics and sizing revisions. Dialogs suspend the
action deadline for later response. Reset/timeout/close stop remaining stages,
dismiss owned dialogs and cancel dragging before focus restoration. Failed
cancellation retains ownership and blocks session reuse until a reset retry.
Already dispatched page effects can finish. No dependency was added.

Packaging/capability fixtures and both plugin copy paths include browser-drop.mjs.
The focused browser-drop document, runtime API documentation, architecture and
active parity plan record the API and remaining frame/platform gaps.

All 75 Node checks passed. Real macOS headless Chrome verified trusted mixed
MIME/file events, protected data before drop, Unicode bytes, explicit positions,
native rich editor insertion, same-target iframe drops, invalid files,
covered-target action timeout, dialog response after the action deadline,
reset/overall timeout/close before delivery, modal ownership, and cleanup failure
with blocked reuse and reset recovery without replay. Browser, dialog, download,
console, clipboard, viewport and native-free CLI/MCP regression smokes passed.
Cross-process frames reject before delivery; identical sibling URL paths remain
unsupported. Headful/zoom/transformed frames, Linux/Windows, remote file transfer
and host-crash behavior remain open in the full harness goal.


### Cross-process native drop routing

Extended native drops to bind separate frame targets through public Playwright
CDP sessions and host-owned flat CDP attachments. Each stage merges native frame
metadata for the selected ancestry and checks the exact receiving frame ID.
Native hit testing descends iframe content quads into child layout viewports;
DOM hit-test coordinates include each document's scroll offsets. Child visual
viewport dimensions can describe the top-level view, so layout dimensions are
used for the conversion. Native main/receiver loaders and main viewport are
checked again after hit testing. Session resources share the drag connection's
existing cancellation and failed-cleanup retry lifecycle.

All 77 Node checks passed, including child scroll/session routing and rejection
of a changed native child identity before input. Real macOS headless Chrome at
native 1x and verified forced 2x passed the extended drop smoke: cross-process
Unicode file/MIME delivery, same-process children inside separate targets,
nested separate targets, scrolling, identical-URL independently hosted siblings,
and prompt response inside a cross-process drop. Existing action timeout,
reset/close, modal ownership and failed-cleanup recovery checks passed. Browser,
dialog and viewport regression smokes also passed. Runtime documentation,
architecture and the active parity audit now record the supported frame cases.

Ambiguous same-process sibling URL ancestry, frame transforms/zoom, headful and
native desktop/platform verification, remote artifacts and host integration
remain open; the full harness goal stays active.


### Native same-process frame owner binding

Replaced same-process URL ancestry disambiguation with recursive native frame
owner binding. DOM.getFrameOwner backend node identities resolve into an isolated
DOM path; a content-script selector traverses explicit child/shadow-root steps and
public contentFrame() confirms the selected Core frame object. Light/shadow paths
stay distinct even when host indices coincide. Candidate owners are rechecked,
and native objects/Core handles are released before native dispatch. Separate
frame sessions stay available through binding, then detach in cleanup.

Pinned Core 1.64.1 omits registered selector engines when setting up CDP default
contexts: registering publicly after selector injection leaves a missing engine,
and registration before connecting is omitted by server context setup. A scoped
context-channel registration before the first locator supplies this small engine.
The shortcut and its upgrade condition are documented; no dependency was added.

A navigation-during-drop check exposed deferred action errors being swallowed
after dialogs. Watchers now retain the failure, and response calls capture watches
before sending the response so completion during that round trip is reported.
Failures that finish before the response stay attached to the observed dialog.
Initial observation interruptions are handled inside the observation operation,
preserving initial page dialog behavior without reporting a skipped read as a
failed resumed input.

All 79 Node checks passed. Real macOS headless Chrome at verified 1x and forced 2x
passed same-URL sibling and nested-sibling file drops, open shadow owners,
coincident light/shadow host paths, main-world DOM getter poisoning, preserved
frame reordering, sibling non-delivery, and prompt-triggered frame replacement
with an action error and no file delivery. The expanded drop smoke retains nested
process, dialogs, cancellation and cleanup retry evidence. Browser, dialog and
clipboard regression smokes passed. Frame transforms/zoom, headful/native desktop
and broader platform/host integration remain open in the full harness audit.


### Native held-click foundation

Refreshed the live reference contract: native click accepts key and durationMs.
Added macOS PID-posted held input, modifier/ordinary-key parsing, per-press timing
and click-state sequencing. Releases register before downs, run in reverse order
and bypass ordinary action authorization on cleanup. SIGTERM/SIGINT handlers are ready
before the MCP handshake, and app termination releases active held events.
Ordinary app-agent requests now include disconnect cancellation while protected
lease authorization/capture policy stays intact. Normal native AX click behavior
is retained; extended options select app_post, and other explicit routes/fixture
bridges reject them.

The SDK validates options/aliases and checks the backend schema before sending
held fields. Linux/Windows raw endpoints reject unsupported held options before
input. Native process shutdown and lazy replacement now expose an exit barrier;
Worker and source-level session cleanup await it. Browser-only operation remains
independent of native startup. Persistent app-agent drain acknowledgement and
hard-crash recovery remain open rather than inferred from a proxy's exit.

The macOS product builds. Real stdio probes verify held schema fields and
SIGTERM/SIGINT handler exits without GUI input. The no-GUI Swift check links the actual debug objects
and verifies ordinary/modifier key order, click count/timing, reverse release on
cancel/shutdown, validation, and separate cancellation/capture policy. Command
Line Tools lack XCTest, so the full Swift XCTest suite was unavailable. All 82
Node checks passed, including schema rejection, both session types and delayed
SIGTERM replacement. Windows Go checks passed (40); the new Linux guard check
passed, while its full suite hits the existing Linux-only bridge guard on macOS.
The real Chrome native-free CLI/MCP regression also passed.

A compilable independent AppKit fixture and live smoke are included. Preflight
reports the Mac is locked despite existing AX/capture permissions, and no input
was emitted. Real direct/proxy events, background focus/keyboard isolation,
persistent-agent drain, other native platforms and remaining input APIs need
verification/work. No lock or permission settings were changed. Full harness
alignment remains active.


### Browser held-click ownership

Raw CDP click now accepts key/durationMs with validated chords, button aliases
and click counts. The new browser-input module owns the CDP connection, pressed
state, virtual focus and abortable dwell outside the Worker. It gates required
protocol support and checks fresh loader/viewport/content geometry before
presses. It shares an origin pointer lease with native data drops; new raw input
and locator actions reject competing ownership. Reset/timeout/close releases
held input before replacing the session, and failed cleanup retains ownership
and supports reset retry without replaying new presses. Ambiguous focus setup
also retains its lease until restoration succeeds. CLI/npm/plugin copies include
the new runtime module, and the public documentation and parity plan are updated.

Normal prompts can remain open beyond ten seconds and resume through later dialog
responses. Cancellation drains release-triggered dialogs with a bounded loop. A
real draggable-target probe caught cleanup motion starting a new native drag and
swallowing DOM releases. Cleanup now cancels dragging and releases directly at
outside coordinates without an intermediate mouse move. A regression assertion
and the live draggable case cover that correction. Dialog regression also
exposed a delayed AX read emitting into its previous JS evaluation after an
immediate page-load dialog. Observation now reads silently inside the raced
operation and emits only in the still-active caller.

All 86 Node checks passed, including option validation, protocol gating, retained
release failures and ambiguous focus restoration. Real disposable macOS headless
Chrome at verified 1x and forced 2x passed trusted modifier/click sequencing,
per-press duration, ordinary-key typing, prompts held beyond ten seconds,
release-triggered dialogs, draggable cancellation, pointer/drop exclusivity,
reset/timeout/close, failed cleanup and retry, cropped screenshot coordinates
with explicit viewport overrides, and source-level sessions. The generic browser
smoke at the default forced-2x viewport rejected its fixed coordinates outside
the screenshot; that whole suite needs a sufficiently tall viewport. The generic
browser and drop smokes passed at 1x. Dialog and clipboard regressions passed
after the delayed observation output fix; installer/build-script syntax and
whitespace checks passed.

Releases may finish effects of already admitted presses; page changes are not
rolled back. Uncertain acknowledgements can require repeated releases. Headful
and hardware keyboard/focus behavior, browser/host crash recovery, press-key
duration and full keyboard/layout coverage remain open. Native desktop live
verification is still pending normal unlock. The full harness alignment goal
remains active.


### Browser press-key duration

Refreshed the current reference API: tab pressKey accepts optional durationMs,
including modifier-only keys. All raw tab pressKey calls now run through the
existing BrowserInputs host manager, with actual modifier/primary down events,
one chord dwell and reverse key-up. Finite, non-negative duration and the option
shape are validated before dispatch. The generic ownership error now names input
actions because keyboard holds share the origin lease with held clicks and drops.

An optional AX target resolves a validated backend-node ID; DOM.focus occurs
under the host lease before any down. The host checks document identity before
each new key down. Keyboard releases can proceed after a primary key navigates
or scrolls, without imposing the click coordinate geometry guard on keys.
Reset/timeout/close uses the existing release controller; ambiguous key-up
failures retain ownership until reset retry, without replaying new downs. The
public inline API, held-input guide, architecture and parity plan are updated.

All 87 Node checks passed. The focused new check covers option validation,
modifier-only parsing, target focus before downs, navigation during an admitted
primary press, key-up outage, competing input rejection and retry order. Real
disposable macOS headless Chrome checks at verified 1x and forced 2x cover
trusted targeted Shift+A typing
with one character and measured duration, right Shift alone, key-triggered
scroll/navigation, a prompt held beyond ten seconds, release-triggered dialogs,
competing locator input, reset/timeout/close, failed key-up with blocked reuse and
retry, both session types and retained held-click/cropped-raster checks. Generic
browser, clipboard and dialog regressions passed, including default pressKey
calls and trusted copy/cut/paste shortcuts.

No synthetic auto-repeat is generated. Platform auto-repeat, broad xdotool key
names/layouts, headful/hardware focus state, native app press-key duration and
transport/crash ownership remain open in the full parity audit. Native desktop
live work is still waiting for normal manual unlock; that blocker does not stop
independent browser work. Full harness alignment remains active.


### Host turn boundaries and managed tabs

Added BrowserTabs with logical-session ownership distinct from per-turn browser
resources. The host creates targets before handing them to the Worker, discovers
opener ancestry including nested popups, reconciles live target IDs, and closes
unmarked owned pages at turn end. Existing user tabs stay open. markDeliverable
and markHandoff use the last mark for the current turn; resuming clears previous
marks. Final session close leaves marked survivors open and detaches ownership.
JS reset and Worker replacement retain tab ownership until the turn boundary.
The CLI, installer and npm/plugin runtime copies include the new module.

Creation uses a unique temporary blank-page marker, then navigates after host
registration. Lost acknowledgements retain uncertain creation records for retry;
definite CDP errors release speculative records. Empty observers close when
no operation or owned lineage remains. Closing owned targets and creation-error
rollback run through the host so stale JS callbacks cannot close retained pages.
Resource disposal completes before standalone API tabs are closed.

MCP turn-ended notifications now bypass the ordinary request queue to interrupt
an active call, reject earlier queued JS and establish a barrier for following
calls. Idle contexts retain JS variables and browser bindings. Each new turn
gets a fresh resource owner; proxy requests carry their originating async turn
ID, and old callbacks fail before native/browser actions. Retained bindings
re-establish dialog capture lazily. Active interrupted execution, including detached browser actions after a JS
call has returned, loses its Worker context. Cleanup failure blocks reuse until retry succeeds; shutdown reports a
nonzero failure instead of reporting successful cleanup.

All 92 Node checks passed, including popup/mark ownership, uncertain and definite
creation failures, cleanup retry, idle JS persistence, stale native callbacks
and active CPU/queued-call interruption. Real disposable macOS headless Chrome
passed user-page preservation, temporary tabs and two popup generations, latest
marks and re-marking, delayed input/close callback fencing, held-key and viewport
release, tab-close failure with stopped reuse and reset retry, source-session
reset/close, and actual native-free MCP turn-ended interruption. The extended
held-input smoke passed with explicit retention for inspected pages. Generic
browser, drop, dialog, clipboard, viewport and native-free CLI/MCP regressions
passed; their ownership assertions now inspect per-turn resource owners. Build
script/installer syntax and whitespace checks passed. No CI was added.

Direct source-session turn notifications/idle context retention, user takeover
and exclusive claims, extension/in-app transports, browser/host crash recovery
and headful/native/cross-platform verification remain open. Arbitrary Node.js
code remains trusted; proxy lifecycle guards do not sandbox arbitrary scripts.
The complete harness parity goal remains active.


### Source-session turn lifecycle

PersistentJavaScriptSession now exposes endTurn with serialized run calls and
per-evaluation resource ownership. Its browser/native facade rejects ended
evaluations before dispatch. Idle boundaries retain JS variables and browser
bindings; active asynchronous evaluations reject and discard their REPL, and
earlier queued work is fenced by its generation. Source and Worker sessions
share the existing host dispatch and ordered resource release, including stable
logical tab ownership, fresh turn owners, lazy dialog capture and cleanup retry.
No additional transport or dependency was added.

Source timeout results now await reset cleanup, including key releases. Browser
cleanup failures also await the recovery attempt and report a stopped session if
it fails. A failed reset retains context-disposal state so a later successful
turn-end retry rebuilds the context instead of reusing a closed REPL. Ended tab
cleanup is retried before reset clears marks. Embedding and architecture guides,
parity tracking and the active plan document the new entry point and limits.

All 95 Node checks passed. Added source idle-context/stale-native-callback,
active-async/queued-call cancellation and failed-reset/turn-end retry cases. The
real disposable macOS headless Chrome turn smoke passed in source and Worker
modes, including user/owned tab and popup lifetimes, marks, stale input/close
callbacks, detached held input, viewport cleanup, close-failure retry, direct
source reset/close and native-free MCP turn notifications. The source variant
also asserts key-up acknowledgement before a timed-out run returns. Held input,
dialog and native-free CLI/MCP regressions passed. Existing drop and clipboard
smokes now accept --source; both passed with mixed MIME/file/frame flows,
trusted text/HTML/PNG copy/cut/paste, cancellation, failure retry and unchanged
macOS system clipboard. Their default Worker CPU-timeout probes are retained;
the source clipboard variant exercises an asynchronous timeout explicitly.

In-process CPU loops block their own event loop, and context disposal cannot
terminate arbitrary user Node.js timers/promises. Worker isolation remains the
production preemption boundary. User takeover/exclusive claims, crash recovery,
other browser transports, native desktop and broader platform verification
remain open. Full harness alignment remains active.


### Native macOS held key duration

Added pressKey durationMs in the JS app facade and press_key.duration_ms in the
macOS MCP schema/dispatcher/service. Duration must be finite and non-negative;
unsupported key routes and fixture bridges reject explicit duration before app
input. The SDK validates keys/options and checks advertised schema support before
forwarding held fields. Raw Linux/Windows calls also reject duration_ms before
platform input instead of silently ignoring it. Their timed delivery remains open.

Native click and key-only paths now share the same chord scope, private event
source, release-before-down registration and cancellation-aware wait. Whole chords
release in reverse order, including modifier-only keys. Ordinary auto key presses
use the same registry with zero added dwell and retain their normal settle delay.
Graceful shutdown uses the existing signal handlers and native replacement
barrier. No synthetic repeat is generated.

The macOS product builds and the no-GUI Swift check links the actual debug
objects. It checks key duration timestamps, modifier-only/default delivery,
partial cancellation after a modifier or primary down, reverse release, invalid
duration, and service rejection before resolving an app. Existing click and
shutdown/cancellation checks passed. Real stdio probes confirm the extended
press-key schema and SIGTERM/SIGINT exits. All 97 Node checks passed, including
both session classes, option rejection, schema gating and native timeout routing.
Windows Go protocol/model checks passed (41); Linux's two held-option guard checks
passed on macOS. The full Linux platform suite and native Windows desktop were
not run. The full Swift XCTest suite remains outside this Command Line Tools
setup; the assert-based native check is the evidence here.

The live smoke now includes chord/modifier timing and key reset release. An
initial attempt could not resolve the unbundled fixture and sent no input. It now
creates a unique bundled app and binds by bundle ID. Its old nonexistent-app
lookup was also replaced with read-only locked-use status diagnostics before
fixture startup. Current diagnostics report a locked session with AX/capture
permissions present, so the corrected preflight stops before starting a fixture
or input. No unlock or permission settings were changed.

Real native key/click delivery, background focus/keyboard isolation, persistent
app-agent cancellation acknowledgement, more native key layouts, Linux/Windows
held input and broader parity work remain open. Full harness alignment remains
active.


### Tab CDP developer capability

Inspected the live cdp capability contract: send with optional child selector and
command deadline, plus cursor-based readEvents with filters/paging/waits. Reference
probes on an independently created local page confirmed cross-origin child
selectors, denied Browser/Target commands and origin-history rotation. The
reference tab and local server were closed after inspection.

Added BrowserDebugger and tab capability discovery/documentation. The host owns
root connections and related child sessions, routes explicit sessionId/targetId
selectors, and retains bounded per-turn event histories with sequence/cursor,
source, hasMore and truncated. Main-page origin changes evict earlier history and
child bindings. Detached child history remains filterable. HTTP(S) readiness is
checked before dispatch; discovery is abortable and rechecked after await so a
canceled request cannot dispatch later. Invalid preflight can retry after normal
navigation. Reset/turn-end/close cancel readers and close debugger agents. The
installer, CLI staging and npm/plugin runtime copies include the new controller.

The provider has an explicit permitted-domain policy and rejects browser/target/
input controls, global cookie/cache commands, Network cookie-write methods/scope overrides,
certificate overrides and non-HTTP navigation. This policy still requires a
broader reference matrix; the implemented API shape does not establish complete
raw-command parity. Raw commands are trusted developer access, can mutate state
and do not provide read-only evaluation or general rollback.

A command-timeout probe exposed REPL resets triggered merely by an error message
containing timed-out text. Only the actual JS execution-budget timer now requests
reset. An individual CDP deadline preserves variables and the capability handle,
allowing explicit Runtime.terminateExecution recovery of a running page script.

All 103 Node checks passed, including validation, filtered cursor paging, bounded
eviction, child/detach history, origin rotation, pending-read cancellation, late
discovery fencing and command-timeout context retention in both session classes.
Real disposable macOS headless Chrome passed in source and Worker modes: HTTP
guard/retry, Network/Runtime commands, ordinary UI actions while capturing,
event paging/waits/eviction, cross-origin iframe and worker routing, detached
history, origin rotation, explicit termination after command timeout, debugger
pause release and turn/reset cleanup. Both turn smokes and the native-free
CLI/MCP smoke passed. Build-script/installer syntax and whitespace checks passed.
No CI or dependency was added.

Full command-policy/provider coverage, shared/service-worker edge cases, ordinary
read-only page/locator evaluation, other browser capabilities/transports, renderer
and host-crash recovery, native desktop and wider platform validation remain open.
Full harness alignment remains active.

## Page asset inventory and local bundles

Added the discovered tab `pageAssets` capability with `list()` and
`bundle({inventoryId,kinds?,assetIds?})`. Native DOM snapshots, computed CSS URLs,
resource trees and inline SVG markup feed host-owned, tab/turn-private
inventories. Returned inventory objects are detached from saved membership.
Root and cross-origin frame routes preserve browser credentials during resource
export. HTTP(S) files stream through Chrome; data/blob URLs have explicit export
paths. Bundles return individual failures, safe filenames and a JSON manifest.
Navigation fences collection/export, canceled exports remove their directories,
and completed artifacts survive turn/reset/close. Cleanup waits for writes and
connections and retains failed disconnects for retry. Source/Worker dispatch,
capability docs, CLI/plugin packaging lists, architecture and parity tracking
were updated together. CDP error diagnostics now include the failing method.

All 106 Node checks passed. Disposable macOS headless Chrome passed asset
workflows in both session types: computed background images, cross-origin frames,
inline SVG nesting, cold credentialed resources, image/font/stylesheet/media URL
bytes, data/blob streams, default/union selectors, detached inventory mutation,
invalid membership, missing files, stale/during-export navigation, in-flight
turn cancellation, retained completed artifacts and reset. Both turn-lifecycle
smokes and the native-free CLI/MCP smoke passed. Installer/build-script syntax
and whitespace checks passed. The smoke's final cleanup now checks fresh tab
inventory before closing surviving fixture tabs, so already-collected tabs are
not closed twice. A focused missing-target response probe also passed. No new
CI or dependency was added.

An unnecessarily broad native release build was started by the package command
and stopped before completion; native release packaging is unverified this phase.
Media/font fixtures check exported bytes without codec/font rendering claims.
Streaming/DRM media, recursive CSS/unloaded srcset discovery, full provider and
platform coverage, crash recovery, content export and the remaining native/host
capabilities stay open. The full harness goal remains active.


## Read-only page and locator evaluation

Added page `evaluate`, locator `evaluate` and locator `evaluateAll` through a
shared host-owned QuickJS WASM Worker. User source stays in the separate engine;
Chrome runs fixed read-only bridge code in a dedicated isolated world. An
explicit native getter/method schema exposes DOM, styles, geometry and current
form values without page function invocation. Cross-realm reads use trusted
platform descriptors. Playwright's pinned native handle bridge preserves exact
element identity; same-process descendants route through their nearest
process-owning frame ancestor. Empty collection scopes retain the selected frame.
Arguments/results have a tagged data encoding, and local URL helpers and timers
support extraction. Sources, messages, heap and stack have explicit limits.

Deadlines and turn/reset/close terminate the engine and disconnect readers.
Navigation, selected-frame detachment, main renderer crash and tab closure cancel
work. An observed hang had a terminated Worker and acknowledged browser
disconnect while a cleanup protocol wait remained pending; all browser waits now
share the cancellation barrier, including final object-group release. Failed
disconnect retains ownership for retry. Runtime packaging and source plugin
installation now copy the pinned engine, WASM file and transitive production
dependencies. Runtime docs, architecture, active plan and parity tracking were
updated with the API and limits.

Cross-feature smoke also exposed a target closing between discovery and the
close command. Shared tab closure now reconciles protocol errors against a fresh
target snapshot, accepting absent targets and preserving live targets/errors for
retry. Fixture cleanup follows the same outcome check.

All 112 Node checks passed, including typed values, scope validation, missing
protocol-reply cancellation, disconnect retry, real staged WASM loading and both
close-race outcomes. Disposable macOS headless Chrome passed both session modes:
DOM/style/current value/shadow reads under page getter poisoning; exact, strict,
regex and composed locators; cross-origin and nested in-process frames, empty
collections and poisoned same-origin parent reads; local timer cancellation and
URL parsing; live writes/network and function-constructor/module escape attempts;
CPU deadline after a completed native DOM read; navigation, frame detach, renderer
crash and turn cancellation after confirmed interpreter execution; reset/reuse.
Native-free CLI/MCP now exercises read-only evaluation. Asset, CDP and both
turn-lifecycle smokes also passed. Installer/build-script syntax and whitespace
checks passed. No CI was added. Engine modules are pinned at 0.32.0.

The complete native release package/installer was not executed. Broader DOM and
ECMAScript/provider compatibility, automatic crash recovery, content exports,
remaining native/host features and Linux/Windows validation remain open. The
full harness goal stays active.


## Browser namespaces, logical names and native selected tabs

Added browser.tabs list/get/new/selected, fresh tab title()/url() getters and
logical-session naming through nameSession and createBrowserTab sessionName.
Names are validated before target creation, independent across logical sessions,
preserved through idle turns/JS reset and cleared at final close. Provider
guidance emits once per REPL context.

A bundled MV3 Chrome extension reads native active/last-focused-window state and
maps TabID to exact debugger target ID. The host validates extension identity and
protocol and observes a private background extension page for each resource owner.
Normal inventories and viewport overrides exclude private IDs and pending marker
URLs. Cancellation joins pending reads and closes owned targets, retaining failed
cleanup for retry. Missing-extension initialization removes its temporary target
and returns an explicit setup error. Source and Worker share the host service.
Runtime/module checks, npm/plugin asset copying and installer preflight now include
the bridge. User-profile extension installation remains an explicit user action.

Real Chromium regression exposed target-discovery lag after a successful close
acknowledgement. Shared tab closure now waits for the exact ID to disappear with
a bounded deadline, instead of repeatedly closing it and exhausting the popup
cleanup pass limit. Live/unverified failures continue to retain ownership.

All 117 Node checks passed, including manifest identity/assets, name validation
and lifecycle, pending selection cancellation/cleanup retry, private viewport
marker exclusion and delayed target disappearance without duplicate closes.
Disposable macOS headless Chromium 141 passed source/Worker session flows with
and without the extension: duplicate page URLs, native selected identity under
background focus emulation, fresh metadata across navigation, concurrent owners,
hidden viewport/inventory targets, paused-control read cancellation, names across
turn/reset, and missing-extension cleanup. Viewport, source/Worker turn-lifecycle
and native-free CLI/MCP smokes passed. Installer/build-script syntax and whitespace
checks passed. No new dependency or CI was added.

The user browser/profile was untouched. User-profile installation, headful
multi-window/incognito cases, complete native release packaging and Linux/Windows
remain unverified. Full extension/in-app transport, user claims/takeover, content
exports and the remaining native/provider work stay open. The full harness goal
remains active.

## Native browser management and worker bridge

Added the inspected management capability for native windows, tabs, tab groups
and bookmarks, with browser-wide newest-first before-state audit. A shared strict
policy validates host/extension boundaries, rejects navigation and privileged
methods, protects shared/unverified groups and normal non-incognito windows, and
requires explicit moves before grouping across windows. Browser guidance keeps
fresh human confirmation for destructive user actions. Bookmark writes accept
HTTP(S) URLs; the audit stores up to 100 entries/6 MiB in browser-session storage.
A failed before-state write prevents native dispatch; native errors are journaled.

Replaced the permanent selection control page with an MV3 service worker. Host
initialization is serialized, a live worker is reused, and cold-start bootstrap
tabs close before requests run. Private bootstrap URLs include pending native
URLs. This preserves native last-tab/window closure. Pending reads cancel at
turn cleanup; accepted changes drain before disconnect. A lost acknowledgement
releases transport and reports uncertainty for fresh audit/state review. No write
replay or automatic rollback was added. Existing session naming, metadata and
selection use the same browser bridge. Installer, npm copy paths and CLI readiness
checks include every extension asset; the extension now needs Chrome 137+ and
`tabs`, `debugger`, `tabGroups`, `bookmarks`, `storage` permissions.

All 121 Node checks passed. Disposable macOS headless Chromium 141 source/Worker
management smokes cover real window/last-tab closure, pin protection, cross-window
grouping rejection, group moves/metadata, window bounds, bookmark lifecycle,
before-state/result IDs, cross-session audit visibility, JS reset and worker
restart. Worker mode also verifies 32-second idle survival under an attached
debugger. Selection/missing-extension, viewport, dialog, source/Worker turn and
native-free CLI/MCP browser regressions passed. Installer/build-script syntax and
whitespace checks passed. No dependency or CI was added.

The user's browser/profile was untouched. Source development uses fresh owned
profiles because Chrome can retain an older worker script across restarts;
user-profile extension updates remain explicit. Signed-in shared groups,
headful/incognito, browser/host crashes, full native release packaging and
Linux/Windows remain unverified. Complete extension/in-app transports, claims,
history, content exports and remaining native/provider work stay open. The full
harness goal remains active.

## Browser content exports

Implemented the inspected `tab.content.exportGsuite(type)` and
`exportYouTubeTranscript()` interfaces in a shared source/Worker host service.
Workspace routing supports Docs PDF/Markdown/DOCX, Sheets PDF/XLSX/CSV and Slides
PDF/PPTX, preserving document/account/resource-key identity and the current sheet
gid. The hash gid takes precedence over a stale query gid. Native authenticated
Chrome streams preserve file bytes; MIME/signature checks reject login/error
and incorrect or empty binary responses, while accepting valid empty CSV/Markdown. YouTube export uses a current visible
transcript or matching-video watch/caption metadata with strictly first-party
caption URLs and timestamped UTF-8 output. Access restrictions surface explicitly.

BrowserContent reuses the asset stream reader and cleanup ownership while
tracking the main document separately. This fixes real exports interrupted by
unrelated child-frame navigation. Each export uses private temporary files;
completed files survive reset, while failure/cancellation removes partial data
and transcript intermediates. A stopped-promise barrier wraps protocol/DOM waits,
including their deadline timers, so disconnecting a held network read cancels the
host operation promptly. The regression originally exposed a ten-second wait;
after the fix Worker/source reads ended in 4/3 ms in the owned fixture before the
held response ended. Connection cleanup remains acknowledged and retryable.
Shared asset files now also use mode 0600. CLI readiness, installer and both npm
copy paths include the new module. No dependency or CI was added.

All 124 Node checks passed. Source/Worker Chromium fixture smokes passed every
Workspace route, exact payload bytes, native cookie inclusion, file permissions,
JSON3/rendered transcript Unicode, login/signature failures, unrelated child-frame
navigation, main navigation and turn/reset cleanup with retained artifacts.
Fixture provider URLs and native stream transport are routed separately to owned
pages/HTTP frames; this supplies no real-account/provider-auth evidence. Existing
source/Worker assets, source/Worker turn-lifecycle and native-free CLI/MCP browser
smokes passed; installer/build syntax and whitespace checks passed.

Real anonymous macOS headless Chromium 141 exported Google's public Sheets
quickstart sample as CSV (1408 bytes), XLSX (5654 bytes) and PDF (53269 bytes).
The YouTube watch response reported `LOGIN_REQUIRED` and no caption tracks. A
reference API call on a newly created public watch tab returned a transcript file;
that establishes reference behavior, while this implementation's authenticated
YouTube path still needs real-provider verification. The temporary reference tab
and transcript were removed. The user's existing tabs and browser settings were left unchanged. Signed-in Docs/Slides/YouTube, provider-schema fidelity, media locators,
remote delivery/retention, crashes, headful/native desktop, Linux/Windows and the
remaining transports/capabilities stay open. The full goal remains active.

## Locator media downloads

Added `locator.downloadMedia({timeoutMs?})` to source/Worker locator bindings and
the existing BrowserContent host. It resolves the exact native node/frame with
fixed isolated-world getters, handles selected image/picture sources, audio/video,
caption/source elements, embedded media and file links, and downloads credentialed
HTTP(S), data and Blob resources. Replaced/adopted nodes, changed sources and
selected/main document navigation invalidate results. Timeouts default to 120
seconds; zero disables the operation deadline. Each download owns its abort signal
and connection, so a timeout leaves sibling downloads running. Owner turn/reset
cleanup cancels pending reads and removes partial outputs while retaining finished
private artifacts.

The shared asset reader now returns response MIME/header metadata for safe media
names. UTF-8 Content-Disposition metadata precedes download attributes and URL
basenames; paths, device names, control characters and suffixes are normalized.
Data URL files now use exclusive mode-0600 writes, matching HTTP/Blob files.
Extracted shared locator validation/resolution and exact native frame/node helpers
for media and read-only evaluation. Fixed kernel worker startup from programmatic
`node --input-type=module` hosts by using an explicit empty worker CLI-flag list,
as the evaluation worker already does. No dependency or CI was added.

All 127 Node checks passed, including filename/request validation and the real
stdin-module parent/worker regression. Disposable macOS headless Chromium 141
source/Worker media smokes passed credentialed bytes, Unicode names, file privacy,
responsive selection, getter spoofing, data/Blob/audio/video/caption resources,
composed selectors, exact OOP/same-URL/nested frames, strict matching and failures,
node replacement and cross-document adoption, timeout/sibling isolation, frame
navigation and retained-artifact/turn/reset cleanup. An 11-second held response
passed the default media deadline. The fixtures validate resource bytes and do
not assert audio/video playback. Source/Worker read-only evaluation, assets,
content exports, turn lifecycle and native-free CLI/MCP browser regressions passed.

Reference Chrome confirmed first image/file download and server filename priority;
further calls in that tab timed out and Blob was unsupported by that provider.
The temporary tabs and two verified fixture files were removed. Existing user tabs
and settings were left unchanged. CDP media uses private local artifacts; browser
download UI/approval-aware waits, streaming/protected media/provider fidelity,
headful/native desktop, Linux/Windows, crash recovery and remote delivery remain
open. The full harness goal stays active.


## Browser history queries

Added browser.history date/query/limit reads through the shared source/Worker
Chrome bridge. Requests validate options before IO, merge focused native searches,
return the latest matching visit per URL, preserve older-window visit timestamps
and bound result size. Optional history access starts disabled, with explicit
Enable/Remove controls in the extension options. Permission is rechecked before
results return; history rows are excluded from the management journal. Bridge
protocol 3 and installer/CLI assets ship together. No dependency or CI was added.

Per-request cancellation fences each native await and requires worker stop
acknowledgement. Failed cancellation retains ownership for retry; accepted native
reads may finish, while further reads and returned rows are suppressed. Isolated
Chromium 141 source/Worker checks passed synthetic multiple/older-window visits,
OR queries, Date arguments, ordering/limits, permission denial/options state,
deferred-read cancellation and next-turn reuse. Positive fixtures used a separate
required-history manifest copy; production permissions stayed optional. The
fixture profiles were removed. All 132 Node checks and browser selection/lifecycle
and native-free CLI/MCP regressions passed. Native management also passed windows,
tabs, groups, bookmarks, audit retention, worker restart and idle survival.
Real user-profile optional grant/revoke,
reference-provider visit cardinality, headful/platform and broader harness work
remain open. The full goal stays active.


## Native WebMCP capability

Added tab.capabilities.get('webmcp') with fetchTools(), description() and
call(name,input). Native registration objects live in a private isolated world
reused per host/frame, with fresh opaque call names for each listing. Exact native
frame identity supports same-URL child frames and cross-origin OOP frames; denied
child policy is skipped, while top-level denial fails. Main-world API replacement
cannot redirect native discovery. JSON transport limits, native error propagation,
document/turn/endpoint/owner checks and acknowledged cancellation share both REPL
hosts. Navigation returns a null sentinel only after native context destruction
is confirmed; stale bindings require a fresh listing. No automatic replay or
provider-input-schema engine was added. Normal user-intent/confirmation rules
apply to untrusted tools and metadata. Installer, CLI fixtures/readiness and npm
support-module copies include the new host. No dependency or CI was added.

Chrome 156 admitted a same-name replacement through an old native object. The
capability therefore requires Chrome 158+, whose native implementation uses tool
registration IDs; 156 fails explicitly. Official Chrome for Testing 158.0.8127.2
source/Worker fixtures passed raw Unicode/string results, same-URL/OOP discovery,
main-world spoofing, denied child policy, guessed names, provider validation
errors, replacement/old-turn/navigation rejection, native abort signals, empty
listings and a declarative form's synthetic submission/navigation. New-browser
HTTP startup initially waited on a real macOS keychain read; stack sampling
identified that wait, and a fresh test-keychain profile completed real HTTP
workflows. Normal browser/keychain settings were left unchanged.

All 137 Node checks passed. Existing native-free CLI/MCP and source/Worker
read-only evaluation regressions passed on Chrome 158, including mutation/escape
rejection, CPU deadlines, renderer crash and turn/reset cleanup. Reference
read-only echo probes verified description/opaque-name/raw-string shape, and
temporary reference tabs were closed. Automatic tool notifications, real consent
interaction, headful/platform/crash/external-site WebMCP coverage, transport,
claims/takeover and native desktop work remain open. Keep the full goal active.


## Native computer platform and explicit launch

Added local computer.target and the optional Linux/Windows
computer.launch_app({app}) JS method, leaving macOS launch in getApp as inspected
in the reference API. The property does not start native MCP. The new native Go
tool is advertised through Linux/Windows schemas and accepts one literal
executable name/path, with bounded validation and direct process execution.
Unknown options and command-line inputs fail. Linux starts an independent session
with desktop environment discovery; Windows selects detached/new-group process
flags. Stdio stays outside the MCP pipe, and launched apps outlive native/REPL
cleanup. Child exits are reaped while the peer is alive. Backend errors and missing
advertised capability propagate explicitly, without launch replay. Native core
tool counts/docs/fixtures were updated. No dependency or CI was added.

All 139 Node checks passed. The Linux Go suite passed natively in an arm64 Ubuntu
VM; a host macOS attempt hit existing Linux-only bridge checks. Private D-Bus/Xvfb
source/Worker GTK tests verified exact spaces/Unicode/$() executable paths, zero
extra arguments, stdout isolation, independent session, AX readiness and survival
through turn end, native replacement, reset and final close. Test apps and private
desktop resources were cleaned up. Windows common Go tests passed on macOS and
amd64/arm64 Windows binaries compiled; real Windows UI/job/console persistence
remains unverified. Desktop IDs/display-name launch, remote native executor
identity, window-ID binding and remaining native/harness/platform work stay open.


## Linux window identity foundation

Added listWindows()/getApp({windowId}) through advertised Linux native discovery
and binding tools. Opaque numeric IDs derive from AT-SPI connection/object paths
and process-start identity; app bindings keep the full tuple and reject closed
or replaced windows. Window selectors remain case-sensitive and native snapshots
stay separate from generic app/PID aliases. Element object paths restrict
semantic actions to the chosen window; removed objects have no name/geometry
fallback. Snapshot AX omission preserves sibling bound caches, and tree traversal
is bounded against cyclic providers. No library dependency or CI was added.

Private arm64 Ubuntu GTK source/Worker flows passed same-title windows in one
process, equal index/independent writes, widget replacement, closed/recreated
window rejection, reordered children and stable identities through peer/turn/reset
replacement. Bound image capture reports unavailable, preserving sibling indexes.
Existing desktop-crop capture cannot prove an occluded window's pixels, so it is
excluded from this new route; physical pointer routing also stays unavailable,
and keyboard fallback checks selected-window native focus before global input.
These remain required image/input work. Wider Linux providers, Windows binding,
Wayland/headful, transport/claims and full native parity stay open.

The final revision passed 140 Node checks, 39 Python checks and 46 native Linux Go
checks, plus both session modes' multi-window GTK flow and the earlier native
launch/lifecycle GTK regression. Owned test apps and private VM work files were
removed. The full harness goal remains active.


## Linux focused and indexed text verification

Implemented `app.typeText(text, elementIndex?)` through JS capability discovery,
Go schema/index validation and exact AT-SPI object identity. Omitted indexes use
active-window focus. Native caret/selection offsets preserve surrounding text;
Unicode insertion supplies UTF-8 byte length. Read-only and replaced fields fail
before editing, and attempted edits never replay through global input. Protected
fields skip content reads, validate length and reject partial selections. Inspect
results before retrying an error after a provider edit/caret update.

Passed 141 Node checks, 42 Python checks and the Linux Go suite (39 top-level
checks plus 8 subchecks) on arm64 Ubuntu. Both REPL modes passed private GTK text,
window-identity and launch/lifecycle flows, including consecutive multiline edits,
focus omission and inactive/read-only/stale rejection. No dependency or CI added.
Broader providers, rich-text formatting, concurrent edits, Wayland/headful,
`typeCharacters`, paste and remaining native image/physical/Windows work stay open.
The full harness goal remains active. See [text input](../../linux-text-input.md).


## Linux printable-key input

Implemented Linux-only `app.typeCharacters(text)` and native `type_characters`.
Printable Unicode is validated before input, each code point uses AT-SPI SYM,
and active-window descendant focus is checked before every key. Empty input
returns zero. The result counts native synthesis acknowledgments; failures stop
with the confirmed prefix count and never replay through paste/semantic edits.
The GDK-free keysym mapping now handles Unicode code points above Latin-1.

Passed 142 Node checks, 44 Python checks and the Linux Go suite (40 top-level
checks plus 8 subchecks) on arm64 Ubuntu. Both REPLs passed private GTK tests
for exact non-editable DrawingArea press/release events, uppercase, spaces,
punctuation, Latin accents, Chinese and emoji, plus empty/inactive-window cases.
Existing text, window-identity and native launch/lifecycle flows also passed.
The private D-Bus activation environment must include Xvfb DISPLAY/XAUTHORITY:
without it AT-SPI acknowledged synthesis while the receiver saw no events.
Receiver-side assertions now expose this setup failure. Test apps and private
VM work files were cleaned up; no dependency or CI added.

Wider keymaps/IME/compositors and physical focus races remain limitations. Paste,
native window images/pointer, Windows and the full harness goal remain open.
See [Linux text input](../../linux-text-input.md).


## Linux verified text selection

Added the existing `app.selectText(index, text, options)` API to Linux through
capability discovery, schema validation and exact AT-SPI field identity. Literal
prefix/suffix context disambiguates every occurrence, including overlaps. Native
Unicode code-point ranges support selection and before/after caret modes;
unchanged text and native ranges are verified around writes. Missing/ambiguous,
protected, stale and unsupported fields fail without global-key fallback.

Passed 143 Node checks, 46 Python checks and Linux Go's 41 top-level checks plus
8 subchecks on arm64 Ubuntu. Both REPLs passed real GTK contextual repeated-text,
astral/multiline selection, replacement, both cursor modes and stale rejection,
alongside existing text/key, window identity and launch/lifecycle regressions.
Provider refusal, wrong ranges and concurrent text changes have focused checks.
Private test processes and VM work files were removed. No dependency or CI added.

Clipboard paste still needs native ownership/MIME/lifecycle implementation.
Wider text providers, Wayland/headful, window images, physical routing and Windows
remain open under the full active goal. See [Linux text input](../../linux-text-input.md).


## Linux X11 session-owned clipboard paste

Implemented `app.paste(text, {format?})` and native `paste` with text, literal
Markdown and original HTML MIME plus simple plain-text fallback. An embedded
GTK provider owns the clipboard per native session, validates Unicode/size and
format, checks target-window focus before clipboard ownership and Ctrl+V, then
waits for a payload request. Errors/transfer timeout are explicit and never
replay through semantic editing. Linux replaces the clipboard and does not
restore its earlier contents. Wayland/native platform work remains open.

The Go service bounds helper waits, removes loaded temporary source files,
serializes ownership and reaps the helper on CLI/MCP exit or pending termination.
The shared JS native peer permits EOF cleanup before bounded SIGTERM/SIGKILL.
This fixes an observed reset race where native exit preceded helper exit.
A stale clipboard callback cannot finish a newer paste generation.

Passed 145 Node checks, 49 Python checks (46 runtime + 3 clipboard), and Linux
Go's 43 top-level checks plus 8 subchecks on arm64 Ubuntu. Source/Worker GTK flows
verified multiline Unicode, empty payloads, literal Markdown, original HTML MIME
and plain fallback, inactive focus, transfer timeout/recovery, external copying,
helper reuse, idle/pending reset, CLI exit and final close. Existing text/key,
selection, window-identity and launch/lifecycle flows also passed. All owned
fixtures, helpers and private VM work files were cleaned up. No dependency or CI
added; GTK/GdkX11 GI is the native platform prerequisite.

Real rich-text app rendering, alternate paste shortcuts, broader keymap/IME,
clipboard-manager behavior, external focus races and hard-kill/platform failure
coverage remain limited. Full native images/physical routing, other native
platforms and remaining harness requirements stay active. See
[Linux paste](../../linux-paste.md).


## Verified visible-window X11 screenshots

Added native focus/PID/frame/stacking verification and RGB PNG capture for local
noncomposited X11 windows. The selected AT-SPI object/process identity, unique
geometry and sole active-window state are checked before/after capture. A private
Xlib connection freezes stacking only while checking/copying pixels, then frees
native allocations and releases the server before PNG encoding. Node/depth/pixel
and between-request time budgets reject excessive work. Composited, shaped,
mixed-depth, ambiguous, background, occluded, offscreen and unsupported routes
return no image. Blocking native requests still use the bridge's outer timeout.

Both ID and string bindings now use these checks. Removed the unchecked legacy
desktop crop and black-content heuristic, allowing valid all-black window PNGs.
No focus or stacking transfer is performed to obtain an image. The GTK/AT-SPI
probe and upstream source confirmed no native XID mapping via window attributes
or Accessible.get_id, so background/backing-store and compositor/Wayland capture
remain explicit requirements under the full active goal.

Passed 145 Node checks, 55 Python checks (47 runtime, 5 X11, 3 clipboard), and
Linux Go's 43 top-level checks plus 8 subchecks on arm64 Ubuntu. Both REPLs read
actual red/blue pixels from same-title native windows, reject background,
occluded/offscreen/closed handles, recover after exposure and accept an all-black
window. Focus/PID/compositor/shape/depth checks, server release, allocation free,
PNG channels/CRC, ambiguous provider geometry and changed state have targeted
checks. Existing paste, text/key/selection, window identity and launch/lifecycle
GTK flows also passed. Owned fixtures and private VM work files were cleaned up.
No package dependency or CI added; X11/Shape shared libraries are prerequisites.

Headful/decorated/composited desktops, Qt/Electron, backing-store images, Wayland,
other native platforms and physical routing remain open. See
[verified window images](../../linux-window-images.md).


## Verified visible X11 coordinate/index clicks

Added basic left/middle/right XTest clicks and counts 1..3 through the existing
app.click API. Shared frame verification checks AT-SPI identity/state/geometry,
native focus/PID/stacking and supported local X11 bounds. Pointer placement is
checked against its native recipient; active core buttons, action modifiers,
input-only interception and existing pointer grabs prevent sending a button.
Lock modifiers are classified from the native map without changing their state.
The verification server grab is released before delivery so passive grabs can be
replayed. Every attempted press has a release attempt; unconfirmed input stops
without replay. Legitimate popup/closure after delivery is allowed.

Indexed fallback uses exact current objects, visible/showing state and fresh
positive geometry. A single left auto click uses a usable accessibility action;
a failed attempted action is never retried as pointer input. Non-Action nodes
are no longer queried through the Action interface. Native malformed index,
button and count arguments are rejected before the bridge. Explicit global keeps
its existing opt-in flag; drag/held/chord and other platform routes remain open.

Passed 145 Node checks, 64 Python checks (51 runtime, 10 X11, 3 clipboard), and
Linux Go's 44 top-level checks plus 8 subchecks on arm64 Ubuntu. Both REPLs passed
real receiving-widget coordinates, three buttons, double/triple sequences and
paired releases; input-only/active-grab, inactive/occluded/outside/stale rejection;
and normal GTK context-menu creation followed by blocked pointer input. Existing
image, paste, text/key/selection, multi-window and launch flows also passed.
The fixture keeps hidden temporary grab surfaces until process exit after transient provider/lifetime failures
during GTK teardown; owned processes/resources
were fully cleaned up. No package dependency or CI added; XTest is a system
library prerequisite.

Clicks visibly move the pointer. Hardware/UI changes can race sequential checks,
and hard interruption or withdrawn XTest support can prevent release confirmation.
Real window managers, concurrent users, compositor/Wayland/background input,
complex clipping, drag and long-press/chord behavior remain unverified/open.
The full harness goal remains active. See [Linux click input](../../linux-click-input.md).


## Linux native-operation cancellation

Propagated MCP/CLI signal contexts to one-shot Python runtime calls, with SIGTERM,
500 ms forced-kill fallback and child reaping. Linux parent-death SIGTERM is tied
to a locked creating OS thread. Explicitly launched apps keep their independent
lifetime. Operation JSON now uses stdin instead of temporary payload files.
Python cancellation bypasses ordinary fallback handlers; short key/pointer groups
finish releases, multi-click stops before another pair, and drag cleanup releases
at its last attempted position. Clipboard source bundles include the new module.

Source and Worker GTK checks verify gated input cancellation on reset/close,
no delayed edit, surviving launched app, and fresh successful input after reset.
CLI SIGTERM and parent SIGKILL checks verify stopped children and stdin payloads;
Go checks cooperative and SIGTERM-ignoring child reaping. Hard interruption cannot
confirm release or roll back accepted UI effects and may leave source files.
See [native cancellation](../../linux-native-cancellation.md).

Validation passed: 145 Node checks; 67 Python checks (53 runtime, 11 X11,
3 clipboard); 45 Linux Go top-level checks plus 10 subchecks; both REPL modes
for cancellation and all six existing GTK controllers; CLI SIGTERM/SIGKILL
lifecycle probes. Owned processes and private VM work files were cleaned up.
No dependency or CI added. macOS/Windows and physical/Wayland cancellation remain
unverified; the full harness goal stays active.


## Verified Linux X11 within-window drag

Replaced the legacy AT-SPI global drag and bound-window rejection with one XTest
route through shared click preflight. Both endpoints are checked before pointer
motion; the native frame, expected previous position and held-button/modifier
state are checked between steps. Each attempted press has a release attempt on
failure/cancellation, at the current position, with no replay or endpoint jump.
Go rejects malformed/nonfinite coordinates before starting the bridge. Tool help
and current lifecycle/click documentation reflect the new path.

The GTK fixture records actual held motion and press/release positions. Both
REPLs verify bidirectional endpoints, sibling-window isolation, outside/omitted/
inactive/occluded/input-only/grab rejection and receiver releases during gated
mid-drag reset/close, plus a fresh post-reset drag. Targeted checks cover mapping,
failed press/motion, changed frame/pointer and cancellation cleanup. The gated
runtime wrapper normalizes argv before runpy; no production test gate was added.
See [X11 drag](../../linux-drag-input.md).

Validation passed: 145 Node checks, 70 Python checks (53 runtime, 14 X11,
3 clipboard), 46 Linux Go top-level checks plus 10 subchecks, both CLI process
lifecycle probes, and both REPL modes across all eight isolated GTK controllers
(drag, click, image, paste, text, window, launch and cancellation). Owned processes
and private VM files were cleaned up. No dependency or CI added. Physical devices,
real window managers, compositors/Wayland, cross-window drag/drop, long-press/chords
and broader platform behavior remain open. The full harness goal remains active.


## Linux held clicks and chords

Advertised click key/duration_ms through the existing JS facade. Held options
bypass semantic actions and use verified X11 auto/global input. Keysyms resolve
through the current primary native keymap, modifier masks come from its map and
existing logical pressed keys prevent startup. Duplicate keys are held once;
unknown/shifted-only mappings and lock keys are rejected. Mouse dwell and later
clicks recheck frame/pointer/key/modifier/button state. Failed sends/cancellation
attempt mouse release then every owned key release in reverse order. The native
operation allowance includes requested total dwell with timer-range validation.

Both REPLs passed receiving GTK timestamps/modifier state, modifier-only and
ordinary-key chords, double-click ownership, duplicates, zero dwell, invalid
rejection, mid-hold reset/close and fresh global input. Targeted checks cover
mapping/keyboard bits, preexisting-key rejection, release failure and bridge
validation. Updated facade help, native schema and current input/cancellation
notes. Linux pressKey duration, Windows held input and broader physical/Wayland/
provider verification remain open. See [held clicks](../../linux-held-clicks.md).

Validation passed: 145 Node checks, 75 Python checks (54 runtime, 18 X11,
3 clipboard), 46 Linux Go top-level checks plus 10 subchecks, CLI SIGTERM and
parent-death probes, and both REPL modes across nine isolated GTK controllers
(held clicks, drag, click, image, paste, text, window, launch, cancellation).
Owned processes and private VM files were cleaned up. No dependency or CI added.
Wider layouts/IME, real window managers/hardware, background/composited/Wayland,
Linux pressKey duration and Windows held input remain open. Hard interruption
cannot confirm releases or roll back accepted effects. The full goal stays active.


## Linux timed pressKey and shared key ownership

Advertised press_key.duration_ms through the existing JS facade. Explicit timed
keys use verified active exposed local X11 focus, native primary key/modifier
mapping and logical input-state checks without pointer synthesis. AX-only state
is sufficient. Modifier-only/ordinary chords, duplicate keys and zero duration
are supported. Normal AT-SPI key delivery remains the no-duration path. Both
click and timed keys share one attempted-down registry and reverse-release scope;
XTest extension setup is shared. Invalid duration/method/timer range fails before
input. Existing session cancellation and duration-aware native deadlines apply.

Both REPL modes passed real GTK key timing/reverse releases, AX-only operation,
inactive/occluded/invalid rejection and mid-hold reset/close releases, followed by
fresh successful input. Targeted checks cover no pointer synthesis, partial-down
failure, changed frame, cancellation cleanup and no legacy replay after verified
failure. Wider keymaps/IME, background/composited/Wayland and Windows behavior
remain open. See [timed keys](../../linux-held-clicks.md#timed-presskey).

Validation passed: 145 Node checks, 79 Python checks (55 runtime, 21 X11,
3 clipboard), 46 Linux Go top-level checks plus 10 subchecks, CLI SIGTERM and
parent-death probes, and both REPL modes across ten isolated GTK controllers
(timed keys, held clicks, drag, click, image, paste, text, window, launch and
cancellation). Owned processes and private VM files were cleaned up. No dependency
or CI added. Wider layouts/IME, real window managers/hardware, background/
composited/Wayland and Windows input remain open. Hard interruption can prevent
confirmed releases; accepted effects remain applied. The full goal stays active.


## Linux coordinate and exact indexed wheel scroll

Removed the focused PageDown/arrow path, which ignored the supplied element.
Both index and screenshot point now use shared click/scroll fresh pointer target
resolution plus verified native X11 frame/pointer routing. Four wheel directions
use paired XTest button events, per-pair checks and cancellation release without
keyboard fallback. Native/JS boundaries validate finite pages/coordinates,
directions and target exclusivity. The facade discovers coordinate capability
from native schema; other platforms retain indexed calls.

Pages use an explicit 12-native-wheel-step approximation with fractional rounding;
actual displacement remains toolkit-dependent, with precise pixel/smooth/paging
calibration open. The fixture wraps its existing notes view in a real GTK
ScrolledWindow and records wheel recipients/root coordinates and adjustment
positions. Both REPLs passed actual offsets on both axes independent of keyboard
focus, fractional/default counts, AX-only indexed use, invalid/intercepted/grabbed/
occluded/inactive/stale rejection and reset/close stop plus fresh input. Targeted
checks cover routing, schema rejection, invalid arguments and failed/cancelled
press release. See [verified scroll](../../linux-scroll-input.md).

Validation passed: 147 Node checks, 83 Python checks (56 runtime, 24 X11,
3 clipboard), 47 Linux Go top-level checks plus 10 subchecks, CLI SIGTERM and
parent-death probes, and both REPL modes across eleven isolated GTK controllers
(scroll, timed keys, held clicks, drag, click, image, paste, text, window, launch
and cancellation). The final scroll check explicitly confirms the Entry retains
focus. Owned processes and private VM files were cleaned up. No dependency or CI
added. Precise pixel/paging calibration, wider providers/hardware/window managers,
background/composited/Wayland and other-platform coordinate routes remain open.
The full harness goal stays active.


## Browser-only source plugin installation

Added --browser-only to skip native lookup/build/payload requirements and
--codex-home for an explicit isolated destination. Node.js 22+ and declared npm
dependencies are required. The installer stages complete runtime assets and
patched config before replacement, retains a prior cache for rollback, publishes
config by same-directory rename and preserves existing config symlinks. Native
payload/default mode behavior remains available; browser-only reinstall removes
that version's previous payload. Unsafe version path names are rejected. CLI
help and source installation instructions now expose the options.

An owned temporary installation controller blocks native builds and checks missing
dependencies, denied config publication rollback, unrelated config, idempotence,
config symlinks and native/browser mode replacement. It hides the source checkout
before initializing installed MCP JavaScript. macOS also passed real disposable
Chrome browser inventory/native-error isolation, field input and installed
QuickJS DOM evaluation in both session modes and through the installed launcher.
Linux passed installer and installed MCP JavaScript checks, then the same real
installed browser flows after supplying its missing libasound system library.
That Linux flow exposed an unhandled native stdin EPIPE: the peer now handles
pipe errors, closes/reaps the lease and rejects pending requests without aborting
unrelated JavaScript/browser work. Updated old generic test backends to advertise
the Linux text/selection capabilities they implement. A stream-error regression
check covers the fix. No real user Codex
home, normal browser profile or native desktop was modified. See
[browser-only installation](../../browser-only-installation.md).

Validation passed: 149 Node checks on macOS; 148 passed and one platform skip on
arm64 Linux. Both platforms passed staged source installation, missing dependency
and denied-config rollback, config/symlink/idempotence/mode switching, installed
MCP JavaScript after source removal, and real disposable Chrome input/QuickJS DOM
evaluation in both session modes plus the installed MCP launcher. macOS also
passed against clean npm ci --ignore-scripts dependencies. Owned browser profiles,
processes and private VM test files were cleaned up; only the VM's browser runtime
system prerequisite remains installed. No project dependency or CI added. Native
Windows, actual Codex reload, concurrent/crash recovery and separately published
native-free npm artifacts remain open. The full harness goal stays active.


## Browser-only npm artifact

Added --browser-only staging with a distinct default dist/npm-browser directory,
manifest flavor marker and native-free payload. It skips native builds/bundle
verification without requiring --skip-build. Default full-package behavior stays
available. Browser mcp exposes js/js_reset; full packages retain native mcp and
both flavors provide explicit js-mcp. CLI capabilities/help/version and plugin
installation reflect the package mode. No project dependency or CI was added.

The isolated assert controller builds/packs/installs the actual tarball into local
and global prefixes, blocks native toolchains, checks aliases/metadata, JS/REPL/
reset, both MCP entries and browser-only plugin installation, then hides source
and staging directories. A controlled full-package fixture checks explicit JS MCP;
a unit check verifies default native MCP forwarding. Real disposable Chromium
input and QuickJS DOM evaluation passed through source/Worker session classes,
installed CLI and MCP for both npm layouts on macOS and arm64 Linux.
151 Node checks passed on macOS; Linux passed 150 with one macOS-only skip.
See [browser-only package](../../browser-only-package.md).

No registry publication or real user profile/config modification was performed.
Node 22 minimum, Windows runtime, actual Codex reload and broader transport/native
parity remain unverified. The full harness goal remains active.


## Linux desktop application launch

Extended explicit launch_app with installed desktop IDs, .desktop file paths and
exact executor-localized display names. Existing executable inputs retain
LookPath/no-argument startup precedence. GIO owns XDG registry lookup, configured
Exec field codes and desktop activation; ambiguous names return candidate IDs,
and hidden/missing/invalid entries fail without replay. The embedded GI helper
uses the existing native deadline/cancellation path. Spawned apps have independent
sessions and detached protocol stdio. Shared JS/native instructions, schema,
architecture, lifecycle docs and parity tracking now describe Linux resolution.
No project dependency or CI was added.

Validation passed: 151 Node checks on macOS; arm64 Linux passed 150 with one
macOS-only skip, 47 Go top-level checks plus 10 subchecks, and 83 Python checks.
Both source and Worker sessions passed real GTK starts by executable, desktop ID,
exact display name (including slash) and desktop file path. All eight successful
starts preserved literal Unicode/$() paths, desktop %c/%k/%% expansion and omitted
no-URI %f/%u codes, private stdio, independent sessions and AX readiness across
turn end/native replacement/reset/close. Duplicate names, Hidden entries, missing
IDs and missing executable definitions were rejected without launching the
fixture. Checks used owned temporary XDG registries and D-Bus/Xvfb desktops;
normal desktop registrations and user settings were untouched.

See [native lifecycle](../../native-lifecycle.md). D-Bus activation, terminal
entries, broader registry/locale precedence, native Windows and the full remaining
harness parity goal stay open. The full goal remains active.


## Acknowledged Linux D-Bus application activation

A real DBusActivatable GTK service exposed a delivery bug in the short-lived GIO
helper: the service process started, but Activate was not received before the
helper exited. Desktop D-Bus entries now use the standard well-known name/object
path and synchronous GIO Activate call, validate the bus name and wait for its
unit reply within 25 seconds/the native operation deadline. Missing/refused
services return errors without Exec fallback or automatic replay. Non-empty
native request startup IDs/activation tokens are sent as standard platform data.
Normal executable/Exec starts retain independent sessions and detached stdio;
D-Bus services retain their service manager lifecycle/environment.

Added one owned-registry/private-D-Bus/Xvfb GTK controller with a real activated
service, deliberate error/pending-reply endpoints and an Exec fallback marker.
Both JS hosts verified entries without Exec, ID/name activation, four real
Activate receipts on the same service PID, changed per-request startup/token
values, AX readiness after turn/native/reset/close, refused/missing/invalid-ID
errors, hyphen-to-underscore object routing, and no fallback execution. Reset and
close during a pending Activate reaped the actual bus-reported helper PID and
preserved the service PID/activation count. The original eight executable/desktop
GTK launch flows also passed. macOS passed 151 Node checks; arm64 Linux passed
150 with one macOS-only skip, 47 Go top-level checks plus 10 subchecks, and 83
Python checks. No dependency/CI or normal user desktop registration changed.

See [native lifecycle](../../native-lifecycle.md). Terminal entries, real compositor
activation-token/focus behavior, broader registry/locale/platform coverage and
remaining harness parity stay open. The full goal remains active.


## Early browser dialog capture and popup ownership

Browser/tab discovery now starts one shared endpoint observer with page-only
flattened auto-attachment. Newly attached targets retain their startup wait until
the same capture session enables Page events or receives a dialog-opening event;
then Runtime.runIfWaitingForDebugger is dispatched without blocking on a modal
renderer response. This closes the second-connection/initial-navigation race.
Native opener identity routes a popup dialog to the nearest active action's
session and preserves completion/error reporting across the target boundary.
Passive inventory owners do not dispatch dialog responses on cleanup; binding
promotes ownership and repeated inventory keeps that promotion. The last owner
releases auto-attach/root connections. Capture-session identity fences stale
messages, and an observer disconnect fails discovery until reset recovers.

Validation passed: 152 Node checks on macOS; arm64 Linux passed 151 with one
macOS-only skip. Both platforms and JS session hosts passed real pre-binding
prompt capture after getBrowser, synchronous popup prompts, Unicode responses,
competing-owner rejection, passive cleanup, root outage/reset recovery and owned
popup dismissal during reset/close without a captured dialog handle. The existing
real alert/confirm/prompt/beforeunload, sequential/input/filechooser and cleanup
failure-recovery dialog smoke passed on both platforms. macOS also passed the
broader browser smoke (input, screenshots, clipboard, navigation/event waits,
filechooser and stale state) and actual local/global npm tarball installation,
installed CLI/JS sessions/MCP browser flows. The tested browser-only tarball was
refreshed locally; no registry publication occurred. No dependency or CI added.

See [browser CDP](../../browser-cdp.md). A raw CDP probe confirmed that a dialog
already open before observer startup delays Page.enable without replaying its
opening event. That boundary, broader frame/provider/extension/headful behavior,
external-client coordination and native Windows remain open. The full harness
goal stays active. All browser profiles/configs/targets were owned fixtures.


## Retained dialog cleanup after capture loss

Closed CDP connections now reject new requests immediately, including calls with
no deadline. A failed dialog response retains a replacement observation/control
connection for renderer verification, later events and retries. Late callbacks
from replaced connections are identity-guarded. Cleanup ownership carries into
synchronous follow-ups and is cleared after each attempt.

A real active-dialog disconnect reproduced the Chromium PageHandler boundary:
dialog callbacks belong to the observing session, so a new handler can report no
callback while the old dialog still blocks renderer progress. Cleanup now waits
for renderer progress or a new dialog event before discarding that captured
identity. Failure returns an explicit unconfirmed-cleanup error, retains dialog
and owner, and blocks further JS reuse. Existing native/browser controls or a
surviving observer can close the old dialog; the retained observer captures
follow-ups and reset retry can then release dialog/input/focus resources. This
step establishes safe recovery boundaries; automatic sole-observer callback
takeover remains open in the full harness goal.

Validation passed: 153 Node checks on macOS; arm64 Linux passed 152 with one
macOS-only skip. Both JS hosts and platforms passed real first-reset failure with
identity/ownership retention, blocked JS reuse, surviving-observer dismissal of
the first dialog, capture and automatic cleanup of a second synchronous prompt,
reset retry, AX/locator readback and final resource release. Existing early/popup,
alert/confirm/prompt/beforeunload, stale-handle and cleanup-failure recovery smokes
also passed on both platforms. A focused closed-transport check verifies immediate
rejection of no-deadline calls. macOS local/global npm tarball installation and
installed browser CLI/JS/MCP flows passed; the local browser-only tarball was
refreshed without registry publication. No project dependency or CI added.

See [browser CDP](../../browser-cdp.md) for the owning Chromium source and runtime
limits. Headful native recovery, sole-observer takeover, external-client
coordination, broader frame/provider and Windows behavior remain unverified.
The full harness goal stays active. Checks used only owned browser profiles,
local fixture pages and an explicitly created surviving observer.


## Native frame attribution for popup downloads

Selected-tab download waits now include newly opened descendant popups. A raw
startup observer is injected through the existing host/API transport and uses
native opener IDs, browser-context equality and a baseline target inventory to
exclude old/unrelated windows. Native Page frame events/trees prove frame
ownership. Bounded unmatched event metadata preserves terminal progress when
frame discovery arrives later; filenames and local artifact handling retain the
existing GUID/regular-file validation. Context exclusivity, cancellation and
default policy restoration remain in the existing path. Observer shutdown drains
startup work and disables auto-attach before closing its transport.

A real direct-popup download exposed an initialization deadlock: waiting for
renderer enable/frame-tree replies before resuming the new page prevented its
navigation. Page-domain events now prove capture readiness in the dialog and
download observers, and frame discovery proceeds asynchronously after startup
resume. This preserves native identity proof without guessing frame IDs.

Validation passed: 155 Node checks on macOS; arm64 Linux passed 154 with one
macOS-only skip. Both JS hosts/platforms passed direct attachment, scripted and
nested popup download bytes, old-window and unrelated new-window rejection,
observer disconnect/reuse, active reset/close cancellation and policy/transport
release. Original download checks (filenames, timeouts, cross-call handles,
context exclusivity, policy restore failure/retry and chooser sequencing) and
early/popup/lost-dialog recovery flows also passed on both platforms. Focused
checks cover completion-before-frame ordering and bounded/invalid metadata.
macOS local/global npm tarball installation and installed JS/CLI/MCP browser
flows passed; the local browser-only artifact was refreshed. No dependency or CI
added. Tests used owned profiles, local fixtures and private artifact directories.

See [browser CDP](../../browser-cdp.md). Headful/native picker presentation,
broader popup/iframe/provider races, host crash recovery, remote filesystems and
Windows remain unverified. The full harness parity goal remains active.


## Composited Linux window backing images

Linux screenshots now prefer existing XComposite backing pixmaps when a local
compositor owns the screen. Native PID/mapped-tree/exact-geometry evidence and
before/after AT-SPI identity checks select one frame. No redirection, focus or
stacking mutation is performed. XRender validates RGB/ARGB visual masks and
premultiplied alpha is restored to straight-alpha PNG. Every capture names a
fresh pixmap, checks dimensions/depth/layout, and frees images/pixmaps plus the
server grab on all exits. The noncomposited exposed-frame fallback remains;
input retains its existing focus/visibility verifier.

Validation passed: 87 Python checks on macOS and Ubuntu arm64; the native Linux
Go suite; 155 Node checks on macOS. Both JS hosts passed actual xcompmgr/Xvfb
background, overlapping and partly offscreen red/blue window pixels, same-title
isolation, half-alpha color, black pixels, focus preservation, same-geometry,
hidden and stale rejection, and composited coordinate-input refusal. Both hosts
also passed the existing noncomposited image, click, drag, held-click/key, scroll
and window-identity controllers. Targeted self-checks cover byte order/alpha,
wrong PID/duplicate geometry, post-capture identity changes and native resource
cleanup on success/failure. Test-only GTK/Cairo/xcompmgr packages were installed
inside the existing Linux VM; no project dependency or CI was added. All GUI
checks used owned private Xvfb/D-Bus desktops.

See [Linux window images](../../linux-window-images.md). Real GNOME/KWin,
decorated/reparented and GPU/full-screen windows, minimized/unmapped windows,
Wayland/portal capture and wider providers remain unverified. The full harness
parity goal stays active.


## Focused input on composited X11

Native input frame verification now accepts composited X11 and differing visual
depths. Compositor/depth constraints stay in the root-pixel screenshot route.
Input retains active AT-SPI identity, native focus/PID/geometry/stacking, shape,
full on-screen bounds, neutral input and actual pointer/grab checks. No focus,
stacking, redirection or other client's grab is changed by the runtime.

Real Openbox validation exposed two WM replay races. Button release now polls
only its already-sent core-button state for up to 250 ms before continuing.
Drag confirms a queued motion after releasing its short server grab, allowing
the WM to replay; it waits only while the pointer remains at the previous point.
Unexpected motion/target/button state or timeout stops the operation. Neither
path resends input, and cancellation still releases owned buttons/keys.

GTK receiver fixtures now translate client coordinates through native client
origins and frame extents to screenshot coordinates, including decoration
borders/titlebars. The synthetic input-only overlay explicitly stays unmanaged,
restores fixture keyboard focus and raises above its receiving frame. The drag
cancellation gate permits short cleanup polls while blocking the intended motion
interval. An ARGB fixture records actual press/release recipients and coordinates.

Validation passed: 89 Python checks on macOS and Ubuntu arm64; 47 native Linux Go
checks plus 10 subchecks; 155 Node checks on macOS. Both JS hosts passed all five input controllers under
xcompmgr + Openbox: decorated RGB GTK recipients, button/count/coordinates,
held drag motion, wheel pane displacement, held/timed key state and timestamps,
input-only/grab/inactive/occluded/stale rejection, reset/close releases and fresh
input. All five also passed without a compositor. Both hosts passed the original
noncomposited image controller and the real xcompmgr background/occluded/partly
offscreen/alpha/black/image-identity controller, including exact ARGB pointer
recipient coordinates and inactive-input refusal. Targeted checks cover delayed
motion/release, release timeout, unchanged root-pixel refusal and wrong PID/
occluded ARGB input rejection. Native MCP tool descriptions, screenshot failure text and injected JS guidance
now describe these capabilities. No project dependency or CI was added. Test-only
Openbox/x11-utils were installed in the Linux VM; all desktop runs used owned
private Xvfb/D-Bus contexts, with private WM config/cache locations.

See [Linux clicks](../../linux-click-input.md) and [drag](../../linux-drag-input.md).
GNOME/KWin and physical/GPU desktops, wider decorated ARGB/mixed-depth frames,
Wayland, background native input, external interruption/claims and broader
providers remain open. No installation package or registry release was produced
in this phase. The full harness parity goal stays active.


## Mixed-depth compositor frames

A real Openbox ARGB pixel run failed before image capture: a 32-bit WM frame
contained a mapped 24-bit decoration child, and the descendant-depth check
rejected it. X.Org's upstream Xcomposite manual specifies complete per-hierarchy
offscreen storage, including descendant contents. The XGetImage source here is
the named backing pixmap. Remove the descendant-depth restriction from this
route while retaining frame/pixmap visual, dimensions, depth, color layout,
identity, shape, tree budget, single-PID and geometry validation. The separate
noncomposited root-image depth restriction remains intact.

The owned GTK controller now supports decorated windows, RGB/ARGB grow/shrink
and frame-relative receiving coordinates. Its semantic action lookup uses exact
button names so Grow A and Grow Alpha stay distinct. It checks native negative
position before offscreen capture, validates fresh PNG dimensions after resize,
recovers after hide/show remapping and records exact ARGB pointer recipients.
Documentation and the parity/quality tables now describe Openbox image evidence
and preserve broader WM/theme/shape and Wayland gaps. The Linux architecture
text also corrects its stale AT-SPI-only drag description.

Validation passed: 90 Python checks on macOS and Ubuntu arm64; 47 native Linux Go
checks plus 10 subchecks. Both JS hosts passed actual xcompmgr pixel runs without
a WM, and Openbox runs in both decorated and undecorated modes: same-title
red/blue isolation, background/occlusion, actual partly offscreen position,
straight half-alpha red, opaque black, grow/shrink/remap, unchanged capture focus,
ARGB input recipients and inactive/ambiguous/hidden/closed refusal. Both hosts
also passed the original noncomposited image controller. The new focused check
accepts mixed descendant depth and rejects a foreign descendant PID. No project
dependency or CI was added; no installation package or registry release was
produced. Checks used owned private Xvfb/D-Bus desktops with private WM config/
cache locations. An extracted upstream development-package manual supplied the
primary XComposite reference and was kept within the disposable test directory.

See [Linux window images](../../linux-window-images.md). GNOME/KWin, other WM
themes/shapes, GPU/full-screen, minimized windows, Wayland/portal, external
interruption/claims and broader providers remain open. The full harness parity
goal stays active.


## Shaped compositor window images

Composited images now read the verified native ShapeBounding region instead of
rejecting every shaped frame. Native rectangles are copied under the same server
grab as pixmap capture, translated from interior to border-inclusive coordinates,
and released through XFree on success/failure. Region encoding runs after server
release, clips to the default pixmap bounds and unions the rectangles. Every
channel outside the effective region becomes zero; ARGB opacity is preserved
inside, and shaped RGB becomes opaque RGBA inside. Empty regions produce a
transparent image. Shape reads/encoding enforce rectangle, time and pixel-work
budgets. PID/tree/geometry/visual/pixmap/AT-SPI validation remains in place.

The fixture sets server bounding regions on its own native XIDs through XShape,
with corner cuts and interior holes in both RGB and ARGB windows. It records
frame-relative sample/input points and private errors. Both hosts check exact
zero RGBA at corner/interior samples, all transparent pixels' RGB channels,
preserved half-alpha content, reset recovery and rejection of shaped physical
clicks before receiving any button event. Root-image fallback and physical
input keep their existing shape refusal. MCP tool descriptions and injected JS
instructions now make that boundary explicit.

Validation passed: 92 Python checks on macOS and Ubuntu arm64; 155 Node checks;
47 native Linux Go checks plus 10 subchecks. The actual xcompmgr pixel controller
passed in both JS hosts without a WM, and with Openbox in decorated and
undecorated modes. Existing background/occlusion/offscreen, RGB/ARGB resize/remap,
focus, same-title identity and stale/hidden/ambiguous checks also passed. Both
hosts passed the separate noncomposited image controller. Targeted checks cover
region clipping/union/empty output, RGB zeroing and alpha, border translation,
rectangle/pixel budgets, native allocation cleanup and invalid metadata. All GUI
runs used owned private Xvfb/D-Bus desktops and private WM config/cache paths.
No project dependency, CI, installation package or registry release was added.

See [Linux window images](../../linux-window-images.md) for the X.Org Shape
protocol/library references. Shaped physical input, GNOME/KWin, other compositor
and WM effects, GPU/full-screen, Wayland/portal and broader providers remain open.
The full harness parity goal stays active.


## Shaped X11 physical input

Physical input now supports shaped frames. The native frame verifier checks
Bounding/Input region membership for requested pointer positions in the target
frame and mapped windows declaring the selected app PID. This covers a WM's
rectangular outer frame around a client with an independent input hole. Region
reads reuse native rectangle/time budgets and cleanup. Native errors fail before
input. Active AT-SPI identity, native focus/PID/geometry/stacking, full on-screen
bounds, pointer recipient, neutral input and grab checks remain required.

Drag computes its 13 sent positions once, verifies all of them before initial
pointer motion and the first press, then rechecks current/next positions before
each move. Held clicks and wheel pairs recheck their targets. Timed keys preserve
native keyboard-focus checks without requiring a pointer position. Root-image
capture retains its noncomposited shape/depth restrictions. MCP metadata and JS
instructions now describe region preflight rather than refusing all shapes.

The receiving fixture records physical button events separately from GTK's
synthetic double-click notifications, along with motions, wheels, keys, modifier
state and timestamps. Its independent ShapeInput hole stays visibly filled in
the image. A dedicated controller checks exact shaped recipients, dwell/chords,
timed keys, wheel direction, held drag endpoints/motion, bounding/input hole
refusal, pre-press path rejection, independent region reset and reset/close
button/key releases. A unit check covers child input masks under a WM frame;
another proves a drag hole fails before any pointer motion or button press.

Validation passed: 94 Python checks on macOS and Ubuntu arm64; 155 Node checks;
47 native Linux Go checks plus 10 subchecks. Both JS hosts passed the shaped
controller with xcompmgr alone and with decorated/undecorated Openbox. Both hosts
also passed the original five input controllers without compositing and under
Openbox/xcompmgr, the noncomposited image controller, and updated compositor
pixels/shape-hole/refusal checks under Openbox. Existing reset/close cancellation,
interception/grab/inactive/occluded/stale rejection and fresh input continued to
pass. No project dependency, CI, installation package or registry release was
added. All GUI checks used owned private Xvfb/D-Bus contexts and private WM config/
cache locations.

See [Linux clicks](../../linux-click-input.md) and [drag](../../linux-drag-input.md).
The X.Org Shape 1.1 protocol defines the effective input region as the intersection
of default bounds, client bounding and client input regions. Broader child-window/
provider hit testing, dynamic region changes during actions, GNOME/KWin, hardware,
GPU/full-screen, Wayland/portal and external interruption/claims remain open.
The full harness parity goal stays active.

## Dynamic native input regions and release acknowledgement

The owned GTK receiver changes its native Input region in response to the first
physical press or held motion. Both JS hosts verify prompt failure, one matched
mouse press/release, reverse modifier release, no later click in the sequence,
drag release at canvas x=50 before the new x=60 hole, and fresh click recovery
after clearing the Input region. Independent XQueryKeymap probes verify no keys
remain down after dynamic refusal and reset/close.

Shared held-key cleanup now confirms attempted keys leave the logical key map
within 250 ms, inside cancellation deferral, without repeating key releases. The
small check covers delayed acknowledgement and its timeout. This applies to both
held clicks and explicit-duration pressKey.

During repeated no-WM checks, the GTK receiver intermittently omitted its final
Shift release record while an independent native keymap probe was empty. The
fixture now keeps synchronizing its display and writing state every 50 ms after
the sender exits. Three consecutive full controller runs then passed for both
hosts. The exact earlier event-observation cause remains unconfirmed; native
logical-state confirmation and receiver records remain separate checks.

Validation: 95 Python checks on macOS and Ubuntu arm64, and the native Go suite
on Ubuntu arm64 passed. Running the Go suite directly on macOS fails the Linux
platform guard; the cross-compiled test binary was run successfully on Linux.
The updated shaped controller passed all three owned compositor/WM layouts in
both hosts. Existing held-click and timed-key controllers passed under Openbox/
xcompmgr in both hosts. The shared compositor-image controller exposed a focus
transition after remapping the fixture; it now explicitly restores B's focus
before checking background screenshot focus preservation. The assertion remains;
both hosts passed the compositor-image controller in both Openbox layouts.
No new dependency, CI or release was added.

Arbitrary concurrent changes, broader child-window/provider hit testing, GNOME/
KWin, hardware, GPU/full-screen and Wayland/portal remain open. Full harness
parity remains active.

## WebMCP native cancellation settlement

Read-through found that cleanup acknowledged abort dispatch without awaiting the
native invocation's settlement. The isolated-world registry now retains each
executeTool promise beside its AbortController. Its asynchronous cancel method
signals abort and waits for that native promise to settle; CDP returns and awaits
the cancellation promise before releasing ownership. Existing bounded cleanup,
context-loss handling and failed-ack retention/retry remain shared by both hosts.
No tool call is replayed and provider side effects can persist after cancellation.

The focused check delays native settlement after abort and verifies that cancel
stays pending. The host check requires a returned/awaited native cancellation
promise, and existing cancellation failure/retry and context-loss checks pass.
All 156 Node checks pass. Both source and Worker sessions pass the owned headless
Chrome 158 workflow: native calls, exact frames, stale registrations/navigation,
provider errors, turn/reset/close abort cleanup, declarative form and empty tools.
The cancellation fixture uses separate URLs and explicit tab handoff so it can
observe abort after reset/close without racing same-URL reload or tab disposal.

No dependency, CI, install package, registry publication or user profile change.
This round did not revalidate Linux/Windows/headful WebMCP, tool notifications or
interaction/consent dialogs. Native caller settlement confirms the browser-side
invocation; it provides no rollback of a provider's accepted effects. Full harness
parity remains active.

## WebMCP tool-change notifications

Fetched frame-tree collections now observe Chrome's native WebMCP toolsAdded and
toolsRemoved events on their exact CDP sessions. Their owning turn coalesces
changes by tab and prepends a generic refresh notice to the next JS result in
both source and Worker hosts, including ordinary error results. Explicit output
stays intact. Notices supply no page-defined tool instructions and execute no
action; agents fetch current names/schema before calling updated tools.

Initial enable inventories, foreign frame IDs, other owners, stale documents,
changed/invalid endpoints and closed turns are excluded. Each collection's CDP
connection owns its subscriptions and closes through existing cleanup. There is
no new polling loop, public API, dependency or CI configuration.

All 158 Node checks pass. Focused checks cover initial-event suppression, shared
session/frame membership, coalescing, draining, ownership, stale/invalid endpoint
fencing and both hosts' success/error output. Owned headless Chrome 158 passes
both hosts with main/same-process/cross-origin OOP frame registration changes,
unrelated-tab isolation, stale replacement, ordinary calls and turn/reset/close
cleanup. The native WebMCP.enable capability was probed on that exact browser.

Initial discovery of unfetched tabs and newly attached frames still requires a
fetch. Real consent, headful/platform/crash and external-site notifications remain
unverified. Full harness parity remains active; no package or registry release.

## WebMCP discovery on tab binding

Binding/using a tab now starts an idempotent turn-owned observer independently of
callable collections. Fixed private-world native getTools queries report only
initial availability. Exact native frame-session tool events then discover
changes and newly attached same-process/OOP frames. Navigation resyncs discovery,
and ordinary use of a retained tab binding restarts it in a later turn. Notices
stay generic and coalesced; fetchTools remains required for exact names/schema.
No page tool executes during discovery.

Optional discovery skips Chrome below 158, defers active dialogs and reports a
diagnostic on startup failure while ordinary actions remain usable. Background
sync failures request an explicit refresh. Turns allow 128 observed tabs, with
128 current frames/retained native sessions per observed tab and bounded sync/
native calls. Cleanup joins background jobs and closes observer connections;
failed disconnect retains ownership for retry. Detached/navigated frames leave
old frame membership, and closed owners cannot enqueue notices.

Validation: all 160 Node checks pass, including observer reuse/scope/budget,
initial-frame filtering and failed-close retention/retry. Owned headless Chrome
158 passes both hosts with discovery before any fetch, an already loaded tab,
late same-process/OOP frames, navigation, cross-turn retained bindings, ordinary
calls and turn/reset/close cancellation. Chrome 156 passes ordinary binding and
explicit unsupported-WebMCP behavior. Browser/navigation/input/filechooser,
dialog and early-dialog/popup ownership/recovery controllers also pass. Fixture
round trips on all native observer connections settle expected frame events
before unrelated-tab isolation checks.

No new dependency, CI, package publication or user-profile modification. Unbound
browser-wide inventory, real consent, headful, other-platform and crash behavior
remain open. Full harness parity remains active.

## Linux WebMCP validation and native renderer-crash cleanup

Validated the current native WebMCP workflow on Ubuntu arm64 / Node 24.22.1
using official Chrome for Testing 158.0.8127.2 and a disposable profile. Both JS
hosts pass discovery before fetch, preloaded tabs, exact same-URL/OOP frames,
new frames, stale registrations/navigation, provider errors, native calls,
declarative forms and turn/reset/close cleanup. macOS / Node 26.11.1 also passes
the updated full controller. No normal profile or keychain settings were changed.

An actual main-renderer crash during an outstanding tool call reproduced a
reset that did not complete within 15 seconds. Fetched collections now race
trusted page/native-session crash signals and report a renderer-crashed error.
Each native record keeps its target/session relationship. Confirmed destruction
only releases callers in that destroyed session or the crashed root process;
a surviving OOP/root session still needs cancellation acknowledgement. Crash
errors stay errors rather than returning navigation's null result. Targeted
checks cover root crash, OOP cancellation and child/root crash separation.

Both hosts now pass root renderer crash, invocation failure, reset cleanup and a
successful tool call in a fresh tab on macOS and Linux. Same-tab reload through
Playwright was rejected as a crashed page and remains outside this evidence.
Whole-browser process death and live OOP-child crash also remain unverified.

The fixture closes owned HTTP connections before server shutdown, fixing Node
24 process-exit waits on an accepted local connection. The crashed control
session detaches asynchronously. Its form case waits for main-document tool
readiness; a child registration promise could remain pending while the harness
had no outstanding request. Existing same-URL/OOP imperative assertions remain
separate and pass. Inspector observations were limited to the owned test process.

All 162 Node checks pass on macOS. Linux passes 161 and skips the macOS-only
virtual-display option check. The Linux browser/input/navigation/filechooser,
dialog and early-dialog/popup recovery controllers also completed successfully.
No dependency, CI, package release or user-profile change was added. Full harness
parity remains active.

## Crashed-tab reload through the harness

Verified the existing explicit tab.reload() route after a renderer crash during
an outstanding WebMCP invocation. The controller waits through the harness's
playwright.waitForLoadState, retains the native target ID and JS tab/capability
bindings, and does not reset the JS session. The old fetched collection fails
without starting another provider invocation in the reloaded document.

Registering a new owned tool after reload produces a native discovery notice;
a freshly fetched handle executes successfully on that same tab. The separate
Playwright control connection is recreated after the crash so its cached Page
crash flag cannot stand in for the harness's reload behavior. The existing reset/
fresh-tab, ordinary native calls, frames, form and reset/close checks continue.

Both source and Worker sessions pass the complete updated controller on macOS
and Ubuntu arm64 with Chrome for Testing 158.0.8127.2. The final Linux child,
controller and shell all report exit code 0. Added the verified reload/load-wait/
fetch workflow to the public guide, architecture and parity/quality tracking.
This change strengthens live evidence and documentation for the existing native
reload implementation; it adds no runtime API, dependency, CI or registry release.

Whole-browser process death, live OOP-child crash, Windows, physical/headful and
external-site recovery remain open. Full harness parity remains active.

## Live WebMCP OOP renderer-crash isolation

Both platforms reproduced a child-target crash whose WebMCP caller timed out
waiting for cancellation. Fetched collections now enable browser-level target
crash discovery and match targetCrashed events against Target.getTargetInfo IDs
captured for their exact native sessions. Matching dead sessions release their
callers; only a confirmed root-target crash signals the root process. Native
Inspector events remain an additional exact-session source. A generic page
object crash callback no longer supplies root-process destruction authority.

The owned fixture registers cancelable waits in child documents. It verifies a
native iframe target distinct from the root, holds calls in both, and crashes
only that child. Its call fails while the root call remains pending and its abort
counter stays zero. Turn end then delivers cancellation to the living root and
clears owned callers. Removing the crashed child permits a freshly fetched root
tool call on the retained tab without resetting the JS session. Old handles are
rejected. Main-renderer crash/reset and same-tab reload checks still pass.

All 163 Node checks pass on macOS. Ubuntu arm64 / Node 24 passes 162 and skips
the macOS-only virtual-display case. Both source/Worker sessions pass the entire
updated owned Chrome 158 controller on macOS and Linux, including imperative/
declarative tools, exact same-URL/OOP frames, discovery, cancellation, root crash,
reload and the new OOP/root-call isolation. The focused check covers foreign
crash events, captured target identity, root/child separation and closed-owner
fencing. Test profiles and processes are owned; no normal profile was changed.

Refresh with a crashed child still attached, whole-browser process death,
physical/headful, Windows and external-site recovery remain open. No dependency,
CI or registry release was added. Full harness parity remains active.

## WebMCP refresh with an attached unavailable child

A crashed OOP iframe can remain attached while fetchTools returns a partial
inventory from healthy frames. The description reports exact native frame IDs,
URLs and bounded errors as untrusted diagnostics. Failed-frame tools are omitted
from both metadata and the callable registry. Collection construction reconciles
child crash events before publication; a later crash still invalidates published
handles. Root failure, navigation/detachment, turn cancellation and browser
disconnect remain fatal. Existing per-frame discovery bounds are retained.

The owned Chrome 158 controller passes both JS hosts on macOS and Ubuntu arm64:
it retains the dead iframe, checks the partial warning and exact target identity,
executes a freshly fetched root tool, and confirms the existing root wait stays
live until turn cleanup delivers its abort signal. Existing crash/reload,
registration, navigation, cancellation and declarative scenarios also pass.
All 165 Node checks pass on macOS; Linux passes 164 with one macOS-only skip.
Focused checks cover partial/empty descriptions and fetching/published root/child
crash policy. No dependency, CI or release was added.

The shared frame helper's evaluation regression passed both hosts on macOS on
repeat, after an initial navigation timeout. Linux repeatedly timed out at the
same navigation/load wait after passing DOM/frame reads, mutation/escape rejection
and CPU deadlines. An unchanged c46f268 baseline reproduces that Linux failure.
Native inspection shows the main URL committed while an attached child still
has an empty URL; the cause remains open, and later Linux evaluation cleanup
checks are unverified in this run. Temporary launcher cleanup now retries bounded
ENOTEMPTY races; the corrected launcher exits after test failure without masking
it. These launcher/debug files remain local intermediates.

Next: diagnose the existing navigation/OOP loading failure; broaden crash,
provider, Windows/headful and external-site recovery coverage. Full parity
remains active.

## Native WebMCP connections and OOP navigation

The existing Linux evaluation navigation timeout reproduced on c46f268. Protocol
logs showed a persistent Playwright discovery connection receiving a paused new
OOP target, followed by detachment before Runtime.runIfWaitingForDebugger could
succeed. Deferring evaluation disconnect did not fix it. Temporarily disabling
WebMCP discovery made the full evaluation controller pass. A retained fetched
collection reproduced the same interference after discovery was migrated.

Both discovery and collections now use the existing native CDP transport.
Discovery follows native target-parent events, attaches descendants explicitly,
and reconciles loader IDs, target sessions and native frame events. Neither
connection type enables target auto-attachment. Transient frame inventory errors
mark discovery incomplete while retaining the observer for subsequent events.
Collections attach explicitly, join target parentFrameId ancestry to the selected tree, and
verify each OOP target's root frame identity before reading. Failed child frames
retain partial-inventory reporting. Non-HTTP(S) documents remain rejected. Native
target crash identities, stale-handle checks, cancellation settlement and ownership bounds remain. Teardown awaits a
bounded close callback; failed cleanup retains ownership for retry. Both host
construction sites inject the existing transport; no dependency or package copy
list change is required. Playwright still owns selectors and read-only evaluation.

All 166 Node checks pass on macOS; Linux passes 165 with one macOS-only skip.
The focused native fixture checks the absence of auto-attachment, exact
root/same-process/OOP routing, foreign-frame exclusion, loader refresh, detachment, closed owners and
withheld disconnect acknowledgement. The Chrome 158 WebMCP and evaluation
controllers pass both hosts on macOS and Ubuntu arm64. They cover three successive
navigation/load cycles, retained tool snapshots, duplicate-URL siblings and an
OOP child's in-process descendant, alongside existing native calls, policy,
replacement, declarative, cancellation and root/OOP crash/reload behavior.
Ordinary browser input/navigation/filechooser and dialog controllers also pass
on both systems. macOS Chrome 156 passes explicit unsupported-WebMCP checks.

The live controller creates its separate Playwright fixture client after initial
public navigation/load, disconnects it during later public navigation and
reconnects after load for assertions. Each host closes its fixture controller
before the next host starts. Readiness uses fixed native main-world queries;
background-tab counters use timer polling instead of rAF. That external control
client can itself pause new OOP targets. Independent external debugger
interference, Windows/headful, whole-browser death and broader provider
recovery remain open. Owned profiles/processes are disposable. No CI or release
was added. Full harness parity remains active.

## Confirmed local browser exit recovery

Owned Chrome SIGKILL reproduced dead-endpoint failures from retained tab
ownership. Added a shared optional local identity snapshot: loopback endpoint,
native command line, absolute executable/profile, matching DevToolsActivePort
port/browser route, actual listener PID, matching loaded executable and native
process IDs. lsof is bounded and read-only; PID checks use signal zero. Missing,
remote or mismatched evidence leaves the old uncertainty fence in place.

Tab cleanup retires dead local instances and uncertain creation markers only
with browser-PID exit evidence. Reconnection fences a changed browser route with
unresolved metadata. WebMCP releases a lost invocation only after every captured
process exits within its cancellation budget, and reports browser exit explicitly.
A live-process disconnect retains cancellation failure and ownership for retry.
The snapshot precedes final frame-crash reconciliation, preserving atomic
publication of healthy tools. CLI readiness, installer, CLI fixtures and both npm
copy lists include the new module; no dependency, CI or registry release is added.

All 169 Node checks pass on macOS; Linux passes 168 with one macOS-only skip.
Focused checks cover actual listener/executable matching, foreign endpoints,
instance mismatch, invalid PIDs, browser-vs-renderer exit, uncertain creation,
changed-instance fencing and explicit disconnected-call failure. The owned
Chrome 158 controller passes both JS hosts on macOS and Ubuntu arm64: completed
native main/OOP reads, waiting main/OOP tools, SIGKILL, bounded failure, unrelated
JS-binding survival, reset cleanup, fresh-browser reads/tools and no replay.
A separate socket-drop scenario keeps Chrome alive, verifies no provider abort,
retains the active call and rejected cleanup, then confirms physical exit permits
cleanup retry. No normal profile is used. The read-only evaluator is unchanged.

Unidentified/default profiles, remote/proxied identity, live-browser reconnect
cancellation, Windows/headful and other active capability types remain open.
Full harness parity remains active.

Validation follow-up: existing macOS WebMCP/read/input controllers and Chrome
156 unsupported-WebMCP checks pass. Installed standalone MCP checks pass on both
systems; Linux installed browser/input/QuickJS checks also pass. The macOS
installer run omitted its live-browser phase.

The combined Linux WebMCP controller still has an unresolved native fixture
registration timeout. The failing frame belongs to the active document and its
registration Promise remains pending. Baseline commit 46b4ecb also reproduces the
same readiness timeout when only 50 ms waits are inserted at the new probe
positions; the unchanged baseline passed. Per-context waits, releasing the
fixture's Playwright connection, debugger-start release, background scheduling
flags and activating the page did not resolve it. Those experiments stay outside
production code. The controller now reports the target/frame tree on failure;
its readiness assertion and five-second bound remain. Root cause is open, and
this slice does not claim a green combined Linux WebMCP regression. Next work is
a minimal registration-timing reproduction and fixture/harness interaction
isolation. Full harness parity remains active.

The Linux read-only evaluation controller passes both hosts. The generic browser
controller times out in Page.captureScreenshot after the read/crash controller
and in a fresh browser, with and without the WebMCP launch flag. Unchanged
baseline 46b4ecb reproduces the same screenshot timeout in a fresh browser.
This additional regression remains open alongside fixture registration timing;
the exit controller's passing evidence is scoped to its pending reads/tools and
fresh-browser read/tool recovery, without screenshots. Raw failed controls and
launchers were retained outside the source checkout for the next investigation.

## Native registration lifecycle reduction

Reduced the Linux registration timeout to a raw-CDP fixture, independent of this
harness and Playwright. A live frame's registerTool Promise can remain pending
while its ordinary JavaScript timer continues; a following getTools query can
also stall. Chrome 158 reproduces it, and a full inline-fixture run on Chrome 159
also failed. Chromium records an unordered ModelContextHost bind/document-commit
race in its document-replacement implementation. The observed reduction is
consistent with that mechanism, without a captured C++ trace.

The owned complete fixture now starts registration explicitly after document
load and awaits the same native acknowledgement. Its replacement uses the
captured native context, preserving the main-world spoof check. All original
inventory, native call, partial-frame, cancellation, crash and repeated OOP
navigation assertions remain; the already initialized unrelated-tab binding
still verifies initial inventory. The readiness bound remains five seconds.
No runtime version gate, production behavior or automatic replay was changed.

Added a standalone native registration control using only Node built-ins. It
owns its Chrome/profile, bounds each CDP command and verifies twenty cycles of
five exact frame inventories and native echo calls with distinct per-frame
tokens. Default registration starts after load; --inline-registration retains
the original reproduction and fails explicitly on a stuck native Promise.
Mac/Linux Chrome 158 pass the new control and both hosts' complete WebMCP smoke;
Linux Chrome 159 also passes both hosts' post-load complete smoke. No dependency,
CI, registry release or normal browser/profile changes were added.

The generic Linux browser smoke still has a screenshot timing failure. Capturing
the native request's caller stack located one failure at the screenshot after
pointer drag. The same run passed its preceding screenshots. A diagnostic run
with logging and a shorter local capture deadline passed, while the unchanged
run failed again. This investigation continues; no screenshot retry or longer
production timeout was added. Native inline registration, external sites,
Windows/headful and broader transport parity remain open. Full goal stays active.

macOS Chrome 156 retains explicit unsupported-WebMCP failures in both hosts.
The pointer-only reduction also reproduces the post-drag screenshot timeout.
An acknowledged native Input.cancelDragging command did not unblock capture;
enabling Page on the screenshot connection also failed. These controls were
not adopted in production. The retained disposable test checkout and raw failed
controls support continued screenshot investigation; no browser job remains
running after the checks.

## Host-owned browser pointer drag

Raw drag previously ran inside the JS worker and lacked host input/focus ownership.
Moved it into BrowserInputs, reusing origin exclusivity, virtual focus, native
connection ownership, dialog handling and failed-release retention. Endpoints and
initial screenshot geometry validate before dispatch. During motion, content-size
and document-scroll effects are allowed; navigation, coordinate viewport changes
and viewport revisions stop further moves. Cancellation releases outside through
a fresh controller, without replaying downs or moves. The initial move now uses
button none: Chromium ORs the button flag into the supplied buttons mask, which
previously delivered a held move before down for managed clicks.

The owned Linux no-focus control took about 65 seconds through the movement
sequence and then timed out on capture; temporary virtual focus and managed
ownership completed motion promptly. A second independent backend issue remained:
the default/disabled CDP screenshot path stalled after input. Chromium's explicit
CDPScreenshotNewSurface feature uses a new LocalSurfaceId instead of ForceRedraw.
Enabling it passes the controlled headless screenshot/drag cases. The required
Linux setup is documented; existing processes are not restarted or reconfigured.
Unsuccessful render-fence, duplicate-focus and release-order experiments were
removed. No screenshot retry, foreground activation or longer timeout was added.

Added one focused geometry/boundary check and a native receiver-event controller.
Mac/Linux Chrome 158 each pass thirteen cases across both JS hosts: normal drag,
content resize, capture, turn/reset/timeout/close, Worker exit, competing input,
failed release with blocked reuse and cleanup retry. Events verify trusted input,
unheld movement before the down, balanced release, restored visibility and no
new presses on cleanup. Installation validation now checks copied-runtime drag
and capture after source removal, using an owned profile and explicit screenshot
feature; macOS uses a test keychain. No dependency, CI or registry release is added.

Native inline WebMCP registration, default Linux screenshot engine behavior,
Windows/headful, broader native HTML drag/drop and overall harness parity remain
open. Full goal stays active.

Validation completed: macOS passes all 170 Node checks; Linux passes 169 with its
macOS-only virtual-display skip. Generic browser and held-input controllers pass
on both platforms. Linux Chrome 159 with the same screenshot feature also passes
all thirteen drag cases and the generic browser controller. Installed standalone
MCP, both installed JS hosts and the installed plugin launcher pass real field
input, drag, post-drag capture and read-only QuickJS evaluation on macOS/Linux
after source removal. The installer controller now tolerates bounded ENOTEMPTY
cleanup races from its own Chrome helpers; unrelated configuration and sources
remain protected by the existing preparation checks.

## Ordinary browser clicks under host input ownership

The raw tab click implementation previously bypassed BrowserInputs when options
contained neither key nor durationMs. That included ordinary clicks, button
aliases and multi-click sequences. An owned pre-change control delivered default
clicks with hidden visibility, missing the managed virtual-focus path.

Removed that branch and its Worker-local press/up loop. Every raw tab click now
uses the existing host manager, origin input lease, virtual focus, cancellation
and retained-failure cleanup. The same geometry guard allows press-triggered
content growth and document scroll after the down, while guarding loader,
coordinate viewport and viewport revisions before release. Full geometry still
validates before every new down; navigation/viewport change stops the sequence,
and cleanup releases outside without replaying a press.

Renamed the drag controller to run-pointer-input-smoke and extended it in place
instead of duplicating its fixture/cleanup. Thirty cases per platform cover both
JS hosts, ordinary index/coordinate clicks, right aliases, three-click counts,
press effects, screenshots, turn/reset/timeout/close, Worker exit, competing input
and failed-release recovery. Existing drag checks remain. Installed-runtime
coverage also performs a default coordinate click and verifies its receiver result
before capturing a fresh screenshot for drag. No dependency, CI, version gate,
registry release or automatic retry was added. Full harness parity remains active.

Validation: all 170 Node checks pass on macOS; Linux passes 169 with its existing
macOS-only skip. The expanded thirty-case pointer controller passes both hosts
on each platform, verifying button identities, triple-click detail counts and
press-triggered scroll as well as balanced trusted release and restored
visibility. Generic browser and held-input regressions also pass on both systems.
Installed standalone MCP, both installed JS hosts and installed plugin-launcher
browser checks pass default coordinate click, drag/capture and QuickJS DOM reads
after source removal. The documented Linux screenshot feature remains enabled
for owned headless fixtures; Windows/headful and broader provider races stay open.

AX point preparation still resolves and may scroll in the client before host
admission. Broader preparation/lease coordination remains open; this change owns
the press/release sequence and preserves the existing initial point resolution.


## AX click preparation under host ownership

The ordinary-click follow-up moves AX point preparation out of the Worker and
into the existing BrowserInputs operation. The client transfers its observed
backend-node/role/name and loader/geometry snapshot. Before any scroll, the host
owns the shared origin pointer/focus lease and revalidates the document and AX
identity. It admits scroll/content effects, checks coordinate viewport and
revision stability, resolves and validates the point, then continues the same
managed press/release sequence. Temporary node objects are released.

The pointer controller retains its original 30 cases and adds five offscreen
AX preparation cases across both JS hosts. Native scrolling is observed while
host completion is paused; competing input is rejected, normal completion
clicks once, and reset/Worker exit produce no mouse down. A small existing-file
unit test also checks changed AX identity and navigation refusal. Installed
runtime validation clicks an AX textbox and verifies resulting text focus.

This supersedes the previous client-side AX preparation limitation. Page-world
bounding-box/hit-test calls, external-client/other-action coordination and the
existing broader platform/provider gaps still require work. Accepted scrolls
can remain after cancellation. No dependencies, CI or automatic press retry added.


Validation: macOS Node 26 passes 171/171 tests; arm64 Linux Node 24 passes
170 with one macOS-only virtual-display skip and no failures. Chrome 158 on each
platform passes all 35 pointer cases, generic browser/held-input controllers and
source-removed installer/standalone/Worker/Persistent/MCP browser flows. Linux
fixtures retain the documented CDPScreenshotNewSurface flag. Windows/headful
and page-world geometry isolation are not verified by these runs.


## Isolated AX point resolution

A real Chrome control on macOS and arm64 Linux reproduced page-world geometry
spoofing: the observed AX button caused a trusted down at the decoy's position.
The pointer fixture overwrites prototype/instance bounding-box, hit-test and
containment methods, preserving real receiver events as the assertion source.

BrowserInputs now creates a native isolated world for the main frame, validates
its context ID and resolves the backend node into that context. The fixed point
resolver checks document ownership and uses that world's DOM methods. Required
native support is checked before preparation; missing/invalid world identity
fails without a page-world fallback or press. Existing lease/scroll/geometry/
cancellation guards and resolved-object release are preserved. No dependency,
parallel input implementation, compatibility fallback or CI was added.

The existing controller adds four hostile-page cases across both JS hosts: the
uncovered target receives the actual trusted click, and a real overlay refuses
input despite forged page-world hit-test results. The source-removed installed
browser flow now runs with throwing page-world geometry/hit-test methods.
The existing unit test checks context routing and refusal of a missing context.

This supersedes the page-world point-resolution limitation recorded above.
Child-frame transforms, fully native geometry, arbitrary DOM/layout movement
between measurement and press, external-client/other-action coordination and
broader headful/platform coverage remain open.


Validation: macOS Node 26 passes 171/171 tests; arm64 Linux Node 24 passes
170 with the one macOS-only virtual-display skip. Chrome 158 on each platform
passes all 39 pointer cases, including the four hostile-page cases; generic
browser and held-input controllers pass. Standalone, installed Persistent/Worker
sessions and installed MCP launcher browser flows pass after source removal with
throwing page-world methods. The initial generic regression caught a changed
error-message assertion; the final message preserves its covered/visibility
meaning and includes the main-document requirement, and both regressions pass.
Linux fixtures retain CDPScreenshotNewSurface. Windows/headful remain untested.


## Pointer pre-press target revalidation

The previous manager checked geometry before the unpressed pointer move. A live
control on macOS and arm64 Linux showed the button moving in that handler while
the existing click still delivered a trusted down/up/click to the background.
The fixture preserves actual receiver events as evidence.

BrowserInputs now reuses one isolated element-point routine to resolve the
initial point and verify that exact point after movement before each new down.
The latter path revalidates AX role/name/backend identity and hit/visibility,
without another scroll or center calculation. All managed pointer actions also
check document/geometry after movement. Observed changes abort remaining stages;
accepted earlier clicks are kept and never replayed. Existing modifier/focus
cleanup and failed-release retention remain shared.

The existing controller adds 14 cases across both JS hosts: hover movement,
overlays while Shift is held, AX rename, first-click rename/movement before the
second press, and content-only geometry changes on coordinate click/drag. The
small existing unit checks also cover pre-press viewport/navigation changes,
fixed-point arguments, a single preparation scroll and balanced object release.
No dependency, input replay or CI was added.

CDP hit checks and event dispatch remain separate commands, with a source
shortcut comment documenting the need for an atomic browser operation for strict
target fencing. Arbitrary concurrent changes after the final check, child-frame
transforms, external-client coordination and broader platform coverage stay open.


Validation: macOS Node 26 passes 171/171 tests; arm64 Linux Node 24 passes
170 with one macOS-only virtual-display skip. Chrome 158 on each platform passes
all 53 pointer cases, generic browser and held-input regressions. Source-removed
standalone, installed Persistent/Worker and installed MCP launcher browser flows
pass, including the existing page-world geometry tampering fixture. The Linux
owned fixture retains CDPScreenshotNewSurface. Windows/headful and atomic target
fencing remain unverified.


## Host-owned native text insertion

A disposable Chrome control on macOS and arm64 Linux reproduced Worker-local
text insertion after a focus handler redirected the requested field: the second
field received the text, with hidden-page native beforeinput/input events.

Raw tab typeText now transfers target AX identity, loader and text to the
existing BrowserInputs manager. Under the origin/focus lease, the host rechecks
native AX identity before DOM.focus and focused=true afterward, then sends one
Input.insertText. Current-focus insertion uses the same manager. Targeted text
rejects bare backend IDs without AX identity. Native capability requirements are
selected per action; the shared AX lookup also serves pointer point resolution.
No alternate input manager, dependency or CI was added.

The held-input controller adds 21 cases across both JS hosts, asserting receiver
values, trusted visibility, selection/Unicode behavior, redirected-focus refusal, explicit prompt response,
turn/reset/timeout/close/Worker-exit lifecycle, competing-text refusal and failed
focus-release retention/reset retry with no replay. Existing held-input cases
remain in the same controller. A small unit test covers identity/focus, loader
change, cancellation before insertion and failed cleanup without another edit.

The input call may report a pending dialog while the host retains ownership;
turn cleanup cancels that owner. Accepted native input may finish after prompt
cleanup, so cancellation assertions permit zero or one completed insertion.
Native focus checks and insert dispatch remain separate commands; the source
shortcut records the remaining atomic-edit requirement. Broader editor/IME,
headful/Windows and concurrent page/client behavior remain open.


Validation: macOS Node 26 passes 172/172 tests; arm64 Linux Node 24 passes
171 with one macOS-only virtual-display skip. Chrome 158 on each platform passes
all 21 text cases, the existing held-input suite, 53 pointer cases and the generic
browser controller. Standalone, installed Persistent/Worker and installed MCP
launcher flows pass after source removal. Linux retains the documented
CDPScreenshotNewSurface fixture flag. Headful/Windows and broader editor/IME
behavior remain unverified. Indexed pressKey still carries only a backend ID;
its host AX focus revalidation remains a separate open parity item.

The client also freezes the observed AX loader and rejects a document change
while preparing the text request geometry. Final full Node and generic browser
checks pass on both platforms with this binding in place.


## Indexed key AX focus revalidation

The pre-change disposable Chrome control on macOS and arm64 Linux recorded the
requested key in a second field after the indexed field's focus handler moved
focus. Indexed pressKey now shares typeText's observed AX metadata and loader
binding. One client helper prepares both requests. The host checks identity and
native focused=true before every modifier/primary down, retaining existing
release and cleanup behavior. Bare backend-node requests are rejected. The
focused-element helper serves both text and keys; no alternate input path,
dependency, compatibility fallback or CI was added.

The held-input controller adds 10 cases across both hosts: initial focus redirect,
normal Shift+A, Shift-induced focus redirect or name change, and zero-duration
indexed Shift+Enter navigation. Received values/events prove wrong-field
insertion refusal and no unintended primary down after a modifier. Existing
native keyboard unit checks now cover both text/keys, cancellation, failed
focus cleanup without replay and focus changes between chord stages. The
navigation release-outage unit keeps its targeted-node behavior.

Zero-duration navigation produced incomplete receiver key-up logs. The live
case keeps that timing and asserts actual native CDP acknowledgements for the
exact down/up sequence plus the destination and ownership/focus cleanup; any
received DOM up events must retain the release order. This proves native release
acceptance, with DOM delivery during receiver replacement still unproven. The
existing navigation fixture now retains received up events in its same tab
storage, without treating missing entries as delivery proof or adding a hold.

This supersedes the indexed-key host focus gap recorded above. Atomic target
fencing and broader widget/headful/platform focus coverage remain open.


Validation: macOS Node 26 passes 172/172 tests; arm64 Linux Node 24 passes
171 with one macOS-only virtual-display skip. Chrome 158 on both platforms
passes the 10 indexed-key cases, 21 text cases, existing held-input suite,
53 pointer cases and generic browser controller. Source-removed standalone,
installed Persistent/Worker and installed MCP launcher browser flows pass.
Linux retains CDPScreenshotNewSurface. Headful/Windows, broader widget focus,
atomic dispatch and DOM key-up delivery during navigation remain unverified.


## Managed paste target and clipboard ownership

Disposable macOS/Linux controls reproduced native paste into the second field
after the requested field's focus handler redirected focus. The old clipboard
service owned a separate user-target focus/key path. It now verifies headless mode and
allocates private control resources, then keeps the native preparation callback
and managed editor action in its existing queue under BrowserInputs ownership. Target focus/down/up and cancellation
use the same AX/loader checks, release controller and retained failed ownership
as other native input. The unused clipboard target-focus state/cleanup is removed.

A retained paste lease blocks subsequent clipboard API jobs before discovery or
mutation, including after a failed key/focus release has rejected the queue job.
Reset cleans the existing input record without another editor-paste down. The
prepared action is an internal service callback, excluded from the input RPC.
Default source bindings, the Worker host and installed services use this same
path. No dependency, public API option, legacy input fallback or CI was added.

The shared controller adds 27 native paste cases across both JS hosts: focus
redirect refusal, Unicode/current-focus/selection behavior, explicit prompt
response, turn/reset/timeout/close/Worker-exit cleanup and key/focus-release
failure/retry. Competing clipboard writes fail while cleanup is retained; a
post-reset native read verifies that the original paste data remains. The small
keyboard unit matrix also checks fixed paste commands and up events without
another edit; a clipboard test checks the fence before browser discovery.
The installed-runtime fixture verifies paste after source removal.

Virtual clipboard contents persist across sessions. Preparation may finish
before the target is refused or cancellation prevents input; there is no content
rollback. Queue cancellation, permission/control-page cleanup and verified
headless-only behavior remain in place. Atomic focus/edit dispatch, external
raw-client coordination and broader headful/platform/editor work remain open.


The input lease also spans the native clipboard write, with target identity and
focus checked before preparation and again before the editor down. Headless verification and
control-target allocation precede the managed callback; no user-target input is admitted
there. Preparation barriers verify competing-input refusal and reset after an
accepted buffer write with zero native paste downs. A closed-owner check between
control-focus acknowledgement and Runtime clipboard access prevents a newly
started write after cancellation. These stages use an internal function callback
inside the existing clipboard queue, without exposing an input RPC bypass.


Validation: macOS Node 26 passes 174/174 tests; arm64 Linux Node 24 passes
173 with one macOS-only virtual-display skip. Chrome 158 on each platform passes
all 27 paste cases, 21 text cases, 10 indexed-key cases, existing held-input suite,
53 pointer cases and generic browser controller. Both JS hosts pass the complete
native clipboard text/HTML/PNG, editability, undo, password and cleanup suite;
the macOS desktop text-clipboard hash stays unchanged. Source-removed installed
Persistent/Worker and MCP launcher flows pass managed paste too. Linux retains
CDPScreenshotNewSurface. Headful/Windows, atomic focus/edit dispatch and native
preparation settlement after transport loss remain open; that last failure mode
was not exercised in these runs.


## Clipboard completion across lost CDP replies

Private control pages now register each clipboard task before its single start
and retain its native promise/result across connections. Recovery verifies the
browser websocket route and control frame/loader, then settles that exact job:
armed tasks are canceled, running tasks get a bounded status query, completed
writes return the original result. No write or paste preparation is replayed.
Unconfirmed tasks keep their control page and an endpoint-wide fence against
managed input and clipboard reads/writes. Cleanup retries settlement before
restoring permissions or closing control targets; native key/button releases
remain available while the fence is held. Known terminal results remain cached
through focus-cleanup retries; dropping completed page records is best effort.

Added `scripts/run-clipboard-transport-smoke.mjs`, using owned HTTP fixtures and
actual control-CDP connection closure. Both JS hosts pass four scenarios each:
completed write with lost reply, completed paste preparation with lost reply,
pending write and pending paste preparation. They check exactly one native
write, cross-session input/clipboard refusal, zero edits for interrupted pending
paste and recovery after native completion plus reset. A small VM check covers
duplicate starts, cancel-before-start, pending settlement, rejection and lost
completion contexts.

Validation: macOS Node 26 passes 175/175 checks with test-file concurrency set to
one; arm64 Linux Node 24 passes 174 with one macOS-only skip. The macOS process
identity check failed in an earlier parallel full run and in an isolated retry;
it passed the diagnostic run and final serial full suite. Its existing one-second
lsof timeout remains unchanged. Chrome 158 on both systems passes the eight new
fault scenarios, native text/HTML/PNG clipboard suite, 27 paste / 21 text /
10 indexed-key cases, existing held-input suite and 53 pointer cases. macOS
desktop text-clipboard hash stays unchanged. Source-removed installed
Persistent/Worker and MCP browser flows pass on both platforms. Linux keeps
CDPScreenshotNewSurface enabled.

Remaining: the uncertain-job fence is host-memory scoped. Host-process death,
a destroyed control execution context and confirmed browser-exit retirement
still need recovery work. Headful/Windows and atomic focus/edit dispatch remain
open. The overall harness-parity goal stays active.


## Confirmed browser-exit recovery for clipboard and paste

Clipboard bridges now capture the existing local process identity proof and keep
their original endpoint/browser route. If that original browser is confirmed
exited, settlement retires its virtual clipboard task as failed with unknown
completion, and cleanup removes its private metadata without sending permission,
target or focus commands to a replacement instance. A changed route or lost
connection with a live/unidentified process keeps the original completion fence.
Permission sharing is scoped to the same endpoint and browser instance.

Managed paste transfers its private preparation proof into its input record and
focus lease. Confirmed process death allows key/button/focus ownership to retire
without querying dead targets or dispatching into a new browser. Other input
paths retain their existing release requirements. The shared identity helper's
two lsof deadlines each increase from one to five seconds after observed
one-second identity-query failures; failed identity discovery stays conservative.

Added `scripts/run-clipboard-exit-smoke.mjs`, which owns all browser processes,
profiles and HTTP fixtures it touches. Both hosts exercise pending write/read/
paste and live transport loss followed by SIGKILL, checking bounded failure,
retained fencing while live, reset recovery, zero clipboard cleanup connections
to a replacement browser, and fresh clipboard/native paste with exactly one edit.
It covers both same-port replacement and a changed endpoint. Small checks cover
uncertain-job retirement, dead paste input/focus release and permission cleanup
across different browser endpoints.

The overall parity goal remains active. Host-process crash recovery, destroyed
control contexts while the browser survives, unidentified/remote browser death,
headful/Windows and atomic focus/edit dispatch remain open.


Validation: macOS Node 26 passes 178/178 checks; arm64 Linux Node 24 passes
177 with one macOS-only skip (`node --test --test-concurrency=1
scripts/node-repl/*.test.mjs`). An initial macOS process-identity check failed
under its old one-second lsof limits; the final full suite passes with five-second
bounds. Both systems pass all eight new clipboard-exit cases and the previous
eight transport-loss cases across Persistent/Worker hosts, full native
text/HTML/PNG clipboard coverage, 27 paste / 21 text / 10 indexed-key cases and
the existing held-input controller. The macOS desktop text-clipboard hash stays
unchanged. The shared-helper change also passes all ten existing browser-exit
DOM-read/WebMCP cases on each system. Source-removed installed Persistent/Worker
and MCP browser flows pass on both platforms; Linux retains
CDPScreenshotNewSurface.

To reproduce the owned-process exit cases, set OCU_TEST_CHROME_EXECUTABLE to an
owned test Chromium 158+ executable and run
`node scripts/run-clipboard-exit-smoke.mjs`. The controller creates and removes
its own profiles and kills only its own subprocesses.


## General browser-input recovery after confirmed process exit

Ordinary click/drag, indexed pressKey and text insertion now acquire the existing
verified browser identity under their input lease. The existing dialog observer captures
identity through its owned browser connection; shared-host and local browser
input and clipboard services reuse its route-checked proof. Paste retains its
preparation proof. Cancellation or confirmed exit during identity acquisition stops before
target access, and confirmed exit stops remaining native dispatch. Input and
focus cleanup can then retire the original dead instance without querying it or
sending commands into a replacement browser. Live/unidentified release failures
continue retaining ownership.

Focus acquisition registers a local connection disposer before the emulation
acknowledgement. Lease cleanup invokes it only after acknowledged native release
or confirmed process exit, including a lost acquisition reply. This removes the
captured native focus connection from the host map even when native shutdown is
skipped. Dialog observers retain that browser-route-checked identity:
a known-dead browser skips auto-attach shutdown and closes its local connection.
Proof caching keeps duplicate process queries outside the already-bound paste
call, preserving the existing short cancellation deadline. It also leaves no
unowned tab-discovery connection after inventory/observer cleanup. This removes
an observed Node 24 Persistent-host unhandled rejection when reset
sent Target.setAutoAttach(false) during the dead browser's socket-error window.

Added `scripts/run-input-exit-smoke.mjs`: four input kinds, both JS hosts and
offline/same-port replacement reset yield 16 cases per platform. The controller
owns every browser/profile, holds a real admitted native input acknowledgement,
kills that original process, checks zero dead/replacement input/focus cleanup
RPCs and one local focus disposal, then verifies fresh native receiver events and
exact edit/down/up counts. Baseline click cleanup failed with connection refused
after original process exit. Small checks cover cancellation/death during
identity acquisition, local disposer timing (including acquisition failure) and
live-versus-dead dialog observer shutdown. Diagnostic instrumentation stays in
scratch files; shipped code retains caller-visible error reporting.

The parity goal stays active. Host-process crash recovery, unidentified/remote
browser death, destroyed completion contexts in a surviving browser, atomic
target validation/edit dispatch and headful/Windows evidence remain open.


Validation: macOS Node 26 passes 181/181 checks; arm64 Linux Node 24 passes
180 with one macOS-only skip. Each system passes all 16 ordinary input-exit
cases and the eight clipboard-exit plus eight clipboard-transport cases in both
JS hosts. Both systems also pass the existing 59 held-input cases (27 paste,
21 text, ten indexed-key cases and the general held suite), 53 pointer cases,
full native text/HTML/PNG clipboard controller, main dialog controller and both
early-dialog host flows. The macOS text-clipboard hash remains unchanged.
Source-removed installed Persistent/Worker and MCP browser workflows pass on
both systems. All final fixture processes exit normally; obsolete diagnostic
runs with the extra unowned observer were explicitly stopped after identifying
that retained connection. Existing 1.2-second timeout assertions remain intact.
Linux keeps CDPScreenshotNewSurface enabled.

Run `node scripts/run-input-exit-smoke.mjs` with OCU_TEST_CHROME_EXECUTABLE set to
an owned test Chromium 158+ executable. The controller owns and removes every
profile/browser it starts. No diagnostic hooks or global rejection suppression
are shipped. Native platform app code, headful/Windows and unidentified browser
exit recovery are outside this verification.


## Fixed debugging-port process identity and recovery

Local browser identity now supports a single declared nonzero debugging port
without requiring DevToolsActivePort. The endpoint and WebSocket must be local,
the declared and effective ports must match, the profile must be an existing
absolute directory, and native process metadata must match the actual TCP
listener PID and loaded executable. A stale instance file does not override a
verified fixed-port listener. Automatic-port launches retain their instance-file
port/route checks. Invalid/duplicate declarations, foreign peers, wrong ports,
listener PIDs and executables stay unverified. Command-line access still requires
Chromium --enable-automation; remote/forwarded/unidentified identity remains open.

The original helper returned no proof for a fixed-port launch without an instance
file; the expanded native-listener check reproduces that failure before the fix.
It now checks both paths, stale-file handling, invalid peers/flags and actual
listener ownership, then verifies captured process exit. No runtime retry or
input replay is added.

The three browser/input/clipboard exit controllers reuse
`scripts/tests/owned-chrome.mjs` and accept `--fixed-port`. The launcher reserves
a disposable port, obtains the debugger address from its own child stderr, and
checks the HTTP/WebSocket identity and native browser PID against that child
before any UI interaction. Fixed mode asserts the instance file is absent;
automatic mode waits for the announced file/route. Every profile and browser is
owned by the fixture and removed after use. The shared launcher also replaces
three repeated startup implementations.

Validation: macOS Node 26 passes 181/181 checks; Linux arm64 Node 24 passes
180 with one macOS-only skip. Chrome 158 on each platform passes 16 input-exit,
eight clipboard-exit and ten DOM-read/WebMCP-exit cases with declared fixed ports,
and the same 34 cases with automatic initial ports. Both JS hosts verify offline
and replacement-browser reset, retained live-transport uncertainty, fresh native
input/clipboard/tool recovery and native process identity. Source-removed
installed Persistent/Worker and MCP browser flows pass on both systems.
Linux keeps CDPScreenshotNewSurface enabled. Run any of the three exit controllers
with OCU_TEST_CHROME_EXECUTABLE set to an owned test Chromium executable and add
`--fixed-port` for the new mode.

The broad parity goal remains active. Host-process crash recovery, destroyed
completion contexts in a surviving browser, remote/unidentified identity,
headful/Windows and remaining transport/claim/atomic-dispatch coverage stay open.


## Host-owned headless browser startup

The bundled REPL can lazily start an isolated Chromium when
OPEN_COMPUTER_USE_BROWSER_EXECUTABLE names an absolute executable and no CDP
origin is configured. External CDP takes precedence. The existing cdp provider
and UI APIs stay the entry point. One private browser belongs to the host and
survives JS reset/turn boundaries. Its temporary profile/default downloads are
reclaimed on host shutdown; a detached IPC guardian also handles host-process
death. Startup validates the private browser PID, debugger route and local
process identity before exposing the endpoint. Guardian-loss recovery uses the
verified private CDP peer, with unconfirmed startup ownership retained on failure.
Installer/npm/readiness payloads carry both runtime and guardian modules.

Validation: Node tests pass 184/184 on macOS and 183/184 on arm64 Linux
(one macOS-only skip). Both systems pass Worker/source live input, clipboard,
cookies, capture, private default downloads and reset/turn survival; guardian
SIGKILL recovery and natural/SIGKILL host exit reclaim the root/profile.
Source-removed plugin installations pass external CDP and managed direct-session
plus MCP browser flows. Source-removed local/global npm packages pass external
CDP flows and managed CLI startup. Production startup keeps the Chromium sandbox;
the Linux VM controller supplies its own explicit no-sandbox exec shim.
See [managed browser](../../managed-browser.md) for configuration and limits.
Headful/Windows, simultaneous host/guardian loss during startup, durable recovery
and broader external-browser host-crash behavior remain open. The overall parity
goal stays active.

The macOS npm external-browser fixture initially hung in Page.navigate. Matching
the existing owned-browser fixture with --use-mock-keychain restored both local
and global external-CDP flows; the production managed launcher already included
that flag. Linux uses the unchanged platform branch.

## Browser-wide turn-owned native WebMCP discovery

Browser inventory and tab use now observe all HTTP(S) page targets in the
configured CDP browser for that turn, including previously unbound and later
opened/navigated pages. Native tools are only discovered; collections and calls
still require explicit fetch/call. Target closure or non-web navigation releases
the observer, including rapid return while a previous connection closes. Turn,
reset and close release all discovery connections; the next browser operation
resubscribes. The shared 128-tab/error budget and disconnect failures produce
coalesced partial-discovery diagnostics. Older browsers remain quiet.

macOS passes 185 Node checks; arm64 Linux passes 184 with one macOS-only skip.
Both platforms pass the new owned browser-wide controller in Worker/source and
source-removed installed modules. Fixture counters/ownership records verify no
automatic calls or tab claims. Existing full WebMCP native imperative/declarative,
OOP frames, cancellation/crash/reset tests pass on both. Installed external and
managed browser flows plus private-profile host/guardian exit cleanup also pass.
Focused checks cover observer-budget refusal, rapid navigation during disconnect,
observer loss, closed-owner fencing and quiet Chrome 156 fallback.

Full extension/in-app transport, claims/takeover, real consent dialogs, headful,
Windows, remote/unidentified exit and broader external-site behavior remain open.

## Managed headful presentation and visibility

Added explicit OPEN_COMPUTER_USE_BROWSER_MODE=headful. Headless remains the
default, and external CDP configuration takes precedence. Startup validates mode,
launches the private browser through its guardian, minimizes native windows and
confirms state before exposing the endpoint. The Chrome startup flag alone did
not reliably minimize in the isolated Linux environment, so explicit confirmed
window control is used.

Managed headful browsers advertise visibility.get/set. Host-serialized native
window changes preserve bounds/state and tab selection; explicit visible options
apply before tab creation. Reset/turns retain presentation and browser state, and
shutdown waits for accepted visibility work before reclaiming the browser/profile.

macOS passes 187 Node checks; arm64 Linux passes 186 with one macOS-only skip.
Owned Linux Xvfb/Openbox tests independently verify native window-map state for
startup, show/hide and multi-window restoration, background/visible creation,
native text input, invalid requests and reset/turn retention. Source and
source-removed installed real MCP entries pass presentation, hidden js_reset
retention and shutdown cleanup; installed Worker/source sessions pass headful
flows and verified guardian-loss recovery. Headful natural/SIGKILL host exit also
reclaims browser/profile. macOS default-headless lifecycle and installed browser
flows pass. Installer headful tests require --headful and the documented X11 tools.

Physical desktop/macOS headful, Windows, takeover arbitration, headful clipboard
and durable recovery remain unverified/open. Native clipboard/paste continue to
require the isolated verified-headless backend.

## Managed headful native clipboard and paste

The verified host-owned headful browser can now use the actual system/display
clipboard. Its current endpoint, debugger socket and captured live-process proof
authorize access before helper/permission creation. Unowned/externally configured
headful clients are rejected before writes, while headless retains its process
virtual clipboard. Existing native job settlement and input/focus leases handle
text/HTML/PNG and trusted native editor paste.

Headful helpers are hidden native targets held by a dedicated browser connection.
They stay outside the Chrome tab strip. Cleanup settles jobs and waits for the
connection to disconnect; failed close retains its owner. Disconnect testing
exposed an overbroad read-path guard in cleanup; cleanup now accepts a disconnected
helper so known completed work can reset safely. Uncertain native completion
retains the existing input fence. Native visibility skips targets without windows.

macOS passes 189 Node checks; arm64 Linux passes 188 with one macOS-only skip.
Owned Linux Xvfb/Openbox/Gtk 3 checks prove native GTK/Chrome clipboard interop,
Unicode text, PNG, trusted text/HTML/image paste, sanitization, hidden helpers,
foreign-client refusal without clipboard changes and helper disconnect/reset
recovery. Source/Worker, real MCP and source-removed installed payloads pass these
flows, including hidden-window reads and lifecycle cleanup. Both platforms pass
full headless clipboard regressions; macOS system clipboard remains unchanged.

Headful data is shared with other apps/users on that display and may outlive host
exit through a clipboard manager. Physical desktop/macOS system clipboard,
Windows, external headful support, cross-host coordination, takeover arbitration
and durable recovery remain open.

## Managed headful empty-window reopening

Closing every visible window could terminate the managed process and break the
next browser action. Headful startup now uses Chromium process keep-alive. Native
Linux session cleanup also deleted session cookies when the last window closed,
so the temporary owned profile sets the native session preference to preserve
them. These changes affect only the private managed browser; the guardian still
removes its profile on host shutdown.

Visibility treats an empty browser as hidden: hide is a no-op and show opens one
blank window. Startup continues to require and verify its first minimized window.
Explicit background creation and omitted visibility in a hidden browser remain
hidden, with a post-creation check before navigating to the requested URL.

Owned Linux source/Worker and source-removed installed/MCP flows pass repeated
window closure/reopening, native window mapping, background/default-hidden and
visible creation, unchanged PID/profile, session-cookie delivery on a fresh HTTP
request and retained native clipboard data. Empty show opens exactly one blank
tab without restoring closed pages. The X11 checker now handles IDs that were
confirmed destroyed between enumeration and inspection; other errors still fail.
Node checks pass macOS 189/189 and Linux 188/189 with one macOS-only skip. Existing
clipboard, visibility, guardian/host exit and macOS headless lifecycle checks pass.

Physical desktops/macOS headful, Windows, takeover arbitration, cross-host
coordination and durable recovery remain open. Upstream behavior and the native
session rule are linked in the managed-browser documentation.


## Host-local user-tab claims

Added browser.user.openTabs()/claimTab() with native provider ID, last-access ISO
time and tab-group title through extension protocol 4. Reused the stable session
owner table for exclusive binding and tab-scoped broker requests. Inventory is
passive; conflicting sessions and old bound handles fail before interaction.
ID binding checks ownership before browser discovery so another session's active
dialog/action can finish normally.

Unmarked original user pages release open at turn/reset/close; marks retain claims
across the idle boundary. Uncertain explicit closure keeps ownership until cleanup
confirms it. First-seen/seeding tracking protects preexisting and idle-handoff
children; active popup descendants remain ephemeral, including reverse native
ancestry order. Browser-wide management, raw clients, other hosts and physical
user takeover remain outside this host-local coordinator.

Added one owned native claims controller to source-removed installation coverage
and four focused lifecycle checks. Updated cross-session clipboard/selection/dialog
fixtures for exclusive tab access. Both macOS/Linux Chrome 158 session types pass
native metadata/group/order, passive inventory, explicit/implicit and racing claims,
stale handles/records, original retention, popup cleanup and handoff/reset. Node:
macOS 193/193; Linux 192/193 with one macOS-only skip. Existing clipboard, selected
session and full dialog recovery checks pass on both systems. Installed macOS
headless and Linux headful/native clipboard/visibility/empty-window/MCP lifecycle
checks pass. The owned X11 observer accepts the spaced Bad Window spelling when a
window disappears between enumeration and inspection; other failures propagate.

Concurrent session reset now shares the browser dialog observer shutdown; a new
observer waits for that shutdown before attaching. The native claims controller
retains simultaneous reset checks after racing claims on both session types.


## Same-machine independent-host tab leases

Extended ownership beyond one Node host with a small private filesystem lease
module. Atomic complete-record publication uses browser instance IDs and stable
session tokens; endpoint aliases share a namespace. Releases match the original
generation and run after native resources settle. Native creation checks the
claim directory first; private creation nonce pages reject foreign binding before
lease publication. Foreign nearest-opener claims protect unleased popups; existing
direct child claims preserve their boundary. Unclaimed preexisting/idle children
remain conservatively fenced until their foreign opener releases.

No host-death or TTL reclamation is used because accepted native work can continue
after the host exits. Crash/reset retains the claim, while a new browser has a new
namespace. Temporary records can outlive a closed browser. Cross-machine/raw
clients, global management arbitration, physical takeover and Windows remain open.

The source and source-removed installed controllers exercise independent hosts,
endpoint aliases, native content, old handles, created tabs/popups, retention,
release/races, SIGKILL/reset fencing and new managed browser identity for both JS
session types on macOS/Linux Chrome 158. Focused checks cover atomic races,
private/symlink directories, malformed records, owner-only release, direct child
boundaries, pending nonce targets and uncertain-close retry. Node: macOS 197/197;
Linux 196/197 with one macOS-only skip. Existing dialog/clipboard flows and Linux
installed headful visibility/native clipboard/empty-window/MCP checks pass. The
unowned-headful fixture now uses its own tab to reach clipboard authorization.

Source installer, npm staging, CLI doctor and its copied-runtime fixture include
the new module. A browser-only npm build/tarball contains both runtime and plugin
copies. No publication or release was performed.


## Management mutations respect shared ownership

Added extension protocol 5 affected-window plans and native-to-CDP target mapping,
plus a scoped SHA-256 fingerprint rechecked before native audit/write. The host
checks the complete scope before publishing claims. Tab/group source/destination
windows participate; window focus/state and last-tab closure include other windows.
Unfocused blank windows and bookmarks can remain independent of foreign tabs.

BrowserTabClaims now provides a shared layout transaction. Management holds it
through plan/reservation/native acknowledgement; new claims, native creation and
explicit/cleanup closure enter it too. Existing owned observations/input can
continue. Snapshot reservations are caller-owned, preventing cross-owner gate
cycles. Reentrancy is confined to a live async scope. Pre-dispatch cancellation
reserves nothing and sends no write; accepted native writes drain. Lost completion
or killed hosts retain the gate until browser restart, with no TTL/replay/unlock.

Expanded the owned independent-process controller with native tab/group/window
refusals and unchanged audit/state, independent bookmark/background-window changes,
held native dispatch through JS timeout/acknowledgement, and SIGKILL/reset/new-page
fencing. Both JS hosts pass on macOS/Linux Chrome 158 from source and after source
removal/installation. Ordinary organization, worker idle/restart, dialogs,
clipboard and native selected-tab/session checks pass; Linux installed headful
visibility/native clipboard/empty-window/MCP checks also pass. Node: macOS 200/200;
Linux 199/200 with one macOS-only skip. Focused checks verify affected scopes,
stale/missing plans, no partial ownership, pre-dispatch cancellation, accepted/lost
write handling and gate lifetime across delayed callbacks. Grouping in the original
user-tab fixture now ends its ownership turn before the next session claims it.

The browser-only package build continues to include the updated runtime/extension.
Raw clients, physical/page-driven races, cross-machine and visibility coordination,
Windows and native crash takeover remain open. Upgrade/reload older extensions.


## Managed visibility shares ownership and completion fencing

Routed managed visibility writes through the shared layout coordinator. All native
window-bearing page targets must be claimable, and target/window/bounds identity
is rechecked before mutating. Empty show claims its new blank page under the gate;
empty hide and internal private-profile startup minimization retain their existing
behavior. Managed tab creation's implicit visibility calls share these checks.

BrowserRuntime tracks queued/active writes per turn resource owner. Preparation
cancels before dispatch, accepted native work drains through timeout/reset/close,
and unknown completion stops the JS owner and keeps the gate. Reset cleanup can
recover only after the original browser process proof confirms exit. Native CDP
rejections and pre-dispatch failures remain inspectable/retryable. Added runtime
cancel/settlement to both core JS session cleanup paths.

The owned Linux source/installed fixture checks same-host and independent-process
alias claims, unchanged native map/cache on rejection, observation without claims,
layout revalidation, actual minimization followed by delayed acknowledgement,
blocked cross-host creation during JS timeout, stopped JS after lost reply, and
browser-close/reset/new-instance recovery for both hosts. The fault fixture sends
real native window commands before withholding the host completion signal.
Existing native GTK clipboard, cookies, hidden/background/visible/empty-window,
real MCP and host/guardian cleanup remain passing. macOS/Linux browser management,
dialog/clipboard and installation regressions pass. Node: macOS 204/204; Linux
203/204 with one macOS-only skip. No dependency, public configuration or CI changes.

Physical desktop/macOS headful, Windows, raw/physical/page-driven actors, external
visibility, cross-machine coordination and native crash takeover remain open.


## Dialog waits preserve locator action budgets

Added owner-bound dialog watcher revisions and pending-change settlement on
normal end or teardown. Locator actions and file-chooser setFiles pause active
budgets while known owned dialogs wait for the agent, then resume remaining time
across repeated prompts. The pinned Playwright public AbortSignal cancels expired
or torn-down work, including timeout=0 actions. Lifecycle IPC long-polls have no
request timeout. Existing native cleanup acknowledgement and resumed-action error
reporting remain intact; no dependency or configuration changes were needed.

Owned Chrome 158 source and source-removed installed tests pass on macOS and
arm64 Linux in both JS session types: confirmation after >10s, sequential prompt
pauses, file selection dialogs, missing locator timeout, resumed navigation
failure and timeout=0 reset cleanup. Existing dialog/clipboard, installation and
Linux isolated headful/MCP regressions pass. Node: macOS 207/207; Linux 206/207,
one platform-specific skip. Browser-only npm build/pack content checks pass.

The phase's macOS preflight found a locked session with no active displays, so
physical headful validation remains open. Cross-process observer initialization
during a preexisting dialog, sole-callback takeover, raw CDP/drop/navigation-wait
deadline coordination and Windows remain outstanding.


## Inventory remains responsive during another host's dialog

Decoupled browser metadata registration from renderer-level dialog and WebMCP
initialization. Initial tools now arrive asynchronously; incomplete discovery
notices include pending pages. Explicit per-tab tool fetches retain their existing
readiness and frame checks. Passive dialog close/reset cancels its own pending
Page.enable initialization when the entry loses its final owner. Owned dialogs,
new-target capture-before-resume and native action cleanup retain their barriers.

Whole-browser Playwright setup rejects live pending/failed page observers with
recovery guidance. It checks current page IDs and rechecks readiness after that
lookup, preventing closed targets and completed initialization from causing a
stale refusal. Added focused cancellation/readiness assertions and an owned
independent-process smoke controller. Installed tests run that controller after
source relocation. The early-popup fixture now expects current foreign-session
binding rejection; layout fencing checks exact page IDs and excludes worker
inventory churn while retaining its blocked native creation assertion.

Owned Chrome 158 source and current-runtime installed payloads pass both JS hosts
on macOS/Linux: inventory before/after the 10s page-observer deadline, passive
close/reset preserving the original dialog, explicit refusal and post-response
fresh binding recovery. Existing early/popup dialogs, capture-loss retention and
external recovery, asynchronous initial/new/navigated/closed WebMCP discovery,
real dialogs and installed MCP regressions pass; Linux isolated headful/MCP also
passes. Node: macOS 209/209; Linux 208/209, one platform-specific skip.
Browser-only npm build/pack confirms both copied modules match current source.

Capturing/responding to dialogs predating another host's observer, sole-callback
takeover, broader raw action deadlines, physical macOS headful and Windows remain
open. No dependency, version, configuration or CI changes.


## Native drop deadlines resume after every dialog

Replaced drop's one-shot timer clearing with the shared dialog active-time budget.
The original native reproduction waited beyond its 3s resumed budget until the
whole JS run expired at 7s. The pinned Playwright public AbortSignal now cancels
target resolution/trial hover, and the stage loop checks cancellation before each
native dispatch. Native release still waits for cancellation acknowledgement and
retains ownership on failure. Standalone operations also receive an active budget
when no dialog watcher is supplied. No dependency, option, version or CI changes.

Owned Chrome 158 source and source-relocated installed controllers exercise both
JS hosts on macOS/Linux: delayed/repeated prompts, resumed hidden-target timeout,
missing-target timeout, no late/duplicate drop, unlimited-action reset and fresh
trusted delivery. Existing macOS full MIME/file/frame/shadow/native-owner and
cleanup failure/retry checks pass in both hosts. Their competing input now uses
its own tab and retained reset targets explicitly request handoff. Node: macOS
210/210; Linux 209/210, one platform-only skip. Browser-only build/pack checks
both production copies against the current source.

Measured Linux restored-target trial checks at roughly 17s; recovery explicitly
allows 30s while expiry assertions retain 3s/100ms and the product default remains
10s. A separate pre-change runtime reproduces the broad Linux iframe fixture's
same default-10s failure. Broader Linux actionability latency and full MIME/frame
coverage remain open, alongside raw navigation/wait deadlines, physical/headful
drop and Windows. Focused deadline checks do not establish that broader matrix.


## Raw navigation owns its native deadline and cleanup

Moved goto/reload/history dispatch into the host dialog watcher's scope, with a
separate native CDP connection and per-tab navigation records. Added timeoutMs
options with a default 10s active budget and zero-unlimited mode; known owned
dialogs pause remaining time. The original reproduction failed after an 11s
beforeunload wait. Native errorText now propagates through the watched action
and final dialog response, preserving explicit beforeunload cancellation.

Cancellation waits for Page.stopLoading acknowledgement, original command receipt
and renderer progress. Failed cleanup retains ownership and stops owner reuse;
reset retries after dismissing owned dialogs. Confirmed target closure or
original-browser exit retires native records without replay. A proven browser
exit also clears saved dialogs before cleanup. Reused binding preparation keeps
claims, viewport synchronization and tool discovery; admitted watches promote
passive observation so asynchronous dialogs get owner cleanup across turns.

Owned Chrome 158 macOS/Linux both JS hosts pass source and current-runtime
installed controllers after source relocation: delayed goto/history/reload,
deferred native error, stalled HTTP deadline, actual native stop with held
acknowledgement, lost-stop retention/retry, admitted unlimited reset/JS timeout,
retained-turn asynchronous dialog cleanup, target closure and original browser
exit with/without a modal followed by fresh-browser recovery. Existing native
dialog/popup/discovery and Linux installed headful/MCP regressions pass. Node:
macOS 211/211; Linux 210/211, one platform-only skip. Browser-only build/pack
checks both production copies. No dependency, release or CI changes.

Other raw CDP/developer-capability and navigation-wait deadlines, unidentified or
remote transport recovery, Linux actionability latency, physical/headful raw
navigation and Windows remain unverified.


## Dialog-aware navigation waits

expectNavigation, waitForURL and waitForLoadState now hold observer watches that
coexist with independent same-owner input. Async callback scopes link child
watches to owner-validated parents, propagating same/cross-target dialog changes.
The outer wait yields control for response while callback actions stay awaited.
Native frame/URL/load waits share a dialog-paused active-time budget, use public
AbortSignals and report its concrete timeout reason. Callback failures retain
priority; admitted children drain before scope end, and late scoped inputs/waits
are refused. Closed owners cannot create fresh watches. Unlimited wait lifecycle
RPCs no longer expire after 30 seconds. Connection setup retains its own policy.

Node suites pass: macOS 212/212; Linux 211/212 with one platform-only skip.
Owned Chrome 158 source and source-relocated current-runtime installations pass
both JS hosts on macOS/Linux: modal handoff, repeated/async dialogs, cross-target
callbacks, raw goto nesting, standalone wait/input, resumed timeout, callback
value/failure/drain, late scoped action refusal and reset. Worker unlimited wait
survives 31 seconds before native navigation completes it. Build/pack checks both
copies of both changed production modules. Existing dialog and early-dialog
regressions pass. Console fixture now uses an independent target for its second session and
explicit handoff for its retained primary tab, matching current ownership rules;
resource-owner and closed-target assertions follow the current runtime. Its
console/navigation/reset/timeout/close/startup checks pass.

No dependency, release or CI changes. Asynchronous cross-target dialogs after a
child watcher ends, arbitrary callback JS cancellation beyond the REPL budget,
broader provider races, other raw CDP deadlines, Windows and physical desktop
verification remain open. Full parity remains active.


## Browser AX semantic state and compact output

Native browser AX output previously discarded checked/disabled/expanded and
other semantic properties, making checkbox results unobservable through AX.
It now retains semantic state, descriptions and accessible hierarchy with
Chromium node IDs. Ignored ancestors flatten. InlineTextBox duplicates are
omitted because Chromium assigns new layout IDs on every CDP attachment.
Native and browser output share the existing compact line-replacement diff
algorithm. Return values stay full; only emitted observations advance the
per-binding baseline. Initial binding output establishes it. Screenshots,
loader/URL/fragment changes and failed page reads/Playwright operations reset it.
Boolean observation options validate before page access.

Source plugin installation, CLI test fixtures and both npm runtime copies now
carry the shared module. Existing browser/held-input/pointer/installed-MCP index
extractors accept hierarchy indentation. Main browser smoke sessions use their
own targets under current exclusive ownership, including cancellation recovery;
failed file selection verifies unchanged source state independently of Worker
fixtures.

Owned Chrome 158 both JS hosts pass source and source-relocated current-runtime
installed controllers on macOS/Linux: checkbox true/false, mixed pressed state,
disabled/expanded/selected/required/readonly/description, native AX click results,
compact/full/unchanged output, unseen-read history, screenshots, failures and
cross-/same-document navigation. Node suites pass 213/213 on macOS and 212/213
on Linux with one platform-only skip. The main browser regression passes AX
editing, key/paste/scroll, pointer/drag, locators/frames, cancellation recovery,
navigation waits and chooser flows. No dependencies, release or CI changes.

Native iframe AX indices/input routing, broader provider/state fidelity, physical
macOS/headful and Windows proof remain open. The full parity goal stays active.


Final output-owner audit held an actual native AX response, opened a native
alert, then resumed initial binding in the next JS call. This reproduced an
initial observation trying to emit through its old output owner. Initial reads
remain silent; a private one-shot callback emits and seeds a baseline only when
the original binding call completes without yielding. Resumed background reads
never output. PersistentJavaScriptSession source/installed Chrome probes verify
response success and the next full baseline after handoff. The regular semantic
matrix still runs in both hosts.

Linux full source-relocated installation passed standalone/managed MCP, both
hosts, native tab coordination, deadline suites and isolated headful visibility,
clipboard/GTK interop, private-profile recovery and shutdown. This broad run
preceded the final initial-output correction; exact final modules are verified
separately through fresh source-relocated installs and early-dialog regressions.


## Native iframe AX and indexed input

Native observation now joins accessible same/cross-origin iframe trees under
native owners. Root frame trees omit OOP targets, so discovery combines them
with child targets after native parent/owner proof. Frame inventories recheck
around capture and retry only transient changes. Binding-local monotonic indices
retain frame, loader/URL ancestry and exact AX/backend node identity; renderer-
local collisions and reused AX IDs cannot alias another actionable node. Hidden
frame owners exclude their descendants. Document roots include frame URLs.

Indexed click, text/key/paste, editing/selection and region/document scroll use
exact native frame agents. Isolated worlds bind nodes to their observed document
and validate ancestry again after resolution. Child focus uses the bound object.
Pointer checks map affine OOP content quads with subpixel precision, verify native
and exact frame-local hits, and refuse covered or changed targets before each
press. Root/remote widget rendering barriers handle compositor routing after
scroll/transform changes. Native drop uses the shared frame flattening/hit-test
module while preserving its integer child-coordinate policy. Input cancellation
and release retain the existing host lease and root connection lifetime.

Both JS hosts pass owned Chrome 158 source/current-runtime installed controllers
after source relocation on macOS/Linux: same/cross-origin/nested/return-process
frames, native trusted receivers, field/sibling isolation, editing/selection,
region/document scroll, modal resume, affine transforms, root occlusion, hover
identity changes, actual child-key receipt followed by reset/release, same-name
reload/detach refusal, process-swap rebinding and duplicate/hidden-frame isolation.
The native Linux probe required render readiness beyond DOM geometry, and the
subpixel unit case distinguishes native pointer from legacy integer drop routing.
Node: 216/216 macOS, 215/216 Linux with one platform-only skip. Existing browser,
AX output/initial-dialog and mixed-MIME/native frame drop regressions pass.
Installer, CLI fixtures and both npm runtime copies include browser-frames.

Broader dynamic/provider/crash/shadow/IME cases, arbitrary perspective and mixed
DPI/zoom, atomic dispatch after final validation, browser secondary AX actions,
physical desktop and Windows remain open. No new dependency, release or CI work.

Final frozen-code Linux browser-only installation passes the complete
source-relocated pipeline, including both hosts, frame-native controller,
standalone/managed MCP, isolated headful visibility, text/HTML/PNG clipboard and
GTK interop, private-profile recovery and shutdown. Seven production modules
match both built npm runtime copies. No physical desktop or Windows claim.

## Projective native frame geometry

Native frame content quads now use a validated projective map and inverse,
including mirrors. Convex target polygons clip through same-process frame owner
quads and each remote/root viewport before selecting an interior input point.
Native and exact frame-local hit checks and document/lease fences stay in place.
Folded, singular and horizon-crossing geometry refuses; ancestor quads validate
before Chromium scrolling, which can stall on a zero-width frame.

The existing native frame controller now checks two transformed OOP boundaries,
perspective plus mirrors, a clipped diagonal target whose bounding-box center
misses, root occlusion under perspective, and zero-width refusal without receiver
input followed by restored operation. macOS Chrome 158 relocated current-runtime
installation passes both JS hosts, including all prior frame/document/reset
regressions. The exact final runtime also passes both hosts in the Linux
source-relocated installation, including all new geometry cases. Native drop adds a two-OOP perspective fixture and passes the macOS
trusted receiver/MIME/file regression. Node: 217/217 macOS; 216/217 Linux with one
platform-only skip. Seven production modules match both packed npm runtime copies.

Mixed DPI/zoom, broader 3D/provider/crash/IME/shadow cases, atomic final dispatch,
secondary browser AX actions, physical desktop and Windows remain open. Full
harness parity remains active. No new dependencies, release or CI work.


The final frozen-code Linux source-relocated browser-only install pipeline exits
successfully, including both geometry/native frame hosts, standalone/managed MCP,
isolated headful visibility, text/HTML/PNG clipboard with GTK interop, retained
private profiles, lazy launch and shutdown. Physical desktop/Windows remain open.


## Root indexed-pointer geometry and closed shadow roots

Root indexed click now carries its observed native root frame descriptor and
uses the existing frame polygon/document/native-hit path. Removed the root-only
bounding-box midpoint branch, which failed a clipped diagonal control, and its
document-only hit check, which could not address shadow descendants. The native
pointer boundary requires a document path and accepts the root-only descriptor;
keyboard and screenshot-coordinate paths retain their existing contracts.

The existing owned AX controller reproduces the old clipped-root failure and now
passes both JS hosts in source and source-relocated current-runtime installations
on macOS/Linux Chrome 158. It proves trusted clicks on the clipped control and
two nested closed shadow roots, external cover refusal without receiver input,
and restored operation. AX semantic/diff and initial-dialog output-owner checks
also pass. Node: 217/217 macOS, 216/217 Linux with one platform-only skip; focused
input validation covers missing document paths and cancellation/hover/identity
refusal. macOS generic browser regression passes. Seven production modules match
both packed runtime copies. No dependency, release or CI work.

Secondary AX actions still require an appropriate native action transport; the
current CDP Accessibility surface provides observation commands. Broad shadow/
provider/IME, mixed zoom/DPI, atomic final dispatch, physical desktop and Windows
remain open; full harness parity stays active.


## Panned visual viewport native input and drop readiness

Owned Chrome probes reproduced visual/document coordinate differences at nonzero
pinch-pan offsets. Native DOM hit queries now include layout scroll plus visual
pan. Shared frameDOMPoint converts agent-root visual points to isolated-world
layout coordinates; same-process frame inverses keep native visual coordinates.
Pointer preparation accepts scroll-induced pan and records its resulting
geometry; already selected points retain strict pan checks before pressing.

Native drop replaces trial-hover hit checks with pristine preparation scrolling,
visible/stable waits, native agent routing and isolated exact composed-tree hits.
Offscreen child widgets scroll before animation-frame waits. The target check
handles assigned slots and stops at document roots even with named properties.
Readiness retries retain the action budget, abort checks, native lease and frame/
document fences. Existing native stages, file/MIME delivery and cleanup persist.

The owned AX controller now pans with trusted touch dispatch, stops movement and
asserts stable nonzero offsets before every click/drop. Both JS hosts pass source
and source-relocated current-runtime installation on macOS/Linux Chrome 158:
DPR 1/2/1.25, page scale 2/1.5, mixed CSS zoom, root/SOP/OOP trusted clicks and
panned drops, plus offscreen preparation-scroll input. The prior runtime fails
the panned root fixture. Existing AX semantics/diffs, closed-shadow/root clipping
and initial-dialog output checks also pass.

Frozen source generic native drop passes the default 10s budget on both platforms,
covering slot/named-document targets, native MIME/file/protected data, nested and
return-process/perspective frames, duplicate/shadow owners, reordering, prompt
navigation, cover deadlines, modal/reset/timeout/close and cleanup retry. Installed
both-host drop budget controllers pass repeated prompt pauses, resumed-readiness
expiry, no late drop, missing targets, unlimited reset and fresh-input recovery.
Node: 218/218 macOS; 217/218 Linux with one platform-only skip. Seven production
modules match both packed npm runtime copies. macOS generic browser regression
also passes. No new dependencies, release or CI work.

These are owned device-emulation checks. Physical mixed-DPI, wider browser zoom/
provider/headful/Windows, remote identity, secondary AX transport and atomic final
dispatch remain open; the full harness parity goal stays active.


Indexed pointer composed ancestry also stops at document roots and follows
assigned slots/DOM parents/ShadowRoot hosts. The root occlusion fixture now has a
named host form; frozen-code source and relocated-installed both-host controllers
pass on macOS/Linux after this final boundary check. Final Node counts remain
218/218 and 217/218 with one platform-only skip; packed runtime bytes rechecked.


### Raw CDP dialog clocks and cancellation

Raw debugger sends retain their protocol Promise/result and count command time
outside dialogs observed by active root/child Page streams. Successful stream
disable, child detachment and origin rotation clear retired paused sources;
late detached events cannot pause commands again. The shared native WebSocket
transport now propagates capture cancellation through pending handshakes and
responses, and individual command cancellation removes its waiter while ignoring
late replies. Page execution effects still need explicit recovery.

The prior debugger module fails the held-dialog fixture. Chrome 158 source
macOS/Linux and relocated-installed macOS/Linux both-host checks cover root/OOP
sequential prompts, stream toggles, exact protocol values, resumed expiry with
retained bindings, unlimited reset, actual blocked-handshake socket closure and
fresh captures. Existing macOS CDP timeout/termination/pause and AX delayed-output
and initial-dialog checks pass. Node: 222/222 macOS, 221/222 Linux (one platform
skip). Eight modules match both packed runtime copies. Documentation records
background-Promise usage and bootstrap/unobserved-dialog/event-wait limits.


Final frozen-code Linux source-relocated installation pipeline passed, including
both-host raw dialog clocks, AX output/initial-dialog guards, native iframe input,
standalone/managed MCP, isolated headful multi-window behavior, text/HTML/PNG
clipboard and GTK interop, profile recovery, lazy startup and shutdown. Eight
modules in the actual running Linux installation also matched frozen source
byte-for-byte. Full harness parity remains active.


### Uncaught browser errors and cancelable log startup

Developer logs now include page Runtime.exceptionThrown events: uncaught errors
and unhandled Promise rejections share existing filters, bounds, timestamps and
source URLs with console output. Native descriptions supply error/stack text
without executing page getters. Runtime startup replay stays excluded; owner
reset also cancels actual blocked discovery and WebSocket handshakes.

The old runtime fails the uncaught-error/rejection fixture. Chrome 158 source
macOS/Linux and source-relocated installed macOS/Linux both-host checks pass exception
and console capture, caught-error exclusion, filtering/caps, navigation, cached
history exclusion, session isolation and reset/timeout/close. Node: 223/223 macOS,
222/223 Linux (one platform skip); macOS general browser and CDP regressions pass.
OOP/worker exceptions, network/browser logs, physical/Windows/remote coverage and
full harness parity remain open. No new dependency or CI.


Final frozen-code source-relocated Linux installation pipeline passed: both-host
console/exception fixtures, tab claims, independent hosts, dialog/navigation/drop
budgets, raw CDP, AX and native iframe input, standalone/managed MCP, isolated
headful multi-window behavior, text/HTML/PNG clipboard with GTK interop, profile
recovery, lazy launch and shutdown. Eight actual running installed Linux modules
and both npm runtime copies matched current source byte-for-byte. No new runtime
dependency or CI. The full harness parity goal remains active.
