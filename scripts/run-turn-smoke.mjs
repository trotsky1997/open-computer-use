import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const installed=process.argv.slice(2).find(arg=>!arg.startsWith('--'));
const runtimeURL=name=>installed?pathToFileURL(path.resolve(installed,'scripts',name)):new URL('./node-repl/'+name,import.meta.url);
const {WorkerJavaScriptSession,PersistentJavaScriptSession,JsonLinePeer}=await import(runtimeURL('open-computer-use-repl.mjs'));
const {withConnection}=await import(runtimeURL('browser-cdp.mjs'));
const endpoint=process.env.OPEN_COMPUTER_USE_CDP_URL;
if(!endpoint) throw Error('Set OPEN_COMPUTER_USE_CDP_URL to disposable Chrome');
let allowKernelExit;
const server=createServer((req,res)=>{if(req.url==='/kernel-exit'){allowKernelExit=()=>res.end('exit');return;}res.setHeader('Content-Type','text/html');res.end(`<!doctype html><title>Turn ${req.url}</title><button onclick="window.open('/child')">Popup</button><button onclick="window.open('/grandchild')">Grandchild</button><input aria-label="Typing"><output>[]</output><script>const events=[];for(const type of ['keydown','keyup'])document.addEventListener(type,e=>{events.push({type,key:e.key,shift:e.shiftKey,trusted:e.isTrusted});document.querySelector('output').textContent=JSON.stringify(events)});</script>`);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}/`;
const version=await(await fetch(new URL('/json/version',endpoint))).json();
const browser=operation=>withConnection(version.webSocketDebuggerUrl,operation);
const native={async request(){throw Error('Native unused');}};
const Session=process.argv.includes('--source') ? PersistentJavaScriptSession : WorkerJavaScriptSession;
const session=new Session({native}),other=new Session({native});
const targets=async()=> (await(await fetch(new URL('/json/list',endpoint))).json()).filter(target=>target.type==='page');
const ids=async()=>new Set((await targets()).map(target=>target.id));
async function run(code,target=session){const result=await target.run(code);assert.equal(result.isError,false,JSON.stringify(result.content));return JSON.parse(result.content.at(-1).text);}
async function waitFor(test){const deadline=Date.now()+5000;while(!await test()){assert.ok(Date.now()<deadline,'Turn boundary timeout');await new Promise(resolve=>setTimeout(resolve,10));}}
async function events(id){const target=(await targets()).find(target=>target.id===id);assert.ok(target,'Expected retained tab');return withConnection(target.webSocketDebuggerUrl,async send=>JSON.parse((await send('Runtime.evaluate',{expression:'document.querySelector("output").textContent',returnByValue:true})).result.value));}
let peer;
try {
 const user=(await browser(send=>send('Target.createTarget',{url}))).targetId;
 await run(`var user=await cua.getTab(${JSON.stringify(user)});await user.markDeliverable();nodeRepl.write(JSON.stringify(true));`);
 const temporary=await run(`var temporary=await cua.createBrowserTab('cdp',${JSON.stringify(url)},{visible:false});nodeRepl.write(JSON.stringify(temporary.id));`);
 await run(`await temporary.playwright.getByRole('button',{name:'Popup',exact:true}).click();nodeRepl.write(JSON.stringify(true));`);
 let child;await waitFor(async()=>{child=(await targets()).find(target=>target.url===url+'child');return !!child;});
 await run(`var child=await cua.getTab(${JSON.stringify(child.id)});await child.playwright.getByRole('button',{name:'Grandchild',exact:true}).click();nodeRepl.write(JSON.stringify(true));`);
 let grandchild;await waitFor(async()=>{grandchild=(await targets()).find(target=>target.url===url+'grandchild');return !!grandchild;});
 const delivered=await run(`var delivered=await cua.createBrowserTab('cdp',${JSON.stringify(url)},{visible:false});await delivered.markHandoff();await delivered.markDeliverable();nodeRepl.write(JSON.stringify(delivered.id));`);
 const handoff=await run(`var handoff=await cua.createBrowserTab('cdp',${JSON.stringify(url)},{visible:false});await handoff.markDeliverable();await handoff.markHandoff();nodeRepl.write(JSON.stringify(handoff.id));`);
 const denied=await other.run(`await cua.getTab(${JSON.stringify(handoff)});`);assert.equal(denied.isError,true);assert.match(denied.content.at(-1).text,/another session/);
 await session.reset();assert.ok((await ids()).has(temporary),'js_reset lost logical tab ownership');
 await run(`var handoff=await cua.getTab(${JSON.stringify(handoff)});var delivered=await cua.getTab(${JSON.stringify(delivered)});var sentinel=42;setTimeout(()=>{handoff.pressKey(null,'a').then(()=>{},()=>{});handoff.close().catch(()=>{});},200);nodeRepl.write(JSON.stringify(true));`);
 const idleContext=session.worker ?? session.repl;await session.endTurn();assert.equal(session.worker ?? session.repl,idleContext);
 const live=await ids();for(const id of [temporary,child.id,grandchild.id]) assert.equal(live.has(id),false);
 for(const id of [user,delivered,handoff]) assert.equal(live.has(id),true);
 assert.equal(await run(`await new Promise(resolve=>setTimeout(resolve,300));await handoff.getAXState({emit:false});await delivered.markDeliverable();nodeRepl.write(JSON.stringify(sentinel));`),42);
 assert.equal((await events(handoff)).length,0,'A prior-turn timer emitted input');
 await session.endTurn();assert.equal((await ids()).has(handoff),false);assert.equal((await ids()).has(delivered),true);assert.equal((await ids()).has(user),true);
 for(const phase of ['during','after']){
  const retained=await run(`var retained=await cua.createBrowserTab('cdp',${JSON.stringify(url)},{visible:false});await retained.markHandoff();var lostMarker=17;nodeRepl.write(JSON.stringify(retained.id));`);
  const kernel=session.worker,exited=new Promise(resolve=>kernel.once('exit',resolve));let release,notify;
  const entered=new Promise(resolve=>notify=resolve),holdCleanup=()=>{notify();return new Promise(resolve=>release=resolve);};
  allowKernelExit=undefined;
  try{
   await run(`void fetch(${JSON.stringify(url+'kernel-exit')}).then(()=>process.exit(23));nodeRepl.write(JSON.stringify(true));`);
   await waitFor(()=>allowKernelExit);
   if(phase==='during')native.endSession=holdCleanup;
   const ending=session.endTurn();if(phase==='after'){await ending;native.endSession=holdCleanup;}
   allowKernelExit();await exited;await entered;
   let next,settled=false;
   if(phase==='after'){
    next=run('nodeRepl.write(JSON.stringify(typeof lostMarker));').then(result=>{settled=true;return result;});
    await new Promise(setImmediate);await new Promise(setImmediate);assert.equal(settled,false,'Next turn bypassed cleanup');
   }
   assert.equal(session.worker===kernel,true,'A kernel restarted before cleanup settled');
   release();await ending;native.endSession=undefined;
   assert.equal(await(next??run('nodeRepl.write(JSON.stringify(typeof lostMarker));')),'undefined');
  }finally{allowKernelExit?.();allowKernelExit=undefined;release?.();native.endSession=undefined;}
  assert.equal(await run(`var recovered=await cua.getTab(${JSON.stringify(retained)});await recovered.playwright.getByLabel('Typing').fill('recovered');await recovered.pressKey(null,'a');nodeRepl.write(JSON.stringify(await recovered.playwright.getByLabel('Typing').inputValue()));`),'recovereda');
  assert.ok((await events(retained)).some(event=>event.key==='a'&&event.trusted));
  await run('await recovered.close();nodeRepl.write(JSON.stringify(true));');
  console.log(Session.name+' PASS kernel loss '+phase+' idle turn cleanup, first-call fresh namespace and retained-tab trusted input recovery');
 }
 const background=await run(`var background=await cua.createBrowserTab('cdp',${JSON.stringify(url)},{visible:false});await background.markHandoff();void background.pressKey(null,'shift',{durationMs:30000}).catch(()=>{});nodeRepl.write(JSON.stringify(background.id));`);
 await waitFor(async()=> (await events(background)).some(event=>event.type==='keydown'));
 await session.endTurn();assert.equal((await events(background)).at(-1).shift,false);
 assert.equal(await run(`nodeRepl.write(JSON.stringify(typeof background));`),'undefined','A detached browser action retained its executor');
 if(Session===PersistentJavaScriptSession) {
   const timed=await run(`var timed=await cua.createBrowserTab('cdp',${JSON.stringify(url)},{visible:false});await timed.markHandoff();nodeRepl.write(JSON.stringify(timed.id));`);
   const expired=session.run(`await timed.pressKey(null,'shift',{durationMs:5000});`,1500);
   await waitFor(async()=> (await events(timed)).some(event=>event.type==='keydown'));
   const result=await expired;assert.equal(result.isError,true);assert.match(result.content.at(-1).text,/timed out/);
   assert.equal((await events(timed)).at(-1).shift,false,'Source timeout returned before key release');
 }
 const held=await run(`var held=await cua.createBrowserTab('cdp',${JSON.stringify(url)},{visible:false});await held.markHandoff();var browser=await cua.getBrowser({id:'cdp'});await (await browser.capabilities.get('viewport')).set({width:320,height:240});nodeRepl.write(JSON.stringify(held.id));`);
 const running=session.run(`await held.pressKey(null,'shift',{durationMs:30000});`,60000);
 await waitFor(async()=> (await events(held)).some(event=>event.type==='keydown'));
 const started=Date.now();await session.endTurn();assert.ok(Date.now()-started<5000);assert.equal((await running).isError,true);
 assert.equal((await events(held)).at(-1).shift,false);assert.equal(session.browserViewport.leases.size,0);
 await run(`var held=await cua.getTab(${JSON.stringify(held)});await held.markDeliverable();nodeRepl.write(JSON.stringify(true));`);
 const failure=await run(`var failure=await cua.createBrowserTab('cdp',${JSON.stringify(url)},{visible:false});nodeRepl.write(JSON.stringify(failure.id));`);
 const entry=session.browserTabs.browsers.get(new URL(endpoint).href),send=entry.connection.send;
 entry.connection.send=(method,params,...rest)=>method==='Target.closeTarget' && params.targetId===failure ? Promise.reject(Error('Injected tab close outage')):send(method,params,...rest);
 await assert.rejects(session.endTurn(),/close outage/);assert.equal((await session.run('nodeRepl.write(1)')).isError,true);assert.ok(entry.tabs.has(failure));
 entry.connection.send=send;await session.reset();assert.equal((await ids()).has(failure),false);
 assert.equal(await run('nodeRepl.write(JSON.stringify(true));'),true);
 const source=new PersistentJavaScriptSession({native});let sourceId;
 try {
   sourceId=await run(`var own=await cua.createBrowserTab('cdp',${JSON.stringify(url)},{visible:false});nodeRepl.write(JSON.stringify(own.id));`,source);
   await source.reset();assert.equal((await ids()).has(sourceId),true);
 } finally {await source.close();}
 assert.equal((await ids()).has(sourceId),false);
 peer=new JsonLinePeer({command:process.execPath,args:[fileURLToPath(runtimeURL('open-computer-use-repl.mjs')),'--','/missing-turn-native','mcp']});await peer.initialize();
 let response=await peer.request('tools/call',{name:'js',arguments:{code:`var tab=await cua.createBrowserTab('cdp',${JSON.stringify(url)},{visible:false});await tab.markHandoff();var sentinel=9;nodeRepl.write(JSON.stringify(tab.id));`}});assert.equal(response.isError,false);const mcpId=JSON.parse(response.content.at(-1).text);
 peer.notify('notifications/turn-ended');
 response=await peer.request('tools/call',{name:'js',arguments:{code:'nodeRepl.write(JSON.stringify(sentinel));'}});assert.equal(response.isError,false,JSON.stringify(response));assert.equal(JSON.parse(response.content.at(-1).text),9);
 const pending=peer.request('tools/call',{name:'js',arguments:{code:'await tab.markHandoff();await tab.pressKey(null,"shift",{durationMs:30000});',timeout_ms:60000}});
 await waitFor(async()=> (await events(mcpId)).some(event=>event.type==='keydown'));
 peer.notify('notifications/turn-ended');assert.equal((await pending).isError,true);await peer.request('ping');assert.equal((await events(mcpId)).at(-1).shift,false);
 response=await peer.request('tools/call',{name:'js',arguments:{code:'nodeRepl.write(typeof sentinel);'}});assert.equal(response.content.at(-1).text,'undefined');
 await peer.close();await waitFor(async()=> !(await ids()).has(mcpId));
 console.log(Session.name+' PASS owned tab/popup/grandchild cleanup, user preservation, latest marks, handoff resume, idle JS persistence, stale callbacks, held input/viewport release, close failure/retry, source reset/close and real MCP turn-ended interruption');
} finally {
 if(peer)await peer.close();await Promise.allSettled([session.close(),other.close()]);
 for(const target of await targets()) if(target.url.startsWith(url))await browser(send=>send('Target.closeTarget',{targetId:target.id}));
 server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
}
