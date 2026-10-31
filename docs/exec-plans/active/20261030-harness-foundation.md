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

## Linux native-operation cancellation

Propagate MCP/CLI signal cancellation into every one-shot runtime operation,
terminate/reap active children cooperatively with a bounded forced-kill fallback,
and prevent new work after cancellation. Protect short input press/release groups
so cooperative cancellation completes releases before returning. Send operation
JSON through stdin to avoid leaving user payloads in temporary request files.
Use Linux parent-death signals with a stable creating OS thread for owned runtime
children; explicitly launched applications retain their independent lifetime.
Verified gated real GTK input cancellation on reset/close in both REPLs, CLI
termination and parent death, plus input release behavior. Hard-kill cleanup
and already accepted remote effects remain explicit limits under the full goal.

See [Linux native cancellation](../../linux-native-cancellation.md). The full
harness goal remains active.

Validation passed: 145 Node checks; 67 Python checks (53 runtime, 11 X11,
3 clipboard); 45 Linux Go top-level checks plus 10 subchecks; both REPL modes
for cancellation and all six existing GTK controllers; CLI SIGTERM/SIGKILL
lifecycle probes. Owned processes and private VM work files were cleaned up.
No dependency or CI added. macOS/Windows and physical/Wayland cancellation remain
unverified; the full harness goal stays active.


## Verified Linux X11 drag

Replace the legacy AT-SPI global drag and the bound-window rejection with one
verified XTest path. Reuse click preflight, validate both endpoints, preserve
press/release cleanup through cooperative cancellation, and recheck native frame
and pointer state between motion steps. Cover exact GTK receiving coordinates,
held-button motion, failure/cancellation releases, inactive/occluded/intercepted
rejection and existing pointer workflows. Keep wider platform/Wayland/physical
routing gaps in the full active goal.

See [verified X11 drag](../../linux-drag-input.md). The full goal stays active.

Validation passed: 145 Node checks, 70 Python checks (53 runtime, 14 X11,
3 clipboard), 46 Linux Go top-level checks plus 10 subchecks, both CLI process
lifecycle probes, and both REPL modes across all eight isolated GTK controllers
(drag, click, image, paste, text, window, launch and cancellation). Owned processes
and private VM files were cleaned up. No dependency or CI added. Physical devices,
real window managers, compositors/Wayland, cross-window drag/drop, long-press/chords
and broader platform behavior remain open. The full harness goal remains active.


## Linux held click/chord

Advertise click key/duration_ms using the existing JS contract. Resolve physical
keys from the current native keymap; share verified pointer preflight, hold keys
across the sequence and dwell each mouse press. Own reverse releases through
cancellation/failure. Reject unsupported methods/layouts before input. Validate
real GTK key/modifier/mouse timing and reset/close releases in both REPLs, with
existing input/lifecycle regressions. Keep other platforms and wider routing open.

See [Linux held clicks](../../linux-held-clicks.md). The full goal stays active.

Validation passed: 145 Node checks, 75 Python checks (54 runtime, 18 X11,
3 clipboard), 46 Linux Go top-level checks plus 10 subchecks, CLI SIGTERM and
parent-death probes, and both REPL modes across nine isolated GTK controllers
(held clicks, drag, click, image, paste, text, window, launch, cancellation).
Owned processes and private VM files were cleaned up. No dependency or CI added.
Wider layouts/IME, real window managers/hardware, background/composited/Wayland,
Linux pressKey duration and Windows held input remain open. Hard interruption
cannot confirm releases or roll back accepted effects. The full goal stays active.


## Linux timed key/chord input

Advertise press_key.duration_ms through the existing JS contract. Reuse held-click
native mapping and shared reverse-release ownership, verify the focused native
frame and logical key/modifier/button state without moving the pointer, and stop
on cancellation/failure. Validate real GTK key timestamps, modifier-only/ordinary
chords, zero duration, inactive/invalid rejection and reset/close cleanup in both
REPLs. Retain broader platform/routing requirements under the full active goal.

