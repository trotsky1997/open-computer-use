import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {BrowserWebMcp,webMcpInput,registeredTools,webMcpDescription} from './browser-webmcp.mjs';
function fixture(send){
 const host=new BrowserWebMcp(()=> 'http://owned.test'),owner={},state=host.state(owner);let closes=0;
 const entry={id:'collection',targetId:'tab',endpoint:'http://owned.test',check(){if(state.closed)throw Error('Turn ended');},tools:new Map(),connection:{async close(){closes++;}}};
 entry.tools.set('tool',{session:{send},objectId:'native',contextId:1});state.collections.set(entry.id,entry);
 return {host,owner,state,closed:()=>closes,args:{action:'call',targetId:'tab',collectionId:'collection',name:'tool',input:{}}};
}
test('WebMCP validates JSON objects and request scope before IO',()=>{
 assert.deepEqual(webMcpInput({text:'你好',values:[null,true,1]}),{text:'你好',values:[null,true,1]});
 const cycle={};cycle.self=cycle;
 for(const input of [null,[],1,new Date(),{toJSON(){return [];}},{value:undefined},{value:Infinity},{value:()=>{}},{value:1n},cycle,{value:'x'.repeat(1024*1024)}])assert.throws(()=>webMcpInput(input));
 const host=new BrowserWebMcp(()=>{throw Error('Unexpected IO');});
 for(const args of [null,{action:'guess',targetId:'tab'},{action:'fetch',targetId:''},{action:'call',targetId:'tab',name:'tool'},{action:'discover',targetId:'tab'},{action:'discover',url:'https://owned.test'}])assert.throws(()=>host.request({},args),/WebMCP/);
});
test('WebMCP refuses foreign, changed-endpoint and unknown collection handles',async()=>{
 const f=fixture(()=>{throw Error('Unexpected native call');});
 for(const change of [{targetId:'other'},{collectionId:'missing'},{name:'guessed'}])await assert.rejects(f.host.request(f.owner,{...f.args,...change}),/Stale or unknown/);
 f.host.endpoint=()=> 'http://changed.test';await assert.rejects(f.host.request(f.owner,f.args),/Stale or unknown/);
 await f.host.cleanup(f.owner);
});
test('WebMCP cleanup waits for native cancellation acknowledgement before disconnect',async()=>{
 let acknowledge;const ack=new Promise(resolve=>{acknowledge=resolve;});
 const f=fixture((_method,params)=>{if(params.functionDeclaration.includes('this.cancel')){assert.equal(params.awaitPromise,true);assert.match(params.functionDeclaration,/return this.cancel/);return ack;}return new Promise(()=>{});});
 const call=f.host.request(f.owner,f.args);call.catch(()=>{});const cleanup=f.host.cleanup(f.owner);let finished=false;cleanup.then(()=>{finished=true;});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(f.closed(),0);assert.equal(finished,false);
 acknowledge({result:{type:'undefined'}});await cleanup;await assert.rejects(call,/turn ended/);assert.equal(f.closed(),1);assert.equal(f.host.owners.size,0);
});
test('WebMCP unacknowledged cancellation retains ownership and can be retried',async()=>{
 let fail=true;const f=fixture((method,params)=>{
  if(method==='Runtime.evaluate')return Promise.resolve({result:{value:true}});
  if(params.functionDeclaration.includes('this.cancel'))return fail?Promise.reject(Error('Execution context was destroyed during cancel')):Promise.resolve({result:{type:'undefined'}});
  return new Promise(()=>{});
 });
 const call=f.host.request(f.owner,f.args);call.catch(()=>{});
 await assert.rejects(f.host.cleanup(f.owner),/Execution context was destroyed during cancel/);assert.equal(f.closed(),0);assert.equal(f.host.owners.size,1);
 fail=false;await f.host.cleanup(f.owner);assert.equal(f.closed(),1);assert.equal(f.host.owners.size,0);
});
test('WebMCP destroyed native contexts end an invocation without retaining an impossible cancel',async()=>{
 const f=fixture((method,params)=>{
  if(method==='Runtime.evaluate')return Promise.reject(Error('Cannot find context with specified id'));
  if(params.functionDeclaration.includes('this.cancel'))return Promise.reject(Error('Cannot find object'));
  return new Promise(()=>{});
 });
 const call=f.host.request(f.owner,f.args);call.catch(()=>{});await f.host.cleanup(f.owner);assert.equal(f.closed(),1);
});

