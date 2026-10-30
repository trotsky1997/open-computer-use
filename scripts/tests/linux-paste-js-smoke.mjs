// Owned GTK/D-Bus/Xvfb desktop only; values and widget changes are synthetic.
import assert from 'node:assert/strict';
import {mkdtemp,copyFile,chmod,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
async function helpers(){const {stdout}=await exec('ps',['-eo','pid=,args=']);return stdout.split('\n').filter(line=>/python3 \/tmp\/open-computer-use-clipboard-[^ ]+\/clipboard\.py/.test(line)).map(line=>Number(line.trim().split(/\s+/)[0]));}
import {LazyNativePeer,PersistentJavaScriptSession,WorkerJavaScriptSession} from '../node-repl/open-computer-use-repl.mjs';
const [binary]=process.argv.slice(2);assert.ok(binary);assert.equal(process.platform,'linux');
async function run(session,code){const result=await session.run(code,30000);assert.equal(result.isError,false,result.content.at(-1).text);return JSON.parse(result.content.at(-1).text);}
function index(text,label){const line=text.split('\n').find(line=>line.includes(label));assert.ok(line,`Missing ${label}: ${text}`);return Number(line.match(/^\s*(\d+)/u)[1]);}
for(const Session of [PersistentJavaScriptSession,WorkerJavaScriptSession]){
 const root=await mkdtemp(path.join(tmpdir(),'ocu-paste-')),executable=path.join(root,'fixture'),name=path.basename(root);let pid;const before=await helpers();
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
  const fresh=async()=> (await helpers()).filter(pid=>!before.includes(pid));
  await run(session,`await b.setValue(${bNotes},'');await b.click(${index(b,'Focus notes')},{clickMethod:'accessibility'});await b.paste('');await b.paste('你好🙂\\nsecond line');nodeRepl.write(JSON.stringify(true));`);await wait(s=>s.notes.B==='你好🙂\nsecond line');assert.equal((await fresh()).length,1);
  const owner=(await fresh())[0];
  await run(session,`await b.click(${index(b,'Focus entry')},{clickMethod:'accessibility'});await b.paste('**literal 🙂**',{format:'md'});nodeRepl.write(JSON.stringify(true));`);await wait(s=>s.values.B==='initial-B**literal 🙂**');assert.deepEqual(await fresh(),[owner]);
  const inactive=await session.run(`await a.paste('must-not-paste');`);assert.equal(inactive.isError,true);assert.match(inactive.content.at(-1).text,/verified focus/);assert.equal((await state()).values.A,'initial-A');
  const html='<p>你好 <b>world🙂</b></p><p>next</p>';
  await run(session,`await b.click(${index(b,'Focus keys')},{clickMethod:'accessibility'});await b.paste(${JSON.stringify(html)},{format:'html'});nodeRepl.write(JSON.stringify(true));`);await wait(s=>s.clipboard.some(item=>item.target==='text/html'&&item.data===html));
  await run(session,`await b.setValue(${bNotes},'');await b.click(${index(b,'Focus notes')},{clickMethod:'accessibility'});await b.paste(${JSON.stringify(html)},{format:'html'});nodeRepl.write(JSON.stringify(true));`);await wait(s=>s.notes.B==='你好 world🙂\nnext\n');
  await run(session,`await b.click(${index(b,'Focus keys')},{clickMethod:'accessibility'});nodeRepl.write(JSON.stringify(true));`);
  const missing=await session.run(`await b.paste('plain-only');`);assert.equal(missing.isError,true);assert.match(missing.content.at(-1).text,/No clipboard payload request observed/);
  await run(session,`await b.click(${index(b,'Focus entry')},{clickMethod:'accessibility'});await b.paste('after-timeout');nodeRepl.write(JSON.stringify(true));`);await wait(s=>s.values.B.endsWith('after-timeout'));
  await run(session,`await b.click(${index(b,'Copy external')},{clickMethod:'accessibility'});await b.paste('after-ownership-loss');nodeRepl.write(JSON.stringify(true));`);await wait(s=>s.values.B.endsWith('after-ownership-loss'));assert.deepEqual(await fresh(),[owner]);
  await session.reset();assert.deepEqual(await fresh(),[]);
  const next=await run(session,`var b=await cua.getApp({windowId:${bId}},{initialState:false});nodeRepl.write(JSON.stringify(await b.getAXState({includeScreenshot:false,emit:false})));`);
  await run(session,`await b.click(${index(next,'Focus entry')},{clickMethod:'accessibility'});await b.paste('after-reset');nodeRepl.write(JSON.stringify(true));`);await wait(s=>s.values.B.endsWith('after-reset'));assert.equal((await fresh()).length,1);assert.notEqual((await fresh())[0],owner);
  await run(session,`await b.click(${index(next,'Focus keys')},{clickMethod:'accessibility'});nodeRepl.write(JSON.stringify(true));`);
  const previousRequests=(await state()).clipboard.length;
  const pending=session.run(`await b.paste('cancel-pending-plain-only');`);
  await wait(s=>s.clipboard.length>previousRequests);
  await session.reset();assert.equal((await pending).isError,true);assert.deepEqual(await fresh(),[]);
  const aNext=await run(session,`var a=await cua.getApp({windowId:${aId}},{initialState:false});nodeRepl.write(JSON.stringify(await a.getAXState({includeScreenshot:false,emit:false})));`);
  await run(session,`await a.click(${index(aNext,'Focus entry')},{clickMethod:'accessibility'});nodeRepl.write(JSON.stringify(true));`);
  await exec(binary,['call','--calls',JSON.stringify([{tool:'get_app_state',args:{app:name,include_screenshot:false}},{tool:'paste',args:{app:name,text:'CLI-end'}}])],{env:{...process.env,OPEN_COMPUTER_USE_ACTION_READ_BACK:'0'}});await wait(s=>s.values.A.endsWith('CLI-end'));assert.deepEqual(await fresh(),[]);
  await session.close();await native.close();assert.deepEqual(await fresh(),[]);
  console.log(`${Session.name} PASS multiline Unicode, literal Markdown, exact HTML MIME/plain fallback, focus/timeout rejection, helper reuse, idle/pending reset, CLI exit and close`);
 }finally{await session.close();await native.close();if(!pid)try{pid=(await state()).pid;}catch{}if(pid)try{process.kill(pid,'SIGTERM');}catch(error){if(error.code!=='ESRCH')throw error;}await rm(root,{recursive:true,force:true});}
}
