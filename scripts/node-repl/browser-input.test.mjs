import test from "node:test";
import assert from "node:assert/strict";
import {BrowserFocusLeases} from "./browser-playwright.mjs";
import {BrowserInputs,heldKeys,validateClick,validatePressKey,browserPointerLeases} from "./browser-input.mjs";

test('managed drags validate destinations, permit document scroll/content changes and stop on resize or navigation',async()=>{
 for(const mode of ['normal','resize','navigation']) {
  const endpoint='http://drag-'+mode+'/',calls=[],geometry={loaderId:'old',viewport:{clientWidth:320,clientHeight:240,pageX:0,pageY:0,scale:1},contentSize:{width:320,height:240},viewportRevision:0};let moves=0;
  const input=new BrowserInputs(()=>endpoint,async()=>({close(){},async send(method,args){
   calls.push({method,args});
   if(method==='Page.getFrameTree')return {frameTree:{frame:{loaderId:mode==='navigation'&&moves?'new':'old'}}};
   if(method==='Page.getLayoutMetrics')return {cssVisualViewport:{...geometry.viewport,pageY:moves?100:0,clientWidth:mode==='resize'&&moves?300:320},cssContentSize:{width:320,height:moves?900:240}};
   if(method==='Input.dispatchMouseEvent'&&args.type==='mouseMoved'&&args.buttons===1)moves++;
   if(method==='Page.handleJavaScriptDialog')throw Error('No dialog is showing');
   return {};
  }}),()=>0);
  input.supported=async()=>{};input.target=async()=>({webSocketDebuggerUrl:'page'});
  const args={action:'drag',targetId:'tab',position:{x:20,y:20},end:{x:200,y:100},geometry};
  for(const end of [undefined,{x:NaN,y:2},{x:320,y:20},{x:0,y:-1}])await assert.rejects(input.request({},{...args,end}),/destination/);
  assert.equal(calls.length,0);
  const work=input.request({},args);
  if(mode==='normal')await work;else await assert.rejects(work,/document|viewport/);
  const events=calls.filter(call=>call.method==='Input.dispatchMouseEvent').map(call=>call.args);
  assert.equal(events[0].button,'none');assert.equal(events[0].buttons,0);
  assert.equal(events.filter(event=>event.type==='mousePressed').length,1);
  assert.deepEqual(events.filter(event=>event.type==='mouseReleased').map(event=>[event.x,event.y,event.buttons]),[mode==='normal'?[200,100,0]:[-1,-1,0]]);
  assert.equal(moves,mode==='normal'?12:1);assert.equal(browserPointerLeases.has(endpoint),false);
  assert.equal(calls.filter(call=>call.method==='Emulation.setFocusEmulationEnabled').at(-1).args.enabled,false);
 }
});

test("held click options validate chords, aliases and balanced modifier releases",()=>{
 const parsed=validateClick({mouseButton:'r',key:'shift+ctrl+shift',durationMs:0,clickCount:2});
 assert.equal(parsed.button,'right');assert.equal(parsed.keys.length,2);
 assert.deepEqual(parsed.keys.map(key=>key.down.modifiers),[8,10]);assert.deepEqual(parsed.keys.map(key=>key.up.modifiers),[0,8]);
 assert.deepEqual(heldKeys('shift_r').map(key=>[key.down.code,key.down.location]),[['ShiftRight',2]]);
 assert.equal(heldKeys('shift+a')[1].down.text,'A');assert.equal(heldKeys('super+a')[1].up.commands,undefined);
 for(const key of ['', 'shift+', '+a','invalid+a','a+shift']) assert.throws(()=>heldKeys(key));
 for(const options of [null,[],{durationMs:-1},{durationMs:Infinity},{clickCount:4},{mouseButton:'bad'},{typo:true}]) assert.throws(()=>validateClick(options));
});

