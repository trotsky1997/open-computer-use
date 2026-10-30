import assert from "node:assert/strict";
import {spawn,spawnSync} from "node:child_process";
import {mkdtempSync,readFileSync,existsSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {JsonLinePeer,WorkerJavaScriptSession} from "../node-repl/open-computer-use-repl.mjs";

assert.equal(process.platform,"darwin");
assert.ok(process.argv[2],"Pass the built native OpenComputerUse executable");
const directory=mkdtempSync(path.join(tmpdir(),"ocu-held-click-"));
const appName="OCUHeldClickFixture"+path.basename(directory).replace(/[^a-z0-9]/gi,"");
const fixturePath=path.join(directory,appName),stateFile=path.join(directory,"events.json");
const native=new JsonLinePeer({command:path.resolve(process.argv[2]),args:["mcp"],env:{...process.env,OPEN_COMPUTER_USE_DISABLE_APP_AGENT_PROXY:"1",OPEN_COMPUTER_USE_VISUAL_CURSOR:"0",OPEN_COMPUTER_USE_ACTION_READ_BACK:"0"}});
const session=new WorkerJavaScriptSession({native});
const events=()=>existsSync(stateFile)?JSON.parse(readFileSync(stateFile,"utf8")):[];
async function waitFor(test){const deadline=Date.now()+5000;while(!test()){assert.ok(Date.now()<deadline,"Fixture timeout");await new Promise(resolve=>setTimeout(resolve,20));}}
async function run(source){const result=await session.run(source);assert.equal(result.isError,false,JSON.stringify(result.content));return result;}
let fixture;
try {
 await native.initialize();
 const probe=await native.request("tools/call",{name:"get_app_state",arguments:{app:appName,include_screenshot:false}});
 if(probe.isError && probe.content.some(item=>/Mac is locked|No completed GUI session/.test(item.text??""))) throw Error("Native live check requires the Mac to be unlocked normally; no input was emitted");
 const source=fileURLToPath(new URL("./fixtures/MacOSHeldClickFixture.swift",import.meta.url));
 const build=spawnSync("swiftc",[source,"-o",fixturePath],{encoding:"utf8"});assert.equal(build.status,0,build.stderr);
 fixture=spawn(fixturePath,[stateFile],{stdio:"ignore"});
 await waitFor(()=>existsSync(stateFile));
 await run(`var app=await cua.getApp(${JSON.stringify(appName)},{initialState:false});var state=await app.getAXState({includeScreenshot:false,emit:false});var index=state.match(/^\\s*(\\d+)\\s+[^\\n]*Held click target/m)[1];await app.click(Number(index),{key:'shift',clickCount:2,durationMs:80});`);
 await waitFor(()=>events().filter(event=>event.kind==='up').length===2);
 const mouse=events().filter(event=>['down','up'].includes(event.kind));
 assert.equal(mouse.length,4);assert.ok(mouse.every(event=>(event.flags & (1<<17))!==0));
 assert.ok(mouse[1].time-mouse[0].time>=0.07);assert.ok(mouse[3].time-mouse[2].time>=0.07);
 const running=session.run(`var state=await app.getAXState({includeScreenshot:false,emit:false});var index=state.match(/^\\s*(\\d+)\\s+[^\\n]*Held click target/m)[1];await app.click(Number(index),{key:'shift',durationMs:5000});`);
 await waitFor(()=>events().filter(event=>event.kind==='down').length===3);
 await session.reset();assert.equal((await running).isError,true);
 await waitFor(()=>events().filter(event=>event.kind==='up').length===3 && events().filter(event=>event.kind==='flags').at(-1)?.flags !== undefined && (events().filter(event=>event.kind==='flags').at(-1).flags & (1<<17))===0);
 console.log("PASS real native held-click flags, per-press duration, double click and reset release");
} finally {
 await session.close();await native.close();
 if(fixture && fixture.exitCode===null){fixture.kill('SIGTERM');await new Promise(resolve=>fixture.once('exit',resolve));}
 rmSync(directory,{recursive:true,force:true});
}
