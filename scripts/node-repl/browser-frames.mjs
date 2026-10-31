import {setTimeout as delay} from 'node:timers/promises';
export function flattenFrameTree(tree,parentId) {
 const frame=tree.frame;
 return [{id:frame.id,parentId:frame.parentId??parentId,loaderId:frame.loaderId,url:frame.url+(frame.urlFragment??'')},...(tree.childFrames??[]).flatMap(child=>flattenFrameTree(child,frame.id))];
}
function affine(quad) {
 const [x,y]=quad,ax=quad[2]-x,ay=quad[3]-y,bx=quad[6]-x,by=quad[7]-y,det=ax*by-ay*bx;
 if(!quad.every(Number.isFinite)||!det||Math.abs(quad[4]-(quad[2]+quad[6]-x))>.25||Math.abs(quad[5]-(quad[3]+quad[7]-y))>.25)throw Error('Native frame transform unsupported');
 return {x,y,ax,ay,bx,by,det};
}
export function parentFramePoint(quad,viewport,point) {
 const {x,y,ax,ay,bx,by}=affine(quad),u=point.x/viewport.clientWidth,v=point.y/viewport.clientHeight;
 if(![u,v].every(Number.isFinite)||viewport.clientWidth<=0||viewport.clientHeight<=0)throw Error('Invalid native frame viewport');
 return {x:x+u*ax+v*bx,y:y+u*ay+v*by};
}
export function childFramePoint(quad,viewport,point) {
 const {x,y,ax,ay,bx,by,det}=affine(quad),px=point.x-x,py=point.y-y,u=(px*by-py*bx)/det,v=(ax*py-ay*px)/det;
 if(u<0||u>=1||v<0||v>=1)throw Error('Native point outside frame content');
 return {x:u*viewport.clientWidth,y:v*viewport.clientHeight};
}
export async function hitBrowserFrame(send,agents,point,timeout=10000,roundChildPoints=false) {
 let sessionId;const visited=new Set();
 for(let depth=0;depth<32;depth++) {
  const scroll=(await send('Page.getLayoutMetrics',{},timeout,sessionId)).cssLayoutViewport;
  const hit=await send('DOM.getNodeForLocation',{x:Math.floor(point.x+scroll.pageX),y:Math.floor(point.y+scroll.pageY),includeUserAgentShadowDOM:true},timeout,sessionId);
  const {node}=await send('DOM.describeNode',{backendNodeId:hit.backendNodeId},timeout,sessionId);
  if(!['IFRAME','FRAME'].includes(node.nodeName)||!node.frameId||node.frameId===hit.frameId)return {...hit,sessionId,point};
  const child=agents.get(node.frameId);if(!child||visited.has(child))throw Error('Native hit testing found an unbound child frame');visited.add(child);
  const {model}=await send('DOM.getBoxModel',{backendNodeId:hit.backendNodeId},timeout,sessionId),viewport=(await send('Page.getLayoutMetrics',{},timeout,child)).cssLayoutViewport;
  const mapped=childFramePoint(model.content,viewport,point);point=roundChildPoints?{x:Math.floor(mapped.x),y:Math.floor(mapped.y)}:mapped;sessionId=child;
 }
 throw Error('Native frame nesting exceeds 32');
}

