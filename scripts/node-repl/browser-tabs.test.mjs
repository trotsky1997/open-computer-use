import test from 'node:test';
import assert from 'node:assert/strict';
import {BrowserTabs} from './browser-tabs.mjs';
import {WorkerJavaScriptSession,PersistentJavaScriptSession} from './open-computer-use-repl.mjs';

function fixture() {
 const endpoint='http://tab-test/',tabs=new BrowserTabs(()=>endpoint),live=new Map([['user',{targetId:'user',type:'page',url:'about:blank'}]]);
 let next=0,failed=false;
 const entry={endpoint,tabs:new Map(),lineage:new Map(),creating:new Map(),connection:{close(){},async send(method,args){
   if(method==='Target.getTargets') return {targetInfos:[...live.values()]};
   if(method==='Target.createTarget') {const targetId=String(++next);live.set(targetId,{targetId,type:'page',url:args.url});return {targetId};}
   if(method==='Target.closeTarget') {if(failed)throw Error('Close outage');live.delete(args.targetId);return {success:true};}
   throw Error(method);
 }}};
 tabs.browsers.set(endpoint,entry);tabs.browser=async()=>entry;
 return {tabs,entry,live,setFailed(value){failed=value;}};
}

test('tab cleanup preserves users and last marks, inherits popups and retries close failures',async()=>{
 const {tabs,entry,live,setFailed}=fixture(),owner={},other={};
 const create=async()=> (await tabs.request(owner,{action:'create'})).targetId;
 const temporary=await create(),handoff=await create(),deliverable=await create();
 live.set('child',{targetId:'child',type:'page',openerId:temporary,url:'about:blank'});
 live.set('grandchild',{targetId:'grandchild',type:'page',openerId:'child',url:'about:blank'});
 await tabs.request(owner,{action:'mark',targetId:handoff,mark:'deliverable'});
 await tabs.request(owner,{action:'mark',targetId:handoff,mark:'handoff'});
 await tabs.request(owner,{action:'mark',targetId:deliverable,mark:'handoff'});
 await tabs.request(owner,{action:'mark',targetId:deliverable,mark:'deliverable'});
 await assert.rejects(tabs.request(other,{action:'mark',targetId:handoff,mark:'deliverable'}),/another session/);
 setFailed(true);await assert.rejects(tabs.end(owner),/Close outage/);
 assert.equal(entry.tabs.get(deliverable).owner,owner);
 setFailed(false);await tabs.end(owner);
 assert.deepEqual([...live.keys()].sort(),['user',handoff,deliverable].sort());
 assert.equal(entry.tabs.has(deliverable),true);assert.equal(entry.tabs.has(handoff),true);
 assert.throws(()=>tabs.request(owner,{action:'create'}),/turn ended/);
 tabs.begin(owner);assert.equal(entry.tabs.get(handoff).mark,undefined);assert.equal(entry.tabs.get(deliverable).mark,undefined);
 await tabs.end(owner);assert.deepEqual([...live.keys()],['user']);
});

test('uncertain creation remains owned until its unique target can be recovered',async()=>{
 const {tabs,entry,live}=fixture(),owner={};let marker;
 const send=entry.connection.send;
 entry.connection.send=async(method,args)=>{
   if(method==='Target.createTarget') {marker=args.url;throw Error('Lost create acknowledgement');}
   return send(method,args);
 };
 await assert.rejects(tabs.request(owner,{action:'create'}),/Lost create/);
 await assert.rejects(tabs.end(owner),/outcome.*unknown/);
 live.set('late',{targetId:'late',type:'page',url:marker});
 await tabs.end(owner);assert.deepEqual([...live.keys()],['user']);
});

for(const Session of [PersistentJavaScriptSession,WorkerJavaScriptSession]) test(`${Session.name}: idle turns retain JS bindings and reject native callbacks`,async()=>{
 const calls=[],session=new Session({native:{async request(...args){calls.push(args);return {content:[]};}}});
 try {
   assert.equal((await session.run("var sentinel=7,leaked;setTimeout(()=>cua.listApps({emit:false}).then(()=>leaked='allowed',()=>leaked='blocked'),200);")).isError,false);
   await session.endTurn();
   const result=await session.run("await new Promise(resolve=>setTimeout(resolve,300));nodeRepl.write(JSON.stringify({sentinel,leaked}));");
   assert.equal(result.isError,false,JSON.stringify(result.content));
   assert.deepEqual(JSON.parse(result.content.at(-1).text),{sentinel:7,leaked:'blocked'});assert.equal(calls.length,0);
 } finally {await session.close();}
});