test('native cancel waits for the original invocation to settle after abort',async()=>{
 let finish,signal,settled=false;const operation=new Promise((_,reject)=>{finish=reject;}),window={};
 const reader=runInNewContext(`(${registeredTools.toString()})`,{window,location:{href:'https://owned.test'},AbortController,document:{modelContext:{
  async getTools(){return [{window,name:'wait',origin:'https://owned.test',description:'Owned wait',inputSchema:{type:'object'}}];},
  executeTool(_tool,_input,options){signal=options.signal;return operation;},
 }}});
 const tools=await reader('owned',true),call=tools.call(tools.describe()[0].name,{},'invocation');call.catch(()=>{});
 const cancel=tools.cancel('invocation').then(()=>{settled=true;});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(signal.aborted,true);assert.equal(settled,false);
 finish(Error('Native invocation aborted'));await cancel;await assert.rejects(call,/Native invocation aborted/);
 await tools.cancel('invocation');assert.equal(settled,true);
});

test('native inventory notices are frame-scoped, coalesced and fenced by owner lifecycle',async()=>{
 const {EventEmitter}=await import('node:events'),f=fixture(()=>{}),entry=f.state.collections.get('collection');entry.watchers=new Map();
 const session=new EventEmitter();let enables=0;session.send=async method=>{if(method==='WebMCP.enable'){enables++;session.emit('WebMCP.toolsAdded',{tools:[{frameId:'main'}]});}return {targetInfo:{targetId:'session'}};};
 await f.host.watch(f.state,entry,{session,frameId:'main'});await f.host.watch(f.state,entry,{session,frameId:'child'});assert.equal(enables,1);assert.deepEqual(f.host.notifications(f.owner),[]);
 session.emit('WebMCP.toolsAdded',{tools:{}});session.emit('WebMCP.toolsRemoved',{tools:[null]});session.emit('WebMCP.toolsAdded',{tools:[{frameId:'unrelated'}]});assert.deepEqual(f.host.notifications(f.owner),[]);
 session.emit('WebMCP.toolsAdded',{tools:[{frameId:'child'}]});session.emit('WebMCP.toolsRemoved',{tools:[{frameId:'main'}]});
 assert.deepEqual(f.host.notifications({}),[]);const notices=f.host.notifications(f.owner);assert.equal(notices.length,1);assert.match(notices[0].text,/tab "tab"/);assert.equal(notices[0]._meta.id,'cua.webmcp');assert.deepEqual(f.host.notifications(f.owner),[]);
 session.emit('WebMCP.toolsAdded',{tools:[{frameId:'main'}]});entry.stale=true;assert.deepEqual(f.host.notifications(f.owner),[]);entry.stale=false;
 session.emit('WebMCP.toolsAdded',{tools:[{frameId:'main'}]});f.host.endpoint=()=>{throw Error('Invalid endpoint');};assert.deepEqual(f.host.notifications(f.owner),[]);
 await f.host.cleanup(f.owner);session.emit('WebMCP.toolsAdded',{tools:[{frameId:'main'}]});assert.deepEqual(f.host.notifications(f.owner),[]);
});

test('both JS hosts prepend pending notices without replacing explicit output',async()=>{
 const {PersistentJavaScriptSession,WorkerJavaScriptSession}=await import('./open-computer-use-repl.mjs');
 for(const Session of [PersistentJavaScriptSession,WorkerJavaScriptSession]){
  const session=new Session({native:{async request(){throw Error('Unexpected native IO');}}});
  try{
   await session.run('nodeRepl.write("ready")');const owner=session.resourceOwner??session.resourceOwners.get(session.worker),host=session.browserWebMcp,state=host.state(owner);
   state.notifications.set('owned',{targetId:'owned',endpoint:host.endpoint()});
   const result=await session.run('nodeRepl.write("explicit")');assert.equal(result.isError,false);assert.equal(result.content[0]._meta.id,'cua.webmcp');assert.equal(result.content.at(-1).text,'explicit');
   assert.equal((await session.run('nodeRepl.write("again")')).content.length,1);
   state.notifications.set('owned',{targetId:'owned',endpoint:host.endpoint()});const failed=await session.run('throw Error("owned error")');assert.equal(failed.isError,true);assert.equal(failed.content[0]._meta.id,'cua.webmcp');assert.match(failed.content.at(-1).text,/owned error/);
  }finally{await session.close();}
 }
});

