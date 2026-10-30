import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,copyFile,symlink,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {BrowserEvaluator} from './browser-evaluate.mjs';
import {validateEvaluation,encodeEvaluationValue,decodeEvaluationValue} from './browser-evaluate-dom.mjs';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';

test('evaluation scope validation and typed data avoid tag collisions or host callables',()=>{
 for(const args of [{source:''},{source:'()=>1',mode:'unknown'},{source:'()=>1',mode:'page',path:[{method:'click',args:[]}]},{source:'()=>1',mode:'page',options:{timeoutMs:-1}},{source:'()=>1',mode:'page',options:{unknown:true}}])assert.throws(()=>validateEvaluation(args));
 validateEvaluation({source:'()=>1',mode:'page',options:{timeoutMs:0}});
 const value={negativeZero:-0,nan:NaN,infinity:Infinity,bigint:123n,missing:undefined,date:new Date('2026-10-31T00:00:00Z'),regex:/a+/giu,nested:[{__bigint:'12',type:'value',value:'data'}]};
 assert.deepEqual(decodeEvaluationValue(encodeEvaluationValue(value)),value);
 assert.throws(()=>encodeEvaluationValue(()=>{}),/serializable/u);const cyclic={};cyclic.self=cyclic;assert.throws(()=>encodeEvaluationValue(cyclic),/Cyclic/u);
});
test('deadline cancels a pending protocol cleanup after worker result without hanging ownership',async()=>{
 const api=new BrowserEvaluator(),owner={};let disconnected=0;
 api.perform=async record=>{
  record.browser={async close(){disconnected++;}};
  try{return 'result';}finally{await record.wait(new Promise(()=>{}));}
 };
 await assert.rejects(api.request(owner,{targetId:'tab',source:'()=>1',mode:'page',options:{timeoutMs:10}}),/timed out/u);
 assert.equal(disconnected,1);assert.equal(api.owners.get(owner).records.size,0);await api.cleanup(owner);assert.equal(api.owners.size,0);
});
test('turn cancellation and failed disconnect keep ownership until cleanup retry succeeds',async()=>{
 const api=new BrowserEvaluator(),owner={};let fail=true,started;
 const ready=new Promise(resolve=>{started=resolve;});
 api.perform=async record=>{record.browser={async close(){if(fail)throw Error('disconnect outage');}};started();return record.wait(new Promise(()=>{}));};
 const request=api.request(owner,{targetId:'tab',source:'()=>1',mode:'page',options:{timeoutMs:0}});request.catch(()=>{});await ready;
 await assert.rejects(api.cleanup(owner),/disconnect outage/u);assert.equal(api.owners.size,1);
 fail=false;await api.cleanup(owner);await assert.rejects(request);assert.equal(api.owners.size,0);
 assert.throws(()=>api.request(owner,{targetId:'tab',source:'()=>1',mode:'page'}),/ended/u);
});
test('staged runtime includes transitive QuickJS modules and its WASM file',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'ocu-readonly-runtime-'));
 try {
  const root=fileURLToPath(new URL('../../',import.meta.url)),entry=path.join(directory,'copy-runtime.mjs');
  await (process.platform==='win32'?copyFile:symlink)(fileURLToPath(new URL('./runtime-dependencies.mjs',import.meta.url)),entry);
  execFileSync(process.execPath,[entry,root,directory]);
  const require=createRequire(path.join(directory,'package.json')),canonical=await realpath(directory);for(const name of ['playwright-core','quickjs-emscripten-core','@jitl/quickjs-ffi-types'])assert.ok(require.resolve(name).startsWith(canonical+path.sep));
  const scripts=path.join(directory,'scripts');await mkdir(scripts);
  await copyFile(new URL('./browser-evaluate-dom.mjs',import.meta.url),path.join(scripts,'browser-evaluate-dom.mjs'));
  const probe=path.join(scripts,'probe.mjs');
  const {writeFile}=await import('node:fs/promises');await writeFile(probe,`import {newQuickJSWASMModuleFromVariant} from 'quickjs-emscripten-core';import variant from '@jitl/quickjs-wasmfile-release-sync';export const engine=await newQuickJSWASMModuleFromVariant(variant);`);
  const {engine}=await import(pathToFileURL(probe));const vm=engine.newContext();try{const result=vm.unwrapResult(vm.evalCode('1+2'));try{assert.equal(vm.getNumber(result),3);}finally{result.dispose();}}finally{vm.dispose();}
 }finally{await rm(directory,{recursive:true,force:true});}
});
