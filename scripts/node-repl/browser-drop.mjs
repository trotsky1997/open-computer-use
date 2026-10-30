import {isAbsolute} from "node:path";
import {stat} from "node:fs/promises";

import {browserPointerLeases as active} from "./browser-input.mjs";

export function validateDrop(payload, options = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).some(key=>!["data","files"].includes(key))) throw new Error("drop expects data and/or absolute file paths");
  const files = typeof payload.files === "string" ? [payload.files] : payload.files ?? [];
  if (!Array.isArray(files) || files.some(file=>typeof file !== "string" || !isAbsolute(file) || file.includes("\0"))) throw new Error("drop files require absolute file paths");
  if (payload.data !== undefined && (!payload.data || typeof payload.data !== "object" || Array.isArray(payload.data))) throw new Error("drop data must map MIME types to strings");
  let size = 0;
  const entries = Object.entries(payload.data ?? {});
  for (const [mimeType,value] of entries) {
    if (!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(mimeType) || typeof value !== "string") throw new Error("drop data requires MIME types and string values");
    size += Buffer.byteLength(value);
  }
  if (!files.length && !entries.length) throw new Error("drop requires at least one file or data entry");
  if (size > 16*1024*1024) throw new Error("drop data exceeds 16 MiB");
  if (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).some(key=>!["timeoutMs","position"].includes(key))) throw new Error("Invalid drop options");
  if (options.timeoutMs !== undefined && (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 0)) throw new Error("drop timeoutMs must be non-negative");
  if (options.position !== undefined && (!options.position || typeof options.position !== "object" || Object.keys(options.position).some(key=>!["x","y"].includes(key)) || ![options.position.x,options.position.y].every(value=>Number.isFinite(value) && value >= 0))) throw new Error("Invalid drop position");
  return {items:entries.map(([mimeType,data])=>({mimeType,data})),files:[...files],dragOperationsMask:1};
}

export function dropFrames(tree, parentId) {
  const frame = tree.frame;
  return [{id:frame.id,parentId:frame.parentId ?? parentId,loaderId:frame.loaderId,url:frame.url+(frame.urlFragment ?? "")},...(tree.childFrames ?? []).flatMap(child=>dropFrames(child,frame.id))];
}

