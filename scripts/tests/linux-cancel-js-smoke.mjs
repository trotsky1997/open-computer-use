// Owned GTK/D-Bus/Xvfb desktop only. Gate the real child before input delivery.
import assert from 'node:assert/strict';
import {mkdtemp,copyFile,chmod,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {LazyNativePeer,PersistentJavaScriptSession,WorkerJavaScriptSession} from '../node-repl/open-computer-use-repl.mjs';
const [binary]=process.argv.slice(2);assert.ok(binary);assert.equal(process.platform,'linux');
const pause=()=>new Promise(resolve=>setTimeout(resolve,30));
async function until(fn){const end=Date.now()+15000;for(;;){const value=await fn();if(value)return value;assert.ok(Date.now()<end,'Timed out waiting for owned fixture');await pause();}}
async function run(session,code){const r=await session.run(code,30000);assert.equal(r.isError,false,r.content.at(-1).text);return JSON.parse(r.content.at(-1).text);}
for(const Session of [PersistentJavaScriptSession,WorkerJavaScriptSession]){
 const root=await mkdtemp(path.join(tmpdir(),'ocu-cancel-')),app=path.join(root,'fixture'),name=path.basename(root);let pid,child;
 await copyFile(new URL('./linux-window-fixture.py',import.meta.url),app);await chmod(app,0o700);
 await writeFile(root+'/python3',`#!/usr/bin/python3
import os,sys,json,time
payload=sys.stdin.buffer.read()
op=json.loads(payload)
if op.get('text','').startswith('cancel-'):
    with open(os.environ['OCU_CANCEL_ROOT']+'/ready','w') as f: json.dump({'pid':os.getpid(),'script':sys.argv[1]},f)
    while not os.path.exists(os.environ['OCU_CANCEL_ROOT']+'/release'): time.sleep(.02)
fd=os.memfd_create('ocu-operation')
os.write(fd,payload);os.lseek(fd,0,0);os.dup2(fd,0)
os.execv('/usr/bin/python3',['/usr/bin/python3',*sys.argv[1:]])
`,{mode:0o700});
 const native=new LazyNativePeer({command:binary,args:['mcp'],env:{...process.env,PATH:root+':'+process.env.PATH,OCU_CANCEL_ROOT:root,OCU_WINDOW_FIXTURE_ROOT:root,OCU_WINDOW_FIXTURE_NAME:name,OPEN_COMPUTER_USE_ACTION_READ_BACK:'0'}}),session=new Session({native});
 const state=async()=>JSON.parse(await readFile(root+'/state.json','utf8'));
 try{
  await run(session,`await cua.computer.launch_app({app:${JSON.stringify(app)}});nodeRepl.write(JSON.stringify(true));`);
  const windows=await until(async()=>{const w=(await run(session,`nodeRepl.write(JSON.stringify(await cua.listWindows({emit:false})));`)).filter(w=>w.app===name);return w.length===2?w:null;});pid=(await state()).pid;
  const observe=async()=>await run(session,`var a=await cua.getApp({windowId:${windows[0].id}},{initialState:false});var ax=await a.getAXState({includeScreenshot:false,emit:false});nodeRepl.write(JSON.stringify(ax));`);
  let ax=await observe();const label=ax.includes('Window A')?'A':'B';
  for(const action of ['reset','close']){
   const line=ax.split('\n').find(l=>l.includes('Editor '+label));assert.ok(line,ax);const index=Number(line.match(/^\s*(\d+)/u)[1]);
   const before=(await state()).values[label];
   const pending=session.run(`await a.typeText('cancel-${action}',${index});`,30000);
   const gate=await until(async()=>{try{return JSON.parse(await readFile(root+'/ready','utf8'));}catch{return null;}});child=gate.pid;
   await session[action]();
   const result=await pending;assert.equal(result.isError,true);
   assert.throws(()=>process.kill(child,0),{code:'ESRCH'});child=null;
   await writeFile(root+'/release','go');await pause();assert.equal((await state()).values[label],before);process.kill(pid,0);
   await rm(root+'/ready');await rm(root+'/release');
   if(action==='reset'){
    ax=await observe();const fresh=Number(ax.split('\n').find(l=>l.includes('Editor '+label)).match(/^\s*(\d+)/u)[1]);
    await run(session,`await a.typeText('after-reset',${fresh});nodeRepl.write(JSON.stringify(true));`);
    assert.ok((await state()).values[label].includes('after-reset'));ax=await observe();
   }
  }
  console.log(`${Session.name} PASS reset/close reap active input child, prevent delayed GTK edits, preserve launched app, and allow fresh input after reset`);
 }finally{
  await session.close();await native.close();
  for(const owned of [child,pid])if(owned)try{process.kill(owned,'SIGTERM');}catch(e){if(e.code!=='ESRCH')throw e;}
  await rm(root,{recursive:true,force:true});
 }
}
