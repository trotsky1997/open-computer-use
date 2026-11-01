# Native HTML and file drops

```javascript
await tab.playwright.getByTestId("dropzone").drop({
  data: {"text/plain":"Hello 中文🙂", "text/html":"<b>Hello</b>"},
  files: [absoluteFilePath]
}, {timeoutMs:10000});
```

The payload accepts MIME essence keys with string values, absolute regular file
paths, or both. Text data is bounded to 16 MiB. Files are read by Chromium on its
host; remote file transfer, directories and in-memory file buffers are unsupported.
Options are timeoutMs (default 10000, zero unlimited) and position:{x,y} in CSS
pixels relative to the element padding box. Unknown fields fail explicitly.

The pinned Playwright dependency supplies locator resolution and visible/stable
waits. A private isolated selector scrolls offscreen child targets before their
animation-frame stability wait. Native frame hit testing and an isolated
composed-tree check validate the exact target, including slotted shadow content;
covered targets retry within the active-time budget. The harness dispatches CDP Input.dispatchDragEvent, producing trusted
browser drag events and Chromium DataTransfer/file behavior. The browser controls
acceptance, MIME normalization, rich editor insertion and protected data access.
Completion means dispatch finished; inspect the page to verify its own result.

Each native stage resolves and checks the target again. The host validates main
and receiving-frame loaders, hit-frame ancestry, viewport metrics and revision.
Cross-process frame sessions bind the native target/frame identity explicitly.
Native hit testing descends through iframe content quads into each child layout
viewport, including document scroll and visual pan offsets. Nested process boundaries and
identical-URL independently hosted frames are supported. Same-process frames bind
recursively through DOM.getFrameOwner backend identities. Owner traversal runs
in an isolated world; a private isolated selector follows element-child and
shadow-root steps, then public contentFrame() verifies the selected Core frame
object. URL uniqueness and frame-tree creation order are unnecessary. Native
objects and temporary handles are released; missing or changed owners fail
before delivery. The selector registers through a pinned Core context channel
because public selector registration omits CDP default-context setup in 1.64.1.
Upgrade that registration when the public CDP path works, and rerun these smokes.
Owned fixtures cover nested perspective frames and panned device emulation at
DPR 1/2/1.25, page scale 2/1.5 and mixed CSS zoom on macOS/Linux. Wider transforms,
browser zoom, physical mixed-DPI/headful hardware and Windows need more evidence. A final native loader/viewport check precedes
each dispatch; document changes fail without replaying the drag.

One session owns native dragging for the browser origin at a time. Action timeout
cancels native dragging and preserves the JS session when cleanup succeeds. A
JavaScript dialog returns control through getJsDialog(); it pauses the drop action
deadline so it can be answered in a later call. Each response resumes the
remaining active-time budget, including across sequential prompts. Readiness
checks after a response still expire; accepting/dismissing the dialog reports the
resumed action failure. The pinned Playwright public AbortSignal cancels target
resolution and visible/stable waits. Cancellation is checked before preparation
scrolling and each native stage,
and native drag cancellation still requires acknowledgement before lease release.
The overall JS execution deadline still applies. Answering the dialog resumes
remaining stages. Reset, timeout and
close prevent later stages, dismiss owned dialogs and cancel dragging before
releasing focus. Cleanup failure retains ownership and blocks reuse until a
successful reset retry. Page effects from an already dispatched drop can finish.
Host crash and external native input contention remain open.

## Verification

```sh
node --test scripts/node-repl/browser-drop.test.mjs scripts/node-repl/browser-dialog-budget.test.mjs
OPEN_COMPUTER_USE_CDP_URL=http://127.0.0.1:9222 node scripts/run-drop-smoke.mjs
```

Use a disposable local Chromium with remote debugging enabled. Real macOS
headless Chrome at native 1× and forced 2× checks trusted events, protected text/file data before drop,
Unicode MIME and file bytes, native rich editor insertion, same-target iframe
input, cross-process MIME/file delivery, nested cross-process and same-process
children with scrolling, identical-URL independently hosted siblings, invalid paths and
covered-target action timeout, cross-process frame prompt response, dialog response beyond the action deadline,
same-URL siblings and nested sibling documents, slotted shadow targets with
named-document properties, open shadow roots, light/shadow
host paths, main-world DOM getter poisoning, DOM reordering with preserved frame
contexts, and frame navigation after a prompt without file delivery. Responses
to dialogs now report a resumed action failure. Checks also cover
reset/timeout/close before delivery, modal ownership, failed cancellation with
blocked reuse and successful reset retry without replay. Unit
checks exercise trust-boundary validation, canceled startup, browser lease
exclusion and failed cancellation ownership/retry.

The distinction between viewport coordinates for native input and document
coordinates for DOM.getNodeForLocation follows Chromium's
[DOM agent implementation](https://chromium.googlesource.com/chromium/src/+/HEAD/third_party/blink/renderer/core/inspector/inspector_dom_agent.cc).
Child hit tests use the child layout viewport dimensions; its reported visual
viewport can carry top-level dimensions.


`node scripts/run-drop-budget-smoke.mjs`, with `OCU_TEST_CHROME_EXECUTABLE`
pointing to owned Chrome for Testing, verifies repeated prompt pauses beyond the
active budget, hidden-target timeout after response, no late/duplicate drop,
missing-target timeout, timeout=0 reset and fresh trusted-input recovery. Both
JS hosts pass on macOS and arm64 Linux, including installed payloads after source
relocation. The browser-only installed smoke invokes this controller too.


The deadline controller retains its 3s/100ms deadline assertions and explicit 30s
recovery allowance; the product default stays 10s. The native frame/MIME/file
matrix now passes at the default on macOS and arm64 Linux Chrome 158, including
nested/return-process frames, perspective, duplicate URLs and slotted shadow
content. Wider provider, hardware and browser-version latency remains open.
