import test from "node:test";
import assert from "node:assert/strict";
import {BrowserFocusLeases} from "./browser-playwright.mjs";
import {BrowserInputs,heldKeys,validateClick,browserPointerLeases} from "./browser-input.mjs";

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
