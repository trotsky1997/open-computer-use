// Run only in an owned Xvfb/D-Bus desktop with a real compositor already running.
import assert from 'node:assert/strict';
import {mkdtemp,copyFile,chmod,readFile,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {inflateSync} from 'node:zlib';
import {LazyNativePeer,PersistentJavaScriptSession,WorkerJavaScriptSession} from '../node-repl/open-computer-use-repl.mjs';
const [binary]=process.argv.slice(2);assert.ok(binary);assert.equal(process.platform,'linux');
const runtime=fileURLToPath(new URL('../../apps/OpenComputerUseLinux',import.meta.url));
async function focus(){const {stdout}=await promisify(execFile)('/usr/bin/python3',['-c','import sys,ctypes as C;sys.path.insert(0,sys.argv[1]);from x11_capture import X11;x=X11();f,r=C.c_ulong(),C.c_int();x.lib.XGetInputFocus(x.display,C.byref(f),C.byref(r));print(f.value);x.close()',runtime]);return stdout.trim();}
async function run(session,code){const r=await session.run(code,30000);assert.equal(r.isError,false,JSON.stringify(r.content));return JSON.parse(r.content.at(-1).text);}
async function until(fn){const end=Date.now()+15000;for(;;){const value=await fn();if(value)return value;assert.ok(Date.now()<end,'Owned compositor fixture did not start');await new Promise(r=>setTimeout(r,30));}}
function pixels(encoded){const b=Buffer.from(encoded,'base64'),w=b.readUInt32BE(16),h=b.readUInt32BE(20),channels=b[25]===6?4:3,parts=[];assert.ok([2,6].includes(b[25]));for(let at=8;at<b.length;){const n=b.readUInt32BE(at);if(b.subarray(at+4,at+8).toString()==='IDAT')parts.push(b.subarray(at+8,at+8+n));at+=12+n;}const raw=inflateSync(Buffer.concat(parts)),stride=w*channels+1;assert.equal(raw.length,stride*h);let red=0,blue=0,half=0,black=0,transparent=0;for(let y=0;y<h;y++){assert.equal(raw[y*stride],0);for(let x=0;x<w;x++){const at=y*stride+1+x*channels,r=raw[at],g=raw[at+1],v=raw[at+2],a=channels===4?raw[at+3]:255;if(a===0){transparent++;assert.equal(r+g+v,0,"Transparent pixels leaked RGB");}if(r===255&&g===0&&v===0){red++;if(a>=127&&a<=128)half++;}if(r===0&&g===0&&v===255)blue++;if(r===0&&g===0&&v===0&&a===255)black++;}}return {w,h,red,blue,half,black,transparent,channels,at:(x,y)=>{assert.ok(x>=0&&x<w&&y>=0&&y<h);const at=y*stride+1+x*channels;return [...raw.subarray(at,at+3),channels===4?raw[at+3]:255];}};}
for(const Session of [PersistentJavaScriptSession,WorkerJavaScriptSession]){
 const root=await mkdtemp(path.join(tmpdir(),'ocu-composite-')),app=path.join(root,'fixture'),name=path.basename(root);let pid;
 await copyFile(new URL('./linux-composite-fixture.py',import.meta.url),app);await chmod(app,0o700);
 const native=new LazyNativePeer({command:binary,args:['mcp'],env:{...process.env,OCU_WINDOW_FIXTURE_ROOT:root,OCU_WINDOW_FIXTURE_NAME:name,OPEN_COMPUTER_USE_ACTION_READ_BACK:'0'}}),session=new Session({native});
 const action=async(key,label)=>{const ax=await run(session,`nodeRepl.write(JSON.stringify(await ${key}.getAXState({includeScreenshot:false,emit:false})));`),line=ax.split('\n').find(line=>line.includes('push button '+label+' Secondary Actions:'));assert.ok(line,ax);return run(session,`await ${key}.click(${Number(line.match(/^\s*(\d+)/u)[1])},{clickMethod:'accessibility'});nodeRepl.write(JSON.stringify(true));`);};
 const image=async key=>{const before=await focus();const result=pixels(await run(session,`nodeRepl.write(JSON.stringify((await ${key}.getScreenshot({includeAX:false,emit:false})).toString('base64')));`));assert.equal(await focus(),before,'Screenshot changed native focus');return result;};
 try{
  await run(session,`await cua.computer.launch_app({app:${JSON.stringify(app)}});nodeRepl.write(JSON.stringify(true));`);
  pid=(await until(async()=>{try{return JSON.parse(await readFile(path.join(root,'state.json'),'utf8'));}catch{return null;}})).pid;
  const ids=await until(async()=>{const list=await run(session,'nodeRepl.write(JSON.stringify(await cua.listWindows({emit:false})));');return list.filter(item=>item.app===name).length===4?list.filter(item=>item.app===name):null;});
  let found={};for(const item of ids){const text=await run(session,`var probe=await cua.getApp({windowId:${item.id}},{initialState:false});nodeRepl.write(JSON.stringify(await probe.getAXState({includeScreenshot:false,emit:false})));`);for(const key of ['A','B','Alpha','Black'])if(new RegExp('Window '+key+'(?![A-Za-z])','u').test(text))found[key]=item.id;}
  for(const [key,binding] of [['A','a'],['B','b'],['Alpha','alpha'],['Black','black']])await run(session,`var ${binding}=await cua.getApp({windowId:${found[key]}},{initialState:false});nodeRepl.write(JSON.stringify(true));`);
  await action('b','Separate');await action('b','Focus');
  let a=await image('a'),b=await image('b');assert.ok(a.red>1000);assert.equal(a.blue,0);assert.ok(b.blue>1000);assert.equal(b.red,0);
  await action('b','Grow A');const grown=await image('a');assert.ok(grown.w>a.w&&grown.h>a.h&&grown.red>1000);await action('b','Grow Alpha');const grownAlpha=await image('alpha');assert.ok(grownAlpha.h>a.h&&grownAlpha.half>1000);await action('b','Separate');const restored=await image('a');assert.deepEqual([restored.w,restored.h],[a.w,a.h]);
  await action('b','Cover A');a=await image('a');assert.ok(a.red>1000);assert.equal(a.blue,0,'Occluded image included the covering window');
  assert.ok((await image('black')).black>1000);await image('a');const blocked=await session.run('await a.click([10,30]);');assert.equal(blocked.isError,true);assert.match(blocked.content.at(-1).text,/inactive/);
  const translucent=await image('alpha');assert.equal(translucent.channels,4);assert.ok(translucent.half>1000,'Premultiplied window alpha was not restored');
  const shapeState=JSON.parse(await readFile(path.join(root,'state.json'),'utf8'));assert.deepEqual((await image('a')).at(...shapeState.holePoints.A),[255,0,0,255]);
  await action('b','Shape A');const shapedA=await image('a');assert.equal(shapedA.channels,4);assert.ok(shapedA.red>1000&&shapedA.transparent>=480);assert.deepEqual(shapedA.at(...shapeState.holePoints.A),[0,0,0,0]);assert.deepEqual(shapedA.at(...shapeState.cornerPoints.A),[0,0,0,0]);
  await action('b','Shape Alpha');const shapedAlpha=await image('alpha');assert.ok(shapedAlpha.half>1000&&shapedAlpha.transparent>=480);assert.deepEqual(shapedAlpha.at(...shapeState.holePoints.Alpha),[0,0,0,0]);assert.deepEqual(shapedAlpha.at(...shapeState.cornerPoints.Alpha),[0,0,0,0]);
  await action('alpha','Focus');await image('alpha');const denied=await session.run(`await alpha.click(${JSON.stringify(shapeState.holePoints.Alpha)});`);assert.equal(denied.isError,true);assert.match(denied.content.at(-1).text,/input region/);assert.deepEqual(JSON.parse(await readFile(path.join(root,'state.json'),'utf8')).events.Alpha,[]);
  await action('b','Shape A');await action('b','Shape Alpha');assert.deepEqual((await image('a')).at(...shapeState.holePoints.A),[255,0,0,255]);assert.ok((await image('alpha')).half>1000);
  await action('alpha','Focus');await image('alpha');const alphaPoint=(JSON.parse(await readFile(path.join(root,'state.json'),'utf8'))).pointerPoints.Alpha;assert.equal(alphaPoint.length,2);await run(session,`await alpha.click(${JSON.stringify(alphaPoint)});nodeRepl.write(JSON.stringify(true));`);const received=await until(async()=>{const state=JSON.parse(await readFile(path.join(root,'state.json'),'utf8'));return state.events.Alpha.length===2?state.events:null;});assert.deepEqual(received.Alpha.map(event=>[event.phase,event.button]),[['press',1],['release',1]]);assert.ok(received.Alpha.every(event=>Math.abs(event.x-40)<=1&&Math.abs(event.y-23)<=1));assert.ok(['A','B','Black'].every(key=>received[key].length===0));await action('b','Focus');
  await action('b','Offscreen A');await until(async()=>JSON.parse(await readFile(path.join(root,'state.json'),'utf8')).windows.A.x<0);assert.ok((await image('a')).red>1000);
  await action('b','Ambiguous A');assert.equal((await session.run('await a.getScreenshot({emit:false});')).isError,true);
  await action('b','Separate');await action('b','Hide A');assert.equal((await session.run('await a.getScreenshot({emit:false});')).isError,true);
  await action('b','Separate');assert.ok((await image('a')).red>1000);
  await action('b','Close A');assert.equal((await session.run('await a.getScreenshot({emit:false});')).isError,true);
  console.log(`${Session.name} PASS real compositor background/occluded/offscreen native pixels, same-title isolation, straight alpha, bounded shape holes/reset and hole-input refusal, resize/remap, ARGB pointer recipient, focus preservation and inactive/ambiguous/hidden/stale refusal`);
 }catch(error){try{process.stderr.write((await readFile(root+'/fixture-errors.log','utf8')).slice(-4000));process.stderr.write(await readFile(root+'/state.json','utf8'));}catch{}throw error;}finally{await session.close();await native.close();if(pid)try{process.kill(pid,'SIGTERM');}catch(e){if(e.code!=='ESRCH')throw e;}await rm(root,{recursive:true,force:true});}
}
