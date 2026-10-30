import {parentPort,workerData} from 'node:worker_threads';
import {newQuickJSWASMModuleFromVariant} from 'quickjs-emscripten-core';
import variant from '@jitl/quickjs-wasmfile-release-sync';
import {installReadScope,encodeEvaluationValue,decodeEvaluationValue} from './browser-evaluate-dom.mjs';

const control=new Int32Array(workerData.buffer,0,2),bytes=new Uint8Array(workerData.buffer,8);
const engine=await newQuickJSWASMModuleFromVariant(variant),runtime=engine.newRuntime();
runtime.setMemoryLimit(64*1024*1024);runtime.setMaxStackSize(1024*1024);
runtime.setInterruptHandler(()=>workerData.deadline!==null && Date.now()>=workerData.deadline);
const context=runtime.newContext();
function rpc(handle) {
 Atomics.store(control,0,0);parentPort.postMessage({type:'read',request:context.getString(handle)});
 const remaining=workerData.deadline===null?undefined:Math.max(0,workerData.deadline-Date.now());
 if(Atomics.wait(control,0,0,remaining)==='timed-out')return context.newString(JSON.stringify({error:'Read-only evaluation timed out'}));
 return context.newString(new TextDecoder().decode(bytes.subarray(0,Atomics.load(control,1))));
}
let run,result,timerError,nextTimer=0;const timers=new Map();
function clearTimer(id){const timer=timers.get(id);if(timer){clearTimeout(timer.native);timer.callback.dispose();for(const arg of timer.args)arg.dispose();timers.delete(id);}}
try {
 context.newFunction('setTimeout',(callback,delay,...args)=>{
  const milliseconds=context.getNumber(delay);if(context.typeof(callback)!=='function'||!Number.isFinite(milliseconds)||milliseconds<0||milliseconds>2147483647)return {error:context.newError('setTimeout requires a callback and finite non-negative delay')};
  const id=++nextTimer,record={callback:callback.dup(),args:args.map(arg=>arg.dup())};timers.set(id,record);
  record.native=setTimeout(()=>{const value=context.callFunction(record.callback,context.undefined,...record.args);if(value.error){timerError=Error(context.dump(value.error)?.message??'Read-only timer failed');value.error.dispose();}else value.value.dispose();clearTimer(id);},milliseconds);
  return context.newNumber(id);
 }).consume(handle=>context.setProp(context.global,'__setTimer',handle));
 context.newFunction('clearTimeout',id=>{clearTimer(context.getNumber(id));return context.undefined;}).consume(handle=>context.setProp(context.global,'__clearTimer',handle));
 context.newFunction('read',rpc).consume(handle=>context.setProp(context.global,'__readRpc',handle));
 run=context.unwrapResult(context.evalCode(`(${installReadScope.toString()})(__readRpc,${JSON.stringify(workerData.roots)},(${encodeEvaluationValue.toString()}),(${decodeEvaluationValue.toString()}),__setTimer,__clearTimer)`));
 const args=[workerData.source,JSON.stringify(workerData.arg),JSON.stringify(workerData.target),workerData.mode].map(value=>context.newString(value));
 // JSON parses inside the VM so no host object or callable crosses the boundary.
 const invoke=context.unwrapResult(context.evalCode('(run,source,arg,target,mode)=>run(source,JSON.parse(arg),JSON.parse(target),mode)'));
 try {result=context.unwrapResult(context.callFunction(invoke,context.undefined,run,...args));}finally{invoke.dispose();for(const arg of args)arg.dispose();}
 for(;;) {
  if(timerError)throw timerError;
  const state=context.getPromiseState(result);
  if(state.type==='rejected'){try{throw Error(context.dump(state.error)?.message??String(context.dump(state.error)));}finally{state.error.dispose();}}
  if(state.type==='fulfilled') {try{parentPort.postMessage({type:'result',result:context.getString(state.value)});}finally{state.value.dispose();}break;}
  const jobs=runtime.executePendingJobs(100);
  if(jobs.error){try{throw Error(context.dump(jobs.error)?.message??'Read-only promise failed');}finally{jobs.error.dispose();}}
  // Yield while promises are pending so unresolved waits do not spin a CPU core.
  await new Promise(resolve=>setTimeout(resolve,1));
 }
}catch(error){parentPort.postMessage({type:'error',error:error?.message??String(error)});}
finally{for(const id of timers.keys())clearTimer(id);result?.dispose();run?.dispose();context.dispose();runtime.dispose();}
