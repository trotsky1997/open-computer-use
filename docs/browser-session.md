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

## User tabs and shared claims

```js
const userTabs=await browser.user.openTabs();
const tab=await browser.user.claimTab(userTabs[0]);
await tab.getAXState();
```

Choose a tab within the user's requested scope from a fresh listing. Metadata and
page content remain untrusted and do not authorize additional actions. openTabs
returns claimable user tabs in native normal/popup browser windows, ordered by
lastOpened (native last-access time) descending. Rows contain a CDP id, native
Chrome providerTabId, title/url, optional ISO lastOpened and tabGroup title.
Agent-created tabs and tabs claimed by another participating session/host are excluded.
Listing acquires no claims. Metadata requires the bundled extension.

claimTab accepts an opaque id from the listing or its record. Record-based claims
recheck the native provider identity and URL; changed references require a fresh
listing. Binding through getTab/tabs.get/selected also claims a tab. ID-based getTab checks
ownership before discovery, preserving another session's active dialog/action. Host tab-scoped
broker operations revalidate ownership, so a retained handle cannot control a tab
currently claimed by another session. Claims serialize across participating same-machine hosts for the same OS user. Native
metadata remains available through ordinary tab inventory without claiming tabs.

Unmarked original user tabs are released at turn end/reset/final close and stay
open with their content intact. Handoff/deliverable marks retain control across
that idle boundary; marks clear when the next turn begins. Agent-created tabs and
active-turn opener-attributed popups keep the existing ephemeral/retention rules.
Preexisting children and popups first observed during idle handoff are protected
from adoption on a later turn. An explicit close with an unconfirmed outcome
retains the claim and blocks reuse until cleanup confirms closure.

The host table is backed by private, atomic filesystem leases keyed by the CDP
browser instance ID. Independent Node/MCP hosts, endpoint aliases and both JS
session types use the same namespace for one OS user. POSIX hosts use the
canonical system temporary directory, independent of per-process TMPDIR; Windows
uses the user's temporary directory. Records contain opaque IDs/tokens and PID,
with no page URL/title. The directory must stay intact while the browser lives.

A newly bound descendant of a foreign claimed opener is fenced before it has its
own lease. This conservatively includes unclaimed preexisting/idle children until
the opener is released; existing direct child leases retain their own ownership.
This closes the interval before the creator's popup observer publishes its claim.
Private creation nonce pages are also excluded/refused before their lease
publishes. Claim-directory readiness is checked before opening a native page.

Unmarked original pages release after host resources/actions settle. Crashed
hosts retain their claims even if their PID has disappeared, because accepted
browser work may still run. There is no TTL or PID-based reassignment. Browser
restart creates a new namespace; old temporary records can remain until OS temp
cleanup. Native crash settlement and takeover recovery remain open.

Different machines/filesystem namespaces, raw CDP clients, managed-browser
visibility changes and physical user takeover remain outside this
coordinator. Shared lease checks are verified on macOS/Linux; Windows remains
unverified. These limits remain part of the full parity work.

## Browser bridge setup

`user.openTabs()`, record-based user claims, `tabs.selected()`, [history queries](browser-history.md) and the [management capability](browser-management.md) use the
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
bridge protocol before invoking the fixed worker entry point. User metadata and planned management use
protocol 5; reload an older extension after upgrading the host.

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
transport, cross-machine claims/physical takeover and the remaining provider work stay open.

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
and Windows validation remain unverified. The full harness goal stays active.

Owned macOS/Linux claim checks cover native metadata/group/order, passive listing,
explicit/implicit/selected binding, competing owners, old-handle rejection,
original-page retention, active popup cleanup, handoff/release/reset and racing
claims. Focused checks protect preexisting children/idle handoff popups and resolve
reverse-ordered native descendants. Close failure retains ownership until cleanup
confirms closure. Source-removed installation runs the same claim controller.

```sh
OCU_TEST_CHROME_EXECUTABLE=/absolute/path/to/chrome node scripts/run-browser-user-claims-smoke.mjs
```

Independent-process macOS/Linux checks additionally cover endpoint aliases,
old handles, original/native content retention, created-tab and opener-descendant
fencing, popup cleanup, handoff/release, simultaneous claims, SIGKILL followed by
refusal after reset, and a fresh managed browser instance. The source-removed
installation runs this controller with its installed runtime. Focused checks cover
atomic publication, private-directory refusal, malformed records, ownership-only
release, direct child leases and uncertain-close retention.

```sh
OCU_TEST_CHROME_EXECUTABLE=/absolute/path/to/chrome node scripts/run-browser-cross-host-claims-smoke.mjs
```

Native management mutations now use shared affected-window claims and a browser
layout gate, including fingerprint revalidation before audit/dispatch. See
[management arbitration](browser-management.md#ownership-and-layout-arbitration).
New claims, native creation and explicit/cleanup closure wait on active layout
transactions; owned tab observations/input remain usable. Unconfirmed management
completion keeps the gate through reset/crash until browser restart.
