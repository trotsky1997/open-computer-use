// Use an owned disposable CDP browser; every created tab is closed by this controller.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {WorkerJavaScriptSession,PersistentJavaScriptSession} from './node-repl/open-computer-use-repl.mjs';
import {withConnection} from './node-repl/browser-cdp.mjs';
const endpoint=process.env.OPEN_COMPUTER_USE_CDP_URL;if(!endpoint)throw Error('Set OPEN_COMPUTER_USE_CDP_URL to disposable Chrome');
const server=createServer((req,res)=>{
 res.setHeader('Content-Type','text/html');res.end(`<title>Owned drag fixture</title><style>body{margin:0;height:2000px}#surface{position:absolute;left:20px;top:50px;width:320px;height:140px;background:lightblue}output{position:fixed;top:240px;left:0}</style><div id="surface">Drag surface</div><output></output><script>
 const events=[];let held=false;for(const type of ['mousedown','mousemove','mouseup','click','keydown','keyup'])document.addEventListener(type,e=>{if(type==='mousedown')held=true;if(type==='mouseup')held=false;events.push({type,x:e.clientX,y:e.clientY,buttons:e.buttons,trusted:e.isTrusted,target:e.target.id,visibility:document.visibilityState});document.querySelector('output').textContent=JSON.stringify(events);if(type==='mousemove'&&held&&e.buttons===1){document.body.style.height='2400px';if(location.search==='?modal'){history.replaceState({},'',location.pathname);prompt('Drag pause');}}});globalThis.readFixture=()=>({events,held,visibility:document.visibilityState,width:visualViewport.width,height:document.body.scrollHeight});
 </script>`);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}/`,ids=new Set();
const native={async request(){throw Error('Native app unused');}};
async function run(session,code){const result=await session.run(code,30000);assert.equal(result.isError,false,result.content.at(-1)?.text);return JSON.parse(result.content.at(-1).text);}
async function target(id){return (await(await fetch(new URL('/json/list',endpoint))).json()).find(target=>target.id===id);}
async function state(id){return withConnection((await target(id)).webSocketDebuggerUrl,async send=>(await send('Runtime.evaluate',{expression:'readFixture()',returnByValue:true})).result.value);}
async function until(check){const deadline=Date.now()+5000;while(!await check()){assert.ok(Date.now()<deadline,'Native drag event did not arrive');await new Promise(resolve=>setTimeout(resolve,20));}}
async function setup(session,route=''){
 const id=await run(session,`var tab=await cua.createBrowserTab('cdp',${JSON.stringify(url+route)},{visible:false});await tab.markHandoff();await tab.playwright.waitForURL(${JSON.stringify(url+route)});nodeRepl.write(JSON.stringify(tab.id));`);ids.add(id);
 const baseline=await state(id),width=await run(session,'var image=await tab.getScreenshot({emit:false});nodeRepl.write(JSON.stringify(image.readUInt32BE(16)));'),scale=width/baseline.width;
 await run(session,`var from=[${50*scale},${100*scale}],to=[${240*scale},${100*scale}];nodeRepl.write(JSON.stringify(true));`);return {id,baseline};
}
try{
 for(const Session of [WorkerJavaScriptSession,PersistentJavaScriptSession])for(const mode of ['normal','turn','reset','timeout','close',...(Session===WorkerJavaScriptSession?['exit']:[]),'release-failure']){
  const session=new Session({native});let other,otherId,originalOpen,currentId;
  try{
   const modal=!['normal','release-failure'].includes(mode),{id,baseline}=await setup(session,modal?'?modal':'');currentId=id;
   if(mode==='reset'||mode==='release-failure'){other=new Session({native});otherId=(await setup(other)).id;}
   if(mode==='release-failure'){
    originalOpen=session.browserInputs.open;session.browserInputs.open=async(...args)=>{const connection=await originalOpen(...args),send=connection.send;connection.send=(method,params,...rest)=>method==='Input.dispatchMouseEvent'&&params?.type==='mouseReleased'?Promise.reject(Error('Injected drag release outage')):send(method,params,...rest);return connection;};
   }
   if(mode==='normal'){
    await run(session,'await tab.drag(from,to);nodeRepl.write(JSON.stringify(true));');
    await run(session,'await tab.getScreenshot({emit:false});nodeRepl.write(JSON.stringify(true));');
   }else{
    const running=session.run(`await tab.drag(from,to);${mode==='turn'||mode==='release-failure'?'':'await new Promise(()=>{});'}`,mode==='timeout'?1200:30000);
    if(modal){await until(()=>[...session.browserDialogs.targets.values()].some(entry=>entry.targetId===id&&entry.dialog?.type==='prompt'));assert.equal([...session.browserInputs.leases.values()].find(record=>record.targetId===id)?.dragging,true);}
    else await until(async()=>(await state(id)).events.some(event=>event.type==='mousemove'&&event.buttons===1));
    if(other){const denied=await other.run('await tab.pressKey(null,"a");');assert.equal(denied.isError,true);assert.match(denied.content.at(-1).text,/already owns|dialog/);}
    if(mode==='turn'){assert.equal((await running).isError,false);await session.endTurn();}
    if(mode==='reset')await session.reset();
    if(mode==='close')await session.close();
    if(mode==='exit')await session.worker.terminate();
    if(mode!=='turn')assert.equal((await running).isError,true);
    if(mode==='release-failure'){
     assert.equal(session.browserInputs.leases.size,1);const denied=await session.run('nodeRepl.write(9)');assert.equal(denied.isError,true);
     session.browserInputs.open=originalOpen;originalOpen=undefined;await session.reset();
    }
    await until(async()=>(await state(id)).held===false);
   }
   const final=await state(id),down=final.events.filter(event=>event.type==='mousedown'),up=final.events.filter(event=>event.type==='mouseup');
   assert.equal(down.length,1,mode+JSON.stringify(final));assert.equal(up.length,1,mode+JSON.stringify(final));assert.equal(up[0].buttons,0);assert.ok(final.events.every(event=>event.trusted));assert.equal(final.held,false);assert.equal(final.visibility,baseline.visibility);
   assert.ok(final.events.slice(0,final.events.findIndex(event=>event.type==='mousedown')).every(event=>event.buttons===0));
   assert.equal(session.browserInputs.leases.size,0);assert.equal(session.browserFocusLeases.entries.size,0);
   assert.ok(final.events.filter(event=>event.type==='mousemove'&&event.buttons===1).every(event=>event.visibility==='visible'));
   if(otherId)assert.equal((await state(otherId)).events.filter(event=>event.type==='keydown').length,0);
   if(mode==='normal'){assert.equal(up[0].x,240);assert.equal(up[0].y,100);assert.equal(final.height,2400);}
   else assert.equal(final.events.filter(event=>event.type==='click'&&event.target==='surface').length,0);
   if(mode!=='close')assert.equal(await run(session,'nodeRepl.write(JSON.stringify(19));'),19);
   console.log(`${Session.name} PASS ${mode} drag, trusted receiver events, focus restoration, no replay and cleanup`);
  }catch(error){console.error('DRAG_FAILURE',Session.name,mode,currentId?JSON.stringify(await state(currentId).catch(error=>({error:error.message}))):'setup');throw error;}finally{if(originalOpen)session.browserInputs.open=originalOpen;await other?.close();await session.close();}
 }
}finally{
 try{for(const id of ids)if(await target(id)){const version=await(await fetch(new URL('/json/version',endpoint))).json();await withConnection(version.webSocketDebuggerUrl,send=>send('Target.closeTarget',{targetId:id}));}}
 finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
