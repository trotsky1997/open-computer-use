# Browser session metadata and native tab selection

```js
const browser = await cua.getBrowser({id: 'cdp'});
await browser.nameSession('🔎 Research');
const tab = await browser.tabs.new();
await tab.goto('https://example.com');
nodeRepl.write({title: await tab.title(), url: await tab.url()});
const selected = await browser.tabs.selected();
const existing = await browser.tabs.get(tab.id);
nodeRepl.write(await browser.tabs.list());
```

`tabs.new()` opens a background blank tab. `tabs.get(id)` binds an exact tab ID
and observes it; `tabs.list()` returns normal tab metadata. `title()` and `url()`
read fresh browser metadata for the bound ID and return undefined when it is
unavailable. Repeated `getBrowser()` calls emit initial provider guidance once
per REPL context; `documentation()` remains available explicitly.

`nameSession(name)` labels the logical host automation session. Names appear in
context output and `listBrowsers()` metadata as `metadata.sessionName`. They
survive idle turn boundaries and JS resets, remain separate across sessions,
and clear at final session close. Names accept 1...100 Unicode code points with
non-whitespace content and no control characters. They do not rename page titles,
windows or tab groups. `createBrowserTab('cdp',url,{visible,sessionName})` applies
the name before creating a target; invalid names fail before target creation.

## Browser bridge setup

`tabs.selected()`, [history queries](browser-history.md) and the [management capability](browser-management.md) use the
bundled Manifest V3 extension in the configured CDP browser. Chrome/Chromium 137+
is required. Load `scripts/node-repl/chrome-browser-extension` from a source
checkout, or `scripts/chrome-browser-extension` from an installed plugin. In the
browser's extension management page, enable developer mode and load this folder.
The installer bundles the files; loading/updating permissions in a user profile
remains an explicit user action. Reload the extension after updating its files,
including a development service worker's cached scripts. Extension ID:
`mbhbomghoccgpofpfkkfiaonndokcbpj`.

The manifest requests `tabs`, `debugger`, `tabGroups`, `bookmarks` and `storage`.
`tabs` and `debugger` map native active-tab/window state to an exact CDP target;
`tabGroups` and `bookmarks` support requested organization; `storage.session`
retains the bounded before-state audit for this browser session. Optional `history`
access requires a user gesture in the extension options; it starts disabled. There are no
host permissions or remote endpoints. The host verifies extension identity and
bridge protocol before invoking the fixed worker entry point.

Selection uses [tabs.query](https://developer.chrome.com/docs/extensions/reference/api/tabs)
and [debugger.getTargets](https://developer.chrome.com/docs/extensions/reference/api/debugger),
then rechecks the native active ID and rejects a changed or ambiguous observation.
It does not infer selection from document focus, visibility, titles, URLs or
target enumeration order. If no accessible selected page exists, the result is
undefined. Focus emulation for background input leaves native selection intact.

The host reuses an existing worker when available. On cold start it opens a
transient private bootstrap tab to wake the extension, attaches a debugger session
to its service worker, then closes the bootstrap before serving requests. Host
initializations are serialized so later owners reuse the ready worker. There is no permanent control tab to affect last-tab/window
behavior. Temporary bootstrap IDs and pending URLs stay outside normal inventories
and viewport targeting. An attached debugger keeps the worker alive beyond its
normal idle limit; see [Chrome worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle).
Each host owner has its own connection to the same worker and browser-wide queue.

Turn/reset/close cancels pending reads and drains accepted management writes before
disconnecting. Requested organization changes persist. Initialization failure
closes the temporary tab; failed close retains ownership for retry. Missing
extensions and identity/protocol mismatches fail explicitly. Reset or begin a new
turn after fixing installation. Requests have a 10-second observation budget;
an observation timeout leaves an accepted write pending, and cleanup waits for
its acknowledgement. Transport loss reports an uncertain outcome, closes owned
resources and requires fresh audit/state inspection before retrying the action.
There is no automatic rollback or write replay.

This remains CDP automation assisted by an extension bridge. Full extension/in-app
transport, user tab claims/takeover and the remaining provider work stay open.

## Validation

```sh
node --test scripts/node-repl/*.test.mjs
OPEN_COMPUTER_USE_CDP_URL=http://127.0.0.1:9222 node scripts/run-browser-session-smoke.mjs
# Use a separate disposable browser without the extension:
OPEN_COMPUTER_USE_CDP_URL=http://127.0.0.1:9223 node scripts/run-browser-session-smoke.mjs --missing-extension
```

Real macOS headless Chromium 141 checks source and Worker sessions: native
selection under background focus emulation, fresh metadata across navigation,
per-session names, transient bootstrap cleanup, concurrent owners, paused-worker
read cancellation and missing-extension cleanup. Management has a separate
[fixture smoke](browser-management.md#validation), including worker idle/restart
and before-state audit retention.

Chromium/Chrome for Testing supports command-line unpacked extension loading for
isolated tests. Branded Chrome removed that loading flag in Chrome 137; see
[Chrome's extension platform update](https://developer.chrome.google.cn/blog/extension-news-june-2025?hl=en).
Use the normal user-driven extension installation flow for that browser. A user
profile install, headful multi-window/incognito behavior, native release packaging
and Linux/Windows validation remain unverified. The full harness goal stays active.
