# Browser viewport and screenshots

## Viewport capability

```js
var browser = await cua.getBrowser({id:"cdp"});
nodeRepl.write(await browser.capabilities.list());
var viewport = await browser.capabilities.get("viewport");
nodeRepl.write(await viewport.documentation());
await viewport.set({width:375,height:812});
// Inspect the responsive page and finish the task.
await viewport.reset();
```

Use an explicit override for a requested responsive size or breakpoint test.
Normal tasks use the existing viewport. Sizes are CSS pixels, positive integers
up to 10,000 per axis. Desktop layout and native device pixel ratio are retained;
this capability does not configure a mobile user agent or touch input.
`capabilities.list()` advertises viewport support when the CDP schema exposes its
sizing, capture and target-discovery methods. Unknown capability IDs fail explicitly.

The host owns one viewport lease per debugging origin. Other sessions may observe
and interact with that browser, and competing set/reset requests fail. Overrides
cover existing user pages, API-created tabs before navigation, and subsequently
discovered tabs/windows. Internal clipboard control pages are excluded when known.
Native browser window bounds are untouched, including when the requested viewport
is narrower than the window's minimum width. Reset clears the emulation and returns
to normal browser sizing. Failed dispatched updates attempt to clear the owned
override; invalid arguments leave it untouched. Existing external-client emulation
is not reconstructed.

Root target discovery and per-page CDP connections live in the host. Screenshots
under an override use the same per-page agent that owns its metrics, preventing
another capture agent from restoring cached default dimensions. Setting and clearing
the override commit a rendered frame before returning. Reset/timeout/close wait
for started changes, clear surviving pages and close observers. Failed cleanup
retains ownership and stops reuse until reset retries; observer disconnects notify
the owner even while its Worker is idle. Separate host processes are uncoordinated.
Known active JavaScript dialogs must be resolved before explicit set/reset.

## JPEG, PNG and capture regions

```js
var tab = await cua.getTab(tabId);
await nodeRepl.emitImage(await tab.screenshot());
await nodeRepl.emitImage(await tab.screenshot({fullPage:true}));
await nodeRepl.emitImage(await tab.screenshot({clip:{x:20,y:20,width:200,height:100}}));
var png = await tab.getScreenshot({emit:false});
```

`screenshot({fullPage?,clip?})` returns JPEG bytes without implicit output.
`nodeRepl.emitImage` detects JPEG from those bytes. `getScreenshot` returns PNG and
emits by default; it also accepts fullPage/clip and its existing emit flag.
`getAXStateAndScreenshot` continues to return a PNG observation alongside AX text.

The default area is the current visual viewport. fullPage uses the document's CSS
content bounds. clip is a positive CSS rectangle relative to that area: viewport
coordinates normally, document-area coordinates with fullPage. It must fit inside
the selected area; invalid flags, fields and bounds fail explicitly. Images retain
the browser's native raster scale, so a 200×100 CSS crop at 2× produces 400×200 pixels.
Capture areas and decoded raster dimensions are bounded to 100 million pixels;
encoded results are bounded to 20 MiB. Browser/codec limits may reject larger shapes.

Geometry checks cover navigation, document content bounds, scroll position, viewport
size and a host viewport revision. A set/reset cycle invalidates earlier screenshot
coordinates even when the size returns to its old value. PNG/JPEG headers supply
the actual raster dimensions. Cropped viewport coordinates are translated back to
visible CSS positions before click/drag/scroll dispatch. Full-page images serve
inspection/export: take a fresh viewport capture before coordinate input. Pinch-zoom
coordinate input remains unsupported. DOM/locator actions still resolve live targets.

## Evidence and remaining coverage

`OPEN_COMPUTER_USE_CDP_URL=http://127.0.0.1:9222 node scripts/run-viewport-smoke.mjs`
uses a disposable headless Chrome with --enable-automation. It verifies capability
discovery, narrow and portrait sizes, responsive CSS, tabs/windows, initial navigation
sizing, ownership, PNG/JPEG capture and emission, full-page/clip dimensions, scrolled
crop coordinates, stale-capture rejection, clipboard integration, reset/timeout/close,
cleanup failure/retry and idle-observer recovery. It passed at native scale 1 and with
--force-device-scale-factor=2. Node checks cover geometry/option/header boundaries
and cleanup ordering. Existing browser, download, dialog, console, clipboard and
native-free CLI/MCP smokes also passed.

Real mixed-DPI displays, nondefault browser zoom, headful presentation, Linux/Windows,
external-client emulation and host crash recovery remain open. Initial script timing
for externally created pages/popups is unverified; API-created pages install the
override before their requested URL loads.

Protocol reference: [Emulation.setDeviceMetricsOverride](https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#method-setDeviceMetricsOverride),
[Page.captureScreenshot](https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-captureScreenshot).
