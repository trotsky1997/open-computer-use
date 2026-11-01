import assert from "node:assert/strict";
import test from "node:test";
import { BrowserDialogs, BrowserConsoleLogs, openConnection, createBrowserApi, keyEvent, screenshotPoint, screenshotRegion, imageDimensions } from "./browser-cdp.mjs";
import { createCuaApi } from "./open-computer-use-repl.mjs";
const output = () => ({ write() {}, async emitImage() {} });

test("screenshot clips map CSS regions and reject malformed or oversized requests", () => {
  const geometry = {viewport:{pageX:100,pageY:200,clientWidth:800,clientHeight:600},contentSize:{x:0,y:0,width:1500,height:1800}};
  assert.deepEqual(screenshotRegion({clip:{x:20,y:30,width:200,height:100}},geometry),{x:120,y:230,width:200,height:100});
  assert.deepEqual(screenshotRegion({fullPage:true},geometry),geometry.contentSize);
  for (const options of [null,[],{unknown:true},{fullPage:1},{clip:{x:0,y:0,width:0,height:2}},{clip:{x:799,y:0,width:2,height:2}},{clip:{x:0,y:0,width:Infinity,height:1}}]) assert.throws(()=>screenshotRegion(options,geometry),/screenshot|Screenshot|capture/);
  assert.throws(()=>screenshotRegion({fullPage:true},{...geometry,contentSize:{width:1e6,height:1e6}}),/100 million/);
  const image = {width:400,height:200,viewport:geometry.viewport,region:{x:120,y:230,width:200,height:100}};
  assert.deepEqual(screenshotPoint([200,100],image),{x:120,y:80});
  assert.throws(()=>screenshotPoint([0,0],{...image,coordinateInput:false}),/Full-page/);
});

test("screenshot metadata rejects truncated PNG and JPEG headers", () => {
  for (const bytes of [Buffer.alloc(0),Buffer.from([0xff,0xd8,0xff,0xd9]),Buffer.from([0xff,0xd8,0xff,0xc0,0xff,0xff,0xff,0xd9])]) assert.throws(()=>imageDimensions(bytes,"jpeg"),/Invalid/);
  assert.throws(()=>imageDimensions(Buffer.alloc(24),"png"),/Invalid screenshot PNG/);
});

test("console log options reject malformed filters, levels, bounds and unknown fields", async () => {
  const logs = new BrowserConsoleLogs();
  for (const options of [null, [], {filter:42}, {levels:"warn"}, {levels:["fatal"]}, {limit:-1}, {limit:1.5}, {limit:Infinity}, {unknown:true}]) {
    await assert.rejects(logs.read({},"missing",options), /options object|filter|levels|limit|Unknown/);
  }
  await assert.rejects(logs.read({},"missing",{levels:["warning"],limit:0}), /capture unavailable/);
});

test("unconfigured browser inventory is empty and binding fails explicitly", async () => {
  const api = createBrowserApi(output, {});
  assert.deepEqual(await api.listBrowsers({emit:false}), []);
  assert.deepEqual(await api.listTabs({emit:false}), []);
  await assert.rejects(api.getBrowser(), /No CDP browser configured/);
  await assert.rejects(api.getTab("missing"), /No CDP browser configured/);
});

test("browser endpoint and selectors reject invalid inputs before network access", async () => {
  for (const value of ["file:///tmp/browser", "http://user:password@localhost:9222", "http://localhost:9222/path", "http://localhost:9222/?secret=x"]) {
    const api = createBrowserApi(output, {OPEN_COMPUTER_USE_CDP_URL:value});
    await assert.rejects(api.listBrowsers(), /debugging origin/);
  }
  const api = createBrowserApi(output, {});
  await assert.rejects(api.getTab({mention:"unknown"}), /requires a tab ID/);
  await assert.rejects(api.listTabs({browser:"missing"}), /Unknown browser/);
  await assert.rejects(api.createBrowserTab("cdp", "file:///tmp/test"), /Unsupported navigation/);
  await assert.rejects(api.createBrowserTab("cdp", "about:blank", {visible:"yes"}), /must be a boolean/);
});

test("inventory retains browser results when native inventory fails", async () => {
  const api = createCuaApi({async request() {throw new Error("native failed");}}, output);
  const state = await api.getState({emit:false});
  assert.deepEqual(state.apps, []);
  assert.equal(Array.isArray(state.browsers), true);
  assert.match(state.errors[0], /apps: native failed/);
});


test("keyboard events preserve modifiers, text, Unicode and reject unknown chords", () => {
  assert.equal(keyEvent("ctrl+a").modifiers, 2);
  assert.equal(keyEvent("ctrl+a").text, undefined);
  assert.equal(keyEvent("a").text, "a");
  assert.equal(keyEvent("shift+a").text, "A");
  assert.equal(keyEvent("🙂").windowsVirtualKeyCode, 0);
  assert.equal(keyEvent("Return").key, "Enter");
  assert.throws(() => keyEvent("hyper+a"), /Unsupported key modifier/);
  assert.throws(() => keyEvent("Unknown"), /Unsupported key/);
  if (process.platform === "darwin") assert.deepEqual(keyEvent("meta+a").commands, ["selectAll"]);
});


