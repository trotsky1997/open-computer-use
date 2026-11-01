const domains=new Set(['Accessibility','CSS','DOM','DOMDebugger','DOMSnapshot','Debugger','Emulation','Fetch','Log','Network','Overlay','Page','Performance','Profiler','Runtime','Security','WebAudio']);
const blocked=new Set(['Network.getAllCookies','Network.clearBrowserCookies','Network.clearBrowserCache','Network.loadNetworkResource','Network.setCookie','Network.setCookies','Network.deleteCookies','Network.deleteDeviceBoundSession','Network.enableDeviceBoundSessions','Network.getResponseBodyForInterception','Network.setCookieControls','Network.setExtraHTTPHeaders','Network.setRequestInterception','Network.takeResponseBodyForInterceptionAsStream']);
const methodName=value=>typeof value==='string' && /^[A-Za-z][A-Za-z0-9]*\.[A-Za-z][A-Za-z0-9]*$/u.test(value);
const object=value=>value!==null && typeof value==='object' && !Array.isArray(value);
function target(value) {
 if(value===undefined)return undefined;
 const keys=object(value)?Object.keys(value):[];
 if(keys.length!==1 || !['sessionId','targetId'].includes(keys[0]) || typeof value[keys[0]]!=='string' || !value[keys[0]].trim()) throw Error('CDP target requires exactly one sessionId or targetId');
 return value;
}
function timeout(value,fallback) {
 if(value===undefined)return fallback;
 if(!Number.isInteger(value)||value<0||value>2147483647)throw Error('Invalid CDP timeoutMs');
 return value;
}
export function cdpOptions(options={},events=false) {
 if(!object(options)||Object.keys(options).some(key=>!(events?['afterSequence','limit','methods','target','timeoutMs']:['target','timeoutMs']).includes(key)))throw Error('Invalid CDP options');
 target(options.target);timeout(options.timeoutMs,0);
 if(events) {
  if(options.afterSequence!==undefined && (!Number.isSafeInteger(options.afterSequence)||options.afterSequence<0))throw Error('Invalid CDP event cursor');
  if(options.limit!==undefined && (!Number.isInteger(options.limit)||options.limit<1||options.limit>1000))throw Error('CDP event limit must be 1...1000');
  if(options.methods!==undefined && (!Array.isArray(options.methods)||!options.methods.length||![...options.methods].every(methodName)))throw Error('CDP methods must be a non-empty array of event names');
 }
 return options;
}
export function cdpCommand(method,params={},options={}) {
 if(!methodName(method)||!domains.has(method.split('.')[0])||blocked.has(method)||(method.startsWith('Security.') && !['Security.enable','Security.disable'].includes(method)))throw Error('This method is not supported through raw CDP');
 if(!object(params))throw Error('CDP command params must be an object');
 // Durable payloads survive origin changes.
 if((method==='Network.enable'&&params.enableDurableMessages===true)||(method==='Network.configureDurableMessages'&&params.maxTotalBufferSize!=null))throw Error('Durable network payloads are not supported through raw CDP');
 if((['Fetch.continueResponse','Fetch.fulfillRequest'].includes(method)&&params.binaryResponseHeaders!=null)||(method==='Page.reload'&&params.scriptToEvaluateOnLoad!=null)||(method==='Page.createIsolatedWorld'&&params.grantUniveralAccess===true))throw Error('These parameters are not supported through raw CDP');
 JSON.stringify(params);cdpOptions(options);
 if(method.startsWith('Network.') && /Cookies?$/u.test(method) && Object.keys(params).some(key=>['url','urls','domain'].includes(key)))throw Error('Use the page-origin cookie command without URL/domain overrides');
 if(method==='Page.navigate' && !/^https?:$/u.test(new URL(params.url).protocol))throw Error('Raw CDP navigation requires HTTP(S)');
}
export const CDP_DOCUMENTATION=`Tab capability cdp exposes send(method,params?,{target?,timeoutMs?}) and readEvents({afterSequence?,limit?,methods?,target?,timeoutMs?}). Navigate to HTTP(S) first. target selects an attached child by {sessionId} or {targetId}; omit it for the tab. Read without a cursor to capture the current position, perform an action, then read afterSequence. Continue with each returned cursor while hasMore; truncated reports eviction or a changed page origin. limits are 1...1000. Events carry method, params, sequence and source. Child selectors come from Target.attachedToTarget events, including cross-origin descendants. Buffering is bounded and private to this session/turn. Reset/turn-end/close closes debugger connections and pending reads. A retained facade opens a fresh capture in a later turn. send invalidates higher-level AX/pixel captures; observe again before normal input. Ordinary Network buffering and enableDurableMessages:false are supported. Durable payload retention is unavailable because its data can outlive origin changes; Network.configureDurableMessages accepts only the disable form without maxTotalBufferSize; read response bodies before navigation.
Command deadlines default to 10s of time outside JavaScript dialogs reported by active Page streams in this capture. Zero leaves only the surrounding execution budget. Store a background send Promise before handling a dialog with tab.getJsDialog(), then await that Promise to obtain its protocol result. Page.disable and child detachment retire that source's paused state; Page.enable restores future observation. Capture bootstrap, event-read waits and dialogs predating observation are outside this command clock. Reset/turn end abort connection setup and pending response waits; timed-out late responses are ignored while the capture remains usable.
Permitted domains: ${[...domains].join(', ')}. Browser/Target/Input and global cookie/cache commands are unavailable. Target attachment is host-owned. Security only exposes enable/disable. Network cookie writes, cookie controls, device-bound session controls, extra HTTP headers, legacy request interception/body streams, cookie URL/domain overrides and non-HTTP navigation are unavailable. Fetch response commands require structured responseHeaders; binaryResponseHeaders is unavailable. Page.reload cannot inject scriptToEvaluateOnLoad, and Page.createIsolatedWorld cannot grantUniveralAccess:true (the protocol spells it this way). Ordinary reload and isolated worlds remain available. Other CDP methods return browser protocol errors normally. Raw commands may mutate content, pause execution, intercept requests or change browser state; debugger disconnection does not roll back arbitrary script effects, timers, promises or persistent state. Use higher-level APIs for ordinary interaction. Broader command-policy parity and renderer/crash recovery remain open.`;

