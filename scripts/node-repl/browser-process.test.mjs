import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,writeFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {browserExitProof} from './browser-process.mjs';
test('local exit proof requires matching instance file and actual listener PID, then waits for every captured process',async t=>{
 const lsof=process.platform==='darwin'?'/usr/sbin/lsof':process.platform==='linux'?'/usr/bin/lsof':undefined;
 if(!lsof)return t.skip('Local process identity requires macOS/Linux lsof');try{await access(lsof);}catch{return t.skip('lsof unavailable');}
 const profile=await mkdtemp(path.join(tmpdir(),'ocu-exit-proof-')),children=[];
 function child(code){const proc=spawn(process.execPath,['-e',code],{stdio:['ignore','pipe','ignore']}),exited=once(proc,'exit');children.push({process:proc,exited});return children.at(-1);}
 try{
  const browser=child("const net=require('node:net');const server=net.createServer();server.listen(0,'127.0.0.1',()=>console.log(server.address().port));"),port=String(await once(browser.process.stdout,'data')).trim(),renderer=child('setInterval(()=>{},1000)');
  const route='/devtools/browser/owned-instance',endpoint=`http://127.0.0.1:${port}`;await writeFile(path.join(profile,'DevToolsActivePort'),port+'\n'+route);
  let executable=process.execPath,info=[{id:browser.process.pid,type:'browser'},{id:renderer.process.pid,type:'renderer'}];
  const send=async method=>method==='Browser.getBrowserCommandLine'?{arguments:[executable,`--user-data-dir=${profile}`]}:{processInfo:info};
  assert.equal(await browserExitProof('http://192.0.2.1:'+port,'ws://owned'+route,()=>{throw Error('Unexpected IO');}),undefined);
  assert.equal(await browserExitProof(endpoint,'ws://owned/devtools/browser/other',send),undefined);
  info=[{id:renderer.process.pid,type:'browser'}];assert.equal(await browserExitProof(endpoint,'ws://owned'+route,send),undefined);
  info=[{id:0,type:'browser'}];assert.equal(await browserExitProof(endpoint,'ws://owned'+route,send),undefined);
  info=[{id:browser.process.pid,type:'browser'},{id:renderer.process.pid,type:'renderer'}];executable='/bin/sh';assert.equal(await browserExitProof(endpoint,'ws://owned'+route,send),undefined);executable=process.execPath;const proof=await browserExitProof(endpoint,'ws://owned'+route,send);assert.ok(proof);assert.equal(proof.browserGone(),false);assert.equal(proof.processesGone(),false);
  browser.process.kill('SIGTERM');await browser.exited;assert.equal(proof.browserGone(),true);assert.equal(proof.processesGone(),false);
  renderer.process.kill('SIGTERM');await renderer.exited;assert.equal(proof.processesGone(),true);
 }finally{await Promise.all(children.map(async({process,exited})=>{if(process.exitCode===null&&process.signalCode===null)process.kill('SIGTERM');await exited;}));await rm(profile,{recursive:true,force:true});}
});
