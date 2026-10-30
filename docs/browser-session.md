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

## Selection bridge setup

`tabs.selected()` uses the bundled Manifest V3 extension in the configured CDP
browser. Load `scripts/node-repl/chrome-selection-extension` from a source checkout,
or `scripts/chrome-selection-extension` from an installed plugin. In Chrome's
extension management page, the user enables developer mode and loads this folder.
The installer bundles files; installing the extension into a user browser remains
an explicit user action. Extension ID: `mbhbomghoccgpofpfkkfiaonndokcbpj`.

The manifest requests `tabs` and `debugger`. Native active-tab/window state comes
from [tabs.query](https://developer.chrome.com/docs/extensions/reference/api/tabs).
[debugger.getTargets](https://developer.chrome.com/docs/extensions/reference/api/debugger)
maps that native tab ID to the exact CDP target ID. The bridge rechecks the native
active ID around mapping and rejects a changed or ambiguous observation. The
bridge exposes only this selection query and checks its extension ID/protocol
before use. It does not infer selection from document focus, visibility, titles,
URLs or target enumeration order.

The host creates a private background extension control page only when selection
is requested. It stays outside normal tab inventories and viewport overrides,
including pending target-creation markers. Each resource owner has its own control
page. Turn/reset/close cancels pending queries, disconnects the page transport and
closes the owned target. Close failure retains ownership for retry. Initialization
failure closes the temporary page; extension identity/protocol mismatch and a
missing extension are explicit errors. Reset or begin a new turn to retry after
fixing an extension installation. Each selection/handshake has a 10-second reply
budget; target creation/discovery uses the existing bounded browser controller.

If no accessible selected page exists, or the only selected page is a private
control page, the result is undefined. Focus emulation from background input does
not change native tab selection. The adapter preserves native activation; it
observes the returned page through the usual API without activating another tab.
This is CDP automation assisted by an extension selection bridge. Full extension
transport, user tab claims/takeover, history and management remain separate work.

## Validation

```sh
node --test scripts/node-repl/*.test.mjs
OPEN_COMPUTER_USE_CDP_URL=http://127.0.0.1:9222 node scripts/run-browser-session-smoke.mjs
# Use a separate disposable browser without the extension:
OPEN_COMPUTER_USE_CDP_URL=http://127.0.0.1:9223 node scripts/run-browser-session-smoke.mjs --missing-extension
```

Real macOS headless Chromium 141 passed both source and Worker modes: native
selection with duplicated page URLs and active background focus emulation; fresh
metadata across navigation; per-session names and lifecycle; hidden control
inventory/viewport targets; concurrent owners; paused-control query cancellation;
and missing-extension cleanup. Tests also verify extension ID/assets, name
validation, failed cleanup retry, pending private marker exclusion and acknowledged-close
discovery lag.

Chromium/Chrome for Testing supports command-line unpacked extension loading for
isolated tests. Branded Chrome removed that loading flag in Chrome 137; see
[Chrome's extension platform update](https://developer.chrome.google.cn/blog/extension-news-june-2025?hl=en).
Use the normal user-driven extension installation flow for that browser. A user
profile install, headful multi-window/incognito behavior, native release packaging
and Linux/Windows validation remain unverified. The full harness goal stays active.
