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
