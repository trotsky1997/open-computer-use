# Computer-use harness foundation

## Goal

Build an independent, open computer-use harness on the upstream runtime, using the currently exposed Codex computer-use interface as a behavioral reference. Keep native permission and input boundaries explicit. Evidence comes from documented interfaces and executable tests; matching names alone does not establish behavioral parity.

## Baseline

- Based on upstream `a7fdec1`. The existing fork's main branch is older and is left intact.
- Native app binding and persistent JavaScript execution already exist. `selectText` now accepts `selectionType` at the JavaScript boundary and maps it to the native `selection` argument.
- Current Codex exposes browser discovery, tab binding, browser-specific interaction and navigation alongside native apps. An opt-in CDP provider now supports browser/tab discovery, binding, lifecycle, AX and PNG observations; element-targeted click/type/key/plain-text paste/DOM scroll/setValue/selectText are implemented; Playwright locators are implemented; extension/in-app transports remain open.
- Current Codex exposes accessibility state diffs and a full-state option. The REPL now emits bounded line-replacement diffs while returning full native snapshots to JavaScript. Screenshot observations and failed native calls discard history; option changes force full output. Native index generation remains unchanged.
- The current Codex API includes app paste, click modifiers and duration, coordinate scrolling and other platform-specific details. These require capability-by-capability investigation and runtime validation.

## Next steps

1. Host-owned focus leases now cover Worker timeout/reset/close/exit and cleanup retry. Continue to establish repeatable, privacy-safe native app scenarios for observation, input, stale indices, failures and session reset; measure behavior with the existing fixture before expanding the surface.
2. Extend the CDP element-input and Playwright locator providers with frame transform/zoom validation, isolated read-only evaluation, remote artifact delivery, broader event ownership and host-crash recovery and broader platform coverage. Screenshot-bound coordinate click/scroll and pointer-widget drag are implemented and exercised on real Chrome. Validate stale target handling, focus and native-vs-DOM interaction independently; extend to extension and in-app transports.
3. Validate the new output diffs on real multi-window applications, especially native index changes and screenshot-only observations. Full output is available with `disableDiffing: true`.
4. Add remaining input operations according to observed platform capabilities and test on real desktops. Document unsupported behavior clearly.

## Viewport and screenshot phase

Browser capability discovery now exposes a host-owned viewport set/reset lease.
PNG/JPEG viewport, full-page and cropped captures have real Chrome checks at
native 1× and forced 2×, including coordinate mapping, lease cleanup and observer
failure recovery. See [viewport and screenshots](../../browser-viewport.md).
Mixed-DPI hardware, zoom, headful/cross-platform and external-client behavior
remain in the full parity audit; the broader goal and next steps stay active.

## Validation boundaries

The first change has REPL mock coverage only. Browser discovery/lifecycle/observations were validated on a disposable macOS headless Chrome with a local HTML fixture, including Worker inventory failure isolation. Browser input was exercised on the same headless Chrome: Unicode, select-all replacement, multiline insertion, visible clicks, scroll feedback, and covered/stale index rejection; Worker input also passed. Real native desktop behavior, headful browser focus, Windows and Linux parity remain open. Do not infer capabilities from API shape alone.

The expanded current-reference capability audit is tracked in [harness parity](../../harness-parity.md). It preserves unimplemented browser/host capabilities and validation gaps.


## Native drop phase

Host-owned locator.drop now sends trusted HTML/MIME/file data with fresh
Playwright actionability checks and native frame/document/viewport guards per
stage. Real Chrome covers protected data mode, default rich editor insertion,
same-target iframe drops, modal response/reset and action timeout recovery.
Nested cross-process frames now bind native identities and have real Chrome
checks including scroll and identical-URL separate targets. Same-process siblings
now bind native DOM/shadow owner identities and verify the actual Core frame.
Reordering and prompt-triggered document replacement have real checks, including
failure propagation from the resumed action. See
[native drag-and-drop](../../browser-drop.md). The full goal stays active.


