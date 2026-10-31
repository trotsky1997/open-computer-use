import test from 'node:test';
import assert from 'node:assert/strict';
import {validateManagement} from './chrome-browser-extension/policy.mjs';
import {createManagement,privateTab} from './chrome-browser-extension/management.mjs';
import {BrowserChrome} from './browser-chrome.mjs';

test('management rejects navigation, privileged methods and invalid data before IO',()=>{
 for(const [ns,method,args] of [
  ['windows','remove',[1]],['windows','create',[{url:'https://example.com'}]],
  ['windows','create',[{incognito:true}]],['windows','update',[1,{left:10}]],
  ['tabs','update',[1,{url:'https://example.com'}]],['tabs','create',[{}]],
  ['bookmarks','create',[{url:'javascript:alert(1)'}]],['bookmarks','update',['1',{url:'file:///tmp/x'}]],
  ['bookmarks','move',['1',{index:-1}]],['tabs','query',[{url:2}]],['tabs','group',[{tabIds:[]}]],
 ])assert.throws(()=>validateManagement(ns,method,args));
 assert.equal(validateManagement('tabs','query',[{}]),false);
 assert.equal(validateManagement('windows','create',[]),true);
 assert.equal(validateManagement('windows','get',[-2]),false);
 assert.equal(validateManagement('tabs','group',[{tabIds:[1],createProperties:{windowId:2}}]),true);
});

test('management protects shared groups and journals before dispatch with bounded retention',async()=>{
 let shared=false,stored={},failStorage=false,dispatches=0;
 const chrome={runtime:{id:'fixture'},storage:{session:{async get(){return structuredClone(stored);},async set(value){if(failStorage)throw Error('Storage outage');stored=structuredClone(value);}}},
  debugger:{async getTargets(){return [1,2,3].map(id=>({id:'target-'+id,tabId:id,type:'page'}));}},
  windows:{async get(id){return{id,type:'normal',incognito:false};},async getAll(){return[{id:2,focused:true},{id:4,focused:false}];}},
  tabs:{async get(id){return{id,windowId:id===3?4:2,groupId:id===1?7:-1,pinned:false};},async query(){return[{id:1,windowId:2,groupId:7,pinned:false,index:0,autoDiscardable:true,url:'https://example.com'},{id:2,windowId:2,groupId:-1,index:1},{id:3,windowId:4,groupId:-1,index:0}];},async move(){dispatches++;assert.equal(stored.ocuAudit.at(-1).method,'move');return{id:1};},async group(){dispatches++;return 7;}},
  tabGroups:{async get(){return{id:7,windowId:2,shared};},async query(){return[{id:7,windowId:2,shared,collapsed:false,color:'grey'}];}},
  bookmarks:{async getSubTree(){return[{id:'b',title:'before',url:'https://example.com'}];},async update(){dispatches++;assert.equal(stored.ocuAudit.at(-1).before.bookmarks[0].title,'before');return{id:'b'};},async remove(){dispatches++;throw Error('Native failure');}},
 };
 globalThis.chrome=chrome;
 try{
  assert.equal(privateTab({url:'',pendingUrl:'about:blank#ocu-bridge-fixture'}),true);
  assert.equal(privateTab({url:'chrome-extension://fixture/bridge.html'}),true);
  assert.equal(privateTab({url:'https://example.com'}),false);
  const api=await createManagement(chrome);const invoke=async(ns,method,args)=>api.invoke(ns,method,args,(await api.plan(ns,method,args)).fingerprint);
  for(const value of [true,undefined]){
   shared=value;
   await assert.rejects(invoke('tabs','move',[[2],{index:-1}]),/shared/u);
   await assert.rejects(invoke('tabs','group',[{tabIds:[1]}]),/Shared/u);
  }
  shared=false;
  await assert.rejects(api.invoke('tabs','move',[[2],{index:-1}]),/plan is missing/);
  const planned=await api.plan('tabs','move',[[2],{index:-1}]);assert.deepEqual(planned.targetIds,['target-1','target-2']);
  assert.deepEqual((await api.plan('windows','create',[{focused:false}])).targetIds,[]);assert.deepEqual((await api.plan('windows','create',[])).targetIds,['target-1','target-2','target-3']);
  assert.deepEqual((await api.plan('tabs','remove',[[3]])).targetIds,['target-1','target-2','target-3']);
  const query=chrome.tabs.query;chrome.tabs.query=async()=>[...await query(),{id:99,windowId:2,url:'about:blank#ocu-bridge-private'}];
  await assert.rejects(api.plan('windows','update',[2,{focused:true}]),/private bridge/);chrome.tabs.query=query;
  chrome.tabs.query=async()=>{const rows=await query();rows[0].index=8;return rows;};
  await assert.rejects(api.invoke('tabs','move',[[2],{index:-1}],planned.fingerprint),/layout changed/);chrome.tabs.query=query;
  await assert.rejects(invoke('tabs','group',[{tabIds:[1,3]}]),/current window/u);
  assert.equal(dispatches,0);assert.equal((await api.audit()).changes.length,0);
  failStorage=true;await assert.rejects(invoke('tabs','move',[[2],{index:-1}]),/Storage outage/u);
  assert.equal(dispatches,0);assert.equal((await api.audit()).changes.length,0);failStorage=false;
  await invoke('tabs','move',[[2],{index:-1}]);
  assert.equal((await api.audit()).changes[0].before.tabLayout.tabs[0].id,1);
  assert.equal((await api.audit()).changes[0].result,1);
  await invoke('bookmarks','update',['b',{title:'after'}]);
  await assert.rejects(invoke('bookmarks','remove',['b']),/Native failure/u);
  assert.equal((await api.audit()).changes[0].error,'Native failure');
  for(let i=0;i<100;i++)await invoke('bookmarks','update',['b',{title:`after ${i}`}]);
  assert.equal((await api.audit()).changes.length,100);
  assert.equal((await(await createManagement(chrome)).audit()).changes[0].args[1].title,'after 99');
 }finally{delete globalThis.chrome;}
});

