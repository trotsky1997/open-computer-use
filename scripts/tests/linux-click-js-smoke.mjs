// Owned GTK/D-Bus/Xvfb desktop only; values and widget changes are synthetic.
import assert from 'node:assert/strict';
import {mkdtemp,copyFile,chmod,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {LazyNativePeer,PersistentJavaScriptSession,WorkerJavaScriptSession} from '../node-repl/open-computer-use-repl.mjs';
const [binary]=process.argv.slice(2);assert.ok(binary);assert.equal(process.platform,'linux');
async function run(session,code){const result=await session.run(code,30000);assert.equal(result.isError,false,result.content.at(-1).text);return JSON.parse(result.content.at(-1).text);}
function index(text,label){const line=text.split('\n').find(line=>line.includes(label));assert.ok(line,`Missing ${label}: ${text}`);return Number(line.match(/^\s*(\d+)/u)[1]);}
for(const Session of [PersistentJavaScriptSession,WorkerJavaScriptSession]){
 const root=await mkdtemp(path.join(tmpdir(),'ocu-click-')),executable=path.join(root,'fixture'),name=path.basename(root);let pid;
 await copyFile(new URL('./linux-window-fixture.py',import.meta.url),executable);await chmod(executable,0o700);
 const native=new LazyNativePeer({command:binary,args:['mcp'],env:{...process.env,OCU_WINDOW_FIXTURE_ROOT:root,OCU_WINDOW_FIXTURE_NAME:name,OPEN_COMPUTER_USE_ACTION_READ_BACK:'0',OPEN_COMPUTER_USE_ALLOW_GLOBAL_POINTER_FALLBACKS:'1'}}),session=new Session({native});
 const state=async()=>JSON.parse(await readFile(root+'/state.json','utf8'));
 async function wait(predicate){const deadline=Date.now()+5000;while(!predicate(await state())){assert.ok(Date.now()<deadline,'Fixture state did not settle: '+JSON.stringify(await state()));await new Promise(resolve=>setTimeout(resolve,30));}}
 try{
  await run(session,`await cua.computer.launch_app({app:${JSON.stringify(executable)}});nodeRepl.write(JSON.stringify(true));`);
  let windows=[];const deadline=Date.now()+15000;
  while(windows.length!==2){windows=(await run(session,`nodeRepl.write(JSON.stringify(await cua.listWindows({emit:false})));`)).filter(window=>window.app===name);if(Date.now()>deadline)throw Error('Fixture windows not registered');if(windows.length!==2)await new Promise(resolve=>setTimeout(resolve,30));}
  pid=(await state()).pid;
  const first=await run(session,`var first=await cua.getApp({windowId:${windows[0].id}},{initialState:false});nodeRepl.write(JSON.stringify(await first.getAXState({includeScreenshot:false,emit:false})));`),aId=first.includes('Window A')?windows[0].id:windows[1].id,bId=windows.find(window=>window.id!==aId).id;
  const a=await run(session,`var a=await cua.getApp({windowId:${aId}},{initialState:false});var b=await cua.getApp({windowId:${bId}},{initialState:false});nodeRepl.write(JSON.stringify(await a.getAXState({includeScreenshot:false,emit:false})));`),b=await run(session,`nodeRepl.write(JSON.stringify(await b.getAXState({includeScreenshot:false,emit:false})));`);
  await run(session,`await a.click(${index(a,'Separate windows')},{clickMethod:'accessibility'});await b.click(${index(b,'Focus entry')},{clickMethod:'accessibility'});nodeRepl.write(JSON.stringify(true));`);
  const dimensions=await run(session,`var observation=await b.getAXStateAndScreenshot({emit:false});nodeRepl.write(JSON.stringify({state:observation.state,width:observation.screenshot.readUInt32BE(16),height:observation.screenshot.readUInt32BE(20)}));`);
  const point=(await state()).pointerPoints.B;assert.equal(point.length,2,JSON.stringify(await state()));
  const surface=index(dimensions.state,'Key surface B');
  const releases=s=>s.pointer.B.filter(event=>event.phase==='release');
  const presses=s=>s.pointer.B.filter(event=>event.phase==='press'&&event.type==='button-press');
  let sent=0;
  for(const [button,count,number] of [['left',1,1],['right',1,3],['middle',1,2],['left',2,1],['left',3,1]]){
   await run(session,`await b.click(${JSON.stringify(point)},{mouseButton:${JSON.stringify(button)},clickCount:${count}});nodeRepl.write(JSON.stringify(true));`);sent+=count;await wait(s=>releases(s).length===sent);
   assert.equal(presses(await state()).length,sent);assert.deepEqual(releases(await state()).slice(-count).map(event=>event.button),Array(count).fill(number));
  }
  const size=(await state()).pointerSizes.B,last=presses(await state()).at(-1);assert.ok(Math.abs(last.x-Math.floor(size[0]/2))<=1);assert.ok(Math.abs(last.y-Math.floor(size[1]/2))<=1);
  await run(session,`await b.click(${surface});nodeRepl.write(JSON.stringify(true));`);sent++;await wait(s=>releases(s).length===sent);
  await run(session,`await b.click(${surface},{clickMethod:'global',mouseButton:'right'});nodeRepl.write(JSON.stringify(true));`);sent++;await wait(s=>releases(s).length===sent);
  const outside=await session.run(`await b.click([${dimensions.width},0]);`);assert.equal(outside.isError,true);assert.match(outside.content.at(-1).text,/outside the selected frame/);assert.equal(releases(await state()).length,sent);
  await run(session,`await b.click(${index(dimensions.state,'Intercept pointer')},{clickMethod:'accessibility'});nodeRepl.write(JSON.stringify(true));`);await wait(s=>s.interceptors===1);
  const intercepted=await session.run(`await b.click(${surface});`);assert.equal(intercepted.isError,true);assert.match(intercepted.content.at(-1).text,/pointer target/);assert.equal(releases(await state()).length,sent);
  await run(session,`await b.click(${index(dimensions.state,'Intercept pointer')},{clickMethod:'accessibility'});nodeRepl.write(JSON.stringify(true));`);await wait(s=>s.pointerGrabbed);
  const grabbed=await session.run(`await b.click(${surface});`);assert.equal(grabbed.isError,true);assert.match(grabbed.content.at(-1).text,/grab unavailable/);assert.equal(releases(await state()).length,sent);
  await run(session,`await b.click(${index(dimensions.state,'Separate windows')},{clickMethod:'accessibility'});nodeRepl.write(JSON.stringify(true));`);
  const aState=await run(session,`nodeRepl.write(JSON.stringify(await a.getAXState({includeScreenshot:false,emit:false})));`);
  const inactive=await session.run(`await a.click(${index(aState,'Key surface A')});`);assert.equal(inactive.isError,true);assert.match(inactive.content.at(-1).text,/inactive/);assert.deepEqual((await state()).pointer.A,[]);
  await run(session,`await b.click(${index(dimensions.state,'Occlude B')},{clickMethod:'accessibility'});nodeRepl.write(JSON.stringify(true));`);
  const occluded=await session.run(`await b.click(${surface});`);assert.equal(occluded.isError,true);assert.match(occluded.content.at(-1).text,/occluded/);assert.equal(releases(await state()).length,sent);
  await run(session,`await b.click(${index(dimensions.state,'Separate windows')},{clickMethod:'accessibility'});await b.click(${surface});nodeRepl.write(JSON.stringify(true));`);sent++;await wait(s=>releases(s).length===sent);
  await run(session,`await a.click(${index(aState,'Replace entry')},{clickMethod:'accessibility'});nodeRepl.write(JSON.stringify(true));`);
  const stale=await session.run(`await a.click(${index(aState,'Editor A')},{clickMethod:'global'});`);assert.equal(stale.isError,true);assert.match(stale.content.at(-1).text,/removed or replaced/);assert.deepEqual((await state()).pointer.A,[]);assert.equal(releases(await state()).length,sent);
  await run(session,`await b.click(${index(dimensions.state,'Editor B')},{clickMethod:'global',mouseButton:'right'});nodeRepl.write(JSON.stringify(true));`);await wait(s=>s.popups>0);
  const popup=await session.run(`await b.click(${surface});`);assert.equal(popup.isError,true);assert.equal(releases(await state()).length,sent);
  console.log(`${Session.name} PASS exact coordinate/index recipients, three buttons, double/triple clicks, paired releases, real popup completion, input-only/grab/inactive/occluded/outside/stale rejection`);
 }catch(error){try{process.stderr.write((await readFile(root+'/fixture-errors.log','utf8')).slice(-4000));process.stderr.write(JSON.stringify(await state())+'\n');}catch{}throw error;}finally{await session.close();await native.close();if(!pid)try{pid=(await state()).pid;}catch{}if(pid)try{process.kill(pid,'SIGTERM');}catch(error){if(error.code!=='ESRCH')throw error;}await rm(root,{recursive:true,force:true});}
}