export class BrowserDrops {
  constructor(endpoint, open, connect, revision = () => 0) {
    this.endpoint = endpoint;
    this.open = open;
    this.connect = connect;
    this.revision = revision;
    this.leases = new Map();
    this.active = active;
    this.closedOwners = new WeakSet();
    this.nextId = 0;
  }
  async json(endpoint,route) {
    const response = await fetch(new URL(route,endpoint),{signal:AbortSignal.timeout(10_000),redirect:"error"});
    if (!response.ok) throw new Error(`Drop browser discovery failed: HTTP ${response.status}`);
    return response.json();
  }
  async request(owner,args) {
    if (args?.action === "revision") return this.revision();
    if (args?.action === "acquire") {
      const data = validateDrop(args.payload);
      const endpoint = this.endpoint();
      if (!endpoint) throw new Error("No CDP browser configured");
      if (this.closedOwners.has(owner)) throw new Error("Native drop session closed");
      if (active.has(endpoint)) throw new Error("A native pointer action already owns this browser");
      const lease = {id:++this.nextId,owner,endpoint,targetId:args.targetId,data,stage:0,started:false,canceled:false,sessions:new Map()};
      this.leases.set(lease.id,lease);
      active.set(endpoint,lease);
      lease.ready = (async () => {
        for (const file of data.files) if (!(await stat(file)).isFile()) throw new Error("drop accepts regular files only");
        const protocol = await this.json(endpoint,"/json/protocol");
        const commands = protocol.domains?.find(domain=>domain.domain === "Input")?.commands ?? [];
        if (!["dispatchDragEvent","cancelDragging"].every(name=>commands.some(command=>command.name===name))) throw new Error("Native drop requires CDP drag dispatch and cancellation support");
        const target = (await this.json(endpoint,"/json/list")).find(target=>target.type === "page" && target.id===lease.targetId);
        if (!target) throw new Error("Drop tab closed or unavailable");
        if (lease.canceled) throw new Error("Native drop canceled");
        lease.connection = await this.open(target.webSocketDebuggerUrl);
        if (lease.canceled) {lease.connection.close();throw new Error("Native drop canceled");}
        lease.mainLoader = (await lease.connection.send("Page.getFrameTree")).frameTree.frame.loaderId;
      })();
      lease.ready.catch(()=>{});
      return lease.id;
    }
    const lease = this.leases.get(args?.id);
    if (!lease || lease.owner !== owner) throw new Error("Unknown native drop lease");
    if (args.action === "release") return this.finish(lease);
    if (args.action !== "stage") throw new Error("Unknown native drop action");
    if (lease.canceled || this.closedOwners.has(owner)) throw new Error("Native drop canceled");
    if (lease.pending) throw new Error("A native drop stage is already running");
    const pending = (async () => {
      await lease.ready;
      if (lease.canceled) throw new Error("Native drop canceled");
      if (["dragEnter","dragOver","drop"][lease.stage] !== args.type) throw new Error("Invalid native drop stage order");
      const send = lease.connection.send;
      const frames = dropFrames((await send("Page.getFrameTree")).frameTree);
      const agents=new Map([[frames[0].id,undefined]]);
      const documents=new Map(frames.map(frame=>[frame.id,undefined]));
      for(const item of args.frameTargets ?? []) {
        if(!lease.sessions.has(item.targetId)) {
          const {targetInfo}=await send("Target.getTargetInfo",{targetId:item.targetId});
          if(targetInfo.type!=="iframe") throw new Error("Drop child target is not a frame");
          const {sessionId}=await send("Target.attachToTarget",{targetId:item.targetId,flatten:true});
          lease.sessions.set(item.targetId,sessionId);
        }
        const sessionId=lease.sessions.get(item.targetId);
        const tree=dropFrames((await send("Page.getFrameTree",{},10_000,sessionId)).frameTree);
        if(tree[0].id!==item.frameId) throw new Error("Native drop frame target changed");
        agents.set(item.frameId,sessionId);
        for(const frame of tree) {
          documents.set(frame.id,sessionId);
          if(!frames.some(existing=>existing.id===frame.id)) frames.push(frame);
        }
      }
      const viewport = (await send("Page.getLayoutMetrics")).cssVisualViewport;
      if (frames[0].loaderId !== lease.mainLoader || frames[0].loaderId !== args.geometry?.loaderId || JSON.stringify(viewport) !== JSON.stringify(args.geometry?.viewport) || await this.revision() !== args.geometry?.revision) throw new Error("Drop document or viewport changed; resolve the target again");
      const {x,y} = args.point ?? {};
      if (![x,y].every(Number.isInteger) || x < 0 || y < 0 || x >= viewport.clientWidth || y >= viewport.clientHeight) throw new Error("Drop point is outside the visible viewport");
      const frameId=await this.hitFrame(send,agents,{x,y});
      const frame = frames.find(frame=>frame.id===frameId);
      const snapshot = args.frames?.find(frame=>frame.id===frameId);
      const path = [];
      for (let item=frame;item;item=frames.find(frame=>frame.id===item.parentId)) path.unshift(item.url);
      if (!frame || frame.id!==args.frameId || !snapshot || frame.loaderId !== snapshot.loaderId || JSON.stringify(path) !== JSON.stringify(args.framePath) || lease.document && (lease.document.id !== frame.id || lease.document.loaderId !== frame.loaderId)) throw new Error("Native drop hit a different frame or document");
      const latestMain=dropFrames((await send("Page.getFrameTree")).frameTree);
      const frameSession=documents.get(frame.id);
      const latestFrame=(frameSession ? dropFrames((await send("Page.getFrameTree",{},10_000,frameSession)).frameTree) : latestMain).find(item=>item.id===frame.id);
      const latestViewport=(await send("Page.getLayoutMetrics")).cssVisualViewport;
      if(latestMain[0].loaderId!==lease.mainLoader || latestFrame?.loaderId!==frame.loaderId || JSON.stringify(latestViewport)!==JSON.stringify(viewport) || await this.revision()!==args.geometry.revision) throw new Error("Native drop document or viewport changed during hit testing");
      if (lease.canceled) throw new Error("Native drop canceled");
      lease.document = {id:frame.id,loaderId:frame.loaderId};
      lease.stage++;
      lease.started = true;
      // Session cancellation closes this connection; dialogs may remain open across JS calls.
      await send("Input.dispatchDragEvent",{type:args.type,x,y,data:lease.data},0);
    })();
    lease.pending = pending;
    try {return await pending;}
    finally {if (lease.pending === pending) lease.pending=undefined;}
  }
  async hitFrame(send,agents,point) {
    let sessionId;
    const visited=new Set();
    for(let depth=0;depth<32;depth++) {
      const scroll=(await send("Page.getLayoutMetrics",{},10_000,sessionId)).cssLayoutViewport;
      const hit=await send("DOM.getNodeForLocation",{x:Math.floor(point.x+scroll.pageX),y:Math.floor(point.y+scroll.pageY),includeUserAgentShadowDOM:true},10_000,sessionId);
      const {node}=await send("DOM.describeNode",{backendNodeId:hit.backendNodeId},10_000,sessionId);
      if(!["IFRAME","FRAME"].includes(node.nodeName) || !node.frameId || node.frameId===hit.frameId) return hit.frameId;
      const child=agents.get(node.frameId);
      if(!child || visited.has(child)) throw new Error("Native drop hit an unbound child frame");
      visited.add(child);
      const {model}=await send("DOM.getBoxModel",{backendNodeId:hit.backendNodeId},10_000,sessionId);
      const viewport=(await send("Page.getLayoutMetrics",{},10_000,child)).cssLayoutViewport;
      const q=model.content, ax=q[2]-q[0],ay=q[3]-q[1],bx=q[6]-q[0],by=q[7]-q[1];
      const determinant=ax*by-ay*bx;
      if(!determinant || Math.abs(q[4]-(q[2]+q[6]-q[0]))>.25 || Math.abs(q[5]-(q[3]+q[7]-q[1]))>.25) throw new Error("Native drop frame transform unsupported");
      const px=point.x-q[0],py=point.y-q[1],u=(px*by-py*bx)/determinant,v=(ax*py-ay*px)/determinant;
      if(u<0 || u>=1 || v<0 || v>=1) throw new Error("Native drop point outside frame content");
      point={x:Math.floor(u*viewport.clientWidth),y:Math.floor(v*viewport.clientHeight)};
      sessionId=child;
    }
    throw new Error("Native drop frame nesting exceeds 32");
  }
  finish(lease) {
    lease.canceled = true;
    if (lease.finishing) return lease.finishing;
    if (lease.pending) lease.connection?.close();
    lease.finishing = (async () => {
      // Startup is read-only; a canceled startup closes its own eventual connection.
      if (lease.started) {
        await lease.pending?.catch(()=>{});
        const target = (await this.json(lease.endpoint,"/json/list")).find(target=>target.id===lease.targetId);
        if (target) await this.connect(target.webSocketDebuggerUrl,send=>send("Input.cancelDragging"));
      }
      lease.connection?.close();
      if (active.get(lease.endpoint) === lease) active.delete(lease.endpoint);
      this.leases.delete(lease.id);
    })().catch(error=>{lease.finishing=undefined;error.browserCleanupFailed=true;throw error;});
    return lease.finishing;
  }
  cancel(owner) {
    this.closedOwners.add(owner);
    for (const lease of this.leases.values()) if (lease.owner === owner) {lease.canceled=true;lease.connection?.close();}
  }
  async cleanup(owner) {
    this.cancel(owner);
    const results = await Promise.allSettled([...this.leases.values()].filter(lease=>lease.owner===owner).map(lease=>this.finish(lease)));
    const failed = results.find(result=>result.status === "rejected");
    if (failed) throw failed.reason;
  }
}
