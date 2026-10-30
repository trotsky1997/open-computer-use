import assert from "node:assert/strict";
import {createServer} from "node:http";
import {WorkerJavaScriptSession,PersistentJavaScriptSession} from "./node-repl/open-computer-use-repl.mjs";
import {withConnection} from "./node-repl/browser-cdp.mjs";

const endpoint=process.env.OPEN_COMPUTER_USE_CDP_URL;
if(!endpoint) throw new Error("Set OPEN_COMPUTER_USE_CDP_URL to disposable Chrome");
const server=createServer((req,res)=>{
 res.setHeader('Content-Type','text/html');
 res.end(`<!doctype html><style>body{margin:0;height:1000px}button{position:fixed;left:80px;top:70px;width:200px;height:70px}input{position:fixed;left:80px;top:180px}output{position:fixed;left:10px;top:240px;width:600px;height:150px;overflow:auto;white-space:pre-wrap}</style><button ${req.url.includes("draggable")?'draggable="true"':''}>Held target</button><input aria-label="Typing"><output id="log">[]</output><script>
 const events=[];for(const type of ['keydown','keyup','mousedown','mouseup','click','dblclick']) document.addEventListener(type,e=>{
 events.push({type:e.type,target:e.target.tagName,x:e.clientX,y:e.clientY,key:e.key,shift:e.shiftKey,ctrl:e.ctrlKey,alt:e.altKey,meta:e.metaKey,buttons:e.buttons,detail:e.detail,trusted:e.isTrusted,time:e.timeStamp});log.textContent=JSON.stringify(events);
 if(e.type==='mousedown' && location.search==='?dialog') {history.replaceState({},'',location.pathname);prompt('Held pause');}
 if(e.type==='keyup' && location.search==='?release-dialog') {history.replaceState({},'',location.pathname);alert('Release pause');}
 });</script>`);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}/`;
const native={async request(){throw Error('Native unused');}};
const session=new WorkerJavaScriptSession({native}),other=new WorkerJavaScriptSession({native});
const ids=[];
async function run(source,target=session,timeout=30000){const result=await target.run(source,timeout);assert.equal(result.isError,false,result.content.at(-1).text);return JSON.parse(result.content.at(-1).text);}
async function setup(route='',name='tab',target=session){const id=await run(`var ${name}=await cua.createBrowserTab('cdp',${JSON.stringify(url+route)},{visible:false});nodeRepl.write(JSON.stringify(${name}.id));`,target);ids.push(id);return id;}
async function state(name='tab'){return run(`nodeRepl.write(JSON.stringify(await ${name}.getAXState({emit:false})));`);}
async function index(name='tab'){const result=(await state(name)).match(/\[(\d+)\] button "Held target"/);assert.ok(result);return result[1];}
async function events(id){const target=(await(await fetch(new URL('/json/list',endpoint))).json()).find(target=>target.id===id);return withConnection(target.webSocketDebuggerUrl,async send=>JSON.parse((await send('Runtime.evaluate',{expression:'document.querySelector("output").textContent',returnByValue:true})).result.value));}
async function waitFor(test){const deadline=Date.now()+5000;while(!await test()){assert.ok(Date.now()<deadline,'Input event timeout');await new Promise(resolve=>setTimeout(resolve,10));}}
try{
 const id=await setup();let target=await index();
 await run(`await tab.click(${JSON.stringify(target)},{key:'shift+ctrl',durationMs:80,clickCount:2});nodeRepl.write(JSON.stringify(true));`);
 let log=await events(id),mouse=log.filter(e=>['mousedown','mouseup'].includes(e.type));
 assert.equal(mouse.length,4);assert.ok(mouse.every(e=>e.shift && e.ctrl && e.trusted));
 assert.ok(mouse[1].time-mouse[0].time>=75);assert.ok(mouse[3].time-mouse[2].time>=75);
 assert.deepEqual(log.filter(e=>e.type==='keyup').map(e=>e.key),['Control','Shift']);
 assert.equal(log.at(-1).shift,false);assert.equal(log.at(-1).ctrl,false);
 const typed=await setup('', 'typed');
 await run(`await typed.playwright.getByLabel('Typing').fill('');nodeRepl.write(JSON.stringify(true));`);
 target=await index('typed');await run(`await typed.click(${JSON.stringify(target)},{key:'a',durationMs:20});nodeRepl.write(JSON.stringify(true));`);
 assert.equal(await run(`nodeRepl.write(JSON.stringify(await typed.playwright.getByLabel('Typing').inputValue()));`),'a');
 assert.ok((await events(typed)).every(e=>e.trusted));
 const paused=await setup('?dialog','paused');target=await index('paused');
 await run(`await paused.click(${JSON.stringify(target)},{key:'shift',durationMs:50});nodeRepl.write(JSON.stringify((await paused.getJsDialog()).type));`).then(type=>assert.equal(type,'prompt'));
 await new Promise(resolve=>setTimeout(resolve,10_200));
 await run(`await (await paused.getJsDialog()).dismiss();nodeRepl.write(JSON.stringify(true));`);
 assert.equal((await events(paused)).filter(e=>e.type==='mouseup').length,1);
 const ownerId=await setup('', 'owner');target=await index('owner');
 const otherId=await setup('', 'competitor',other);
 const owned=session.run(`await owner.click(${JSON.stringify(target)},{key:'shift',durationMs:500});`);
 await waitFor(async()=> (await events(ownerId)).some(e=>e.type==='mousedown'));
 const denied=await other.run(`await competitor.playwright.getByRole('button',{name:'Held target'}).drop({data:{'text/plain':'blocked'}});`);
 assert.equal(denied.isError,true);assert.match(denied.content.at(-1).text,/already owns/);
 assert.equal((await owned).isError,false);
 for(const route of ['?dialog','?release-dialog','?draggable']) {
   const modal=await setup(route,'modal');target=await index('modal');
   const running=session.run(`await modal.click(${JSON.stringify(target)},{key:'shift',durationMs:5000,clickCount:2});`);
   if(route==='?dialog') {assert.equal((await running).isError,false);await session.reset();}
   else {await waitFor(async()=> (await events(modal)).some(e=>e.type==='mousedown'));await session.reset();assert.equal((await running).isError,true);}
   const released=await events(modal);assert.equal(released.filter(e=>e.type==='mousedown').length,1);assert.equal(released.filter(e=>e.type==='keyup').at(-1)?.shift,false,route+JSON.stringify(released));
 }
 const canceled=await setup('', 'canceled');target=await index('canceled');
 const pending=session.run(`await canceled.click(${JSON.stringify(target)},{key:'shift',durationMs:5000,clickCount:2});`);
 await waitFor(async()=> (await events(canceled)).some(e=>e.type==='mousedown'));
 await session.reset();assert.equal((await pending).isError,true);
 log=await events(canceled);assert.equal(log.filter(e=>e.type==='mousedown').length,1);assert.equal(log.filter(e=>e.type==='mouseup').length,1);assert.equal(log.filter(e=>e.type==='keyup').at(-1).shift,false);
 assert.equal(log.filter(e=>e.type==='click' && e.target==='BUTTON').length,0,JSON.stringify(log));
 await run(`var tab=await cua.getTab(${JSON.stringify(canceled)});nodeRepl.write(JSON.stringify(true));`);
 target=await index();await run(`await tab.click(${JSON.stringify(target)},{key:'shift',durationMs:0});nodeRepl.write(JSON.stringify(true));`);
 const timeoutId=await setup('', 'timed');target=await index('timed');
 const timed=session.run(`await timed.click(${JSON.stringify(target)},{key:'shift',durationMs:5000,clickCount:2});`,1500);
 await waitFor(async()=> (await events(timeoutId)).some(e=>e.type==='mousedown'));
 assert.equal((await timed).isError,true);
 const timedLog=await events(timeoutId);assert.equal(timedLog.filter(e=>e.type==='mousedown').length,1);assert.equal(timedLog.filter(e=>e.type==='keyup').at(-1).shift,false);
 await run(`var tab=await cua.getTab(${JSON.stringify(canceled)});nodeRepl.write(JSON.stringify(true));`);
 await run(`var browser=await cua.getBrowser({id:'cdp'});var viewport=await browser.capabilities.get('viewport');await viewport.set({width:320,height:240});nodeRepl.write(JSON.stringify(true));`);
 const scale=await run(`nodeRepl.write(JSON.stringify((await tab.getScreenshot({emit:false,clip:{x:50,y:40,width:220,height:130}})).readUInt32BE(16)/220));`);
 await run(`await tab.click([${130*scale},${65*scale}],{key:'shift',durationMs:20});nodeRepl.write(JSON.stringify(true));`);
 await run(`await viewport.reset();nodeRepl.write(JSON.stringify(true));`);
 target=await index();
 const beforeFailure=(await events(canceled)).filter(e=>e.type==='mousedown').length;
 const originalOpen=session.browserInputs.open;
 try {
   session.browserInputs.open=async(...args)=>{
     const connection=await originalOpen(...args),originalSend=connection.send;
     connection.send=(method,params,...rest)=>{
       if(method==='Input.dispatchMouseEvent' && params.type==='mouseReleased') return Promise.reject(Error('Injected release outage'));
       return originalSend(method,params,...rest);
     };return connection;
   };
   const failed=await session.run(`await tab.click(${JSON.stringify(target)},{key:'shift',durationMs:20});`);
   assert.equal(failed.isError,true);assert.match(failed.content.at(-1).text,/release outage/);
   assert.equal((await session.run('nodeRepl.write(1)')).isError,true);
   const denied=await other.run(`await competitor.pressKey(null,'a');`);
   assert.equal(denied.isError,true);assert.match(denied.content.at(-1).text,/already owns/);
 } finally {session.browserInputs.open=originalOpen;}
 await session.reset();
 assert.equal((await events(canceled)).filter(e=>e.type==='mousedown').length,beforeFailure+1);
 const closing=await setup('', 'closing');target=await index('closing');
 const closed=session.run(`await closing.click(${JSON.stringify(target)},{key:'shift',durationMs:5000,clickCount:2});`);
 await waitFor(async()=> (await events(closing)).some(e=>e.type==='mousedown'));
 await session.close();assert.equal((await closed).isError,true);
 assert.equal((await events(closing)).filter(e=>e.type==='keyup').at(-1).shift,false);
 const source=new PersistentJavaScriptSession({native});
 try {
   const result=await source.run(String.raw`var tab=await cua.getTab(${JSON.stringify(canceled)});var state=await tab.getAXState({emit:false});var index=state.match(/\[(\d+)\] button "Held target"/)[1];await tab.click(index,{key:'shift',durationMs:20});`);
   assert.equal(result.isError,false,result.content.at(-1).text);
 } finally {await source.close();}
 console.log(`PASS trusted held clicks, duration, ordinary keys, >10s prompts, cleanup dialogs, pointer exclusivity, reset/timeout/close, failure retry, cropped-pixel viewport input at scale ${scale} and source sessions`);
}finally{
 await Promise.allSettled([session.close(),other.close()]);
 const version=await(await fetch(new URL('/json/version',endpoint))).json();for(const targetId of ids)await withConnection(version.webSocketDebuggerUrl,send=>send('Target.closeTarget',{targetId}));
 server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
}
