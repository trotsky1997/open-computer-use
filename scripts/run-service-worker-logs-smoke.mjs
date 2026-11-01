// Owns its fixture origin, tabs and service-worker registration.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const runtime=name=>process.argv[2]?pathToFileURL(path.join(process.argv[2],'scripts',name)).href:new URL('./node-repl/'+name,import.meta.url).href;
const {PersistentJavaScriptSession,WorkerJavaScriptSession}=await import(runtime('open-computer-use-repl.mjs'));
const {withConnection}=await import(runtime('browser-cdp.mjs'));
const endpoint=process.env.OPEN_COMPUTER_USE_CDP_URL;assert.ok(endpoint,'Set OPEN_COMPUTER_USE_CDP_URL to disposable Chrome');
let version=1;
const server=createServer((request,response)=>{
 response.setHeader('Cache-Control','no-store');
 if(request.url==='/service.js'){
  response.setHeader('Content-Type','text/javascript');response.end(`console.log('service startup v${version}');self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(clients.claim().then(()=>clients.matchAll()).then(list=>list.forEach(client=>client.postMessage('activated v${version}')))));self.addEventListener('message',e=>{console.warn('service v${version} '+e.data);e.source.postMessage(e.data);if(e.data==='errors'){setTimeout(()=>{throw Error('service thrown v${version}')});Promise.reject(new TypeError('service rejected v${version}'));}});`);return;
 }
 response.setHeader('Content-Type','text/html');response.end(`<!doctype html><title>Service log fixture</title><button onclick="navigator.serviceWorker.getRegistration('/controlled/').then(r=>r.active.postMessage('later'))">Later</button><button onclick="navigator.serviceWorker.getRegistration('/controlled/').then(r=>r.active.postMessage('errors'))">Errors</button><button onclick="navigator.serviceWorker.getRegistration('/controlled/').then(r=>r.update())">Update</button><button onclick="navigator.serviceWorker.getRegistration('/controlled/').then(r=>r.unregister()).then(()=>document.querySelector('output').textContent='unregistered')">Unregister</button><output></output><script>navigator.serviceWorker.onmessage=e=>document.querySelector('output').textContent=e.data;</script>`);
});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browserUrl=(await(await fetch(new URL('/json/version',endpoint))).json()).webSocketDebuggerUrl;
async function browser(method,params){return withConnection(browserUrl,send=>send(method,params));}
async function evaluate(id,expression){const pages=await(await fetch(new URL('/json/list',endpoint))).json(),page=pages.find(page=>page.id===id);assert.ok(page);return withConnection(page.webSocketDebuggerUrl,async send=>{const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});assert.ok(!result.exceptionDetails,JSON.stringify(result.exceptionDetails));return result.result.value;});}
async function until(check,label){const deadline=Date.now()+8000;for(;;){const result=await check();if(result)return result;assert.ok(Date.now()<deadline,label);await new Promise(resolve=>setTimeout(resolve,20));}}
async function seed(id,token){
 await until(()=>evaluate(id,"Boolean(document.querySelector('button'))"),'Setup page missing');
 await evaluate(id,`navigator.serviceWorker.register('/service.js',{scope:'/controlled/'}).then(async()=>{let r=await navigator.serviceWorker.getRegistration('/controlled/');while(!r.active){await new Promise(resolve=>setTimeout(resolve,10));r=await navigator.serviceWorker.getRegistration('/controlled/');}return new Promise(resolve=>{const done=e=>{if(e.data===${JSON.stringify(token)}){navigator.serviceWorker.removeEventListener('message',done);resolve(true);}};navigator.serviceWorker.addEventListener('message',done);r.active.postMessage(${JSON.stringify(token)});});})`);
}