test('turn cancellation drains an accepted management mutation before disconnect',async()=>{
 const api=new BrowserChrome(()=> 'http://fixture/'),owner={};let finish,closed=false;
 api.initialize=async entry=>{entry.connection={close(){closed=true;}};};
 api.invoke=(_entry,args)=>args.action==='managementPlan'?Promise.resolve({targetIds:['one'],fingerprint:'a'.repeat(64)}):new Promise(resolve=>{finish=resolve;});api.tabs.end=async()=>{};
 const pending=api.request(owner,{action:'management',namespace:'tabs',method:'update',args:[1,{pinned:true}]},operation=>operation(async ids=>assert.deepEqual(ids,['one'])));
 while(!finish)await new Promise(resolve=>setImmediate(resolve));
 const cleanup=api.cleanup(owner);assert.equal(closed,false);finish({id:1});
 assert.deepEqual(await pending,{id:1});await cleanup;assert.equal(closed,true);assert.equal(api.owners.size,0);
});

test('a lost mutation acknowledgement releases transport and requires audit review',async()=>{
 const api=new BrowserChrome(()=> 'http://fixture/'),owner={};let closed=false;
 api.initialize=async entry=>{entry.connection={close(){closed=true;}};};
 api.invoke=async(_entry,args)=>{if(args.action==='managementPlan')return {targetIds:['one'],fingerprint:'a'.repeat(64)};throw Error('Transport lost');};api.tabs.end=async()=>{};
 await assert.rejects(api.request(owner,{action:'management',namespace:'tabs',method:'update',args:[1,{pinned:true}]},operation=>operation(async ids=>assert.deepEqual(ids,['one']))),/Transport lost/u);
 await assert.rejects(api.cleanup(owner),/audit review before retry/u);
 assert.equal(closed,true);assert.equal(api.owners.size,0);
 await api.cleanup(owner);
});


test('cancellation during management planning never dispatches or reserves its scope',async()=>{
 const api=new BrowserChrome(()=> 'http://fixture/'),owner={};let finish,closed=false,writes=0,claims=0;
 api.initialize=async entry=>{entry.connection={close(){closed=true;}};};api.tabs.end=async()=>{};
 api.invoke=(_entry,args)=>{if(args.action==='managementPlan')return new Promise(resolve=>{finish=resolve;});writes++;return Promise.resolve({});};
 const pending=api.request(owner,{action:'management',namespace:'tabs',method:'update',args:[1,{pinned:true}]},operation=>operation(async()=>{claims++;}));
 while(!finish)await new Promise(resolve=>setImmediate(resolve));const cleanup=api.cleanup(owner);
 finish({targetIds:['one'],fingerprint:'a'.repeat(64)});await assert.rejects(pending,/turn ended/);await cleanup;
 assert.equal(writes,0);assert.equal(claims,0);assert.equal(closed,true);assert.equal(api.owners.size,0);
});
