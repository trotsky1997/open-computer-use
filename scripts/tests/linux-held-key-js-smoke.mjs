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
 const root=await mkdtemp(path.join(tmpdir(),'ocu-held-key-')),app=path.join(root,'fixture'),name=path.basename(root);let pid;
 await copyFile(new URL('./linux-window-fixture.py',import.meta.url),app);await chmod(app,0o700);
 const native=new LazyNativePeer({command:binary,args:['mcp'],env:{...process.env,OCU_WINDOW_FIXTURE_ROOT:root,OCU_WINDOW_FIXTURE_NAME:name,OPEN_COMPUTER_USE_ACTION_READ_BACK:'0',OPEN_COMPUTER_USE_ALLOW_GLOBAL_POINTER_FALLBACKS:'1'}}),session=new Session({native});
 const state=async()=>JSON.parse(await readFile(root+'/state.json','utf8'));
 const down=s=>s.pointer.B.filter(e=>e.phase==='press'&&e.type==='button-press'),up=s=>s.pointer.B.filter(e=>e.phase==='release');
 try{
  await run(session,`await cua.computer.launch_app({app:${JSON.stringify(app)}});nodeRepl.write(JSON.stringify(true));`);
  const windows=await until(async()=>{const w=(await run(session,`nodeRepl.write(JSON.stringify(await cua.listWindows({emit:false})));`)).filter(w=>w.app===name);return w.length===2?w:null;});pid=(await state()).pid;
  const first=await run(session,`var first=await cua.getApp({windowId:${windows[0].id}},{initialState:false});nodeRepl.write(JSON.stringify(await first.getAXState({includeScreenshot:false,emit:false})));`),aId=first.includes('Window A')?windows[0].id:windows[1].id,bId=windows.find(w=>w.id!==aId).id;
  const a=await run(session,`var a=await cua.getApp({windowId:${aId}},{initialState:false});var b=await cua.getApp({windowId:${bId}},{initialState:false});nodeRepl.write(JSON.stringify(await a.getAXState({includeScreenshot:false,emit:false})));`),b=await run(session,`nodeRepl.write(JSON.stringify(await b.getAXState({includeScreenshot:false,emit:false})));`);
  await run(session,`await a.click(${index(a,'Separate windows')},{clickMethod:'accessibility'});await b.click(${index(b,'Focus keys')},{clickMethod:'accessibility'});nodeRepl.write(JSON.stringify(true));`);
  let ax=await run(session,`nodeRepl.write(JSON.stringify(await b.getAXState({includeScreenshot:false,emit:false})));`);
  for(const [key,duration,mask] of [['shift+ctrl',150,5],['ctrl+a',80,4],['shift+shift',0,1],['Return',0,0]]){
   const start=(await state()).keyEvents.B.length;
   await run(session,`await b.pressKey(${JSON.stringify(key)},{durationMs:${duration}});nodeRepl.write(JSON.stringify(true));`);
   const events=(await state()).keyEvents.B.slice(start),pressed=events.filter(e=>e.phase==='press'),released=events.filter(e=>e.phase==='release');
   assert.ok(pressed.length>0);assert.deepEqual(released.map(e=>e.code),pressed.map(e=>e.code).reverse());
   assert.ok(released[0].time-pressed.at(-1).time>=duration-15);
   assert.equal(released[0].state&5,mask);assert.deepEqual((await state()).pointer.B,[]);assert.deepEqual((await state()).keyEvents.A,[]);
  }
  let count=(await state()).keyEvents.B.length;
  for(const [key,options] of [['ctrl++a',{durationMs:0}],['not_a_native_key',{durationMs:0}],['Caps_Lock',{durationMs:0}],['shift',{durationMs:0,keyMethod:'sky_key'}]]){
   assert.equal((await session.run(`await b.pressKey(${JSON.stringify(key)},${JSON.stringify(options)});`)).isError,true);assert.equal((await state()).keyEvents.B.length,count);
  }
  const inactive=await session.run(`await a.pressKey('shift',{durationMs:0});`);assert.equal(inactive.isError,true);assert.match(inactive.content.at(-1).text,/inactive/);assert.deepEqual((await state()).keyEvents.A,[]);
  await run(session,`await b.click(${index(ax,'Occlude B')},{clickMethod:'accessibility'});nodeRepl.write(JSON.stringify(true));`);
  const occluded=await session.run(`await b.pressKey('shift',{durationMs:0});`);assert.equal(occluded.isError,true);assert.match(occluded.content.at(-1).text,/occluded/);assert.equal((await state()).keyEvents.B.length,count);
  await run(session,`await b.click(${index(ax,'Separate windows')},{clickMethod:'accessibility'});await b.click(${index(ax,'Focus keys')},{clickMethod:'accessibility'});nodeRepl.write(JSON.stringify(true));`);
  for(const action of ['reset','close']){
   const start=(await state()).keyEvents.B.length;
   const pending=session.run(`await b.pressKey('shift+ctrl',{durationMs:10000});`,30000);
   await until(async()=>(await state()).keyEvents.B.slice(start).filter(e=>e.phase==='press').length===2);
   await session[action]();assert.equal((await pending).isError,true);
   await until(async()=>(await state()).keyEvents.B.slice(start).filter(e=>e.phase==='release').length===2);
   const events=(await state()).keyEvents.B.slice(start),pressed=events.filter(e=>e.phase==='press'),released=events.filter(e=>e.phase==='release');
   assert.deepEqual(released.map(e=>e.code),pressed.map(e=>e.code).reverse());assert.ok(released[0].time-pressed.at(-1).time<10000);process.kill(pid,0);
   assert.deepEqual((await state()).pointer.B,[]);
   if(action==='reset'){
    await run(session,`var b=await cua.getApp({windowId:${bId}},{initialState:false});nodeRepl.write(JSON.stringify(await b.getAXState({includeScreenshot:false,emit:false})));`);
    await run(session,`await b.pressKey('ctrl+a',{durationMs:0});nodeRepl.write(JSON.stringify(true));`);
   }
  }
  console.log(`${Session.name} PASS modifier/ordinary timed chords, receiver timing, duplicates/zero duration, AX-only use, inactive/occluded/invalid rejection and reverse reset/close releases without mouse events`);
 }catch(error){try{process.stderr.write((await readFile(root+'/fixture-errors.log','utf8')).slice(-4000));process.stderr.write(JSON.stringify(await state())+'\n');}catch{}throw error;}finally{await session.close();await native.close();if(pid)try{process.kill(pid,'SIGTERM');}catch(e){if(e.code!=='ESRCH')throw e;}await rm(root,{recursive:true,force:true});}
}
