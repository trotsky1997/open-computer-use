import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,writeFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {browserExitProof} from './browser-process.mjs';
test('local exit proof binds dynamic and fixed ports to their actual listener and executable, then tracks every captured process',async t=>{
 const lsof=process.platform==='darwin'?'/usr/sbin/lsof':process.platform==='linux'?'/usr/bin/lsof':undefined;
 if(!lsof)return t.skip('Local process identity requires macOS/Linux lsof');try{await access(lsof);}catch{return t.skip('lsof unavailable');}
 const profile=await mkdtemp(path.join(tmpdir(),'ocu-exit-proof-')),children=[];
 function child(code){const proc=spawn(process.execPath,['-e',code],{stdio:['ignore','pipe','ignore']}),exited=once(proc,'exit');children.push({process:proc,exited});return children.at(-1);}
 try{
  const browser=child("const net=require('node:net');const server=net.createServer();server.listen(0,'127.0.0.1',()=>console.log(server.address().port));"),port=String(await once(browser.process.stdout,'data')).trim(),renderer=child('setInterval(()=>{},1000)');
  const route='/devtools/browser/owned-instance',endpoint=`http://127.0.0.1:${port}`;await writeFile(path.join(profile,'DevToolsActivePort'),port+'\n'+route);
  let flags=[],executable=process.execPath,info=[{id:browser.process.pid,type:'browser'},{id:renderer.process.pid,type:'renderer'}];
  const send=async method=>method==='Browser.getBrowserCommandLine'?{arguments:[executable,`--user-data-dir=${profile}`,...flags]}:{processInfo:info};
  assert.equal(await browserExitProof('http://192.0.2.1:'+port,'ws://owned'+route,()=>{throw Error('Unexpected IO');}),undefined);
  assert.equal(await browserExitProof(endpoint,'ws://owned/devtools/browser/other',send),undefined);
  info=[{id:renderer.process.pid,type:'browser'}];assert.equal(await browserExitProof(endpoint,'ws://owned'+route,send),undefined);
  info=[{id:0,type:'browser'}];assert.equal(await browserExitProof(endpoint,'ws://owned'+route,send),undefined);
  info=[{id:browser.process.pid,type:'browser'},{id:renderer.process.pid,type:'renderer'}];executable='/bin/sh';assert.equal(await browserExitProof(endpoint,'ws://owned'+route,send),undefined);executable=process.execPath;const proof=await browserExitProof(endpoint,'ws://owned'+route,send);assert.ok(proof);assert.equal(proof.browserGone(),false);assert.equal(proof.processesGone(),false);
  await rm(path.join(profile,'DevToolsActivePort'));
  const socket=`ws://127.0.0.1:${port}${route}`;
  flags=[`--remote-debugging-port=${port}`];
  const fixed=await browserExitProof(endpoint,socket,send);assert.ok(fixed,'Fixed-port launch has no DevToolsActivePort file');
  assert.equal(fixed.browserGone(),false);
  await writeFile(path.join(profile,'DevToolsActivePort'),'1\n/devtools/browser/stale');
  assert.ok(await browserExitProof(endpoint,socket,send),'Fixed-port identity follows the current listener');
  assert.equal(await browserExitProof(endpoint,`ws://192.0.2.1:${port}${route}`,send),undefined);
  assert.equal(await browserExitProof(endpoint,`ws://127.0.0.1:${Number(port)===65535?65534:65535}${route}`,send),undefined);
  flags=['--remote-debugging-port=1'];assert.equal(await browserExitProof(endpoint,socket,send),undefined);
  flags=[`--remote-debugging-port=${port}`,'--remote-debugging-port=0'];assert.equal(await browserExitProof(endpoint,socket,send),undefined);
  flags=[`--remote-debugging-port=${port}`];info=[{id:renderer.process.pid,type:'browser'}];assert.equal(await browserExitProof(endpoint,socket,send),undefined);
  browser.process.kill('SIGTERM');await browser.exited;assert.equal(proof.browserGone(),true);assert.equal(fixed.browserGone(),true);assert.equal(proof.processesGone(),false);
  renderer.process.kill('SIGTERM');await renderer.exited;assert.equal(proof.processesGone(),true);
 }finally{await Promise.all(children.map(async({process,exited})=>{if(process.exitCode===null&&process.signalCode===null)process.kill('SIGTERM');await exited;}));await rm(profile,{recursive:true,force:true});}
});
