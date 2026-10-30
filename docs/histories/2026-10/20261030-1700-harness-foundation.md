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
