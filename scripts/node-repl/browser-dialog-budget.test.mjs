import test from 'node:test';
import assert from 'node:assert/strict';
import {BrowserDialogs} from './browser-cdp.mjs';
import {withBrowserActionBudget} from './browser-playwright.mjs';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('dialog lifecycle changes are owner-bound and settle on action end',async()=>{
 const endpoint='http://dialog-budget/',owner={},dialogs=new BrowserDialogs(()=>endpoint);
 const entry={key:endpoint+'|one',endpoint,targetId:'one',owners:new Set([owner]),watches:new Set(),dialogWaiters:new Set(),ready:Promise.resolve(),connection:{close(){}}};dialogs.targets.set(entry.key,entry);
 entry.passiveOwners=new Set([owner]);
 const id=await dialogs.request(owner,{action:'watch',targetId:'one'});assert.equal(entry.passiveOwners.has(owner),false);
 assert.deepEqual(await dialogs.request(owner,{action:'changes',id,after:-1}),{revision:0,active:false,done:false});
 await assert.rejects(dialogs.request({},{action:'changes',id,after:-1}),/Unknown browser action/);
 await assert.rejects(dialogs.request(owner,{action:'changes',id,after:2}),/Invalid browser action revision/);
 const opened=dialogs.request(owner,{action:'changes',id,after:0});dialogs.event(entry,{method:'Page.javascriptDialogOpening',params:{type:'confirm'}});
 assert.deepEqual(await opened,{revision:1,active:true,done:false});
 dialogs.event(entry,{method:'Page.javascriptDialogClosed',params:{}});assert.deepEqual(await dialogs.request(owner,{action:'changes',id,after:1}),{revision:2,active:false,done:false});
 const ended=dialogs.request(owner,{action:'changes',id,after:2});await dialogs.request(owner,{action:'end',id});
 assert.deepEqual(await ended,{revision:3,active:false,done:true});await dialogs.cleanup(owner);
});

test('action budgets pause for dialogs and retain their remaining active time',async()=>{
 await assert.rejects(withBrowserActionBudget(()=>{throw Error('Unexpected dispatch');},{timeout:-1},async()=>({})),/non-negative/);
 let notify,signal;const updates=[];
 const changes=async()=>updates.length?updates.shift():new Promise(resolve=>{notify=resolve;});
 const publish=state=>{if(notify){const resolve=notify;notify=undefined;resolve(state);}else updates.push(state);};
 publish({revision:0,active:false});
 const pending=withBrowserActionBudget(options=>{assert.equal(options.timeout,0);signal=options.signal;return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));},{timeout:100},changes);pending.catch(()=>{});
 await pause(20);publish({revision:1,active:true});await pause(140);assert.equal(signal.aborted,false);
 publish({revision:2,active:false});await assert.rejects(pending,/Timeout 100ms/);
 publish({revision:3,done:true});
});

test('watcher cleanup and caller abort cancel pending actions even during dialogs',async()=>{
 for(const mode of ['cleanup','caller']){
  let finish,signal;const caller=new AbortController();let first=true;
  const changes=async()=>first?(first=false,{revision:1,active:true}):new Promise(resolve=>{finish=resolve;});
  const pending=withBrowserActionBudget(options=>{signal=options.signal;return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));},{timeout:50,signal:caller.signal},changes);pending.catch(()=>{});
  while(!finish)await new Promise(resolve=>setImmediate(resolve));
  if(mode==='cleanup')finish({revision:2,done:true});else caller.abort(Error('Caller canceled'));
  await assert.rejects(pending,/watcher ended|Caller canceled/);assert.equal(signal.aborted,true);finish({revision:3,done:true});
 }
});


