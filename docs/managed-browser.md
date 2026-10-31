# Host-owned browser

Set an absolute trusted Chromium executable path in the environment inherited by
the JS/MCP host:

```sh
export OPEN_COMPUTER_USE_BROWSER_EXECUTABLE=/absolute/path/to/chrome
ocu js 'var tab=await cua.createBrowserTab("cdp","https://example.com");await tab.getAXState();'
```

The first browser operation lazily starts Chromium in headless mode by default. No browser is
downloaded. macOS and Linux require working local process identity support
(including lsof), Chromium system libraries and a working Chromium sandbox.
An exec-preserving launcher is supported; it must keep Chromium as the direct
child process. OPEN_COMPUTER_USE_CDP_URL takes precedence and continues to select
an externally managed browser. With neither variable configured, no browser is
started. Native desktop support remains independently configured.

The existing cdp provider and tab APIs are used. Inventory marks the browser as
managed. Default headless mode rejects visible:true. The bundled
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

Headful startup/visibility is implemented for macOS/Linux; native-window evidence
currently covers Linux Xvfb/Openbox. Physical desktops and macOS headful remain
unverified. Windows managed startup remains open. Simultaneous host/guardian loss
during startup has no durable recovery journal. External CDP host-crash recovery
and destroyed completion contexts still require broader work.

## Headful presentation

Configure the persistent REPL/MCP host before startup:

```sh
export OPEN_COMPUTER_USE_BROWSER_MODE=headful
ocu repl
```

The mode accepts headless or headful and is fixed for the browser lifetime;
restart the host to change it. Headful mode needs a graphical display/window
manager. The host explicitly minimizes and verifies its initial windows before
publishing the endpoint; startup or a new-window operation may briefly create a blank native window while
Chrome initializes. Requested URLs load after visibility is applied. The existing headless configuration remains the default.

```js
var browser=await cua.getBrowser({id:'cdp'});
var visibility=await browser.capabilities.get('visibility');
await visibility.get();
await visibility.set(true);
var tab=await cua.createBrowserTab('cdp','https://example.com',{visible:true});
await tab.markHandoff();
await visibility.set(false);
```

The optional visibility capability is advertised only for managed headful
browsers. get() reads native Chrome window state; set(false) minimizes all current
windows in the private browser and set(true) restores their previous bounds/state.
Tab selection is preserved. Closing all visible windows keeps the private
headful process/profile alive for this host session. An empty browser reports
hidden; hide is a no-op and show opens one blank window. Closed tabs stay closed.
Session cookies remain until the managed browser/profile is reclaimed.
 Explicit visible options apply before tab creation;
omitting the option leaves presentation unchanged. Changes persist across turns
and JS resets. Accepted operations serialize at the host and shutdown waits for
them. Native errors can leave a partial window change: inspect get() and the
windows before retrying. External CDP browser windows are untouched.

This exposes windows for viewing/manual interaction, while the host still owns
the browser and profile lifetime. User-takeover arbitration and durable delivery
beyond host exit remain open. Native clipboard/paste use the process virtual clipboard in headless mode and
the actual system/display clipboard in managed headful mode. Text, HTML and PNG
are supported through the existing clipboard API. Headful access requires the
host's exact current endpoint/socket/process proof before any helper/permission
is created. Externally configured headful browsers remain unavailable.

Headful clipboard data is shared with other applications on that display. Writes
are retained, can outlive the browser when a clipboard manager stores them, and
are not restored on reset/cancellation. Other applications/users can overwrite
them; coordination across hosts and takeover remains open. Internal control pages
use hidden native targets and stay outside the Chrome tab strip. Their dedicated
connections remain open for completion recovery and close after pending jobs
settle. A lost helper connection fails explicitly; confirmed completed jobs allow
reset and fresh helpers, while uncertain native completion keeps its input fence.
See [clipboard and paste](browser-cdp.md#browser-clipboard-and-native-paste) for native job rules.

## Repeatable checks

```sh
OCU_TEST_CHROME_EXECUTABLE=/absolute/path/to/chrome node scripts/run-managed-browser-smoke.mjs
node scripts/tests/browser-only-install-smoke.mjs /absolute/path/to/chrome
# Include installed headful checks on Linux with the graphical fixture dependencies:
node scripts/tests/browser-only-install-smoke.mjs /absolute/path/to/chrome --headful
# Linux with Xvfb, Openbox, xprop, xwininfo and system Python Gtk 3:
OCU_TEST_CHROME_EXECUTABLE=/absolute/path/to/chrome node scripts/run-managed-browser-visibility-smoke.mjs
```

The controllers own all profiles/processes. The Linux VM fixture supplies its
own exec-preserving no-sandbox launcher; the production launcher keeps Chromium's
sandbox enabled. Checks cover both session implementations, native input,
clipboard/cookies/screenshots, private default downloads, reset/turn survival,
guardian-loss recovery, natural host exit and host SIGKILL. The installed test
hides its source checkout and exercises direct sessions and the actual MCP entry.

Linux native-window checks cover initially minimized windows, explicit visible
and background creation, multi-window hide/restore, native text input, invalid
requests, reset/turn state, guardian-loss recovery and natural/SIGKILL host exit.
X11 window-map state is checked independently of CDP. Installed source-removed
modules pass the same headful session/presentation and guardian-loss flows.
The real source and installed MCP entries pass native presentation, hidden-state
retention across js_reset and private browser/profile cleanup on shutdown.

Managed headful clipboard checks on Linux additionally prove native GTK-to-Chrome
text reads, Chrome-to-GTK Unicode text/PNG writes, trusted text/HTML/image paste,
HTML sanitization, hidden control targets, unowned external-client rejection
without clipboard changes, helper disconnect/reset recovery and hidden-window
reads. These flows pass source/Worker and real MCP entry points, including the
source-removed installed payload. Physical desktop/macOS system clipboard and
Windows remain unverified.

The managed headful launcher uses Chromium's
[keep-alive switch](https://github.com/chromium/chromium/blob/main/chrome/common/chrome_switches.h)
and a private profile session preference to retain session cookies. Chromium's
[session-data deletion code](https://github.com/chromium/chromium/blob/main/chrome/browser/sessions/session_data_deleter.cc)
checks that preference after the last window closes. These settings are written
only into the newly created temporary profile, which the guardian removes on host
shutdown. Source/Worker and installed/MCP Linux checks cover repeated empty-window
show/hide, explicit background and omitted visibility creation, ordinary visible
creation, cookies on a fresh HTTP request and retained clipboard data in the same
PID/profile. Showing an empty browser opens exactly one blank tab.
