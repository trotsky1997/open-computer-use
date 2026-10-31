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
