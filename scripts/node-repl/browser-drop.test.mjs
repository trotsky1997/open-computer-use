import test from "node:test";
import assert from "node:assert/strict";
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