test('discovery reuses the turn observer and bounds new targets before IO',async()=>{
 const host=new BrowserWebMcp(()=> 'http://owned.test'),owner={},state=host.state(owner);state.observers.set('tab',{endpoint:'http://owned.test',ready:Promise.resolve(false)});
 assert.equal(await host.request(owner,{action:'observe',targetId:'tab'}),false);assert.throws(()=>host.request(owner,{action:'observe',targetId:'tab',input:{}}),/Invalid WebMCP request/);
 host.endpoint=()=> 'http://changed.test';await assert.rejects(host.request(owner,{action:'observe',targetId:'tab'}),/endpoint changed/);
 for(let i=1;i<128;i++)state.observers.set(String(i),{});
 await assert.rejects(host.request(owner,{action:'observe',targetId:'new'}),/observer limit/);await host.cleanup(owner);assert.equal(host.owners.size,0);
});

test('initial discovery notices filter exact frames and failed observer close retains ownership',async()=>{
 const {EventEmitter}=await import('node:events'),f=fixture(()=>{}),entry={targetId:'observed',endpoint:'http://owned.test',discover:true,watchers:new Map()};let fail=true;
 entry.connection={async close(){if(fail)throw Error('Observer disconnect failed');}};f.state.observers.set('observed',entry);
 const session=new EventEmitter();session.send=async()=>{session.emit('WebMCP.toolsAdded',{tools:[{frameId:'main'}]});return {targetInfo:{targetId:'session'}};};
 await f.host.watch(f.state,entry,{session,frameId:'main'});assert.equal(f.host.notifications(f.owner).length,1);
 session.emit('WebMCP.toolsAdded',{tools:[{frameId:'foreign'}]});assert.deepEqual(f.host.notifications(f.owner),[]);
 await assert.rejects(f.host.cleanup(f.owner),/Observer disconnect failed/);assert.equal(f.host.owners.size,1);assert.equal(f.state.observers.size,1);assert.equal(f.state.collections.size,0);
 fail=false;await f.host.cleanup(f.owner);assert.equal(f.host.owners.size,0);
});

test('renderer crash releases root callers and still awaits OOP cancellation',async()=>{
 for(const root of [true,false]){
  let signalCrash,acknowledge,cancels=0;const ack=new Promise(resolve=>{acknowledge=resolve;});
  const f=fixture((_method,params)=>{if(params.functionDeclaration.includes('this.cancel')){cancels++;return ack;}return new Promise(()=>{});}),entry=f.state.collections.get('collection');
  entry.tools.get('tool').root=root;entry.crash=new Promise((_,reject)=>{signalCrash=reject;});
  const call=f.host.request(f.owner,f.args);call.catch(()=>{});entry.crashed=true;entry.rootCrashed=true;entry.stale=true;signalCrash(Error('WebMCP renderer crashed'));
  await new Promise(resolve=>setImmediate(resolve));assert.equal(cancels,root?0:1);
  if(!root){assert.equal(f.state.active.size,1);assert.equal(f.closed(),0);acknowledge({result:{type:'undefined'}});}
  await assert.rejects(call,/renderer crashed/);assert.equal(f.state.active.size,0);await f.host.cleanup(f.owner);assert.equal(f.closed(),1);
 }
});

