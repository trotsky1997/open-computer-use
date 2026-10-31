import assert from "node:assert/strict";
import {createServer} from "node:http";
import {existsSync} from "node:fs";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import path from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {main,inspectCapabilities} from "./node-repl/open-computer-use-cli.mjs";
import {JsonLinePeer} from "./node-repl/open-computer-use-repl.mjs";
if(!process.env.OPEN_COMPUTER_USE_CDP_URL) throw new Error("Set OPEN_COMPUTER_USE_CDP_URL to a disposable browser");
const artifact=process.argv[2]?path.resolve(process.argv[2]):null;
const root=artifact??fileURLToPath(new URL("../",import.meta.url));
const server=createServer((request,response)=>{response.setHeader("Content-Type","text/html");response.end('<html><body><label>Name<input></label></body></html>');});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const url=`http://127.0.0.1:${server.address().port}/`;
const source=`var inventory=await cua.getState({emit:false}); if(!inventory.errors?.some(error=>error.startsWith("apps:"))) throw new Error("Missing native error was not reported"); if(inventory.browsers.length!==1) throw new Error("Browser inventory unavailable"); var tab=await cua.createBrowserTab("cdp",${JSON.stringify(url)},{visible:false}); try {await tab.playwright.getByLabel("Name").fill("Browser only verified"); if(await tab.playwright.getByLabel("Name").evaluate(node=>node.value)!=="Browser only verified") throw new Error("Read-only evaluation failed"); nodeRepl.write(await tab.playwright.getByLabel("Name").inputValue());} finally {await tab.close();}`;
try {
  const report=inspectCapabilities({packageRoot:root,platformPackages:{}});
  assert.equal(report.capabilities.nativeMcp.available,false);
  assert.equal(report.capabilities.js.available,true);
  let result;
  if(artifact){
    const {stdout,stderr}=await promisify(execFile)(process.execPath,[path.join(root,"bin/open-computer-use"),"js","--json",source],{env:process.env,maxBuffer:8*1024*1024,timeout:60000});
    assert.equal(stderr,"");result=JSON.parse(stdout);
  }else{
    const output=[],errors=[];
    const exit=await main({packageRoot:root,platformPackages:{},argv:["js","--json",source],output:{write:value=>output.push(value)},errorOutput:{write:value=>errors.push(value)}});
    assert.equal(exit,0,errors.join(""));assert.equal(errors.join(""),"");result=JSON.parse(output.join(""));
  }
  assert.equal(result.isError,false);
  assert.ok(result.content.some(item=>item.text==="Browser only verified"));
  if(artifact){
    const runtime=await import(pathToFileURL(path.join(root,"scripts/node-repl/open-computer-use-repl.mjs")).href);
    for(const Session of [runtime.PersistentJavaScriptSession,runtime.WorkerJavaScriptSession]){
      const native=new runtime.LazyNativePeer({}),session=new Session({native});
      try{const result=await session.run(source,30000);assert.equal(result.isError,false,JSON.stringify(result.content));assert.ok(result.content.some(item=>item.text==="Browser only verified"));console.log(`${Session.name} PASS installed package real browser input/evaluation`);}finally{await session.close();await native.close();}
    }
  }
  const missing=path.join(root,"work-browser-only-no-native-executable");
  assert.equal(existsSync(missing),false,"native-free fixture executable unexpectedly exists");
  const peer=new JsonLinePeer({command:process.execPath,args:artifact?[path.join(root,"bin/open-computer-use"),"mcp"]:[path.join(root,"scripts/node-repl/open-computer-use-repl.mjs"),"--",missing,"mcp"]});
  try {
    await peer.initialize();
    const result=await peer.request("tools/call",{name:"js",arguments:{code:source}});
    assert.equal(result.isError,false,JSON.stringify(result.content));
    assert.ok(result.content.some(item=>item.text==="Browser only verified"));
  } finally {await peer.close();}
  console.log("PASS native-free CLI and MCP browser discovery, inventory error isolation and real field input/read-only evaluation");
} finally {
  server.closeAllConnections();
  await new Promise(resolve=>server.close(resolve));
}
