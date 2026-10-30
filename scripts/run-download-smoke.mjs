import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from "node:fs";
import path from "node:path";
import {tmpdir} from "node:os";
import {createBrowserApi} from "./node-repl/browser-cdp.mjs";
import {waitForBrowserEventReady} from "./node-repl/browser-playwright.mjs";
import {WorkerJavaScriptSession} from "./node-repl/open-computer-use-repl.mjs";
if(!process.env.OPEN_COMPUTER_USE_CDP_URL) throw new Error("Set OPEN_COMPUTER_USE_CDP_URL to a disposable browser");
const payload = Buffer.from("download artifact 中文🙂\n".repeat(4096));
const server = createServer((request,response)=>{
  if(["/fast","/slow"].includes(request.url)) {
    response.writeHead(200,{"Content-Type":"application/octet-stream","Content-Disposition":"attachment; filename=../../untrusted.txt","Content-Length":payload.length,"X-Content-Type-Options":"nosniff"});
    if(request.url === "/slow") {
      response.write(payload.subarray(0,8192));
      const timer=setTimeout(()=>response.end(payload.subarray(8192)),8000);
      response.on("close",()=>clearTimeout(timer));
    } else response.end(payload);
  } else {
    response.setHeader("Content-Type","text/html");
    response.end(`<html><body><a href="/fast">Fast download</a><a href="/slow">Slow download</a><label>Generate file<input type="file" onchange="location.href='/fast'"></label></body></html>`);
  }
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const disposers = [];
const api = createBrowserApi(()=>({write(){},async emitImage(){}}),process.env,{onDispose:dispose=>disposers.push(dispose)});
const uploadDirectory=mkdtempSync(path.join(tmpdir(),"ocu-download-upload-"));
const uploadFile=path.join(uploadDirectory,"input.txt");writeFileSync(uploadFile,"fixture");
let tab;
try {
  tab=await api.createBrowserTab("cdp",`http://127.0.0.1:${server.address().port}/`,{visible:false});
  let pending=tab.playwright.waitForEvent("download",{timeoutMs:5000});
  await tab.playwright.getByRole("link",{name:"Fast download"}).click();
  const download=await pending;
  const file=await download.path({timeoutMs:5000});
  assert.deepEqual(readFileSync(file),payload);
  assert.notEqual(path.basename(file),"untrusted.txt");
  assert.equal(await download.path(),file);
  await assert.rejects(tab.playwright.waitForEvent("download",{timeoutMs:100}),/timed out/);
  let workerFile;
  const worker=new WorkerJavaScriptSession({native:{async request(){throw new Error("Native not used");}}});
  try {
    let result=await worker.run(`var t=await cua.getTab(${JSON.stringify(tab.id)}); var p=t.playwright.waitForEvent("download",{timeoutMs:5000}); await t.playwright.getByRole("link",{name:"Fast download"}).click(); var d=await p;`);
    assert.equal(result.isError,false,JSON.stringify(result.content));
    result=await worker.run('nodeRepl.write(await d.path({timeoutMs:5000}));');
    assert.equal(result.isError,false,JSON.stringify(result.content));
    workerFile=result.content.at(-1).text;
    assert.deepEqual(readFileSync(workerFile),payload);
    result=await worker.run('var p=t.playwright.waitForEvent("download",{timeoutMs:5000}); await t.playwright.getByRole("link",{name:"Slow download"}).click(); var d=await p; await d.path({timeoutMs:0});',1500);
    assert.equal(result.isError,true,JSON.stringify(result.content));
    assert.match(result.content.at(-1).text,/timed out/);
    result=await worker.run(`var t=await cua.getTab(${JSON.stringify(tab.id)}); var p=t.playwright.waitForEvent("download",{timeoutMs:5000}); await t.playwright.getByRole("link",{name:"Fast download"}).click(); var d=await p; nodeRepl.write(await d.path());`);
    assert.equal(result.isError,false,JSON.stringify(result.content));
    assert.deepEqual(readFileSync(result.content.at(-1).text),payload);
    result=await worker.run('await t.playwright.waitForEvent("download",{timeoutMs:0});',500);
    assert.equal(result.isError,true);
    assert.equal(worker.browserDownloads.active.size,0);
    result=await worker.run(`var t=await cua.getTab(${JSON.stringify(tab.id)}); var p=t.playwright.waitForEvent("download",{timeoutMs:5000}); var clicking=t.playwright.getByRole("link",{name:"Slow download"}).click(); clicking.catch(()=>{}); var d=await p; nodeRepl.write("began");`);
    assert.equal(result.isError,false,JSON.stringify(result.content));
    assert.equal(result.content.at(-1).text,"began");
    assert.equal(worker.browserDownloads.active.size,1);
    const activeTransfer=[...worker.browserDownloads.entries.values()].find(record=>record.guid && !record.ended);
    assert.ok(activeTransfer,"no live transfer was observed before reset");
    await worker.reset();
    assert.equal(worker.browserDownloads.active.size,0);
    assert.equal(activeTransfer.ended,true);
    assert.equal(activeTransfer.completed,false);
    result=await worker.run(`var t=await cua.getTab(${JSON.stringify(tab.id)}); var p=t.playwright.waitForEvent("download",{timeoutMs:5000}); var clicking=t.playwright.getByRole("link",{name:"Slow download"}).click(); clicking.catch(()=>{}); var d=await p;`);
    assert.equal(result.isError,false,JSON.stringify(result.content));
    const originalSend=worker.browserDownloads.send;
    try {
      worker.browserDownloads.send=function(record,method,params){
        if(method === "Browser.setDownloadBehavior" && params.behavior === "default") throw new Error("Injected policy restore outage");
        return originalSend.call(this,record,method,params);
      };
      await assert.rejects(worker.reset(),/Injected policy restore outage/);
      assert.equal(worker.browserDownloads.active.size,1);
      assert.equal((await worker.run('nodeRepl.write(99)')).isError,true);
    } finally {worker.browserDownloads.send=originalSend;}
    await worker.reset();
    assert.equal(worker.browserDownloads.active.size,0);
    assert.equal((await worker.run('nodeRepl.write(42)')).content.at(-1).text,'42');
    const normalSend=worker.browserDownloads.send;
    try {
      worker.browserDownloads.send=function(record,method,params){
        if(method === "Browser.setDownloadBehavior" && params.behavior === "default") throw new Error("Injected background restore outage");
        return normalSend.call(this,record,method,params);
      };
      result=await worker.run(`var t=await cua.getTab(${JSON.stringify(tab.id)}); var p=t.playwright.waitForEvent("download",{timeoutMs:5000}); await t.playwright.getByRole("link",{name:"Fast download"}).click(); var d=await p; nodeRepl.write(await d.path());`);
      assert.equal(result.isError,true);
      assert.equal((await worker.run('nodeRepl.write(99)')).isError,true);
      assert.equal(worker.browserDownloads.active.size,1);
    } finally {worker.browserDownloads.send=normalSend;}
    await worker.reset();
    assert.equal(worker.browserDownloads.active.size,0);
    const waiting=worker.run(`var t=await cua.getTab(${JSON.stringify(tab.id)}); await t.playwright.waitForEvent("download",{timeoutMs:0});`,10000);
    for(let i=0;i<100 && worker.browserDownloads.active.size===0;i++) await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(worker.browserDownloads.active.size,1);
    await worker.close();
    assert.equal((await waiting).isError,true);
    assert.equal(worker.browserDownloads.active.size,0);
  } finally {await worker.close();}
  assert.deepEqual(readFileSync(workerFile),payload);
  const choosing=tab.playwright.waitForEvent("filechooser",{timeoutMs:5000});
  await tab.playwright.getByLabel("Generate file").click();
  const chooser=await choosing;
  const generated=tab.playwright.waitForEvent("download",{timeoutMs:5000});
  await chooser.setFiles(uploadFile);
  assert.deepEqual(readFileSync(await (await generated).path()),payload);
  const other=await api.createBrowserTab("cdp",`http://127.0.0.1:${server.address().port}/`,{visible:false});
  try {
    const primary=tab.playwright.waitForEvent("download",{timeoutMs:5000});
    await waitForBrowserEventReady(new URL(process.env.OPEN_COMPUTER_USE_CDP_URL).href,tab.id);
    await assert.rejects(other.playwright.waitForEvent("download",{timeoutMs:5000}),/already owns/);
    await tab.playwright.getByRole("link",{name:"Fast download"}).click();
    assert.deepEqual(readFileSync(await (await primary).path()),payload);
  } finally {await other.close();}
  console.log("PASS download artifacts, safe filename, repeated path, event timeout, Worker handles, in-flight cancellation, reset/close, context exclusivity, policy restore failure/retry, chooser-triggered download and recovery");
} finally {
  if(tab) await tab.close();
  await Promise.all(disposers.map(dispose=>dispose()));
  rmSync(uploadDirectory,{recursive:true,force:true});
  server.closeAllConnections();
  await new Promise(resolve=>server.close(resolve));
}