## Native held-click phase

The live API reference confirms key/durationMs click options. macOS targeted
implementation, schema gating, graceful release and native replacement barriers
are implemented; an assert-based Swift check emits no GUI input. Real AppKit
verification is pending normal Mac unlock. Native press-key duration now shares
the same registry and no-GUI checks. Continue real held-key/click checks and
remaining native paste/scroll operations, other platforms and the broader browser/host audit.
See [native held clicks](../../native-held-clicks.md). The full goal stays active.


## Browser held-click phase

Raw CDP click key/durationMs now uses host-owned connections and release state.
Managed pointer leases are shared with data drops and checked by raw input and
locator action entry points. Press-key duration now shares host-owned releases and lease-protected focus.
Continue full keyboard/layout coverage, legacy/native transport
ownership, focus-loss/headful/platform checks and the broader feature audit.
See [browser held clicks](../../browser-held-input.md). The full goal remains active.


## Turn and tab ownership phase

Host-owned target creation, popup ancestry, per-turn retention marks and immediate
MCP turn-ended cleanup are implemented. Idle Worker contexts survive; active
execution is interrupted, and old API callbacks carry a fenced turn ID. Failure
keeps ownership until retry succeeds. Source sessions now share dispatch, release barriers, idle context retention and
callback ownership checks. Continue user takeover/claims, crash recovery and the broader feature audit.
See [tabs and turn boundaries](../../browser-tabs.md). The full goal stays active.


## Tab CDP developer phase

Tab capabilities expose permitted raw CDP commands, event cursor paging/waiting,
attached child selectors and host-owned per-turn capture cleanup. Source/Worker
Chrome probes cover command deadlines, explicit script termination, pause release
and origin-history rotation. JS execution budgets now have a distinct timeout
state so inner command timeouts preserve bindings. Continue the broader command
policy/provider matrix, read-only DOM schema coverage, other capabilities and crash/native
verification. See [tab CDP capability](../../browser-debugger.md). The full goal
remains active.


## Page assets phase

Rendered asset inventory and local directory bundles are implemented through a
shared source/Worker host service. Inventory membership, frame navigation and
turn cleanup fence exports; authenticated network streams, data/blob resources
and per-file failure reporting have real Chrome fixtures. Continue asset fidelity,
provider/transport coverage, read-only DOM schema coverage, content export, crash handling
and native desktop validation. See [page assets](../../browser-assets.md). The
full goal remains active.

## Read-only evaluation phase

Page, locator and locator-list evaluation now run in a dedicated QuickJS WASM
Worker. User source stays outside Chrome; a host-owned isolated-world reader
exposes explicit native DOM read properties/methods. Navigation/turn cleanup
terminate the interpreter and close readers, including CPU loops and pending
DOM calls. Locator seeds use the exact resolved native node identity. Runtime dependency/
package installation paths and native DOM reads, write/network/global escape
rejection, frame scopes and lifecycle have source/Worker evidence. Broader DOM/
provider/syntax compatibility, content exports, crash recovery and native desktop
work remain open. See [read-only evaluation](../../browser-evaluate.md). Keep the full parity goal active.

## Browser session and selection phase

Browser.tabs namespaces, fresh title/URL getters and logical-session naming are
implemented.
Selected-tab identity comes from native Chrome tab/window state, including
while focus emulation is active. The bundled MV3 bridge maps native
TabID to debugger targets and has isolated Chromium evidence in both session modes.
Private bootstrap tabs stay hidden from normal inventory/viewport targeting and
close before the service worker serves requests. See [browser sessions](../../browser-session.md). Keep user-profile extension installation explicit, and retain
all remaining native, transport, content-export and provider work in scope.

## Browser management phase

