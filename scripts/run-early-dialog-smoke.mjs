// Use a disposable CDP browser; external targets here are owned by this controller.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {PersistentJavaScriptSession,WorkerJavaScriptSession} from './node-repl/open-computer-use-repl.mjs';
import {openConnection} from './node-repl/browser-cdp.mjs';
const endpoint=process.env.OPEN_COMPUTER_USE_CDP_URL;assert.ok(endpoint,'Set OPEN_COMPUTER_USE_CDP_URL to a disposable browser');
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(req.url==='/early'?`<title>Early dialog</title><output>waiting</output><script>document.querySelector('output').textContent=prompt('Before binding','seed')</script>`:`<title>Opener</title><button>Popup</button><button id="lose">Lost capture</button><output id="lost">ready</output><script>document.querySelector("#lose").onclick=()=>{document.querySelector("#lost").textContent=String(prompt("Lost first"))+" "+String(prompt("Lost second"));};document.querySelector('button').onclick=()=>{const child=window.open('about:blank');child.document.write('<title>Popup dialog</title><output>waiting</output><script>document.querySelector("output").textContent=prompt("Popup", "seed")<'+ '/script>');};</script>`);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
const native={async request(){throw Error('Native backend unused');}},pause=()=>new Promise(r=>setTimeout(r,20));
async function until(fn){const end=Date.now()+15000;for(;;){const value=await fn();if(value)return value;assert.ok(Date.now()<end,'Owned dialog was not captured');await pause();}}
async function run(session,code){const r=await session.run(code,30000);assert.equal(r.isError,false,JSON.stringify(r.content));return JSON.parse(r.content.at(-1).text);}
const version=await(await fetch(endpoint+'/json/version')).json(),control=await openConnection(version.webSocketDebuggerUrl);
try{
 for(const Session of [PersistentJavaScriptSession,WorkerJavaScriptSession]){
  const session=new Session({native});let passive=new Session({native}),early,opener,popup;
  try{
   await run(session,'var browser=await cua.getBrowser({id:"cdp"});nodeRepl.write(JSON.stringify(browser.browserId));');
   early=(await control.send('Target.createTarget',{url:url+'/early',background:true})).targetId;
   await until(()=>[...session.browserDialogs.targets.values()].find(e=>e.targetId===early)?.dialog);
   await run(passive,'nodeRepl.write(JSON.stringify(await cua.listTabs({emit:false})));');await passive.close();
   assert.equal(await run(session,`var early=await cua.getTab(${JSON.stringify(early)});var d=await early.getJsDialog();nodeRepl.write(JSON.stringify(d.type));`),'prompt');
   assert.equal(await run(session,'await d.accept("early 你好");nodeRepl.write(JSON.stringify(await early.playwright.locator("output").innerText()));'),'early 你好');
   await control.send('Target.closeTarget',{targetId:early});early=undefined;
   const watcher=[...session.browserDialogs.browsers.values()][0];watcher.connection.close();await until(()=>watcher.error);
   const disconnected=await session.run('await cua.listTabs({emit:false});');assert.equal(disconnected.isError,true);assert.match(JSON.stringify(disconnected.content),/observer closed/);
   await session.reset();assert.equal(session.browserDialogs.browsers.size,0);
   opener=await run(session,`var parent=await cua.createBrowserTab('cdp',${JSON.stringify(url)},{visible:false});nodeRepl.write(JSON.stringify(parent.id));`);
   assert.equal(await run(session,'await parent.playwright.getByRole("button",{name:"Popup",exact:true}).click();nodeRepl.write(JSON.stringify(true));'),true);
   const entry=await until(()=>[...session.browserDialogs.targets.values()].find(e=>e.openerId===opener&&e.dialog));popup=entry.targetId;assert.ok(entry.dialog.owner,'Popup dialog lost initiating owner');
   passive=new Session({native});
   await run(passive,`var other=await cua.getTab(${JSON.stringify(popup)});nodeRepl.write(JSON.stringify(other.id));`);
   const denied=await passive.run('await other.getJsDialog();');assert.equal(denied.isError,true);assert.match(JSON.stringify(denied.content),/another browser session/);await passive.close();
   assert.equal(await run(session,`var popup=await cua.getTab(${JSON.stringify(popup)});var pd=await popup.getJsDialog();nodeRepl.write(JSON.stringify(pd.type));`),'prompt');
   assert.equal(await run(session,'await pd.accept("popup 🙂");nodeRepl.write(JSON.stringify(await popup.playwright.locator("output").innerText()));'),'popup 🙂');
   const target=(await(await fetch(endpoint+'/json/list')).json()).find(t=>t.id===opener);
   const survivor=await openConnection(target.webSocketDebuggerUrl);await survivor.send('Page.enable');
   try{
    await run(session,'await parent.playwright.getByRole("button",{name:"Lost capture",exact:true}).click();nodeRepl.write(JSON.stringify(true));');
    const active=[...session.browserDialogs.targets.values()].find(e=>e.targetId===opener),original=active.dialog;
    const broken=[...session.browserDialogs.browsers.values()][0];broken.connection.close();await until(()=>broken.error);
    await assert.rejects(session.reset(),/cleanup is unconfirmed/);
    assert.equal(active.dialog,original,'Unconfirmed cleanup discarded the dialog identity');assert.equal(active.owners.has(original.owner),true);
    assert.equal((await session.run('nodeRepl.write(42);')).isError,true,'Unconfirmed cleanup allowed more JavaScript');
    await survivor.send('Page.handleJavaScriptDialog',{accept:false});
    await until(()=>active.dialog&&active.dialog!==original);
    await session.reset();assert.equal(session.browserDialogs.browsers.size,0);
    assert.equal(await run(session,`var parent=await cua.getTab(${JSON.stringify(opener)});nodeRepl.write(JSON.stringify(await parent.playwright.locator("#lost").innerText()));`),'null null');
   }finally{survivor.close();}
   for(const action of ['reset','close']){
    await run(session,'await parent.playwright.getByRole("button",{name:"Popup",exact:true}).click();nodeRepl.write(JSON.stringify(true));');
    const active=await until(()=>[...session.browserDialogs.targets.values()].find(e=>e.openerId===opener&&e.dialog));popup=active.targetId;
    if(action==='close')await run(session,`var retained=await cua.getTab(${JSON.stringify(popup)});await retained.markHandoff();nodeRepl.write(JSON.stringify(true));`);
    await session[action]();assert.equal(session.browserDialogs.browsers.size,0,'Browser dialog observer leaked after '+action);
    const reader=action==='close'?new Session({native}):session;
    try{
     assert.equal(await run(reader,`var child=await cua.getTab(${JSON.stringify(popup)});nodeRepl.write(JSON.stringify(await child.playwright.locator("output").innerText()));`),'');
     if(action==='reset')await run(reader,`var parent=await cua.getTab(${JSON.stringify(opener)});nodeRepl.write(JSON.stringify(true));`);
    }finally{if(reader!==session)await reader.close();}
   }
   console.log(`${Session.name} PASS browser-discovered pre-binding prompt, synchronous popup capture/action ownership, Unicode response, passive observer cleanup, unclaimed-handle popup dismissal on reset/close, observer outage recovery, unconfirmed-dialog retention and external dismissal/second-dialog recovery`);
  }finally{await passive.close();await session.close();for(const targetId of [early,popup,opener].filter(Boolean))await control.send('Target.closeTarget',{targetId}).catch(()=>{});}
 }
}finally{control.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
