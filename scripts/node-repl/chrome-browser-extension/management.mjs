import {validateManagement} from './policy.mjs';
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
const pick=(value,keys)=>Object.fromEntries(keys.filter(key=>value[key]!==undefined).map(key=>[key,value[key]]));
export const privateTab=tab=>[tab.url,tab.pendingUrl].some(url=>url?.startsWith(`chrome-extension://${chrome.runtime.id}/bridge.html`)||/^about:blank#ocu-bridge-/u.test(url??''));
const flatten=nodes=>nodes.flatMap(({children,...node})=>[node,...flatten(children??[])]);
function ordinary(window){if(window.type!=='normal'||window.incognito)throw Error('Management changes require a normal non-incognito window');}
export async function createManagement(chrome){
 const stored=await chrome.storage.session.get('ocuAudit');let changes=stored.ocuAudit??[];
 async function persist(){await chrome.storage.session.set({ocuAudit:changes});}
 async function normalWindow(id){const window=await chrome.windows.get(id);ordinary(window);return window;}
 async function mutableGroup(id){const group=await chrome.tabGroups.get(id);if(group.shared!==false)throw Error('Shared or unverified tab group changes are unavailable');return group;}
 async function mutableTabs(ids){const tabs=await Promise.all((Array.isArray(ids)?ids:[ids]).map(id=>chrome.tabs.get(id)));for(const tab of tabs){if(privateTab(tab))throw Error('Private bridge tabs cannot be managed');await normalWindow(tab.windowId);if(tab.groupId!==-1)await mutableGroup(tab.groupId);}return tabs;}
 async function movableWindows(ids){for(const id of new Set(ids)){const window=await normalWindow(id);const groups=await chrome.tabGroups.query({windowId:window.id});if(groups.some(group=>group.shared!==false))throw Error('Tab moves are unavailable in windows with shared or unverified groups');}}
 async function before(namespace,method,args){
  if(namespace==='bookmarks'){
   let nodes=[];
   if(method!=='create')nodes=flatten(await chrome.bookmarks.getSubTree(args[0]));
   else if(args[0].parentId)nodes=await chrome.bookmarks.get(args[0].parentId);
   return {bookmarks:nodes.map(node=>pick(node,['id','index','parentId','title','url']))};
  }
  const [tabs,groups,windows]=await Promise.all([chrome.tabs.query({}),chrome.tabGroups.query({}),chrome.windows.getAll({})]);
  return {tabLayout:{tabs:tabs.filter(tab=>!privateTab(tab)).map(tab=>pick(tab,['autoDiscardable','groupId','id','index','pinned','url','windowId'])),groups:groups.map(group=>pick(group,['collapsed','color','id','title','windowId']))},windows:windows.map(window=>pick(window,['focused','height','id','left','state','top','width']))};
 }
 async function guard(namespace,method,args){
  if(namespace==='windows'){
   if(method==='update')await normalWindow(args[0]);
   else if(args[0]?.tabId!==undefined){const [tab]=await mutableTabs(args[0].tabId);if(tab.pinned)throw Error('Move an unpinned tab into a new window');await movableWindows([tab.windowId]);}
  }else if(namespace==='tabs'){
   if(method==='group'){
    const options=args[0],tabs=await mutableTabs(options.tabIds),windowId=tabs[0].windowId;
    if(tabs.some(tab=>tab.windowId!==windowId))throw Error('Group tabs within their current window');
    if(options.createProperties?.windowId!==undefined&&(await normalWindow(options.createProperties.windowId)).id!==windowId)throw Error('Group window must match its tabs');
    if(options.groupId!==undefined&&(await mutableGroup(options.groupId)).windowId!==windowId)throw Error('Move tabs explicitly before joining another window group');
   }else {
    const tabs=await mutableTabs(args[0]);
    if(method==='move')await movableWindows([...tabs.map(tab=>tab.windowId),...(args[1].windowId!==undefined?[args[1].windowId]:[])]);
   }
  }else if(namespace==='tabGroups'){
   const group=await mutableGroup(args[0]);await normalWindow(group.windowId);
   if(method==='move')await movableWindows([group.windowId,...(args[1].windowId!==undefined?[args[1].windowId]:[])]);
  }
 }
 return {
  async audit(){return {changes:[...changes].reverse()};},
  async invoke(namespace,method,args){
   const mutation=validateManagement(namespace,method,args);
   if(!mutation){
    const result=await chrome[namespace][method](...args);
    if(namespace==='tabs'){if(method==='query')return result.filter(tab=>!privateTab(tab));if(privateTab(result))throw Error('Private bridge tabs are unavailable');}
    if(namespace==='windows'){
     const tabs=await chrome.tabs.query({});
     const visible=window=>!tabs.some(tab=>tab.windowId===window.id)||tabs.some(tab=>tab.windowId===window.id&&!privateTab(tab));
     const filter=window=>({...window,...(window.tabs?{tabs:window.tabs.filter(tab=>!privateTab(tab))}:{})});
     if(Array.isArray(result))return result.filter(visible).map(filter);
     if(!visible(result))throw Error('Private bridge window is unavailable');return filter(result);
    }
    return result;
   }
   await guard(namespace,method,args);
   const change={createdAt:Date.now(),namespace,method,args,before:await before(namespace,method,args)};
   if(bytes(change)>6*1024*1024)throw Error('Management before-state exceeds the audit budget');
   const previous=changes;changes=[...changes,change];while(changes.length>100||bytes(changes)>6*1024*1024)changes.shift();
   try{await persist();}catch(error){changes=previous;throw error;}
   try{
    const result=await chrome[namespace][method](...args);
    if(typeof result==='number')change.result=result;else if(result&&typeof result.id==='number')change.result=result.id;else if(result&&typeof result.id==='string')change.result={id:result.id};
    await persist();return result;
   }catch(error){change.error=String(error.message).slice(0,1000);await persist();throw error;}
  },
 };
}
