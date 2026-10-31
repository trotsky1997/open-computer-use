import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {BrowserWebMcp,webMcpInput,registeredTools} from './browser-webmcp.mjs';
function fixture(send){
 const host=new BrowserWebMcp(()=> 'http://owned.test'),owner={},state=host.state(owner);let closes=0;
 const entry={id:'collection',targetId:'tab',endpoint:'http://owned.test',check(){if(state.closed)throw Error('Turn ended');},tools:new Map(),browser:{async close(){closes++;}},page:{isClosed:()=>false}};
 entry.tools.set('tool',{session:{send},objectId:'native',contextId:1});state.collections.set(entry.id,entry);
 return {host,owner,state,closed:()=>closes,args:{action:'call',targetId:'tab',collectionId:'collection',name:'tool',input:{}}};
}
test('WebMCP validates JSON objects and request scope before IO',()=>{
 assert.deepEqual(webMcpInput({text:'你好',values:[null,true,1]}),{text:'你好',values:[null,true,1]});
 const cycle={};cycle.self=cycle;
 for(const input of [null,[],1,new Date(),{toJSON(){return [];}},{value:undefined},{value:Infinity},{value:()=>{}},{value:1n},cycle,{value:'x'.repeat(1024*1024)}])assert.throws(()=>webMcpInput(input));
 const host=new BrowserWebMcp(()=>{throw Error('Unexpected IO');});
 for(const args of [null,{action:'guess',targetId:'tab'},{action:'fetch',targetId:''},{action:'call',targetId:'tab',name:'tool'}])assert.throws(()=>host.request({},args),/WebMCP/);
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
 entry.browser={async close(){if(fail)throw Error('Observer disconnect failed');}};f.state.observers.set('observed',entry);
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
 entry.watchers=new Map();entry.signalRootCrash=()=>{rootCrashes++;};entry.browser.newBrowserCDPSession=async()=>browserSession;browserSession.send=async(method,args)=>{assert.equal(method,'Target.setDiscoverTargets');assert.equal(args.discover,true);};
 const root=new EventEmitter(),child=new EventEmitter();root.send=async()=>({targetInfo:{targetId:'root-target'}});child.send=async()=>({targetInfo:{targetId:'child-target'}});entry.rootSession=root;
 await f.host.watchCrashes(f.state,entry);await f.host.watch(f.state,entry,{session:root,frameId:'root'});await f.host.watch(f.state,entry,{session:child,frameId:'child'});
 browserSession.emit('Target.targetCrashed',{targetId:'unrelated'});assert.equal(entry.crashed,undefined);
 browserSession.emit('Target.targetCrashed',{targetId:'child-target'});assert.equal(entry.watchers.get(child).crashed,true);assert.equal(entry.watchers.get(root).crashed,undefined);assert.equal(entry.rootCrashed,undefined);assert.equal(rootCrashes,0);
 browserSession.emit('Target.targetCrashed',{targetId:'root-target'});assert.equal(entry.rootCrashed,true);assert.equal(rootCrashes,1);
 await f.host.cleanup(f.owner);browserSession.emit('Target.targetCrashed',{targetId:'root-target'});assert.equal(rootCrashes,1);
});
