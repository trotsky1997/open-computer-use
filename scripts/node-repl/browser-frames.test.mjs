import test from 'node:test';
import assert from 'node:assert/strict';
import {FrameConnections,parentFramePoint,childFramePoint,readFrameAX,hitBrowserFrame} from './browser-frames.mjs';

test('frame agents require native owned ancestry and frame identity; AX IDs stay distinct and stable',async()=>{
 const attached=[];let transient=true,backend=21;
 const root={frame:{id:'root',loaderId:'L1',url:'https://root/'},childFrames:[{frame:{id:'same',parentId:'root',loaderId:'L2',url:'https://root/frame'}}]};
 const child={frame:{id:'cross',parentId:'root',loaderId:'L3',url:'https://cross/'}};
 const send=async(method,args={},timeout,session)=>{
  if(method==='Page.getFrameTree')return {frameTree:session?child:root};
  if(method==='Target.getTargets')return {targetInfos:[{type:'iframe',targetId:'foreign',parentFrameId:'outside'},{type:'iframe',targetId:'cross',parentFrameId:'root'}]};
  if(method==='DOM.getFrameOwner'){assert.ok(['same','cross'].includes(args.frameId));return {backendNodeId:args.frameId==='same'?11:12};}
  if(method==='Target.attachToTarget'){attached.push(args.targetId);assert.equal(args.targetId,'cross');return {sessionId:'S3'};}
  if(method==='Accessibility.getFullAXTree'&&transient){transient=false;throw Object.assign(Error('Frame with the given frameId is not found'),{cdpError:true});}
  if(method==='Accessibility.getFullAXTree')return {nodes:args.frameId==='root'?[{nodeId:'1',frameId:'root',role:{value:'RootWebArea'},childIds:['2','3']},{nodeId:'2',parentId:'1',backendDOMNodeId:11,role:{value:'Iframe'}},{nodeId:'3',parentId:'1',backendDOMNodeId:12,role:{value:'Iframe'}}]:[{nodeId:'1',frameId:args.frameId,role:{value:'RootWebArea'},childIds:['2']},{nodeId:'2',parentId:'1',backendDOMNodeId:backend,role:{value:'textbox'},name:{value:'Twin'}}]};
  throw Error('Unexpected native command '+method);
 };
 const frames=new FrameConnections(send);await frames.refresh();assert.deepEqual(attached,['cross']);
 const path=frames.path('cross');assert.equal(path[0].id,'root');assert.equal(path.at(-1).loaderId,'L3');assert.throws(()=>frames.match([{id:'foreign'}]),/ancestry changed/);
 const ids={next:0,ids:new Map()},first=await readFrameAX(send,ids),twins=[...first.elements].filter(([,node])=>node.name?.value==='Twin');assert.equal(twins.length,2);assert.notEqual(twins[0][0],twins[1][0]);
 assert.deepEqual((await readFrameAX(send,ids)).nodes,first.nodes);backend=22;const replaced=await readFrameAX(send,ids);assert.ok([...replaced.elements].filter(([,node])=>node.name?.value==='Twin').every(([id])=>!twins.some(([old])=>old===id)));child.frame.loaderId='changed';await frames.refresh();assert.throws(()=>frames.match(path),/ancestry changed/);
 assert.ok(attached.every(id=>id==='cross'));
 await assert.rejects(readFrameAX(async()=>{throw Error('Permission denied');},ids),/Permission denied/);
});

test('native frame transforms preserve affine points and reject ambiguous perspective/outside hits',()=>{
 const quad=[10,20,210,60,180,160,-20,120],viewport={clientWidth:400,clientHeight:200},point={x:120,y:80};
 const parent=parentFramePoint(quad,viewport,point),child=childFramePoint(quad,viewport,parent);assert.ok(Math.abs(child.x-point.x)<1e-8);assert.ok(Math.abs(child.y-point.y)<1e-8);
 assert.throws(()=>parentFramePoint([10,20,210,60,190,170,-20,120],viewport,point),/transform unsupported/);
 assert.throws(()=>childFramePoint(quad,viewport,{x:1000,y:1000}),/outside frame/);
});

test('nested native hit testing retains subpixel points while drop keeps its integer routing',async()=>{
 const send=async(method,args,timeout,session)=>{
  if(method==='Page.getLayoutMetrics')return {cssLayoutViewport:{pageX:0,pageY:0,clientWidth:200,clientHeight:200}};
  if(method==='DOM.getNodeForLocation')return session==='S2'?{frameId:'two',backendNodeId:args.x===1&&args.y===1?401:402}:{frameId:session?'one':'root',backendNodeId:session?200:100};
  if(method==='DOM.describeNode')return {node:args.backendNodeId>=400?{nodeName:'BUTTON'}:{nodeName:'IFRAME',frameId:args.backendNodeId===100?'one':'two'}};
  if(method==='DOM.getBoxModel')return {model:{content:[10,10,110,10,110,110,10,110]}};
  throw Error(method);
 };
 const agents=new Map([['one','S1'],['two','S2']]),point={x:15.4,y:15.4};
 assert.equal((await hitBrowserFrame(send,agents,point)).backendNodeId,401);
 assert.equal((await hitBrowserFrame(send,agents,point,10000,true)).backendNodeId,402);
});
