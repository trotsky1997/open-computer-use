import assert from "node:assert/strict";
import test from "node:test";
import { createBrowserApi, keyEvent, screenshotPoint } from "./browser-cdp.mjs";
import { createCuaApi } from "./open-computer-use-repl.mjs";
const output = () => ({ write() {}, async emitImage() {} });

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
