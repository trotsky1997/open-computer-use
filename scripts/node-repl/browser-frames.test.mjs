import test from 'node:test';
import assert from 'node:assert/strict';
import {FrameConnections,parentFramePoint,childFramePoint,readFrameAX,hitBrowserFrame,clipFramePolygon} from './browser-frames.mjs';

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

test('native frame transforms preserve affine, mirrored and independently projected perspective points',()=>{
 const viewport={clientWidth:400,clientHeight:200},point={x:120,y:80};
 const project=(u,v)=>({x:(200*u+30*v+10)/(1+.4*u+.2*v),y:(10*u+100*v+20)/(1+.4*u+.2*v)});
 const perspective=[[0,0],[1,0],[1,1],[0,1]].flatMap(([u,v])=>{const p=project(u,v);return [p.x,p.y];});
 for(const quad of [[10,20,210,60,180,160,-20,120],perspective,perspective.map((x,i)=>i%2?x:200-x)]){
  const parent=parentFramePoint(quad,viewport,point),child=childFramePoint(quad,viewport,parent);assert.ok(Math.abs(child.x-point.x)<1e-8);assert.ok(Math.abs(child.y-point.y)<1e-8);
 }
 const expected=project(.3,.4),actual=parentFramePoint(perspective,viewport,point);assert.ok(Math.abs(actual.x-expected.x)<1e-8);assert.ok(Math.abs(actual.y-expected.y)<1e-8);
 for(const quad of [[0,0,1,1,0,1,1,0],[0,0,1,0,2,0,3,0],[0,0,NaN,0,1,1,0,1]])assert.throws(()=>parentFramePoint(quad,viewport,point),/degenerate|folded|unsupported/);
 assert.throws(()=>childFramePoint(perspective,viewport,{x:1000,y:1000}),/outside frame/);
 assert.throws(()=>childFramePoint(perspective,{clientWidth:0,clientHeight:1},point),/viewport/);
});

test('frame clipping selects the visible polygon rather than its unclipped bounds',()=>{
 const polygon=[{x:-5,y:5},{x:5,y:-5},{x:6,y:-4},{x:-4,y:6}],viewport=[0,0,10,0,10,10,0,10],clipped=clipFramePolygon(polygon,viewport);
 assert.ok(clipped.length>=3);assert.ok(clipped.every(p=>p.x>=0&&p.y>=0&&p.x+p.y<=2+1e-8));
 const center={x:clipped.reduce((s,p)=>s+p.x,0)/clipped.length,y:clipped.reduce((s,p)=>s+p.y,0)/clipped.length};assert.ok(center.x>0&&center.y>0&&center.x+center.y<2);
 assert.deepEqual(clipFramePolygon(polygon,[20,20,30,20,30,30,20,30]),[]);
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


test('native visual points add document offsets only for hits and agent-root DOM checks',async()=>{
 const point={x:5,y:7},send=async(method,args)=>{
  if(method==='Page.getLayoutMetrics')return {cssLayoutViewport:{pageX:20,pageY:30},cssVisualViewport:{offsetX:100,offsetY:50}};
  if(method==='DOM.getNodeForLocation'){assert.equal(args.x,125);assert.equal(args.y,87);return {frameId:'root',backendNodeId:1};}
  if(method==='DOM.describeNode')return {node:{nodeName:'BUTTON'}};
  if(method==='DOM.getFrameOwner')return {backendNodeId:2};
  if(method==='DOM.getBoxModel')return {model:{content:[0,0,200,0,200,200,0,200]}};
  if(method==='Runtime.evaluate')return {result:{value:{clientWidth:200,clientHeight:200}}};
  throw Error(method);
 };
 assert.deepEqual((await hitBrowserFrame(send,new Map(),point)).point,point);
 const frames=new FrameConnections(send);frames.frames=new Map([['root',{id:'root',agent:'root'}],['same',{id:'same',agent:'root',parentId:'root'}]]);
 assert.deepEqual(await frames.pointInFrame('root',point,17),{x:105,y:57});
 const same=await frames.pointInFrame('same',point,17);assert.ok(Math.abs(same.x-point.x)<1e-8&&Math.abs(same.y-point.y)<1e-8);
});
