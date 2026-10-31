// Owns every browser/profile it launches; never uses a normal browser profile.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {WorkerJavaScriptSession,PersistentJavaScriptSession} from './node-repl/open-computer-use-repl.mjs';
const executable=path.resolve(process.env.OCU_TEST_CHROME_EXECUTABLE??'');
if(!process.env.OCU_TEST_CHROME_EXECUTABLE)throw Error('Set OCU_TEST_CHROME_EXECUTABLE to owned test Chromium');
const savedEndpoint=process.env.OPEN_COMPUTER_USE_CDP_URL;
const server=createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<style>button{position:fixed;left:20px;top:40px;width:300px;height:100px}input{position:fixed;left:20px;top:180px}</style><button onclick="document.body.dataset.clicks=Number(document.body.dataset.clicks||0)+1">Target</button><input aria-label="Typing" oninput="document.body.dataset.edits=Number(document.body.dataset.edits||0)+1"><output>[]</output><script>const events=[];for(const type of ["mousedown","mouseup","mousemove","keydown","keyup","input"])document.addEventListener(type,event=>{events.push({type:event.type,buttons:event.buttons,key:event.key,trusted:event.isTrusted});document.querySelector("output").textContent=JSON.stringify(events);});</script>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}/`;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label){const deadline=Date.now()+10000;while(!await check()){assert.ok(Date.now()<deadline,label);await delay(20);}}
async function run(session,code){const result=await session.run(code,30000);assert.equal(result.isError,false,JSON.stringify(result.content));return JSON.parse(result.content.at(-1).text);}
const setup=`var tab=await cua.createBrowserTab('cdp',${JSON.stringify(url)},{visible:false});await tab.markHandoff();var ax=await tab.getAXState({emit:false});var button=ax.match(/\\[(\\d+)\\] button "Target"/)[1];var field=ax.match(/\\[(\\d+)\\] textbox "Typing"/)[1];nodeRepl.write(JSON.stringify(true));`;
async function start(portNumber=0){
 const profile=await mkdtemp(path.join(tmpdir(),'ocu-browser-exit-'));
 const child=spawn(executable,['--headless=new','--enable-automation','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--enable-features=WebMCP,CDPScreenshotNewSurface','--remote-debugging-address=127.0.0.1',`--remote-debugging-port=${portNumber}`,`--user-data-dir=${profile}`,...(process.platform==='darwin'?['--use-mock-keychain']:process.platform==='linux'?['--no-sandbox']:[]),'about:blank'],{stdio:['ignore','ignore','inherit']});
 const exited=once(child,'exit');let port;
 try{await until(async()=>{if(child.exitCode!==null||child.signalCode!==null)throw Error('Owned Chrome exited during startup');try{if(portNumber){const version=await(await fetch(`http://127.0.0.1:${portNumber}/json/version`)).json();if(!version.webSocketDebuggerUrl)return false;port=String(portNumber);return true;}port=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];return !!port;}catch{return false;}},'Owned Chrome startup timed out');}
 catch(error){child.kill('SIGKILL');await exited;await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});throw error;}
 return {child,exited,endpoint:`http://127.0.0.1:${port}`,async close(){if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await exited;await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});}};
}
try{
 for(const Session of [WorkerJavaScriptSession,PersistentJavaScriptSession])for(const action of ['click','drag','key','text'])for(const phase of ['offline','replacement']){
  let chrome=await start(),release,failed=true;process.env.OPEN_COMPUTER_USE_CDP_URL=chrome.endpoint;
  const session=new Session({native:{async request(){throw Error('Native app unused');}}}),input=session.browserInputs,focus=session.browserFocusLeases;
  const originalOpen=input.open,originalJson=input.json,originalFocus=focus.updateFocus;let entered=false,queries=0,focusUpdates=0,checkCleanup=false,disposals=0;
  try{
   await run(session,setup+(action==='drag'?'var image=await tab.getScreenshot({emit:false});var scale=image.readUInt32BE(16)/(await tab.playwright.evaluate(()=>document.documentElement.clientWidth));var from=[50*scale,80*scale],to=[250*scale,80*scale];':''));
   input.json=async(...args)=>{if(checkCleanup)queries++;return originalJson.apply(input,args);};
   focus.updateFocus=(target,enabled,register)=>{if(checkCleanup)focusUpdates++;return originalFocus(target,enabled,dispose=>register?.(()=>{disposals++;dispose();}));};
   input.open=async(...args)=>{
    const connection=await originalOpen(...args),send=connection.send;
    connection.send=async(method,params,...rest)=>{
     const result=await send(method,params,...rest);
     const match=action==='click'?method==='Input.dispatchMouseEvent'&&params.type==='mousePressed':action==='drag'?method==='Input.dispatchMouseEvent'&&params.type==='mouseMoved'&&params.buttons===1:action==='key'?method==='Input.dispatchKeyEvent'&&params.type==='keyDown'&&params.key==='A':method==='Input.insertText';
     if(match&&!entered){entered=true;await new Promise(resolve=>{release=resolve;});}
     return result;
    };return connection;
   };
   const code=action==='click'?"await tab.click(button,{key:'shift'});":action==='drag'?'await tab.drag(from,to);':action==='key'?"await tab.pressKey(field,'shift+a');":"await tab.typeText(field,'accepted');";
   const running=session.run(code,30000);running.catch(()=>{});await until(()=>entered,'Native input did not reach held stage');
   const record=[...input.leases.values()][0];assert.ok(record);assert.ok(record.mouse||record.keys.length||action==='text');
   const oldPort=new URL(chrome.endpoint).port;
   chrome.child.kill('SIGKILL');await chrome.exited;checkCleanup=true;release();
   const result=await running;assert.equal(result.isError,true,JSON.stringify(result.content));
   if(phase==='offline')await session.reset();
   await chrome.close();chrome=await start(Number(oldPort));process.env.OPEN_COMPUTER_USE_CDP_URL=chrome.endpoint;
   if(phase==='replacement')await session.reset();
   assert.equal(queries,0,'Dead input cleanup queried CDP');assert.equal(focusUpdates,0,'Dead focus cleanup contacted a browser');assert.equal(disposals,1,'Dead native focus connection was not disposed');
   assert.equal(input.leases.size,0);assert.equal(focus.entries.size,0);checkCleanup=false;input.open=originalOpen;
   await run(session,setup+(action==='drag'?'var image=await tab.getScreenshot({emit:false});var scale=image.readUInt32BE(16)/(await tab.playwright.evaluate(()=>document.documentElement.clientWidth));var from=[50*scale,80*scale],to=[250*scale,80*scale];':''));await run(session,code+'nodeRepl.write(JSON.stringify(true));');
   const final=await run(session,'nodeRepl.write(JSON.stringify(await tab.playwright.evaluate(()=>({events:JSON.parse(document.querySelector("output").textContent),clicks:Number(document.body.dataset.clicks||0),edits:Number(document.body.dataset.edits||0),value:document.querySelector("input").value}))));');
   assert.ok(final.events.every(event=>event.trusted));
   if(action==='click'){assert.equal(final.clicks,1);assert.equal(final.events.filter(e=>e.type==='mousedown').length,1);assert.equal(final.events.filter(e=>e.type==='mouseup').length,1);}
   if(action==='drag'){assert.equal(final.events.filter(e=>e.type==='mousedown').length,1);assert.equal(final.events.filter(e=>e.type==='mouseup').length,1);assert.equal(final.events.filter(e=>e.type==='mousemove'&&e.buttons===1).length,12);}
   if(action==='key'){assert.equal(final.value,'A');assert.equal(final.edits,1);assert.deepEqual(final.events.filter(e=>e.type==='keydown').map(e=>e.key),['Shift','A']);assert.deepEqual(final.events.filter(e=>e.type==='keyup').map(e=>e.key),['A','Shift']);}
   if(action==='text'){assert.equal(final.value,'accepted');assert.equal(final.edits,1);}
   assert.equal(input.leases.size,0);assert.equal(focus.entries.size,0);
   console.log(`${Session.name} PASS ${action} ${phase} original-browser exit, no dead/replacement cleanup RPC and fresh trusted input`);failed=false;
  }finally{release?.();input.open=originalOpen;input.json=originalJson;focus.updateFocus=originalFocus;try{if(failed)await session.close().catch(()=>{});else await session.close();}finally{await chrome.close();}}
 }
}finally{if(savedEndpoint===undefined)delete process.env.OPEN_COMPUTER_USE_CDP_URL;else process.env.OPEN_COMPUTER_USE_CDP_URL=savedEndpoint;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
