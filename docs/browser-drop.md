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

The pinned Playwright dependency supplies locator resolution and trial hover
checks. The harness dispatches CDP Input.dispatchDragEvent, producing trusted
browser drag events and Chromium DataTransfer/file behavior. The browser controls
acceptance, MIME normalization, rich editor insertion and protected data access.
Completion means dispatch finished; inspect the page to verify its own result.

Each native stage resolves and checks the target again. The host validates main
and receiving-frame loaders, hit-frame ancestry, viewport metrics and revision.
Cross-process frame sessions bind the native target/frame identity explicitly.
Native hit testing descends through iframe content quads into each child layout
viewport, including document scroll offsets. Nested process boundaries and
identical-URL independently hosted frames are supported. Same-process frames bind
recursively through DOM.getFrameOwner backend identities. Owner traversal runs
in an isolated world; a private isolated selector follows element-child and
shadow-root steps, then public contentFrame() verifies the selected Core frame
object. URL uniqueness and frame-tree creation order are unnecessary. Native
objects and temporary handles are released; missing or changed owners fail
before delivery. The selector registers through a pinned Core context channel
because public selector registration omits CDP default-context setup in 1.64.1.
Upgrade that registration when the public CDP path works, and rerun these smokes.
Scaled/rotated/perspective frame transforms, zoom, headful browsers and other
platforms need additional evidence. A final native loader/viewport check precedes
each dispatch; document changes fail without replaying the drag.

One session owns native dragging for the browser origin at a time. Action timeout
cancels native dragging and preserves the JS session when cleanup succeeds. A
JavaScript dialog returns control through getJsDialog(); it pauses the drop action
deadline so it can be answered in a later call. The overall JS execution deadline
still applies. Answering the dialog resumes remaining stages. Reset, timeout and
close prevent later stages, dismiss owned dialogs and cancel dragging before
releasing focus. Cleanup failure retains ownership and blocks reuse until a
successful reset retry. Page effects from an already dispatched drop can finish.
Host crash and external native input contention remain open.

## Verification

```sh
node --test scripts/node-repl/browser-drop.test.mjs
OPEN_COMPUTER_USE_CDP_URL=http://127.0.0.1:9222 node scripts/run-drop-smoke.mjs
```

Use a disposable local Chromium with remote debugging enabled. Real macOS
headless Chrome at native 1× and forced 2× checks trusted events, protected text/file data before drop,
Unicode MIME and file bytes, native rich editor insertion, same-target iframe
input, cross-process MIME/file delivery, nested cross-process and same-process
children with scrolling, identical-URL independently hosted siblings, invalid paths and
covered-target action timeout, cross-process frame prompt response, dialog response beyond the action deadline,
same-URL siblings and nested sibling documents, open shadow roots, light/shadow
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
