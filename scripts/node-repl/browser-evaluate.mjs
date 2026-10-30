import {randomUUID} from 'node:crypto';
import {Worker} from 'node:worker_threads';
import {findBrowserPage} from './browser-playwright.mjs';
import {createReadWorld,validateEvaluation,encodeEvaluationValue,decodeEvaluationValue} from './browser-evaluate-dom.mjs';

export class BrowserEvaluator {
 constructor(endpoint=()=>process.env.OPEN_COMPUTER_USE_CDP_URL){this.endpoint=endpoint;this.owners=new Map();this.closedOwners=new WeakSet();}
 request(owner,args) {
  validateEvaluation(args);args={...args,arg:encodeEvaluationValue(args.arg)};if(Buffer.byteLength(JSON.stringify(args.arg))>16*1024*1024)throw Error('Evaluation argument exceeds 16 MiB');if(typeof args.targetId!=='string'||!args.targetId)throw Error('Invalid evaluation tab');
  if(this.closedOwners.has(owner))throw Error('Read-only evaluation session ended');
  let state=this.owners.get(owner);if(!state){state={records:new Set()};this.owners.set(owner,state);}
  let rejectStop;const stopped=new Promise((_,reject)=>{rejectStop=reject;});stopped.catch(()=>{});
  const record={wait:promise=>Promise.race([promise,stopped]),deadline:args.options?.timeoutMs===0?null:Date.now()+(args.options?.timeoutMs??10000),reads:new Set()};state.records.add(record);
  record.cancel=reason=>{
   record.error??=Error(reason);rejectStop(record.error);record.reject?.(record.error);
   if(record.worker)record.terminated??=record.worker.terminate();
   if(record.browser)record.disconnected??=record.browser.close();
   record.disconnected?.catch(()=>{});
  };
  const timer=record.deadline===null?undefined:setTimeout(()=>record.cancel('Read-only evaluation timed out'),Math.max(0,record.deadline-Date.now()));
  record.job=this.perform(record,args).finally(async()=>{
   clearTimeout(timer);record.worker && (record.terminated??=record.worker.terminate());await record.terminated;
   await Promise.allSettled([...record.reads]);
   if(record.browser){await (record.disconnected??=record.browser.close());record.browser=undefined;}
   state.records.delete(record);
  });record.job.catch(()=>{});return record.job;
 }
 async perform(record,args) {
  const check=()=>{if(record.error)throw record.error;},remaining=()=>record.deadline===null?0:Math.max(1,record.deadline-Date.now());
  const {chromium}=await import('playwright-core');check();
  record.browser=await chromium.connectOverCDP(this.endpoint(),{timeout:Math.min(remaining()||10000,10000),noDefaults:true});check();
  for(const context of record.browser.contexts())context.on('dialog',()=>{});
  const {page,session:root}=await record.wait(findBrowserPage(record.browser,args.targetId));check();
  if(!['http:','https:','about:','data:','blob:'].includes(new URL(page.url()).protocol))throw Error('Read-only evaluation requires a web page');
  page.setDefaultTimeout(remaining());
  const resolve=(steps,scope=false)=>{
   let current=page,frameOwner;
   const convert=value=>value?.__ocuLocator?resolve(value.__ocuLocator):value?.__ocuRegExp?new RegExp(value.__ocuRegExp.source,value.__ocuRegExp.flags):Array.isArray(value)?value.map(convert):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,convert(item)])):value;
   for(const step of steps){current=current[step.method](...step.args.map(convert));if(typeof current.owner==='function')frameOwner=current.owner();}
   return scope?{locator:current,frameOwner}:current;
  };
  let frame=page.mainFrame(),handles=[];
  if(args.mode!=='page') {
   const {locator,frameOwner}=resolve(args.path,true);
   if(args.mode==='element') {
    await record.wait(locator.waitFor({state:'attached',timeout:remaining()}));
    if(await record.wait(locator.count())!==1)throw Error('Evaluation locator must resolve to exactly one element');
    handles=[await record.wait(locator.elementHandle({timeout:remaining()}))];
   }else handles=await record.wait(locator.elementHandles());
   if(handles.length){frame=await record.wait(handles[0].ownerFrame());if(!frame)throw Error('Evaluation element detached');}
   else if(frameOwner){
    const owner=await record.wait(frameOwner.elementHandle({timeout:remaining()}));
    try{frame=await record.wait(owner.contentFrame());if(!frame)throw Error('Evaluation frame detached');}
    finally{if(!record.error)await record.wait(owner.dispose());}
   }
  }
  let session=root;
  if(frame!==page.mainFrame()){
   let ancestor=frame;
   // In-process descendants use their nearest process-owning ancestor session.
   while(ancestor && ancestor!==page.mainFrame()){
    try{session=await record.wait(page.context().newCDPSession(ancestor));break;}
    catch(error){if(!/does not have a separate CDP session/iu.test(error.message))throw error;ancestor=ancestor.parentFrame();}
   }
   if(!ancestor)throw Error('Evaluation frame detached');
  }
  // shortcut: pinned Playwright exposes exact native handle identity via toImpl; review this bridge on upgrades.
  const nativeFrame=frame._connection.toImpl(frame),frameId=nativeFrame._id;
  await record.wait(session.send('Page.enable'));session.on('Page.frameNavigated',event=>{if(event.frame.id===frameId)record.cancel('Page navigated during read-only evaluation');});session.on('Page.navigatedWithinDocument',event=>{if(event.frameId===frameId)record.cancel('Page navigated during read-only evaluation');});
  page.on('close',()=>record.cancel('Evaluation tab closed'));
  page.on('crash',()=>record.cancel('Evaluation renderer crashed'));
  page.on('framedetached',detached=>{if(detached===frame)record.cancel('Evaluation frame detached');});check();
  const {executionContextId}=await record.wait(session.send('Page.createIsolatedWorld',{frameId,worldName:'ocu-readonly-dom'}));
  const group=`ocu-readonly-${randomUUID()}`;
  try {
   const {result,exceptionDetails}=await record.wait(session.send('Runtime.evaluate',{contextId:executionContextId,expression:`(${createReadWorld.toString()})((${decodeEvaluationValue.toString()}))`,objectGroup:group}));
   if(exceptionDetails)throw Error(exceptionDetails.text);const reader=result.objectId;
   const invoke=async(method,params=[])=>{
    check();const result=await record.wait(session.send('Runtime.callFunctionOn',{objectId:reader,functionDeclaration:`function(...args){return this.${method}(...args)}`,arguments:params,returnByValue:true,objectGroup:group}));
    check();if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description??result.exceptionDetails.text);return result.result.value;
   };
   const roots=await invoke('roots'),targets=[];
   for(const handle of handles) {
    if(await record.wait(handle.ownerFrame())!==frame)throw Error('Evaluation elements span multiple frames');
    const native=handle._connection.toImpl(handle);
    const {node}=await record.wait(native._context.delegate._client.send('DOM.describeNode',{objectId:native._objectId}));
    const {object}=await record.wait(session.send('DOM.resolveNode',{backendNodeId:node.backendNodeId,executionContextId,objectGroup:group}));
    targets.push(await invoke('seed',[{objectId:object.objectId}]));
   }
   const target=args.mode==='all'?{kind:'list',values:targets}:targets[0]??null;
   const buffer=new SharedArrayBuffer(16*1024*1024),control=new Int32Array(buffer,0,2),bytes=new Uint8Array(buffer,8);
   record.worker=new Worker(new URL('./browser-evaluate-worker.mjs',import.meta.url),{env:{},execArgv:[],workerData:{source:args.source,arg:args.arg,target,mode:args.mode,roots,buffer,deadline:record.deadline}});check();
   return await new Promise((resolve,reject)=>{
    record.reject=reject;
    record.worker.on('message',message=>{
     if(message.type==='result'){try{check();if(Buffer.byteLength(message.result)>16*1024*1024)throw Error('Evaluation result exceeds 16 MiB');resolve(decodeEvaluationValue(JSON.parse(message.result)));}catch(error){reject(error);}}
     else if(message.type==='error')reject(Error(message.error));
     else if(message.type==='read') {
      const read=(async()=>{
       let response;
       try {
        check();if(typeof message.request!=='string'||Buffer.byteLength(message.request)>16*1024*1024)throw Error('Read-only bridge request exceeds 16 MiB');const request=JSON.parse(message.request);
        if(request.op==='url'){
         const url=new URL(request.value,request.base),keys=['href','origin','protocol','username','password','host','hostname','port','pathname','search','hash'];
         if(request.key!==undefined){if(!keys.includes(request.key)||request.key==='origin')throw Error('Invalid local URL property');url[request.key]=request.setValue;}
         response={data:Object.fromEntries(keys.map(key=>[key,url[key]]))};
        }else if(request.op==='params'){
         if(!['toString','get','getAll','has','entries','keys','values','append','set','delete','sort'].includes(request.method))throw Error('Invalid local URLSearchParams method');
         const params=new URLSearchParams(decodeEvaluationValue(request.value)),value=params[request.method](...request.args.map(decodeEvaluationValue));
         response={data:['entries','keys','values'].includes(request.method)?[...value]:['append','set','delete','sort'].includes(request.method)?params.toString():value};
        }else response={value:await invoke('read',[{value:request}])};
       }catch(error){response={error:error.message};}
       let encoded=new TextEncoder().encode(JSON.stringify(response));if(encoded.length>bytes.length)encoded=new TextEncoder().encode(JSON.stringify({error:'Read-only DOM result exceeds 16 MiB'}));
       bytes.set(encoded);Atomics.store(control,1,encoded.length);Atomics.store(control,0,1);Atomics.notify(control,0);
      })();record.reads.add(read);read.finally(()=>record.reads.delete(read)).catch(reject);
     }
    });
    record.worker.on('error',reject);record.worker.on('exit',code=>reject(record.error??Error(`Read-only evaluator exited before completion (${code})`)));
   });
  } finally {if(!record.error){await record.wait(Promise.all(handles.map(handle=>handle.dispose())));await record.wait(session.send('Runtime.releaseObjectGroup',{objectGroup:group}));}}
 }
 cancel(owner){this.closedOwners.add(owner);for(const record of this.owners.get(owner)?.records??[])record.cancel('Read-only evaluation session ended');}
 async cleanup(owner){
  this.cancel(owner);const state=this.owners.get(owner);
  if(state){
   await Promise.allSettled([...state.records].map(record=>record.job));
   for(const record of state.records){
    if(record.browser){await record.browser.close();record.browser=undefined;}
    state.records.delete(record);
   }
  }
  this.owners.delete(owner);
 }
}
