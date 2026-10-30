import assert from "node:assert/strict";
import {createServer} from "node:http";
import {WorkerJavaScriptSession} from "./node-repl/open-computer-use-repl.mjs";
import {imageDimensions,withConnection} from "./node-repl/browser-cdp.mjs";

const endpoint = process.env.OPEN_COMPUTER_USE_CDP_URL;
if (!endpoint) throw new Error("Set OPEN_COMPUTER_USE_CDP_URL to a disposable headless Chrome with --enable-automation");
const server = createServer((request,response) => {
  response.setHeader("Content-Type","text/html");
  response.end(`<!doctype html><title>Viewport fixture</title><style>body{margin:0}#canvas{width:1500px;height:1800px;background:linear-gradient(#eee,#acf)}#target{position:fixed;left:40px;top:30px;width:120px;height:40px}.narrow{display:none}@media(max-width:500px){.narrow{display:block}.wide{display:none}}</style>
    <div id="canvas"><button id="target" onclick="count.textContent=String(Number(count.textContent)+1)">Target</button><input aria-label="Clipboard" style="position:fixed;left:10px;top:100px"><output id="count">0</output><span class="narrow">narrow</span><span class="wide">wide</span></div><script>document.body.dataset.initialWidth=innerWidth;</script>`);
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
const native = {async request(){throw new Error("Native backend unused");}};
const session = new WorkerJavaScriptSession({native});
const other = new WorkerJavaScriptSession({native});
async function run(source,target=session) {
  const result = await target.run(source);
  assert.equal(result.isError,false,JSON.stringify(result.content));
  return JSON.parse(result.content.at(-1).text);
}
async function shot(options={},format="jpeg") {
  const source = format === "png" ? `await tab.getScreenshot({...${JSON.stringify(options)},emit:false})` : `await tab.screenshot(${JSON.stringify(options)})`;
  return imageDimensions(Buffer.from(await run(`nodeRepl.write(JSON.stringify(Buffer.from(${source}).toString("base64")));`),"base64"),format);
}
async function metrics(id) {
  const target=(await(await fetch(new URL("/json/list",endpoint))).json()).find(target=>target.id===id);
  return withConnection(target.webSocketDebuggerUrl,async send=>(await send("Page.getLayoutMetrics")).cssVisualViewport);
}
let id;
try {
  id = await run(`var browser=await cua.getBrowser({id:"cdp"}); var tab=await cua.createBrowserTab("cdp",${JSON.stringify(url)},{visible:false}); await tab.markHandoff(); nodeRepl.write(JSON.stringify(tab.id));`);
  assert.ok((await run('nodeRepl.write(JSON.stringify(await browser.capabilities.list()));')).some(capability=>capability.id === "viewport"));
  assert.equal((await session.run('await browser.capabilities.get("missing");')).isError,true);
  const baseline = await shot({},"png"), original = await metrics(id);
  const scale = baseline.width/original.clientWidth;
  await run('var viewport=await browser.capabilities.get("viewport"); await viewport.set({width:320,height:240}); nodeRepl.write(JSON.stringify(true));');
  const stale = await session.run(`await tab.click([${100*scale},${50*scale}]);`);
  assert.equal(stale.isError,true);
  assert.match(stale.content.at(-1).text,/geometry changed/);
  assert.deepEqual(await shot(),{width:320*scale,height:240*scale});
  assert.equal(await run('nodeRepl.write(JSON.stringify(await tab.playwright.getByText("narrow",{exact:true}).isVisible()));'),true);
  const raw = await session.run('await tab.screenshot();');
  assert.deepEqual(raw.content,[{type:"text",text:"(no output)"}]);
  const emitted = await session.run('await nodeRepl.emitImage(await tab.screenshot({clip:{x:20,y:20,width:200,height:100}}));');
  assert.equal(emitted.isError,false);
  assert.equal(emitted.content[0].mimeType,"image/jpeg");
  assert.deepEqual(imageDimensions(Buffer.from(emitted.content[0].data,"base64"),"jpeg"),{width:200*scale,height:100*scale});
  await run('await viewport.set({width:375,height:812}); nodeRepl.write(JSON.stringify(true));');
  assert.deepEqual(await shot(),{width:375*scale,height:812*scale});
  await run('await viewport.set({width:320,height:240}); nodeRepl.write(JSON.stringify(true));');
  const field = (await run('nodeRepl.write(JSON.stringify(await tab.getAXState({emit:false})));')).match(/\[(\d+)\] textbox "Clipboard"/)[1];
  assert.equal(await run(`await tab.paste(${JSON.stringify(field)},"viewport integration"); nodeRepl.write(JSON.stringify(await tab.playwright.getByLabel("Clipboard",{exact:true}).inputValue()));`),"viewport integration");
  assert.deepEqual(await run('nodeRepl.write(JSON.stringify((await cua.listTabs({emit:false})).filter(tab=>tab.url.includes("__ocu_clipboard_"))));'),[]);
  assert.deepEqual(await shot({clip:{x:20,y:20,width:200,height:100}}),{width:200*scale,height:100*scale});
  await run(`await tab.click([${80*scale},${30*scale}]); nodeRepl.write(JSON.stringify(true));`);
  assert.equal(await run('nodeRepl.write(JSON.stringify(await tab.playwright.locator("#count").innerText()));'),"1");
  assert.deepEqual(await shot({fullPage:true}),{width:1500*scale,height:1800*scale});
  assert.equal((await session.run('await tab.click([100,50]);')).isError,true);
  assert.deepEqual(await shot({fullPage:true,clip:{x:900,y:1200,width:200,height:100}}),{width:200*scale,height:100*scale});
  const root = (await run('nodeRepl.write(JSON.stringify(await tab.getAXState({emit:false})));')).match(/\[(\d+)\] RootWebArea/)[1];
  await run(`await tab.scroll(${JSON.stringify(root)},"down",1); nodeRepl.write(JSON.stringify(true));`);
  assert.ok((await metrics(id)).pageY > 0);
  await shot({clip:{x:20,y:20,width:200,height:100}});
  await run(`await tab.click([${80*scale},${30*scale}]); nodeRepl.write(JSON.stringify(true));`);
  assert.equal(await run('nodeRepl.write(JSON.stringify(await tab.playwright.locator("#count").innerText()));'),"2");
  const scrollRoot = (await run('nodeRepl.write(JSON.stringify(await tab.getAXState({emit:false})));')).match(/\[(\d+)\] RootWebArea/)[1];
  await run(`await tab.scroll(${JSON.stringify(scrollRoot)},"up",100); nodeRepl.write(JSON.stringify(true));`);
  await run(`var future=await cua.createBrowserTab("cdp",${JSON.stringify(url)},{visible:false}); nodeRepl.write(JSON.stringify(true));`);
  assert.equal(await run('nodeRepl.write(JSON.stringify(await future.playwright.locator("body").getAttribute("data-initial-width")));'),"320");
  await run('await future.close(); nodeRepl.write(JSON.stringify(true));');
  const version = await(await fetch(new URL("/json/version",endpoint))).json();
  const external = await withConnection(version.webSocketDebuggerUrl,send=>send("Target.createTarget",{url,newWindow:true,background:true}));
  for (let attempt=0;attempt<100 && (await metrics(external.targetId)).clientWidth !== 320;attempt++) await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal((await metrics(external.targetId)).clientWidth,320,"Target discovery did not apply the viewport before binding");
  await run(`var external=await cua.getTab(${JSON.stringify(external.targetId)}); nodeRepl.write(JSON.stringify(true));`);
  assert.equal((await metrics(external.targetId)).clientWidth,320);
  await run('await external.close(); nodeRepl.write(JSON.stringify(true));');
  await run('var browser=await cua.getBrowser({id:"cdp"}); var viewport=await browser.capabilities.get("viewport"); nodeRepl.write(JSON.stringify(true));',other);
  const denied = await other.run('await viewport.set({width:400,height:300});');
  assert.equal(denied.isError,true);
  assert.match(denied.content.at(-1).text,/Another session/);
  await shot();
  await run('await viewport.set({width:380,height:250}); await viewport.reset(); await viewport.set({width:320,height:240}); nodeRepl.write(JSON.stringify(true));');
  const cycle = await session.run(`await tab.click([${100*scale},${50*scale}]);`);
  assert.equal(cycle.isError,true);
  assert.match(cycle.content.at(-1).text,/geometry changed/);
  await run('await viewport.reset(); nodeRepl.write(JSON.stringify(true));');
  assert.deepEqual(await shot({},"png"),baseline);

  await run('await viewport.set({width:360,height:260}); nodeRepl.write(JSON.stringify(true));');
  const manager = session.browserViewport, lease = [...manager.leases.values()].find(lease=>lease.owner === session.resourceOwners.get(session.worker));
  const originalConnect = manager.connect;
  const originals = [...lease.targets.values()].filter(record=>record.connection).map(record=>[record.connection,record.connection.send]);
  const rejectClear = send=>(method,params)=>method === "Emulation.clearDeviceMetricsOverride" ? Promise.reject(new Error("Injected viewport cleanup outage")) : send(method,params);
  for (const [connection,send] of originals) connection.send=rejectClear(send);
  manager.connect=(url,operation)=>originalConnect(url,send=>operation(rejectClear(send)));
  try {
    await assert.rejects(session.reset(),/cleanup outage/);
    assert.equal((await session.run('nodeRepl.write(42)')).isError,true);
    assert.equal(session.browserClipboard.server,undefined);
    assert.ok([...manager.leases.values()].includes(lease));
  } finally {for(const [connection,send] of originals)connection.send=send;manager.connect=originalConnect;}
  await session.reset();
  assert.equal((await metrics(id)).clientWidth,original.clientWidth);
  await run(`var browser=await cua.getBrowser({id:"cdp"}); var viewport=await browser.capabilities.get("viewport"); var tab=await cua.getTab(${JSON.stringify(id)}); nodeRepl.write(JSON.stringify(true));`);
  await run('await viewport.set({width:360,height:260}); nodeRepl.write(JSON.stringify(true));');
  const disconnectedOwner = session.worker;
  [...manager.leases.values()].find(lease=>lease.owner === session.resourceOwners.get(disconnectedOwner)).connection.close();
  for (let attempt=0;attempt<250 && session.worker === disconnectedOwner;attempt++) await new Promise(resolve=>setTimeout(resolve,20));
  assert.notEqual(session.worker,disconnectedOwner,"Observer disconnect did not recover the idle session");
  assert.equal((await metrics(id)).clientWidth,original.clientWidth);
  await run(`var browser=await cua.getBrowser({id:"cdp"}); var viewport=await browser.capabilities.get("viewport"); var tab=await cua.getTab(${JSON.stringify(id)}); nodeRepl.write(JSON.stringify(true));`);
  for (const mode of ["reset","timeout","close"]) {
    await run('await viewport.set({width:360,height:260}); nodeRepl.write(JSON.stringify(true));');
    const owner = session.resourceOwners.get(session.worker);
    if (mode === "timeout") assert.equal((await session.run('while(true){}',150)).isError,true);
    else await session[mode]();
    assert.equal([...session.browserViewport.leases.values()].some(lease=>lease.owner === owner),false);
    assert.equal((await metrics(id)).clientWidth,original.clientWidth);
    if (mode !== "close") await run(`var browser=await cua.getBrowser({id:"cdp"}); var viewport=await browser.capabilities.get("viewport"); var tab=await cua.getTab(${JSON.stringify(id)}); nodeRepl.write(JSON.stringify(true));`);
  }
  console.log(`PASS viewport discovery/set/reset, new tabs/windows, ownership, JPEG/full-page/clip, scrolled coordinate mapping, stale captures and reset/timeout/close with cleanup failure/retry at raster scale ${scale}`);
} finally {
  await session.close();
  await other.close();
  for (const target of await(await fetch(new URL("/json/list",endpoint))).json()) if (target.type === "page" && target.url.startsWith(url)) await fetch(new URL(`/json/close/${target.id}`,endpoint));
  server.closeAllConnections();
  await new Promise(resolve=>server.close(resolve));
}
