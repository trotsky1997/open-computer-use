// Owns its XDG registry, D-Bus session, Xvfb display and activated GTK service.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {LazyNativePeer,PersistentJavaScriptSession,WorkerJavaScriptSession} from '../node-repl/open-computer-use-repl.mjs';
const self=fileURLToPath(import.meta.url),[binary,mode]=process.argv.slice(2);assert.ok(binary,'Pass the Linux native binary');assert.equal(process.platform,'linux');
const pause=()=>new Promise(resolve=>setTimeout(resolve,40));
async function until(fn){const end=Date.now()+15000;for(;;){const value=await fn();if(value)return value;assert.ok(Date.now()<end,'Timed out waiting for owned D-Bus activation');await pause();}}
async function run(session,code){const result=await session.run(code,30000);assert.equal(result.isError,false,JSON.stringify(result.content));return JSON.parse(result.content.at(-1).text);}
if(mode!=='--session'){
 const root=await mkdtemp(path.join(tmpdir(),'ocu-dbus-launch-')),data=path.join(root,'data'),runtime=path.join(root,'runtime');
 const id='org.ocu.Launch'+path.basename(root).replaceAll('-',''),name='Owned D-Bus launch '+path.basename(root);
 try{
  for(const dir of ['applications','dbus-1/services'])await mkdir(path.join(data,dir),{recursive:true});await mkdir(runtime,{mode:0o700});
  const fixture=fileURLToPath(new URL('./linux-dbus-launch-fixture.py',import.meta.url));
  for(const suffix of ['', '-Missing','-Reject','-Hold'])await writeFile(path.join(data,'applications',id+suffix+'.desktop'),`[Desktop Entry]\nType=Application\nName=${name}${suffix}\n${suffix?`Exec=/usr/bin/python3 "${fixture}" --fallback\n`:''}DBusActivatable=true\nTerminal=false\n`);
  await writeFile(path.join(data,'applications','invalid.desktop'),`[Desktop Entry]\nType=Application\nName=Invalid ID\nExec=/usr/bin/python3 "${fixture}" --fallback\nDBusActivatable=true\n`);
  await writeFile(path.join(data,'dbus-1/services',id+'.service'),`[D-BUS Service]\nName=${id}\nExec=/usr/bin/python3 ${fixture} --gapplication-service\n`);
  const child=spawn('xvfb-run',['-a','dbus-run-session','--',process.execPath,self,path.resolve(binary),'--session'],{env:{...process.env,XDG_DATA_HOME:data,XDG_DATA_DIRS:'/usr/local/share:/usr/share',XDG_RUNTIME_DIR:runtime,GTK_MODULES:'gail:atk-bridge',NO_AT_BRIDGE:'0',GTK_A11Y:'always',GDK_BACKEND:'x11',DESKTOP_STARTUP_ID:'',XDG_ACTIVATION_TOKEN:'',OCU_LAUNCH_FIXTURE_ROOT:root,OCU_LAUNCH_FIXTURE_NAME:name,OCU_LAUNCH_FIXTURE_ID:id},stdio:'inherit'});
  await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>code===0?resolve():reject(Error(`Owned D-Bus controller exited ${code??signal}`)));});
 }finally{await rm(root,{recursive:true,force:true});}
}else{
 const root=process.env.OCU_LAUNCH_FIXTURE_ROOT,name=process.env.OCU_LAUNCH_FIXTURE_NAME,id=process.env.OCU_LAUNCH_FIXTURE_ID;let pid;
 const state=async()=>{try{return JSON.parse(await readFile(path.join(root,'state.json'),'utf8'));}catch{return null;}};
 try{
  for(const Session of [PersistentJavaScriptSession,WorkerJavaScriptSession]){
   const tokens={'desktop-startup-id':`owned-startup-${Session.name}`,'activation-token':`owned-token-${Session.name}`};
   const native=new LazyNativePeer({command:binary,args:['mcp'],env:{...process.env,DESKTOP_STARTUP_ID:tokens['desktop-startup-id'],XDG_ACTIVATION_TOKEN:tokens['activation-token']}}),session=new Session({native});
   try{
    const before=(await state())?.activations??0;
    for(const rejected of [id+'-Missing.desktop','invalid.desktop']){
     const failure=await session.run(`await cua.computer.launch_app({app:${JSON.stringify(rejected)}});`);assert.equal(failure.isError,true);
     assert.match(JSON.stringify(failure.content),rejected==='invalid.desktop'?/Invalid D-Bus/:/D-Bus activation failed/);
     await assert.rejects(readFile(path.join(root,'exec-fallback')),{code:'ENOENT'});
    }
    await run(session,`await cua.computer.launch_app({app:${JSON.stringify(id+'.desktop')}});nodeRepl.write(JSON.stringify(true));`);
    const activated=await until(async()=>{const value=await state();return value?.activations===before+1?value:null;});pid??=activated.pid;assert.equal(activated.pid,pid);assert.equal(activated.starter,'session');assert.ok(activated.args.includes('--gapplication-service'));assert.deepEqual(activated.platformData,tokens);
    await until(async()=>{const r=await session.run(`var app=await cua.getApp(${JSON.stringify(name)},{initialState:false});nodeRepl.write(JSON.stringify((await app.getAXState({includeScreenshot:false,emit:false})).includes('Owned D-Bus launch fixture ready')));`);return !r.isError&&JSON.parse(r.content.at(-1).text);});
    const denied=await session.run(`await cua.computer.launch_app({app:${JSON.stringify(id+'-Reject.desktop')}});`);assert.equal(denied.isError,true);assert.match(JSON.stringify(denied.content),/org.ocu.Denied/);assert.equal((await state()).activations,before+1);
    await session.endTurn();assert.equal(native.peer,null);process.kill(pid,0);
    await run(session,`await cua.computer.launch_app({app:${JSON.stringify(name)}});nodeRepl.write(JSON.stringify(true));`);
    await until(async()=>{const value=await state();return value?.activations===before+2&&value.pid===pid;});
    assert.deepEqual((await state()).platformData,tokens);
    async function cancel(action){
     const pending=session.run(`await cua.computer.launch_app({app:${JSON.stringify(id+'-Hold.desktop')}});`,30000);
     const held=await until(async()=>{try{return JSON.parse(await readFile(path.join(root,'hold.json'),'utf8'));}catch{return null;}});
     await session[action]();assert.equal((await pending).isError,true);assert.throws(()=>process.kill(held.helperPid,0),{code:'ESRCH'});process.kill(pid,0);assert.equal((await state()).activations,before+2);await rm(path.join(root,'hold.json'));
    }
    await cancel('reset');
    assert.equal(await run(session,`var app=await cua.getApp(${JSON.stringify(name)},{initialState:false});nodeRepl.write(JSON.stringify((await app.getAXState({includeScreenshot:false,emit:false})).includes('Owned D-Bus launch fixture ready')));`),true);
    await cancel('close');await assert.rejects(readFile(path.join(root,'exec-fallback')),{code:'ENOENT'});
    console.log(`${Session.name} PASS real D-Bus service activation by ID/name, same-PID repeated Activate, per-request startup/token forwarding, AX readiness, method/missing/invalid-ID errors and reset/close reaping pending helpers with no Exec fallback`);
   }finally{await session.close();await native.close();}
  }
 }finally{pid??=(await state())?.pid;if(pid)try{process.kill(pid,'SIGTERM');}catch(error){if(error.code!=='ESRCH')throw error;}}
}