test('a child renderer crash cannot confirm release in the surviving root session',async()=>{
 let cancels=0;const f=fixture(async()=>{cancels++;return {result:{type:'undefined'}};}),entry=f.state.collections.get('collection'),record=entry.tools.get('tool');
 const {EventEmitter}=await import('node:events'),child=new EventEmitter();child.send=async()=>({targetInfo:{targetId:'child'}});entry.watchers=new Map();entry.rootSession=record.session;record.root=true;await f.host.watch(f.state,entry,{session:child,frameId:'child'});child.emit('Inspector.targetCrashed');assert.equal(entry.crashed,true);assert.equal(entry.rootCrashed,undefined);const active={entry,record,id:'owned'};await f.host.stop(f.state,active);
 assert.equal(cancels,1);assert.equal(active.contextGone,undefined);await f.host.cleanup(f.owner);
});

test('browser crash events match captured native target IDs and preserve root identity',async()=>{
 const {EventEmitter}=await import('node:events'),f=fixture(()=>{}),entry=f.state.collections.get('collection'),browserSession=new EventEmitter();let rootCrashes=0;
 entry.watchers=new Map();entry.signalRootCrash=()=>{rootCrashes++;};entry.browserSession=browserSession;browserSession.send=async(method,args)=>{assert.equal(method,'Target.setDiscoverTargets');assert.equal(args.discover,true);};
 const root=new EventEmitter(),child=new EventEmitter();root.send=async()=>({targetInfo:{targetId:'root-target'}});child.send=async()=>({targetInfo:{targetId:'child-target'}});entry.rootSession=root;
 await f.host.watchCrashes(f.state,entry);await f.host.watch(f.state,entry,{session:root,frameId:'root'});await f.host.watch(f.state,entry,{session:child,frameId:'child'});
 browserSession.emit('Target.targetCrashed',{targetId:'unrelated'});assert.equal(entry.crashed,undefined);
 browserSession.emit('Target.targetCrashed',{targetId:'child-target'});assert.equal(entry.watchers.get(child).crashed,true);assert.equal(entry.watchers.get(root).crashed,undefined);assert.equal(entry.rootCrashed,undefined);assert.equal(rootCrashes,0);
 browserSession.emit('Target.targetCrashed',{targetId:'root-target'});assert.equal(entry.rootCrashed,true);assert.equal(rootCrashes,1);
 await f.host.cleanup(f.owner);browserSession.emit('Target.targetCrashed',{targetId:'root-target'});assert.equal(rootCrashes,1);
});

test('tool descriptions disclose partial frame discovery even with an empty available list',()=>{
 const unavailableFrames=[{frameId:'child',url:'https://owned.test/frame',status:'unavailable',error:'Owned target closed'}];
 assert.equal(webMcpDescription({tools:[]}),'No WebMCP tools are available in this document.');
 for(const tools of [[],[{name:'root__owned',inputSchema:{type:'object'}}]]){
  const text=webMcpDescription({tools,unavailableFrames});assert.match(text,/discovery is partial/);assert.match(text,/"frameId": "child"/);assert.match(text,/Owned target closed/);assert.doesNotMatch(text,/No WebMCP tools are available/);
  if(tools.length)assert.match(text,/root__owned/);else assert.match(text,/available frames/);
 }
});

test('fetching can reconcile a child crash while root crashes and published handles stay fatal',async()=>{
 const {EventEmitter}=await import('node:events');
 for(const root of [true,false])for(const fetching of [true,false]){
  const f=fixture(()=>{}),entry=f.state.collections.get('collection'),session=new EventEmitter();session.send=async()=>({targetInfo:{targetId:'owned'}});entry.watchers=new Map();entry.fetching=fetching;entry.rootSession=root?session:{};
  await f.host.watch(f.state,entry,{session,frameId:'owned'});session.emit('Inspector.targetCrashed');
  assert.equal(entry.crashed,true);assert.equal(!!entry.stale,root||!fetching);assert.equal(!!entry.rootCrashed,root);await f.host.cleanup(f.owner);
 }
});

