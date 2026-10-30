import assert from "node:assert/strict";
import test from "node:test";
import {BrowserClipboard,validateClipboardWrite} from "./browser-clipboard.mjs";

test("clipboard writes validate payloads before dispatch", () => {
  const entry = {mimeType:"text/plain",text:"valid"};
  validateClipboardWrite("write",[{entries:[entry,{mimeType:"image/png",base64:"AA=="}]}]);
  for (const value of [null,{},[{entries:[]}],[{entries:[{...entry,base64:"AA=="}]}],[{entries:[{mimeType:"text/plain",text:42}]}],[{entries:[{mimeType:"image/png",base64:"invalid!"}]}],[{entries:[entry,entry]}],[{entries:[{...entry,mimeType:"bad"}]}],[{entries:[entry],presentationStyle:"bad"}]]) {
    assert.throws(()=>validateClipboardWrite("write",value),/Clipboard|clipboard|Invalid/);
  }
  assert.throws(()=>validateClipboardWrite("writeText",42),/string/);
  assert.throws(()=>validateClipboardWrite("writeText","x".repeat(16*1024*1024+1)),/16 MiB/);
});

test("unverified browser clipboards fail before control tabs or permissions are created", async () => {
  for (const commandLine of [null,{arguments:["--enable-automation"]}]) {
    const methods = [];
    const clipboard = new BrowserClipboard(()=>"http://127.0.0.1:9222/",async (url,operation)=>operation(async method=>{
      methods.push(method);
      if (!commandLine) throw new Error("Command line is unavailable");
      return commandLine;
    }));
    clipboard.json = async()=>({webSocketDebuggerUrl:"ws://127.0.0.1/browser"});
    const owner = {};
    await assert.rejects(clipboard.request(owner,{method:"writeText",targetId:"tab",value:"private"}),/requires.*headless/);
    assert.deepEqual(methods,["Browser.getBrowserCommandLine"]);
    assert.equal(clipboard.server,undefined);
    await clipboard.cleanup(owner);
  }
});

test("canceling a queued clipboard call does not wait for another session's operation", async () => {
  const endpoint = "http://127.0.0.1:9333/";
  const clipboard = new BrowserClipboard(()=>endpoint,()=>{throw new Error("Canceled call reached the browser");});
  let release;
  const gate = new Promise(resolve=>{release=resolve;});
  const blocking = clipboard.enqueue(endpoint,()=>gate);
  const owner = {};
  const pending = clipboard.request(owner,{method:"writeText",value:"canceled",targetId:"tab"});
  clipboard.cancel(owner);
  await assert.rejects(pending,/session closed/);
  await clipboard.cleanup(owner);
  assert.equal(clipboard.owners.has(owner),false);
  release();
  await blocking;
});
