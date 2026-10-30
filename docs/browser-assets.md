# Rendered page assets

```js
const assets = await tab.capabilities.get('pageAssets');
const inventory = await assets.list();
const bundle = await assets.bundle({inventoryId: inventory.id, kinds: ['image', 'font']});
nodeRepl.write({manifest: bundle.manifestPath, files: bundle.assets, failures: bundle.failures});
```

`list()` describes the current rendered state. Load lazy content or change UI state
before collecting another inventory. Chrome resource records, native DOM snapshot
attributes and computed CSS URL values contribute deduplicated assets. Sources
identify resource records, backend DOM node IDs and attribute/style properties.
Root and cross-origin frame sessions are included. Top-level inline SVGs are
returned as markup; nested SVGs remain inside their outer SVG.

Inventories include `id`, `pageUrl`, `assets`, `inlineSvgs` and counts by kind.
Asset kinds are `font`, `image`, `stylesheet`, `video`, `script` and `other`.
Only the first four kinds can be bundled. Omitted selectors choose all supported
files; `kinds` and `assetIds` select their union. Empty arrays select nothing.
Unknown IDs/kinds, extra options, inventories from other tabs/turns and selected
script/other entries fail before opening a browser connection. Inventories are
private to the host resource owner; navigation invalidates them. Navigation
observed during collection or export fails the operation and removes its partial
directory. Rendering may change between collection and export: files reflect
retrieval time, with no byte-for-byte snapshot guarantee.

`bundle()` returns `directoryPath`, `manifestPath`, successful `assets`, individual
`failures` and `summary` (`requestedCount`, `downloadedCount`, `failedCount`,
`elapsedMs`). Each file has a sanitized, ID-prefixed basename. The JSON manifest
contains the same result. This is a directory export, without ZIP packaging.
Completed directories survive turn/reset/close and callers manage retention.
Canceled operations remove their directory; cleanup waits for pending writes,
stream closure and browser disconnect. Disconnect failure retains ownership for
cleanup retry. No browser download policy or viewport is changed.

HTTP(S) resource bodies use Chrome's credentialed network loader, in the observed
frame, and stream to disk in chunks. `data:` is decoded locally. `blob:` is fetched
in a dedicated isolated world, resolved to a browser IO stream and released after
export. Local and privileged resource URLs are excluded. A missing resource is a
per-file failure, so the remaining files can still export. Refetches may access
the network and update normal browser cache/cookies. Network/IO commands have a
10-second response deadline; long streams can continue while individual reads
succeed. Cancel waits for an outstanding command to finish or reach its deadline.

Evidence: `node --test scripts/node-repl/*.test.mjs` checks validation, CSS escape
parsing and cleanup retry. With disposable headless Chrome:

```sh
OPEN_COMPUTER_USE_CDP_URL=http://127.0.0.1:9222 node scripts/run-assets-smoke.mjs
```

The smoke exercises source and Worker sessions, computed backgrounds, inline
SVGs, cross-origin frames, cold credentialed resources, image/font/stylesheet/
media URL bytes, data/blob resources, default/union selection, per-file failures,
navigation, in-flight cancellation and completed artifact retention. Media/font
fixtures verify export bytes, without codec/font rendering claims. Full provider
coverage, streaming/DRM media, recursive CSS imports and unloaded `srcset`
candidates, renderer/host crashes, remote transport and artifact expiry remain
open. The broader harness goal remains active.
