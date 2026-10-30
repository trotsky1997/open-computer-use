// Runs only inside an owned dbus-run-session/Xvfb desktop.
import assert from 'node:assert/strict';
import {mkdtemp,copyFile,chmod,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {LazyNativePeer,WorkerJavaScriptSession,PersistentJavaScriptSession} from '../node-repl/open-computer-use-repl.mjs';
const [binary]=process.argv.slice(2);assert.ok(binary,'Pass the native Linux binary');
assert.equal(process.platform,'linux');
async function run(session,code){const result=await session.run(code,30000);assert.equal(result.isError,false,result.content.at(-1).text);return JSON.parse(result.content.at(-1).text);}
for(const Session of [PersistentJavaScriptSession,WorkerJavaScriptSession]){
 const root=await mkdtemp(path.join(tmpdir(),'ocu-launch-')),app=path.join(root,'owned editor $(literal) 你好'),name=`OCU launch fixture ${path.basename(root)}`;
 await copyFile(new URL('./linux-launch-fixture.py',import.meta.url),app);await chmod(app,0o700);
 const native=new LazyNativePeer({command:binary,args:['mcp'],env:{...process.env,OCU_LAUNCH_FIXTURE_ROOT:root,OCU_LAUNCH_FIXTURE_NAME:name}}),session=new Session({native});let pid;
 try{
  assert.equal(await run(session,`nodeRepl.write(JSON.stringify(cua.computer.target));`),'linux');assert.equal(native.peer,null,'platform lookup started the backend');
  assert.equal(await run(session,`var denied=false;try{await cua.computer.launch_app({app:${JSON.stringify(app)},args:['ignored']});}catch(e){denied=/launch_app requires/.test(e.message);}nodeRepl.write(JSON.stringify(denied));`),true);assert.equal(native.peer,null);
  await run(session,`await cua.computer.launch_app({app:${JSON.stringify(app)}});nodeRepl.write(JSON.stringify(true));`);
  const firstNative=native.peer.child.pid,deadline=Date.now()+15000;let state;
  while(!state){try{state=JSON.parse(await readFile(path.join(root,'state.json'),'utf8'));}catch{}if(Date.now()>deadline)throw Error('Fixture did not start');await new Promise(resolve=>setTimeout(resolve,50));}
  pid=state.pid;assert.deepEqual(state.args,[app]);assert.equal(state.sid,pid,'application did not get an independent session');
  await run(session,`var app=await cua.getApp(${JSON.stringify(name)},{initialState:false});nodeRepl.write(JSON.stringify(true));`);
  let observed=false;
  while(!observed){const result=await session.run(`nodeRepl.write(JSON.stringify((await app.getAXState({includeScreenshot:false,emit:false})).includes('Owned launch fixture ready')));`);observed=!result.isError&&JSON.parse(result.content.at(-1).text);if(Date.now()>deadline)throw Error('Launched GTK window did not become observable');if(!observed)await new Promise(resolve=>setTimeout(resolve,100));}
  await session.endTurn();process.kill(pid,0);assert.equal(native.peer,null);
  assert.equal(await run(session,`nodeRepl.write(JSON.stringify((await app.getAXState({includeScreenshot:false,emit:false})).includes('Owned launch fixture ready')));`),true);assert.notEqual(native.peer.child.pid,firstNative);
  await session.reset();process.kill(pid,0);
  assert.equal(await run(session,`var app=await cua.getApp(${JSON.stringify(name)},{initialState:false});nodeRepl.write(JSON.stringify((await app.getAXState({includeScreenshot:false,emit:false})).includes('Owned launch fixture ready')));`),true);
  await session.close();process.kill(pid,0);
  console.log(`${Session.name} PASS Linux target, no lazy startup, literal executable/stdio isolation, GTK observation and persistence across turn/native replacement/reset/close`);
 }finally{await session.close();await native.close();if(pid)try{process.kill(pid,'SIGTERM');}catch(error){if(error.code!=='ESRCH')throw error;}await rm(root,{recursive:true,force:true});}
}
