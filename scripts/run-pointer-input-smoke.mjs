// Use an owned disposable CDP browser; every created tab is closed by this controller.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {WorkerJavaScriptSession,PersistentJavaScriptSession} from './node-repl/open-computer-use-repl.mjs';
import {withConnection} from './node-repl/browser-cdp.mjs';
const endpoint=process.env.OPEN_COMPUTER_USE_CDP_URL;if(!endpoint)throw Error('Set OPEN_COMPUTER_USE_CDP_URL to disposable Chrome');
const server=createServer((req,res)=>{
 res.setHeader('Content-Type','text/html');res.end(`<title>Owned pointer fixture</title><style>body{margin:0;height:2000px}#surface{border:0;position:fixed;left:20px;top:50px;width:320px;height:140px;background:lightblue}output{position:fixed;top:240px;left:0}</style><button id="surface">Pointer surface</button><div id="decoy" style="position:fixed;left:370px;top:50px;width:200px;height:140px">Decoy</div><output></output><script>
 if(['?patched','?covered'].includes(location.search)){const surface=document.querySelector('#surface'),rect=document.querySelector('#decoy').getBoundingClientRect();if(location.search==='?covered'){const cover=document.createElement('div');cover.id='cover';cover.style='position:fixed;left:20px;top:50px;width:320px;height:140px;background:red;z-index:10';document.body.append(cover);}surface.getBoundingClientRect=Element.prototype.getBoundingClientRect=()=>rect;document.elementFromPoint=Document.prototype.elementFromPoint=()=>surface;surface.contains=Node.prototype.contains=()=>true;}

 if(location.search==='?offscreen'){document.querySelector('#surface').style.position='absolute';document.querySelector('#surface').style.top='1500px';}const events=[];let held=false;for(const type of ['mousedown','mousemove','mouseup','click','contextmenu','keydown','keyup'])document.addEventListener(type,e=>{if(type==='mousedown')held=true;if(type==='mouseup')held=false;events.push({type,x:e.clientX,y:e.clientY,buttons:e.buttons,button:e.button,detail:e.detail,scrollY,trusted:e.isTrusted,target:e.target.id,visibility:document.visibilityState});document.querySelector('output').textContent=JSON.stringify(events);if(type==='mousemove'&&!held&&location.search.startsWith('?hover-')){const mode=location.search;history.replaceState({},'',location.pathname);const surface=document.querySelector('#surface');if(mode==='?hover-move')surface.style.left='370px';if(mode==='?hover-cover'){const cover=document.createElement('div');cover.id='cover';cover.style='position:fixed;left:20px;top:50px;width:320px;height:140px;z-index:10;background:red';document.body.append(cover);}if(mode==='?hover-name')surface.textContent='Changed pointer surface';if(mode==='?hover-content')document.body.style.height='2600px';}if(type==='click'&&location.search.startsWith('?multi-')){const mode=location.search;history.replaceState({},'',location.pathname);if(mode==='?multi-name')document.querySelector('#surface').textContent='Changed pointer surface';if(mode==='?multi-move')document.querySelector('#surface').style.left='370px';}if(type==='contextmenu')e.preventDefault();if(type==='mousedown'&&location.search==='?effects'){document.body.style.height='4000px';scrollTo(0,400);}if(type==='mousemove'&&held&&e.buttons===1)document.body.style.height='2400px';if(held&&((type==='mousemove'&&e.buttons===1&&location.search==='?modal-drag')||(type==='mousedown'&&location.search==='?modal-click'))){history.replaceState({},'',location.pathname);prompt('Pointer pause');}});globalThis.readFixture=()=>({events,held,visibility:document.visibilityState,width:visualViewport.width,height:document.body.scrollHeight,scrollY});
 </script>`);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}/`,ids=new Set();
const native={async request(){throw Error('Native app unused');}};
async function run(session,code){const result=await session.run(code,30000);assert.equal(result.isError,false,result.content.at(-1)?.text);return JSON.parse(result.content.at(-1).text);}
async function target(id){return (await(await fetch(new URL('/json/list',endpoint))).json()).find(target=>target.id===id);}
async function state(id){return withConnection((await target(id)).webSocketDebuggerUrl,async send=>(await send('Runtime.evaluate',{expression:'readFixture()',returnByValue:true})).result.value);}
async function until(check){const deadline=Date.now()+5000;while(!await check()){assert.ok(Date.now()<deadline,'Native pointer event did not arrive');await new Promise(resolve=>setTimeout(resolve,20));}}
async function setup(session,route=''){
 const id=await run(session,`var tab=await cua.createBrowserTab('cdp',${JSON.stringify(url+route)},{visible:false});await tab.markHandoff();await tab.playwright.waitForURL(${JSON.stringify(url+route)});nodeRepl.write(JSON.stringify(tab.id));`);ids.add(id);
 const baseline=await state(id),width=await run(session,'var image=await tab.getScreenshot({emit:false});nodeRepl.write(JSON.stringify(image.readUInt32BE(16)));'),scale=width/baseline.width;
 await run(session,`var from=[${50*scale},${100*scale}],to=[${240*scale},${100*scale}];var ax=await tab.getAXState({emit:false});var index=ax.split('\\n').find(line=>line.includes(' button \"Pointer surface\"')).match(/^\\[([^\\]]+)\\]/)[1];nodeRepl.write(JSON.stringify(true));`);return {id,baseline};
}
try{
 for(const Session of [WorkerJavaScriptSession,PersistentJavaScriptSession])for(const [mode,kind] of [['hover-move','ax'],['hover-cover','ax'],['hover-name','ax'],['multi-name','ax'],['multi-move','ax'],['hover-content','click'],['hover-content','drag']]){
  const session=new Session({native});
  try{
   const {id,baseline}=await setup(session,'?'+mode),multi=mode.startsWith('multi-');
   const call=kind==='drag'?'tab.drag(from,to)':kind==='click'?'tab.click(from)':multi?'tab.click(index,{clickCount:3})':mode==='hover-cover'?"tab.click(index,{key:'shift'})":'tab.click(index)';
   const result=await session.run(`await ${call};`,30000),final=await state(id),down=final.events.filter(event=>event.type==='mousedown'),up=final.events.filter(event=>event.type==='mouseup'),clicks=final.events.filter(event=>event.type==='click');
   assert.equal(result.isError,true,JSON.stringify({content:result.content,events:final.events}));assert.match(result.content.at(-1).text,/changed|covered|visible|geometry/i);
   assert.equal(down.length,multi?1:0);assert.equal(up.length,down.length);assert.equal(clicks.length,multi?1:0);assert.ok(clicks.every(event=>event.target==='surface'&&event.trusted));
   assert.equal(final.events.filter(event=>event.type==='keydown').length,final.events.filter(event=>event.type==='keyup').length);
   assert.equal(final.visibility,baseline.visibility);assert.equal(session.browserInputs.leases.size,0);assert.equal(session.browserFocusLeases.entries.size,0);
   console.log(`${Session.name} PASS ${mode} ${kind}, changed target refused before next down and cleanup balanced`);
  }finally{await session.close();}
 }
 for(const Session of [WorkerJavaScriptSession,PersistentJavaScriptSession])for(const mode of ['patched','covered']){
  const session=new Session({native});
  try{
   const {id,baseline}=await setup(session,'?'+mode),result=await session.run('await tab.click(index);',30000);
   assert.equal(result.isError,mode==='covered',JSON.stringify(result.content));
   if(mode==='covered')assert.match(result.content.at(-1).text,/covered|visible/);
   const final=await state(id),down=final.events.filter(event=>event.type==='mousedown'),clicks=final.events.filter(event=>event.type==='click');
   assert.equal(down.length,mode==='patched'?1:0);assert.ok(down.every(event=>event.target==='surface'&&event.trusted),JSON.stringify(down));
   assert.equal(clicks.length,mode==='patched'?1:0);assert.ok(clicks.every(event=>event.target==='surface'&&event.trusted),JSON.stringify(clicks));
   assert.equal(final.visibility,baseline.visibility);assert.equal(session.browserInputs.leases.size,0);assert.equal(session.browserFocusLeases.entries.size,0);
   console.log(`${Session.name} PASS ${mode} AX geometry, native receiver target, no page-world spoofing`);
  }finally{await session.close();}
 }
 for(const Session of [WorkerJavaScriptSession,PersistentJavaScriptSession])for(const action of ['click','drag'])for(const mode of ['normal',...(action==='click'?['multi','right']:[]),'turn','reset','timeout','close',...(Session===WorkerJavaScriptSession?['exit']:[]),'release-failure']){
  const session=new Session({native});let other,otherId,originalOpen,currentId;
  try{
   const modal=!['normal','multi','right','release-failure'].includes(mode),{id,baseline}=await setup(session,modal?'?modal-'+action:action==='click'&&mode==='normal'?'?effects':'');currentId=id;const call=action==='drag'?'tab.drag(from,to)':mode==='multi'?'tab.click(index,{clickCount:3})':mode==='right'?"tab.click(from,{mouseButton:'r'})":mode==='normal'?'tab.click(index)':'tab.click(from)';
   if(mode==='reset'||mode==='release-failure'){other=new Session({native});otherId=(await setup(other)).id;}
   if(mode==='release-failure'){
    originalOpen=session.browserInputs.open;session.browserInputs.open=async(...args)=>{const connection=await originalOpen(...args),send=connection.send;connection.send=(method,params,...rest)=>method==='Input.dispatchMouseEvent'&&params?.type==='mouseReleased'?Promise.reject(Error('Injected pointer release outage')):send(method,params,...rest);return connection;};
   }
   if(['normal','multi','right'].includes(mode)){
    await run(session,`await ${call};nodeRepl.write(JSON.stringify(true));`);
    await run(session,'await tab.getScreenshot({emit:false});nodeRepl.write(JSON.stringify(true));');
   }else{
    const running=session.run(`await ${call};${mode==='turn'||mode==='release-failure'?'':'await new Promise(()=>{});'}`,mode==='timeout'?1200:30000);
    if(modal){await until(()=>[...session.browserDialogs.targets.values()].some(entry=>entry.targetId===id&&entry.dialog?.type==='prompt'));const record=[...session.browserInputs.leases.values()].find(record=>record.targetId===id);assert.ok(record?.mouse);if(action==='drag')assert.equal(record.dragging,true);}
    else await until(async()=>(await state(id)).events.some(event=>action==='drag'?event.type==='mousemove'&&event.buttons===1:event.type==='mousedown'));
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
   assert.equal(down.length,mode==='multi'?3:1,action+mode+JSON.stringify(final));assert.equal(up.length,down.length,action+mode+JSON.stringify(final));assert.ok(up.every(event=>event.buttons===0&&event.button===(mode==='right'?2:0)));if(mode==='multi'){assert.deepEqual(down.map(event=>event.detail),[1,2,3]);assert.deepEqual(up.map(event=>event.detail),[1,2,3]);}assert.ok(down.every(event=>event.button===(mode==='right'?2:0)&&event.visibility==='visible'));assert.ok(final.events.every(event=>event.trusted));assert.equal(final.held,false);assert.equal(final.visibility,baseline.visibility);
   assert.ok(final.events.slice(0,final.events.findIndex(event=>event.type==='mousedown')).every(event=>event.buttons===0));
   assert.equal(session.browserInputs.leases.size,0);assert.equal(session.browserFocusLeases.entries.size,0);
   assert.ok(final.events.filter(event=>event.type==='mousemove'&&event.buttons===1).every(event=>event.visibility==='visible'));
   if(otherId)assert.equal((await state(otherId)).events.filter(event=>event.type==='keydown').length,0);
   if(mode==='normal'&&action==='drag'){assert.equal(up[0].x,240);assert.equal(up[0].y,100);assert.equal(final.height,2400);}
   if(mode==='normal'&&action==='click'){assert.equal(final.height,4000);assert.equal(up[0].scrollY,400);assert.equal(up[0].x,down[0].x);assert.equal(up[0].y,down[0].y);}
   if(modal||mode==='release-failure')assert.equal(final.events.filter(event=>event.type==='click'&&event.target==='surface').length,0);
   if(mode!=='close')assert.equal(await run(session,'nodeRepl.write(JSON.stringify(19));'),19);
   console.log(`${Session.name} PASS ${mode} ${action}, trusted receiver events, focus restoration, no replay and cleanup`);
  }catch(error){console.error('POINTER_FAILURE',Session.name,action,mode,currentId?JSON.stringify(await state(currentId).catch(error=>({error:error.message}))):'setup');throw error;}finally{if(originalOpen)session.browserInputs.open=originalOpen;await other?.close();await session.close();}
 }
 for(const Session of [WorkerJavaScriptSession,PersistentJavaScriptSession])for(const mode of ['normal','reset',...(Session===WorkerJavaScriptSession?['exit']:[])]){
  const session=new Session({native}),other=new Session({native});let release,originalOpen;
  const gate=new Promise(resolve=>{release=resolve;});let prepared=false;
  try{
   const {id,baseline}=await setup(session,'?offscreen'),otherId=(await setup(other)).id;
   originalOpen=session.browserInputs.open;
   session.browserInputs.open=async(...args)=>{const connection=await originalOpen(...args),send=connection.send;connection.send=async(method,...rest)=>{const result=await send(method,...rest);if(method==='DOM.scrollIntoViewIfNeeded'){prepared=true;await gate;}return result;};return connection;};
   const running=session.run('await tab.click(index);',30000);
   await until(()=>prepared);
   const record=[...session.browserInputs.leases.values()].find(record=>record.targetId===id);assert.ok(record);assert.equal(record.mouse,undefined);
   const preparing=await state(id);assert.ok(preparing.scrollY>baseline.scrollY);assert.equal(preparing.events.filter(event=>event.type==='mousedown').length,0);
   const denied=await other.run('await tab.pressKey(null,"a");');assert.equal(denied.isError,true);assert.match(denied.content.at(-1).text,/already owns/);
   let cleanup;
   if(mode==='reset'){cleanup=session.reset();await until(()=>record.canceled);}
   if(mode==='exit'){cleanup=session.worker.terminate();await until(()=>record.canceled);}
   release();await cleanup;
   assert.equal((await running).isError,mode!=='normal');
   await until(()=>session.browserInputs.leases.size===0);
   const final=await state(id);
   assert.equal(final.events.filter(event=>event.type==='mousedown').length,mode==='normal'?1:0);
   assert.equal(final.events.filter(event=>event.type==='mouseup').length,mode==='normal'?1:0);
   assert.equal(final.events.filter(event=>event.type==='click'&&event.target==='surface').length,mode==='normal'?1:0);
   assert.equal(final.visibility,baseline.visibility);assert.equal(session.browserFocusLeases.entries.size,0);
   assert.equal((await state(otherId)).events.filter(event=>event.type==='keydown').length,0);
   console.log(`${Session.name} PASS AX preparation ${mode}, native scroll under host lease, competitor refused, no canceled press`);
  }finally{release();if(originalOpen)session.browserInputs.open=originalOpen;await other.close();await session.close();}
 }

}finally{
 try{for(const id of ids)if(await target(id)){const version=await(await fetch(new URL('/json/version',endpoint))).json();await withConnection(version.webSocketDebuggerUrl,send=>send('Target.closeTarget',{targetId:id}));}}
 finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
