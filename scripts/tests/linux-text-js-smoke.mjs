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
 const root=await mkdtemp(path.join(tmpdir(),'ocu-text-')),executable=path.join(root,'fixture'),name=path.basename(root);let pid;
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
  await run(session,`await a.click(${index(a,'Prepare caret')},{clickMethod:'accessibility'});nodeRepl.write(JSON.stringify(true));`);await wait(s=>s.carets.A===2);
  await run(session,`await a.typeText('你🙂',${aEntry});nodeRepl.write(JSON.stringify(true));`);assert.equal((await state()).values.A,'in你🙂itial-A');assert.equal((await state()).carets.A,4);
  await run(session,`await b.click(${index(b,'Prepare selection')},{clickMethod:'accessibility'});await b.typeText('替🙂',${bEntry});nodeRepl.write(JSON.stringify(true));`);assert.equal((await state()).values.B,'i替🙂ial-B');assert.equal((await state()).carets.B,3);assert.equal((await state()).values.A,'in你🙂itial-A');
  await run(session,`await b.click(${index(b,'Select notes')},{clickMethod:'accessibility'});await b.typeText('替换\\n🙂',${bNotes});nodeRepl.write(JSON.stringify(true));`);assert.equal((await state()).notes.B,'li替换\n🙂ne2');
  await run(session,`await b.typeText('后',${bNotes});nodeRepl.write(JSON.stringify(true));`);assert.equal((await state()).notes.B,'li替换\n🙂后ne2');
  await run(session,`await b.click(${index(b,'Focus entry')},{clickMethod:'accessibility'});nodeRepl.write(JSON.stringify(true));`);await wait(s=>s.focused.B);
  await run(session,`await b.typeText('焦点');nodeRepl.write(JSON.stringify(true));`);assert.equal((await state()).values.B,'i替🙂ial-B焦点');
  const inactive=await session.run(`await a.typeText('must-not-write');`);assert.equal(inactive.isError,true);assert.equal((await state()).values.A,'in你🙂itial-A');
  await run(session,`await b.click(${index(b,'Focus keys')},{clickMethod:'accessibility'});nodeRepl.write(JSON.stringify(true));`);
  const printable='aA 1!+é你🙂';
  assert.deepEqual(await run(session,`nodeRepl.write(JSON.stringify(await b.typeCharacters(${JSON.stringify(printable)})));`),{charactersSent:Array.from(printable).length});
  const printed=events=>events.filter(value=>Array.from(value).length===1).join('');
  await wait(s=>printed(s.keys.B.press)===printable);
  assert.equal(printed((await state()).keys.B.release),printable);
  assert.equal((await state()).values.B,'i替🙂ial-B焦点');
  assert.deepEqual(await run(session,`nodeRepl.write(JSON.stringify(await b.typeCharacters('')));`),{charactersSent:0});
  const inactiveKeys=await session.run(`await a.typeCharacters('wrong');`);assert.equal(inactiveKeys.isError,true);assert.match(inactiveKeys.content.at(-1).text,/0 characters confirmed sent/);assert.deepEqual((await state()).keys.A,{press:[],release:[]});
  await run(session,`await a.setValue(${aEntry},'前🙂 repeat 中 repeat 后');nodeRepl.write(JSON.stringify(true));`);
  const ambiguous=await session.run(`await a.selectText(${aEntry},'repeat');`);assert.equal(ambiguous.isError,true);assert.match(ambiguous.content.at(-1).text,/ambiguous/);
  assert.equal((await state()).values.A,'前🙂 repeat 中 repeat 后');
  await run(session,`await a.selectText(${aEntry},'repeat',{prefix:'中 ',suffix:' 后'});nodeRepl.write(JSON.stringify(true));`);assert.deepEqual((await state()).selections.A,[12,18]);
  await run(session,`await a.typeText('替🙂',${aEntry});await a.selectText(${aEntry},'替🙂',{selectionType:'cursor_before'});await a.typeText('<',${aEntry});await a.selectText(${aEntry},'替🙂',{suffix:' 后',selectionType:'cursor_after'});await a.typeText('>',${aEntry});nodeRepl.write(JSON.stringify(true));`);assert.equal((await state()).values.A,'前🙂 repeat 中 <替🙂> 后');
  await run(session,`await b.selectText(${bNotes},'\\n🙂',{prefix:'替换',suffix:'后'});await b.typeText('选\\n🙂',${bNotes});nodeRepl.write(JSON.stringify(true));`);assert.equal((await state()).notes.B,'li替换选\n🙂后ne2');
  await run(session,`await b.click(${index(b,'Read only')},{clickMethod:'accessibility'});nodeRepl.write(JSON.stringify(true));`);
  const readonly=await session.run(`await b.typeText('must-not-write',${bEntry});`);assert.equal(readonly.isError,true);assert.match(readonly.content.at(-1).text,/not editable/);assert.equal((await state()).values.B,'i替🙂ial-B焦点');
  await run(session,`await a.click(${index(a,'Replace entry')},{clickMethod:'accessibility'});nodeRepl.write(JSON.stringify(true));`);
  const stale=await session.run(`await a.typeText('must-not-write',${aEntry});`);assert.equal(stale.isError,true);assert.match(stale.content.at(-1).text,/removed or replaced/);assert.equal((await state()).values.A,'replacement-entry');
  const staleSelection=await session.run(`await a.selectText(${aEntry},'replacement');`);assert.equal(staleSelection.isError,true);assert.match(staleSelection.content.at(-1).text,/removed or replaced/);assert.equal((await state()).values.A,'replacement-entry');
  console.log(`${Session.name} PASS verified context/Unicode selection and cursor modes, printable key press/release without an editable field, indexed fields, Unicode bytes, caret/selection/multiline, focused omission, inactive/read-only/stale rejection and window isolation`);
 }finally{await session.close();await native.close();if(!pid)try{pid=(await state()).pid;}catch{}if(pid)try{process.kill(pid,'SIGTERM');}catch(error){if(error.code!=='ESRCH')throw error;}await rm(root,{recursive:true,force:true});}
}
