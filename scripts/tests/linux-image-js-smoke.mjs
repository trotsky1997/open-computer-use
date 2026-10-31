// Owned GTK/D-Bus/Xvfb desktop only; values and widget changes are synthetic.
import assert from 'node:assert/strict';
import {mkdtemp,copyFile,chmod,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {inflateSync} from 'node:zlib';
function colors(encoded){const bytes=Buffer.from(encoded,'base64');assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20),parts=[];assert.equal(bytes[25],2);for(let at=8;at<bytes.length;){const n=bytes.readUInt32BE(at),kind=bytes.subarray(at+4,at+8).toString();if(kind==='IDAT')parts.push(bytes.subarray(at+8,at+8+n));at+=12+n;}const raw=inflateSync(Buffer.concat(parts)),stride=width*3+1;assert.equal(raw.length,stride*height);let red=0,blue=0,black=0;for(let y=0;y<height;y++){assert.equal(raw[y*stride],0);for(let x=0;x<width;x++){const at=y*stride+1+x*3,r=raw[at],g=raw[at+1],b=raw[at+2];if(r===0&&g===0&&b===0)black++;if(r===255&&g===0&&b===0)red++;if(r===0&&g===0&&b===255)blue++;}}return {width,height,red,blue,black};}
import {LazyNativePeer,PersistentJavaScriptSession,WorkerJavaScriptSession} from '../node-repl/open-computer-use-repl.mjs';
const [binary]=process.argv.slice(2);assert.ok(binary);assert.equal(process.platform,'linux');
async function run(session,code){const result=await session.run(code,30000);assert.equal(result.isError,false,result.content.at(-1).text);return JSON.parse(result.content.at(-1).text);}
function index(text,label){const line=text.split('\n').find(line=>line.includes(label));assert.ok(line,`Missing ${label}: ${text}`);return Number(line.match(/^\s*(\d+)/u)[1]);}
for(const Session of [PersistentJavaScriptSession,WorkerJavaScriptSession]){
 const root=await mkdtemp(path.join(tmpdir(),'ocu-images-')),executable=path.join(root,'fixture'),name=path.basename(root);let pid;
 await copyFile(new URL('./linux-window-fixture.py',import.meta.url),executable);await chmod(executable,0o700);
 const native=new LazyNativePeer({command:binary,args:['mcp'],env:{...process.env,OCU_WINDOW_FIXTURE_ROOT:root,OCU_WINDOW_FIXTURE_NAME:name,OPEN_COMPUTER_USE_ACTION_READ_BACK:'0'}}),session=new Session({native});
 const state=async()=>JSON.parse(await readFile(root+'/state.json','utf8'));
 async function wait(predicate){const deadline=Date.now()+5000;while(!predicate(await state())){assert.ok(Date.now()<deadline,'Fixture state did not settle: '+JSON.stringify(await state()));await new Promise(resolve=>setTimeout(resolve,30));}}
 try{
  await run(session,`await cua.computer.launch_app({app:${JSON.stringify(executable)}});nodeRepl.write(JSON.stringify(true));`);
  let windows=[];const deadline=Date.now()+15000;
  while(windows.length!==2){windows=(await run(session,`nodeRepl.write(JSON.stringify(await cua.listWindows({emit:false})));`)).filter(window=>window.app===name);if(Date.now()>deadline)throw Error('Fixture windows not registered');if(windows.length!==2)await new Promise(resolve=>setTimeout(resolve,30));}
  pid=(await state()).pid;
  const first=await run(session,`var first=await cua.getApp({windowId:${windows[0].id}},{initialState:false});nodeRepl.write(JSON.stringify(await first.getAXState({includeScreenshot:false,emit:false})));`),aId=first.includes('Window A')?windows[0].id:windows[1].id,bId=windows.find(window=>window.id!==aId).id;
  const a=await run(session,`var a=await cua.getApp({windowId:${aId}},{initialState:false});var b=await cua.getApp({windowId:${bId}},{initialState:false});nodeRepl.write(JSON.stringify(await a.getAXState({includeScreenshot:false,emit:false})));`),b=await run(session,`nodeRepl.write(JSON.stringify(await b.getAXState({includeScreenshot:false,emit:false})));`);
  const aEntry=index(a,'Editor A'),bEntry=index(b,'Editor B'),bNotes=index(b,'Notes B');
  await run(session,`await a.click(${index(a,'Separate windows')},{clickMethod:'accessibility'});await a.click(${index(a,'Focus entry')},{clickMethod:'accessibility'});nodeRepl.write(JSON.stringify(true));`);
  const red=colors(await run(session,`nodeRepl.write(JSON.stringify((await a.getScreenshot({includeAX:false,emit:false})).toString('base64')));`));assert.ok(red.red>100);assert.equal(red.blue,0);
  const background=await session.run(`await b.getScreenshot({includeAX:false,emit:false});`);assert.equal(background.isError,true);assert.match(background.content.at(-1).text,/Screenshot unavailable/);
  let ax=await run(session,`nodeRepl.write(JSON.stringify(await a.getAXState({includeScreenshot:false,emit:false})));`);
  await run(session,`await a.click(${index(ax,'Occlude A')},{clickMethod:'accessibility'});nodeRepl.write(JSON.stringify(true));`);
  const occluded=await session.run(`await a.getScreenshot({includeAX:false,emit:false});`);assert.equal(occluded.isError,true);assert.match(occluded.content.at(-1).text,/Screenshot unavailable/);
  ax=await run(session,`nodeRepl.write(JSON.stringify(await a.getAXState({includeScreenshot:false,emit:false})));`);
  await run(session,`await a.click(${index(ax,'Separate windows')},{clickMethod:'accessibility'});nodeRepl.write(JSON.stringify(true));`);
  const exposed=colors(await run(session,`nodeRepl.write(JSON.stringify((await a.getScreenshot({includeAX:false,emit:false})).toString('base64')));`));assert.ok(exposed.red>100);assert.equal(exposed.blue,0);
  ax=await run(session,`nodeRepl.write(JSON.stringify(await a.getAXState({includeScreenshot:false,emit:false})));`);
  await run(session,`await a.click(${index(ax,'Offscreen A')},{clickMethod:'accessibility'});nodeRepl.write(JSON.stringify(true));`);
  const offscreen=await session.run(`await a.getScreenshot({includeAX:false,emit:false});`);assert.equal(offscreen.isError,true);
  ax=await run(session,`nodeRepl.write(JSON.stringify(await a.getAXState({includeScreenshot:false,emit:false})));`);
  await run(session,`await a.click(${index(ax,'Separate windows')},{clickMethod:'accessibility'});nodeRepl.write(JSON.stringify(true));`);
  ax=await run(session,`nodeRepl.write(JSON.stringify(await b.getAXState({includeScreenshot:false,emit:false})));`);
  await run(session,`await b.click(${index(ax,'Focus entry')},{clickMethod:'accessibility'});nodeRepl.write(JSON.stringify(true));`);
  const blue=colors(await run(session,`nodeRepl.write(JSON.stringify((await b.getScreenshot({includeAX:false,emit:false})).toString('base64')));`));assert.ok(blue.blue>100);assert.equal(blue.red,0);
  assert.equal((await session.run(`await a.getScreenshot({includeAX:false,emit:false});`)).isError,true);
  ax=await run(session,`nodeRepl.write(JSON.stringify(await b.getAXState({includeScreenshot:false,emit:false})));`);
  await run(session,`await b.click(${index(ax,'Black image')},{clickMethod:'accessibility'});nodeRepl.write(JSON.stringify(true));`);
  const blackWindows=await run(session,`nodeRepl.write(JSON.stringify(await cua.listWindows({emit:false})));`),blackWindow=blackWindows.find(window=>window.app===name&&window.title?.includes('black image'));assert.ok(blackWindow);
  const black=colors(await run(session,`var black=await cua.getApp({windowId:${blackWindow.id}},{initialState:false});nodeRepl.write(JSON.stringify((await black.getScreenshot({includeAX:false,emit:false})).toString('base64')));`));assert.equal(black.black,black.width*black.height);
  ax=await run(session,`nodeRepl.write(JSON.stringify(await b.getAXState({includeScreenshot:false,emit:false})));`);
  await run(session,`await b.click(${index(ax,'Close black')},{clickMethod:'accessibility'});nodeRepl.write(JSON.stringify(true));`);
  const closed=await session.run(`await black.getScreenshot({includeAX:false,emit:false});`);assert.equal(closed.isError,true);assert.match(closed.content.at(-1).text,/closed or replaced/);
  console.log(`${Session.name} PASS known native pixels, same-title frame isolation, background/occlusion/offscreen/stale refusal exposure recovery and valid all-black frames`);
 }finally{await session.close();await native.close();if(!pid)try{pid=(await state()).pid;}catch{}if(pid)try{process.kill(pid,'SIGTERM');}catch(error){if(error.code!=='ESRCH')throw error;}await rm(root,{recursive:true,force:true});}
}
