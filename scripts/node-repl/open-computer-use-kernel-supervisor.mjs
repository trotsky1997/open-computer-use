// This process never evaluates model code; IPC loss can stop a busy kernel.
import {fork} from 'node:child_process';
const kernel=fork(new URL('./open-computer-use-kernel.mjs',import.meta.url),{execArgv:[],stdio:['ignore','ignore','ignore','ipc'],serialization:'advanced',windowsHide:true});
let stopping=false;
function stop(){if(stopping)return;stopping=true;kernel.kill('SIGKILL');}
process.on('message',message=>{if(!stopping&&kernel.connected)kernel.send(message,error=>{if(error)stop();});});
kernel.on('message',message=>{if(!stopping&&process.connected)process.send(message,error=>{if(error)stop();});});
function stopGroup(){if(process.platform!=='win32'){try{process.kill(-process.pid,'SIGKILL');return;}catch{}}stop();}
process.on('disconnect',stopGroup);
process.on('SIGTERM',stopGroup);
process.on('SIGINT',stopGroup);
kernel.on('disconnect',stop);
kernel.on('error',stop);
kernel.on('close',code=>process.exit(code??1));
if(!process.connected)stopGroup();