test("failed input releases stay owned and retry without another key or mouse press",async()=>{
 const endpoint='http://held-input-test/',owner={},calls=[];
 let failed=true;
 const focus={async acquire(){return 7;},async release(){calls.push('focus-off');}};
 const geometry={loaderId:'loader',viewport:{clientWidth:320,clientHeight:240},contentSize:{width:320,height:240},viewportRevision:0};
 const input=new BrowserInputs(()=>endpoint,async()=>({async send(method,args){
   if(method==='Page.getFrameTree') return {frameTree:{frame:{loaderId:'loader'}}};
   if(method==='Page.getLayoutMetrics') return {cssVisualViewport:geometry.viewport,cssContentSize:geometry.contentSize};
   if(method.startsWith('Input.')) calls.push(args?.type ?? method);
   if(args?.type==='mouseMoved') assert.notEqual(args.x,-1);
   if(args?.type==='mousePressed') throw Error('Press dispatch failed');
   if(args?.type==='mouseReleased' && failed) throw Error('Release outage');
   return {};
 },close(){}}),()=>0,focus);
 input.supported=async()=>{};
 input.target=async()=>({webSocketDebuggerUrl:'page'});
 await assert.rejects(input.click(owner,{targetId:'tab',position:{x:20,y:20},geometry,options:{key:'shift',durationMs:0}}),/Release outage/);
 assert.equal(browserPointerLeases.has(endpoint),true);
 await assert.rejects(input.click({},{targetId:'tab',position:{x:20,y:20},geometry,options:{}}),/already owns/);
 failed=false;await input.cleanup(owner);
 assert.equal(browserPointerLeases.has(endpoint),false);
 assert.equal(calls.filter(call=>call==='mousePressed').length,1);assert.equal(calls.filter(call=>call==='rawKeyDown').length,1);
 assert.equal(calls.filter(call=>call==='keyUp').length,1);assert.equal(calls.at(-1),'focus-off');
});


test("held input refuses missing native cancellation support before opening a target",async()=>{
 let opened=false;
 const input=new BrowserInputs(()=>"http://held-schema-test/",async()=>{opened=true;});
 input.json=async()=>({domains:[{domain:'Input',commands:[{name:'dispatchMouseEvent'},{name:'dispatchKeyEvent'}]}]});
 await assert.rejects(input.click({},{targetId:'tab',position:{x:1,y:1},geometry:{viewport:{clientWidth:20,clientHeight:20}},options:{durationMs:0}}),/require CDP/);
 assert.equal(opened,false);assert.equal(input.leases.size,0);
});


test("ambiguous focus acquisition cleanup keeps the pointer lease until focus is restored",async()=>{
 let failed=true;
 const focus=new BrowserFocusLeases(async()=>{if(failed)throw Error('Focus outage');});
 const input=new BrowserInputs(()=>"http://held-focus-test/",async()=>{throw Error('No input should open');},()=>0,focus);
 input.supported=async()=>{};input.target=async()=>({webSocketDebuggerUrl:'page'});
 const owner={};
 await assert.rejects(input.click(owner,{targetId:'tab',position:{x:1,y:1},geometry:{viewport:{clientWidth:20,clientHeight:20}},options:{durationMs:0}}),/Focus outage/);
 assert.equal(input.leases.size,1);assert.equal(focus.entries.size,1);
 failed=false;await input.cleanup(owner);
 assert.equal(input.leases.size,0);assert.equal(focus.entries.size,0);
});


test("pressKey validates duration and releases after an admitted navigation without replay",async()=>{
 for(const options of [null,[],{durationMs:-1},{durationMs:NaN},{typo:true}]) assert.throws(()=>validatePressKey('a',options));
 for(const key of [undefined,null,'']) assert.throws(()=>validatePressKey(key));
 assert.equal(validatePressKey('shift_r',{durationMs:20}).durationMs,20);
 const calls=[],owner={},endpoint='http://held-key-test/';let navigated=false,failed=true;
 const input=new BrowserInputs(()=>endpoint,async()=>({async send(method,args){
   if(method==='Page.getFrameTree') return {frameTree:{frame:{loaderId:navigated?'new':'old'}}};
   if(method==='DOM.focus') calls.push('focus');
   if(method==='Input.dispatchKeyEvent') {
     calls.push(args.type+':'+args.key);
     if(args.key==='Enter' && args.type==='rawKeyDown') navigated=true;
     if(args.type==='keyUp' && failed) throw Error('Key release outage');
   }
   return {};
 },close(){}}),()=>0,{async acquire(){return 1;},async release(){calls.push('focus-off');}});
 input.supported=async()=>{};input.target=async()=>({webSocketDebuggerUrl:'page'});
 await assert.rejects(input.request(owner,{action:'key',targetId:'tab',backendNodeId:7,key:'shift+Return',options:{durationMs:1},geometry:{loaderId:'old'}}),/Key release outage/);
 assert.equal(input.leases.size,1);
 assert.throws(()=>input.request({}, {action:'check'}),/already owns/);
 failed=false;await input.cleanup(owner);
 assert.equal(input.leases.size,0);assert.equal(calls[0],'focus');
 assert.deepEqual(calls.filter(call=>call.startsWith('rawKeyDown')),['rawKeyDown:Shift','rawKeyDown:Enter']);
 assert.deepEqual(calls.slice(-3),['keyUp:Enter','keyUp:Shift','focus-off']);
});
