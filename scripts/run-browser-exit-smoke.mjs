// Launches and kills only disposable Chrome processes owned by this controller.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {WorkerJavaScriptSession,PersistentJavaScriptSession} from './node-repl/open-computer-use-repl.mjs';
const configuredExecutable=process.env.OCU_TEST_CHROME_EXECUTABLE;if(!configuredExecutable)throw Error('Set OCU_TEST_CHROME_EXECUTABLE to Chrome 158+');const executable=path.resolve(configuredExecutable);
const savedEndpoint=process.env.OPEN_COMPUTER_USE_CDP_URL;
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(`<title>Browser exit fixture</title><p>Owned fixture</p>${req.url.startsWith('/child')?'':`<iframe src="http://localhost:${server.address().port}/child" allow="tools"></iframe>`}<script>globalThis.ready=(async()=>{await document.modelContext.registerTool({name:'echo',description:'Owned echo',inputSchema:{type:'object'},execute:()=> 'recovered'});await document.modelContext.registerTool({name:'wait',description:'Owned cancelable wait',inputSchema:{type:'object'},execute:async(_input,{signal})=>{document.body.dataset.started=String(Number(document.body.dataset.started??0)+1);await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{document.body.dataset.aborted='yes';reject(Error('Stopped'));},{once:true}));}});})();</script>`);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}/`;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label){const deadline=Date.now()+5000;while(!await check()){assert.ok(Date.now()<deadline,label);await delay(20);}}
async function start(){
 const profile=await mkdtemp(path.join(tmpdir(),'ocu-browser-exit-'));
 const child=spawn(executable,['--headless=new','--enable-automation','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--enable-features=WebMCP','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',`--user-data-dir=${profile}`,...(process.platform==='darwin'?['--use-mock-keychain']:process.platform==='linux'?['--no-sandbox']:[]),'about:blank'],{stdio:['ignore','ignore','inherit']});
 const exited=once(child,'exit');let port;
 try{await until(async()=>{if(child.exitCode!==null||child.signalCode!==null)throw Error('Owned Chrome exited during startup');try{port=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];return !!port;}catch{return false;}},'Owned Chrome startup timed out');}
 catch(error){child.kill('SIGKILL');await exited;await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});throw error;}
 return {child,exited,endpoint:`http://127.0.0.1:${port}`,async close(){if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await exited;await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});}};
}
async function run(session,code,timeout=10000){const result=await session.run(code,timeout);assert.equal(result.isError,false,result.content.at(-1)?.text);return JSON.parse(result.content.at(-1).text);}
function listing(text){const prefix='WebMCP tools available in this document:\n',start=text.indexOf(prefix),end=text.indexOf('\nCall tools.call',start);return JSON.parse(text.slice(start+prefix.length,end));}
try{
 for(const Session of [WorkerJavaScriptSession,PersistentJavaScriptSession])for(const mode of ['read','read-oop','tool','oop','transport']){
  let chrome=await start();process.env.OPEN_COMPUTER_USE_CDP_URL=chrome.endpoint;
  const session=new Session({native:{async request(){throw Error('Native unused');}}});
  try{
   await run(session,`var tab=await cua.createBrowserTab('cdp',${JSON.stringify(url)},{visible:false});await tab.markHandoff();await tab.playwright.waitForURL(${JSON.stringify(url)});var kept=41;nodeRepl.write(JSON.stringify(true));`);
   if(mode.startsWith('read')){
    let firstRead;const read=new Promise(resolve=>{firstRead=resolve;}),perform=session.browserEvaluator.perform;
    session.browserEvaluator.perform=function(record,args){const add=record.reads.add.bind(record.reads);record.reads.add=job=>{job.then(firstRead,()=>{});return add(job);};return perform.call(this,record,args);};
    const reader=mode==='read-oop'?"tab.playwright.frameLocator('iframe').locator('body')":'tab.playwright';
    try{await run(session,`var pending=${reader}.evaluate(()=>{document.body.textContent;return new Promise(()=>{});},undefined,{timeoutMs:0}).catch(error=>error.message);nodeRepl.write(JSON.stringify(true));`);
    let timer;try{await Promise.race([read,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Native DOM read did not finish')),5000);})]);}finally{clearTimeout(timer);}}finally{session.browserEvaluator.perform=perform;}
   }else{
    const tools=listing(await run(session,`var cap=await tab.capabilities.get('webmcp');var tools=await cap.fetchTools();nodeRepl.write(JSON.stringify(tools.description()));`)),waiting=tools.find(tool=>tool.name.startsWith('wait__')&&tool.origin.startsWith(mode==='oop'?'http://localhost:':'http://127.0.0.1:'));assert.ok(waiting);assert.ok([...session.browserWebMcp.owners.values()].some(state=>[...state.collections.values()].some(entry=>entry.exitProof)),'Expected verified local process snapshot');
    await run(session,`var pending=tools.call(${JSON.stringify(waiting.name)},{}).catch(error=>error.message);nodeRepl.write(JSON.stringify(true));`);
    const reader=mode==='oop'?"tab.playwright.frameLocator('iframe').locator('body')":'tab.playwright';
    await until(async()=>await run(session,`nodeRepl.write(JSON.stringify(await ${reader}.evaluate(()=>document.body.dataset.started==='1')));`),'Native tool did not start');
   }
   if(mode==='transport'){
    const state=[...session.browserWebMcp.owners.values()].find(state=>state.active.size),entry=[...state.collections.values()].find(entry=>entry.tools.size);assert.ok(entry.exitProof,'Expected verified local browser identity');
    await entry.connection.close();assert.match(await run(session,'nodeRepl.write(JSON.stringify(await pending));',20000),/connection|closed|ended/iu);
    assert.equal(entry.exitProof.processesGone(),false);assert.equal(state.active.size,1);assert.equal(await run(session,`nodeRepl.write(JSON.stringify(await tab.playwright.evaluate(()=>document.body.dataset.aborted!=='yes')));`),true);
    const [owner]=[...session.browserWebMcp.owners].find(([,current])=>current===state);await assert.rejects(session.browserWebMcp.cleanup(owner));assert.equal(session.browserWebMcp.owners.get(owner),state);
   }
   chrome.child.kill('SIGKILL');await chrome.exited;
   const failure=await run(session,'nodeRepl.write(JSON.stringify(await pending));');assert.match(failure,/closed|disconnected|crash|ended|exited|connection failed/iu);
   if(mode==='tool'||mode==='oop'){assert.match(failure,/browser process exited/);assert.equal([...session.browserWebMcp.owners.values()].reduce((count,state)=>count+state.active.size,0),0);}
   assert.equal(await run(session,'nodeRepl.write(JSON.stringify(kept));'),41);
   await chrome.close();chrome=await start();process.env.OPEN_COMPUTER_USE_CDP_URL=chrome.endpoint;
   await session.reset();assert.equal(session.browserWebMcp.owners.size,0);assert.equal(session.browserEvaluator.owners.size,0);
   assert.deepEqual(await run(session,`var tab=await cua.createBrowserTab('cdp',${JSON.stringify(url)},{visible:false});await tab.playwright.waitForURL(${JSON.stringify(url)});nodeRepl.write(JSON.stringify(await tab.playwright.evaluate(()=>({title:document.title,started:document.body.dataset.started??null}))));`),{title:'Browser exit fixture',started:null});
   assert.equal(await run(session,`nodeRepl.write(JSON.stringify(await tab.playwright.frameLocator('iframe').locator('body').evaluate(node=>node.dataset.started??null)));`),null);
   const fresh=listing(await run(session,`var cap=await tab.capabilities.get('webmcp');var fresh=await cap.fetchTools();nodeRepl.write(JSON.stringify(fresh.description()));`)),echo=fresh.find(tool=>tool.name.startsWith('echo__'));assert.ok(echo);assert.equal(await run(session,`nodeRepl.write(JSON.stringify(await fresh.call(${JSON.stringify(echo.name)},{})));`),'recovered');
   console.log(`${Session.name} PASS ${mode} browser loss, bounded failure, binding survival, reset cleanup and fresh-browser read/tool recovery`);
  }finally{try{await session.close();}finally{await chrome.close();}}
 }
}finally{if(savedEndpoint===undefined)delete process.env.OPEN_COMPUTER_USE_CDP_URL;else process.env.OPEN_COMPUTER_USE_CDP_URL=savedEndpoint;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
