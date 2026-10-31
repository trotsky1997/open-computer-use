// Owns all browsers, child hosts and fixture tabs; never attaches a user profile.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
import {chromium} from 'playwright-core';
const moduleUrl=process.argv[2]?pathToFileURL(path.join(process.argv[2],'scripts/open-computer-use-repl.mjs')).href:new URL('./node-repl/open-computer-use-repl.mjs',import.meta.url).href;
const {BrowserTabClaims}=await import(new URL('browser-tab-claims.mjs',moduleUrl));
const runtime=await import(moduleUrl),binary=process.env.OCU_TEST_CHROME_EXECUTABLE;
if(!binary)throw Error('Set OCU_TEST_CHROME_EXECUTABLE');
const scratch=await mkdtemp(path.join(tmpdir(),'ocu-cross-host-')),saved={...process.env},children=new Set(),namespaces=new Set();let controller,manager;
const native={async request(){throw Error('Desktop unused');}},server=createServer((_request,response)=>{response.setHeader('Content-Type','text/html');response.end('<title>Owned cross-host claims</title><label>Value<input></label><button onclick="window.open(\'/popup\')">Popup</button>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}/`;
const childSource=`const runtime=await import(${JSON.stringify(moduleUrl)});const session=new runtime[process.env.OCU_SESSION]({native:{async request(){throw Error('Desktop unused');}}});let queue=Promise.resolve();process.on('message',message=>{queue=queue.then(async()=>{try{const result=await session[message.method](...(message.args??[]));process.send({id:message.id,result});}catch(error){process.send({id:message.id,error:String(error)});}});});`;
function host(Session,endpoint){
 const child=spawn(process.execPath,['--input-type=module','-e',childSource],{env:{...process.env,OCU_SESSION:Session,OPEN_COMPUTER_USE_CDP_URL:endpoint},stdio:['ignore','ignore','pipe','ipc']});children.add(child);let next=0,log='';const pending=new Map();
 child.stderr.on('data',data=>{log+=data;});child.on('message',message=>{const request=pending.get(message.id);if(request){pending.delete(message.id);message.error?request.reject(Error(message.error)):request.resolve(message.result);}});
 const exited=once(child,'exit');child.once('exit',()=>{children.delete(child);for(const request of pending.values())request.reject(Error('Child host exited: '+log));pending.clear();});
 return {child,exited,async call(method,...args){return new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});child.send({id,method,args},error=>{if(error){pending.delete(id);reject(error);}});});},async stop(signal='SIGTERM'){if(child.exitCode===null&&child.signalCode===null)child.kill(signal);await exited;}};
}
async function run(host,code){const result=await host.call('run',code,30000);assert.equal(result.isError,false,result.content.at(-1)?.text);return JSON.parse(result.content.at(-1).text);}
async function denied(host,code){const result=await host.call('run',code,30000);assert.equal(result.isError,true);assert.match(result.content.at(-1).text,/another session or host/);}
async function tabs(){return (await fetch(new URL('/json/list',process.env.OPEN_COMPUTER_USE_CDP_URL))).json();}
async function until(check,label){const deadline=Date.now()+10000;for(;;){const value=await check();if(value)return value;assert.ok(Date.now()<deadline,label);await new Promise(resolve=>setTimeout(resolve,20));}}
async function existing(target){for(const page of controller.contexts()[0].pages())if(await id(page)===target)return page;throw Error('Owned fixture tab missing');}
async function id(page){const cdp=await page.context().newCDPSession(page);try{return (await cdp.send('Target.getTargetInfo')).targetInfo.targetId;}finally{await cdp.detach();}}
try{
 let executable=path.resolve(binary);
 if(process.platform==='linux'){executable=path.join(scratch,'owned-chrome');const quoted="'"+path.resolve(binary).replaceAll("'","'\\''")+"'";await writeFile(executable,`#!/bin/sh\nexec ${quoted} --no-sandbox "$@"\n`,{mode:0o700});}
 process.env.OPEN_COMPUTER_USE_BROWSER_EXECUTABLE=executable;process.env.OPEN_COMPUTER_USE_BROWSER_MODE='headless';delete process.env.OPEN_COMPUTER_USE_CDP_URL;
 let oldInstance;
 for(const Session of ['WorkerJavaScriptSession','PersistentJavaScriptSession']){
  const bootstrap=new runtime.WorkerJavaScriptSession({native});manager=bootstrap.browserRuntime;
  const launched=await bootstrap.run("var browser=await cua.getBrowser({id:'cdp'});");assert.equal(launched.isError,false,launched.content.at(-1)?.text);
  const endpoint=process.env.OPEN_COMPUTER_USE_CDP_URL,version=await(await fetch(new URL('/json/version',endpoint))).json();
  assert.ok(version.webSocketDebuggerUrl);namespaces.add(new BrowserTabClaims(new URL(version.webSocketDebuggerUrl).pathname).directory);if(oldInstance)assert.notEqual(version.webSocketDebuggerUrl,oldInstance);oldInstance=version.webSocketDebuggerUrl;
  controller=await chromium.connectOverCDP(endpoint,{noDefaults:true});let page=await controller.contexts()[0].newPage();await page.goto(url);
  const target=await id(page),reference=JSON.stringify(target),alias=new URL(endpoint);alias.hostname='localhost';
  const a=host(Session,endpoint),b=host(Session,alias.href);
  try{
   await run(b,`var browser=await cua.getBrowser({id:'cdp'});var tab=await browser.user.claimTab(${reference});nodeRepl.write(JSON.stringify(true));`);await b.call('endTurn');
   await run(a,`var browser=await cua.getBrowser({id:'cdp'});var tab=await browser.user.claimTab(${reference});await tab.playwright.getByLabel('Value').fill('owner A');nodeRepl.write(JSON.stringify(true));`);
   await denied(b,"await tab.playwright.getByLabel('Value').fill('foreign');");await denied(b,`await cua.getTab(${reference});`);assert.equal(await page.getByLabel('Value').inputValue(),'owner A');
   assert.equal((await run(b,'nodeRepl.write(JSON.stringify(await browser.user.openTabs()));')).some(row=>row.id===target),false);
   const created=await run(a,`var created=await cua.createBrowserTab('cdp',${JSON.stringify(url)},{visible:false});nodeRepl.write(JSON.stringify(created.id));`);
   await denied(b,`await cua.getTab(${JSON.stringify(created)});`);
   await page.bringToFront();await controller.close();controller=undefined;
   await run(a,"await tab.playwright.getByRole('button',{name:'Popup'}).click();nodeRepl.write(JSON.stringify(true));");
   const popup=await until(async()=>(await tabs()).find(tab=>tab.url===url+'popup'),'Owned popup missing');await denied(b,`await cua.getTab(${JSON.stringify(popup.id)});`);
   assert.equal((await run(b,'nodeRepl.write(JSON.stringify(await browser.user.openTabs()));')).some(row=>row.id===popup.id),false);
   controller=await chromium.connectOverCDP(endpoint,{noDefaults:true});page=await existing(target);
   await run(a,'await tab.markHandoff();nodeRepl.write(JSON.stringify(true));');await a.call('endTurn');assert.equal((await tabs()).some(tab=>tab.id===popup.id),false);await denied(b,`await cua.getTab(${reference});`);
   await run(a,'nodeRepl.write(JSON.stringify(true));');await a.call('endTurn');
   await run(b,"await tab.playwright.getByLabel('Value').fill('owner B');nodeRepl.write(JSON.stringify(true));");await denied(a,"await tab.playwright.getByLabel('Value').fill('old handle');");assert.equal(await page.getByLabel('Value').inputValue(),'owner B');await b.call('endTurn');
   const races=await Promise.all([a.call('run',`await cua.getTab(${reference});`),b.call('run',`await cua.getTab(${reference});`)]);assert.equal(races.filter(value=>!value.isError).length,1);
   const winner=races[0].isError?b:a,loser=winner===a?b:a;await winner.stop('SIGKILL');await denied(loser,`await cua.getTab(${reference});`);assert.equal(page.isClosed(),false);
   await loser.call('reset');await denied(loser,`await cua.getTab(${reference});`);
   console.log(`${Session} PASS independent host/endpoint-alias claims, stale-handle denial, native content retention, created-tab/popup fencing and cleanup, handoff/release, racing claims and crash/reset fencing`);
  }finally{for(const child of [a,b]){if(child.child.exitCode===null&&child.child.signalCode===null)await child.call('close').catch(()=>{});await child.stop();}}
  await controller.close();controller=undefined;await bootstrap.close();await manager.close();
 }
}finally{
 for(const child of children){child.kill('SIGKILL');await once(child,'exit');}
 await controller?.close();await manager?.close();for(const directory of namespaces)await rm(directory,{recursive:true,force:true});server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(scratch,{recursive:true,force:true});
 for(const key of ['OPEN_COMPUTER_USE_CDP_URL','OPEN_COMPUTER_USE_BROWSER_EXECUTABLE','OPEN_COMPUTER_USE_BROWSER_MODE']){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}
}
