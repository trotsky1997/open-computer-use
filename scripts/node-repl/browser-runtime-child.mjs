// The IPC lifetime owns this private browser, including parent-process death.
// shortcut: simultaneous host/guardian loss during startup needs a durable journal before crash-proof recovery.
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
let browser,exited,profile,starting,stopping,closing=false;
const send=message=>{if(process.connected)process.send(message,error=>{if(error)void stop().catch(value=>{console.error(value.message);process.exitCode=1;if(process.connected)process.disconnect();});});};
async function start(executable,headless){
 profile=await mkdtemp(path.join(tmpdir(),'ocu-managed-browser-'));
 send({type:'profile',profile});
 const downloads=path.join(profile,'downloads');
 await mkdir(downloads,{mode:0o700});await mkdir(path.join(profile,'Default'),{mode:0o700});
 // Keep this host-owned session's cookies when its last visible window closes.
 await writeFile(path.join(profile,'Default','Preferences'),JSON.stringify({...(!headless?{session:{restore_on_startup:1}}:{}),download:{default_directory:downloads,prompt_for_download:false,directory_upgrade:true},savefile:{default_directory:downloads}}));
 if(closing)return;
 const extension=fileURLToPath(new URL('./chrome-browser-extension',import.meta.url));
 browser=spawn(executable,[...(headless?['--headless=new']:['--start-minimized','--keep-alive-for-test']),'--enable-automation','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--enable-features=WebMCP,CDPScreenshotNewSurface','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',`--user-data-dir=${profile}`,`--load-extension=${extension}`,`--disable-extensions-except=${extension}`,...(process.platform==='darwin'?['--use-mock-keychain']:[]),'about:blank'],{stdio:['ignore','ignore','inherit']});
 exited=once(browser,'exit');exited.catch(()=>{});let error;browser.once('error',value=>{error=value;});
 send({type:'browser',pid:browser.pid});
 const deadline=Date.now()+15000;let port,route;
 for(;;){
  if(closing)throw Error('Browser startup canceled');
  if(error)throw error;
  if(browser.exitCode!==null||browser.signalCode!==null)throw Error('Managed browser exited during startup');
  try{[port,route]=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n');if(/^\d+$/.test(port)&&Number(port)>0&&Number(port)<=65535&&/^\/devtools\/browser\/[^/]+$/.test(route))break;}catch{}
  if(Date.now()>deadline)throw Error('Managed browser startup timed out');
  await new Promise(resolve=>setTimeout(resolve,20));
 }
 if(!closing)send({type:'ready',endpoint:`http://127.0.0.1:${port}/`,socket:`ws://127.0.0.1:${port}${route}`,pid:browser.pid,profile});
 void exited.then(()=>stop(),()=>stop()).catch(fail);
}
async function stop(){
 if(stopping)return stopping;
 closing=true;
 stopping=(async()=>{
  await starting?.catch(()=>{});
  if(browser?.pid&&browser.exitCode===null&&browser.signalCode===null){
   browser.kill('SIGTERM');let timer;
   try{await Promise.race([exited.catch(()=>{}),new Promise(resolve=>{timer=setTimeout(resolve,5000);})]);}finally{clearTimeout(timer);}
   if(browser.exitCode===null&&browser.signalCode===null)browser.kill('SIGKILL');
  }
  await exited?.catch(()=>{});
  if(profile)await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  send({type:'stopped'});if(process.connected)process.disconnect();
 })();return stopping;
}
function fail(error){send({type:'error',message:String(error?.message??error).slice(0,4096)});void stop().catch(value=>{console.error(value.message);process.exitCode=1;if(process.connected)process.disconnect();});}
process.on('disconnect',()=>{void stop().catch(fail);});
process.on('message',message=>{
 if(message?.type==='stop'){void stop().catch(fail);return;}
 if(message?.type!=='start'||starting||closing||typeof message.executable!=='string'||!path.isAbsolute(message.executable)||typeof message.headless!=='boolean'){fail(Error('Invalid managed browser start'));return;}
 starting=start(message.executable,message.headless);starting.catch(fail);
});
