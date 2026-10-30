import assert from "node:assert/strict";
import {createServer} from "node:http";
import {mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {PersistentJavaScriptSession, WorkerJavaScriptSession} from "./node-repl/open-computer-use-repl.mjs";

const endpoint = process.env.OPEN_COMPUTER_USE_CDP_URL;
if (!endpoint) throw new Error("Set OPEN_COMPUTER_USE_CDP_URL to a disposable browser");
const server = createServer((request,response) => {
  response.setHeader("Content-Type","text/html");
  response.end(`<!doctype html><title>Dialogs</title><output id="result">Ready</output>
    <button onclick="alert('Notice');result.textContent='Alert dismissed'">Alert</button>
    <button onclick="result.textContent='Confirm '+confirm('Continue?')">Confirm</button>
    <button onclick="result.textContent='Prompt '+prompt('Value','default')">Prompt</button>
    <button onclick="result.textContent=prompt('First')+' '+prompt('Second')">Sequential</button>
    <button onclick="window.onbeforeunload=e=>{e.preventDefault();e.returnValue=''}">Arm unload</button>
    <input type="file" aria-label="Upload" onchange="result.textContent='Upload '+prompt('File description')">
    <a href="/next">Leave</a>
    ${request.url === "/immediate" ? "<script>alert('Immediate');result.textContent='Immediate dismissed'</script>" : ""}`);
});
await new Promise(resolve => server.listen(0,"127.0.0.1",resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
const fileDirectory = mkdtempSync(path.join(tmpdir(),"ocu-dialog-smoke-"));
const uploadFile = path.join(fileDirectory,"upload.txt");
writeFileSync(uploadFile,"Local dialog fixture");
const native = {async request(){throw new Error("Native backend unused");}};
const session = new WorkerJavaScriptSession({native});
const other = new WorkerJavaScriptSession({native});
async function run(source, target = session, timeout = 30_000) {
  const result = await target.run(source,timeout);
  assert.equal(result.isError,false,JSON.stringify(result.content));
  return JSON.parse(result.content.at(-1).text);
}
let targetId;
try {
  await run(`var immediate=await cua.createBrowserTab("cdp",${JSON.stringify(`${url}immediate`)},{visible:false}); nodeRepl.write(JSON.stringify(immediate.id));`);
  assert.equal(await run('var immediateDialog; for(var attempt=0;attempt<100;attempt++){immediateDialog=await immediate.getJsDialog();if(immediateDialog)break;await new Promise(resolve=>setTimeout(resolve,10));} nodeRepl.write(JSON.stringify(immediateDialog.type));'),"alert");
  assert.equal(await run('await immediateDialog.dismiss(); nodeRepl.write(JSON.stringify(await immediate.playwright.locator("output").innerText()));'),"Immediate dismissed");
  await run('await immediate.close(); nodeRepl.write(JSON.stringify(true));');
  targetId = await run(`var tab=await cua.createBrowserTab("cdp",${JSON.stringify(url)},{visible:false}); await tab.markHandoff(); nodeRepl.write(JSON.stringify(tab.id));`);
  assert.equal(await run('nodeRepl.write(JSON.stringify((await tab.getJsDialog())===undefined));'),true);
  assert.deepEqual(await run('await tab.playwright.getByRole("button",{name:"Alert",exact:true}).click(); var alertDialog=await tab.getJsDialog(); nodeRepl.write(JSON.stringify({type:alertDialog.type,accept:typeof alertDialog.accept}));'),{type:"alert",accept:"undefined"});
  const blocked = await session.run('await tab.playwright.domSnapshot();');
  assert.equal(blocked.isError,true);
  assert.match(blocked.content.at(-1).text,/Resolve.*dialog/);
  assert.equal(await run('await alertDialog.dismiss(); nodeRepl.write(JSON.stringify(await tab.playwright.getByRole("status").count()));'),1);
  assert.equal(await run('nodeRepl.write(JSON.stringify(await tab.playwright.locator("output").innerText()));'),"Alert dismissed");
  const staleAlert = await session.run('await alertDialog.dismiss();');
  assert.equal(staleAlert.isError,true);
  assert.match(staleAlert.content.at(-1).text,/stale|consumed/);

  await run('await tab.playwright.getByRole("button",{name:"Confirm",exact:true}).click(); var confirmDialog=await tab.getJsDialog(); nodeRepl.write(JSON.stringify(confirmDialog.type));');
  await run(`var observer=await cua.getTab(${JSON.stringify(targetId)}); nodeRepl.write(JSON.stringify(observer.id));`,other);
  const denied = await other.run('await observer.getJsDialog();');
  assert.equal(denied.isError,true);
  assert.match(denied.content.at(-1).text,/another browser session/);
  await other.close();
  assert.equal(await run('nodeRepl.write(JSON.stringify((await tab.getJsDialog()).type));'),"confirm");
  assert.equal(await run('await confirmDialog.accept(); nodeRepl.write(JSON.stringify(await tab.playwright.locator("output").innerText()));'),"Confirm true");

  await run('await tab.playwright.getByRole("button",{name:"Prompt",exact:true}).click(); var promptDialog=await tab.getJsDialog(); nodeRepl.write(JSON.stringify(promptDialog.type));');
  const invalidPrompt = await session.run('await promptDialog.accept(42);');
  assert.equal(invalidPrompt.isError,true);
  assert.match(invalidPrompt.content.at(-1).text,/requires text/);
  assert.equal(await run('await promptDialog.accept("你好 🙂"); nodeRepl.write(JSON.stringify(await tab.playwright.locator("output").innerText()));'),"Prompt 你好 🙂");

  const raw = await run('var state=await tab.getAXState({emit:false}); nodeRepl.write(JSON.stringify(state));');
  const confirmIndex = raw.match(/\[(\d+)\] button "Confirm"/)[1];
  await run(`await tab.click(${JSON.stringify(confirmIndex)}); var rawDialog=await tab.getJsDialog(); nodeRepl.write(JSON.stringify(rawDialog.type));`);
  assert.equal(await run('await rawDialog.dismiss(); nodeRepl.write(JSON.stringify(await tab.playwright.locator("output").innerText()));'),"Confirm false");

  await run('await tab.playwright.getByRole("button",{name:"Sequential",exact:true}).click(); var first=await tab.getJsDialog(); await first.accept("one"); nodeRepl.write(JSON.stringify(true));');
  const staleFirst = await session.run('await first.dismiss();');
  assert.equal(staleFirst.isError,true);
  assert.match(staleFirst.content.at(-1).text,/stale|consumed/);
  assert.equal(await run('var second=await tab.getJsDialog(); await second.accept("two"); nodeRepl.write(JSON.stringify(await tab.playwright.locator("output").innerText()));'),"one two");

  await run(`var selecting=tab.playwright.waitForEvent("filechooser"); await tab.playwright.getByLabel("Upload",{exact:true}).click(); await (await selecting).setFiles(${JSON.stringify(uploadFile)}); nodeRepl.write(JSON.stringify((await tab.getJsDialog()).type));`);
  assert.equal(await run('await (await tab.getJsDialog()).accept("fixture"); nodeRepl.write(JSON.stringify(await tab.playwright.locator("output").innerText()));'),"Upload fixture");

  await run(`var closing=await cua.createBrowserTab("cdp",${JSON.stringify(url)},{visible:false}); await closing.playwright.getByRole("button",{name:"Alert",exact:true}).click(); await closing.close(); nodeRepl.write(JSON.stringify(true));`);
  assert.equal(await run('nodeRepl.write(JSON.stringify(tab.id));'),targetId);

  assert.deepEqual(await run('await tab.playwright.getByRole("button",{name:"Arm unload",exact:true}).click(); await tab.goto('+JSON.stringify(`${url}next`)+'); var unload=await tab.getJsDialog(); nodeRepl.write(JSON.stringify({type:unload.type,accept:typeof unload.accept}));'),{type:"beforeunload",accept:"undefined"});
  assert.equal(await run('await unload.dismiss(); nodeRepl.write(JSON.stringify(await tab.playwright.getByRole("button",{name:"Alert",exact:true}).count()));'),1);
  assert.equal(await run('nodeRepl.write(JSON.stringify((await cua.listTabs({emit:false})).find(item=>item.id===tab.id).url));'),url);

  await run('await tab.playwright.getByRole("button",{name:"Confirm",exact:true}).click(); nodeRepl.write(JSON.stringify((await tab.getJsDialog()).type));');
  const entry = [...session.browserDialogs.targets.values()].find(entry=>entry.targetId === targetId);
  const originalSend = entry.connection.send, originalEndpoint = entry.endpoint;
  entry.connection.send = (method,params) => method === "Page.handleJavaScriptDialog" ? Promise.reject(new Error("Injected dialog cleanup outage")) : originalSend(method,params);
  entry.endpoint = "http://127.0.0.1:1/";
  try {
    await assert.rejects(session.reset());
    assert.equal((await session.run('nodeRepl.write(42)')).isError,true);
  } finally {entry.connection.send=originalSend;entry.endpoint=originalEndpoint;}
  await session.reset();
  assert.equal(await run(`var tab=await cua.getTab(${JSON.stringify(targetId)}); nodeRepl.write(JSON.stringify(await tab.playwright.locator("output").innerText()));`),"Confirm false");

  await run('await tab.playwright.getByRole("button",{name:"Sequential",exact:true}).click(); nodeRepl.write(JSON.stringify((await tab.getJsDialog()).type));');
  await session.reset();
  assert.equal(await run(`var tab=await cua.getTab(${JSON.stringify(targetId)}); nodeRepl.write(JSON.stringify(await tab.playwright.locator("output").innerText()));`),"null null");

  for (const mode of ["reset","timeout","close"]) {
    await run('await tab.playwright.getByRole("button",{name:"Confirm",exact:true}).click(); nodeRepl.write(JSON.stringify((await tab.getJsDialog()).type));');
    const owner = session.resourceOwners.get(session.worker);
    if (mode === "timeout") {
      const result = await session.run('while(true){}',150);
      assert.equal(result.isError,true);
      assert.match(result.content.at(-1).text,/timed out/);
    } else await session[mode]();
    assert.equal(session.browserDialogs.owners.has(owner),false);
    const reader = mode === "close" ? new WorkerJavaScriptSession({native}) : session;
    try {
      assert.equal(await run(`var tab=await cua.getTab(${JSON.stringify(targetId)}); nodeRepl.write(JSON.stringify(await tab.playwright.locator("output").innerText()));`,reader),"Confirm false");
    } finally {if (reader !== session) await reader.close();}
  }
  const direct = new PersistentJavaScriptSession({native});
  try {
    await run(`var tab=await cua.getTab(${JSON.stringify(targetId)}); await tab.playwright.getByRole("button",{name:"Confirm",exact:true}).click(); nodeRepl.write(JSON.stringify((await tab.getJsDialog()).type));`,direct);
    await direct.reset();
    assert.equal(await run(`var tab=await cua.getTab(${JSON.stringify(targetId)}); nodeRepl.write(JSON.stringify(await tab.playwright.locator("output").innerText()));`,direct),"Confirm false");
  } finally {await direct.close();}
  console.log("PASS real Chrome alert/confirm/prompt/beforeunload handles, immediate page dialogs, Unicode, stale guards, raw input, sequential dialogs, ownership and reset/timeout/close cleanup with failure recovery");
} finally {
  await session.close();
  await other.close();
  rmSync(fileDirectory,{recursive:true,force:true});
  for (const target of await(await fetch(new URL("/json/list",endpoint))).json()) {
    if (target.type === "page" && target.url.startsWith(url)) await fetch(new URL(`/json/close/${target.id}`,endpoint));
  }
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
