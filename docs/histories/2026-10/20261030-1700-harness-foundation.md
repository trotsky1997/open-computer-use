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