export class BrowserDebugger {
 constructor(endpoint,open) {this.endpoint=endpoint;this.open=open;this.owners=new Map();this.closedOwners=new WeakSet();this.sequence=0;}
 dialog(entry,sessionId,opened){
  const source=sessionId??'';
  if(opened&&!entry.disabledPages.has(source))entry.dialogs.add(source);else if(!opened)entry.dialogs.delete(source);
  for(const command of entry.commands)command.update();
 }
 epoch(entry,url) {
  let origin;try {const parsed=new URL(url);if(['http:','https:'].includes(parsed.protocol))origin=parsed.origin;}catch {}
  if(entry.origin!==origin) {entry.dialogs.clear();for(const source of entry.disabledPages)if(source)entry.disabledPages.delete(source);for(const command of entry.commands)command.update();entry.epoch=(entry.epoch ?? 0)+1;
   for(const [sessionId,child] of entry.children) if(child.attached) {
    child.attached=false;
    void entry.connection?.send('Target.detachFromTarget',{sessionId}).catch(error=>{if(!entry.closed && !error.cdpError)entry.error=error;});
   }
   entry.origin=origin;entry.events=[];entry.bytes=0;entry.floor=++this.sequence;entry.cursor=entry.floor;}
 }
 append(entry,event) {
  if(entry.closed)return;
  const params=event.params ?? {};
  if(event.method==='Target.attachedToTarget') {
   const parent=event.sessionId;
   if(parent && (!entry.children.get(parent)?.attached || entry.children.get(parent)?.epoch!==entry.epoch))return;
   entry.children.set(params.sessionId,{targetId:params.targetInfo.targetId,attached:true,parent,epoch:entry.epoch});
   void entry.connection.send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:false,flatten:true},10000,params.sessionId).catch(error=>{if(!entry.closed && entry.children.get(params.sessionId)?.attached)entry.error=error;});
  } else if(event.method==='Target.detachedFromTarget') {
   const child=entry.children.get(params.sessionId);if(child)child.attached=false;entry.disabledPages.delete(params.sessionId);this.dialog(entry,params.sessionId,false);
  } else if(event.method==='Page.frameNavigated' && !event.sessionId && !params.frame?.parentId) this.epoch(entry,params.frame?.url);
  if(!entry.origin)return;
  const child=event.sessionId && entry.children.get(event.sessionId);
  if(event.sessionId && (!child || child.epoch!==entry.epoch))return;
  if(['Page.javascriptDialogOpening','Page.javascriptDialogClosed'].includes(event.method)&&(!event.sessionId||child.attached))this.dialog(entry,event.sessionId,event.method==='Page.javascriptDialogOpening');
  const item={method:event.method,...(event.params?{params:event.params}:{}),sequence:++this.sequence,source:{targetId:child?.targetId ?? entry.targetId,...(event.sessionId?{sessionId:event.sessionId}:{})}};
  const size=Buffer.byteLength(JSON.stringify(item));entry.cursor=item.sequence;
  if(size>8*1024*1024) {entry.events=[];entry.bytes=0;entry.floor=item.sequence;}
  else {
   entry.events.push({item,size});entry.bytes+=size;
   while(entry.events.length>2048 || entry.bytes>8*1024*1024) {const removed=entry.events.shift();entry.bytes-=removed.size;entry.floor=removed.item.sequence;}
  }
  for(const notify of entry.waiters)notify();
 }
 async current(endpoint,targetId,signal) {
  const response=await fetch(new URL('/json/list',endpoint),{signal:signal ? AbortSignal.any([signal,AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000),redirect:'error'});
  if(!response.ok)throw Error(`CDP discovery failed: HTTP ${response.status}`);
  const page=(await response.json()).find(page=>page.type==='page' && page.id===targetId);
  if(!page)throw Error('Tab closed or no longer available');
  let protocol;try{protocol=new URL(page.url).protocol;}catch {}
  if(!/^https?:$/u.test(protocol))throw Error('Raw CDP requires a current HTTP(S) page');
  return page;
 }
 async entry(owner,targetId) {
  if(this.closedOwners.has(owner))throw Error('CDP session closed');
  const endpoint=this.endpoint();if(!endpoint)throw Error('No CDP browser configured');
  if(typeof targetId!=='string'||!targetId)throw Error('Invalid CDP tab identity');
  let entries=this.owners.get(owner);if(!entries){entries=new Map();this.owners.set(owner,entries);}
  const key=`${endpoint}|${targetId}`;let entry=entries.get(key);
  if(!entry) {
   entry={endpoint,targetId,events:[],bytes:0,floor:this.sequence,cursor:this.sequence,children:new Map(),waiters:new Set(),commands:new Set(),dialogs:new Set(),disabledPages:new Set(),abort:new AbortController()};entries.set(key,entry);
   entry.ready=(async()=>{
    const page=await this.current(endpoint,targetId,entry.abort.signal);if(entry.closed)throw Error('CDP session closed');
    this.epoch(entry,page.url);
    entry.connection=await this.open(page.webSocketDebuggerUrl,event=>this.append(entry,event),()=>{if(!entry.closed){entry.error=Error('Debugger connection closed; reset the session to reconnect');for(const notify of entry.waiters)notify();}},entry.abort.signal);
    if(entry.closed){entry.connection.close();throw Error('CDP session closed');}
    await entry.connection.send('Page.enable');
    await entry.connection.send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:false,flatten:true});
   })().catch(error=>{entry.error=error;entry.connection?.close();if(!entry.connection && entries.get(key)===entry)entries.delete(key);throw error;});entry.ready.catch(()=>{});
  }
  await entry.ready;
  if(entry.closed)throw Error('CDP session closed');if(entry.error)throw entry.error;
  const page=await this.current(endpoint,targetId,entry.abort.signal);
  if(entry.closed || this.closedOwners.has(owner))throw Error('CDP session closed');if(entry.error)throw entry.error;
  this.epoch(entry,page.url);
  return entry;
 }
 session(entry,selector) {
  if(!selector)return undefined;
  const match=[...entry.children].find(([sessionId,child])=>child.attached && child.epoch===entry.epoch && (selector.sessionId===sessionId || selector.targetId===child.targetId));
  if(!match)throw Error('Unknown or detached CDP child target');
  return match[0];
 }
 async command(entry,args){
  const limit=timeout(args.options?.timeoutMs,10000),control=new AbortController(),signal=AbortSignal.any([control.signal,entry.abort.signal]);
  let remaining=limit,started,timer;
  const command={update:()=>{
   clearTimeout(timer);if(started!==undefined)remaining-=performance.now()-started;started=undefined;
   if(limit&&!entry.dialogs.size&&!signal.aborted){started=performance.now();timer=setTimeout(()=>control.abort(Error(`CDP ${args.method} timed out`)),Math.max(0,remaining));}
  }};
  entry.commands.add(command);command.update();
  try{
   const sessionId=this.session(entry,args.options?.target),result=await entry.connection.send(args.method,args.params??{},0,sessionId,signal);
   if(args.method==='Page.disable'){entry.disabledPages.add(sessionId??'');this.dialog(entry,sessionId,false);}
   if(args.method==='Page.enable')entry.disabledPages.delete(sessionId??'');
   return result;
  }
  finally{clearTimeout(timer);entry.commands.delete(command);}
 }
 async request(owner,args) {
  if(args?.action==='send')cdpCommand(args.method,args.params,args.options);
  else if(args?.action==='events')cdpOptions(args.options,true);
  else throw Error('Unknown CDP capability action');
  const entry=await this.entry(owner,args.targetId);
  if(args.action==='send')return this.command(entry,args);
  const options=args.options ?? {},after=options.afterSequence ?? entry.cursor,limit=options.limit ?? 1000,deadline=Date.now()+timeout(options.timeoutMs,0);
  const read=()=>{
   if(entry.closed)throw Error('CDP session closed');if(entry.error)throw entry.error;
   const matches=entry.events.map(event=>event.item).filter(event=>event.sequence>after && (!options.methods||options.methods.includes(event.method)) && (!options.target||(options.target.sessionId?event.source.sessionId===options.target.sessionId:event.source.targetId===options.target.targetId)));
   const events=matches.slice(0,limit),hasMore=matches.length>limit;
   return {cursor:hasMore?events.at(-1).sequence:entry.cursor,events,hasMore,truncated:after<entry.floor};
  };
  for(;;) {
   const result=read();if(result.events.length || Date.now()>=deadline)return result;
   await new Promise(resolve=>{let timer;const notify=()=>{clearTimeout(timer);entry.waiters.delete(notify);resolve();};entry.waiters.add(notify);timer=setTimeout(notify,Math.max(0,deadline-Date.now()));});
  }
 }
 cancel(owner) {
  this.closedOwners.add(owner);
  for(const entry of this.owners.get(owner)?.values() ?? []) {entry.closed=true;entry.abort.abort();entry.connection?.close();for(const notify of entry.waiters)notify();}
 }
 async cleanup(owner) {
  this.cancel(owner);
  await Promise.allSettled([...(this.owners.get(owner)?.values() ?? [])].map(entry=>entry.ready));
  this.owners.delete(owner);
 }
}
