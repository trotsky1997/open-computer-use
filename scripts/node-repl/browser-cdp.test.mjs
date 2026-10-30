import assert from "node:assert/strict";
import test from "node:test";
import { createBrowserApi } from "./browser-cdp.mjs";
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
