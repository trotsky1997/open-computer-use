# Harness parity tracking

The goal is to follow the currently exposed ChatGPT/Codex computer-use harness.
This table records implementation and evidence separately. API names alone do
not establish behavioral parity. The reference surface was inspected through the
current native/browser documentation on 2026-10-30.

| Area | Current implementation / evidence | Remaining work |
| --- | --- | --- |
| Persistent JavaScript | Worker kernel and source-session serialized calls/turn boundaries, timeout/reset checks and verified native-free CLI/MCP browser operation | Native-free source installer; real long-running workload and native desktop validation |
| Native app observations | Existing native AX/screenshot APIs; output diffs and full-output option have Node checks | Real multi-window, index reuse, truncation and settle validation |
| Native targeting / lifecycle | Existing string app binding | Window-ID binding, computer.target/launch_app, per-platform typeText/typeCharacters and screenshot-region identity |
| Native app input | Existing native actions/selection plus macOS held-click/key duration implementation, build and no-GUI event checks | Live held-click/background/cancellation evidence (Mac locked), paste, coordinate scroll and Linux/Windows held input |
| Browser discovery / lifecycle | Explicit CDP provider, binding, create/close, navigation/history/reload; disposable Chrome smoke | Extension and in-app transports, browser selection/session naming, selected tabs and title/url convenience methods |
| Browser AX / screenshot | CDP AX, PNG/JPEG viewport/full-page/clip and crop-coordinate validation; real Chrome at 1× and forced 2× | Broader DOM fidelity, mixed-DPI/zoom hardware and cross-platform capture |
| Browser viewport | Discovered viewport capability, host-owned set/reset across tabs/windows and cleanup recovery; real Chrome | Headful/mixed-DPI/zoom, external emulation and host-crash coverage |
| Browser text / pointer input | Host-owned held clicks and press-key duration/chords, element/coordinate input, pointer drag, Unicode/value/ranges and trusted text/HTML paste and native MIME/file drops with native same-URL DOM/shadow owners and nested process routing; real Chrome smoke | Full keyboard/layout coverage, frame transforms/zoom, headful paste and more keyboard/platform cases |
| Browser locators | Playwright Core selectors, actions, frames, composition, snapshots and fresh resolution | Broader dynamic/shadow/cross-origin coverage and per-operation connection overhead |
| Browser scripting | Locator APIs and rendered snapshots | Read-only page/locator evaluation with enforced isolation |
| Navigation / event waits | Basic navigation, locator waitFor, expectNavigation, URL/load waits and file chooser/download events, cancellation and failure recovery with real Chrome/Worker checks | Native picker presentation, popup-owned downloads and broader page event coverage |
| Dialogs / clipboard / developer tools | Host-owned dialog handles, logs and native text/HTML/PNG browser clipboard; real Chrome flows, resumed-action failure reporting and cleanup checks | Pre-binding/popup dialogs and broader frame flows, headful/remote clipboard, broader capability discovery and log sources |
| Optional browser capabilities | Viewport discovery and tab CDP commands/event cursors with child routing and host cleanup; real Chrome in both session types | Broader CDP command-policy/provider matrix, management, page assets, history and remaining provider-specific capabilities |
| Content / artifacts | Screenshots returned as binary; completed GUID-named downloads returned as local paths | Content export, remote delivery and artifact retention |
| Host / session integration | Plugin installer, native permission boundaries, host-owned per-turn resources and tab/popup retention, immediate MCP turn-ended cleanup with idle JS preservation and stale-callback fencing | In-process CPU preemption, user takeover/claims, crash recovery and broader host integration |
| Platform coverage | Node checks and real disposable macOS headless Chrome evidence | Native desktop, headful focus, Linux and Windows verification |

Keep the full goal active while any required capability or its verification is
missing. Prioritize concrete workflows that cross observation, action and result
verification; keep unsupported operations explicit.
