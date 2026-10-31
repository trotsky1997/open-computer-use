# Host-owned headless browser

Set an absolute trusted Chromium executable path in the environment inherited by
the JS/MCP host:

```sh
export OPEN_COMPUTER_USE_BROWSER_EXECUTABLE=/absolute/path/to/chrome
ocu js 'var tab=await cua.createBrowserTab("cdp","https://example.com");await tab.getAXState();'
```

The first browser operation lazily starts headless Chromium. No browser is
downloaded. macOS and Linux require working local process identity support
(including lsof), Chromium system libraries and a working Chromium sandbox.
An exec-preserving launcher is supported; it must keep Chromium as the direct
child process. OPEN_COMPUTER_USE_CDP_URL takes precedence and continues to select
an externally managed browser. With neither variable configured, no browser is
started. Native desktop support remains independently configured.

The existing cdp provider and tab APIs are used. Inventory marks the browser as
managed. visible:true is rejected because this runtime is headless. The bundled
MV3 extension is loaded at startup. Chromium distributions may restrict extension
loading; Chrome for Testing 158 was exercised on macOS and arm64 Linux.

One private temporary profile belongs to the Node/MCP host. Cookies, marked tabs
and browser state survive js_reset and turn boundaries. Default downloads stay
under the private profile and are deleted with it; use the download API to save
files that should persist. Closing a JS session releases its tab resources;
marked tabs remain until host exit. Browser lifetime ends with the host. MCP EOF
and signals close session resources before the browser; a detached IPC guardian
also closes its direct browser child when the host exits naturally or is killed.
Startup verifies the debugger route, browser PID and local profile/socket
identity before publishing the endpoint. A guardian lost after startup can be
recovered through the verified private CDP peer.

Headful and Windows managed startup remain open. Simultaneous host/guardian loss
during startup has no durable recovery journal. External CDP host-crash recovery
and destroyed completion contexts still require broader work.

## Repeatable checks

```sh
OCU_TEST_CHROME_EXECUTABLE=/absolute/path/to/chrome node scripts/run-managed-browser-smoke.mjs
node scripts/tests/browser-only-install-smoke.mjs /absolute/path/to/chrome
```

The controllers own all profiles/processes. The Linux VM fixture supplies its
own exec-preserving no-sandbox launcher; the production launcher keeps Chromium's
sandbox enabled. Checks cover both session implementations, native input,
clipboard/cookies/screenshots, private default downloads, reset/turn survival,
guardian-loss recovery, natural host exit and host SIGKILL. The installed test
hides its source checkout and exercises direct sessions and the actual MCP entry.
