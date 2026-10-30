// Run in an owned Linux private D-Bus/Xvfb desktop.
import assert from 'node:assert/strict';
import {mkdtemp,copyFile,chmod,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {LazyNativePeer,PersistentJavaScriptSession,WorkerJavaScriptSession} from '../node-repl/open-computer-use-repl.mjs';
const [binary]=process.argv.slice(2);assert.ok(binary);assert.equal(process.platform,'linux');
async function run(session,code){const result=await session.run(code,30000);assert.equal(result.isError,false,result.content.at(-1).text);return JSON.parse(result.content.at(-1).text);}
function index(text,label){const line=text.split('\n').find(line=>line.includes(label));assert.ok(line,`Missing ${label}: ${text}`);return Number(line.match(/^\s*(\d+)/u)[1]);}
for(const Session of [PersistentJavaScriptSession,WorkerJavaScriptSession]){
 const root=await mkdtemp(path.join(tmpdir(),'ocu-windows-')),executable=path.join(root,'fixture'),name=path.basename(root);let pid;
 await copyFile(new URL('./linux-window-fixture.py',import.meta.url),executable);await chmod(executable,0o700);
 const native=new LazyNativePeer({command:binary,args:['mcp'],env:{...process.env,OCU_WINDOW_FIXTURE_ROOT:root,OCU_WINDOW_FIXTURE_NAME:name,OPEN_COMPUTER_USE_ACTION_READ_BACK:'0'}}),session=new Session({native});
 const state=async()=>JSON.parse(await readFile(root+'/state.json','utf8'));
 try{
  await run(session,`await cua.computer.launch_app({app:${JSON.stringify(executable)}});nodeRepl.write(JSON.stringify(true));`);
  let windows=[];const deadline=Date.now()+15000;
  while(windows.length!==2){windows=(await run(session,`nodeRepl.write(JSON.stringify(await cua.listWindows({emit:false})));`)).filter(window=>window.app===name);if(Date.now()>deadline)throw Error('Fixture windows not registered');if(windows.length!==2)await new Promise(resolve=>setTimeout(resolve,50));}
  pid=(await state()).pid;assert.equal(windows[0].title,windows[1].title);assert.notEqual(windows[0].id,windows[1].id);
  const first=await run(session,`var first=await cua.getApp({windowId:${windows[0].id}},{initialState:false});nodeRepl.write(JSON.stringify(await first.getAXState({includeScreenshot:false,emit:false})));`);
  const aId=first.includes('Window A')?windows[0].id:windows[1].id,bId=windows.find(window=>window.id!==aId).id;
  const a=await run(session,`var a=await cua.getApp({windowId:${aId}},{initialState:false});var b=await cua.getApp({windowId:${bId}},{initialState:false});nodeRepl.write(JSON.stringify(await a.getAXState({includeScreenshot:false,emit:false})));`);
  const b=await run(session,`nodeRepl.write(JSON.stringify(await b.getAXState({includeScreenshot:false,emit:false})));`),aEntry=index(a,'Editor A'),bEntry=index(b,'Editor B');assert.equal(aEntry,bEntry);
  const screenshot=await session.run(`await a.getScreenshot({includeAX:false,emit:false});`);assert.equal(screenshot.isError,true);assert.match(screenshot.content.at(-1).text,/Screenshot unavailable/);
  await run(session,`await b.setValue(${bEntry},'B-cache-survived');await a.getAXState({includeScreenshot:false,emit:false});nodeRepl.write(JSON.stringify(true));`);
  await run(session,`await a.setValue(${aEntry},'only-A');await b.setValue(${bEntry},'only-B');nodeRepl.write(JSON.stringify(true));`);assert.deepEqual((await state()).values,{A:'only-A',B:'only-B'});
  await run(session,`await a.click(${index(a,'Replace entry')},{clickMethod:'accessibility'});nodeRepl.write(JSON.stringify(true));`);
  const stale=await session.run(`await a.setValue(${aEntry},'must-not-write');`);assert.equal(stale.isError,true);assert.match(stale.content.at(-1).text,/removed or replaced/);assert.equal((await state()).values.A,'replacement-entry');
  const freshA=await run(session,`nodeRepl.write(JSON.stringify(await a.getAXState({includeScreenshot:false,emit:false})));`);
  await run(session,`await a.click(${index(freshA,'Close window')},{clickMethod:'accessibility'});nodeRepl.write(JSON.stringify(true));`);
  const closed=await session.run(`await a.getAXState({includeScreenshot:false,emit:false});`);assert.equal(closed.isError,true);assert.match(closed.content.at(-1).text,/closed or replaced/);
  await run(session,`await b.setValue(${bEntry},'B-after-reorder');nodeRepl.write(JSON.stringify(true));`);assert.equal((await state()).values.B,'B-after-reorder');
  await run(session,`await b.click(${index(b,'Recreate A')},{clickMethod:'accessibility'});nodeRepl.write(JSON.stringify(true));`);
  const next=(await run(session,`nodeRepl.write(JSON.stringify(await cua.listWindows({emit:false})));`)).filter(window=>window.app===name);assert.equal(next.length,2);assert.ok(!next.some(window=>window.id===aId));assert.ok(next.some(window=>window.id===bId));
  assert.equal((await session.run(`await a.getAXState({includeScreenshot:false,emit:false});`)).isError,true);
  await session.endTurn();assert.equal(await run(session,`nodeRepl.write(JSON.stringify((await b.getAXState({includeScreenshot:false,emit:false})).includes('Window B')));`),true);
  const stable=(await run(session,`nodeRepl.write(JSON.stringify(await cua.listWindows({emit:false})));`)).filter(window=>window.app===name);assert.deepEqual(stable.map(window=>window.id).sort(),next.map(window=>window.id).sort());
  await session.reset();assert.equal(await run(session,`var b=await cua.getApp({windowId:${bId}},{initialState:false});nodeRepl.write(JSON.stringify((await b.getAXState({includeScreenshot:false,emit:false})).includes('B-after-reorder')));`),true);
  console.log(`${Session.name} PASS same-title/same-process windows, cache isolation, exact stale element/window rejection, reordered children, recreation and peer/turn/reset identity`);
 }finally{await session.close();await native.close();if(!pid)try{pid=(await state()).pid;}catch{}if(pid)try{process.kill(pid,'SIGTERM');}catch(error){if(error.code!=='ESRCH')throw error;}await rm(root,{recursive:true,force:true});}
}
