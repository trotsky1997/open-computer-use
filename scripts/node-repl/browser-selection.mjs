import {BrowserTabs} from './browser-tabs.mjs';
import {findBrowserPage} from './browser-playwright.mjs';

export const SELECTION_EXTENSION_ID='mbhbomghoccgpofpfkkfiaonndokcbpj';
export const SELECTION_EXTENSION_URL=`chrome-extension://${SELECTION_EXTENSION_ID}/bridge.html`;
export class BrowserSelection {
 constructor(endpoint,open){this.endpoint=endpoint;this.tabs=new BrowserTabs(endpoint,open);this.owners=new Map();this.closedOwners=new WeakSet();}
 hidden(){
  const ids=[],urls=[];
  for(const entry of this.tabs.browsers.values()){ids.push(...entry.tabs.keys());urls.push(...entry.creating.keys());}
  return {ids,urls};
 }
 request(owner,args){
  if(args?.action==='targets')return Promise.resolve(this.hidden());
  if(args?.action!=='selected')throw Error('Unknown browser selection action');
  if(this.closedOwners.has(owner))throw Error('Browser selection turn ended');
  let entry=this.owners.get(owner);
  if(entry&&entry.endpoint!==this.endpoint())throw Error('Configured browser changed; reset before selected-tab lookup');
  if(!entry){
   let reject;entry={owner,endpoint:this.endpoint(),pending:new Set(),stopped:new Promise((_,no)=>{reject=no;})};entry.stopped.catch(()=>{});entry.reject=reject;this.owners.set(owner,entry);
   entry.wait=promise=>Promise.race([promise,entry.stopped]);
   entry.ready=this.initialize(entry);entry.ready.catch(()=>{});
  }
  const job=(async()=>{
   await entry.ready;if(entry.error)throw entry.error;
   const id=await this.bounded(entry,entry.page.evaluate(()=>globalThis.ocuSelectionBridge.selected()));
   if(id!==null&&(typeof id!=='string'||!id))throw Error('Invalid selected target identity');
   return id===entry.targetId?undefined:id??undefined;
  })();
  entry.pending.add(job);job.finally(()=>entry.pending.delete(job)).catch(()=>{});return job;
 }
 async bounded(entry,promise){let timer;try{return await Promise.race([entry.wait(promise),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Browser selection timed out')),10000);})]);}finally{clearTimeout(timer);}}
 async initialize(entry){
  try {
   const {targetId}=await this.tabs.request(entry.owner,{action:'create',visible:false});entry.targetId=targetId;
   if(entry.error)throw entry.error;
   const {chromium}=await import('playwright-core');
   entry.browser=await chromium.connectOverCDP(this.endpoint(),{timeout:10000,noDefaults:true});
   if(entry.error)throw entry.error;
   for(const context of entry.browser.contexts())context.on('dialog',()=>{});
   const {page}=await entry.wait(findBrowserPage(entry.browser,targetId));entry.page=page;
   try{await entry.wait(page.goto(SELECTION_EXTENSION_URL,{waitUntil:'load',timeout:10000}));}
   catch(error){if(entry.error)throw entry.error;throw Error(`Load the bundled Chrome selection extension (${SELECTION_EXTENSION_ID}) in this CDP browser: ${error.message}`);}
   const identity=await this.bounded(entry,page.evaluate(()=>({id:globalThis.chrome?.runtime?.id,protocol:globalThis.ocuSelectionBridge?.protocol})));
   if(identity.id!==SELECTION_EXTENSION_ID||identity.protocol!==1)throw Error('Chrome selection extension identity/protocol mismatch');
  }catch(error){
   try{await this.disconnect(entry);await this.tabs.end(entry.owner,{final:true});}
   catch(cleanupError){cleanupError.browserCleanupFailed=true;throw cleanupError;}
   throw error;
  }
 }
 disconnect(entry){return entry.disconnected??=(entry.browser?entry.browser.close():Promise.resolve());}
 cancel(owner){
  this.closedOwners.add(owner);const entry=this.owners.get(owner);
  if(entry){entry.error??=Error('Browser selection turn ended');entry.reject(entry.error);if(entry.browser){entry.disconnected??=entry.browser.close();entry.disconnected.catch(()=>{});}}
 }
 async cleanup(owner){
  this.cancel(owner);const entry=this.owners.get(owner);
  if(entry){
   await Promise.allSettled([entry.ready,...entry.pending]);
   try{await this.disconnect(entry);}catch{await entry.browser.close();}
   await this.tabs.end(owner,{final:true});this.owners.delete(owner);
  }
 }
}