The inspected windows/tabs/tabGroups/bookmarks management contract and
browser-wide before-state audit are implemented. The bridge now uses a service
worker, reuses live workers and closes cold-start bootstrap tabs before serving
requests. Host initialization is serialized. Chrome dispatch validates allowed
methods/properties, normal non-incognito mutations, shared/unverified groups and
explicit cross-window grouping. Destructive user actions retain the explicit
human-confirmation policy. Accepted writes drain at cleanup; lost acknowledgements
release transport and require audit/state inspection before retry.

Owned Chromium checks cover native window/last-tab behavior, tab/group changes,
bookmark lifecycle, browser-wide audit/results and reset/worker restart in both
session modes, plus a 32-second idle worker in Worker mode. Targeted checks cover
shared groups, audit persistence failure/retention, native failure journaling and
accepted-write cancellation/uncertainty. See [browser management](../../browser-management.md).
Shared-account/headful and crash recovery, transport/provider coverage, native
desktop, history and content export remain open. Keep the full harness goal active.

## Content export phase

The inspected `tab.content.exportGsuite(type)` and `exportYouTubeTranscript()`
interfaces are implemented through a host-owned source/Worker service. Workspace
exports validate document/type/account/sheet routing and native file signatures;
transcripts validate matching video metadata and first-party caption URLs or use
the current visible transcript. Successful private files survive reset; canceled
or failed outputs are removed. Main-document/source changes invalidate exports,
while unrelated iframe changes are permitted. Cancellation disconnects pending
reads before awaiting cleanup.

Owned Chromium fixture flows verify every format route, byte/Unicode fidelity,
cookie inclusion, file privacy, transcript paths, login/signature failures,
child-frame tolerance, navigation and turn/reset cleanup. Real public Google
Sheets CSV/XLSX/PDF exports passed. An anonymous YouTube response required login;
authenticated real-provider exports, Docs/Slides, provider internals, native download UI/approval waits,
delivery/retention, crash/transport and native desktop coverage stay
open. See [content exports](../../browser-content.md). Keep the full goal active.

## Locator media downloads

The inspected `locator.downloadMedia({timeoutMs?})` interface is implemented in
the existing content host service with a 120-second default deadline. Fixed native
getters resolve exact nodes and frames, including responsive resources and
credentialed HTTP(S)/data/Blob files. Response metadata supplies safe private
filenames. Media operations fence node/source/document changes and use independent
timeout signals, while owner cancellation joins all cleanup. Shared locator/native
identity helpers retain the read-only evaluator's behavior. File-backed REPL
workers use a clean Node CLI-flag list, fixing programmatic --input-type startup.

Owned Chromium source/Worker checks cover composed locators, cookie-protected
files, Unicode metadata, responsive images, getter spoofing, data/Blob/audio/video/
caption resources, exact OOP/nested/same-URL frames, node replacement/adoption,
strictness/errors, deadlines/sibling isolation, unrelated frame changes, selected
frame navigation and reset/turn cleanup. The default deadline passed an 11-second
held response. Node and shared read-only/assets/content/lifecycle/CLI regressions
passed. See [locator media](../../browser-media.md). Browser download UI and
approval-aware waiting, streaming/protected/provider fidelity, native desktop,
other transports/platforms and artifact delivery remain open. Keep the full goal active.

## Browser history

Implemented the inspected browser.history date/query/limit interface, with optional
Chrome history permission enabled only through an explicit extension-options user
gesture. Query only owned synthetic history during verification. Keep results
bounded, URL-deduplicated and descending by latest matching visit; preserve date
bounds when Chrome reports a later global visit. Add acknowledged cooperative
cancellation so an ended owner cannot schedule more history calls. Keep user
profile permission installation and reference-provider semantics in the broader
verification plan; retain the full harness objective.

Both source and Worker sessions passed native synthetic dated/repeat visits, OR
queries, Date bounds, order/limit, cancellation after an accepted deferred native
read and next-turn reuse. The production optional permission passed denial and
options status; positive tests used a separate required-permission fixture copy.
No user history or normal-profile settings were accessed. Node regressions and
selection/native-free browser smokes passed. See [history](../../browser-history.md).
Real optional grant/revoke, reference cardinality, headful/platform and remaining
transport/claims/WebMCP/native/provider work remain open. Keep the full goal active.