test('an active turn interrupts CPU work and rejects previously queued JS',async()=>{
 const session=new WorkerJavaScriptSession({native:{async request(){throw Error('unused');}}});
 try {
   const running=session.run('var discarded=1;while(true){}',30000),queued=session.run('nodeRepl.write("should not execute")');
   await new Promise(resolve=>setTimeout(resolve,80));await session.endTurn();
   assert.equal((await running).isError,true);assert.equal((await queued).isError,true);
   const next=await session.run('nodeRepl.write(typeof discarded)');assert.equal(next.content.at(-1).text,'undefined');
 } finally {await session.close();}
});

test('definite creation errors release empty observers without closing user tabs',async()=>{
 const {tabs,entry,live}=fixture(),owner={};
 entry.connection.send=async()=>{throw Object.assign(Error('Creation refused'),{cdpError:true});};
 await assert.rejects(tabs.request(owner,{action:'create'}),/Creation refused/);
 await tabs.end(owner);assert.equal(tabs.browsers.size,0);assert.deepEqual([...live.keys()],['user']);
});


test('source turns reject async work and queued evaluations before resuming a fresh context',async()=>{
 const session=new PersistentJavaScriptSession({native:{async request(){throw Error('unused');}}});
 try {
   const running=session.run('var discarded=1;await new Promise(()=>{});',30000),queued=session.run('nodeRepl.write("should not execute")');
   await new Promise(resolve=>setTimeout(resolve,20));await session.endTurn();
   assert.equal((await running).isError,true);assert.equal((await queued).isError,true);
   const result=await session.run('nodeRepl.write(typeof discarded)');assert.equal(result.content.at(-1).text,'undefined');
   await session.close();assert.equal((await session.run('nodeRepl.write(1)')).isError,true);
 } finally {await session.close();}
});

test('source cleanup failure blocks reuse and endTurn retries into a fresh context',async()=>{
 let failed=false;
 const session=new PersistentJavaScriptSession({native:{async request(){throw Error('unused');},async endSession(){if(failed)throw Error('Native cleanup outage');}}});
 try {
   await session.run('var previous=17;');failed=true;
   await assert.rejects(session.reset(),/cleanup outage/);
   assert.equal((await session.run('nodeRepl.write(1)')).isError,true);
   failed=false;await session.endTurn();
   const result=await session.run('nodeRepl.write(typeof previous)');
   assert.equal(result.isError,false,JSON.stringify(result.content));assert.equal(result.content.at(-1).text,'undefined');
 } finally {failed=false;await session.close();}
});


test('admitted closes reconcile a target disappearing before the protocol reply',async()=>{
 for(const cleanup of [false,true]){
  const {tabs,entry,live}=fixture(),owner={};
  const {targetId}=await tabs.request(owner,{action:'create'}),send=entry.connection.send;
  entry.connection.send=async(method,args)=>{if(method==='Target.closeTarget'){live.delete(args.targetId);throw Object.assign(Error('No target with given id found'),{cdpError:true});}return send(method,args);};
  if(cleanup)await tabs.end(owner);else await tabs.request(owner,{action:'close',targetId});
  assert.deepEqual([...live.keys()],['user']);await tabs.end(owner);
 }
});
test('protocol close errors retain live targets until an acknowledged retry',async()=>{
 const {tabs,entry,live}=fixture(),owner={},send=entry.connection.send;
 await tabs.request(owner,{action:'create'});
 entry.connection.send=async(method,args)=>{if(method==='Target.closeTarget')throw Object.assign(Error('Denied close'),{cdpError:true});return send(method,args);};
 await assert.rejects(tabs.end(owner),/Denied close/u);assert.equal(live.size,2);
 entry.connection.send=send;await tabs.end(owner);assert.deepEqual([...live.keys()],['user']);
});


