// Launches and kills only disposable headless browsers owned by this controller.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {WorkerJavaScriptSession,PersistentJavaScriptSession} from './node-repl/open-computer-use-repl.mjs';
import {withConnection,openConnection} from './node-repl/browser-cdp.mjs';
const executable=path.resolve(process.env.OCU_TEST_CHROME_EXECUTABLE??'');
if(!process.env.OCU_TEST_CHROME_EXECUTABLE)throw Error('Set OCU_TEST_CHROME_EXECUTABLE to owned test Chromium');
const savedEndpoint=process.env.OPEN_COMPUTER_USE_CDP_URL;
const server=createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<input aria-label="Target" oninput="document.body.dataset.edits=Number(document.body.dataset.edits||0)+1">');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}/`;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label){const deadline=Date.now()+10000;while(!await check()){assert.ok(Date.now()<deadline,label);await delay(20);}}
async function run(session,code){const result=await session.run(code,30000);assert.equal(result.isError,false,JSON.stringify(result.content));return JSON.parse(result.content.at(-1).text);}
async function evaluate(socket,expression){return withConnection(socket,async send=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;});}
async function start(portNumber=0){
 const profile=await mkdtemp(path.join(tmpdir(),'ocu-browser-exit-'));
 const child=spawn(executable,['--headless=new','--enable-automation','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--enable-features=WebMCP,CDPScreenshotNewSurface','--remote-debugging-address=127.0.0.1',`--remote-debugging-port=${portNumber}`,`--user-data-dir=${profile}`,...(process.platform==='darwin'?['--use-mock-keychain']:process.platform==='linux'?['--no-sandbox']:[]),'about:blank'],{stdio:['ignore','ignore','inherit']});
 const exited=once(child,'exit');let port;
 try{await until(async()=>{if(child.exitCode!==null||child.signalCode!==null)throw Error('Owned Chrome exited during startup');try{if(portNumber){const version=await(await fetch(`http://127.0.0.1:${portNumber}/json/version`)).json();if(!version.webSocketDebuggerUrl)return false;port=String(portNumber);return true;}port=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];return !!port;}catch{return false;}},'Owned Chrome startup timed out');}
 catch(error){child.kill('SIGKILL');await exited;await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});throw error;}
 return {child,exited,endpoint:`http://127.0.0.1:${port}`,async close(){if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await exited;await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});}};
}
try{
 for(const Session of [WorkerJavaScriptSession,PersistentJavaScriptSession])for(const mode of ['writeText','readText','paste','transport']){
  let chrome=await start(),originalConnect;process.env.OPEN_COMPUTER_USE_CDP_URL=chrome.endpoint;
  const a=new Session({native:{async request(){throw Error('Native app unused');}}});
  try{
   await run(a,`var tab=await cua.createBrowserTab('cdp',${JSON.stringify(url)},{visible:false});await tab.markHandoff();await tab.clipboard.writeText('baseline');nodeRepl.write(JSON.stringify(true));`);
   const manager=a.browserClipboard,owner=a.resourceOwner??a.resourceOwners.get(a.worker),state=manager.owners.get(owner),bridge=[...state.bridges.values()][0];
   assert.ok(bridge.exitProof,'Expected verified original local browser identity');assert.equal(bridge.exitProof.browserGone(),false);
   const targets=await(await fetch(new URL('/json/list',chrome.endpoint))).json(),socket=targets.find(t=>t.id===bridge.targetId).webSocketDebuggerUrl;
   const name=mode==='paste'?'write':mode==='readText'?'readText':'writeText';
   await evaluate(socket,`(()=>{const original=navigator.clipboard.${name}.bind(navigator.clipboard);navigator.clipboard.${name}=async(...args)=>{globalThis.__clipboardEntered=true;await new Promise(()=>{});return original(...args);};return true;})()`);
   if(mode==='transport'){
    originalConnect=manager.connect;let injected=false;
    manager.connect=async(ws,operation)=>{
     if(ws!==socket)return originalConnect(ws,operation);
     const connection=await openConnection(ws);
     try{return await operation(async(method,params,...rest)=>{
      if(method==='Runtime.evaluate'&&params.expression?.includes('async function clipboardOperation(')&&!injected){
       injected=true;const pending=connection.send(method,params,...rest);pending.catch(()=>{});
       await until(()=>evaluate(socket,'!!globalThis.__clipboardEntered'),'Native job did not enter');connection.close();throw Error('Injected live transport loss');
      }
      return connection.send(method,params,...rest);
     });}finally{connection.close();}
    };
   }
   const code=mode==='paste'?`var ax=await tab.getAXState({emit:false});var field=ax.match(/\\[(\\d+)\\] textbox "Target"/)[1];await tab.paste(field,'pending');`:mode==='readText'?'await tab.clipboard.readText();':"await tab.clipboard.writeText('pending');";
   const running=a.run(code,30000);
   await until(()=>evaluate(socket,'!!globalThis.__clipboardEntered'),'Native clipboard API did not enter');
   if(mode==='transport'){
    const result=await running;assert.equal(result.isError,true);assert.throws(()=>manager.assertSettled(),/completion unresolved/);
    await assert.rejects(a.reset(),/completion unresolved|cleanup|failed/i);assert.equal(manager.owners.has(owner),true);assert.equal(bridge.jobs.size,1);
    manager.connect=originalConnect;originalConnect=undefined;
   }
   const oldPort=new URL(chrome.endpoint).port;
   chrome.child.kill('SIGKILL');await chrome.exited;assert.equal(bridge.exitProof.browserGone(),true);
   const result=await running;assert.equal(result.isError,true,JSON.stringify(result.content));
   await chrome.close();chrome=await start(mode==='readText'?0:Number(oldPort));process.env.OPEN_COMPUTER_USE_CDP_URL=chrome.endpoint;
   let cleanupConnections=0;originalConnect=manager.connect;manager.connect=(...args)=>{cleanupConnections++;return originalConnect(...args);};
   await a.reset();manager.connect=originalConnect;originalConnect=undefined;
   assert.equal(cleanupConnections,0,'Dead clipboard cleanup contacted a replacement browser');assert.equal(manager.owners.has(owner),false);assert.equal(bridge.jobs.size,0);manager.assertSettled();
   assert.equal(a.browserInputs.leases.size,0);assert.equal([...a.browserFocusLeases.entries.values()].some(entry=>entry.owner===owner),false);
   await run(a,`var tab=await cua.createBrowserTab('cdp',${JSON.stringify(url)},{visible:false});await tab.markHandoff();await tab.clipboard.writeText('fresh');nodeRepl.write(JSON.stringify(true));`);
   assert.equal(await run(a,'nodeRepl.write(JSON.stringify(await tab.clipboard.readText()));'),'fresh');
   await run(a,`var ax=await tab.getAXState({emit:false});var field=ax.match(/\\[(\\d+)\\] textbox "Target"/)[1];await tab.paste(field,'recovered');nodeRepl.write(JSON.stringify(true));`);
   assert.deepEqual(await run(a,'nodeRepl.write(JSON.stringify({value:await tab.playwright.getByLabel("Target").inputValue(),edits:Number(await tab.playwright.locator("body").getAttribute("data-edits"))}));'),{value:'recovered',edits:1});
   console.log(`${Session.name} PASS clipboard ${mode} original-process exit, no replacement cleanup writes and fresh clipboard/input recovery`);
  }finally{if(originalConnect)a.browserClipboard.connect=originalConnect;try{await a.close();}finally{await chrome.close();}}
 }
}finally{if(savedEndpoint===undefined)delete process.env.OPEN_COMPUTER_USE_CDP_URL;else process.env.OPEN_COMPUTER_USE_CDP_URL=savedEndpoint;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
