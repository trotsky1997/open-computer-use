import {open,realpath,stat} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {isAbsolute,join} from 'node:path';
import {bounded} from './browser-assets.mjs';
const execute=promisify(execFile);
const ended=pid=>{try{process.kill(pid,0);return false;}catch(error){return error.code==='ESRCH';}};
// shortcut: requires a local explicit profile and lsof; add broker identity for remote browsers.
export async function browserExitProof(endpoint,webSocketDebuggerUrl,send){
 try{
  const loopback=['127.0.0.1','[::1]','localhost'],url=new URL(endpoint);
  if(!['http:','https:'].includes(url.protocol)||!loopback.includes(url.hostname))return;
  const port=url.port||(url.protocol==='https:'?'443':'80');
  const {arguments:args}=await bounded(send('Browser.getBrowserCommandLine'),'Browser process identity');
  if(!isAbsolute(args[0]))return;const executable=await realpath(args[0]);
  const profile=args.find(arg=>arg.startsWith('--user-data-dir='))?.slice('--user-data-dir='.length);if(!profile||!isAbsolute(profile))return;
  if(!(await stat(profile)).isDirectory())return;
  const flags=args.filter(argument=>argument.startsWith('--remote-debugging-port='));
  if(flags.length>1)return;
  const declared=flags.length?flags[0].slice('--remote-debugging-port='.length):'0';
  if(!/^\d+$/.test(declared)||Number(declared)>65535)return;
  if(Number(declared)) {
    // Fixed-port launches can omit the instance file.
    const socket=new URL(webSocketDebuggerUrl),socketPort=socket.port||(socket.protocol==='wss:'?'443':'80');
    if(String(Number(declared))!==port || !['ws:','wss:'].includes(socket.protocol) || !loopback.includes(socket.hostname) || socketPort!==port || socket.username || socket.password || socket.search || socket.hash || !/^\/devtools\/browser\/[^/]+$/.test(socket.pathname))return;
  } else {
    const file=await open(join(profile,'DevToolsActivePort'),'r');let text;
    try{const buffer=Buffer.alloc(4096),{bytesRead}=await file.read(buffer,0,buffer.length,0);text=buffer.subarray(0,bytesRead).toString('utf8');}finally{await file.close();}
    const [recordedPort,route]=text.split('\n');if(recordedPort!==port||route!==new URL(webSocketDebuggerUrl).pathname)return;
  }
  const {processInfo}=await bounded(send('SystemInfo.getProcessInfo'),'Browser process snapshot');
  if(!Array.isArray(processInfo)||!processInfo.length||processInfo.some(info=>!Number.isInteger(info.id)||info.id<=0||info.id>2147483647))return;
  const browser=processInfo.find(info=>info.type==='browser');if(!browser)return;
  const lsof=process.platform==='darwin'?'/usr/sbin/lsof':process.platform==='linux'?'/usr/bin/lsof':undefined;if(!lsof)return;
  // Busy macOS process queries can exceed one second.
  const {stdout}=await execute(lsof,['-nP','-a','-p',String(browser.id),`-iTCP@${url.hostname==='localhost'?'127.0.0.1':url.hostname}:${port}`,'-sTCP:LISTEN','-Fp'],{timeout:5000,maxBuffer:8192});
  if(!stdout.split('\n').includes(`p${browser.id}`))return;
  const textFiles=await execute(lsof,['-nP','-a','-p',String(browser.id),'-d','txt','-Fn'],{timeout:5000,maxBuffer:262144});
  if(!textFiles.stdout.split('\n').includes(`n${executable}`))return;
  const pids=[...new Set(processInfo.map(info=>info.id))];
  return {browserGone:()=>ended(browser.id),processesGone:()=>pids.every(ended)};
 }catch{return;}
}
