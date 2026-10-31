// Disposable Chrome launcher shared by process-exit controllers.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {access,mkdtemp,readFile,rm} from 'node:fs/promises';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {withConnection} from '../node-repl/browser-cdp.mjs';

export async function startOwnedChrome(executable,port=0,fixed=false){
 if(fixed&&!port){
  const reservation=createServer();
  await new Promise((resolve,reject)=>{reservation.once('error',reject);reservation.listen(0,'127.0.0.1',resolve);});
  port=reservation.address().port;await new Promise((resolve,reject)=>reservation.close(error=>error?reject(error):resolve()));
 }
 const profile=await mkdtemp(path.join(tmpdir(),'ocu-browser-exit-'));
 const child=spawn(executable,['--headless=new','--enable-automation','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--enable-features=WebMCP,CDPScreenshotNewSurface','--remote-debugging-address=127.0.0.1',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,...(process.platform==='darwin'?['--use-mock-keychain']:process.platform==='linux'?['--no-sandbox']:[]),'about:blank'],{stdio:['ignore','ignore','pipe']});
 const exited=once(child,'exit');exited.catch(()=>{});
 let startupError,debuggerUrl,output='';child.once('error',error=>{startupError=error;});
 child.stderr.pipe(process.stderr,{end:false});
 child.stderr.on('data',chunk=>{
  if(debuggerUrl)return;
  output=(output+chunk.toString()).slice(-16384);
  debuggerUrl=output.match(/DevTools listening on (ws:\/\/[^\s]+)\r?\n/)?.[1];
 });
 const close=async()=>{if(child.pid&&child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await exited.catch(()=>{});await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});};
 try{
  const deadline=Date.now()+10000;
  while(!debuggerUrl){
   if(startupError)throw startupError;
   if(child.exitCode!==null||child.signalCode!==null)throw Error('Owned Chrome exited during startup');
   assert.ok(Date.now()<deadline,'Owned Chrome did not announce its debugger');await new Promise(resolve=>setTimeout(resolve,20));
  }
  const socket=new URL(debuggerUrl);assert.ok(['127.0.0.1','[::1]'].includes(socket.hostname));
  if(port)assert.equal(Number(socket.port),port,'Owned Chrome selected another port');
  const endpoint=`http://${socket.host}`;
  if(!port){
   for(;;){
    try{assert.equal(await readFile(path.join(profile,'DevToolsActivePort'),'utf8'),socket.port+'\n'+socket.pathname);break;}
    catch(error){if(Date.now()>=deadline)throw error;await new Promise(resolve=>setTimeout(resolve,20));}
   }
  }else await assert.rejects(access(path.join(profile,'DevToolsActivePort')),{code:'ENOENT'});
  const response=await fetch(new URL('/json/version',endpoint),{signal:AbortSignal.timeout(5000),redirect:'error'});assert.equal(response.ok,true);
  const version=await response.json();assert.equal(version.webSocketDebuggerUrl,debuggerUrl,'Endpoint belongs to another browser');
  const {processInfo}=await withConnection(debuggerUrl,send=>send('SystemInfo.getProcessInfo'));
  assert.equal(processInfo.find(info=>info.type==='browser')?.id,child.pid,'Endpoint belongs to another process');
  return {child,exited,endpoint,close};
 }catch(error){await close();throw error;}
}
