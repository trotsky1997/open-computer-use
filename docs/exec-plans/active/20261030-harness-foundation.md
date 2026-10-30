# Computer-use harness foundation

## Goal

Build an independent, open computer-use harness on the upstream runtime, using the currently exposed Codex computer-use interface as a behavioral reference. Keep native permission and input boundaries explicit. Evidence comes from documented interfaces and executable tests; matching names alone does not establish behavioral parity.

## Baseline

- Based on upstream `a7fdec1`. The existing fork's main branch is older and is left intact.
- Native app binding and persistent JavaScript execution already exist. `selectText` now accepts `selectionType` at the JavaScript boundary and maps it to the native `selection` argument.
- Current Codex exposes browser discovery, tab binding, browser-specific interaction and navigation alongside native apps. This repository currently exposes native app bindings only.
- Current Codex exposes accessibility state diffs and a full-state option. The REPL now emits bounded line-replacement diffs while returning full native snapshots to JavaScript. Screenshot observations and failed native calls discard history; option changes force full output. Native index generation remains unchanged.
- The current Codex API includes app paste, click modifiers and duration, coordinate scrolling and other platform-specific details. These require capability-by-capability investigation and runtime validation.

## Next steps

1. Establish repeatable, privacy-safe native app scenarios for observation, input, stale indices, failures and session reset; measure behavior with the existing fixture before expanding the surface.
2. Design browser discovery and tab lifecycle against a concrete supported browser transport, with explicit ownership and permissions. Validate DOM and native interaction independently.
3. Validate the new output diffs on real multi-window applications, especially native index changes and screenshot-only observations. Full output is available with `disableDiffing: true`.
4. Add remaining input operations according to observed platform capabilities and test on real desktops. Document unsupported behavior clearly.

## Validation boundaries

The first change has REPL mock coverage only. Browser integration, real desktop behavior, Windows and Linux parity remain open. Do not infer capabilities from API shape alone.
