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