Native management regressions also passed windows/tabs/groups/bookmarks/audit,
worker restart and 32-second worker idle survival in the shared protocol-3 bridge.

## WebMCP

Implemented the inspected tab capability fetchTools()/description()/call(name,input)
contract with turn-owned, exact native RegisteredTool handles. Native isolated
worlds keep fixed agent code separate from page-owned JavaScript; use the current
Chrome document.modelContext API and reject unavailable browsers explicitly.
Cover top-level and native child-frame identities, fresh tool listings, stale
registration/document/turn rejection, bounded inputs/results and acknowledged
AbortSignal cancellation. Keep metadata/results untrusted and require the host's
normal user-intent/confirmation policy before consequential calls. Ship through
both source/Worker hosts and installer/npm support lists. Verified owned local fixtures in Chrome for Testing 158, with the native minimum
raised after Chrome 156 admitted a replacement registration through an old handle.
The installed normal profile and its settings remain untouched. Retain the wider
transport/claims/native/platform scope.

Both session modes passed native frame discovery (same-URL/in-process and OOP),
main-world API spoofing, registration replacement, provider errors, guessed names,
old-turn/navigation rejection, cancellation signals and a declarative form's
submission/navigation. Chrome 156 rejects the capability explicitly. The new
testing browser blocked on a native keychain read; stack sampling localized it,
and a fresh test-keychain fixture completed real HTTP workflows. See
[WebMCP](../../browser-webmcp.md). Automatic notifications, real interaction/consent,
headful/platform/crash/external workflows and the wider goal remain open.

All 137 Node checks passed. Native-free CLI/MCP and both session modes' read-only
evaluation regression (including renderer-crash cleanup) passed on Chrome 158.

## Native platform and explicit application launch

Exposed the local executor's computer.target and the Linux/Windows optional
computer.launch_app({app}) interface. macOS keeps getApp's existing launch path.
Dispatch to an advertised native launch_app tool, validate before launch, pass a
single literal executable/name without a shell or argument parsing, detach its
session/console and discard inherited protocol stdio. Accepted application
processes must survive native peer/REPL cleanup. Preserve existing observation
behavior and ship updated native schemas/docs. Verify Linux through an owned
isolated desktop; compile/check Windows and record the limits of its evidence.
Window-ID binding, paste/input and other native/platform parity remain open.

All 139 Node checks passed. The native Linux Go suite passed in an arm64 Ubuntu
VM. A private D-Bus/Xvfb GTK fixture verified source/Worker startup, literal
spaces/Unicode/$() paths, protocol stdio isolation, independent Linux session,
AX readiness and survival through turn/native replacement/reset/final close.
Windows common Go checks passed on macOS; both Windows architectures compiled.
Real Windows desktop/job/console cases, desktop/AppUserModelID resolution, remote
native identity, window-ID targeting and broader input/platform work remain open.
See [native lifecycle](../../native-lifecycle.md). Keep the full goal active.

## Linux window identities

Add listWindows() and getApp({windowId}) using native AT-SPI connection/object
paths plus process start identity. Numeric discovery IDs remain opaque; bound
selectors preserve the full native identity across native-peer replacement.
Resolve the exact window before observation/action, scope snapshot caches and
native element identity to it, and reject destroyed/replaced windows. Preserve
Windows/macOS explicit unsupported handling until their native identity routes
are implemented. Verify same-process multiple/same-title/reordered/recreated
windows and targeted semantic actions in an owned GTK desktop. Physical routing
must fail when target focus/hit testing cannot be verified; it remains part of
the wider native input work rather than an implied success claim.

