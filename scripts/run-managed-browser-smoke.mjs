// Owns its headless browsers and host subprocesses; no user browser profile is opened.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {access,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {WorkerJavaScriptSession,PersistentJavaScriptSession} from './node-repl/open-computer-use-repl.mjs';
import {withConnection} from './node-repl/browser-cdp.mjs';
const native={async request(){throw Error('Native app must remain unused');}};
const gone=pid=>{try{process.kill(pid,0);return false;}catch(error){return error.code==='ESRCH';}};
const missing=async file=>{try{await access(file);return false;}catch(error){if(error.code==='ENOENT')return true;throw error;}};
async function until(check,label){const end=Date.now()+15000;while(!await check()){assert.ok(Date.now()<end,label);await new Promise(resolve=>setTimeout(resolve,20));}}
async function run(session,code){const result=await session.run(code,30000);assert.equal(result.isError,false,JSON.stringify(result.content));return JSON.parse(result.content.at(-1).text);}
if(process.argv.includes('--host-child')){
 const session=new WorkerJavaScriptSession({native});
 await run(session,`var tab=await cua.createBrowserTab('cdp',${JSON.stringify(process.env.OCU_MANAGED_FIXTURE_URL)},{visible:false});await tab.markHandoff();nodeRepl.write(JSON.stringify(true));`);
 const owned=session.browserRuntime.current;console.log(JSON.stringify({pid:owned.pid,profile:owned.profile,guardian:owned.child.pid}));
 if(process.argv.includes('--hold'))await new Promise(()=>{});else await session.close();
}else{
 const binary=process.env.OCU_TEST_CHROME_EXECUTABLE;if(!binary)throw Error('Set OCU_TEST_CHROME_EXECUTABLE to test Chromium');
 const saved={endpoint:process.env.OPEN_COMPUTER_USE_CDP_URL,executable:process.env.OPEN_COMPUTER_USE_BROWSER_EXECUTABLE};
 const scratch=await mkdtemp(path.join(tmpdir(),'ocu-managed-smoke-'));let executable=path.resolve(binary);
 if(process.platform==='linux'){
  const quoted="'"+executable.replaceAll("'","'\\''")+"'";executable=path.join(scratch,'owned-vm-chrome');
  await writeFile(executable,`#!/bin/sh\nexec ${quoted} --no-sandbox "$@"\n`,{mode:0o700});
 }
 const server=createServer((request,response)=>{if(request.url==='/download'){response.setHeader('Content-Disposition','attachment; filename=managed-private.txt');response.end('private download');return;}response.setHeader('Content-Type','text/html');response.end(`<title>Owned managed browser</title><input aria-label="Typing"><output>${request.headers.cookie??''}</output><script>document.cookie='owned=1';</script>`);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}/`;
 delete process.env.OPEN_COMPUTER_USE_CDP_URL;process.env.OPEN_COMPUTER_USE_BROWSER_EXECUTABLE=executable;
 try{
  for(const Session of [WorkerJavaScriptSession,PersistentJavaScriptSession]){
   const session=new Session({native});let owned;
   try{
    assert.equal(session.browserRuntime.current,undefined,'Startup must stay lazy');
    const invalid=await session.run("await cua.createBrowserTab('cdp','file:///invalid');");assert.equal(invalid.isError,true);assert.equal(session.browserRuntime.current,undefined);
    await run(session,`var tab=await cua.createBrowserTab('cdp',${JSON.stringify(url)},{visible:false});await tab.markHandoff();await tab.clipboard.writeText('shared');var ax=await tab.getAXState({emit:false});var field=ax.match(/\\[(\\d+)\\] textbox "Typing"/)[1];await tab.typeText(field,'native');nodeRepl.write(JSON.stringify(true));`);
    owned=session.browserRuntime.current;assert.ok(owned.proof);assert.equal(owned.proof.browserGone(),false);
    await withConnection(owned.socket,send=>send('Target.createTarget',{url:url+'download',background:true}));
    await until(async()=>{try{return await readFile(path.join(owned.profile,'downloads','managed-private.txt'),'utf8')==='private download';}catch{return false;}},'Default download escaped the private profile');
    const rows=await run(session,'nodeRepl.write(JSON.stringify(await cua.listBrowsers({emit:false})));');assert.equal(rows[0].metadata.managed,true);
    await session.reset();assert.equal(session.browserRuntime.current,owned);
    const value=await run(session,`var tab=await cua.getTab({url:${JSON.stringify(url)}});await tab.reload();await tab.markHandoff();nodeRepl.write(JSON.stringify({clipboard:await tab.clipboard.readText(),cookie:await tab.playwright.locator('output').textContent(),image:(await tab.getScreenshot({emit:false})).length}));`);
    assert.equal(value.clipboard,'shared');assert.equal(value.cookie,'owned=1');assert.ok(value.image>128);
    await session.endTurn();assert.equal(session.browserRuntime.current,owned);assert.equal(gone(owned.pid),false);
    await run(session,`var tab=await cua.getTab({url:${JSON.stringify(url)}});await tab.markHandoff();nodeRepl.write(JSON.stringify(true));`);
    console.log(`${Session.name} PASS lazy private browser, native input/clipboard/cookie/capture, reset and turn survival`);
   }finally{await session.close();if(Session===WorkerJavaScriptSession&&owned){owned.child.kill('SIGKILL');await owned.closed;}await session.browserRuntime.close();}
   assert.equal(gone(owned.pid),true);assert.equal(await missing(owned.profile),true);assert.equal(process.env.OPEN_COMPUTER_USE_CDP_URL,undefined);if(Session===WorkerJavaScriptSession)console.log('PASS verified CDP recovery after guardian loss');
  }
  for(const hold of [false,true]){
   const child=spawn(process.execPath,[fileURLToPath(import.meta.url),'--host-child',...(hold?['--hold']:[])],{env:{...process.env,OPEN_COMPUTER_USE_BROWSER_EXECUTABLE:executable,OCU_MANAGED_FIXTURE_URL:url},stdio:['ignore','pipe','inherit']});const exited=once(child,'exit');exited.catch(()=>{});let owned,output='';
   child.stdout.on('data',chunk=>{output+=chunk.toString();for(const line of output.split('\n')){try{const value=JSON.parse(line);if(value.pid&&value.profile)owned=value;}catch{}}});
   try{await until(()=>owned||child.exitCode!==null,'Managed child did not start');assert.ok(owned,output);if(hold)child.kill('SIGKILL');await exited;await until(async()=>gone(owned.pid)&&await missing(owned.profile),'Guardian did not reclaim private browser/profile');console.log(`PASS managed host ${hold?'SIGKILL':'natural exit'} reclaims browser and profile`);}
   finally{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await exited.catch(()=>{});}
  }
 }finally{
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(scratch,{recursive:true,force:true});
  for(const [key,value] of [['OPEN_COMPUTER_USE_CDP_URL',saved.endpoint],['OPEN_COMPUTER_USE_BROWSER_EXECUTABLE',saved.executable]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}
 }
}
