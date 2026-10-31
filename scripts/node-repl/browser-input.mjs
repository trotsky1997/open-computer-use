import {setTimeout as delay} from "node:timers/promises";

export const browserPointerLeases=new Map();
const active=browserPointerLeases;
const modifiers={alt:[1,"Alt",18],option:[1,"Alt",18],ctrl:[2,"Control",17],control:[2,"Control",17],meta:[4,"Meta",91],super:[4,"Meta",91],cmd:[4,"Meta",91],command:[4,"Meta",91],shift:[8,"Shift",16]};

export function heldKeys(key) {
  if(key===undefined) return [];
  if(typeof key!=="string" || !key.trim()) throw new Error("Input key requires a non-empty key or chord");
  const tokens=key.split("+").map(token=>token.trim());
  const events=[],seen=new Set();let flags=0;
  for(const [index,token] of tokens.entries()) {
    if(!token) throw new Error("Empty input key token");
    const name=token.toLowerCase(),modifier=modifiers[name.replace(/_[lr]$/u,"")];
    if(modifier) {
      const right=name.endsWith("_r"),code=modifier[1]+(right?"Right":"Left");
      if(seen.has(code)) continue;
      const before=flags;flags|=modifier[0];seen.add(code);
      const base={key:modifier[1],code,windowsVirtualKeyCode:modifier[2]+(right && modifier[1]==="Meta"?1:0),location:right?2:1};
      events.push({down:{type:"rawKeyDown",...base,modifiers:flags},up:{type:"keyUp",...base,modifiers:before}});
    } else {
      if(index!==tokens.length-1) throw new Error(`Unsupported held key modifier: ${token}`);
      const prefix=[[1,"alt"],[2,"control"],[4,"meta"],[8,"shift"]].filter(([mask])=>flags&mask).map(([,name])=>name);
      const event=keyEvent([...prefix,token].join("+"));
      if(event.text) event.key=event.text;
      events.push({down:{type:event.text?"keyDown":"rawKeyDown",...event},up:{...event,type:"keyUp",text:undefined,commands:undefined}});
    }
  }
  return events;
}

export function validateClick(options={}) {
  if(!options || typeof options!=="object" || Array.isArray(options) || Object.keys(options).some(key=>!["mouseButton","clickCount","key","durationMs"].includes(key))) throw new Error("Invalid click options");
  const button=({l:"left",r:"right",m:"middle"})[options.mouseButton] ?? options.mouseButton ?? "left",count=options.clickCount ?? 1;
  if(!["left","right","middle"].includes(button) || !Number.isInteger(count) || count<1 || count>3) throw new Error("Invalid click button or count");
  if(options.durationMs!==undefined && (!Number.isFinite(options.durationMs) || options.durationMs<0)) throw new Error("Click durationMs must be finite and non-negative");
  return {button,count,durationMs:options.durationMs ?? 0,keys:heldKeys(options.key)};
}

export function validatePressKey(key,options={}) {
  if(!options || typeof options!=="object" || Array.isArray(options) || Object.keys(options).some(name=>name!=="durationMs")) throw new Error("Invalid pressKey options");
  if(key===undefined) throw new Error("pressKey requires a key");
  return {...validateClick({key,durationMs:options.durationMs}),count:0};
}