export class FrameConnections {
 constructor(send,timeout=10000){this.send=send;this.timeout=timeout;this.sessions=new Map();this.frames=new Map();}
 async refresh(){
  const root=flattenFrameTree((await this.send('Page.getFrameTree',{},this.timeout)).frameTree);
  const frames=new Map(root.map(frame=>[frame.id,{...frame,agent:root[0].id}])),targets=(await this.send('Target.getTargets',{},this.timeout)).targetInfos;
  const pending=targets.filter(target=>target.type==='iframe');const visited=new Set();
  for(let progress=true;progress;){
   progress=false;
   for(const target of pending){
    const parent=frames.get(target.parentFrameId);
    if(!parent||visited.has(target.targetId))continue;
    await this.sendFor(parent.id,frames)('DOM.getFrameOwner',{frameId:target.targetId});
    let sessionId=this.sessions.get(target.targetId);
    if(!sessionId){sessionId=(await this.send('Target.attachToTarget',{targetId:target.targetId,flatten:true},this.timeout)).sessionId;this.sessions.set(target.targetId,sessionId);}
    const children=flattenFrameTree((await this.send('Page.getFrameTree',{},this.timeout,sessionId)).frameTree,target.parentFrameId);
    if(children[0].id!==target.targetId||children[0].parentId!==target.parentFrameId)throw Error('Native child frame identity changed');
    for(const child of children)frames.set(child.id,{...child,agent:target.targetId});
    visited.add(target.targetId);progress=true;
   }
  }
  this.frames=frames;this.root=root[0].id;return [...frames.values()].map(({agent,...frame})=>frame).sort((a,b)=>this.path(a.id).length-this.path(b.id).length||a.id.localeCompare(b.id));
 }
 sendFor(id,frames=this.frames){
  const frame=frames.get(id);if(!frame)throw Error('Native frame detached; read AX state again');
  const sessionId=this.sessions.get(frame.agent);
  return (method,params={})=>this.send(method,params,this.timeout,sessionId);
 }
 path(id){const path=[],seen=new Set();for(let frame=this.frames.get(id);frame;frame=this.frames.get(frame.parentId)){if(seen.has(frame.id))throw Error('Native frame ancestry cycle');seen.add(frame.id);const {agent,...value}=frame;path.unshift(value);}return path;}
 match(path){
  if(!Array.isArray(path)||!path.length||path[0]?.id!==this.root||JSON.stringify(this.path(path.at(-1)?.id))!==JSON.stringify(path))throw Error('Frame document or ancestry changed; read AX state again');
  return this.sendFor(path.at(-1).id);
 }
 async world(id){return (await this.sendFor(id)('Page.createIsolatedWorld',{frameId:id,worldName:'ocu-native-ax'})).executionContextId;}
 async withElement(path,backendNodeId,operation){
  const send=this.match(path),executionContextId=await this.world(path.at(-1).id);
  if(!Number.isInteger(executionContextId)||executionContextId<=0)throw Error('Native frame world unavailable');
  const {object}=await send('DOM.resolveNode',{backendNodeId,executionContextId});
  try{
   const result=await send('Runtime.callFunctionOn',{objectId:object.objectId,functionDeclaration:'function(){return this.isConnected && (this===document || this.ownerDocument===document)}',returnByValue:true});
   if(result.exceptionDetails||result.result.value!==true)throw Error('Element belongs to a different frame; read AX state again');
   await this.refresh();this.match(path);
   return await operation(send,object.objectId,executionContextId);
  }finally{await send('Runtime.releaseObject',{objectId:object.objectId});}
 }
 async rendered(id){
  const agents=[...new Set(this.path(id).map(frame=>this.frames.get(frame.id).agent))];
  // Root visibility/layout and each remote widget must commit before root hit-test routing.
  for(const agent of agents.length>1?[...agents,this.root]:agents){
   const contextId=await this.world(agent),result=await this.sendFor(agent)('Runtime.evaluate',{contextId,expression:'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))',awaitPromise:true,returnByValue:true});
   if(result.exceptionDetails||result.result.value!==true)throw Error('Native frame rendering barrier failed');
  }
 }
 async pointInFrame(id,point,executionContextId){
  const frame=this.frames.get(id);if(!frame)throw Error('Native frame detached');if(frame.id===frame.agent)return point;
  const parent=this.frames.get(frame.parentId),send=this.sendFor(parent.id),{backendNodeId}=await send('DOM.getFrameOwner',{frameId:id}),{model}=await send('DOM.getBoxModel',{backendNodeId});
  const result=await this.sendFor(id)('Runtime.evaluate',{contextId:executionContextId,expression:'({clientWidth:innerWidth,clientHeight:innerHeight})',returnByValue:true});
  if(result.exceptionDetails)throw Error('Native frame viewport unavailable');return childFramePoint(model.content,result.result.value,point);
 }
 async pointToRoot(id,point){
  let frame=this.frames.get(id);if(!frame)throw Error('Native frame detached');frame=this.frames.get(frame.agent);
  const seen=new Set();
  while(frame.parentId){
   if(seen.has(frame.id))throw Error('Native frame ancestry cycle');seen.add(frame.id);
   const parent=this.frames.get(frame.parentId),send=this.sendFor(parent.id),{backendNodeId}=await send('DOM.getFrameOwner',{frameId:frame.id}),{model}=await send('DOM.getBoxModel',{backendNodeId});
   const viewport=(await this.sendFor(frame.id)('Page.getLayoutMetrics')).cssLayoutViewport;
   point=parentFramePoint(model.content,viewport,point);frame=this.frames.get(parent.agent);
  }
  return point;
 }
 hit(point){return hitBrowserFrame(this.send,new Map([[this.root,undefined],...[...this.sessions].filter(([id])=>this.frames.has(id))]),point,this.timeout);}
}

