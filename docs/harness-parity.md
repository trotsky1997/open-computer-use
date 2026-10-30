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
| Browser AX / screenshot | CDP observations and screenshot-bound coordinate validation; real Chrome smoke | Broader DOM fidelity, high-DPI and zoom hardware coverage, cross-platform capture |
| Browser text / pointer input | Element/coordinate clicks and scroll, pointer drag, Unicode input, value and range verification; real Chrome smoke | HTML drag-and-drop payloads, formatted paste, more keyboard/platform cases |
| Browser locators | Playwright Core selectors, actions, frames, composition, snapshots and fresh resolution | Broader dynamic/shadow/cross-origin coverage and per-operation connection overhead |
| Browser scripting | Locator APIs and rendered snapshots | Read-only page/locator evaluation with enforced isolation |
| Navigation / event waits | Basic navigation, locator waitFor, expectNavigation, URL/load waits and file chooser/download events, cancellation and failure recovery with real Chrome/Worker checks | Native picker presentation, popup-owned downloads and broader page event coverage |
| Dialogs / clipboard / developer tools | Not exposed | Explicit dialog handles, session clipboard, logs and capability discovery |
| Content / artifacts | Screenshots returned as binary; completed GUID-named downloads returned as local paths | Content export, remote delivery and artifact retention |
| Host / session integration | Plugin installer, native permission boundaries, host-owned Worker focus cleanup with real timeout/reset/close/exit checks | Turn lifecycle, user takeover, ownership, managed tab cleanup and host integration |
| Platform coverage | Node checks and real disposable macOS headless Chrome evidence | Native desktop, headful focus, Linux and Windows verification |

Keep the full goal active while any required capability or its verification is
missing. Prioritize concrete workflows that cross observation, action and result
verification; keep unsupported operations explicit.
