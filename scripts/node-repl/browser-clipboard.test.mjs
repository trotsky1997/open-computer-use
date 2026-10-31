import assert from "node:assert/strict";
import test from "node:test";
import {BrowserClipboard,validateClipboardWrite,nativeClipboardJob} from "./browser-clipboard.mjs";

test("clipboard writes validate payloads before dispatch", () => {
  const entry = {mimeType:"text/plain",text:"valid"};
  validateClipboardWrite("write",[{entries:[entry,{mimeType:"image/png",base64:"AA=="}]}]);
  for (const value of [null,{},[{entries:[]}],[{entries:[{...entry,base64:"AA=="}]}],[{entries:[{mimeType:"text/plain",text:42}]}],[{entries:[{mimeType:"image/png",base64:"invalid!"}]}],[{entries:[entry,entry]}],[{entries:[{...entry,mimeType:"bad"}]}],[{entries:[entry],presentationStyle:"bad"}]]) {
    assert.throws(()=>validateClipboardWrite("write",value),/Clipboard|clipboard|Invalid/);
  }
  assert.throws(()=>validateClipboardWrite("writeText",42),/string/);
  assert.throws(()=>validateClipboardWrite("writeText","x".repeat(16*1024*1024+1)),/16 MiB/);
});

test("unverified browser clipboards fail before control tabs or permissions are created", async () => {
  for (const commandLine of [null,{arguments:["--enable-automation"]}]) {
    const methods = [];
    const clipboard = new BrowserClipboard(()=>"http://127.0.0.1:9222/",async (url,operation)=>operation(async method=>{
      methods.push(method);
      if (!commandLine) throw new Error("Command line is unavailable");
      return commandLine;
    }));
    clipboard.json = async()=>({webSocketDebuggerUrl:"ws://127.0.0.1/browser"});
    const owner = {};
    await assert.rejects(clipboard.request(owner,{method:"writeText",targetId:"tab",value:"private"}),/requires.*headless/);
    assert.deepEqual(methods,["Browser.getBrowserCommandLine"]);
    assert.equal(clipboard.server,undefined);
    await clipboard.cleanup(owner);
  }
});

test("canceling a queued clipboard call does not wait for another session's operation", async () => {
  const endpoint = "http://127.0.0.1:9333/";
  const clipboard = new BrowserClipboard(()=>endpoint,()=>{throw new Error("Canceled call reached the browser");});
  let release;
  const gate = new Promise(resolve=>{release=resolve;});
  const blocking = clipboard.enqueue(endpoint,()=>gate);
  const owner = {};
  const pending = clipboard.request(owner,{method:"writeText",value:"canceled",targetId:"tab"});
  clipboard.cancel(owner);
  await assert.rejects(pending,/session closed/);
  await clipboard.cleanup(owner);
  assert.equal(clipboard.owners.has(owner),false);
  release();
  await blocking;
});


test('unresolved native paste blocks clipboard mutation before browser discovery',async()=>{
 const clipboard=new BrowserClipboard(()=>"http://clipboard-lease/",()=>{throw Error('Unexpected connection');},async()=>{throw Error('Native paste still owns this browser input');});
 let discovered=false;clipboard.json=async()=>{discovered=true;throw Error('Unexpected discovery');};
 const owner={};
 await assert.rejects(clipboard.request(owner,{method:'writeText',targetId:'tab',value:'wrong'}),/paste.*owns/);
 assert.equal(discovered,false);assert.equal(clipboard.server,undefined);assert.equal(clipboard.owners.get(owner).bridges.size,0);
 await clipboard.cleanup(owner);
 const unmanaged=new BrowserClipboard(()=>"http://unmanaged/",()=>{throw Error('Unexpected connection');});
 await assert.rejects(unmanaged.request({},{method:'paste',targetId:'tab',value:[]}),/managed browser input/);
});


test('cancel after control focus stops clipboard script and still restores focus',async()=>{
 const owner={},endpoint='http://clipboard-focus-cancel/';let scripted=false,released=false;
 const clipboard=new BrowserClipboard(()=>endpoint,async(url,operation)=>operation(async(method,args)=>{
  if(method==='Browser.getBrowserCommandLine')return {arguments:['--headless=new','--enable-automation']};
  if(method==='Target.getTargetInfo')return {targetInfo:{type:'page'}};
  if(method==='Target.getBrowserContexts')return {browserContextIds:[]};
  if(method==='Target.createTarget')return {targetId:'control'};
  if(method==='Runtime.evaluate'){
   if(args.expression==='location.href')return {result:{value:clipboard.owners.get(owner).bridges.get('default').url}};
   scripted=true;return {result:{}};
  }
  if(method==='Emulation.setFocusEmulationEnabled'){if(args.enabled)clipboard.cancel(owner);else released=true;}
  if(method==='Target.getTargets')return {targetInfos:[{targetId:'control'}]};
  if(method==='Target.closeTarget')return {success:true};
  return {};
 }));
 clipboard.ensureServer=async()=>"http://owned-control/";
 clipboard.json=async(endpoint,route)=>route==='/json/version'?{webSocketDebuggerUrl:'browser'}:[{id:'control',webSocketDebuggerUrl:'control'}];
 await assert.rejects(clipboard.request(owner,{method:'writeText',targetId:'tab',value:'late'}),/session closed/);
 assert.equal(scripted,false);assert.equal(released,true);
 await clipboard.cleanup(owner);assert.deepEqual(clipboard.internalTargets(),[]);
});


