# Harness parity tracking

The goal is to follow the currently exposed ChatGPT/Codex computer-use harness.
This table records implementation and evidence separately. API names alone do
not establish behavioral parity. The reference surface was inspected through the
current native/browser documentation on 2026-10-30, with read-only execution
probes, management and WebMCP contracts on 2026-10-31.

| Area | Current implementation / evidence | Remaining work |
| --- | --- | --- |
| Persistent JavaScript | Worker kernel and source-session serialized calls/turn boundaries, timeout/reset checks and verified native-free CLI/MCP browser operation | Native-free source installer; real long-running workload and native desktop validation |
| Native app observations | Native AX/screenshot APIs and output diffs; Linux GTK multi-window AX, cache/index isolation and stale widget checks in both session types | Exact bound-window screenshots, broader multi-window/provider, truncation and settle validation |
| Native targeting / lifecycle | String binding, local target/launch and Linux AT-SPI window IDs with AX/semantic actions; source/Worker GTK multi-window identity, stale rejection and lifecycle verified | Windows window binding, exact bound-window image/physical routing, broader Linux providers, desktop/display-name launch, real Windows lifecycle, remote native identity and per-platform input/regions |
| Native app input | Linux focused/indexed text, caret/Unicode, context-disambiguated selectText/cursor modes printable keys and X11 text/Markdown/HTML clipboard paste with source/Worker GTK receiver-event evidence; existing native actions/selection plus macOS held-click/key duration build and no-GUI checks | Live held-click/background/cancellation evidence (Mac locked), native paste on other platforms/Wayland, wider keymap/IME/compositor and text providers, coordinate scroll and Linux/Windows held input |
| Browser discovery / lifecycle | CDP binding/lifecycle, browser tabs namespace, fresh metadata, session names and MV3-assisted native selected-tab identity; real Chromium in both modes | Full extension/in-app transports, user claims/takeover and broader browser/profile selection |
| Browser AX / screenshot | CDP AX, PNG/JPEG viewport/full-page/clip and crop-coordinate validation; real Chrome at 1× and forced 2× | Broader DOM fidelity, mixed-DPI/zoom hardware and cross-platform capture |
| Browser viewport | Discovered viewport capability, host-owned set/reset across tabs/windows and cleanup recovery; real Chrome | Headful/mixed-DPI/zoom, external emulation and host-crash coverage |
| Browser text / pointer input | Host-owned held clicks and press-key duration/chords, element/coordinate input, pointer drag, Unicode/value/ranges and trusted text/HTML paste and native MIME/file drops with native same-URL DOM/shadow owners and nested process routing; real Chrome smoke | Full keyboard/layout coverage, frame transforms/zoom, headful paste and more keyboard/platform cases |
| Browser locators | Playwright Core selectors, actions, frames, composition, snapshots and fresh resolution | Broader dynamic/shadow/cross-origin coverage and per-operation connection overhead |
| Browser scripting | Host-owned QuickJS Worker for page/element/list evaluation, native isolated-world read schema, exact node/frame binding and cancellation; source/Worker Chrome probes | Broader DOM/provider/syntax compatibility and crash/platform coverage |
| Navigation / event waits | Basic navigation, locator waitFor, expectNavigation, URL/load waits and file chooser/download events, cancellation and failure recovery with real Chrome/Worker checks | Native picker presentation, popup-owned downloads and broader page event coverage |
| Dialogs / clipboard / developer tools | Host-owned dialog handles, logs and native text/HTML/PNG browser clipboard; real Chrome flows, resumed-action failure reporting and cleanup checks | Pre-binding/popup dialogs and broader frame flows, headful/remote clipboard, broader capability discovery and log sources |
| Optional browser capabilities | Viewport, tab CDP/event cursors, page assets and native management (windows/tabs/groups/bookmarks with browser-wide before-state audit); real Chrome in both session types, including worker restart/idle | Shared-group account/headful validation, crash/uncertain-write recovery, broader CDP/provider matrix, asset fidelity and remaining capabilities |
| Browser history | Optional permission, date/query/limit API, latest matching visit per URL, acknowledged cancellation; owned Chromium checks in both session types | User-profile permission grant/revoke, headful/platform coverage and reference-provider visit cardinality |
| WebMCP | Native Chrome 158 registration objects, per-frame discovery, description/call API, abort acknowledgement and stale-handle fencing; both session types passed owned imperative/declarative workflows | Automatic tool notifications, real interaction/consent dialogs, headful/platform/crash and external-site coverage |
| Content / artifacts | Screenshots, completed downloads/assets, private Workspace/YouTube files and locator media downloads with exact native node/frame binding; source/Worker Chrome fixtures and real public Sheets CSV/XLSX/PDF | Authenticated Docs/Slides/YouTube, provider fidelity, browser download UI/approval-aware waiting, streaming/protected media, remote delivery and artifact retention |
| Host / session integration | Plugin installer, native permission boundaries, host-owned per-turn resources and tab/popup retention, immediate MCP turn-ended cleanup with idle JS preservation and stale-callback fencing | In-process CPU preemption, user takeover/claims, crash recovery and broader host integration |
| Platform coverage | Node checks and real disposable macOS headless Chrome evidence | Native desktop, headful focus, Linux and Windows verification |

Keep the full goal active while any required capability or its verification is
missing. Prioritize concrete workflows that cross observation, action and result
verification; keep unsupported operations explicit.
