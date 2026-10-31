// Owns its browser, fixture pages and independent child hosts.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
const moduleUrl=process.argv[2]?pathToFileURL(path.join(process.argv[2],'scripts/open-computer-use-repl.mjs')).href:new URL('./node-repl/open-computer-use-repl.mjs',import.meta.url).href;
const runtime=await import(moduleUrl),binary=process.env.OCU_TEST_CHROME_EXECUTABLE;
assert.ok(binary,'Set OCU_TEST_CHROME_EXECUTABLE');
const scratch=await mkdtemp(path.join(tmpdir(),'ocu-dialog-hosts-')),saved={...process.env},children=new Set();let manager;
const native={async request(){throw Error('Desktop unused');}};
const server=createServer((_request,response)=>{response.setHeader('Content-Type','text/html');response.end('<title>Owned dialog hosts</title><output>Ready</output><button onclick="document.querySelector(\'output\').textContent=String(confirm(\'Owned confirm\'))">Confirm</button><label>Value<input></label>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}/`;
const childSource=`const runtime=await import(${JSON.stringify(moduleUrl)});const session=new runtime[process.env.OCU_SESSION]({native:{async request(){throw Error('Desktop unused');}}});let queue=Promise.resolve();process.on('message',message=>{queue=queue.then(async()=>{try{const result=await session[message.method](...(message.args??[]));process.send({id:message.id,result});}catch(error){process.send({id:message.id,error:String(error)});}});});`;
function host(Session){
 const child=spawn(process.execPath,['--input-type=module','-e',childSource],{env:{...process.env,OCU_SESSION:Session.name},stdio:['ignore','ignore','pipe','ipc']});children.add(child);let next=0,log='';const pending=new Map();
 child.stderr.on('data',data=>{log+=data;});child.on('message',message=>{const request=pending.get(message.id);if(request){pending.delete(message.id);message.error?request.reject(Error(message.error)):request.resolve(message.result);}});
 const exited=once(child,'exit');child.once('exit',()=>{children.delete(child);for(const request of pending.values())request.reject(Error('Child host exited: '+log));pending.clear();});
 return {async call(method,...args){return new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});child.send({id,method,args},error=>{if(error){pending.delete(id);reject(error);}});});},async stop(){if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');await exited;}};
}
function value(result){assert.equal(result.isError,false,result.content.at(-1)?.text);return JSON.parse(result.content.at(-1).text);}
async function run(session,code){return value(await session.run(code,30000));}
async function childRun(child,code){return value(await child.call('run',code,5000));}
try{
 let executable=path.resolve(binary);if(process.platform==='linux'){const quoted="'"+executable.replaceAll("'","'\\''")+"'";executable=path.join(scratch,'owned-chrome');await writeFile(executable,`#!/bin/sh\nexec ${quoted} --no-sandbox "$@"\n`,{mode:0o700});}
 process.env.OPEN_COMPUTER_USE_BROWSER_EXECUTABLE=executable;process.env.OPEN_COMPUTER_USE_BROWSER_MODE='headless';delete process.env.OPEN_COMPUTER_USE_CDP_URL;
 for(const Session of [runtime.WorkerJavaScriptSession,runtime.PersistentJavaScriptSession]){
  const session=new Session({native});manager=session.browserRuntime;let child;
  try{
   const original=await run(session,`var tab=await cua.createBrowserTab('cdp',${JSON.stringify(url)},{visible:false});await tab.playwright.getByRole('button',{name:'Confirm'}).click();var dialog=await tab.getJsDialog();nodeRepl.write(JSON.stringify(tab.id));`);
   child=host(Session);
   assert.ok((await childRun(child,'nodeRepl.write(JSON.stringify(await cua.listTabs({emit:false})));')).some(tab=>tab.id===original));
   assert.equal(await childRun(child,"var browser=await cua.getBrowser({id:'cdp'});nodeRepl.write(JSON.stringify(browser.browserId));"),'cdp');
   await new Promise(resolve=>setTimeout(resolve,11000));
   assert.ok((await childRun(child,'nodeRepl.write(JSON.stringify(await cua.listTabs({emit:false})));')).some(tab=>tab.id===original));
   await child.call('close');await child.stop();child=undefined;
   assert.equal(await run(session,'nodeRepl.write(JSON.stringify((await tab.getJsDialog()).type));'),'confirm');
   child=host(Session);
   await childRun(child,'await cua.listBrowsers({emit:false});nodeRepl.write(JSON.stringify(true));');
   const other=await childRun(child,`var other=await cua.createBrowserTab('cdp',${JSON.stringify(url+'other')},{visible:false});await other.markHandoff();nodeRepl.write(JSON.stringify(other.id));`);
   const denied=await child.call('run',"await other.playwright.getByLabel('Value').fill('blocked');",5000);assert.equal(denied.isError,true);assert.match(denied.content.at(-1).text,/Dialog observation.*not ready/);
   await child.call('reset');
   assert.equal(await run(session,'nodeRepl.write(JSON.stringify((await tab.getJsDialog()).type));'),'confirm');
   assert.equal(await run(session,"await dialog.accept();nodeRepl.write(JSON.stringify(await tab.playwright.locator('output').innerText()));"),'true');
   assert.equal(await childRun(child,`var other=await cua.getTab(${JSON.stringify(other)});await other.playwright.getByLabel('Value').fill('recovered');nodeRepl.write(JSON.stringify(await other.playwright.getByLabel('Value').inputValue()));`),'recovered');
   await childRun(child,'await other.close();nodeRepl.write(JSON.stringify(true));');await child.call('close');await child.stop();child=undefined;
   // A closed target's failed passive observer must not block the surviving tab.
   assert.equal(await run(session,"nodeRepl.write(JSON.stringify(await tab.playwright.locator('output').innerText()));"),'true');
   await run(session,'await tab.close();nodeRepl.write(JSON.stringify(true));');
   console.log(`${Session.name} PASS independent-host inventory beyond observer timeout, passive close and reset during an owned dialog, explicit pending-observer refusal, original response retention, fresh binding recovery and closed-target isolation`);
  }finally{if(child){await child.call('close');await child.stop();}await session.close();}
 }
}finally{
 for(const child of children)if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');
 await manager?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(scratch,{recursive:true,force:true});
 for(const key of ['OPEN_COMPUTER_USE_CDP_URL','OPEN_COMPUTER_USE_BROWSER_EXECUTABLE','OPEN_COMPUTER_USE_BROWSER_MODE']){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}
}
