# Harness parity tracking

The goal is to follow the currently exposed ChatGPT/Codex computer-use harness.
This table records implementation and evidence separately. API names alone do
not establish behavioral parity. The reference surface was inspected through the
current native/browser documentation on 2026-10-30.

| Area | Current implementation / evidence | Remaining work |
| --- | --- | --- |
| Persistent JavaScript | Worker kernel, serialized calls, timeout/reset checks and verified native-free CLI/MCP browser operation | Native-free source installer; real long-running workload and native desktop validation |
| Native app observations | Existing native AX/screenshot APIs; output diffs and full-output option have Node checks | Real multi-window, index reuse, truncation and settle validation |
| Native app input | Existing native actions plus selection option alignment | Paste, click modifiers/durations and remaining platform-specific API differences |
| Browser discovery / lifecycle | Explicit CDP provider, binding, create/close, navigation/history/reload; disposable Chrome smoke | Extension and in-app transports, browser selection/session naming, ownership and tab retention |
| Browser AX / screenshot | CDP AX, PNG/JPEG viewport/full-page/clip and crop-coordinate validation; real Chrome at 1× and forced 2× | Broader DOM fidelity, mixed-DPI/zoom hardware and cross-platform capture |
| Browser viewport | Discovered viewport capability, host-owned set/reset across tabs/windows and cleanup recovery; real Chrome | Headful/mixed-DPI/zoom, external emulation and host-crash coverage |
| Browser text / pointer input | Element/coordinate input, pointer drag, Unicode/value/ranges and trusted text/HTML paste and native MIME/file drop; real Chrome smoke | Cross-process/ambiguous frame drops, headful paste and more keyboard/platform cases |
| Browser locators | Playwright Core selectors, actions, frames, composition, snapshots and fresh resolution | Broader dynamic/shadow/cross-origin coverage and per-operation connection overhead |
| Browser scripting | Locator APIs and rendered snapshots | Read-only page/locator evaluation with enforced isolation |
| Navigation / event waits | Basic navigation, locator waitFor, expectNavigation, URL/load waits and file chooser/download events, cancellation and failure recovery with real Chrome/Worker checks | Native picker presentation, popup-owned downloads and broader page event coverage |
| Dialogs / clipboard / developer tools | Host-owned dialog handles, logs and native text/HTML/PNG browser clipboard; real Chrome flows and cleanup checks | Pre-binding/popup/OOPIF dialogs, headful/remote clipboard, broader capability discovery and log sources |
| Content / artifacts | Screenshots returned as binary; completed GUID-named downloads returned as local paths | Content export, remote delivery and artifact retention |
| Host / session integration | Plugin installer, native permission boundaries, host-owned Worker focus cleanup with real timeout/reset/close/exit checks | Turn lifecycle, user takeover, ownership, managed tab cleanup and host integration |
| Platform coverage | Node checks and real disposable macOS headless Chrome evidence | Native desktop, headful focus, Linux and Windows verification |

Keep the full goal active while any required capability or its verification is
missing. Prioritize concrete workflows that cross observation, action and result
verification; keep unsupported operations explicit.
