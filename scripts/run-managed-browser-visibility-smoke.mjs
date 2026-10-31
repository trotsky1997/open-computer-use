// Owns the X server, window manager, browsers and fixture pages; requires Linux Xvfb/Openbox/xprop/xwininfo.
import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {once} from 'node:events';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,rm,access} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {withConnection} from './node-repl/browser-cdp.mjs';
const runtime=await import(process.argv[2]?pathToFileURL(path.join(process.argv[2],'scripts/open-computer-use-repl.mjs')).href:'./node-repl/open-computer-use-repl.mjs');
if(process.platform!=='linux')throw Error('This owned native-window fixture requires Linux');
const binary=process.env.OCU_TEST_CHROME_EXECUTABLE;if(!binary)throw Error('Set OCU_TEST_CHROME_EXECUTABLE');
const scratch=await mkdtemp(path.join(tmpdir(),'ocu-visibility-')),saved={...process.env};let display,wm,server;
const execute=promisify(execFile),pause=()=>new Promise(resolve=>setTimeout(resolve,20));
async function until(check,label){const deadline=Date.now()+15000;for(;;){if(await check())return;assert.ok(Date.now()<deadline,label);await pause();}}
async function run(session,code){const result=await session.run(code,30000);assert.equal(result.isError,false,result.content.at(-1)?.text);return JSON.parse(result.content.at(-1).text);}
async function stop(child){if(child?.pid&&child.exitCode===null&&child.signalCode===null){const exited=once(child,'exit');child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),3000);try{await exited;}finally{clearTimeout(timer);}}}
async function nativeWindows(pid){
 const {stdout}=await execute('xprop',['-root','_NET_CLIENT_LIST']);const result=[];
 for(const id of stdout.match(/0x[\da-f]+/giu)??[]){
  const owner=await execute('xprop',['-id',id,'_NET_WM_PID']);if(!owner.stdout.trim().endsWith('= '+pid))continue;
  const info=await execute('xwininfo',['-id',id]);result.push({id,visible:/Map State: IsViewable/u.test(info.stdout)});
 }return result;
}
try{
 display=spawn('Xvfb',['-displayfd','3','-screen','0','1280x800x24','-nolisten','tcp','-noreset'],{stdio:['ignore','ignore','inherit','pipe']});
 let number='';display.stdio[3].on('data',chunk=>{number+=chunk;});await until(()=>/^\d+\s*$/u.test(number),'Owned X display did not start');process.env.DISPLAY=':'+number.trim();
 wm=spawn('openbox',[],{env:process.env,stdio:['ignore','ignore','ignore']});
 await until(async()=>{try{return /0x[1-9a-f][\da-f]*/iu.test((await execute('xprop',['-root','_NET_SUPPORTING_WM_CHECK'])).stdout);}catch{return false;}},'Owned window manager did not start');
 const executable=path.join(scratch,'owned-chrome'),quoted="'"+path.resolve(binary).replaceAll("'","'\\''")+"'";
 await writeFile(executable,`#!/bin/sh\nexec ${quoted} --no-sandbox "$@"\n`,{mode:0o700});
 process.env.OPEN_COMPUTER_USE_BROWSER_EXECUTABLE=executable;process.env.OPEN_COMPUTER_USE_BROWSER_MODE='headful';delete process.env.OPEN_COMPUTER_USE_CDP_URL;
 server=createServer((_request,response)=>{response.setHeader('Content-Type','text/html');response.end('<title>Owned visibility fixture</title><label>Value<input></label>');});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}/`;
 for(const Session of [runtime.WorkerJavaScriptSession,runtime.PersistentJavaScriptSession]){
  const session=new Session({native:{async request(){throw Error('Desktop runtime must remain unused');}}});let owned;
  try{
   assert.equal(await run(session,"var browser=await cua.getBrowser({id:'cdp'});var visibility=await browser.capabilities.get('visibility');nodeRepl.write(JSON.stringify(await visibility.get()));"),false);
   owned=session.browserRuntime.current;assert.equal(owned.headless,false);
   await until(async()=>{const windows=await nativeWindows(owned.pid);return windows.length>0&&windows.every(window=>!window.visible);},'Headful startup unexpectedly presented a window');
   const id=await run(session,`var tab=await cua.createBrowserTab('cdp',${JSON.stringify(url)},{visible:true});await tab.playwright.getByLabel('Value').click();await tab.typeText(null,'preserved');await tab.markHandoff();nodeRepl.write(JSON.stringify(tab.id));`);
   assert.equal(await run(session,'nodeRepl.write(JSON.stringify(await visibility.get()));'),true);
   await until(async()=>{const windows=await nativeWindows(owned.pid);return windows.some(window=>window.visible);},'Presentation did not map a native window');
   await withConnection(owned.socket,send=>send('Target.createTarget',{url:url+'second',newWindow:true}));
   await until(async()=>(await nativeWindows(owned.pid)).length===2,'Second native window missing');
   await run(session,'await visibility.set(false);nodeRepl.write(JSON.stringify(await visibility.get()));');
   await until(async()=>{const windows=await nativeWindows(owned.pid);return windows.length===2&&windows.every(window=>!window.visible);},'Hide did not minimize both owned windows');
   assert.equal(await run(session,"var rejected=false;try{await visibility.set('true');}catch{rejected=true;}nodeRepl.write(JSON.stringify(rejected));"),true);
   assert.equal(await run(session,`var background=await cua.createBrowserTab('cdp',${JSON.stringify(url+'background')},{visible:false});nodeRepl.write(JSON.stringify(await visibility.get()));`),false);
   await until(async()=>{const windows=await nativeWindows(owned.pid);return windows.length===2&&windows.every(window=>!window.visible);},'Background tab unexpectedly presented a window');
   await session.reset();assert.equal(session.browserRuntime.current,owned);
   assert.equal(await run(session,"var browser=await cua.getBrowser({id:'cdp'});var visibility=await browser.capabilities.get('visibility');nodeRepl.write(JSON.stringify(await visibility.get()));"),false);
   assert.equal(await run(session,'await visibility.set(true);nodeRepl.write(JSON.stringify(await visibility.get()));'),true);
   await until(async()=>{const windows=await nativeWindows(owned.pid);return windows.length===2&&windows.every(window=>window.visible);},'Restore did not present both native windows');
   assert.equal(await run(session,`var tab=await cua.getTab(${JSON.stringify(id)});await tab.markHandoff();nodeRepl.write(JSON.stringify(await tab.playwright.getByLabel('Value').inputValue()));`),'preserved');
   await session.endTurn();assert.equal(session.browserRuntime.current,owned);
   assert.equal(await run(session,'nodeRepl.write(JSON.stringify(await visibility.get()));'),true);
   console.log(`${Session.name} PASS owned headful startup, native multi-window presentation/hide, native input, reset/turn state and validation`);
  }finally{await session.close();if(Session===runtime.WorkerJavaScriptSession&&owned){owned.child.kill('SIGKILL');await owned.closed;}await session.browserRuntime.close();}
  await assert.rejects(access(owned.profile),/ENOENT/);
 }
 const entry=process.argv[2]?path.join(process.argv[2],'scripts/open-computer-use-repl.mjs'):fileURLToPath(new URL('./node-repl/open-computer-use-repl.mjs',import.meta.url));
 const peer=new runtime.JsonLinePeer({command:process.execPath,args:[entry,'--',path.join(scratch,'native-unused'),'mcp'],env:process.env});let mcpBrowser;
 try{
  await peer.initialize();
  const result=await peer.request('tools/call',{name:'js',arguments:{code:`var browser=await cua.getBrowser({id:'cdp'});var visibility=await browser.capabilities.get('visibility');var tab=await cua.createBrowserTab('cdp',${JSON.stringify(url+'mcp')},{visible:true});await tab.markHandoff();nodeRepl.write(JSON.stringify({endpoint:process.env.OPEN_COMPUTER_USE_CDP_URL,visible:await visibility.get()}));`}});
  assert.equal(result.isError,false,result.content.at(-1)?.text);const value=JSON.parse(result.content.at(-1).text);assert.equal(value.visible,true);
  const {webSocketDebuggerUrl}=await(await fetch(new URL('/json/version',value.endpoint))).json();
  mcpBrowser=await withConnection(webSocketDebuggerUrl,async send=>{const {arguments:args}=await send('Browser.getBrowserCommandLine'),{processInfo}=await send('SystemInfo.getProcessInfo');return {pid:processInfo.find(info=>info.type==='browser').id,profile:args.find(arg=>arg.startsWith('--user-data-dir=')).slice('--user-data-dir='.length)};});
  await until(async()=>(await nativeWindows(mcpBrowser.pid)).some(window=>window.visible),'MCP presentation did not map a native window');
  const hidden=await peer.request('tools/call',{name:'js',arguments:{code:'await visibility.set(false);nodeRepl.write(JSON.stringify(await visibility.get()));'}});assert.equal(hidden.isError,false);assert.equal(JSON.parse(hidden.content.at(-1).text),false);
  await peer.request('tools/call',{name:'js_reset',arguments:{}});
  const retained=await peer.request('tools/call',{name:'js',arguments:{code:"var browser=await cua.getBrowser({id:'cdp'});var visibility=await browser.capabilities.get('visibility');nodeRepl.write(JSON.stringify(await visibility.get()));"}});assert.equal(retained.isError,false);assert.equal(JSON.parse(retained.content.at(-1).text),false);
 }finally{await peer.close();}
 await until(async()=>{try{process.kill(mcpBrowser.pid,0);return false;}catch(error){if(error.code!=='ESRCH')throw error;}try{await access(mcpBrowser.profile);return false;}catch(error){if(error.code==='ENOENT')return true;throw error;}},'MCP headful browser/profile survived shutdown');
 console.log('PASS headful MCP presentation, hidden reset retention and browser/profile shutdown');
 if(!process.argv[2])for(const kill of [false,true]){
  const child=spawn(process.execPath,[fileURLToPath(new URL('./run-managed-browser-smoke.mjs',import.meta.url)),'--host-child',...(kill?['--hold']:[])],{env:{...process.env,OCU_MANAGED_FIXTURE_URL:url},stdio:['ignore','pipe','inherit']});
  const exited=once(child,'exit');exited.catch(()=>{});let output='';child.stdout.on('data',chunk=>{output+=chunk;});
  try{
  let owned;await until(()=>{try{owned=JSON.parse(output.trim());return typeof owned.pid==='number';}catch{return false;}},'Headful child host did not become ready');
  if(kill)child.kill('SIGKILL');await exited;
  await until(async()=>{try{process.kill(owned.pid,0);return false;}catch(error){if(error.code!=='ESRCH')throw error;}try{await access(owned.profile);return false;}catch(error){if(error.code==='ENOENT')return true;throw error;}},'Headful browser/profile survived host exit');
  console.log(`PASS headful host ${kill?'SIGKILL':'natural exit'} reclaims browser and profile`);
  }finally{await stop(child);await exited.catch(()=>{});}
 }
}finally{
 if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 await stop(wm);await stop(display);await rm(scratch,{recursive:true,force:true});
 for(const key of ['DISPLAY','OPEN_COMPUTER_USE_BROWSER_EXECUTABLE','OPEN_COMPUTER_USE_BROWSER_MODE','OPEN_COMPUTER_USE_CDP_URL']){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}
}
