import assert from "node:assert/strict";
import {createServer} from "node:http";
import path from "node:path";
import {pathToFileURL} from "node:url";
const {WorkerJavaScriptSession,PersistentJavaScriptSession}=await import(process.argv[2]?pathToFileURL(path.join(process.argv[2],"scripts/open-computer-use-repl.mjs")).href:"./node-repl/open-computer-use-repl.mjs");
import {BrowserConsoleLogs} from "./node-repl/browser-cdp.mjs";

const endpoint = process.env.OPEN_COMPUTER_USE_CDP_URL;
if (!endpoint) throw new Error("Set OPEN_COMPUTER_USE_CDP_URL to a disposable browser");
const server = createServer((request,response) => {
  response.setHeader("Content-Type","text/html");
  response.end(`<!doctype html><title>Console fixture</title>
    <button onclick="console.debug('debug');console.info('info');console.log('value %s %d','hello',42);console.warn('warning');console.error('failure');console.log('object',{ready:true});">Log</button>
    <button onclick="for(let i=0;i<1005;i++)console.log('line',i);console.log('x'.repeat(20000));">Flood</button>
    <button onclick="setTimeout(()=>{throw new Error('uncaught fixture')});Promise.reject(new TypeError('rejected fixture'));try{throw new Error('caught fixture')}catch{}">Errors</button>
    <a href="/next">Next</a><script>if(location.pathname === "/next")console.log("navigation loaded")</script>`);
});
await new Promise(resolve => server.listen(0,"127.0.0.1",resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
for(const Session of [WorkerJavaScriptSession,PersistentJavaScriptSession]){
const session = new Session({native:{async request(){throw new Error("Native backend unused");}}});
const other = new Session({native:{async request(){throw new Error("Native backend unused");}}});
async function run(source, timeout = 30_000, target = session) {
  const result = await target.run(source,timeout);
  assert.equal(result.isError,false,JSON.stringify(result.content));
  return JSON.parse(result.content.at(-1).text);
}
let targetId;
try {
  targetId = await run(`var tab=await cua.createBrowserTab("cdp",${JSON.stringify(url)},{visible:false}); await tab.markHandoff(); nodeRepl.write(JSON.stringify(tab.id));`);
  assert.deepEqual(await run('nodeRepl.write(JSON.stringify(await tab.dev.logs()));'),[]);
  const logs = await run('await tab.playwright.getByRole("button",{name:"Log",exact:true}).click(); nodeRepl.write(JSON.stringify(await tab.dev.logs()));');
  assert.deepEqual(logs.map(log => log.level),["debug","info","log","warn","error","log"]);
  assert.equal(logs[2].message,"value hello 42");
  assert.match(logs[5].message,/object Object.*ready: true/);
  assert.equal(logs[0].url,url);
  assert.ok(logs.every(log => Number.isFinite(Date.parse(log.timestamp))));
  const warnings = await run('nodeRepl.write(JSON.stringify(await tab.dev.logs({levels:["warning","error"],filter:"warning",limit:1})));');
  assert.equal(warnings.length,1);
  assert.equal(warnings[0].level,"warn");
  assert.equal(await run('var again=await cua.getTab(tab.id); nodeRepl.write(JSON.stringify((await again.dev.logs()).length));'),6);
  assert.deepEqual(await run(`var isolated=await cua.createBrowserTab("cdp",${JSON.stringify(url)},{visible:false}); nodeRepl.write(JSON.stringify(await isolated.dev.logs()));`,30_000,other),[]);
  const otherOwner = other.resourceOwners?.get(other.worker)??other.resourceOwner;
  await other.close();
  assert.equal(other.browserLogs.owners.has(otherOwner),false);
  await run('await tab.playwright.getByRole("button",{name:"Errors",exact:true}).click();nodeRepl.write(JSON.stringify(true));');
  let errors;const errorDeadline=Date.now()+5000;
  do{errors=await run('nodeRepl.write(JSON.stringify(await tab.dev.logs({levels:["error"],filter:"fixture"})));');if(errors.length===2)break;assert.ok(Date.now()<errorDeadline,'Uncaught exception logs missing');await new Promise(resolve=>setTimeout(resolve,10));}while(true);
  assert.ok(errors.some(log=>log.message.includes('Error: uncaught fixture')));
  assert.ok(errors.some(log=>log.message.includes('TypeError: rejected fixture')));
  assert.ok(errors.every(log=>log.url===url&&Number.isFinite(Date.parse(log.timestamp))));
  const afterNavigation = await run('await tab.playwright.expectNavigation(()=>tab.playwright.getByRole("link",{name:"Next"}).click()); nodeRepl.write(JSON.stringify(await tab.dev.logs()));');
  assert.equal(afterNavigation.at(-1).message,"navigation loaded");
  assert.equal(afterNavigation.at(-1).url,`${url}next`);
  const bounded = await run('await tab.playwright.getByRole("button",{name:"Flood"}).click(); nodeRepl.write(JSON.stringify(await tab.dev.logs({limit:2000})));');
  assert.equal(bounded.length,1000);
  assert.equal(bounded[0].message,"line 6");
  assert.equal(bounded.at(-1).message.length,16_384);
  assert.equal((await run('nodeRepl.write(JSON.stringify(await tab.dev.logs()));')).length,100);
  assert.deepEqual(await run('nodeRepl.write(JSON.stringify(await tab.dev.logs({limit:0})));'),[]);
  const owner = session.resourceOwners?.get(session.worker)??session.resourceOwner;
  await session.reset();
  assert.equal(session.browserLogs.owners.has(owner),false);
  await assert.rejects(session.browserLogs.start(owner,targetId),/session closed/);
  await run(`var tab=await cua.getTab(${JSON.stringify(targetId)}); nodeRepl.write(JSON.stringify(true));`);
  assert.deepEqual(await run('nodeRepl.write(JSON.stringify(await tab.dev.logs()));'),[]);
  const timedOutOwner = session.resourceOwners?.get(session.worker)??session.resourceOwner;
  const timedOut = await session.run('await new Promise(()=>{})',150);
  assert.equal(timedOut.isError,true);
  assert.match(timedOut.content.at(-1).text,/timed out/);
  assert.equal(session.browserLogs.owners.has(timedOutOwner),false);
  await run(`var tab=await cua.getTab(${JSON.stringify(targetId)}); nodeRepl.write(JSON.stringify(true));`);
  await fetch(new URL(`/json/close/${targetId}`,endpoint));
  const closed = await session.run('await tab.dev.logs();');
  assert.equal(closed.isError,true);
  assert.match(closed.content.at(-1).text,/Tab closed or no longer available/);
  targetId = undefined;

  let release,discovered;
  const discoveryStarted=new Promise(resolve=>discovered=resolve);
  const waiting = new Promise(resolve => {release=resolve;});
  const proxy = createServer(async (request,response) => {discovered();await waiting; response.setHeader("Content-Type","application/json");response.end(JSON.stringify(await(await fetch(new URL("/json/list",endpoint))).json()));});
  await new Promise(resolve => proxy.listen(0,"127.0.0.1",resolve));
  try {
    const manager = new BrowserConsoleLogs(() => `http://127.0.0.1:${proxy.address().port}/`);
    const owner = {};
    const target = (await(await fetch(new URL("/json/list",endpoint))).json()).find(item=>item.type === "page");
    const starting = manager.start(owner,target.id);
    const rejected = assert.rejects(starting,/session closed/);
    await discoveryStarted;
    const cleanup = manager.cleanup(owner);
    await cleanup;
    release();
    await rejected;
    assert.equal(manager.owners.size,0);
  } finally {proxy.closeAllConnections();await new Promise(resolve=>proxy.close(resolve));}
  console.log(`${Session.name} PASS real Chrome console/uncaught exception/rejection capture, filtering, bounds, navigation, fresh replay exclusion, session isolation and reset/timeout/close/startup cleanup`);
} finally {
  if (targetId) await fetch(new URL(`/json/close/${targetId}`,endpoint)).catch(()=>{});
  await session.close();
  await other.close();
}
}
server.closeAllConnections();
await new Promise(resolve => server.close(resolve));
