// Owned GTK/D-Bus/Xvfb only; all input targets a synthetic receiving surface.
import assert from 'node:assert/strict';
import {mkdtemp,copyFile,chmod,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {LazyNativePeer,PersistentJavaScriptSession,WorkerJavaScriptSession} from '../node-repl/open-computer-use-repl.mjs';
const [binary]=process.argv.slice(2);assert.ok(binary);assert.equal(process.platform,'linux');
async function run(session,code){const r=await session.run(code,30000);assert.equal(r.isError,false,r.content.at(-1).text);return JSON.parse(r.content.at(-1).text);}
async function until(fn){const deadline=Date.now()+15000;for(;;){const value=await fn();if(value)return value;assert.ok(Date.now()<deadline,'Owned fixture did not settle');await new Promise(r=>setTimeout(r,30));}}
function index(text,label){const line=text.split('\n').find(l=>l.includes(label));assert.ok(line,`Missing ${label}: ${text}`);return Number(line.match(/^\s*(\d+)/u)[1]);}
for(const Session of [PersistentJavaScriptSession,WorkerJavaScriptSession]){
 const root=await mkdtemp(path.join(tmpdir(),'ocu-scroll-')),app=path.join(root,'fixture'),name=path.basename(root);let pid;
 await copyFile(new URL('./linux-window-fixture.py',import.meta.url),app);await chmod(app,0o700);
 const native=new LazyNativePeer({command:binary,args:['mcp'],env:{...process.env,OCU_WINDOW_FIXTURE_ROOT:root,OCU_WINDOW_FIXTURE_NAME:name,OPEN_COMPUTER_USE_ACTION_READ_BACK:'0',OPEN_COMPUTER_USE_ALLOW_GLOBAL_POINTER_FALLBACKS:'1'}}),session=new Session({native});
 const state=async()=>JSON.parse(await readFile(root+'/state.json','utf8'));
 try{
  await run(session,`await cua.computer.launch_app({app:${JSON.stringify(app)}});nodeRepl.write(JSON.stringify(true));`);
  const windows=await until(async()=>{const w=(await run(session,`nodeRepl.write(JSON.stringify(await cua.listWindows({emit:false})));`)).filter(w=>w.app===name);return w.length===2?w:null;});pid=(await state()).pid;
  const first=await run(session,`var first=await cua.getApp({windowId:${windows[0].id}},{initialState:false});nodeRepl.write(JSON.stringify(await first.getAXState({includeScreenshot:false,emit:false})));`),aId=first.includes('Window A')?windows[0].id:windows[1].id,bId=windows.find(w=>w.id!==aId).id;
  const a=await run(session,`var a=await cua.getApp({windowId:${aId}},{initialState:false});var b=await cua.getApp({windowId:${bId}},{initialState:false});nodeRepl.write(JSON.stringify(await a.getAXState({includeScreenshot:false,emit:false})));`),b=await run(session,`nodeRepl.write(JSON.stringify(await b.getAXState({includeScreenshot:false,emit:false})));`);
  await run(session,`await a.click(${index(a,'Separate windows')},{clickMethod:'accessibility'});await b.click(${index(b,'Focus keys')},{clickMethod:'accessibility'});nodeRepl.write(JSON.stringify(true));`);
  let ax=await run(session,`nodeRepl.write(JSON.stringify((await b.getAXStateAndScreenshot({textLimit:'max',emit:false})).state));`);
  const text=Array.from({length:60},(_,i)=>`row-${i} `+'abcdefghij'.repeat(20)).join('\n')+'\n';
  await run(session,`await b.typeText(${JSON.stringify(text)},${index(ax,'Notes B')});await b.click(${index(ax,'Focus entry')},{clickMethod:'accessibility'});nodeRepl.write(JSON.stringify(true));`);
  await until(async()=>(await state()).scrollLimits.B.every(value=>value>0));
  const observe=async()=>await run(session,`var observation=await b.getAXStateAndScreenshot({textLimit:'max',emit:false});nodeRepl.write(JSON.stringify({state:observation.state,width:observation.screenshot.readUInt32BE(16)}));`);
  let observation=await observe();ax=observation.state;let notes=index(ax,'Notes B'),point=(await state()).scrollPoints.B,sent=0;
  const delta=[0,0];
  for(const [direction,pages,target,steps,axis,sign] of [['down',0.25,point,3,1,1],['up',0.125,notes,2,1,-1],['right',0.25,point,3,0,1],['left',0.25,notes,3,0,-1]]){
   const before=(await state()).scrollOffsets.B[axis],limit=(await state()).scrollLimits.B[axis],canMove=sign>0?before<limit-0.01:before>0.01;
   await run(session,`await b.scroll(${JSON.stringify(target)},${JSON.stringify(direction)},${pages});nodeRepl.write(JSON.stringify(true));`);sent+=steps;
   await until(async()=>(await state()).scroll.B.length===sent);
   if(canMove)await until(async()=>((await state()).scrollOffsets.B[axis]-before)*sign>0.01);
   const after=await state();delta[axis]+=Math.abs(after.scrollOffsets.B[axis]-before);
   assert.deepEqual(after.scroll.B.slice(-steps).map(e=>e.direction),Array(steps).fill(direction));
   for(const event of after.scroll.B.slice(-steps)){
    assert.ok(Math.abs(event.rootX-(after.windowPositions.B[0]+point[0]))<=2);assert.ok(Math.abs(event.rootY-(after.windowPositions.B[1]+point[1]))<=2);
   }
   assert.ok((after.scrollOffsets.B[axis]-before)*sign>=-0.01);assert.equal(after.values.B,'initial-B');assert.equal(after.focused.B,true);assert.deepEqual(after.keyEvents.B,[]);assert.deepEqual(after.scroll.A,[]);
  }
  assert.ok(delta.every(value=>value>0),'GTK pane offsets did not change on both axes');
  await run(session,`await b.scroll(${notes},'down');nodeRepl.write(JSON.stringify(true));`);sent+=12;await until(async()=>(await state()).scroll.B.length===sent);
  const outside=await session.run(`await b.scroll([${observation.width},0],'down');`);assert.equal(outside.isError,true);assert.match(outside.content.at(-1).text,/outside the selected frame/);assert.equal((await state()).scroll.B.length,sent);
  ax=await run(session,`nodeRepl.write(JSON.stringify(await b.getAXState({includeScreenshot:false,textLimit:'max',emit:false})));`);notes=index(ax,'Notes B');
  const omitted=await session.run(`await b.scroll(${JSON.stringify(point)},'down');`);assert.equal(omitted.isError,true);assert.match(omitted.content.at(-1).text,/Screenshot omitted/);
  await run(session,`await b.scroll(${notes},'up',0.01);nodeRepl.write(JSON.stringify(true));`);sent++;await until(async()=>(await state()).scroll.B.length===sent);
  observation=await observe();ax=observation.state;notes=index(ax,'Notes B');
  await run(session,`await b.click(${index(ax,'Intercept pointer')},{clickMethod:'accessibility'});nodeRepl.write(JSON.stringify(true));`);
  const intercepted=await session.run(`await b.scroll(${index(ax,'Key surface B')},'down');`);assert.equal(intercepted.isError,true);assert.match(intercepted.content.at(-1).text,/pointer target/);assert.equal((await state()).scroll.B.length,sent);
  await run(session,`await b.click(${index(ax,'Intercept pointer')},{clickMethod:'accessibility'});nodeRepl.write(JSON.stringify(true));`);
  const grabbed=await session.run(`await b.scroll(${notes},'down');`);assert.equal(grabbed.isError,true);assert.match(grabbed.content.at(-1).text,/grab unavailable/);assert.equal((await state()).scroll.B.length,sent);
  await run(session,`await b.click(${index(ax,'Separate windows')},{clickMethod:'accessibility'});await b.click(${index(ax,'Occlude B')},{clickMethod:'accessibility'});nodeRepl.write(JSON.stringify(true));`);
  const occluded=await session.run(`await b.scroll(${notes},'down');`);assert.equal(occluded.isError,true);assert.match(occluded.content.at(-1).text,/occluded/);assert.equal((await state()).scroll.B.length,sent);
  await run(session,`await b.click(${index(ax,'Separate windows')},{clickMethod:'accessibility'});nodeRepl.write(JSON.stringify(true));`);
  const inactive=await session.run(`await a.scroll(${index(a,'Notes A')},'down');`);assert.equal(inactive.isError,true);assert.match(inactive.content.at(-1).text,/inactive/);assert.deepEqual((await state()).scroll.A,[]);
  await run(session,`await a.click(${index(a,'Replace entry')},{clickMethod:'accessibility'});nodeRepl.write(JSON.stringify(true));`);
  const stale=await session.run(`await a.scroll(${index(a,'Editor A')},'down');`);assert.equal(stale.isError,true);assert.match(stale.content.at(-1).text,/removed or replaced/);assert.deepEqual((await state()).scroll.A,[]);
  for(const action of ['reset','close']){
   const before=(await state()).scroll.B.length;
   const pending=session.run(`await b.scroll(${notes},'down',1000);`,30000);
   await until(async()=>(await state()).scroll.B.length>before);
   await session[action]();assert.equal((await pending).isError,true);
   const stopped=(await state()).scroll.B.length;await new Promise(r=>setTimeout(r,150));assert.equal((await state()).scroll.B.length,stopped);process.kill(pid,0);
   assert.deepEqual((await state()).keyEvents.B,[]);
   if(action==='reset'){
    ax=await run(session,`var b=await cua.getApp({windowId:${bId}},{initialState:false});nodeRepl.write(JSON.stringify(await b.getAXState({includeScreenshot:false,textLimit:'max',emit:false})));`);notes=index(ax,'Notes B');
    await run(session,`await b.scroll(${notes},'up',0.01);nodeRepl.write(JSON.stringify(true));`);await until(async()=>(await state()).scroll.B.length===stopped+1);
   }
  }
  console.log(`${Session.name} PASS coordinate/index four-axis wheel recipients, fractional/default counts, actual GTK pane offsets independent of keyboard focus, AX-only indexed use, outside/intercepted/grabbed/occluded/inactive/stale rejection and reset/close stop with fresh input`);
 }catch(error){try{process.stderr.write((await readFile(root+'/fixture-errors.log','utf8')).slice(-4000));process.stderr.write(JSON.stringify(await state())+'\n');}catch{}throw error;}finally{await session.close();await native.close();if(pid)try{process.kill(pid,'SIGTERM');}catch(e){if(e.code!=='ESRCH')throw e;}await rm(root,{recursive:true,force:true});}
}
