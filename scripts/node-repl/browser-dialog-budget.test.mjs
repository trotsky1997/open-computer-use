import test from 'node:test';
import assert from 'node:assert/strict';
import {BrowserDialogs} from './browser-cdp.mjs';
import {withBrowserActionBudget} from './browser-playwright.mjs';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('dialog lifecycle changes are owner-bound and settle on action end',async()=>{
 const endpoint='http://dialog-budget/',owner={},dialogs=new BrowserDialogs(()=>endpoint);
 const entry={key:endpoint+'|one',endpoint,targetId:'one',owners:new Set([owner]),watches:new Set(),dialogWaiters:new Set(),ready:Promise.resolve(),connection:{close(){}}};dialogs.targets.set(entry.key,entry);
 const id=await dialogs.request(owner,{action:'watch',targetId:'one'});
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
