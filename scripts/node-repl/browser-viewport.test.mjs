import assert from "node:assert/strict";
import test from "node:test";
import {BrowserViewport,validateViewport} from "./browser-viewport.mjs";

test("viewport dimensions reject invalid and unknown fields", () => {
  validateViewport({width:320,height:240});
  for (const options of [null,[],{}, {width:0,height:2},{width:1.5,height:2},{width:Infinity,height:2},{width:10001,height:2},{width:320,height:240,mobile:true}]) assert.throws(()=>validateViewport(options),/viewport|Viewport/);
});

test("viewport capability discovery requires sizing, capture and target discovery commands", async () => {
  const viewport = new BrowserViewport(()=>"http://127.0.0.1:9555/");
  const domains = [{domain:"Emulation",commands:[{name:"setDeviceMetricsOverride"},{name:"clearDeviceMetricsOverride"}]},{domain:"Target",commands:[{name:"setDiscoverTargets"}]}];
  viewport.json = async()=>({domains});
  assert.deepEqual(await viewport.request({},{action:"capabilities"}),[]);
  domains.push({domain:"Page",commands:[{name:"captureScreenshot"}]});
  assert.equal((await viewport.request({},{action:"capabilities"}))[0].id,"viewport");
});

test("viewport cancellation waits for in-flight sizing before clearing and closing observers", async () => {
  const endpoint = "http://127.0.0.1:9444/";
  let enter,release;
  const entered = new Promise(resolve=>{enter=resolve;});
  const gate = new Promise(resolve=>{release=resolve;});
  const events = [];
  const viewport = new BrowserViewport(()=>endpoint,async url=>({
    async send(method) {
      if (method === "Emulation.setDeviceMetricsOverride") {events.push("set");enter();await gate;events.push("sized");}
      if (method === "Emulation.clearDeviceMetricsOverride") events.push("clear");
      return {};
    },
    close(){events.push(`close:${url}`);},
  }));
  viewport.json = async (endpoint,route)=>route === "/json/version" ? {webSocketDebuggerUrl:"browser"} : [{id:"tab",type:"page",webSocketDebuggerUrl:"page"}];
  const owner = {};
  const setting = viewport.request(owner,{action:"set",options:{width:320,height:240}});
  await entered;
  let done = false;
  const cleanup = viewport.cleanup(owner).then(()=>{done=true;});
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(done,false);
  release();
  await Promise.all([setting,cleanup]);
  assert.deepEqual(events,["set","sized","clear","close:page","close:browser"]);
  assert.equal(viewport.leases.has(endpoint),false);
});
