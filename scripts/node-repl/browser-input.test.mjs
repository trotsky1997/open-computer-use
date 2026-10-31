import test from "node:test";
import assert from "node:assert/strict";
import {BrowserFocusLeases} from "./browser-playwright.mjs";
import {BrowserInputs,heldKeys,validateClick,validatePressKey,browserPointerLeases} from "./browser-input.mjs";

test('managed clicks and drags admit press effects but stop on resize or navigation',async()=>{
 for(const action of ['click','drag'])for(const mode of ['normal','resize','navigation','hover-resize','hover-navigation','hover-content']) {
  const endpoint='http://pointer-'+action+'-'+mode+'/',calls=[],geometry={loaderId:'old',viewport:{clientWidth:320,clientHeight:240,pageX:0,pageY:0,scale:1},contentSize:{width:320,height:240},viewportRevision:0};let moves=0,pressed=false,hovered=false;const changed=()=>moves>0||action==='click'&&pressed||mode.startsWith('hover-')&&hovered;
  const input=new BrowserInputs(()=>endpoint,async()=>({close(){},async send(method,args){
   calls.push({method,args});
   if(method==='Page.getFrameTree')return {frameTree:{frame:{loaderId:mode.includes('navigation')&&changed()?'new':'old'}}};
   if(method==='Page.getLayoutMetrics')return {cssVisualViewport:{...geometry.viewport,pageY:changed()&&mode!=='hover-content'?100:0,clientWidth:mode.includes('resize')&&changed()?300:320},cssContentSize:{width:320,height:changed()?900:240}};
   if(method==='Input.dispatchMouseEvent'&&args.type==='mouseMoved'&&args.buttons===0)hovered=true;
   if(method==='Input.dispatchMouseEvent'&&args.type==='mousePressed')pressed=true;
   if(method==='Input.dispatchMouseEvent'&&args.type==='mouseMoved'&&args.buttons===1)moves++;
   if(method==='Page.handleJavaScriptDialog')throw Error('No dialog is showing');
   return {};
  }}),()=>0);
  input.supported=async()=>{};input.target=async()=>({webSocketDebuggerUrl:'page'});
  const args={action,targetId:'tab',position:{x:20,y:20},end:{x:200,y:100},geometry};
  if(action==='drag')for(const end of [undefined,{x:NaN,y:2},{x:320,y:20},{x:0,y:-1}])await assert.rejects(input.request({},{...args,end}),/destination/);
  assert.equal(calls.length,0);
  const work=input.request({},args);
  if(mode==='normal')await work;else await assert.rejects(work,/document|viewport/);
  const events=calls.filter(call=>call.method==='Input.dispatchMouseEvent').map(call=>call.args);
  assert.equal(events[0].button,'none');assert.equal(events[0].buttons,0);
  assert.equal(events.filter(event=>event.type==='mousePressed').length,mode.startsWith('hover-')?0:1);
  assert.deepEqual(events.filter(event=>event.type==='mouseReleased').map(event=>[event.x,event.y,event.buttons]),mode.startsWith('hover-')?[]:[mode==='normal'?(action==='drag'?[200,100,0]:[20,20,0]):[-1,-1,0]]);
  assert.equal(moves,action==='drag'&&!mode.startsWith('hover-')?(mode==='normal'?12:1):0);assert.equal(browserPointerLeases.has(endpoint),false);
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


test('AX click preparation owns scrolling and cancellation before any press',async()=>{
 for(const mode of ['normal','cancel','changed','navigation','world-missing','hover-name','hover-covered']) {
  const endpoint='http://prepare-'+mode+'/',owner={},calls=[];let scrolled=false,hovered=false,ready,release;
  const gate=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{ready=resolve;});
  const geometry={loaderId:'old',viewport:{clientWidth:320,clientHeight:240,pageY:0},contentSize:{width:320,height:2000},viewportRevision:0};
  const input=new BrowserInputs(()=>endpoint,async()=>({close(){},async send(method,args){
   calls.push({method,args});
   if(method==='Page.getFrameTree')return {frameTree:{frame:{id:'root',loaderId:mode==='navigation'&&scrolled?'new':'old'}}};
   if(method==='Page.getLayoutMetrics')return {cssVisualViewport:{...geometry.viewport,pageY:scrolled?800:0},cssContentSize:geometry.contentSize};
   if(method==='Accessibility.getPartialAXTree')return {nodes:[{backendDOMNodeId:9,role:{value:'button'},name:{value:mode==='changed'||mode==='hover-name'&&hovered?'Changed':'Target'}}]};
   if(method==='DOM.scrollIntoViewIfNeeded'){scrolled=true;ready();await gate;}
   if(method==='Page.createIsolatedWorld'){assert.deepEqual(args,{frameId:'root',worldName:'ocu-pointer'});return mode==='world-missing'?{}:{executionContextId:17};}
   if(method==='DOM.resolveNode'){assert.equal(args.executionContextId,17);return {object:{objectId:'node'}};}
   if(method==='Runtime.callFunctionOn'){assert.deepEqual(args.arguments,[{value:hovered?{x:20,y:30}:null}]);return mode==='hover-covered'&&hovered?{exceptionDetails:{}}:{result:{value:{x:20,y:30}}};}
   if(method==='Input.dispatchMouseEvent'&&args.type==='mouseMoved')hovered=true;
   return {};
  }}),()=>0);
  input.supported=async()=>{};input.target=async()=>({webSocketDebuggerUrl:'page'});
  const args={targetId:'tab',element:{backendNodeId:9,role:'button',name:'Target'},geometry};
  const work=input.request(owner,args);work.catch(()=>{});
  if(mode==='changed')await assert.rejects(work,/Element changed/);
  else {
   await started;
   assert.equal(input.leases.get(endpoint).owner,owner);
   assert.throws(()=>input.request({},{action:'check'}),/already owns/);
   if(mode==='cancel')input.cancel(owner);
   release();
   if(mode==='normal')await work;else await assert.rejects(work,mode==='cancel'?/canceled/:mode==='world-missing'?/isolated world/:mode==='hover-name'?/changed/:mode==='hover-covered'?/covered/:/document|viewport/);
  }
  assert.equal(calls.filter(call=>call.args?.type==='mousePressed').length,mode==='normal'?1:0);
  assert.equal(calls.filter(call=>call.method==='DOM.scrollIntoViewIfNeeded').length,mode==='changed'?0:1);
  assert.equal(calls.filter(call=>call.method==='Runtime.releaseObject').length,mode==='normal'||mode==='hover-covered'?2:mode==='hover-name'?1:0);
  assert.equal(input.leases.size,0);assert.equal(browserPointerLeases.has(endpoint),false);
 }
});
