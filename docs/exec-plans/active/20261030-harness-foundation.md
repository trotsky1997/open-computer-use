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
verification is pending normal Mac unlock. Continue that check, remaining native
input/paste/scroll operations, other platforms and the broader browser/host audit.
See [native held clicks](../../native-held-clicks.md). The full goal stays active.
