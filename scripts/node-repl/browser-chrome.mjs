import {randomUUID} from 'node:crypto';
import {normalizeHistoryOptions} from './chrome-browser-extension/history.mjs';
import {BrowserTabs} from './browser-tabs.mjs';
import {findBrowserPage} from './browser-playwright.mjs';
import {validateManagement} from './chrome-browser-extension/policy.mjs';
export const CHROME_EXTENSION_ID='mbhbomghoccgpofpfkkfiaonndokcbpj';
export const CHROME_EXTENSION_URL=`chrome-extension://${CHROME_EXTENSION_ID}/bridge.html`;
export class BrowserChrome {
 constructor(endpoint,open){this.endpoint=endpoint;this.open=open;this.tabs=new BrowserTabs(endpoint,open,'ocu-bridge');this.owners=new Map();this.closedOwners=new WeakSet();this.initializing=Promise.resolve();}
 hidden(){const ids=[],urls=[];for(const entry of this.tabs.browsers.values()){ids.push(...entry.tabs.keys());urls.push(...entry.creating.keys());}return {ids,urls};}
 request(owner,args,coordinate){
  if(args?.action==='targets')return Promise.resolve(this.hidden());
  if(!['selected','userTabs','management','audit','history'].includes(args?.action))throw Error('Unknown Chrome bridge action');
  if(args.action==='history')args={...args,options:normalizeHistoryOptions(args.options),id:randomUUID()};
  const mutation=args.action==='management'&&validateManagement(args.namespace,args.method,args.args);
  if(mutation&&typeof coordinate!=='function')throw Error('Management mutations require the shared tab coordinator');
  if(Buffer.byteLength(JSON.stringify(args))>65536)throw Error('Chrome bridge request exceeds 64 KiB');
  if(this.closedOwners.has(owner))throw Error('Chrome bridge turn ended');
  let entry=this.owners.get(owner);
  if(entry&&entry.endpoint!==this.endpoint())throw Error('Configured browser changed; reset the session');
  if(!entry){
   let reject;entry={owner,endpoint:this.endpoint(),pending:new Set(),mutations:new Set(),histories:new Map(),historyStops:new Map(),stopped:new Promise((_,no)=>{reject=no;})};entry.stopped.catch(()=>{});entry.reject=reject;entry.wait=promise=>Promise.race([promise,entry.stopped]);this.owners.set(owner,entry);
   entry.ready=this.initializing.then(()=>this.initialize(entry));this.initializing=entry.ready.catch(()=>{});
  }
  const job=(async()=>{
   await entry.ready;if(entry.error)throw entry.error;
   const state={dispatched:false,canceled:false};
   const check=()=>{if(entry.error||state.canceled)throw entry.error??Error('Management preparation canceled before dispatch');};
   const operation=mutation?coordinate(async claim=>{
    check();const plan=await this.invoke(entry,{...args,action:'managementPlan'});
    if(!plan||!Array.isArray(plan.targetIds)||plan.targetIds.some(id=>typeof id!=='string'||!id)||new Set(plan.targetIds).size!==plan.targetIds.length||typeof plan.fingerprint!=='string'||!/^[\da-f]{64}$/u.test(plan.fingerprint))throw Error('Invalid management plan');
    check();await claim(plan.targetIds);check();
    state.dispatched=true;
    try{return await this.invoke(entry,{...args,fingerprint:plan.fingerprint});}
    catch(error){if(!error.nativeAcknowledged)error.managementUnconfirmed=true;throw error;}
   }):this.invoke(entry,args);
   if(args.action==='history'){entry.histories.set(args.id,operation);const finished=()=>{entry.histories.delete(args.id);entry.historyStops.delete(args.id);};operation.then(finished,error=>{if(error.nativeAcknowledged)finished();}).catch(()=>{});}
   if(mutation){
    entry.mutations.add(operation);
    operation.then(()=>entry.mutations.delete(operation),error=>{if(state.dispatched&&!error.nativeAcknowledged)entry.uncertain=error;entry.mutations.delete(operation);}).catch(()=>{});
   }
   let result;
   try{result=await this.bounded(entry,operation,!mutation);}
   catch(error){if(mutation&&!state.dispatched)state.canceled=true;if(args.action==='history'&&entry.histories.has(args.id))await this.stopHistory(entry,args.id);throw error;}
   if(args.action==='selected'){
    if(result!==null&&(typeof result!=='string'||!result))throw Error('Invalid selected target identity');
    return result??undefined;
   }
   return result;
  })();
  entry.pending.add(job);job.finally(()=>entry.pending.delete(job)).catch(()=>{});return job;
 }
 async bounded(entry,promise,cancelable=true){let timer;try{return await Promise.race([cancelable?entry.wait(promise):promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Chrome bridge timed out')),10000);})]);}finally{clearTimeout(timer);}}
 async invoke(entry,args){
  const result=await entry.connection.send('Runtime.callFunctionOn',{objectId:entry.objectId,functionDeclaration:'function(request){return this.request(request)}',arguments:[{value:args}],awaitPromise:true,returnByValue:true},0,entry.sessionId);
  if(result.exceptionDetails)throw Object.assign(Error(result.exceptionDetails.exception?.description??result.exceptionDetails.text),{nativeAcknowledged:true});
  return result.result.value;
 }
 async stopHistory(entry,id){
  if(!entry.historyStops.has(id)){
   const stop=(async()=>{if(!entry.connection)throw Error('History cancellation was not acknowledged: Chrome bridge disconnected');const result=await entry.connection.send('Runtime.callFunctionOn',{objectId:entry.objectId,functionDeclaration:'function(id){this.cancel(id)}',arguments:[{value:id}],returnByValue:true},10000,entry.sessionId);if(result.exceptionDetails)throw Error('History cancellation was not acknowledged');})();
   entry.historyStops.set(id,stop);stop.catch(()=>{if(entry.historyStops.get(id)===stop)entry.historyStops.delete(id);entry.error??=Error('History cancellation was not acknowledged; reset before reuse');entry.reject(entry.error);});
  }
  return entry.historyStops.get(id);
 }
 async initialize(entry){
  try{
   if(entry.error)throw entry.error;
   const version=await (await fetch(new URL('/json/version',entry.endpoint),{signal:AbortSignal.timeout(10000),redirect:'error'})).json();
   entry.connection=await this.open(version.webSocketDebuggerUrl,()=>{},()=>{if(!entry.error){entry.error=Error('Chrome bridge disconnected; reset before reuse');entry.reject(entry.error);}});
   const findWorkers=async()=>{const {targetInfos}=await entry.connection.send('Target.getTargets');return targetInfos.filter(target=>target.type==='service_worker'&&target.url===`chrome-extension://${CHROME_EXTENSION_ID}/background.mjs`);};
   let workers=await findWorkers();
   if(!workers.length){
    const {targetId}=await this.tabs.request(entry.owner,{action:'create',visible:false});entry.targetId=targetId;
    if(entry.error)throw entry.error;
    const {chromium}=await import('playwright-core');entry.browser=await chromium.connectOverCDP(entry.endpoint,{timeout:10000,noDefaults:true});
    if(entry.error)throw entry.error;
    for(const context of entry.browser.contexts())context.on('dialog',()=>{});
    const {page}=await entry.wait(findBrowserPage(entry.browser,targetId));
    try{await entry.wait(page.goto(CHROME_EXTENSION_URL,{waitUntil:'load',timeout:10000}));await this.bounded(entry,page.evaluate(()=>globalThis.ocuBootReady));}
    catch(error){if(entry.error)throw entry.error;throw Error(`Load the bundled Chrome browser extension (${CHROME_EXTENSION_ID}): ${error.message}`);}
    workers=await findWorkers();
   }
   if(entry.error)throw entry.error;
   if(workers.length!==1)throw Error('Chrome extension worker has no unique target');entry.workerId=workers[0].targetId;
   ({sessionId:entry.sessionId}=await entry.connection.send('Target.attachToTarget',{targetId:entry.workerId,flatten:true}));
   const identity=await entry.connection.send('Runtime.evaluate',{expression:'({id:chrome.runtime.id,protocol:globalThis.ocuChromeBridge?.protocol})',returnByValue:true},10000,entry.sessionId);
   if(identity.result.value?.id!==CHROME_EXTENSION_ID||identity.result.value?.protocol!==5)throw Error('Chrome browser extension identity/protocol mismatch');
   const object=await entry.connection.send('Runtime.evaluate',{expression:'globalThis.ocuChromeBridge'},10000,entry.sessionId);entry.objectId=object.result.objectId;
   if(entry.browser){await entry.browser.close();entry.browser=undefined;}await this.tabs.end(entry.owner,{final:true});
  }catch(error){
   try{await this.disconnect(entry);await this.tabs.end(entry.owner,{final:true});}catch(cleanupError){cleanupError.browserCleanupFailed=true;throw cleanupError;}
   throw error;
  }
 }
 async disconnect(entry){entry.connection?.close();entry.connection=undefined;if(entry.browser){await entry.browser.close();entry.browser=undefined;}}
 cancel(owner){
  this.closedOwners.add(owner);const entry=this.owners.get(owner);
  if(entry){
   entry.error??=Error('Chrome bridge turn ended');entry.reject(entry.error);
   if(entry.histories.size){for(const id of entry.histories.keys())void this.stopHistory(entry,id).catch(()=>{});}
   else if(!entry.mutations.size)void this.disconnect(entry).catch(()=>{});
  }
 }
 async cleanup(owner){
  this.cancel(owner);const entry=this.owners.get(owner);
  if(entry){
   const stopping=Promise.all([...entry.histories.keys()].map(id=>this.stopHistory(entry,id)));stopping.catch(()=>{});
   await Promise.allSettled([entry.ready,...entry.pending]);
   await stopping;
   if(entry.mutations.size)await this.bounded(entry,Promise.allSettled([...entry.mutations]),false);
   await this.disconnect(entry);await this.tabs.end(owner,{final:true});this.owners.delete(owner);
   if(entry.uncertain)throw Error(`Management mutation outcome needs audit review before retry: ${entry.uncertain.message}`);
  }
 }
}