test("screenshot coordinates scale from device pixels and reject invalid targets", () => {
  const image = {width:1600,height:1200,viewport:{clientWidth:800,clientHeight:600}};
  assert.deepEqual(screenshotPoint([800,600], image), {x:400,y:300});
  assert.throws(() => screenshotPoint([0,0]), /fresh screenshot/);
  for (const point of [[-1,0],[1600,0],[0,1200],[NaN,1],[1],[1,2,3],"1,2"]) {
    assert.throws(() => screenshotPoint(point,image), /Coordinates/);
  }
});


test("host focus cleanup waits for an in-flight acquire before disabling", async () => {
  const {BrowserFocusLeases} = await import("./browser-playwright.mjs");
  let enabled;
  const calls = [];
  let finish;
  const ready = new Promise(resolve => {finish=resolve;});
  const leases = new BrowserFocusLeases(async (target,value) => {calls.push(value); if(value) await ready; enabled=value;});
  const owner = {};
  const acquire = leases.acquire(owner,"target");
  const cleanup = leases.cleanup(owner);
  await assert.rejects(leases.acquire({},"target"), /active input lease/);
  finish();
  await acquire;
  await cleanup;
  assert.deepEqual(calls,[true,false]);
  assert.equal(enabled,false);
  assert.equal(leases.entries.size,0);
});

test("failed host cleanup retains ownership for a later retry", async () => {
  const {BrowserFocusLeases} = await import("./browser-playwright.mjs");
  let fail = true;
  const leases = new BrowserFocusLeases(async (target,enabled) => {if(!enabled && fail) throw new Error("offline");});
  const owner = {}, other = {};
  const lease = await leases.acquire(owner,"target");
  await assert.rejects(leases.release(other,lease), /Unknown/);
  await assert.rejects(leases.cleanup(owner), /offline/);
  assert.equal(leases.entries.size,1);
  fail=false;
  await leases.cleanup(owner);
  assert.equal(leases.entries.size,0);
});


test("closed CDP connections reject new requests immediately, including no-deadline calls",{timeout:1000},async()=>{
 const Original=globalThis.WebSocket;let sent=0;
 class Socket extends EventTarget {
  static OPEN=1;
  constructor(){super();this.readyState=Socket.OPEN;queueMicrotask(()=>this.dispatchEvent(new Event('open')));}
  send(){sent++;}
  close(){this.readyState=3;queueMicrotask(()=>this.dispatchEvent(new Event('close')));}
 }
 globalThis.WebSocket=Socket;
 try {
  const connection=await openConnection('ws://owned.invalid');connection.close();
  await assert.rejects(connection.send('Runtime.evaluate',{},0),/connection closed/);
  await assert.rejects(connection.send('Page.enable'),/connection closed/);assert.equal(sent,0);
 }finally{globalThis.WebSocket=Original;}
});

test('focus leases dispose captured connections on acknowledged release and confirmed exit, including lost acquisition replies',async()=>{
 const {BrowserFocusLeases}=await import('./browser-playwright.mjs');
 for(const mode of ['normal','exit','lost-acquire']){
  let gone=false,disposed=0,releases=0;
  const leases=new BrowserFocusLeases(async(_target,enabled,register)=>{
   if(enabled){register(()=>{disposed++;});if(mode==='lost-acquire'){gone=true;throw Error('Acquire reply lost');}}
   else releases++;
  });
  const owner={},proof={browserGone:()=>gone};
  if(mode==='lost-acquire')await assert.rejects(leases.acquire(owner,'target',proof),/reply lost/);
  else{const id=await leases.acquire(owner,'target',proof);gone=mode==='exit';await leases.release(owner,id);}
  assert.equal(disposed,1);assert.equal(releases,mode==='normal'?1:0);assert.equal(leases.entries.size,0);
 }
});

test('dialog observer cleanup skips native detachment only for a confirmed dead browser',async()=>{
 const {BrowserDialogs}=await import('./browser-cdp.mjs');
 for(const dead of [false,true]){
  const owner={},endpoint='http://dialog-exit/',dialogs=new BrowserDialogs(()=>endpoint);let commands=0,closed=0;
  dialogs.browsers.set(endpoint,{owners:new Set([owner]),pending:new Set(),ready:Promise.resolve(),exitProof:{browserGone:()=>dead},connection:{async send(){commands++;throw Error('Detach reply lost');},close(){closed++;}}});
  if(dead){const entry={key:endpoint+'|owned',endpoint,targetId:'owned',owners:new Set([owner]),watches:new Set(),ready:Promise.resolve(),dialog:{id:1,owner,type:'alert'},connection:{async send(){commands++;throw Error('Must not contact a replacement browser');},close(){}}};dialogs.targets.set(entry.key,entry);dialogs.owners.set(owner,new Set([entry]));}
  if(dead)await dialogs.cleanup(owner);else await assert.rejects(dialogs.cleanup(owner),/reply lost/);
  assert.equal(commands,dead?0:1);assert.equal(closed,1);assert.equal(dialogs.browsers.size,0);
 }
});


