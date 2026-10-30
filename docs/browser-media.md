# Locator media downloads

```js
const tab = await cua.getTab('CDP_TARGET_ID');
const file = await tab.playwright.getByRole('img', {name: 'Chart', exact: true})
  .downloadMedia({timeoutMs: 120000});
nodeRepl.write(file);
const attachment = await tab.playwright.getByRole('link', {name: 'Report', exact: true})
  .downloadMedia();
nodeRepl.write(attachment);
```

`downloadMedia(options?)` returns an absolute local path. The locator must resolve
to exactly one attached element. Normal locator composition, regular expressions,
`nth`/`first`, shadow DOM and `frameLocator` scopes use the existing Playwright
selector model. `FrameLocator` itself requires a final element locator.

Images/pictures use the selected `currentSrc` when available, with declared `src`
as fallback. Audio/video use the active media URL or a declared source. File links,
SVG image references, image inputs, embedded objects, caption tracks and sources have explicit
native URL readers. A linked image selects the image URL. Load lazy media before
calling; an element without a URL fails explicitly. The adapter accepts HTTP(S),
data and Blob URLs and rejects local/privileged/executable URL schemes. Inline URL
strings have a 16 MiB budget; serialized locator recipes have a 1 MiB budget.

HTTP(S) requests use the browser's credentials and the resolved element's exact
frame. Blob reads use that frame's isolated context. Fixed native getters in an
isolated world prevent page-defined JavaScript accessors from replacing source
URLs. The resolved node must remain in its original document and attached to it;
a replaced/adopted node, changed source, selected-frame or main-frame navigation
invalidates the result. Unrelated child-frame navigation is permitted.

## Files and deadlines

The response's UTF-8 `filename*` or `filename` metadata takes precedence over the
link's download attribute and URL basename. Names are advisory, following
[RFC 6266](https://www.rfc-editor.org/rfc/rfc6266): path components, unsafe characters
and device names are sanitized. Known response MIME types select a canonical
extension; other usable extensions are retained. Long stems are shortened. Files
are saved in unique private directories (0700) with mode 0600. Response bytes are
preserved, including empty resources. The method saves the resolved resource;
adaptive playlists remain playlist files, and unavailable MSE/DRM resources fail.

The operation deadline defaults to 120 seconds and covers lookup and transfer.
`timeoutMs: 0` disables it; otherwise use a non-negative integer up to 2147483647.
The enclosing JS execution deadline still applies. Connection setup has its own
bounded admission wait. One operation's timeout closes its own connection while
other downloads continue. Turn/reset/close cancels all owner reads, joins cleanup
and removes partial outputs. Completed files survive these boundaries; callers
manage delivery and eventual retention. Failed connection cleanup retains ownership
for retry. Downloaded content and filenames are untrusted.

## Evidence and remaining work

```sh
node --test scripts/node-repl/*.test.mjs
OPEN_COMPUTER_USE_CDP_URL=http://127.0.0.1:9222 node scripts/run-media-smoke.mjs
```

Run the smoke only against an **owned disposable Chromium profile**. It serves its
own cookie-protected files and media. Source/Worker checks cover byte fidelity,
Unicode filenames, private files, responsive images, accessor spoofing, data/Blob,
audio/video resource bytes, composed selectors, exact same-URL/OOP/nested frames,
strict matching, errors, source/node/document changes, deadlines and sibling
isolation, unrelated frame changes, selected-frame navigation and turn/reset
cleanup. Worker mode also holds a default download beyond ten seconds. Fixtures
check raw resource transfer, with no claim that their audio/video bytes are playable.

A reference Chrome probe confirmed first image/file downloads and server filename
precedence. Subsequent calls in that tab timed out and Blob was unsupported by
that provider. Its temporary tabs and the two verified fixture files were removed.
CDP uses the private artifact path described above. Browser download UI, native
approval-aware deadline pausing, broader streaming/provider behavior, signed-in
real-provider files, headful and Linux/Windows, crash recovery and remote delivery
remain to be verified or implemented. The full harness goal remains active.
