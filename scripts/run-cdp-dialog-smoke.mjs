// Owns the managed browser, dialog pages and blocked-handshake socket.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
const runtime=await import(process.argv[2]?pathToFileURL(path.join(process.argv[2],'scripts/open-computer-use-repl.mjs')).href:'./node-repl/open-computer-use-repl.mjs');
const binary=process.env.OCU_TEST_CHROME_EXECUTABLE;assert.ok(binary,'Set OCU_TEST_CHROME_EXECUTABLE');
const scratch=await mkdtemp(path.join(tmpdir(),'ocu-cdp-clock-')),saved={...process.env},native={async request(){throw Error('Desktop unused');}},sockets=new Set();let manager,upgraded;
const server=createServer((request,response)=>{response.setHeader('Content-Type','text/html');response.end(request.url==='/child'?'<title>Raw child</title>Child':`<!doctype html><title>Raw clock</title><iframe src="http://localhost:${server.address().port}/child"></iframe>`);});
server.on('upgrade',(_request,socket)=>{sockets.add(socket);socket.on('error',()=>{});socket.on('close',()=>sockets.delete(socket));socket.on('end',()=>socket.end());socket.resume();upgraded?.(socket);});
await new Promise(resolve=>server.listen(0,resolve));const url=`http://127.0.0.1:${server.address().port}/`;
async function run(session,code){const result=await session.run(code,30000);assert.equal(result.isError,false,result.content.at(-1)?.text);return JSON.parse(result.content.at(-1).text);}
async function until(check,label){const deadline=Date.now()+5000;for(;;){const result=await check();if(result)return result;assert.ok(Date.now()<deadline,label);await new Promise(resolve=>setTimeout(resolve,10));}}
const dialog=(session,id,previous)=>until(()=>{const value=[...session.browserDialogs.targets.values()].find(entry=>entry.targetId===id)?.dialog;return value&&!value.consumed&&value.id!==previous?value:undefined;},'Dialog did not open');
try{
 let executable=path.resolve(binary);if(process.platform==='linux'){const quoted="'"+executable.replaceAll("'","'\\''")+"'";executable=path.join(scratch,'owned-chrome');await writeFile(executable,`#!/bin/sh\nexec ${quoted} --no-sandbox "$@"\n`,{mode:0o700});}
 process.env.OPEN_COMPUTER_USE_BROWSER_EXECUTABLE=executable;process.env.OPEN_COMPUTER_USE_BROWSER_MODE='headless';delete process.env.OPEN_COMPUTER_USE_CDP_URL;
 for(const Session of [runtime.WorkerJavaScriptSession,runtime.PersistentJavaScriptSession]){
  const session=new Session({native});manager=session.browserRuntime;
  try{
   const id=await run(session,`var tab=await cua.createBrowserTab('cdp',${JSON.stringify(url)},{visible:false});await tab.markHandoff();await tab.playwright.frameLocator('iframe').locator('body').waitFor({state:'visible'});var cdp=await tab.capabilities.get('cdp');await cdp.send('Runtime.enable');nodeRepl.write(JSON.stringify(tab.id));`);
   const child=await until(async()=>{const result=await run(session,"nodeRepl.write(JSON.stringify((await cdp.readEvents({afterSequence:0,methods:['Target.attachedToTarget']})).events.map(e=>e.params)));" );return result.find(event=>event.targetInfo.type==='iframe');},'Raw child not attached');
   await run(session,`await cdp.send('Page.enable',{}, {target:{sessionId:${JSON.stringify(child.sessionId)}}});nodeRepl.write(JSON.stringify(true));`);
   for(const target of [undefined,{sessionId:child.sessionId}]){
    await run(session,`var rawDone=false,rawPending=cdp.send('Runtime.evaluate',{expression:"prompt('Raw first');prompt('Raw second');42",returnByValue:true,userGesture:true},{timeoutMs:500,...${JSON.stringify(target?{target}:{})}}).finally(()=>rawDone=true);rawPending.catch(()=>{});nodeRepl.write(JSON.stringify(true));`);
    const first=await dialog(session,id);assert.equal(await run(session,"nodeRepl.write(JSON.stringify((await tab.getJsDialog()).type));"),'prompt');
    await new Promise(resolve=>setTimeout(resolve,750));assert.equal(await run(session,'nodeRepl.write(JSON.stringify(rawDone));'),false);
    await run(session,"await(await tab.getJsDialog()).accept('one');nodeRepl.write(JSON.stringify(true));");await dialog(session,id,first.id);
    await new Promise(resolve=>setTimeout(resolve,750));assert.equal(await run(session,'nodeRepl.write(JSON.stringify(rawDone));'),false);
    await run(session,"await(await tab.getJsDialog()).dismiss();nodeRepl.write(JSON.stringify(true));");assert.equal(await run(session,'nodeRepl.write(JSON.stringify((await rawPending).result.value));'),42);
   }
   await run(session,`await cdp.send('Page.disable');await cdp.send('Page.disable',{}, {target:{sessionId:${JSON.stringify(child.sessionId)}}});var unobservedDone=false,unobservedError,unobserved=cdp.send('Runtime.evaluate',{expression:"prompt('Unobserved clock');99",returnByValue:true,userGesture:true},{timeoutMs:200}).finally(()=>unobservedDone=true);unobserved.catch(error=>unobservedError=error.message);nodeRepl.write(JSON.stringify(true));`);
   await dialog(session,id);await run(session,'var held=await tab.getJsDialog();nodeRepl.write(JSON.stringify(held.type));');await new Promise(resolve=>setTimeout(resolve,400));
   const unobserved=await run(session,'nodeRepl.write(JSON.stringify({done:unobservedDone,error:unobservedError}));');assert.equal(unobserved.done,true);assert.match(unobserved.error,/timed out/);
   await run(session,`await held.dismiss();await cdp.send('Page.enable');await cdp.send('Page.enable',{}, {target:{sessionId:${JSON.stringify(child.sessionId)}}});nodeRepl.write(JSON.stringify(true));`);
   await run(session,`var rawMarker=17,rawPending=cdp.send('Runtime.evaluate',{expression:"prompt('Raw expiry');new Promise(resolve=>setTimeout(()=>resolve(99),1500))",awaitPromise:true,returnByValue:true,userGesture:true},{timeoutMs:200});rawPending.catch(()=>{});nodeRepl.write(JSON.stringify(true));`);
   await dialog(session,id);await run(session,'var claimed=await tab.getJsDialog();nodeRepl.write(JSON.stringify(claimed.type));');await new Promise(resolve=>setTimeout(resolve,400));
   await run(session,'await claimed.dismiss();nodeRepl.write(JSON.stringify(true));');const expired=await session.run('await rawPending;');assert.equal(expired.isError,true);assert.match(expired.content.at(-1).text,/CDP Runtime.evaluate timed out/);assert.equal(await run(session,'nodeRepl.write(JSON.stringify(rawMarker));'),17);
   await run(session,`var rawPending=cdp.send('Runtime.evaluate',{expression:"prompt('Raw reset');7",returnByValue:true,userGesture:true},{timeoutMs:0});rawPending.catch(()=>{});nodeRepl.write(JSON.stringify(true));`);await dialog(session,id);await run(session,'await tab.getJsDialog();nodeRepl.write(JSON.stringify(true));');await session.reset();assert.equal(session.browserCdp.owners.size,0);
   await run(session,`var tab=await cua.getTab(${JSON.stringify(id)});await tab.markHandoff();var cdp=await tab.capabilities.get('cdp');nodeRepl.write(JSON.stringify(true));`);
   const debuggerApi=session.browserCdp,original=debuggerApi.open;let socket;upgraded=value=>socket=value;
   debuggerApi.open=(_url,onEvent,onClose,signal)=>original(`ws://127.0.0.1:${server.address().port}/blocked-cdp`,onEvent,onClose,signal);
   try{
    await run(session,"var blocked=cdp.send('Runtime.evaluate',{expression:'1'});blocked.catch(()=>{});nodeRepl.write(JSON.stringify(true));");await until(()=>socket,'Debugger handshake did not start');
    const started=performance.now();await session.reset();assert.ok(performance.now()-started<5000,'Reset waited for the handshake deadline');await until(()=>socket.destroyed,'Canceled handshake socket retained');assert.equal(debuggerApi.owners.size,0);
   }finally{debuggerApi.open=original;upgraded=undefined;socket?.destroy();}
   assert.equal(await run(session,`var tab=await cua.getTab(${JSON.stringify(id)});await tab.markHandoff();var cdp=await tab.capabilities.get('cdp');nodeRepl.write(JSON.stringify((await cdp.send('Runtime.evaluate',{expression:'3',returnByValue:true})).result.value));`),3);
   console.log(`${Session.name} PASS raw root/OOP repeated-dialog clocks, Page stream toggles, protocol results, resumed expiry/context retention, unlimited reset, blocked-handshake cancellation and fresh capture`);
  }finally{await session.close();}
 }
}finally{await manager?.close();for(const socket of sockets)socket.destroy();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(scratch,{recursive:true,force:true});for(const key of ['OPEN_COMPUTER_USE_CDP_URL','OPEN_COMPUTER_USE_BROWSER_EXECUTABLE','OPEN_COMPUTER_USE_BROWSER_MODE']){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
