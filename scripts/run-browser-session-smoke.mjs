import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {WorkerJavaScriptSession,PersistentJavaScriptSession} from './node-repl/open-computer-use-repl.mjs';
import {withConnection,openConnection} from './node-repl/browser-cdp.mjs';
const endpoint=process.env.OPEN_COMPUTER_USE_CDP_URL,missing=process.argv.includes('--missing-extension');
if(!endpoint)throw Error('Set OPEN_COMPUTER_USE_CDP_URL to disposable Chromium with the bundled selection extension');
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(`<title>${req.url==='/second'?'second':'first'}</title><input aria-label="Name">`);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}/`;
const version=await(await fetch(new URL('/json/version',endpoint))).json();
const native={async request(){throw Error('native unused');}};
async function run(session,code){const result=await session.run(code,30000);assert.equal(result.isError,false,result.content.at(-1).text);return JSON.parse(result.content.at(-1).text);}
async function activate(id){await withConnection(version.webSocketDebuggerUrl,send=>send('Target.activateTarget',{targetId:id}));}
try {
 for(const Session of [WorkerJavaScriptSession,PersistentJavaScriptSession]) {
  const session=new Session({native}),other=new Session({native});let first,second;
  try {
   first=await run(session,`var browser=await cua.getBrowser({id:'cdp'});await browser.nameSession('🔎 session test');var tab=await browser.tabs.new();await tab.goto(${JSON.stringify(url)});await tab.playwright.waitForURL(${JSON.stringify(url)});await tab.markHandoff();nodeRepl.write(JSON.stringify(tab.id));`);
   second=await run(session,`var second=await cua.createBrowserTab('cdp',${JSON.stringify(url+'second')},{visible:false,sessionName:'🔎 named creation'});await second.playwright.waitForURL(${JSON.stringify(url+'second')});await second.markHandoff();nodeRepl.write(JSON.stringify(second.id));`);
   assert.equal(await run(session,`nodeRepl.write(JSON.stringify((await cua.listBrowsers({emit:false}))[0].metadata.sessionName));`),'🔎 named creation');
   assert.equal(await run(other,`nodeRepl.write(JSON.stringify((await cua.listBrowsers({emit:false}))[0].metadata?.sessionName??null));`),null);
   assert.deepEqual(await run(session,`var rebound=await browser.tabs.get(tab.id);nodeRepl.write(JSON.stringify({title:await rebound.title(),url:await rebound.url()}));`),{title:'first',url});
   assert.deepEqual(await run(session,`await tab.goto(${JSON.stringify(url+'second')});await tab.playwright.waitForURL(${JSON.stringify(url+'second')});nodeRepl.write(JSON.stringify({title:await rebound.title(),url:await rebound.url()}));`),{title:'second',url:url+'second'});
   await activate(first);
   const before=(await(await fetch(new URL('/json/list',endpoint))).json()).filter(tab=>tab.type==='page').map(tab=>tab.id).sort();
   if(missing){
    const failed=await session.run(`await browser.tabs.selected();`);assert.equal(failed.isError,true);assert.match(failed.content.at(-1).text,/bundled Chrome selection extension|identity/u);
    assert.deepEqual((await(await fetch(new URL('/json/list',endpoint))).json()).filter(tab=>tab.type==='page').map(tab=>tab.id).sort(),before);
   }else{
    await run(session,`var viewport=await browser.capabilities.get('viewport');await viewport.set({width:600,height:500});nodeRepl.write(JSON.stringify(true));`);
    assert.equal(await run(session,`nodeRepl.write(JSON.stringify((await browser.tabs.selected())?.id));`),first);
    assert.deepEqual(await run(session,`nodeRepl.write(JSON.stringify((await browser.tabs.list()).map(tab=>tab.id).sort()));`),before);
    const hidden=session.browserSelection.hidden().ids;assert.equal(hidden.length,1);
    assert.equal(session.browserViewport.leases.get(new URL(endpoint).href).targets.has(hidden[0]),false);
    assert.ok(!(await run(session,`nodeRepl.write(JSON.stringify((await cua.getState({emit:false})).browsers[0].tabs.map(tab=>tab.id)));`)).includes(hidden[0]));
    const page=(await(await fetch(new URL('/json/list',endpoint))).json()).find(tab=>tab.id===second);
    await withConnection(page.webSocketDebuggerUrl,async send=>{
     await send('Emulation.setFocusEmulationEnabled',{enabled:true});
     try{assert.equal(await run(session,`nodeRepl.write(JSON.stringify((await browser.tabs.selected())?.id));`),first);}finally{await send('Emulation.setFocusEmulationEnabled',{enabled:false});}
    });
    await activate(second);assert.equal(await run(session,`nodeRepl.write(JSON.stringify((await browser.tabs.selected())?.id));`),second);
    const fresh=await other.run(`var b=await cua.getBrowser({id:'cdp'});nodeRepl.write((await b.tabs.selected())?.id);`);assert.equal(fresh.isError,false,fresh.content.at(-1).text);
    assert.equal(session.browserSelection.hidden().ids.length,2);await other.close();assert.equal(session.browserSelection.hidden().ids.length,1);
    const control=(await(await fetch(new URL('/json/list',endpoint))).json()).find(tab=>tab.id===hidden[0]);
    const paused=await openConnection(control.webSocketDebuggerUrl);
    try{
     await paused.send('Debugger.enable');await paused.send('Debugger.pause');
     await run(session,`var selectionEnded=false;void browser.tabs.selected().catch(()=>selectionEnded=true);nodeRepl.write(JSON.stringify(true));`);
     assert.ok([...session.browserSelection.owners.values()].some(entry=>entry.pending.size>0));
     await session.endTurn();
    }finally{paused.close();}
    assert.equal(session.browserSelection.owners.size,0);assert.equal(session.browserSelection.hidden().ids.length,0);
    assert.equal(await run(session,`nodeRepl.write(JSON.stringify((await cua.listBrowsers({emit:false}))[0].metadata.sessionName));`),'🔎 named creation');
    assert.equal(await run(session,`nodeRepl.write(JSON.stringify((await browser.tabs.selected())?.id));`),second);
   }
   await session.reset();assert.equal(session.browserSelection.hidden().ids.length,0);
   assert.equal(await run(session,`nodeRepl.write(JSON.stringify((await cua.listBrowsers({emit:false}))[0].metadata.sessionName));`),'🔎 named creation');
   console.log(`${Session.name} PASS browser namespaces, fresh metadata, independent names and ${missing?'missing extension cleanup':'native selection under focus emulation, hidden control targets and turn/reset cleanup'}`);
  }finally{
   await other.close();await session.close();
   for(const id of [first,second])if(id && (await(await fetch(new URL('/json/list',endpoint))).json()).some(tab=>tab.id===id))await withConnection(version.webSocketDebuggerUrl,send=>send('Target.closeTarget',{targetId:id})).catch(()=>{});
  }
 }
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