test('native discovery attaches explicitly and routes inventories and notices to exact frames',async()=>{
 const {createServer}=await import('node:http');let event,disconnect,holdClose=false,closed=0,loader='first';const calls=[];
 const frame=id=>({id,url:'https://owned.test/'+id,loaderId:loader}),tree=()=>({frame:frame('root'),childFrames:[{frame:frame('same')}]});
 const info={type:'iframe',targetId:'oop',parentId:'root',parentFrameId:'root'};
 const server=createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({webSocketDebuggerUrl:'ws://owned.test/browser'}));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const host=new BrowserWebMcp(()=>`http://127.0.0.1:${server.address().port}`,async(url,onEvent,onClose)=>{
  assert.equal(url,'ws://owned.test/browser');event=onEvent;
  return {close(){closed++;if(holdClose)disconnect=onClose;else onClose();},async send(method,params={},timeout,sessionId){
   calls.push({method,params,sessionId});assert.equal(timeout,10000);assert.notEqual(method,'Target.setAutoAttach');
   if(method==='Browser.getVersion')return {product:'Chrome/158.0.0.0'};
   if(method==='Target.attachToTarget')return {sessionId:params.targetId==='root'?'root-session':'child-session'};
   if(method==='Target.setDiscoverTargets'){event({method:'Target.targetCreated',params:{targetInfo:info}});return {};}
   if(method==='Target.getTargets')return {targetInfos:[info,{type:'iframe',targetId:'foreign',parentId:'other',parentFrameId:'other'}]};
   if(method==='Target.getTargetInfo')return {targetInfo:{targetId:sessionId==='child-session'?'oop':'root'}};
   if(method==='Page.getFrameTree')return {frameTree:sessionId==='child-session'?{frame:frame('oop')}:tree()};
   if(method==='Page.createIsolatedWorld'){assert.equal(params.frameId==='oop',sessionId==='child-session');return {executionContextId:1};}
   if(method==='Runtime.callFunctionOn')return {result:{value:true}};
   return {};
  }};
 });
 const owner={};
 try{
  assert.equal(await host.request(owner,{action:'observe',targetId:'root'}),true);
  const state=host.state(owner),entry=state.observers.get('root');assert.deepEqual([...entry.frames.keys()].sort(),['oop','root','same']);assert.equal(entry.incomplete,false);assert.equal(host.notifications(owner).length,1);
  assert.equal(calls.filter(call=>call.method==='Target.attachToTarget').length,2);
  event({sessionId:'child-session',method:'WebMCP.toolsAdded',params:{tools:[{frameId:'foreign'}]}});assert.equal(host.notifications(owner).length,0);
  event({sessionId:'child-session',method:'WebMCP.toolsAdded',params:{tools:[{frameId:'oop'}]}});assert.equal(host.notifications(owner).length,1);
  loader='next';event({sessionId:'root-session',method:'Page.frameNavigated',params:{frame:{id:'root'}}});await Promise.all([...state.pending]);assert.equal(entry.frames.get('root').loaderId,'next');assert.equal(entry.frames.get('same').loaderId,'next');
  event({method:'Target.detachedFromTarget',params:{sessionId:'child-session'}});assert.equal(entry.frames.has('oop'),false);
  holdClose=true;let cleaned=false;const cleanup=host.cleanup(owner).then(()=>{cleaned=true;});await new Promise(resolve=>setImmediate(resolve));assert.equal(cleaned,false);assert.equal(host.owners.has(owner),true);assert.equal(closed,1);disconnect();await cleanup;event({method:'WebMCP.toolsAdded',params:{tools:[{frameId:'root'}]}});assert.equal(host.notifications(owner).length,0);
  assert.ok(calls.some(call=>call.method==='Page.createIsolatedWorld'&&call.params.frameId==='same'));
 }finally{holdClose=false;disconnect?.();try{await host.cleanup(owner);}finally{disconnect?.();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
});

test('confirmed captured-process exit releases a disconnected invocation with an explicit failure',async()=>{
 const f=fixture(()=>Promise.reject(Error('Browser connection closed'))),entry=f.state.collections.get('collection');entry.connected=false;entry.exitProof={processesGone:()=>true};
 await assert.rejects(f.host.request(f.owner,f.args),/browser process exited/);assert.equal(entry.processExited,true);assert.equal(f.state.active.size,0);await f.host.cleanup(f.owner);assert.equal(f.closed(),1);
});

test('browser-wide discovery observes unbound HTTP pages, reuses its connection and releases all observers',async()=>{
 const {createServer}=await import('node:http');let event,disconnected,opened=0,closed=0,product='Chrome/158.0.0.0';
 const server=createServer((_request,response)=>{response.setHeader('Content-Type','application/json');response.end(JSON.stringify({webSocketDebuggerUrl:'ws://owned.test/browser'}));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const host=new BrowserWebMcp(()=>`http://127.0.0.1:${server.address().port}`,async(_url,onEvent,onClose)=>{
  opened++;event=onEvent;disconnected=onClose;
  return {close(){closed++;onClose();},async send(method){
   if(method==='Browser.getVersion')return {product};
   if(method==='Target.setDiscoverTargets'){onEvent({method:'Target.targetCreated',params:{targetInfo:{type:'page',targetId:'initial',url:'https://owned.test'}}});return {};}
   if(method==='Target.getTargetInfo')return {targetInfo:{type:'page',targetId:'initial',url:'https://owned.test/returned'}};
   if(method==='Target.getTargets')return {targetInfos:[{type:'page',targetId:'initial',url:'https://owned.test'},{type:'page',targetId:'hidden',url:'chrome-extension://owned/bridge.html'},{type:'iframe',targetId:'child',url:'https://owned.test'}]};
   throw Error('Unexpected discovery call '+method);
  }};
 });const owner={},seen=[];let finishInitial;
 host.observe=async(state,id)=>{seen.push(id);const observer={targetId:id,endpoint:host.endpoint(),ready:Promise.resolve(),connection:{async close(){closed++;}}};state.observers.set(id,observer);if(!finishInitial)await state.wait(new Promise(resolve=>{finishInitial=resolve;}));state.notifications.set(id,observer);};
 try{
  await host.request(owner,{action:'discover'});await host.request(owner,{action:'discover'});assert.equal(opened,1);assert.deepEqual(seen,['initial']);
  assert.match(host.notifications(owner)[0].text,/1 pages initializing/);finishInitial();await Promise.allSettled([...host.state(owner).pending]);
  assert.equal(host.state(owner).collections.size,0);assert.equal(host.notifications(owner).length,1);
  event({method:'Target.targetInfoChanged',params:{targetInfo:{type:'page',targetId:'late',url:'https://owned.test/late'}}});
  await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(seen,['initial','late']);assert.equal(host.notifications(owner).length,1);
  event({method:'Target.targetDestroyed',params:{targetId:'late'}});await Promise.allSettled([...host.state(owner).pending]);assert.equal(host.state(owner).observers.has('late'),false);
  const current=host.state(owner);let release;
  current.observers.get('initial').connection.close=async()=>{closed++;await new Promise(resolve=>{release=resolve;});};
  event({method:'Target.targetInfoChanged',params:{targetInfo:{type:'page',targetId:'initial',url:'about:blank'}}});
  event({method:'Target.targetInfoChanged',params:{targetInfo:{type:'page',targetId:'initial',url:'https://owned.test/returned'}}});
  await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(seen,['initial','late']);release();
  await Promise.allSettled([...current.pending]);assert.deepEqual(seen,['initial','late','initial']);assert.equal(host.notifications(owner).length,1);
  for(let i=0;i<127;i++)current.observers.set('filler-'+i,{});
  event({method:'Target.targetCreated',params:{targetInfo:{type:'page',targetId:'over-budget',url:'https://owned.test'}}});
  assert.deepEqual(seen,['initial','late','initial']);assert.match(host.notifications(owner)[0].text,/128-tab budget/);
  for(let i=0;i<127;i++)current.observers.delete('filler-'+i);
  disconnected();assert.match(host.notifications(owner)[0].text,/observer disconnected/);
  await host.cleanup(owner);assert.equal(closed,4);assert.equal(host.owners.size,0);
  event({method:'Target.targetCreated',params:{targetInfo:{type:'page',targetId:'after',url:'https://owned.test'}}});disconnected();assert.deepEqual(seen,['initial','late','initial']);assert.deepEqual(host.notifications(owner),[]);
  product='Chrome/156.0.0.0';const older={};assert.equal(await host.request(older,{action:'discover'}),false);assert.deepEqual(host.notifications(older),[]);await host.cleanup(older);assert.equal(opened,2);assert.equal(closed,5);
 }finally{await host.cleanup(owner);server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