test('acknowledged close waits for target disappearance without resending close',async()=>{
 const {tabs,entry,live}=fixture(),owner={},send=entry.connection.send;
 const {targetId}=await tabs.request(owner,{action:'create'});let closes=0;
 entry.connection.send=async(method,args)=>{if(method==='Target.closeTarget'){closes++;setTimeout(()=>live.delete(args.targetId),35);return {success:true};}return send(method,args);};
 await tabs.end(owner);assert.equal(closes,1);assert.equal(live.has(targetId),false);
});

test('confirmed browser exit clears uncertain metadata and permits a fresh instance at the same endpoint',async()=>{
 const f=fixture(),owner={};let gone=false,closed=0;f.entry.creating.set('unconfirmed',owner);f.entry.exitProof={browserGone:()=>gone};f.entry.connection.close=()=>{closed++;};
 await assert.rejects(f.tabs.end(owner),/outcome.*unknown/);assert.equal(f.entry.creating.size,1);
 gone=true;await f.tabs.end(owner);assert.equal(f.tabs.browsers.size,0);assert.equal(f.entry.creating.size,0);assert.equal(closed,1);
 const {createServer}=await import('node:http');const server=createServer((req,res)=>res.end(JSON.stringify({webSocketDebuggerUrl:'ws://owned/new-browser'})));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const endpoint=`http://127.0.0.1:${server.address().port}`,tabs=new BrowserTabs(()=>endpoint,async url=>{assert.equal(url,'ws://owned/new-browser');return {close(){},async send(method){if(method==='Target.getTargets')return {targetInfos:[{targetId:'new-user',type:'page',url:'about:blank'}]};if(method==='Target.setDiscoverTargets')return {};throw Error('Unsupported identity probe');}};});
 const old={endpoint,ready:Promise.resolve(),error:Error('Socket lost'),browserId:'/devtools/browser/old',exitProof:{browserGone:()=>gone},connection:{close(){closed++;}},tabs:new Map(),lineage:new Map(),creating:new Map([['old-marker',owner]])};gone=false;tabs.browsers.set(endpoint,old);
 try{await assert.rejects(tabs.browser(endpoint),/instance changed.*unconfirmed/);assert.equal(tabs.browsers.get(endpoint),old);assert.equal(old.creating.size,1);gone=true;const fresh=await tabs.browser(endpoint);assert.notEqual(fresh,old);assert.equal(fresh.creating.size,0);assert.equal(fresh.tabs.size,0);assert.equal(closed,3);tabs.idle(fresh);}
 finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('user claims exclude competitors and release originals without closing them while inherited popups close',async()=>{
 const {tabs,entry,live}=fixture(),owner={},other={};
 await tabs.request(owner,{action:'claim',targetId:'user'});
 await assert.rejects(tabs.request(other,{action:'claim',targetId:'user'}),/another session/);
 const created=(await tabs.request(owner,{action:'create'})).targetId;
 assert.deepEqual(await tabs.request(owner,{action:'userTargets'}),[created]);
 assert.deepEqual((await tabs.request(other,{action:'userTargets'})).sort(),['user',created].sort());
 live.set('popup',{targetId:'popup',type:'page',url:'about:blank',openerId:'user'});
 await tabs.request(owner,{action:'mark',targetId:'user',mark:'handoff'});await tabs.end(owner);
 assert.equal(live.has('user'),true);assert.equal(live.has('popup'),false);
 await assert.rejects(tabs.request(other,{action:'claim',targetId:'user'}),/another session/);
 tabs.begin(owner);await tabs.end(owner);assert.equal(live.has('user'),true);assert.equal(entry.tabs.has('user'),false);
 await tabs.request(other,{action:'claim',targetId:'user'});await tabs.end(other,{final:true});assert.equal(live.has('user'),true);
});

test('unconfirmed user-tab close keeps its claim until cleanup confirms closure',async()=>{
 const {tabs,live,setFailed}=fixture(),owner={},other={};
 await tabs.request(owner,{action:'claim',targetId:'user'});setFailed(true);
 await assert.rejects(tabs.request(owner,{action:'close',targetId:'user'}),/Close outage/);
 await assert.rejects(tabs.request(owner,{action:'claim',targetId:'user'}),/close is unresolved/);
 await assert.rejects(tabs.end(owner),/Close outage/);
 await assert.rejects(tabs.request(other,{action:'claim',targetId:'user'}),/another session/);
 setFailed(false);await tabs.end(owner);assert.equal(live.has('user'),false);
});

test('claims never adopt preexisting children or popups first observed during idle handoff',async()=>{
 const {tabs,entry,live}=fixture(),owner={};
 live.set('old-child',{targetId:'old-child',type:'page',openerId:'user',url:'about:blank'});
 await tabs.request(owner,{action:'claim',targetId:'user'});await tabs.request(owner,{action:'mark',targetId:'user',mark:'handoff'});await tabs.end(owner);
 const idle={targetId:'human-popup',type:'page',openerId:'user',url:'about:blank'};live.set(idle.targetId,idle);tabs.inherit(entry,idle);
 tabs.begin(owner);await tabs.end(owner);
 assert.deepEqual([...live.keys()].sort(),['human-popup','old-child','user']);assert.equal(entry.tabs.has('human-popup'),false);assert.equal(entry.tabs.has('old-child'),false);
});

test('claim popup cleanup resolves reverse-ordered native descendants before classifying user pages',async()=>{
 const {tabs,live}=fixture(),owner={};await tabs.request(owner,{action:'claim',targetId:'user'});
 live.set('grandchild',{targetId:'grandchild',type:'page',openerId:'child',url:'about:blank'});
 live.set('child',{targetId:'child',type:'page',openerId:'user',url:'about:blank'});
 await tabs.end(owner);assert.deepEqual([...live.keys()],['user']);
});

test('shared tab leases survive uncertain close and release after confirmed cleanup',async()=>{
 const {BrowserTabClaims}=await import('./browser-tab-claims.mjs'),{mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),path=await import('node:path');
 const root=await mkdtemp(path.join(tmpdir(),'ocu-claims-tabs-test-'));
 try{
  const {tabs,entry,live,setFailed}=fixture(),owner={},other={},foreign=new BrowserTabClaims('/browser/one',root);
  entry.shared={withLayout(_owner,operation){return operation();},prepare(){throw Error('Private claim unavailable');}};await assert.rejects(tabs.request(owner,{action:'create'}),/Private claim unavailable/);assert.deepEqual([...live.keys()],['user']);
  entry.shared=new BrowserTabClaims('/browser/one',root);
  live.set('pending',{targetId:'pending',type:'page',url:'about:blank#ocu-private-creation'});await assert.rejects(tabs.request(other,{action:'claim',targetId:'pending'}),/Private pending/);assert.ok((await tabs.request(other,{action:'userTargets'})).includes('pending'));live.delete('pending');tabs.browsers.set(entry.endpoint,entry);
  await tabs.request(owner,{action:'claim',targetId:'user'});setFailed(true);
  await assert.rejects(tabs.request(owner,{action:'close',targetId:'user'}),/Close outage/);await assert.rejects(tabs.end(owner),/Close outage/);
  await assert.rejects(foreign.claim(other,'user',true),/another session or host/);
  setFailed(false);await tabs.end(owner);await foreign.claim(other,'user',true);await foreign.release(other);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('management scopes reject a foreign lease before publishing any new claims',async()=>{
 const {BrowserTabClaims}=await import('./browser-tab-claims.mjs'),{mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),path=await import('node:path');
 const root=await mkdtemp(path.join(tmpdir(),'ocu-management-tabs-'));
 try{
  const {tabs,entry,live}=fixture(),owner={},other={},foreign=new BrowserTabClaims('/browser/one',root);entry.shared=new BrowserTabClaims('/browser/one',root);live.set('free',{targetId:'free',type:'page',url:'about:blank'});
  await foreign.claim(other,'user',true);let writes=0;
  await assert.rejects(tabs.manage(owner,async claim=>{await claim(['free','user']);writes++;}),/another session or host/);
  assert.equal(writes,0);assert.equal(entry.tabs.has('free'),false);assert.deepEqual(await foreign.unavailable(other,['free']),[]);
  await foreign.release(other);tabs.browsers.set(entry.endpoint,entry);
  await tabs.manage(owner,async claim=>{await claim(['free','user']);writes++;});assert.equal(writes,1);
  await tabs.end(owner);assert.equal(live.size,2);assert.deepEqual(await foreign.unavailable(other,['free','user']),[]);
 }finally{await rm(root,{recursive:true,force:true});}
});
