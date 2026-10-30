import test from "node:test";
import assert from "node:assert/strict";
import {bindDropFrame} from "./browser-playwright.mjs";
import {BrowserDialogs} from "./browser-cdp.mjs";
import {BrowserDrops,validateDrop} from "./browser-drop.mjs";

test("drop validates native MIME data, absolute paths and action options",()=>{
 assert.deepEqual(validateDrop({data:{"text/plain":"你好"},files:"/tmp/file"}),{items:[{mimeType:"text/plain",data:"你好"}],files:["/tmp/file"],dragOperationsMask:1});
 for(const payload of [null,[],{}, {files:"relative"},{files:["/tmp/a\0b"]},{data:{"text/plain":3}},{data:{plain:"x"}},{data:{"text/plain":"x".repeat(16*1024*1024+1)}}]) assert.throws(()=>validateDrop(payload));
 for(const options of [null,[],{timeoutMs:-1},{timeoutMs:Infinity},{position:{x:0}},{position:{x:NaN,y:0}},{force:true}]) assert.throws(()=>validateDrop({data:{"text/plain":"x"}},options));
});

test("drop cancellation releases a pending startup without later input",async()=>{
 let release;
 const gate=new Promise(resolve=>{release=resolve;});
 let opened=false;
 const drops=new BrowserDrops(()=>"http://drop-startup/",async()=>{opened=true;throw Error("unexpected socket");});
 drops.json=async(_,route)=>{await gate;return route==="/json/protocol"?{domains:[{domain:"Input",commands:[{name:"dispatchDragEvent"},{name:"cancelDragging"}]}]}:[{id:"tab",type:"page",webSocketDebuggerUrl:"page"}];};
 const owner={}, id=await drops.request(owner,{action:"acquire",targetId:"tab",payload:{data:{"text/plain":"x"}}});
 await assert.rejects(drops.request({},{action:"release",id}),/Unknown/);
 await assert.rejects(drops.request({},{action:"acquire",targetId:"tab",payload:{data:{"text/plain":"x"}}}),/already owns/);
 const ready=drops.leases.get(id).ready;
 await drops.cleanup(owner);release();await assert.rejects(ready,/canceled/);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(opened,false);
});

test("failed native drag cancellation retains browser ownership and retries",async()=>{
 const events=[];let fail=true;
 const drops=new BrowserDrops(()=>"http://drop-retry/",undefined,async(_,operation)=>operation(async method=>{events.push(method);if(fail)throw Error("cancel failed");}));
 drops.json=async()=>[{id:"tab",webSocketDebuggerUrl:"page"}];
 const owner={},lease={id:1,owner,endpoint:"http://drop-retry/",targetId:"tab",started:true,connection:{close(){events.push("closed");}}};
 drops.leases.set(1,lease);drops.active.set(lease.endpoint,lease);
 await assert.rejects(drops.cleanup(owner),/cancel failed/);
 assert.equal(drops.active.get(lease.endpoint),lease);
 fail=false;await drops.cleanup(owner);assert.equal(drops.leases.size,0);assert.equal(drops.active.has(lease.endpoint),false);
 assert.deepEqual(events,["closed","Input.cancelDragging","closed","Input.cancelDragging","closed"]);
});

test("native child hit testing uses document scroll and child layout dimensions",async()=>{
 const drops=new BrowserDrops();
 const points=[];
 const send=async(method,params,timeout,session)=>{
   if(method==='Page.getLayoutMetrics') return {cssLayoutViewport:session?{pageX:7,pageY:200,clientWidth:200,clientHeight:100}:{pageX:20,pageY:100},cssVisualViewport:{clientWidth:800,clientHeight:600}};
   if(method==='DOM.getNodeForLocation') {points.push({session,x:params.x,y:params.y});return {backendNodeId:session?2:1,frameId:session?'inner':'root'};}
   if(method==='DOM.describeNode') return {node:session?{nodeName:'BUTTON'}:{nodeName:'IFRAME',frameId:'child'}};
   if(method==='DOM.getBoxModel') return {model:{content:[100,50,300,50,300,150,100,150]}};
   throw Error(`Unexpected ${method}`);
 };
 assert.equal(await drops.hitFrame(send,new Map([['child','child-session']]),{x:110,y:80}),'inner');
 assert.deepEqual(points,[{session:undefined,x:130,y:180},{session:'child-session',x:17,y:230}]);
 await assert.rejects(drops.hitFrame(send,new Map(),{x:110,y:80}),/unbound child/);
});

