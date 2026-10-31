import {readHistory} from './history.mjs';
import {createManagement,privateTab} from './management.mjs';
const management=createManagement(chrome);let queue=Promise.resolve();const histories=new Map();
chrome.runtime.onMessage.addListener((message,_sender,reply)=>{if(message?.kind==='ocu:wake')reply({protocol:5});});
Object.defineProperty(globalThis,'ocuChromeBridge',{value:Object.freeze({protocol:5,
 cancel(id){const control=histories.get(id);if(control)control.canceled=true;},
 request(request){
  if(request.action==='history'){
   if(typeof request.id!=='string'||!request.id||request.id.length>100||histories.has(request.id))throw Error('Invalid history request identity');
   const control={canceled:false};histories.set(request.id,control);
   return readHistory(chrome,request.options,()=>{if(control.canceled)throw Error('History query canceled');}).finally(()=>histories.delete(request.id));
  }
  const job=queue.then(async()=>{
   if(request.action==='audit')return (await management).audit();
   if(request.action==='managementPlan')return (await management).plan(request.namespace,request.method,request.args);
   if(request.action==='management')return (await management).invoke(request.namespace,request.method,request.args,request.fingerprint);
   if(request.action==='userTabs'){
    const [before,targets,groups,windows]=await Promise.all([chrome.tabs.query({}),chrome.debugger.getTargets(),chrome.tabGroups.query({}),chrome.windows.getAll({})]);
    const normal=new Set(windows.filter(window=>['normal','popup'].includes(window.type)).map(window=>window.id));
    const after=await chrome.tabs.query({}),live=new Set(after.map(tab=>tab.id)),titles=new Map(groups.map(group=>[group.id,group.title]));
    return before.filter(tab=>live.has(tab.id)&&normal.has(tab.windowId)&&!privateTab(tab)).flatMap(tab=>{
     const current=after.find(value=>value.id===tab.id),matches=targets.filter(target=>target.tabId===tab.id&&target.type==='page');
     if(matches.length!==1||current.url!==tab.url)return [];
     return [{id:matches[0].id,providerTabId:String(tab.id),url:current.url,title:current.title,...(Number.isFinite(current.lastAccessed)?{lastOpened:new Date(current.lastAccessed).toISOString()}:{}),...(titles.get(current.groupId)?{tabGroup:titles.get(current.groupId)}:{})}];
    }).sort((a,b)=>(b.lastOpened??'').localeCompare(a.lastOpened??''));
   }
   if(request.action!=='selected')throw Error('Unsupported bridge request');
   const query={active:true,lastFocusedWindow:true},[before]=await chrome.tabs.query(query);
   if(!before||privateTab(before))return null;
   const targets=await chrome.debugger.getTargets(),[after]=await chrome.tabs.query(query);
   if(before.id!==after?.id)throw Error('Selected tab changed during observation; retry');
   const matches=targets.filter(target=>target.tabId===before.id&&target.type==='page');
   if(matches.length!==1)throw Error('Selected tab has no unique debugger target');
   return matches[0].id;
  });queue=job.catch(()=>{});return job;
 },
})});
