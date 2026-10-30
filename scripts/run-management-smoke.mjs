// Run only against an owned disposable profile: fixture tabs and bookmarks are removed.
import assert from 'node:assert/strict';
import {WorkerJavaScriptSession,PersistentJavaScriptSession} from './node-repl/open-computer-use-repl.mjs';
import {openConnection} from './node-repl/browser-cdp.mjs';
const endpoint=process.env.OPEN_COMPUTER_USE_CDP_URL;
if(!endpoint)throw Error('Set OPEN_COMPUTER_USE_CDP_URL to disposable Chromium with the bundled browser extension');
const native={async request(){throw Error('native unused');}};
async function run(session,code){const result=await session.run(code,30000);assert.equal(result.isError,false,result.content.at(-1).text);return JSON.parse(result.content.at(-1).text);}
for(const Session of [WorkerJavaScriptSession,PersistentJavaScriptSession]){
 const session=new Session({native}),other=new Session({native});let fixtureIds=[],folder;
 try{
  assert.ok((await run(session,`var b=await cua.getBrowser({id:'cdp'});nodeRepl.write(JSON.stringify(await b.capabilities.list()));`)).some(c=>c.id==='management'));
  await run(session,`var m=await b.capabilities.get('management');nodeRepl.write(JSON.stringify((await m.documentation()).includes('explicit human confirmation')));`);
  assert.equal(await run(session,`nodeRepl.write(JSON.stringify((await m.windows.get(-2)).id===(await m.windows.getCurrent()).id));`),true);
  const first=await run(session,`var w=await m.windows.create();nodeRepl.write(JSON.stringify(w));`);fixtureIds.push(first.tabs[0].id);
  const moved=await run(session,`var moved=await m.windows.create({tabId:w.tabs[0].id});nodeRepl.write(JSON.stringify(moved));`);
  assert.notEqual(first.id,moved.id);
  assert.ok(!(await run(session,`nodeRepl.write(JSON.stringify(await m.windows.getAll()));`)).some(w=>w.id===first.id));
  assert.equal(await run(session,`await m.tabs.update(moved.tabs[0].id,{pinned:true});var denied=false;try{await m.windows.create({tabId:moved.tabs[0].id});}catch(e){denied=/unpinned/.test(e.message);}await m.tabs.update(moved.tabs[0].id,{pinned:false});nodeRepl.write(JSON.stringify(denied));`),true);
  const second=await run(session,`var second=await m.windows.create();nodeRepl.write(JSON.stringify(second));`);fixtureIds.push(second.tabs[0].id);
  assert.equal(await run(session,`var denied=false;try{await m.tabs.group({tabIds:[moved.tabs[0].id,second.tabs[0].id]});}catch(e){denied=/current window/.test(e.message);}nodeRepl.write(JSON.stringify(denied));`),true);
  const group=await run(session,`await m.tabs.move(second.tabs[0].id,{windowId:moved.id,index:-1});var gid=await m.tabs.group({tabIds:[moved.tabs[0].id,second.tabs[0].id]});await m.tabGroups.update(gid,{title:'OCU fixture',color:'blue',collapsed:true});nodeRepl.write(JSON.stringify(await m.tabGroups.get(gid)));`);
  assert.equal(group.shared,false);assert.equal(group.title,'OCU fixture');assert.equal(group.collapsed,true);
  const destination=await run(session,`var destination=await m.windows.create();nodeRepl.write(JSON.stringify(destination));`);fixtureIds.push(destination.tabs[0].id);
  assert.equal(await run(session,`await m.tabGroups.move(gid,{windowId:destination.id,index:-1});nodeRepl.write(JSON.stringify((await m.tabGroups.get(gid)).windowId));`),destination.id);
  assert.equal(await run(session,`await m.tabGroups.update(gid,{collapsed:false});await m.tabs.ungroup([moved.tabs[0].id,second.tabs[0].id]);nodeRepl.write(JSON.stringify((await m.tabs.get(moved.tabs[0].id)).groupId));`),-1);
  await run(session,`await m.windows.update(destination.id,{state:'normal',width:800,height:600});nodeRepl.write(JSON.stringify(true));`);
  const bookmark=await run(session,`var roots=await m.bookmarks.getChildren('0');var parent=roots.find(n=>!n.unmodifiable).id;var folder=await m.bookmarks.create({parentId:parent,title:'OCU disposable fixture'});var entry=await m.bookmarks.create({parentId:folder.id,title:'OCU link',url:'https://example.com/ocu-fixture'});nodeRepl.write(JSON.stringify({folder:folder.id,entry:entry.id}));`);folder=bookmark.folder;
  assert.equal(await run(session,`var found=await m.bookmarks.search({url:'https://example.com/ocu-fixture'});await m.bookmarks.update(entry.id,{title:'OCU renamed',url:'https://example.com/ocu-renamed'});await m.bookmarks.move(entry.id,{parentId:folder.id,index:0});nodeRepl.write(JSON.stringify(found.some(n=>n.id===entry.id)));`),true);
  const audit=await run(session,`nodeRepl.write(JSON.stringify(await m.getAuditTrail()));`);
  assert.ok(audit.changes.some(c=>c.namespace==='bookmarks'&&c.method==='update'&&c.before.bookmarks[0].title==='OCU link'));
  assert.ok(audit.changes.some(c=>c.namespace==='tabs'&&c.method==='group'&&typeof c.result==='number'));
  assert.ok(audit.changes.some(c=>c.namespace==='windows'&&c.method==='create'&&c.result===destination.id));
  assert.equal(await run(other,`var b=await cua.getBrowser({id:'cdp'});var m=await b.capabilities.get('management');nodeRepl.write(JSON.stringify((await m.getAuditTrail()).changes[0].createdAt));`),audit.changes[0].createdAt);
  await other.close();
  if(Session===WorkerJavaScriptSession){
   const entry=[...session.browserChrome.owners.values()][0],workerId=entry.workerId;
   // Debugger attachment must keep the extension worker alive beyond the normal 30s idle limit.
   await new Promise(resolve=>setTimeout(resolve,32000));
   assert.equal(await run(session,`nodeRepl.write(JSON.stringify((await m.getAuditTrail()).changes[0].createdAt));`),audit.changes[0].createdAt);
   assert.equal([...session.browserChrome.owners.values()][0].workerId,workerId);
  }
  const oldWorker=[...session.browserChrome.owners.values()][0].workerId;
  await session.reset();
  const version=await(await fetch(new URL('/json/version',endpoint))).json();
  const connection=await openConnection(version.webSocketDebuggerUrl);
  try{
   const {targetInfos}=await connection.send('Target.getTargets');
   const {sessionId}=await connection.send('Target.attachToTarget',{targetId:targetInfos.find(t=>t.type==='page').targetId,flatten:true});
   await connection.send('ServiceWorker.enable',{},10000,sessionId);await connection.send('ServiceWorker.stopAllWorkers',{},10000,sessionId);
   const deadline=Date.now()+10000;
   while((await connection.send('Target.getTargets')).targetInfos.some(t=>t.targetId===oldWorker)){
    if(Date.now()>deadline)throw Error('Fixture extension worker did not stop');
    await new Promise(resolve=>setTimeout(resolve,20));
   }
  }finally{connection.close();}
  assert.equal(await run(session,`var b=await cua.getBrowser({id:'cdp'});var m=await b.capabilities.get('management');nodeRepl.write(JSON.stringify((await m.getAuditTrail()).changes[0].createdAt));`),audit.changes[0].createdAt);
  assert.notEqual([...session.browserChrome.owners.values()][0].workerId,oldWorker);
  await run(session,`await m.bookmarks.remove(${JSON.stringify(bookmark.entry)});await m.bookmarks.removeTree(${JSON.stringify(folder)});await m.tabs.remove(${JSON.stringify(fixtureIds)});nodeRepl.write(JSON.stringify(true));`);folder=undefined;fixtureIds=[];
  console.log(`${Session.name} PASS native windows/last-tab close, tab/group changes, bookmark lifecycle, browser-wide before-state audit, reset/worker restart${Session===WorkerJavaScriptSession?', 32s idle worker survival':''}`);
 }finally{
  if(folder||fixtureIds.length)await run(session,`var m=await(await cua.getBrowser({id:'cdp'})).capabilities.get('management');${folder?`await m.bookmarks.removeTree(${JSON.stringify(folder)});`:''}${fixtureIds.length?`await m.tabs.remove(${JSON.stringify(fixtureIds)});`:''}nodeRepl.write(JSON.stringify(true));`).catch(e=>console.error('Fixture cleanup:',e.message.slice(0,500)));
  await other.close();await session.close();
 }
}