GTK source/Worker workflows passed same-process/same-title windows, independent
cache/index writes, widget replacement, close/reordered children, recreated window
rejection and stable peer/turn/reset IDs. Bound screenshot unavailability and
sibling-cache preservation are verified. Exact native images and physical pointer
routing stay unavailable; keyboard fallback requires verified selected-window
focus. These are explicit remaining input/capture requirements. See
[native windows](../../native-window-binding.md). Wider provider/Windows/Wayland/
headful/transport/claims/native parity remains open. Keep the full goal active.

The final revision passed 140 Node checks, 39 Python checks and 46 native Linux Go
checks, plus both session modes' multi-window GTK flow and the earlier native
launch/lifecycle GTK regression. Owned test apps and private VM work files were
removed. The full harness goal remains active.

## Linux focused and indexed text

Align typeText(text, elementIndex?) with the Linux reference signature. Propagate
an explicit field index through JS/native schema/Go/AT-SPI, use exact native
object identity and reject stale/read-only fields before input. Omitted indexes
must select focused editable content rather than the first field. Honor native
caret/selection offsets and UTF-8 insert byte lengths, preserve existing text,
and propagate attempted-edit failures without global replay. Verify Unicode,
selection, multiline, independent fields/windows and replacement in owned GTK.
Keep typeCharacters and remaining native image/physical/platform work open.


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


## Linux printable key events

Add the Linux-only reference `typeCharacters(text)` API through capability-gated
JS and a native `type_characters` tool. Validate printable Unicode before input,
check target-window focus before each keysym, return the native acknowledged
code-point count and stop with prefix count on failure. Preserve empty no-op
semantics. Verify custom non-editable GTK key receivers and inactive-window
rejection in both REPL modes. Keep physical images/pointer, paste, Windows and
wider keymap/IME/compositor validation in the full active goal.


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


## Linux verified selection

Implement the existing `app.selectText` reference API on Linux through an
advertised native `select_text` tool. Preserve exact observed object identity,
literal contextual matching including overlaps, Unicode offsets, selection and
both cursor modes. Verify native range and unchanged content before returning.
Use owned GTK flows for repeated/multiline/astral text and stale rejection.
Native paste still needs clipboard ownership, MIME transfer and cleanup work;
keep it and all remaining platform/image/physical requirements in the active goal.


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

## Linux native clipboard paste

Implement `app.paste(text, {format?})` for text, literal Markdown and HTML using
an owned GTK selection provider in a bounded native-session helper. Validate
input/capability before side effects, check native target focus before clipboard
ownership and key synthesis, serve UTF-8/plain and HTML MIME data, and report
whether a payload request occurred. Keep the owner alive across actions and
close/reap it on session/CLI termination. Verify receiving GTK text and custom
HTML controls plus timeout, replacement and lifecycle behavior. No clipboard
restoration is promised for Linux; Wayland and other platforms remain open.


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

## Verified visible X11 window images

Enable bound images only after AT-SPI active-window identity and native focused
client PID/frame geometry agree. Reject ambiguous same-process geometry,
background/offscreen/occluded targets and unavailable native evidence. Use a
private Xlib connection and a bounded server-grab read to keep stacking stable
between visibility checks and XGetImage; release it before PNG encoding. Verify
known receiving-window pixels, same-title isolation, overlap refusal, black
content and stale/replaced windows. Background backing-store capture, Wayland,
other providers and full native/physical parity remain in the active goal.


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

## Verified visible X11 coordinate clicks

Reuse native frame/PID/focus/visibility verification for XTest pointer routing.
Support left/middle/right and bounded click counts at screenshot-relative points,
check the actual pointer target and neutral input state, always pair attempted
presses with release, and preserve explicit failure outcomes. Resolve indexed
fallback through fresh exact objects/geometry; never replay an attempted failed
semantic action as pointer input. Verify actual GTK press/release recipients,
same-title isolation and rejection before input. Drag, long press/chords,
composited/Wayland/background routes and user-takeover claims remain open.


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
