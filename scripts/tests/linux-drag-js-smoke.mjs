// Owned GTK/D-Bus/Xvfb desktop; all pointer receivers and input are synthetic.
import assert from 'node:assert/strict';
import {mkdtemp,copyFile,chmod,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {LazyNativePeer,PersistentJavaScriptSession,WorkerJavaScriptSession} from '../node-repl/open-computer-use-repl.mjs';
const [binary]=process.argv.slice(2);assert.ok(binary);assert.equal(process.platform,'linux');
const pause=()=>new Promise(resolve=>setTimeout(resolve,30));
async function until(fn){const deadline=Date.now()+15000;for(;;){const value=await fn();if(value)return value;assert.ok(Date.now()<deadline,'Owned fixture did not settle');await pause();}}
async function run(session,code){const result=await session.run(code,30000);assert.equal(result.isError,false,result.content.at(-1).text);return JSON.parse(result.content.at(-1).text);}
function index(text,label){const line=text.split('\n').find(line=>line.includes(label));assert.ok(line,`Missing ${label}: ${text}`);return Number(line.match(/^\s*(\d+)/u)[1]);}
for(const Session of [PersistentJavaScriptSession,WorkerJavaScriptSession]){
 const root=await mkdtemp(path.join(tmpdir(),'ocu-drag-')),app=path.join(root,'fixture'),name=path.basename(root);let pid;
 await copyFile(new URL('./linux-window-fixture.py',import.meta.url),app);await chmod(app,0o700);
 // Pause the actual runtime after its first held motion; SIGTERM must release it.
 await writeFile(root+'/python3',`#!/usr/bin/python3
import os,sys,json,runpy,time
payload=sys.stdin.buffer.read();op=json.loads(payload)
fd=os.memfd_create('ocu-operation');os.write(fd,payload);os.lseek(fd,0,0);os.dup2(fd,0)
root=os.environ['OCU_WINDOW_FIXTURE_ROOT']
if op.get('tool')=='drag' and os.path.exists(root+'/arm'):
    sys.path.insert(0,os.path.dirname(sys.argv[1]))
    import x11_capture
    sleep=time.sleep
    def gate(_duration):
        with open(root+'/ready','w') as f: json.dump({'pid':os.getpid()},f)
        while True: sleep(.02)
    x11_capture.time.sleep=gate
    script=sys.argv[1];sys.argv=[script,*sys.argv[2:]]
    runpy.run_path(script,run_name='__main__')
else:
    os.execv('/usr/bin/python3',['/usr/bin/python3',*sys.argv[1:]])
`,{mode:0o700});
 const native=new LazyNativePeer({command:binary,args:['mcp'],env:{...process.env,PATH:root+':'+process.env.PATH,OCU_WINDOW_FIXTURE_ROOT:root,OCU_WINDOW_FIXTURE_NAME:name,OPEN_COMPUTER_USE_ACTION_READ_BACK:'0'}}),session=new Session({native});
 const state=async()=>JSON.parse(await readFile(root+'/state.json','utf8'));
 const presses=s=>s.pointer.B.filter(e=>e.phase==='press'&&e.type==='button-press');
 const releases=s=>s.pointer.B.filter(e=>e.phase==='release');
 const observe=async()=>await run(session,`var observation=await b.getAXStateAndScreenshot({emit:false});nodeRepl.write(JSON.stringify({state:observation.state,width:observation.screenshot.readUInt32BE(16)}));`);
 try{
  await run(session,`await cua.computer.launch_app({app:${JSON.stringify(app)}});nodeRepl.write(JSON.stringify(true));`);
  const windows=await until(async()=>{const w=(await run(session,`nodeRepl.write(JSON.stringify(await cua.listWindows({emit:false})));`)).filter(w=>w.app===name);return w.length===2?w:null;});pid=(await state()).pid;
  const first=await run(session,`var first=await cua.getApp({windowId:${windows[0].id}},{initialState:false});nodeRepl.write(JSON.stringify(await first.getAXState({includeScreenshot:false,emit:false})));`),aId=first.includes('Window A')?windows[0].id:windows[1].id,bId=windows.find(w=>w.id!==aId).id;
  const a=await run(session,`var a=await cua.getApp({windowId:${aId}},{initialState:false});var b=await cua.getApp({windowId:${bId}},{initialState:false});nodeRepl.write(JSON.stringify(await a.getAXState({includeScreenshot:false,emit:false})));`),b=await run(session,`nodeRepl.write(JSON.stringify(await b.getAXState({includeScreenshot:false,emit:false})));`);
  await run(session,`await a.click(${index(a,'Separate windows')},{clickMethod:'accessibility'});await b.click(${index(b,'Focus keys')},{clickMethod:'accessibility'});nodeRepl.write(JSON.stringify(true));`);
  let observation=await observe();const point=(await state()).pointerPoints.B,start=[point[0]-40,point[1]],end=[point[0]+40,point[1]],size=(await state()).pointerSizes.B;
  let sent=0;
  for(const [from,to] of [[start,end],[end,start]]){
   const motions=(await state()).pointerMotion.B.length;
   await run(session,`await b.drag(${JSON.stringify(from)},${JSON.stringify(to)});nodeRepl.write(JSON.stringify(true));`);sent++;
   await until(async()=>releases(await state()).length===sent);
   const received=await state(),down=presses(received).at(-1),up=releases(received).at(-1),moves=received.pointerMotion.B.slice(motions);
   assert.equal(presses(received).length,sent);assert.equal(down.button,1);assert.equal(up.button,1);
   assert.ok(Math.abs(down.x-(Math.floor(size[0]/2)+from[0]-point[0]))<=1);assert.ok(Math.abs(up.x-(Math.floor(size[0]/2)+to[0]-point[0]))<=1);
   assert.ok(moves.length>0);assert.ok(moves.every(e=>(e.state&256)!==0));assert.deepEqual(received.pointer.A,[]);
  }
  for(const [code,pattern] of [
   [`await b.drag(${JSON.stringify(start)},[${observation.width},0]);`,/outside the selected frame/],
   [`await a.drag([1,1],[20,20]);`,/Screenshot omitted/]
  ]){const result=await session.run(code);assert.equal(result.isError,true);assert.match(result.content.at(-1).text,pattern);assert.equal(presses(await state()).length,sent);}
  await run(session,`await b.click(${index(observation.state,'Intercept pointer')},{clickMethod:'accessibility'});nodeRepl.write(JSON.stringify(true));`);
  const intercepted=await session.run(`await b.drag(${JSON.stringify(point)},${JSON.stringify(end)});`);assert.equal(intercepted.isError,true);assert.match(intercepted.content.at(-1).text,/pointer target/);assert.equal(presses(await state()).length,sent);
  await run(session,`await b.click(${index(observation.state,'Intercept pointer')},{clickMethod:'accessibility'});nodeRepl.write(JSON.stringify(true));`);
  const grabbed=await session.run(`await b.drag(${JSON.stringify(start)},${JSON.stringify(end)});`);assert.equal(grabbed.isError,true);assert.match(grabbed.content.at(-1).text,/grab unavailable/);assert.equal(presses(await state()).length,sent);
  await run(session,`await b.click(${index(observation.state,'Separate windows')},{clickMethod:'accessibility'});await b.click(${index(observation.state,'Occlude B')},{clickMethod:'accessibility'});nodeRepl.write(JSON.stringify(true));`);
  const occluded=await session.run(`await b.drag(${JSON.stringify(start)},${JSON.stringify(end)});`);assert.equal(occluded.isError,true);assert.match(occluded.content.at(-1).text,/occluded/);assert.equal(presses(await state()).length,sent);
  await run(session,`await b.click(${index(observation.state,'Separate windows')},{clickMethod:'accessibility'});await a.click(${index(a,'Focus keys')},{clickMethod:'accessibility'});nodeRepl.write(JSON.stringify(true));`);
  const inactive=await session.run(`await b.drag(${JSON.stringify(start)},${JSON.stringify(end)});`);assert.equal(inactive.isError,true);assert.match(inactive.content.at(-1).text,/inactive/);assert.equal(presses(await state()).length,sent);
  await run(session,`await b.click(${index(observation.state,'Focus keys')},{clickMethod:'accessibility'});nodeRepl.write(JSON.stringify(true));`);
  for(const action of ['reset','close']){
   await writeFile(root+'/arm','go');
   let ended;const pending=session.run(`await b.drag(${JSON.stringify(start)},${JSON.stringify(end)});`,30000);pending.then(result=>{ended=result;});
   const gate=await until(async()=>{if(ended)assert.fail(ended.content.at(-1).text);try{return JSON.parse(await readFile(root+'/ready','utf8'));}catch{return null;}});
   await session[action]();assert.equal((await pending).isError,true);sent++;
   assert.throws(()=>process.kill(gate.pid,0),{code:'ESRCH'});
   await until(async()=>releases(await state()).length===sent);
   assert.equal(presses(await state()).length,sent);assert.ok(releases(await state()).at(-1).x<Math.floor(size[0]/2)+40);process.kill(pid,0);
   await rm(root+'/arm');await rm(root+'/ready');
   if(action==='reset'){
    await run(session,`var b=await cua.getApp({windowId:${bId}},{initialState:false});nodeRepl.write(JSON.stringify(true));`);observation=await observe();
    await run(session,`await b.drag(${JSON.stringify(end)},${JSON.stringify(start)});nodeRepl.write(JSON.stringify(true));`);sent++;await until(async()=>releases(await state()).length===sent);
   }
  }
  console.log(`${Session.name} PASS exact bidirectional drag endpoints, held motion, one press/release, rejection before input, mid-drag reset/close release and fresh post-reset drag`);
 }catch(error){try{process.stderr.write((await readFile(root+'/fixture-errors.log','utf8')).slice(-4000));process.stderr.write(JSON.stringify(await state())+'\n');}catch{}throw error;}finally{await session.close();await native.close();if(pid)try{process.kill(pid,'SIGTERM');}catch(e){if(e.code!=='ESRCH')throw e;}await rm(root,{recursive:true,force:true});}
}
