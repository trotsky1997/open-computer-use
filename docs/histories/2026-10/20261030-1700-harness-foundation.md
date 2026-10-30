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
