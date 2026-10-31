import {fork} from 'node:child_process';
import {access,realpath,readFile,rm,stat} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {browserEndpoint,withConnection} from './browser-cdp.mjs';
import {browserExitProof} from './browser-process.mjs';
const gone=pid=>{try{process.kill(pid,0);return false;}catch(error){return error.code==='ESRCH';}};

export class BrowserRuntime {
 constructor(environment=process.env){this.environment=environment;this.epoch=0;}
 async ensure(){
  const env=this.environment,current=this.current,epoch=this.epoch;
  if(env.OPEN_COMPUTER_USE_CDP_URL&&env.OPEN_COMPUTER_USE_CDP_URL!==current?.endpoint){browserEndpoint(env);return {endpoint:env.OPEN_COMPUTER_USE_CDP_URL,managed:false};}
  if(current?.closing){await current.closing;return this.ensure();}
  if(current&&(current.child.exitCode!==null||current.child.signalCode!==null)){await this.close();return this.ensure();}
  if(this.current)return this.current.ready;
  const executable=env.OPEN_COMPUTER_USE_BROWSER_EXECUTABLE;
  if(!executable)return {endpoint:env.OPEN_COMPUTER_USE_CDP_URL??null,managed:false};
  if(!['darwin','linux'].includes(process.platform))throw Error('Managed browser startup requires macOS/Linux process identity support');
  const mode=env.OPEN_COMPUTER_USE_BROWSER_MODE??'headless';
  if(!['headless','headful'].includes(mode))throw Error('OPEN_COMPUTER_USE_BROWSER_MODE must be headless or headful');
  if(!path.isAbsolute(executable))throw Error('OPEN_COMPUTER_USE_BROWSER_EXECUTABLE must be absolute');
  const resolved=await realpath(executable);if(!(await stat(resolved)).isFile())throw Error("Managed browser requires an executable file");await access(resolved,constants.X_OK);
  if(epoch!==this.epoch)throw Error('Managed browser startup canceled');
  // One host owns one browser; concurrent JS contexts share this startup.
  if(this.current)return this.current.ready;
  const child=fork(fileURLToPath(new URL('./browser-runtime-child.mjs',import.meta.url)),[],{execArgv:[],detached:true,stdio:['ignore','ignore','inherit','ipc']});
  const record={child,headless:mode==='headless',hiddenWindows:new Map()};this.current=record;
  record.closed=new Promise(resolve=>{child.once('exit',()=>resolve());child.once('error',()=>resolve());});
  record.ready=new Promise((resolve,reject)=>{
   let timer=setTimeout(()=>reject(Error('Managed browser startup timed out')),25000),verifying=false;
   record.reject=reject;
   child.on('message',message=>{
    if(message?.type==='profile')record.profile=message.profile;
    if(message?.type==='browser')record.pid=message.pid;
    if(message?.type==='stopped')record.stopped=true;
    if(message?.type==='error')reject(Error(message.message));
    if(message?.type!=='ready'||verifying)return;
    verifying=true;record.endpoint=message.endpoint;record.socket=message.socket;record.pid=message.pid;record.profile=message.profile;
    void (async()=>{
     const response=await fetch(new URL('/json/version',record.endpoint),{signal:AbortSignal.timeout(5000),redirect:'error'});
     if(!response.ok||(await response.json()).webSocketDebuggerUrl!==record.socket)throw Error('Managed browser endpoint identity changed');
     record.proof=await withConnection(record.socket,async send=>{
      const {processInfo}=await send('SystemInfo.getProcessInfo');
      if(processInfo.find(info=>info.type==='browser')?.id!==record.pid)throw Error('Managed browser process identity changed');
      const proof=await browserExitProof(record.endpoint,record.socket,send);
      if(proof)await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:path.join(record.profile,'downloads'),eventsEnabled:false});
      return proof;
     });
     if(!record.proof)throw Error('Managed browser requires verified local process identity (profile and lsof)');
     if(record.closing)throw Error('Managed browser startup canceled');
     if(env.OPEN_COMPUTER_USE_CDP_URL&&env.OPEN_COMPUTER_USE_CDP_URL!==record.endpoint)throw Error('CDP configuration changed during browser startup');
     env.OPEN_COMPUTER_USE_CDP_URL=record.endpoint;
     if(!record.headless){
      const deadline=Date.now()+10000;
      for(;;){
       if(record.closing)throw Error('Managed browser startup canceled');
       try{record.visibilityPending=this.windowVisibility(record,{action:'setVisibility',visible:false});await record.visibilityPending;break;}
       catch(error){if(!error.message.startsWith('No managed browser windows')||Date.now()>deadline)throw error;await new Promise(resolve=>setTimeout(resolve,20));}
      }
     }
     child.unref();child.channel?.unref();clearTimeout(timer);
     resolve({endpoint:record.endpoint,managed:true,headless:record.headless});
    })().catch(reject);
   });
   child.once('error',reject);child.once('exit',()=>{clearTimeout(timer);reject(Error('Managed browser guardian exited'));});
   child.send({type:'start',executable:resolved,headless:record.headless},error=>{if(error)reject(error);});
  });
  record.ready=record.ready.catch(async error=>{await this.close();throw error;});record.ready.catch(()=>{});
  this.beforeExit=()=>{void this.close().catch(error=>{console.error(error.message);process.exitCode=1;});};process.once('beforeExit',this.beforeExit);
  return record.ready;
 }
 request(args={}){
  if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(key=>!['action','visible'].includes(key)))throw Error('Invalid browser runtime request');
  if(!Object.keys(args).length)return this.ensure();
  if(!['getVisibility','setVisibility'].includes(args.action)||(args.action==='getVisibility'&&Object.hasOwn(args,'visible'))||(args.action==='setVisibility'&&typeof args.visible!=='boolean'))throw Error('Invalid browser visibility request');
  return this.visibility(args);
 }
 async visibility(args){
  const state=await this.ensure(),record=this.current;
  if(!state.managed||state.headless)throw Error('Visibility requires a managed headful browser');
  const work=(record.visibilityPending??Promise.resolve()).catch(()=>{}).then(async()=>{
   if(this.current!==record||record.closing||this.environment.OPEN_COMPUTER_USE_CDP_URL!==record.endpoint)throw Error('Managed browser visibility configuration changed');
   return this.windowVisibility(record,args);
  });record.visibilityPending=work;return work;
 }
 async windowVisibility(record,args){
   return withConnection(record.socket,async send=>{
    const {targetInfos}=await send('Target.getTargets',{filter:[{type:'page'}]}),windows=new Map();
    for(const target of targetInfos){
     try{const {windowId,bounds}=await send('Browser.getWindowForTarget',{targetId:target.targetId});if(!windows.has(windowId))windows.set(windowId,bounds);}
     catch(error){if(!error.cdpError)throw error;const {targetInfos:live}=await send('Target.getTargets',{filter:[{type:'page'}]});if(live.some(info=>info.targetId===target.targetId))throw error;}
    }
    for(const id of record.hiddenWindows.keys())if(!windows.has(id))record.hiddenWindows.delete(id);
    if(args.action==='getVisibility')return [...windows.values()].some(bounds=>bounds.windowState!=='minimized');
    if(!windows.size)throw Error('No managed browser windows available; create a tab first');
    for(const [windowId,bounds] of windows){
     if(!args.visible){if(bounds.windowState!=='minimized'){record.hiddenWindows.set(windowId,bounds);await send('Browser.setWindowBounds',{windowId,bounds:{windowState:'minimized'}});}}
     else if(bounds.windowState==='minimized'){
      const previous=record.hiddenWindows.get(windowId);
      await send('Browser.setWindowBounds',{windowId,bounds:{windowState:'normal'}});
      if(previous){const {windowState,...rectangle}=previous;await send('Browser.setWindowBounds',{windowId,bounds:rectangle});if(windowState!=='normal')await send('Browser.setWindowBounds',{windowId,bounds:{windowState}});}
      record.hiddenWindows.delete(windowId);
     }else record.hiddenWindows.delete(windowId);
     const deadline=Date.now()+5000;
     for(;;){const {bounds:now}=await send('Browser.getWindowBounds',{windowId});if((now.windowState!=='minimized')===args.visible)break;if(Date.now()>deadline)throw Error('Managed browser visibility remains unconfirmed; inspect before retrying');await new Promise(resolve=>setTimeout(resolve,20));}
    }
   });
 }
 async recover(record){
  // A lost guardian is recovered through the private profile and verified CDP peer.
  if(!record.profile)return;
  if(!record.pid||!gone(record.pid)){
   if(!record.socket){
    const [port,route]=(await readFile(path.join(record.profile,'DevToolsActivePort'),'utf8')).split('\n');
    if(!/^\d+$/.test(port)||Number(port)<1||Number(port)>65535||!/^\/devtools\/browser\/[^/]+$/.test(route))throw Error('Managed browser startup ownership unconfirmed');
    record.endpoint=`http://127.0.0.1:${port}/`;record.socket=`ws://127.0.0.1:${port}${route}`;
   }
   await withConnection(record.socket,async send=>{
    const {arguments:args}=await send('Browser.getBrowserCommandLine'),{processInfo}=await send('SystemInfo.getProcessInfo');
    const pid=processInfo.find(info=>info.type==='browser')?.id;
    const actualProfile=args.find(argument=>argument.startsWith('--user-data-dir='))?.slice('--user-data-dir='.length);
    if(!actualProfile||await realpath(actualProfile)!==await realpath(record.profile)||(record.pid&&record.pid!==pid)||!await browserExitProof(record.endpoint,record.socket,send))throw Error('Managed browser recovery identity changed');
    record.pid=pid;await send('Browser.close').catch(()=>{});
   }).catch(error=>{if(!record.pid||!gone(record.pid))throw error;});
   const deadline=Date.now()+10000;
   while(!gone(record.pid)){if(Date.now()>deadline)throw Error('Managed browser exit remains unconfirmed');await new Promise(resolve=>setTimeout(resolve,20));}
  }
  await rm(record.profile,{recursive:true,force:true,maxRetries:10,retryDelay:100});
 }
 async close(){
  this.epoch++;
  const record=this.current;if(!record)return;
  if(record.closing)return record.closing;
  record.closing=(async()=>{
   record.reject?.(Error('Managed browser closing'));record.child.ref();record.child.channel?.ref();
   await record.visibilityPending?.catch(()=>{});
   if(record.child.connected)record.child.send({type:'stop'},()=>{});
   let timer;
   try{await Promise.race([record.closed,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Managed browser cleanup timed out')),20000);})]);}finally{clearTimeout(timer);}
   if(!record.stopped)await this.recover(record);
   if(this.environment.OPEN_COMPUTER_USE_CDP_URL===record.endpoint)delete this.environment.OPEN_COMPUTER_USE_CDP_URL;
   if(this.current===record)this.current=undefined;
   process.removeListener('beforeExit',this.beforeExit);
  })().catch(error=>{record.closing=undefined;throw error;});return record.closing;
 }
}
export const browserRuntime=new BrowserRuntime();