async function captureFrameAX(send,indices) {
 const connections=new FrameConnections(send),before=await connections.refresh(),nodes=[],elements=new Map(),nextIds=new Map(),trees=new Map();
 for(const frame of before){
  let owner;
  if(frame.parentId){
   const parent=trees.get(frame.parentId);if(!parent)continue;
   const {backendNodeId}=await connections.sendFor(frame.parentId)('DOM.getFrameOwner',{frameId:frame.id});
   owner=parent.find(node=>node.backendDOMNodeId===backendNodeId);
   if(!owner||owner.ignoredReasons?.some(reason=>['ariaHiddenElement','ariaHiddenSubtree','inertElement','inertSubtree','notRendered','notVisible','activeModalDialog','activeAriaModalDialog'].includes(reason.name)))continue;
  }
  const tree=(await connections.sendFor(frame.id)('Accessibility.getFullAXTree',{frameId:frame.id})).nodes.filter(node=>node.role?.value!=='InlineTextBox'),ids=new Map();
  for(const node of tree){const key=JSON.stringify([frame.id,frame.loaderId,node.nodeId,node.backendDOMNodeId]);const id=indices.ids.get(key)??String(++indices.next);nextIds.set(key,id);ids.set(node.nodeId,id);}
  const mapped=tree.map(node=>({...node,nodeId:ids.get(node.nodeId),parentId:ids.get(node.parentId),childIds:(node.childIds??[]).map(id=>ids.get(id)).filter(Boolean)}));
  const root=mapped.find(node=>!node.parentId);if(!root)throw Error('Native AX frame root unavailable');root.frameURL=frame.url;
  if(owner){root.parentId=owner.nodeId;owner.childIds.push(root.nodeId);}
  trees.set(frame.id,mapped);nodes.push(...mapped);
  for(const node of mapped)if(!node.ignored&&node.backendDOMNodeId)elements.set(node.nodeId,{...node,framePath:connections.path(frame.id)});
 }
 const after=await connections.refresh();
 if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Frame changed during AX observation; read state again');
 indices.ids=nextIds;
 return {nodes,elements,frames:after};
}

export async function readFrameAX(send,indices){
 for(let attempt=0;;attempt++){
  try{return await captureFrameAX(send,indices);}
  catch(error){
   const transient=error.message==='Frame changed during AX observation; read state again'||error.cdpError&&/frame.*not found|cannot find.*frame|session.*not found|target.*(?:closed|not found)/i.test(error.message);
   if(!transient||attempt>=4)throw error;
   await delay(20);
  }
 }
}
