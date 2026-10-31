// Owns its browser, stalled HTTP responses and injected native receipt failures.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
const runtime=await import(process.argv[2]?pathToFileURL(path.join(process.argv[2],'scripts/open-computer-use-repl.mjs')).href:'./node-repl/open-computer-use-repl.mjs');
const binary=process.env.OCU_TEST_CHROME_EXECUTABLE;assert.ok(binary,'Set OCU_TEST_CHROME_EXECUTABLE');
const scratch=await mkdtemp(path.join(tmpdir(),'ocu-navigation-budget-')),saved={...process.env},native={async request(){throw Error('Desktop unused');}},requests=new Map();let manager;
const server=createServer((request,response)=>{
 if(request.url.startsWith('/pending')){requests.set(request.url,response);response.once('close',()=>requests.delete(request.url));return;}
 response.setHeader('Content-Type','text/html');response.end(`<title>Owned navigation budgets</title><output>${request.url}</output><button onclick="window.onbeforeunload=e=>{e.preventDefault();e.returnValue=''}">Arm unload</button><button onclick="window.onbeforeunload=null">Disarm</button>${request.url==='/async'?'<script>setTimeout(()=>alert("After navigation"),500)</script>':''}`);
});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}`;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label){const deadline=Date.now()+10000;for(;;){const value=check();if(value)return value;assert.ok(Date.now()<deadline,label);await pause(10);}}
async function run(session,code){const result=await session.run(code,30000);assert.equal(result.isError,false,result.content.at(-1)?.text);return JSON.parse(result.content.at(-1).text);}
function entry(session,id){return [...session.browserDialogs.targets.values()].find(entry=>entry.targetId===id);}
const arm="await tab.playwright.getByRole('button',{name:'Arm unload',exact:true}).click();";
const disarm="await tab.playwright.getByRole('button',{name:'Disarm',exact:true}).click();";
const output="nodeRepl.write(JSON.stringify(await tab.playwright.locator('output').innerText()));";
async function pending(session,id,label,timeoutMs=1500,turnTimeoutMs=30000){
 const work=session.run(`await tab.goto(${JSON.stringify(url+'/pending?'+label)},{timeoutMs:${timeoutMs}});`,turnTimeoutMs);work.catch(()=>{});
 const record=await until(()=>[...entry(session,id)?.navigations??[]].find(record=>record.dispatched)&&requests.has('/pending?'+label)&&[...entry(session,id).navigations][0],'Navigation did not reach the owned server');
 return {work,record};
}
try{
 let executable=path.resolve(binary);if(process.platform==='linux'){const quoted="'"+executable.replaceAll("'","'\\''")+"'";executable=path.join(scratch,'owned-chrome');await writeFile(executable,`#!/bin/sh\nexec ${quoted} --no-sandbox "$@"\n`,{mode:0o700});}
 process.env.OPEN_COMPUTER_USE_BROWSER_EXECUTABLE=executable;process.env.OPEN_COMPUTER_USE_BROWSER_MODE='headless';delete process.env.OPEN_COMPUTER_USE_CDP_URL;
 for(const Session of [runtime.WorkerJavaScriptSession,runtime.PersistentJavaScriptSession]){
  const session=new Session({native});manager=session.browserRuntime;const host=session.browserDialogs,open=host.open;let release;
  try{
   const id=await run(session,`var tab=await cua.createBrowserTab('cdp',${JSON.stringify(url+'/one')},{visible:false});await tab.markHandoff();${arm}await tab.goto(${JSON.stringify(url+'/two')});nodeRepl.write(JSON.stringify(tab.id));`);
   assert.equal(await run(session,"nodeRepl.write(JSON.stringify((await tab.getJsDialog()).type));"),'beforeunload');await pause(11000);
   assert.equal(await run(session,'await(await tab.getJsDialog()).dismiss();'+output),'/one');assert.equal(entry(session,id).navigations.size,0);
   await run(session,disarm+`await tab.goto(${JSON.stringify(url+'/two')});`+output);
   for(const [method,route] of [['back','/two'],['forward','/one'],['reload','/two']]){
    if(method==='forward')await run(session,disarm+'await tab.back();'+output);
    if(method==='reload')await run(session,disarm+'await tab.forward();'+output);
    await run(session,arm+`await tab.${method}({timeoutMs:1500});nodeRepl.write(JSON.stringify(true));`);
    await until(()=>entry(session,id)?.dialog,'History/reload dialog not captured');await pause(1600);
    assert.equal(await run(session,'await(await tab.getJsDialog()).dismiss();'+output),route);
   }
   // Change a real delayed navigation reply, after the native beforeunload path runs.
   host.open=async(...args)=>{const connection=await open(...args),send=connection.send;connection.send=(method,...values)=>method==='Page.navigate'?send(method,...values).then(result=>({...result,errorText:'net::ERR_FAILED'})):send(method,...values);return connection;};
   await run(session,`await tab.goto(${JSON.stringify(url+'/error')});nodeRepl.write(JSON.stringify((await tab.getJsDialog()).type));`);
   const deferred=await session.run('await(await tab.getJsDialog()).dismiss();');assert.equal(deferred.isError,true);assert.match(deferred.content.at(-1).text,/net::ERR_FAILED/);host.open=open;
   await run(session,disarm+output);
   const held=await pending(session,id,'held');const send=held.record.connection.send;let acknowledged=false,settled=false;
   const gate=new Promise(resolve=>{release=resolve;});held.work.then(()=>{settled=true;});
   held.record.connection.send=async(method,...args)=>{const result=await send(method,...args);if(method==='Page.stopLoading'){acknowledged=true;await gate;}return result;};
   await until(()=>acknowledged,'stopLoading did not acknowledge');await pause(100);assert.equal(settled,false);assert.equal(entry(session,id).navigations.size,1);
   const watch=[...host.waiters.values()].find(watch=>watch.entry.targetId===id);
   await assert.rejects(host.request(watch.owner,{action:'watch',targetId:id}),/navigation is already active/);
   release();release=undefined;const expired=await held.work;assert.equal(expired.isError,true);assert.match(expired.content.at(-1).text,/Timeout 1500ms/);assert.equal(entry(session,id).navigations.size,0);
   assert.equal(await run(session,output),'/two');
   const canceled=await pending(session,id,'reset',0);await session.reset();assert.equal((await canceled.work).isError,true);assert.equal(canceled.record.entry.navigations.size,0);
   assert.equal(await run(session,`var tab=await cua.getTab(${JSON.stringify(id)});`+output),'/two');
   const failure=await pending(session,id,'retry');const original=failure.record.connection.send;
   failure.record.connection.send=(method,...args)=>method==='Page.stopLoading'?Promise.reject(Error('Owned missing stop receipt')):original(method,...args);
   const failed=await failure.work;assert.equal(failed.isError,true);assert.match(failed.content.at(-1).text,/cleanup is unconfirmed/);assert.equal(failure.record.entry.navigations.size,1);
   assert.equal((await session.run('nodeRepl.write(1);')).isError,true);
   failure.record.connection.send=original;await session.reset();assert.equal(failure.record.entry.navigations.size,0);
   assert.equal(await run(session,`var tab=await cua.getTab(${JSON.stringify(id)});`+output),'/two');
   const timed=await pending(session,id,'turn-timeout',0,1500),timeout=await timed.work;assert.equal(timeout.isError,true);assert.match(timeout.content.at(-1).text,/timed out/);await session.reset();assert.equal(timed.record.entry.navigations.size,0);
   assert.equal(await run(session,`var tab=await cua.getTab(${JSON.stringify(id)});`+output),'/two');
   await run(session,arm+`await tab.goto(${JSON.stringify(url+'/three')},{timeoutMs:0});nodeRepl.write(JSON.stringify((await tab.getJsDialog()).type));`);const unloading=entry(session,id);assert.equal(unloading.navigations.size,1);await session.reset();assert.equal(unloading.navigations.size,0);
   assert.equal(await run(session,`var tab=await cua.getTab(${JSON.stringify(id)});`+output),'/two');
   await run(session,disarm+output);
   const dead=await pending(session,id,'browser-exit'),exitSend=dead.record.connection.send;dead.record.connection.send=(method,...args)=>method==='Page.stopLoading'?Promise.reject(Error('Owned lost native cancellation')):exitSend(method,...args);
   const stopped=await dead.work;assert.equal(stopped.isError,true);assert.equal(dead.record.entry.navigations.size,1);assert.ok(dead.record.browser.exitProof,'Owned browser identity unavailable');
   await manager.close();await session.reset();assert.equal(dead.record.entry.navigations.size,0);
   const fresh=await run(session,`var fresh=await cua.createBrowserTab('cdp',${JSON.stringify(url+'/fresh')},{visible:false});nodeRepl.write(JSON.stringify({id:fresh.id,text:await fresh.playwright.locator('output').innerText()}));`);assert.equal(fresh.text,'/fresh');assert.notEqual(host.browsers.get(entry(session,fresh.id).endpoint).browserId,dead.record.browser.browserId);
   await run(session,'await fresh.markHandoff();var tab=fresh;nodeRepl.write(JSON.stringify(true));');await session.endTurn();assert.equal(await run(session,`await tab.goto(${JSON.stringify(url+'/resumed')});await tab.markHandoff();`+output),'/resumed');
   await session.endTurn();await run(session,`await tab.goto(${JSON.stringify(url+'/async')});await tab.markHandoff();nodeRepl.write(JSON.stringify(true));`);
   const asynchronous=await until(()=>[...host.targets.values()].find(entry=>entry.dialog?.type==='alert'),'Asynchronous navigation dialog not captured');assert.equal(asynchronous.navigations.size,0);assert.equal(asynchronous.watches.size,0);
   await session.endTurn();assert.equal(asynchronous.dialog,undefined);assert.equal(await run(session,output),'/async');
   const closing=await pending(session,fresh.id,'target-close',0);await closing.record.browser.connection.send('Target.closeTarget',{targetId:fresh.id});assert.equal((await closing.work).isError,true);assert.equal(closing.record.entry.navigations.size,0);
   const modalId=await run(session,`var tab=await cua.createBrowserTab('cdp',${JSON.stringify(url+'/exit-dialog')},{visible:false});await tab.markHandoff();${arm}await tab.goto(${JSON.stringify(url+'/after-exit-dialog')},{timeoutMs:0});nodeRepl.write(JSON.stringify(tab.id));`),modal=entry(session,modalId);assert.equal(modal.dialog.type,'beforeunload');assert.equal(modal.navigations.size,1);
   await manager.close();await session.reset();assert.equal(modal.dialog,undefined);assert.equal(modal.navigations.size,0);
   assert.equal(await run(session,`var recovered=await cua.createBrowserTab('cdp',${JSON.stringify(url+'/final')},{visible:false});nodeRepl.write(JSON.stringify(await recovered.playwright.locator('output').innerText()));`),'/final');
   console.log(`${Session.name} PASS raw navigation delayed beforeunload/history/reload, deferred native error, active-time deadline, acknowledged stop drain, failed-cleanup retention/retry, unlimited reset/turn timeout, retained-turn asynchronous dialogs, target-close and original-browser-exit/modal recovery`);
  }finally{release?.();host.open=open;await session.close();}
 }
}finally{await manager?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(scratch,{recursive:true,force:true});for(const key of ['OPEN_COMPUTER_USE_CDP_URL','OPEN_COMPUTER_USE_BROWSER_EXECUTABLE','OPEN_COMPUTER_USE_BROWSER_MODE']){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