See [Linux timed keys](../../linux-held-clicks.md#timed-presskey). The full goal remains active.

Validation passed: 145 Node checks, 79 Python checks (55 runtime, 21 X11,
3 clipboard), 46 Linux Go top-level checks plus 10 subchecks, CLI SIGTERM and
parent-death probes, and both REPL modes across ten isolated GTK controllers
(timed keys, held clicks, drag, click, image, paste, text, window, launch and
cancellation). Owned processes and private VM files were cleaned up. No dependency
or CI added. Wider layouts/IME, real window managers/hardware, background/
composited/Wayland and Windows input remain open. Hard interruption can prevent
confirmed releases; accepted effects remain applied. The full goal stays active.


## Verified Linux coordinate/index scroll

Replace the legacy focused PageDown/arrow fallback, which ignores element_index,
with verified X11 wheel delivery to fresh indexed geometry or screenshot points.
Share click target/preflight verification, validate finite pages/direction/targets,
and pair wheel press/releases through cancellation without keyboard replay.
Expose coordinate support through native schema discovery in both REPLs. Use the
repo's 12-unit page approximation with explicit native-wheel/toolkit limits.
Verify four directions, fractional requests, actual GTK scrolled-pane offsets,
focus isolation, rejection and cancellation; retain the broader parity goal.

See [Linux scroll](../../linux-scroll-input.md). The full goal remains active.

Validation passed: 147 Node checks, 83 Python checks (56 runtime, 24 X11,
3 clipboard), 47 Linux Go top-level checks plus 10 subchecks, CLI SIGTERM and
parent-death probes, and both REPL modes across eleven isolated GTK controllers
(scroll, timed keys, held clicks, drag, click, image, paste, text, window, launch
and cancellation). The final scroll check explicitly confirms the Entry retains
focus. Owned processes and private VM files were cleaned up. No dependency or CI
added. Precise pixel/paging calibration, wider providers/hardware/window managers,
background/composited/Wayland and other-platform coordinate routes remain open.
The full harness goal stays active.


## Native-free browser source installation

Add browser-only Codex plugin source installation without native build/artifact
requirements, plus an explicit target home for isolated real installation tests.
Stage complete runtime/dependencies and patched config before cache replacement;
retain previous payload/config on dependency or preparation failure. Verify
installed MCP JavaScript and real disposable Chrome discovery/input/evaluation,
reinstallation/idempotence and normal existing native payload installation.
Keep broader transport/platform/parity requirements active.

See [browser-only source installation](../../browser-only-installation.md). The full goal remains active.

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

## Browser-wide turn-owned WebMCP discovery

Extend the existing native WebMCP observer to discover initial HTTP(S) page
targets and later created/navigated targets without binding them. Reuse native
frame/tool watchers and turn notices; never fetch callable collections or claim
tabs during discovery. Keep bounded budgets and explicit diagnostics. Turn/reset
cleanup must await pending discovery and close its browser/per-tab connections.
Verify initial/unbound/dynamic pages, cleanup, next-turn resubscription, existing
bound-tab/native-call behavior and installed source-removed payloads on owned
macOS/Linux browsers. The broader parity goal remains active.

Implemented one turn-owned native browser target observer and reused the existing
per-tab/frame observers. Initial inventory and later HTTP(S) page creation or
navigation queue coalesced tool notices without callable handles or tab claims.
Closing/leaving web targets retires observers; a target returning to HTTP while
its previous observer disconnects is rechecked and observed again. The browser
and per-tab connections drain on turn/reset/close. Native calls remain explicit.

Validation: macOS Node 185/185, arm64 Linux 184/185 (one macOS-only skip). Both
systems pass the owned browser-wide controller in Worker/source sessions and
against source-removed installed modules: initial/new/navigated/closed targets,
no automatic calls/claims, explicit fetch/call, next-turn and reset resubscription.
The existing complete native WebMCP controller passes on both systems, including
OOP frames, imperative/declarative calls, cancellation and renderer recovery.
Installed external/managed MCP and session flows plus managed parent/guardian
death cleanup pass on both systems. Focused checks cover the 128-tab budget,
rapid return during disconnect, observer loss and quiet older-browser fallback.
Real consent/headful/Windows, unidentified/remote death and wider external-site
coverage remain open. The full parity goal remains active.

## Managed headful presentation

Add explicit host-configured headful startup and the reference visibility.get/set
capability for the private managed browser. Preserve headless defaults, external
CDP precedence, profile/process ownership and host lifetime. Visibility changes
operate on the managed root's native windows and persist across reset/turns.
Use an owned Xvfb/Openbox session for Linux window-state evidence; macOS physical
headful behavior and user takeover remain separate verification work.

Implemented OPEN_COMPUTER_USE_BROWSER_MODE=headful with strict host-side mode
validation; headless remains the default and external CDP takes precedence.
The guardian receives only the validated launch mode. Before exposing a headful
endpoint, startup explicitly minimizes and confirms its private windows; the
Chrome startup flag alone did not reliably minimize in the owned Linux fixture.
The visibility capability reads native bounds/state and serializes hide/restore
at the host, preserving bounds and selected tabs across reset/turns. Explicit
visible creation options apply before tab creation. Shutdown drains accepted
window operations before stopping the guardian/browser.

macOS Node 187/187 and arm64 Linux 186/187 (one macOS-only skip) pass. Linux
Xvfb/Openbox checks independently inspect native X11 map state for initial hidden
startup, multi-window show/hide, visible/background creation, native text input,
invalid visibility requests and reset/turn retention. Headful guardian loss plus
natural/SIGKILL host exit reclaim the browser/profile. Source and source-removed
installed real MCP entries pass presentation, hidden-state js_reset and shutdown
cleanup. Installed source/Worker sessions pass the same window flows and private
guardian-loss recovery. macOS default-headless lifecycle and source-removed
installed browser flows also pass. Linux installer headful verification is
explicitly enabled with --headful and requires its graphical fixture tools.

Physical desktops/macOS headful, Windows, takeover arbitration, headful clipboard
and durable recovery remain open. The existing verified-headless clipboard/paste
guard is retained. The broader parity goal remains active.

## Managed headful native clipboard and paste

Reuse the native clipboard job/settlement and input-lease paths for the verified
private managed headful browser. The host's captured endpoint/socket/process
identity must authorize the system clipboard backend before helper pages or
permissions are created. Keep external/unverified headful rejection and headless
virtual clipboard behavior. Use only owned Xvfb synthetic clipboard data to
verify text/HTML/PNG, native paste, reset, cleanup and installed/MCP entries.

Implemented system/display clipboard access only when the host's live managed
headful endpoint/socket/process proof matches the requested browser. Existing
headless virtual clipboard behavior and unowned headful rejection stay intact.
Text/HTML/PNG and trusted native paste reuse the existing job completion evidence,
queue and input/focus leases. Headful helpers use hidden native targets with a
dedicated persistent browser connection; they do not appear in Chrome tabs.
Cleanup waits for connection acknowledgement and retains failed-close ownership.
Reads reject disconnected helpers; cleanup accepts already disconnected helpers
so known completed work can reset and create a fresh control target. Visibility
ignores native page targets that have no browser window.

Evidence: macOS Node 189/189, arm64 Linux 188/189 (one macOS-only skip). Both
platforms pass complete Worker/source headless text/HTML/PNG, copy/cut/paste, undo,
editability/password and cleanup regressions; macOS system clipboard hash stays
unchanged. Owned Linux Xvfb/Openbox/Gtk 3 verifies GTK-to-Chrome reads, Chrome-to-GTK
Unicode text and PNG, trusted text/HTML/image paste and sanitization, native helper
invisibility, unowned-client rejection without clipboard changes, disconnect/reset
recovery and hidden-window reads. Source/Worker, real MCP and source-removed
installed modules/MCP pass these flows, plus existing visibility/lifecycle checks.
A focused check covers delayed disconnect acknowledgement and failed-close retry.

System clipboard changes may persist after host exit and can be overwritten by
other applications/users. Physical desktop/macOS system clipboard, Windows,
external headful support, cross-host coordination, takeover arbitration and
durable recovery remain open. The full parity goal remains active.

## Headful empty-window reopening

The owned Linux fixture reproduces a broken connection after closing the last
visible window, even with hidden clipboard targets. Keep the managed headful
process/profile alive across ordinary window closure, using Chromium's supported
keep-alive switch. Visibility must treat an empty browser as hidden, make hide a
no-op, and recreate a window on show. Preserve startup minimization verification
and current/background creation semantics before navigating to requested content.
Validate profile/cookie/clipboard retention and the actual X11 map state through
source/Worker and source-removed installed/MCP entries.

Implemented headful process keep-alive and a session preference confined to the
new private temporary profile. The first reproduction lost the browser after
last-window closure; the next retained the PID but Chromium deleted session
cookies. The native session preference preserves cookies while the host lives;
normal guardian cleanup still removes the entire profile. Empty visibility reads
false, hide creates no window, and show creates one blank window. Startup still
waits for and verifies the initial minimized window. Background/omitted-hidden
creation is rechecked before navigation; requested pages load after hiding.

Owned Linux source/Worker and source-removed installed/MCP checks pass repeated
empty-window cycles, explicit background/omitted/visible creation, unchanged
PID/profile, a session cookie received on a fresh HTTP request and retained native
clipboard data. Showing an empty browser has exactly one blank tab and restores
no closed page. X11 observation now ignores only confirmed missing-window errors
when IDs disappear between the client-list and window-info queries. Existing
clipboard, visibility, host-exit and guardian-loss cleanup checks pass. Node
checks remain macOS 189/189 and Linux 188/189 (one macOS-only skip); macOS default
headless lifecycle checks also pass. Physical desktops/macOS headful, Windows,
takeover arbitration, cross-host coordination and durable recovery remain open.
The complete parity goal remains active.

## Host-local user-tab claims

Add native browser.user.openTabs metadata (CDP/provider ID, last access and group)
and claimTab. Binding a tab and tab-scoped broker operations acquire an exclusive
claim in the host's existing tab-owner table. Listing leaves tabs unclaimed.
Release unmarked user claims on turn/reset without closing the original tab;
retain marked claims for the next turn, and retain unresolved close ownership.
Agent-created tabs/popups retain their existing lifecycle. Verify native metadata,
competing sessions, release/reclaim, stale references and original-page retention.
Cross-host claims, browser-wide management arbitration and physical takeover remain
separate work in the full parity goal.

Implemented native user-tab metadata and exclusive host-local claims using the
existing stable session tab-owner table. Original pages survive release/reset;
marks retain claims across the idle boundary, uncertain close retains ownership,
and old handles are rejected after a different session claims the page. First-seen
tracking protects preexisting children and idle-handoff popups; snapshot ancestry
passes retain active descendants even when native target ordering is reversed.
String-ID binding checks ownership before discovery, preserving another session's
active dialog/action. The bundled extension protocol is now 4.

Owned Chrome 158 source and source-removed installed claims pass on macOS/Linux
for both JS session types. Native metadata/group/order, passive listing, competing
and simultaneous claims, stale records/handles, original-page retention, active
popup cleanup and handoff/reset pass. macOS Node checks pass 193/193; Linux passes
192/193 with one macOS-only skip. Both systems pass existing clipboard, native
selected-tab/session and full dialog failure/recovery checks. Installed Linux
headful visibility/clipboard, empty-window retention and MCP lifecycle also pass;
the X11 checker now accepts the native spaced Bad Window spelling for a destroyed
window. Cross-host/raw-client/browser-wide arbitration and physical takeover remain
open. The full parity goal stays active.

Concurrent session reset now shares the browser dialog observer shutdown; a new
observer waits for that shutdown before attaching. The native claims controller
retains simultaneous reset checks after racing claims on both session types.

## Same-machine cross-host tab coordination

Extend tab ownership beyond one Node host with a per-browser-instance shared
filesystem lease. Key by the CDP browser instance, including endpoint aliases;
keep claims exclusive across independent processes/session types. Publish complete
private records atomically, release only the owning session after action/resource
cleanup, preserve handoff marks, and filter foreign claims from user inventory.
Created tabs and inherited popups participate before actions/closure. Host death
keeps claims fenced: native accepted browser work may still run after host exit,
so PID disappearance alone cannot authorize reassignment. Browser restart gives a
new namespace. Raw CDP/physical users and different machines remain outside this
coordinator. Validate real Chrome with independent host processes, aliases,
racing/released/retained claims, old handles, host death, and source-removed install.

Implemented BrowserTabClaims with complete private records atomically published
by directory rename, stable per-session tokens, browser-instance namespaces and
matching-generation release after resource settlement. POSIX uses a common
canonical temporary root independent of TMPDIR. Created tabs and inherited
popups reserve leases before action/closure; nonce pages reject foreign binding
while publication is pending. Directory readiness is checked before native page
creation. Foreign nearest-opener leases fence unclaimed descendants, while
existing direct child leases retain independent ownership. Unclaimed preexisting
and idle children are conservatively fenced until the foreign opener releases.

Both session types pass independent-process Chrome 158 checks on macOS/Linux:
endpoint aliases, native content preservation, old-handle refusal, user inventory,
created-tab/popup fencing and cleanup, handoff/release, competing claims, SIGKILL
and refusal after reset, plus fresh-browser identity. Source-removed installation
runs the same controller. Installer/npm staging/doctor/CLI fixtures include the
new module; browser-only npm staging and tarball contents are verified. Node
checks pass macOS 197/197 and Linux 196/197 (one macOS-only skip). Existing dialog
and clipboard flows and isolated Linux installed headful visibility/native
clipboard/empty-window/MCP recovery pass. The unowned-headful clipboard fixture
now creates its own tab to reach the clipboard authorization check, keeping the
new cross-host tab fence intact.

No TTL/dead-PID lease reclamation is performed: native work may survive host death.
Crashed host claims remain until browser restart; stale temporary records can
remain until OS cleanup. Raw clients, different machines/filesystem namespaces,
browser-wide management, physical takeover and Windows evidence remain open.
The complete parity goal remains active.

## Management ownership arbitration

Close the native management mutation bypass. Use a same-machine browser layout
gate while planning/reserving/dispatching organization changes. New tab claims
and native creation must pass the gate; existing owned tab actions remain usable.
The extension plans affected windows/native tabs and maps them to CDP IDs. Acquire
all affected claims before a write, reject foreign owners before partial claim
publication, and revalidate a scoped layout fingerprint before audit/dispatch.
Drain accepted writes on cancellation; keep the layout gate on unconfirmed native
completion. Cover both JS hosts, independent processes, native tab/group/window
changes, bookmark writes, stale plans, pending/cancelled writes and installed flow.
Raw CDP/physical actors and cross-machine coordination remain outside this gate.

Implemented extension protocol 5 planning with native-to-CDP target scope and a
scoped SHA-256 layout fingerprint. Source/destination windows participate in tab
and group mutations; focus/state or last-tab window closure expands to all
windows. Bookmark and unfocused blank-window changes require no existing tab
scope. Foreign/closing/private targets reject before any new scope claim is
published. Fingerprint changes/missing plans fail before audit/native write.

The shared layout transaction wraps management planning through acknowledgement.
New claims, native creation and explicit/cleanup closure pass the same gate;
existing owned observations/input remain available. Native observer snapshots
reserve only the calling owner's inferred tabs to prevent cross-owner gate cycles.
Async reentrancy expires with the transaction. Pre-dispatch cancellation reserves
no target scope and sends no mutation; accepted writes drain. An unknown native
completion or host death keeps the layout gate until browser restart.

Owned Chrome 158 source/installed independent-process checks pass on macOS/Linux
for both JS hosts: native tab pin/remove/group, source/destination moves, group
changes, window updates and last-window refusal with unchanged audit/state;
independent unfocused windows/bookmarks; native mutation held across JS timeout
until acknowledgement; and SIGKILL during accepted mutation followed by refused
new-page creation/reset. The ordinary management workflow (including 32s idle,
worker restart, bookmarks/groups/window closure), dialogs, clipboard and selected
session checks pass on both systems. Installed Linux headful visibility/native
clipboard/empty-window/MCP flows also pass. Node checks: macOS 200/200, Linux
199/200 with one macOS-only skip. The user-tab fixture now ends the grouping turn
before another session claims the newly organized original pages.

The layout gate covers cooperating current hosts for one same-machine OS user.
Raw/physical/page-driven actors, other machines, managed-browser visibility,
Windows evidence and native crash-settlement takeover remain open. The full
parity goal stays active.
