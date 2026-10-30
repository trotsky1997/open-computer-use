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
