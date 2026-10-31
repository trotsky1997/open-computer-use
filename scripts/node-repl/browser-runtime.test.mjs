import test from 'node:test';
import assert from 'node:assert/strict';
import {BrowserRuntime} from './browser-runtime.mjs';
test('managed startup is opt-in and external CDP configuration takes precedence',async()=>{
 const empty=new BrowserRuntime({});assert.deepEqual(await empty.ensure(),{endpoint:null,managed:false});assert.equal(empty.current,undefined);
 const environment={OPEN_COMPUTER_USE_CDP_URL:'http://127.0.0.1:9222',OPEN_COMPUTER_USE_BROWSER_EXECUTABLE:'/invalid/unused'};
 const manual=new BrowserRuntime(environment);assert.deepEqual(await manual.ensure(),{endpoint:environment.OPEN_COMPUTER_USE_CDP_URL,managed:false});await manual.close();assert.equal(manual.current,undefined);assert.equal(environment.OPEN_COMPUTER_USE_CDP_URL,'http://127.0.0.1:9222');
});
test('managed executable validation precedes process creation',{skip:!['darwin','linux'].includes(process.platform)},async()=>{
 for(const executable of ['relative/chrome','/nonexistent/ocu-browser-test']){
  const environment={OPEN_COMPUTER_USE_BROWSER_EXECUTABLE:executable},runtime=new BrowserRuntime(environment);
  await assert.rejects(runtime.ensure(),/absolute|ENOENT/);assert.equal(runtime.current,undefined);assert.equal(environment.OPEN_COMPUTER_USE_CDP_URL,undefined);
 }
});
test('host shutdown cancels asynchronous executable preflight before any guardian is created',{skip:!['darwin','linux'].includes(process.platform)},async()=>{
 const runtime=new BrowserRuntime({OPEN_COMPUTER_USE_BROWSER_EXECUTABLE:process.execPath});
 const starting=runtime.ensure();starting.catch(()=>{});await runtime.close();
 await assert.rejects(starting,/startup canceled/);assert.equal(runtime.current,undefined);
});
test('runtime requests reject launch arguments and invalid visibility before IO',async()=>{
 const runtime=new BrowserRuntime({OPEN_COMPUTER_USE_CDP_URL:'http://127.0.0.1:9222'});
 for(const args of [null,[],{executable:'/unused'},{action:'guess'},{action:'getVisibility',visible:false},{action:'setVisibility'},{action:'setVisibility',visible:'true'}])assert.throws(()=>runtime.request(args),/Invalid browser/);
 await assert.rejects(runtime.request({action:'getVisibility'}),/managed headful/);assert.equal(runtime.current,undefined);
});
test('managed browser mode is validated before process creation',{skip:!['darwin','linux'].includes(process.platform)},async()=>{
 const runtime=new BrowserRuntime({OPEN_COMPUTER_USE_BROWSER_EXECUTABLE:process.execPath,OPEN_COMPUTER_USE_BROWSER_MODE:'automatic'});
 await assert.rejects(runtime.ensure(),/headless or headful/);assert.equal(runtime.current,undefined);
});

function visibilityFixture(){
 const endpoint='http://visibility-fixture/',runtime=new BrowserRuntime({OPEN_COMPUTER_USE_CDP_URL:endpoint});let gone=false;
 runtime.current={endpoint,hiddenWindows:new Map(),proof:{browserGone:()=>gone}};
 runtime.ensure=async()=>({endpoint,managed:true,headless:false});
 return {runtime,owner:{},coordinate:operation=>operation(async ids=>assert.deepEqual(ids,['one'])),exit(){gone=true;}};
}

test('visibility cancellation drains an accepted native write before owner cleanup',async()=>{
 const {runtime,owner,coordinate}=visibilityFixture();let finish,started=false,cleaned=false;
 runtime.windowVisibility=async(_record,_args,_required,claim,dispatch)=>{await claim(['one']);dispatch();started=true;await new Promise(resolve=>{finish=resolve;});dispatch();};
 assert.throws(()=>runtime.request({action:'setVisibility',visible:false}),/owned shared coordinator/);
 const pending=runtime.request({action:'setVisibility',visible:false},{owner,coordinate});
 while(!started)await new Promise(resolve=>setImmediate(resolve));
 const cleanup=runtime.cleanup(owner).then(()=>{cleaned=true;});await new Promise(resolve=>setImmediate(resolve));assert.equal(cleaned,false);
 finish();await pending;await cleanup;assert.equal(runtime.owners.size,0);
 assert.throws(()=>runtime.request({action:'setVisibility',visible:true},{owner,coordinate}),/turn ended/);
});

test('queued visibility cancellation sends no native mutation or ownership scope',async()=>{
 const {runtime,owner,coordinate}=visibilityFixture();let release,called=0;
 runtime.current.visibilityPending=new Promise(resolve=>{release=resolve;});runtime.windowVisibility=async()=>{called++;};
 const pending=runtime.request({action:'setVisibility',visible:false},{owner,coordinate});runtime.cancel(owner);release();
 await assert.rejects(pending,/turn ended/);await runtime.cleanup(owner);assert.equal(called,0);assert.equal(runtime.owners.size,0);
});

test('lost visibility acknowledgement retains cleanup fencing until confirmed browser exit',async()=>{
 const {runtime,owner,coordinate,exit}=visibilityFixture();
 runtime.windowVisibility=async(_record,_args,_required,claim,dispatch)=>{await claim(['one']);dispatch();throw Error('Native acknowledgement lost');};
 await assert.rejects(runtime.request({action:'setVisibility',visible:false},{owner,coordinate}),error=>error.managementUnconfirmed===true&&error.browserCleanupFailed===true);
 await assert.rejects(runtime.cleanup(owner),/completion remains unconfirmed/);assert.equal(runtime.owners.size,1);
 exit();await runtime.cleanup(owner);assert.equal(runtime.owners.size,0);
});

test('an acknowledged native visibility rejection permits cleanup and inspection',async()=>{
 const {runtime,owner,coordinate}=visibilityFixture();
 runtime.windowVisibility=async(_record,_args,_required,claim,dispatch)=>{await claim(['one']);dispatch();throw Object.assign(Error('Bounds rejected'),{cdpError:true});};
 await assert.rejects(runtime.request({action:'setVisibility',visible:false},{owner,coordinate}),/Bounds rejected/);
 await runtime.cleanup(owner);assert.equal(runtime.owners.size,0);
});