test("native drag rejects a child session whose frame identity changed before dispatch",async()=>{
 const events=[];
 const send=async(method)=>{
   events.push(method);
   if(method==='Target.getTargetInfo') return {targetInfo:{type:'iframe'}};
   if(method==='Target.attachToTarget') return {sessionId:'child-session'};
   if(method==='Page.getFrameTree') return {frameTree:{frame:{id:events.length===1?'main':'different-child',loaderId:'loader',url:'http://fixture/'}}};
   throw Error(`Unexpected ${method}`);
 };
 const drops=new BrowserDrops(),owner={};
 const lease={id:1,owner,stage:0,ready:Promise.resolve(),sessions:new Map(),connection:{send,close(){}}};
 drops.leases.set(1,lease);
 await assert.rejects(drops.request(owner,{action:'stage',id:1,type:'dragEnter',frameTargets:[{targetId:'child',frameId:'expected-child'}]}),/frame target changed/);
 assert.equal(events.some(method=>method.startsWith('Input.')),false);
 await drops.cleanup(owner);
});


test("same-URL native frame ownership matches Core identity and releases native handles",async()=>{
 for(const mode of ['normal','changed','evaluation','invalid']) {
   const released=[],ownerCalls=new Map();
   const parent={},selected={parentFrame:()=>parent},other={parentFrame:()=>parent};
   parent.locator=selector=>({async elementHandles(){return [{async contentFrame(){return selector==='ocu_frame_owner=[1]'?selected:other;},async dispose(){}}];}});
   const session={async send(method,args){
     if(method==='Page.createIsolatedWorld') {assert.equal(args.frameId,'root');return {executionContextId:7};}
     if(method==='DOM.getFrameOwner') {
       const count=(ownerCalls.get(args.frameId)??0)+1;ownerCalls.set(args.frameId,count);
       return {backendNodeId:args.frameId==='first'?1:mode==='changed'&&count>1?99:2};
     }
     if(method==='DOM.resolveNode') {assert.equal(args.executionContextId,7);return {object:{objectId:String(args.backendNodeId)}};}
     if(method==='Runtime.callFunctionOn') {
       if(mode==='evaluation'&&args.objectId==='2') throw Error('Native path read failed');
       return {result:{value:mode==='invalid'?'["shadow",-1]':args.objectId==='1'?'[0]':'[1]'}};
     }
     if(method==='Runtime.releaseObject') {released.push(args.objectId);return {};}
     throw Error(`Unexpected ${method}`);
   }};
   const binding=bindDropFrame(selected,[{id:'root'},{id:'first',parentId:'root',url:'same'},{id:'second',parentId:'root',url:'same'}],new Map([[parent,'root']]),new Map([[parent,session]]));
   if(mode==='normal') assert.equal(await binding,'second');
   else await assert.rejects(binding,mode==='changed'?/owner changed/:mode==='invalid'?/Invalid native drop owner path/:/path read failed/);
   assert.deepEqual(released,mode==='invalid'?['1']:['1','2']);
 }
});

test("dialog responses surface resumed action errors even when the watch finishes during the response",async()=>{
 for(const timing of ['before','during']) {
   const endpoint='http://dialog-errors/',owner={},dialogs=new BrowserDialogs(()=>endpoint);
   const entry={key:endpoint+'|tab',targetId:'tab',owners:new Set([owner]),watches:new Set(),dialogWaiters:new Set()};
   dialogs.targets.set(entry.key,entry);
   const id=await dialogs.request(owner,{action:'watch',targetId:'tab'});
   dialogs.waiters.get(id).opened=true;
   entry.dialog={id:100,type:'prompt',owner};
   const end=()=>dialogs.request(owner,{action:'end',id,error:'Drop document changed'});
   if(timing==='before') await end();
   entry.connection={async send(){if(timing==='during')await end();entry.dialog=undefined;}};
   await assert.rejects(dialogs.request(owner,{action:'respond',targetId:'tab',id:100,response:'dismiss'}),/Drop document changed/);
   assert.equal(dialogs.waiters.size,0);
 }
});
