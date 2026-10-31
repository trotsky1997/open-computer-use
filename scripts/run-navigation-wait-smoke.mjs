// Owns its managed browser and all page-driven dialogs/navigation fixtures.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
const runtime=await import(process.argv[2]?pathToFileURL(path.join(process.argv[2],'scripts/open-computer-use-repl.mjs')).href:'./node-repl/open-computer-use-repl.mjs');
const binary=process.env.OCU_TEST_CHROME_EXECUTABLE;assert.ok(binary,'Set OCU_TEST_CHROME_EXECUTABLE');
const scratch=await mkdtemp(path.join(tmpdir(),'ocu-navigation-wait-')),saved={...process.env},native={async request(){throw Error('Desktop unused');}};let manager;
const busy=new Set();
const server=createServer((request,response)=>{if(request.url.startsWith('/busy')){busy.add(response);response.once('close',()=>busy.delete(response));return;}response.setHeader('Content-Type','text/html');response.end(`<title>Owned navigation waits</title><output>${request.url}</output>${request.url==='/loading'?'<img src="/busy">':''}<a href="/arrived">Direct</a><button onclick="if(confirm('Navigate?'))location.href='/arrived'">Confirm</button><button onclick="prompt('First');prompt('Second');location.href='/arrived'">Repeated</button><button onclick="confirm('Stay here')">Stay</button><button onclick="setTimeout(()=>{if(confirm('Async'))location.href='/arrived'},50)">Async</button>`);});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}`;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label){const deadline=Date.now()+10000;for(;;){const value=check();if(value)return value;assert.ok(Date.now()<deadline,label);await pause(10);}}
function entry(session,id){return [...session.browserDialogs.targets.values()].find(entry=>entry.targetId===id);}
async function run(session,code){const result=await session.run(code,30000);assert.equal(result.isError,false,result.content.at(-1)?.text);return JSON.parse(result.content.at(-1).text);}
try{
 let executable=path.resolve(binary);if(process.platform==='linux'){const quoted="'"+executable.replaceAll("'","'\\''")+"'";executable=path.join(scratch,'owned-chrome');await writeFile(executable,`#!/bin/sh\nexec ${quoted} --no-sandbox "$@"\n`,{mode:0o700});}
 process.env.OPEN_COMPUTER_USE_BROWSER_EXECUTABLE=executable;process.env.OPEN_COMPUTER_USE_BROWSER_MODE='headless';delete process.env.OPEN_COMPUTER_USE_CDP_URL;
 for(const Session of [runtime.WorkerJavaScriptSession,runtime.PersistentJavaScriptSession]){
  const session=new Session({native});manager=session.browserRuntime;
  try{
   const first=await run(session,`var tab=await cua.createBrowserTab('cdp',${JSON.stringify(url+'/first')},{visible:false});await tab.markHandoff();var callbackDone;await tab.playwright.expectNavigation(async()=>{await tab.playwright.getByRole('button',{name:'Confirm',exact:true}).click();callbackDone='finished';return 'result';},{timeoutMs:1500});nodeRepl.write(JSON.stringify({type:(await tab.getJsDialog())?.type,done:typeof callbackDone}));`);
   assert.deepEqual(first,{type:'confirm',done:'undefined'});await pause(1700);
   assert.equal(await run(session,"await(await tab.getJsDialog()).accept();nodeRepl.write(JSON.stringify(await tab.playwright.locator('output').innerText()));"),'/arrived');assert.equal(await run(session,'nodeRepl.write(JSON.stringify(callbackDone));'),'finished');
   assert.equal(await run(session,`nodeRepl.write(JSON.stringify(await tab.playwright.expectNavigation(async()=>{await tab.goto(${JSON.stringify(url+'/normal')});return 42;},{timeoutMs:1500})));`),42);
   const id=await run(session,'nodeRepl.write(JSON.stringify(tab.id));');
   await run(session,`await tab.goto(${JSON.stringify(url+'/repeated')});await tab.playwright.expectNavigation(()=>tab.playwright.getByRole('button',{name:'Repeated',exact:true}).click(),{timeoutMs:1500});nodeRepl.write(JSON.stringify((await tab.getJsDialog()).type));`);await pause(1700);
   await run(session,'await(await tab.getJsDialog()).accept("one");nodeRepl.write(JSON.stringify((await tab.getJsDialog()).type));');await pause(1700);
   assert.equal(await run(session,"await(await tab.getJsDialog()).accept('two');nodeRepl.write(JSON.stringify(await tab.playwright.locator('output').innerText()));"),'/arrived');
   await run(session,`await tab.goto(${JSON.stringify(url+'/stay')});await tab.playwright.expectNavigation(()=>tab.playwright.getByRole('button',{name:'Stay',exact:true}).click(),{timeoutMs:500});nodeRepl.write(JSON.stringify(true));`);await pause(600);
   const expired=await session.run('await(await tab.getJsDialog()).accept();');assert.equal(expired.isError,true);assert.match(expired.content.at(-1).text,/Timeout 500ms/);
   assert.equal(session.browserFocusLeases.entries.size,0);assert.equal(session.browserDialogs.waiters.size,0);
   await run(session,`await tab.goto(${JSON.stringify(url+'/async')});await tab.playwright.expectNavigation(()=>tab.playwright.getByRole('button',{name:'Async',exact:true}).click(),{timeoutMs:1500});nodeRepl.write(JSON.stringify((await tab.getJsDialog()).type));`);await pause(1700);
   await run(session,'await(await tab.getJsDialog()).accept();nodeRepl.write(JSON.stringify(true));');
   const otherId=await run(session,`var other=await cua.createBrowserTab('cdp',${JSON.stringify(url+'/other')},{visible:false});await other.markHandoff();nodeRepl.write(JSON.stringify(other.id));`);
   await run(session,`await tab.playwright.expectNavigation(async()=>{await other.playwright.getByRole('button',{name:'Stay',exact:true}).click();await tab.goto(${JSON.stringify(url+'/cross-target')});},{timeoutMs:1500});nodeRepl.write(JSON.stringify((await other.getJsDialog()).type));`);await pause(1700);
   assert.equal(await run(session,"await(await other.getJsDialog()).accept();nodeRepl.write(JSON.stringify(await tab.playwright.locator('output').innerText()));"),'/cross-target');
   assert.equal(entry(session,otherId).watches.size,0);
   // Standalone observers leave an independently started input action admissible.
   await run(session,`await tab.goto(${JSON.stringify(url+'/standalone')});var waiting=tab.playwright.waitForURL('**/arrived',{timeoutMs:1500});await tab.playwright.getByRole('button',{name:'Confirm',exact:true}).click();await waiting;nodeRepl.write(JSON.stringify((await tab.getJsDialog()).type));`);await pause(1700);
   await run(session,'await(await tab.getJsDialog()).accept();nodeRepl.write(JSON.stringify(true));');
   await run(session,`await tab.goto(${JSON.stringify(url+'/loading')});var loading=tab.playwright.waitForLoadState({state:'load',timeoutMs:1500});await tab.playwright.getByRole('button',{name:'Stay',exact:true}).click();await loading;nodeRepl.write(JSON.stringify((await tab.getJsDialog()).type));`);await pause(1700);
   const responding=session.run('await(await tab.getJsDialog()).accept();');await pause(100);for(const response of busy){response.setHeader('Content-Type','image/svg+xml');response.end('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');}assert.equal((await responding).isError,false);
   const noURL=await session.run("await tab.playwright.waitForURL('**/missing',{timeoutMs:100});");assert.equal(noURL.isError,true);assert.match(noURL.content.at(-1).text,/Timeout 100ms/);
   const actionFailed=await session.run("await tab.playwright.expectNavigation(async()=>{throw Error('Owned callback failure');},{timeoutMs:100});");assert.equal(actionFailed.isError,true);assert.match(actionFailed.content.at(-1).text,/Owned callback failure/);
   const callbackFailed=await session.run("await tab.playwright.expectNavigation(async()=>{await new Promise(resolve=>setTimeout(resolve,100));throw Error('Callback wins after wait expiry');},{timeoutMs:20});");assert.equal(callbackFailed.isError,true);assert.match(callbackFailed.content.at(-1).text,/Callback wins after wait expiry/);
   await run(session,`await tab.goto(${JSON.stringify(url+'/reset')});await tab.playwright.expectNavigation(()=>tab.playwright.getByRole('button',{name:'Confirm',exact:true}).click(),{timeoutMs:0});nodeRepl.write(JSON.stringify(true));`);await session.reset();
   assert.equal(session.browserDialogs.waiters.size,0);assert.equal(session.browserFocusLeases.entries.size,0);
   assert.equal(await run(session,`var tab=await cua.getTab(${JSON.stringify(id)});nodeRepl.write(JSON.stringify(await tab.playwright.locator('output').innerText()));`),'/reset');
   assert.equal(await run(session,`var late,lateDone;var lateWait=new Promise(resolve=>lateDone=resolve);nodeRepl.write(JSON.stringify(await tab.playwright.expectNavigation(async()=>{await tab.goto(${JSON.stringify(url+'/late')});setTimeout(async()=>{try{await tab.playwright.getByRole('button',{name:'Stay',exact:true}).click();late='unexpected';}catch(error){late=error.message;}finally{lateDone();}},500);return 'callback';},{timeoutMs:1500})));`),'callback');
   assert.match(await run(session,'await lateWait;nodeRepl.write(JSON.stringify(late));'),/scope ended/);
   const focus=session.browserFocusLeases,update=focus.updateFocus;let held=false,release;
   const gate=new Promise(resolve=>{release=resolve;});focus.updateFocus=async(...args)=>{await update(...args);if(args[1]===false){held=true;await gate;}};
   try{
    let settled=false;const pending=session.run("await tab.playwright.expectNavigation(()=>{void tab.playwright.getByRole('link',{name:'Direct',exact:true}).click();return 'drained';},{timeoutMs:1500});nodeRepl.write(JSON.stringify('drained'));",30000);pending.then(()=>{settled=true;});
    await until(()=>held,'Native focus release not reached');await pause(100);assert.equal(settled,false);release();const drained=await pending;assert.equal(drained.isError,false,drained.content.at(-1).text);
   }finally{release();focus.updateFocus=update;}
   if(Session===runtime.WorkerJavaScriptSession){
    let settled=false;const long=session.run("await tab.playwright.waitForURL('**/long-arrived',{timeoutMs:0});nodeRepl.write(JSON.stringify('long wait'));",45000);long.then(()=>{settled=true;});
    await pause(31000);assert.equal(settled,false);await entry(session,id).connection.send('Page.navigate',{url:url+'/long-arrived'});assert.equal((await long).isError,false);
   }
   console.log(`${Session.name} PASS navigation wait dialog yields, repeated/async/cross-target scopes, resumed deadline, independent observer/input, callback value/failure/drain, late-action refusal, reset and unlimited long wait`);
  }finally{await session.close();}
 }
}finally{await manager?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(scratch,{recursive:true,force:true});for(const key of ['OPEN_COMPUTER_USE_CDP_URL','OPEN_COMPUTER_USE_BROWSER_EXECUTABLE','OPEN_COMPUTER_USE_BROWSER_MODE']){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