test('active-time budget cancels native work without a dialog watcher',async()=>{
 await assert.rejects(withBrowserActionBudget(({signal,timeout})=>{
  assert.equal(timeout,0);signal.throwIfAborted();return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
 },{timeout:20}),/Timeout 20ms/);
 const caller=new AbortController();caller.abort(Error('Already canceled'));
 await assert.rejects(withBrowserActionBudget(({signal})=>signal.throwIfAborted(),{timeout:0,signal:caller.signal}),/Already canceled/);
});


test('raw navigation validates its owner, target, command and timeout before dispatch',async()=>{
 const endpoint='http://navigation-validation/',owner={},dialogs=new BrowserDialogs(()=>endpoint);
 const entry={key:endpoint+'|one',endpoint,targetId:'one',owners:new Set([owner]),watches:new Set(),dialogWaiters:new Set(),ready:Promise.resolve(),connection:{send(){throw Error('Unexpected dispatch');},close(){}}};dialogs.targets.set(entry.key,entry);
 const id=await dialogs.request(owner,{action:'watch',targetId:'one'}),args={action:'navigate',id,targetId:'one',method:'Page.navigate',params:{url:'https://example.com/'}};
 await assert.rejects(dialogs.request({},args),/Unknown browser navigation/);
 for(const invalid of [{targetId:'other'},{options:null},{params:null},{method:'Runtime.evaluate'},{params:{url:'file:///tmp/owned'}},{params:{url:'https://example.com/',frameId:'foreign'}},{options:{timeoutMs:-1}},{options:{unknown:1}},{method:'Page.reload',params:{ignoreCache:true}},{method:'Page.navigateToHistoryEntry',params:{entryId:-1}},{extra:true}])await assert.rejects(dialogs.request(owner,{...args,...invalid}));
 assert.equal(entry.navigations,undefined);await dialogs.request(owner,{action:'end',id});await dialogs.cleanup(owner);
});

test('observer watchers preserve input exclusion and propagate owner-bound child dialogs',async()=>{
 const endpoint='http://navigation-observer/',owner={},foreign={},dialogs=new BrowserDialogs(()=>endpoint);
 const make=targetId=>({key:endpoint+'|'+targetId,endpoint,targetId,owners:new Set([owner,foreign]),watches:new Set(),dialogWaiters:new Set(),ready:Promise.resolve(),connection:{close(){}}});
 const first=make('first'),second=make('second');dialogs.targets.set(first.key,first);dialogs.targets.set(second.key,second);
 const root=await dialogs.request(owner,{action:'watch',targetId:'first',observer:true});
 await assert.rejects(dialogs.request(owner,{action:'watch',targetId:'first',observer:'yes'}),/Invalid browser observer/);
 await assert.rejects(dialogs.request(foreign,{action:'watch',targetId:'second',parentId:root}),/Unknown parent/);
 const input=await dialogs.request(owner,{action:'watch',targetId:'first',parentId:root});
 await assert.rejects(dialogs.request(owner,{action:'watch',targetId:'first'}),/input action is already active/);
 const observer=await dialogs.request(owner,{action:'watch',targetId:'first',observer:true});
 const child=await dialogs.request(owner,{action:'watch',targetId:'second',parentId:root});
 dialogs.event(second,{method:'Page.javascriptDialogOpening',params:{type:'prompt'}});
 assert.equal((await dialogs.request(owner,{action:'wait',id:root})).opened,true);
 assert.equal((await dialogs.request(owner,{action:'changes',id:root,after:-1})).active,true);assert.equal(second.dialog.owner,owner);
 dialogs.event(second,{method:'Page.javascriptDialogClosed',params:{}});assert.equal((await dialogs.request(owner,{action:'changes',id:root,after:-1})).active,false);
 for(const id of [child,observer,input,root])await dialogs.request(owner,{action:'end',id});
 await assert.rejects(dialogs.request(owner,{action:'watch',targetId:'second',parentId:root}),/Unknown parent/);
 await dialogs.cleanup(owner);
 await assert.rejects(dialogs.request(owner,{action:"watch",targetId:"first",observer:true}),/session closed/);
});
