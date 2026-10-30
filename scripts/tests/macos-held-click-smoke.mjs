import assert from "node:assert/strict";
import {spawn,spawnSync} from "node:child_process";
import {mkdtempSync,readFileSync,existsSync,rmSync,mkdirSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {JsonLinePeer,WorkerJavaScriptSession} from "../node-repl/open-computer-use-repl.mjs";

assert.equal(process.platform,"darwin");
assert.ok(process.argv[2],"Pass the built native OpenComputerUse executable");
const directory=mkdtempSync(path.join(tmpdir(),"ocu-held-click-"));
const appName="OCUHeldClickFixture"+path.basename(directory).replace(/[^a-z0-9]/gi,"");
const bundle=path.join(directory,appName+".app");
const fixturePath=path.join(bundle,"Contents","MacOS",appName),stateFile=path.join(directory,"events.json");
const native=new JsonLinePeer({command:path.resolve(process.argv[2]),args:["mcp"],env:{...process.env,OPEN_COMPUTER_USE_DISABLE_APP_AGENT_PROXY:"1",OPEN_COMPUTER_USE_VISUAL_CURSOR:"0",OPEN_COMPUTER_USE_ACTION_READ_BACK:"0"}});
const session=new WorkerJavaScriptSession({native});
const events=()=>existsSync(stateFile)?JSON.parse(readFileSync(stateFile,"utf8")):[];
async function waitFor(test){const deadline=Date.now()+5000;while(!test()){assert.ok(Date.now()<deadline,"Fixture timeout");await new Promise(resolve=>setTimeout(resolve,20));}}
async function run(source){const result=await session.run(source);assert.equal(result.isError,false,JSON.stringify(result.content));return result;}
let fixture;
try {
 const status=spawnSync(path.resolve(process.argv[2]),['locked-use','status','--json'],{encoding:'utf8',timeout:10000});
 assert.equal(status.status,0,status.stderr);
 const diagnostics=JSON.parse(status.stdout);
 if(diagnostics.session?.state!=='unlocked') throw Error(`Native live check requires a normally unlocked GUI session (state: ${diagnostics.session?.state}); no fixture or input was started`);
 if(!diagnostics.accessibility) throw Error('Native live check requires existing Accessibility permission; no fixture or input was started');
 mkdirSync(path.dirname(fixturePath),{recursive:true});
 const bundleId='org.opencomputeruse.heldfixture.'+path.basename(directory).replace(/[^a-z0-9]/gi,'').toLowerCase();
 writeFileSync(path.join(bundle,'Contents','Info.plist'),`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${bundleId}</string><key>CFBundleName</key><string>${appName}</string><key>CFBundleExecutable</key><string>${appName}</string><key>CFBundlePackageType</key><string>APPL</string><key>LSUIElement</key><true/></dict></plist>`);
 await native.initialize();
 const source=fileURLToPath(new URL("./fixtures/MacOSHeldClickFixture.swift",import.meta.url));
 const build=spawnSync("swiftc",[source,"-o",fixturePath],{encoding:"utf8"});assert.equal(build.status,0,build.stderr);
 fixture=spawn(fixturePath,[stateFile],{stdio:"ignore"});
 await waitFor(()=>existsSync(stateFile));
 await run(`var app=await cua.getApp(${JSON.stringify(bundleId)},{initialState:false});var state=await app.getAXState({includeScreenshot:false,emit:false});var index=state.match(/^\\s*(\\d+)\\s+[^\\n]*Held click target/m)[1];await app.click(Number(index),{key:'shift',clickCount:2,durationMs:80});`);
 await waitFor(()=>events().filter(event=>event.kind==='up').length===2);
 const mouse=events().filter(event=>['down','up'].includes(event.kind));
 assert.equal(mouse.length,4);assert.ok(mouse.every(event=>(event.flags & (1<<17))!==0));
 assert.ok(mouse[1].time-mouse[0].time>=0.07);assert.ok(mouse[3].time-mouse[2].time>=0.07);
 const beforeKeys=events().filter(event=>event.kind==='keyDown').length;
 await run(`await app.pressKey('shift+a',{durationMs:80});`);
 await waitFor(()=>events().filter(event=>event.kind==='keyUp').length===beforeKeys+1);
 const keyEvents=events().filter(event=>['keyDown','keyUp'].includes(event.kind));
 assert.equal(keyEvents.length,2);assert.equal(keyEvents[0].keyCode,0);assert.equal(keyEvents[1].keyCode,0);
 assert.ok(keyEvents.every(event=>(event.flags & (1<<17))!==0));assert.ok(keyEvents[1].time-keyEvents[0].time>=0.07);
 const modifierStart=events().length;
 await run(`await app.pressKey('shift',{durationMs:80});`);
 await waitFor(()=>events().slice(modifierStart).filter(event=>event.kind==='flags').length===2);
 const modifiers=events().slice(modifierStart).filter(event=>event.kind==='flags');assert.ok(modifiers[1].time-modifiers[0].time>=0.07);assert.equal(modifiers[1].flags & (1<<17),0);
 const keyRunning=session.run(`await app.pressKey('shift+a',{durationMs:5000});`);
 await waitFor(()=>events().filter(event=>event.kind==='keyDown').length===2);
 await session.reset();assert.equal((await keyRunning).isError,true);
 await waitFor(()=>events().filter(event=>event.kind==='keyUp').length===2 && (events().filter(event=>event.kind==='flags').at(-1).flags & (1<<17))===0);
 const running=session.run(`var app=await cua.getApp(${JSON.stringify(bundleId)},{initialState:false});var state=await app.getAXState({includeScreenshot:false,emit:false});var index=state.match(/^\\s*(\\d+)\\s+[^\\n]*Held click target/m)[1];await app.click(Number(index),{key:'shift',durationMs:5000});`);
 await waitFor(()=>events().filter(event=>event.kind==='down').length===3);
 await session.reset();assert.equal((await running).isError,true);
 await waitFor(()=>events().filter(event=>event.kind==='up').length===3 && events().filter(event=>event.kind==='flags').at(-1)?.flags !== undefined && (events().filter(event=>event.kind==='flags').at(-1).flags & (1<<17))===0);
 console.log("PASS real native held-click/key flags, durations, modifier-only/chord input, double click and reset release");
} finally {
 await session.close();await native.close();
 if(fixture && fixture.exitCode===null){fixture.kill('SIGTERM');await new Promise(resolve=>fixture.once('exit',resolve));}
 rmSync(directory,{recursive:true,force:true});
}
