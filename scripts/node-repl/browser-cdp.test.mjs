import assert from "node:assert/strict";
import test from "node:test";
import { BrowserConsoleLogs, openConnection, createBrowserApi, keyEvent, screenshotPoint, screenshotRegion, imageDimensions } from "./browser-cdp.mjs";
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