try{
 for(const Session of [WorkerJavaScriptSession,PersistentJavaScriptSession]){
  const session=new Session({native:{async request(){throw Error('Desktop unused');}}});let setup,foreign,tabId;
  async function run(code){const result=await session.run(code,30000);assert.equal(result.isError,false,result.content.at(-1)?.text);return JSON.parse(result.content.at(-1).text);}
  const logs=()=>run('nodeRepl.write(JSON.stringify(await tab.dev.logs({limit:1000})));');
  try{
   version=1;setup=(await browser('Target.createTarget',{url:origin+'/setup'})).targetId;
   await seed(setup,'pre-capture');
   tabId=await run(`var tab=await cua.createBrowserTab('cdp',${JSON.stringify(origin+'/uncontrolled')},{visible:false});await tab.markHandoff();nodeRepl.write(JSON.stringify(tab.id));`);
   await run(`await tab.goto(${JSON.stringify(origin+'/controlled/app')});nodeRepl.write(JSON.stringify(true));`);
   await logs();
   assert.equal((await logs()).some(entry=>/startup|pre-capture/.test(entry.message)),false,'Cached worker output leaked into a new association');
   await run('await tab.playwright.getByRole("button",{name:"Later",exact:true}).click();nodeRepl.write(JSON.stringify(true));');
   const first=await until(async()=>(await logs()).find(entry=>entry.message==='service v1 later'),'Service console output missing');
   assert.equal(first.source.type,'service_worker');assert.equal(first.category,'console');assert.equal(first.level,'warn');assert.equal(first.url,origin+'/service.js');
   await evaluate(setup,"new Promise(resolve=>{navigator.serviceWorker.addEventListener('message',()=>resolve(true),{once:true});navigator.serviceWorker.getRegistration('/controlled/').then(r=>r.active.postMessage('shared-client'));})");
   const shared=await until(async()=>(await logs()).find(entry=>entry.message==='service v1 shared-client'),'Service-worker output from another client missing');assert.deepEqual(shared.source,first.source);
   const foreignOrigin=origin.replace('127.0.0.1','localhost');foreign=(await browser('Target.createTarget',{url:foreignOrigin+'/setup'})).targetId;await seed(foreign,'foreign-client');await logs();
   const foreignTargets=(await(await fetch(new URL('/json/list',endpoint))).json()).filter(target=>target.type==='service_worker'&&target.url.startsWith(foreignOrigin+'/'));
   assert.ok(foreignTargets.length);const capture=session.browserLogs.owners.get(session.resourceOwners.get(session.worker)).get(tabId);
   assert.ok(foreignTargets.every(target=>![...capture.children.values()].some(child=>child.targetId===target.id)),'Unrelated worker origin was attached');
   await evaluate(foreign,"new Promise(resolve=>{navigator.serviceWorker.addEventListener('message',()=>resolve(true),{once:true});navigator.serviceWorker.getRegistration('/controlled/').then(r=>r.active.postMessage('foreign-later'));})");
   assert.equal((await logs()).some(entry=>entry.message.includes('foreign-')),false,'Unrelated worker origin leaked output');
   await run('await tab.playwright.getByRole("button",{name:"Errors",exact:true}).click();nodeRepl.write(JSON.stringify(true));');
   await until(async()=>{const entries=await logs();return ['service thrown v1','service rejected v1'].every(text=>entries.some(entry=>entry.category==='exception'&&entry.message.includes(text)&&entry.source.targetId===first.source.targetId));},'Service exceptions missing');
   version=2;await run('await tab.playwright.getByRole("button",{name:"Update",exact:true}).click();nodeRepl.write(JSON.stringify(true));');
   await until(async()=>{const entry=session.browserLogs.owners.get(session.resourceOwners.get(session.worker))?.get(tabId);return entry&&[...entry.children.values()].some(child=>child.type==='service_worker'&&child.targetId!==first.source.targetId);},'Updated service worker not attached');
   await until(()=>evaluate(tabId,"document.querySelector('output').textContent==='activated v2'"),'Updated service worker not active');
   await logs();await run('await tab.playwright.getByRole("button",{name:"Later",exact:true}).click();nodeRepl.write(JSON.stringify(true));');
   const updated=await until(async()=>(await logs()).find(entry=>entry.message==='service v2 later'),'Updated worker output missing');assert.notEqual(updated.source.targetId,first.source.targetId);
   await session.endTurn();
   const fresh=await run(`nodeRepl.write(JSON.stringify(await tab.dev.logs()));`);assert.deepEqual(fresh,[],'A new turn replayed old service output');
   await run('await tab.markHandoff();await tab.playwright.getByRole("button",{name:"Later",exact:true}).click();nodeRepl.write(JSON.stringify(true));');
   await until(async()=>(await logs()).some(entry=>entry.message==='service v2 later'),'Turn rebind lost worker capture');
   await session.reset();await run(`var tab=await cua.getTab(${JSON.stringify(tabId)});await tab.markHandoff();nodeRepl.write(JSON.stringify(true));`);assert.deepEqual(await logs(),[],'Reset replayed worker output');
   await run('await tab.playwright.getByRole("button",{name:"Unregister",exact:true}).click();nodeRepl.write(JSON.stringify(true));');
   await until(()=>evaluate(tabId,"document.querySelector('output').textContent==='unregistered'"),'Registration cleanup failed');
   console.log(Session.name+' PASS related service-worker console/errors, cached history exclusion, shared-client identity/foreign-origin isolation, version replacement, turn/reset and fresh capture');
  }finally{
   for(const id of [setup,foreign].filter(Boolean)){await evaluate(id,"navigator.serviceWorker.getRegistration('/controlled/').then(r=>r?.unregister())").catch(()=>{});await browser('Target.closeTarget',{targetId:id}).catch(()=>{});}
   await session.close();if(tabId)await browser('Target.closeTarget',{targetId:tabId}).catch(()=>{});
  }
 }
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
