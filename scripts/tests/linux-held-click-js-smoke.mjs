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
 const root=await mkdtemp(path.join(tmpdir(),'ocu-held-')),app=path.join(root,'fixture'),name=path.basename(root);let pid;
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
  let ax=await run(session,`nodeRepl.write(JSON.stringify((await b.getAXStateAndScreenshot({emit:false})).state));`),surface=index(ax,'Key surface B');
  let sent=0;
  for(const [key,count,duration,mask] of [['shift+ctrl',2,150,5],['ctrl+a',1,70,4],[undefined,1,80,0],['shift+shift',1,0,1]]){
   const start=(await state()).keyEvents.B.length,options={key,clickCount:count,durationMs:duration};
   await run(session,`await b.click(${surface},${JSON.stringify(options)});nodeRepl.write(JSON.stringify(true));`);sent+=count;await until(async()=>up(await state()).length===sent);
   const received=await state();assert.equal(down(received).length,sent);assert.deepEqual(received.pointer.A,[]);
   for(let i=sent-count;i<sent;i++){assert.equal(down(received)[i].state&5,mask);assert.equal(up(received)[i].state&5,mask);assert.ok(up(received)[i].time-down(received)[i].time>=duration-15);}
   const events=received.keyEvents.B.slice(start),pressed=events.filter(e=>e.phase==='press'),released=events.filter(e=>e.phase==='release');
   if(key){assert.ok(pressed.length>0);assert.deepEqual(released.map(e=>e.code),pressed.map(e=>e.code).reverse());assert.ok(released[0].time>=up(received).at(-1).time);}
   else assert.deepEqual(events,[]);
  }
  for(const options of [{key:'shift',clickMethod:'accessibility'},{key:'not_a_native_key'},{key:'ctrl++a'},{key:'Caps_Lock'}]){
   const result=await session.run(`await b.click(${surface},${JSON.stringify(options)});`);assert.equal(result.isError,true);assert.equal(down(await state()).length,sent);
  }
  for(const action of ['reset','close']){
   const keyStart=(await state()).keyEvents.B.length;
   const pending=session.run(`await b.click(${surface},{key:'shift+ctrl',durationMs:10000,clickCount:3});`,30000);
   await until(async()=>down(await state()).length===sent+1);
   await session[action]();assert.equal((await pending).isError,true);sent++;
   await until(async()=>up(await state()).length===sent&&(await state()).keyEvents.B.slice(keyStart).filter(e=>e.phase==='release').length===2);
   const received=await state(),events=received.keyEvents.B.slice(keyStart);
   assert.equal(down(received).length,sent);assert.ok(up(received).at(-1).time-down(received).at(-1).time<10000);
   assert.deepEqual(events.filter(e=>e.phase==='release').map(e=>e.code),events.filter(e=>e.phase==='press').map(e=>e.code).reverse());process.kill(pid,0);
   if(action==='reset'){
    await run(session,`var b=await cua.getApp({windowId:${bId}},{initialState:false});nodeRepl.write(JSON.stringify(true));`);
    ax=await run(session,`nodeRepl.write(JSON.stringify((await b.getAXStateAndScreenshot({emit:false})).state));`);surface=index(ax,'Key surface B');
    await run(session,`await b.click(${surface},{key:'ctrl+a',durationMs:0,clickMethod:'global'});nodeRepl.write(JSON.stringify(true));`);sent++;await until(async()=>up(await state()).length===sent);
   }
  }
  console.log(`${Session.name} PASS held modifier/ordinary-key chords, sequence ownership, receiver durations, duplicate keys, zero dwell, invalid rejection, reset/close mouse and reverse key releases, fresh global input`);
 }catch(error){try{process.stderr.write((await readFile(root+'/fixture-errors.log','utf8')).slice(-4000));process.stderr.write(JSON.stringify(await state())+'\n');}catch{}throw error;}finally{await session.close();await native.close();if(pid)try{process.kill(pid,'SIGTERM');}catch(e){if(e.code!=='ESRCH')throw e;}await rm(root,{recursive:true,force:true});}
}