test('native clipboard evidence survives duplicate starts, pending queries and canceled delivery',async()=>{
 const {runInNewContext}=await import('node:vm');
 const context={location:{href:'http://control/'},setTimeout,clearTimeout};
 const invoke=runInNewContext(`(${nativeClipboardJob.toString()})`,context);
 let calls=0,release;
 const operation=()=>{calls++;return new Promise(resolve=>{release=resolve;});};
 await invoke('register','job','http://control/');
 const first=invoke('start','job','http://control/',operation);
 const duplicate=invoke('start','job','http://control/',operation);
 assert.equal((await invoke('settle','job','http://control/')).state,'running');
 assert.equal(calls,1);
 await assert.rejects(invoke('drop','job','http://control/'),/still active/);
 release('saved');
 assert.equal((await first).value,'saved');assert.equal((await duplicate).value,'saved');
 assert.equal((await invoke('settle','job','http://control/')).value,'saved');
 await invoke('drop','job','http://control/');
 await assert.rejects(invoke('settle','job','http://control/'),/evidence unavailable/);
 await invoke('register','late','http://control/');
 assert.equal((await invoke('settle','late','http://control/')).state,'canceled');
 assert.equal((await invoke('start','late','http://control/',operation)).state,'canceled');
 assert.equal(calls,1);
 await invoke('register','reject','http://control/');
 const rejected=await invoke('start','reject','http://control/',()=>{throw Error('native denied');});
 assert.equal(rejected.state,'rejected');assert.match(rejected.error,/native denied/);
 await assert.rejects(invoke('settle','reject','http://other/'),/page changed/);
});

test('confirmed original browser exit retires uncertain jobs without touching a replacement',async()=>{
 const owner={},endpoint='http://clipboard-exit/';let replacement=false,gone=false,queries=0;
 const clipboard=new BrowserClipboard(()=>endpoint,async(url,operation)=>operation(async(method,args)=>{
  if(method==='Browser.getBrowserCommandLine')return {arguments:['--headless=new']};
  if(method==='Target.getTargetInfo')return {targetInfo:{type:'page'}};
  if(method==='Target.getBrowserContexts')return {browserContextIds:[]};
  if(method==='Target.createTarget')return {targetId:'control-exit'};
  if(method==='Runtime.evaluate')return {result:{value:clipboard.owners.get(owner).bridges.get('default').url}};
  if(method==='Page.getFrameTree')return {frameTree:{frame:{id:'frame',loaderId:'loader'}}};
  return {};
 }));
 clipboard.ensureServer=async()=> 'http://owned-control/';
 clipboard.json=async(_endpoint,route)=>{queries++;return route==='/json/version'?{webSocketDebuggerUrl:replacement?'new-browser':'old-browser'}:[{id:'control-exit',webSocketDebuggerUrl:'control'}];};
 clipboard.jobCall=async(_page,_job,phase)=>{
  if(phase==='start')throw Error('Connection lost');
  return {state:phase==='register'?'armed':'running'};
 };
 await assert.rejects(clipboard.request(owner,{method:'writeText',targetId:'tab',value:'pending'}),/completion unresolved/);
 const bridge=clipboard.owners.get(owner).bridges.get('default');bridge.exitProof={browserGone:()=>gone};
 assert.throws(()=>clipboard.assertSettled(),/completion unresolved/);
 replacement=true;
 await assert.rejects(clipboard.cleanup(owner),/browser changed/);
 assert.equal(bridge.jobs.size,1);assert.throws(()=>clipboard.assertSettled(),/completion unresolved/);
 gone=true;queries=0;
 await clipboard.cleanup(owner);
 assert.equal(queries,0);assert.equal(clipboard.owners.size,0);assert.equal(bridge.jobs.size,0);
 assert.deepEqual(clipboard.internalTargets(),[]);clipboard.assertSettled();
});

test('clipboard cleanup restores permission on its original live browser independently of other endpoints',async()=>{
 const owner={},other={},endpoint='http://original/',settings=[];
 const clipboard=new BrowserClipboard(()=> 'http://replacement/',async(_socket,operation)=>operation(async(method,args)=>{
  if(method==='Target.getBrowserContexts')return {browserContextIds:[]};
  if(method==='Browser.setPermission')settings.push(args.setting);
  if(method==='Target.getTargets')return {targetInfos:[{targetId:'old-control'}]};
  if(method==='Target.closeTarget')return {success:true};
  return {};
 }));
 clipboard.json=async(saved,route)=>{assert.equal(saved,endpoint);assert.equal(route,'/json/version');return {webSocketDebuggerUrl:'old-browser'};};
 const bridge={endpoint,browser:'old-browser',origin:'http://private-origin/',context:{},targetId:'old-control',jobs:new Set()};
 const state=bridge=>({bridges:new Map([['default',bridge]]),pending:new Set(),tickets:new Set()});
 clipboard.owners.set(owner,state(bridge));
 clipboard.owners.set(other,state({...bridge,endpoint:'http://replacement/',browser:'new-browser',targetId:'new-control'}));
 await clipboard.cleanup(owner);
 assert.deepEqual(settings,['prompt']);assert.equal(clipboard.owners.has(other),true);
});