export class BrowserInputs {
  constructor(endpoint,open,revision=()=>0,focus,dialog=()=>undefined) {
    this.endpoint=endpoint;this.open=open;this.revision=revision;this.focus=focus;this.dialog=dialog;
    this.leases=new Map();this.closedOwners=new WeakSet();
  }
  request(owner,args) {
    if(this.closedOwners.has(owner)) throw new Error("Browser input session closed");
    if(args?.action==="check") {
      if(active.has(this.endpoint())) throw new Error("A native input action already owns this browser");
      return;
    }
    if(["text","key"].includes(args?.action) && args.backendNodeId!==undefined)throw new Error("Input target requires AX identity");
    if(args?.action==="text") {
      if(typeof args.text!=="string")throw new Error("typeText requires text");
      return this.perform(owner,args,{keys:[],count:0,durationMs:0},true);
    }
    if(args?.action==="key") return this.pressKey(owner,args);
    if(args?.action==="drag") return this.perform(owner,args,validateClick({}));
    if(args?.action!==undefined && args.action!=="click") throw new Error("Unknown browser input action");
    return this.click(owner,args);
  }
  async json(endpoint,route) {
    const response=await fetch(new URL(route,endpoint),{signal:AbortSignal.timeout(10_000),redirect:"error"});
    if(!response.ok) throw new Error(`Input discovery failed: HTTP ${response.status}`);
    return response.json();
  }
  async target(endpoint,id) {return (await this.json(endpoint,"/json/list")).find(target=>target.id===id && target.type==="page");}
  async supported(endpoint,{keyboard=false,element=false,text=false}={}) {
    const protocol=await this.json(endpoint,"/json/protocol");
    const required={Input:["dispatchKeyEvent","dispatchMouseEvent","cancelDragging"],Page:["enable","getFrameTree","getLayoutMetrics","handleJavaScriptDialog"],Emulation:["setFocusEmulationEnabled"]};
    if(keyboard) required.DOM=["focus"];
    if(text)required.Input.push("insertText");
    if(element)required.Accessibility=["getPartialAXTree"];
    if(element && !keyboard) {required.Page.push("createIsolatedWorld");required.DOM=["scrollIntoViewIfNeeded","resolveNode"];required.Runtime=["callFunctionOn","releaseObject"];}
    if(!Object.entries(required).every(([domain,names])=>names.every(name=>protocol.domains?.find(item=>item.domain===domain)?.commands?.some(command=>command.name===name)))) throw new Error("Managed inputs require CDP input, cancellation, dialog, focus and requested AX target support");
  }
  check(record) {if(record.canceled) throw new Error("Browser input canceled");}
  async idle(record) {
    this.check(record);
    while(await this.dialog(record.owner,record.targetId)) {await delay(20,undefined,{signal:record.abort.signal});this.check(record);}
  }
  async guard(record) {
    await this.idle(record);
    const send=record.connection.send;
    const loaderId=(await send("Page.getFrameTree",{},0)).frameTree.frame.loaderId;
    if(record.keyboard) {
      this.check(record);
      if(loaderId!==record.geometry?.loaderId) throw new Error("Browser input document changed");
      return;
    }
    const metrics=await send("Page.getLayoutMetrics",{},0);
    const actual={loaderId,viewport:metrics.cssVisualViewport,contentSize:metrics.cssContentSize,viewportRevision:await this.revision()};
    this.check(record);
    if(record.mouse) {
      // Press handlers may scroll or resize content; the coordinate viewport must stay stable.
      if(loaderId!==record.geometry.loaderId || actual.viewportRevision!==record.geometry.viewportRevision || !['clientWidth','clientHeight','scale','zoom','offsetX','offsetY'].every(key=>actual.viewport[key]===record.geometry.viewport[key])) throw new Error("Browser pointer document or viewport changed");
      return;
    }
    if(JSON.stringify(actual)!==JSON.stringify(record.geometry)) throw new Error("Browser input document or geometry changed");
  }
  async elementNode(record,element) {
    await this.guard(record);
    const current=await record.connection.send("Accessibility.getPartialAXTree",{backendNodeId:element.backendNodeId,fetchRelatives:false},0);
    this.check(record);
    const node=current.nodes.find(node=>node.backendDOMNodeId===element.backendNodeId && !node.ignored);
    if(!node || node.role?.value!==element.role || node.name?.value!==element.name)throw new Error("Element changed; read AX state again");
    return node;
  }
  async focusedElement(record,element) {
    const node=await this.elementNode(record,element);
    if(!node.properties?.some(property=>property.name==='focused'&&property.value?.value===true))throw new Error("Input target lost focus; read AX state again");
    // shortcut: focus can change after this check; strict binding needs a browser-side atomic target dispatch.
  }
  async elementPoint(record,element,position) {
    const send=async(method,params={})=>{this.check(record);const result=await record.connection.send(method,params,0);this.check(record);return result;};
    await this.elementNode(record,element);
    await this.guard(record);
    // Rechecks keep the admitted point; scrolling again would silently retarget.
    if(!position)await send("DOM.scrollIntoViewIfNeeded",{backendNodeId:element.backendNodeId});
    const frame=(await send("Page.getFrameTree")).frameTree.frame,loaderId=frame.loaderId;
    if(!position) {
      const metrics=await send("Page.getLayoutMetrics"),viewportRevision=await this.revision();
      this.check(record);
      if(loaderId!==record.geometry.loaderId || viewportRevision!==record.geometry.viewportRevision || !['clientWidth','clientHeight','scale','zoom','offsetX','offsetY'].every(key=>metrics.cssVisualViewport[key]===record.geometry.viewport[key]))throw new Error("Browser pointer document or viewport changed during preparation");
      record.geometry={loaderId,viewport:metrics.cssVisualViewport,contentSize:metrics.cssContentSize,viewportRevision};
    }
    const {executionContextId}=await send("Page.createIsolatedWorld",{frameId:frame.id,worldName:"ocu-pointer"});
    if(!Number.isInteger(executionContextId) || executionContextId<=0)throw new Error("Browser pointer isolated world unavailable");
    const {object}=await send("DOM.resolveNode",{backendNodeId:element.backendNodeId,executionContextId});
    try {
      const result=await send("Runtime.callFunctionOn",{objectId:object.objectId,returnByValue:true,arguments:[{value:position ?? null}],functionDeclaration:`function(position) {
        if(this.ownerDocument!==document)throw new Error("Element outside the main document");
        const r=this.getBoundingClientRect();
        const x=position ? position.x : Math.max(0,r.left)+(Math.min(innerWidth,r.right)-Math.max(0,r.left))/2;
        const y=position ? position.y : Math.max(0,r.top)+(Math.min(innerHeight,r.bottom)-Math.max(0,r.top))/2;
        const hit=this.ownerDocument.elementFromPoint(x,y);
        if(!this.isConnected || r.width<=0 || r.height<=0 || !(hit===this || this.contains(hit)))throw new Error("Element is covered or not visible");
        return {x,y};
      }`});
      if(result.exceptionDetails)throw new Error("Element is covered or not visible in the main document; read state again");
      const {x,y}=result.result.value ?? {};
      if(![x,y].every(Number.isFinite) || x<0 || y<0 || x>=record.geometry.viewport.clientWidth || y>=record.geometry.viewport.clientHeight)throw new Error("Invalid browser input position");
      return {x,y};
    } finally {await send("Runtime.releaseObject",{objectId:object.objectId});}
  }
  click(owner,args) {return this.perform(owner,args,validateClick(args.options));}
  pressKey(owner,args) {return this.perform(owner,args,validatePressKey(args.key,args.options),true);}
  async dwell(record,durationMs) {
    let remaining=durationMs;
    while(remaining>0) {const start=performance.now();await delay(Math.min(remaining,1000),undefined,{signal:record.abort.signal});remaining-=performance.now()-start;this.check(record);}
  }
  async perform(owner,args,options,keyboard=false) {
    const endpoint=this.endpoint();
    if(!endpoint || typeof args.targetId!=="string" || !args.targetId) throw new Error("Browser input target unavailable");
    if(this.closedOwners.has(owner)) throw new Error("Browser input session closed");
    if(active.has(endpoint)) throw new Error("A native input action already owns this browser");
    const {x,y}=args.position ?? {},viewport=args.geometry?.viewport;
    if(args.element!==undefined && (args.action==='drag' || args.position!==undefined || args.backendNodeId!==undefined || !args.geometry?.loaderId || !Number.isInteger(args.element?.backendNodeId) || args.element.backendNodeId<=0 || !['role','name'].every(key=>args.element[key]===undefined || typeof args.element[key]==='string')))throw new Error("Invalid browser element target");
    if(!keyboard && args.element===undefined && (![x,y].every(Number.isFinite) || x<0 || y<0 || x>=viewport?.clientWidth || y>=viewport?.clientHeight || !viewport)) throw new Error("Invalid browser input position");
    if(args.action==='drag' && (![args.end?.x,args.end?.y].every(Number.isFinite) || args.end.x<0 || args.end.y<0 || args.end.x>=viewport.clientWidth || args.end.y>=viewport.clientHeight)) throw new Error("Invalid browser drag destination");
    if(keyboard && (!args.geometry?.loaderId || args.backendNodeId!==undefined)) throw new Error("Invalid browser key target");
    const record={keyboard,owner,endpoint,targetId:args.targetId,position:{x,y},geometry:args.geometry,keys:[],modifiers:0,abort:new AbortController()};
    active.set(endpoint,record);this.leases.set(endpoint,record);
    record.work=(async()=>{
      await this.supported(endpoint,{keyboard,element:args.element!==undefined,text:args.action==='text'});this.check(record);
      const target=await this.target(endpoint,args.targetId);this.check(record);
      if(!target) throw new Error("Browser input tab closed");
      if(this.focus) {
        try {record.focus=await this.focus.acquire(owner,args.targetId);}
        catch(error) {record.focus=error.browserFocusLease;throw error;}
      }
      this.check(record);
      record.connection=await this.open(target.webSocketDebuggerUrl);this.check(record);
      const send=record.connection.send;
      if(!this.focus) {record.emulated=true;await send("Emulation.setFocusEmulationEnabled",{enabled:true});}
      if(args.element!==undefined) {
        if(keyboard)await this.elementNode(record,args.element);
        else record.position=await this.elementPoint(record,args.element);
      }
      const backendNodeId=args.element?.backendNodeId;
      if(keyboard && backendNodeId!==undefined) {await this.guard(record);await send("DOM.focus",{backendNodeId},0);}
      if(args.action==='text') {
        if(args.element!==undefined)await this.focusedElement(record,args.element);
        await this.guard(record);
        await send("Input.insertText",{text:args.text},0);
      }
      for(const key of options.keys) {
        if(keyboard && args.element!==undefined)await this.focusedElement(record,args.element);
        await this.guard(record);
        record.keys.push(key.up);record.modifiers=key.down.modifiers;
        await send("Input.dispatchKeyEvent",key.down,0);
      }
      if(keyboard) await this.dwell(record,options.durationMs);
      for(let count=1;count<=options.count;count++) {
        await this.guard(record);
        const mouse={...record.position,button:options.button,clickCount:count,modifiers:record.modifiers};
        // CDP adds button's flag to buttons, even on a move before the press.
        await send("Input.dispatchMouseEvent",{type:"mouseMoved",...mouse,button:'none',buttons:0},0);this.check(record);
        if(args.element!==undefined)await this.elementPoint(record,args.element,record.position);
        await this.guard(record);
        // shortcut: layout can change after this check; strict fencing needs an atomic browser-side hit check and press.
        record.mouse=mouse;
        await send("Input.dispatchMouseEvent",{type:"mousePressed",...mouse,buttons:{left:1,right:2,middle:4}[options.button]},0);
        if(args.action==='drag') {
          record.dragging=true;
          for(let step=1;step<=12;step++) {
            await this.guard(record);
            await send("Input.dispatchMouseEvent",{type:"mouseMoved",...mouse,x:x+(args.end.x-x)*step/12,y:y+(args.end.y-y)*step/12,buttons:1},0);
          }
        }
        await this.dwell(record,options.durationMs);
        await this.guard(record);
        await send("Input.dispatchMouseEvent",{type:"mouseReleased",...mouse,...(args.action==='drag'?args.end:{}),buttons:0},0);record.mouse=undefined;record.dragging=false;
      }
      while(record.keys.length) {
        await this.idle(record);
        await send("Input.dispatchKeyEvent",record.keys.at(-1),0);record.modifiers=record.keys.pop().modifiers;
      }
      if(record.emulated) {await send("Emulation.setFocusEmulationEnabled",{enabled:false},0);record.emulated=false;}
      await send("Page.getFrameTree",{},0);
      await this.idle(record);
    })();
    try {return await record.work;}
    finally {await this.finish(record);}
  }
  finish(record) {
    record.canceled=true;record.abort.abort();record.connection?.close();
    if(record.finishing) return record.finishing;
    record.finishing=(async()=>{
      await record.work?.catch(()=>{});
      const needsRelease=record.mouse || record.keys.length || record.emulated || record.draining;
      const target=needsRelease ? await this.target(record.endpoint,record.targetId) : undefined;
      if(target) {
        record.draining=true;
        let connection,dialogs=0,dialogError;
        connection=await this.open(target.webSocketDebuggerUrl,event=>{
          if(event.method!=="Page.javascriptDialogOpening") return;
          if(++dialogs>16) {dialogError=new Error("Release dialogs kept opening");connection.close();return;}
          connection.send("Page.handleJavaScriptDialog",{accept:false}).catch(error=>{if(!/No dialog is showing/i.test(error.message)){dialogError=error;connection.close();}});
        });
        try {
          const enabled=connection.send("Page.enable");enabled.catch(()=>{});
          await connection.send("Page.handleJavaScriptDialog",{accept:false}).catch(error=>{if(!/No dialog is showing/i.test(error.message))throw error;});
          await enabled;
          if(record.mouse) {
            // Release outside directly: moving first can start a native drag.
            await connection.send("Input.cancelDragging");
            await connection.send("Input.dispatchMouseEvent",{type:"mouseReleased",...record.mouse,x:-1,y:-1,buttons:0});record.mouse=undefined;
          }
          while(record.keys.length) {await connection.send("Input.dispatchKeyEvent",record.keys.at(-1));record.modifiers=record.keys.pop().modifiers;}
          if(record.emulated) {await connection.send("Emulation.setFocusEmulationEnabled",{enabled:false});record.emulated=false;}
          await connection.send("Page.getFrameTree");
          if(dialogError) throw dialogError;
          record.draining=false;
        } finally {connection.close();}
      }
      if(record.focus!==undefined) {await this.focus.release(record.owner,record.focus);record.focus=undefined;}
      if(active.get(record.endpoint)===record) active.delete(record.endpoint);
      this.leases.delete(record.endpoint);
    })().catch(error=>{record.finishing=undefined;error.browserCleanupFailed=true;throw error;});
    return record.finishing;
  }
  cancel(owner) {
    this.closedOwners.add(owner);
    for(const record of this.leases.values()) if(record.owner===owner) {record.canceled=true;record.abort.abort();record.connection?.close();}
  }
  async cleanup(owner) {
    this.cancel(owner);
    const results=await Promise.allSettled([...this.leases.values()].filter(record=>record.owner===owner).map(record=>this.finish(record)));
    const failed=results.find(result=>result.status==="rejected");if(failed) throw failed.reason;
  }
}
export function keyEvent(key) {
  if (typeof key !== "string" || !key) throw new Error("pressKey requires a key");
  const parts = key.split("+");
  const value = parts.pop();
  let modifiers = 0;
  for (const part of parts) {
    const mask = {alt:1,ctrl:2,control:2,meta:4,super:4,cmd:4,shift:8}[part.toLowerCase()];
    if (!mask) throw new Error(`Unsupported key modifier: ${part}`);
    modifiers |= mask;
  }
  const named = {Return:["Enter",13],Enter:["Enter",13],Tab:["Tab",9],Escape:["Escape",27],BackSpace:["Backspace",8],Delete:["Delete",46],Up:["ArrowUp",38],Down:["ArrowDown",40],Left:["ArrowLeft",37],Right:["ArrowRight",39],Home:["Home",36],End:["End",35],Page_Up:["PageUp",33],Page_Down:["PageDown",34],space:[" ",32]};
  const entry = named[value];
  if (!entry && [...value].length !== 1) throw new Error(`Unsupported key: ${value}`);
  const result = {key:entry?.[0] ?? value, windowsVirtualKeyCode:entry?.[1] ?? (/^[a-z0-9]$/iu.test(value) ? value.toUpperCase().charCodeAt(0) : 0), modifiers};
  if (!(modifiers & 7) && ([...value].length === 1 || value === "space")) result.text = modifiers & 8 ? result.key.toUpperCase() : result.key;
  if (/^[a-z]$/iu.test(value)) result.code = `Key${value.toUpperCase()}`;
  // macOS CDP requires explicit editor commands for these shortcuts.
  const command = {a:"selectAll",c:"copy",x:"cut",v:"paste"}[value.toLowerCase()];
  if (process.platform === "darwin" && modifiers === 4 && command) result.commands = [command];
  return result;
}