test('passive dialog observation can close while Page.enable is blocked',async()=>{
 const owner={},dialogs=new BrowserDialogs(()=>"http://owned-observation/"),commands=[];let closed=0;
 const starting=dialogs.start(owner,'blocked',true,undefined,{sessionId:'owned',send(method){commands.push(method);return new Promise(()=>{});},close(){closed++;}});starting.catch(()=>{});
 const entry=[...dialogs.targets.values()][0];assert.equal(entry.initialized,undefined);
 await dialogs.stop(owner,'blocked');await assert.rejects(starting,/observation ended/);
 assert.ok(closed>0);assert.equal(dialogs.targets.size,0);assert.deepEqual(commands,['Page.enable']);
});


test('Playwright readiness checks only block live pending dialog observers',async()=>{
 const {createServer}=await import('node:http');let targets=[{type:'page',id:'blocked'}],readyDuringFetch;
 const server=createServer((_request,response)=>{readyDuringFetch?.();response.setHeader('Content-Type','application/json');response.end(JSON.stringify(targets));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const endpoint=`http://127.0.0.1:${server.address().port}`,owner={},dialogs=new BrowserDialogs(()=>endpoint);
 dialogs.targets.set(`${endpoint}|own`,{endpoint,targetId:'own',owners:new Set([owner]),initialized:true});
 dialogs.targets.set('blocked',{endpoint,targetId:'blocked'});
 try{
  await assert.rejects(dialogs.request(owner,{action:'checkPlaywright',targetId:'own'}),/observation.*not ready/);
  readyDuringFetch=()=>{dialogs.targets.get('blocked').initialized=true;};await dialogs.request(owner,{action:'checkPlaywright',targetId:'own'});readyDuringFetch=undefined;dialogs.targets.get('blocked').initialized=false;
  targets=[];await dialogs.request(owner,{action:'checkPlaywright',targetId:'own'});
  targets={};await assert.rejects(dialogs.request(owner,{action:'checkPlaywright',targetId:'own'}),/Invalid browser target list/);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('CDP abort owns handshake and lifetime while a canceled command leaves the capture usable',async()=>{
 const {createServer}=await import('node:http'),{once}=await import('node:events'),{wsServer}=await import('playwright-core/lib/utilsBundle');
 const server=createServer(),websockets=new wsServer({noServer:true}),sockets=new Set();let blocked,peer;
 server.on('upgrade',(request,socket,head)=>{socket.on('error',()=>{});sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('end',()=>socket.end());socket.resume();if(request.url==='/blocked'){blocked=socket;return;}websockets.handleUpgrade(request,socket,head,client=>peer=client);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`ws://127.0.0.1:${server.address().port}`;
 try{
  const before=new AbortController();before.abort(Error('pre-aborted'));await assert.rejects(openConnection(url,undefined,undefined,before.signal),/pre-aborted/);assert.equal(sockets.size,0);
  const opening=new AbortController(),pending=openConnection(url+'/blocked',undefined,undefined,opening.signal),failed=assert.rejects(pending,/opening canceled/);
  const deadline=Date.now()+2000;while(!blocked){assert.ok(Date.now()<deadline,'Handshake not observed');await new Promise(resolve=>setTimeout(resolve,5));}
  const disconnected=once(blocked,'close',{signal:AbortSignal.timeout(2000)});opening.abort(Error('opening canceled'));await failed;await disconnected;assert.equal(blocked.destroyed,true);
  const owner=new AbortController(),connection=await openConnection(url,undefined,undefined,owner.signal),command=new AbortController();
  let received=once(peer,'message');const canceled=connection.send('Runtime.evaluate',{},0,undefined,command.signal);let [payload]=await received;const first=JSON.parse(payload);command.abort(Error('command canceled'));await assert.rejects(canceled,/command canceled/);
  peer.send(JSON.stringify({id:first.id,result:{late:true}}));assert.equal(peer.readyState,1);
  received=once(peer,'message');const next=connection.send('Runtime.evaluate',{},0);[payload]=await received;peer.send(JSON.stringify({id:JSON.parse(payload).id,result:{value:7}}));assert.deepEqual(await next,{value:7});
  received=once(peer,'message');const held=connection.send('Runtime.evaluate',{},0);await received;const closed=once(peer,'close',{signal:AbortSignal.timeout(2000)});owner.abort(Error('owner canceled'));await assert.rejects(held,/owner canceled/);await closed;
  await assert.rejects(connection.send('Page.enable'),/closed/);
 }finally{for(const socket of sockets)socket.destroy();websockets.close();await new Promise(resolve=>server.close(resolve));}
});
