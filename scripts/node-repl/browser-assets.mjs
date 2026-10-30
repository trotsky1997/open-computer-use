import {randomUUID} from 'node:crypto';
import {mkdtemp,open,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {findBrowserPage} from './browser-playwright.mjs';

const kinds=['font','image','stylesheet','video'];
const styles=['background-image','border-image-source','list-style-image','mask-image','content','cursor'];
const resourceKinds={Font:'font',Image:'image',Stylesheet:'stylesheet',Media:'video',Script:'script'};
const check=state=>{if(state.closed)throw Error('Page assets session ended');};
export const ASSETS_DOCUMENTATION='pageAssets.list() inventories observed resources, DOM attributes, computed-style URLs and inline SVGs in the current rendered page. Load lazy content first and list again. bundle({inventoryId,kinds?,assetIds?}) exports image/font/stylesheet/video files to a temporary local directory with manifestPath, assets, failures and summary. Omit selectors for all supported files; selectors combine as a union. Only IDs in this session and tab inventory are accepted. Navigation invalidates inventories. Scripts/other resources and inline SVG markup are listed only. Completed directories survive turn cleanup; canceled exports are removed. Fetches use the browser and its credentials. Streaming media and unavailable bodies can produce per-file failures. Local/privileged URLs are excluded.';
function selection(options,inventory) {
 if(!options || typeof options!=='object' || Array.isArray(options) || Object.keys(options).some(key=>!['inventoryId','assetIds','kinds'].includes(key)))throw Error('Invalid page assets bundle options');
 for(const [key,allowed] of [['kinds',kinds],['assetIds',inventory.assets.map(asset=>asset.id)]]) {
  if(options[key]!==undefined && (!Array.isArray(options[key]) || !options[key].every(value=>typeof value==='string' && allowed.includes(value))))throw Error(`Invalid page assets ${key}`);
 }
 const explicit=options.assetIds!==undefined || options.kinds!==undefined;
 const assets=inventory.assets.filter(asset=>!explicit || options.assetIds?.includes(asset.id) || options.kinds?.includes(asset.kind));
 if(explicit && assets.some(asset=>!kinds.includes(asset.kind)))throw Error('Only font/image/stylesheet/video assets can be bundled');
 return assets.filter(asset=>kinds.includes(asset.kind));
}
export function cssUrls(value) {
 const urls=[];
 for(const match of value.matchAll(/url\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|((?:\\.|[^)\\])*?))\s*\)/giu)) {
  urls.push((match[1]??match[2]??match[3]).replace(/\\([\da-f]{1,6}\s?|\r\n|[\n\r\f]|.)/giu,(_,escape)=>{
   if(!/^[\da-f]/iu.test(escape))return /^[\r\n\f]/u.test(escape)?'':escape;
   const point=parseInt(escape.trim(),16);
   return String.fromCodePoint(!point||point>0x10ffff||(point>=0xd800&&point<=0xdfff)?0xfffd:point);
  }));
 }
 return urls;
}
export class BrowserAssets {
 constructor(endpoint=()=>process.env.OPEN_COMPUTER_USE_CDP_URL){this.endpoint=endpoint;this.owners=new Map();this.closedOwners=new WeakSet();}
 state(owner){if(this.closedOwners.has(owner))throw Error('Page assets session ended');let state=this.owners.get(owner);if(!state){state={inventories:new Map(),pending:new Set(),connections:new Set()};this.owners.set(owner,state);}return state;}
 request(owner,args) {
  const state=this.state(owner);
  if(!args || !['list','bundle'].includes(args.action)||typeof args.targetId!=='string'||!args.targetId)return Promise.reject(Error('Invalid page assets request'));
  const job=this.perform(state,args);state.pending.add(job);job.finally(()=>state.pending.delete(job)).catch(()=>{});return job;
 }
 async connect(state,targetId) {
  const {chromium}=await import('playwright-core');check(state);
  const browser=await chromium.connectOverCDP(this.endpoint(),{timeout:10000,noDefaults:true});state.connections.add(browser);
  try {
   check(state);const {page,session}=await findBrowserPage(browser,targetId);
   if(!['http:','https:','about:','data:','blob:'].includes(new URL(page.url()).protocol))throw Error('Page assets require a web page');
   for(const context of browser.contexts())context.on('dialog',()=>{});
   const sessions=[session];
   for(const frame of page.frames())if(frame!==page.mainFrame()) {
    try{sessions.push(await page.context().newCDPSession(frame));}catch(error){if(!/does not have a separate CDP session/iu.test(error.message))throw error;}
   }
   let navigated=false;
   const guard=()=>{check(state);if(navigated)throw Error('Page navigated during asset operation; list again');};
   const records=[];
   for(const session of sessions) {guard();session.on('Page.frameNavigated',()=>{navigated=true;});await bounded(session.send('Page.enable'),'Page.enable');const {frameTree}=await bounded(session.send('Page.getResourceTree'),'Page.getResourceTree');records.push({session:{send:(method,params)=>bounded(session.send(method,params),method)},frameTree});}
   guard();return {browser,page,records,guard};
  } catch(error){await browser.close();state.connections.delete(browser);throw error;}
 }
 async perform(state,args) {
  let saved,selected;
  if(args.action==='bundle') {saved=state.inventories.get(args.options?.inventoryId);if(!saved || saved.targetId!==args.targetId)throw Error('Unknown page assets inventory');selected=selection(args.options,saved.result);}
  const connection=await this.connect(state,args.targetId);
  let bundle;
  try {
   const identity=JSON.stringify(connection.records.map(({frameTree})=>frameIdentity(frameTree)));
   if(args.action==='list') {
    const {result,locations}=await this.inventory(state,connection);
    for(const record of connection.records){const {frameTree}=await record.session.send('Page.getResourceTree');record.frameTree=frameTree;}
    if(JSON.stringify(connection.records.map(({frameTree})=>frameIdentity(frameTree)))!==identity)throw Error('Page navigated during asset collection; list again');
    connection.guard();state.inventories.set(result.id,{targetId:args.targetId,identity,result:structuredClone(result),locations});return result;
   }
   if(identity!==saved.identity)throw Error('Page navigated; list assets again');
   bundle=await this.bundle(state,connection,selected,saved.locations);return bundle;
  } finally {
   try{await connection.browser.close();state.connections.delete(connection.browser);}
   catch(error){if(bundle)await rm(bundle.directoryPath,{recursive:true,force:true});throw error;}
   if(bundle){try{connection.guard();}catch(error){await rm(bundle.directoryPath,{recursive:true,force:true});throw error;}}
  }
 }
 async inventory(state,{page,records}) {
  const assets=new Map(),locations=new Map(),inlineSvgs=[],svgIds=new Set();
  const add=(raw,kind,source,base,frameId)=>{
   if(!raw.trim() || raw.startsWith('#'))return;
   let url;try{url=new URL(raw,base);if(!['http:','https:','data:','blob:'].includes(url.protocol))return;}catch{return;}
   url.hash='';const key=url.href;if(frameId && !locations.has(key))locations.set(key,frameId);let asset=assets.get(key);
   if(!asset){let name;try{name=decodeURIComponent(url.pathname.split('/').at(-1));}catch{}asset={id:randomUUID(),kind,name:name||kind,url:key,sources:[]};assets.set(key,asset);}
   if(asset.kind==='other' || (asset.kind==='script' && kinds.includes(kind)))asset.kind=kind;
   if(!asset.sources.some(item=>JSON.stringify(item)===JSON.stringify(source)))asset.sources.push(source);
  };
  for(const {session,frameTree} of records) {
   const resources=tree=>{for(const resource of tree.resources??[])add(resource.url,resourceKinds[resource.type]??'other',{kind:'resource'},tree.frame.url,tree.frame.id);for(const child of tree.childFrames??[])resources(child);};resources(frameTree);
   const snapshot=await session.send('DOMSnapshot.captureSnapshot',{computedStyles:styles,includeDOMRects:false,includePaintOrder:false});check(state);
   const string=index=>snapshot.strings[index]??'';
   for(const document of snapshot.documents) {
    const nodes=document.nodes,base=string(document.baseURL),names=nodes.nodeName.map(string);
    for(let index=0;index<names.length;index++) {
     const name=names[index].toLowerCase(),attrs=nodes.attributes[index]??[],attributes={};for(let i=0;i<attrs.length;i+=2)attributes[string(attrs[i])]=string(attrs[i+1]);
     const nodeId=nodes.backendNodeId[index];
     // shortcut: loaded resource records cover srcset; add candidate parsing for unloaded candidates.
     for(const property of ['src','href','xlink:href','poster'])if(attributes[property]) {
      let kind;
      if(name==='img'||name==='image'||(name==='input'&&attributes.type==='image')||property==='poster')kind='image';
      else if(name==='video'||name==='audio'||name==='source')kind='video';
      else if(name==='script')kind='script';
      else if(name==='link')kind=attributes.rel?.split(/\s/u).includes('stylesheet')?'stylesheet':({font:'font',image:'image',video:'video',style:'stylesheet',script:'script'}[attributes.as]??(/icon/iu.test(attributes.rel??'')?'image':undefined));
      if(kind)add(attributes[property],kind,{kind:'attribute',nodeId,property},base,string(document.frameId));
     }
     if(name==='svg' && !hasSvgAncestor(index,nodes.parentIndex,names)) {
      const key=`${string(document.frameId)}|${nodeId}`;
      if(!svgIds.has(key)){svgIds.add(key);const {outerHTML}=await session.send('DOM.getOuterHTML',{backendNodeId:nodeId});inlineSvgs.push({id:randomUUID(),markup:outerHTML,name:attributes.id||'svg'});}
     }
    }
    for(let index=0;index<document.layout.nodeIndex.length;index++)for(let property=0;property<styles.length;property++)for(const url of cssUrls(string(document.layout.styles[index]?.[property])))add(url,'image',{kind:'computedStyle',nodeId:nodes.backendNodeId[document.layout.nodeIndex[index]],property:styles[property]},base,string(document.frameId));
   }
  }
  const byKind={};for(const asset of assets.values())byKind[asset.kind]=(byKind[asset.kind]??0)+1;
  return {locations,result:{id:randomUUID(),pageUrl:page.url(),assets:[...assets.values()],inlineSvgs,summary:{byKind,inlineSvgCount:inlineSvgs.length,totalCount:assets.size}}};
 }
 async bundle(state,{records,guard},selected,locations) {
  const started=Date.now(),directoryPath=await mkdtemp(path.join(tmpdir(),'ocu-assets-')),assets=[],failures=[];
  try {
   for(const asset of selected) {
    guard();const name=asset.name.replace(/[^\p{L}\p{N}._-]/gu,'_').slice(0,100)||asset.kind,filePath=path.join(directoryPath,`${asset.id}-${name}`);
    let contentType=null;
    try {
     contentType=await this.download(state,asset,records,filePath,locations.get(asset.url),guard);
     guard();assets.push({...asset,path:filePath,contentType});
    }catch(error){guard();await rm(filePath,{force:true});failures.push({id:asset.id,name:asset.name,url:asset.url,contentType,reason:error.message});}
   }
   const manifestPath=path.join(directoryPath,'manifest.json'),result={assets,directoryPath,failures,manifestPath,summary:{downloadedCount:assets.length,elapsedMs:Date.now()-started,failedCount:failures.length,requestedCount:selected.length}};
   guard();await writeFile(manifestPath,JSON.stringify(result,null,2));guard();return result;
  }catch(error){await rm(directoryPath,{recursive:true,force:true});throw error;}
 }
 async download(state,asset,records,filePath,frameId,guard) {
  if(asset.url.startsWith('data:')) {
   const response=await fetch(asset.url);guard();await writeFile(filePath,Buffer.from(await response.arrayBuffer()));return response.headers.get('content-type');
  }
  const routes=records.flatMap(record=>flattenFrames(record.frameTree).map(tree=>({...record,tree})));
  const route=routes.find(({tree})=>tree.frame.id===frameId)??routes.find(({tree})=>tree.resources?.some(resource=>resource.url===asset.url))??routes[0];
  const {session,tree}=route;
  let stream,objectId,contentType=null;
  try {
   if(asset.url.startsWith('blob:')) {
    const {executionContextId}=await session.send('Page.createIsolatedWorld',{frameId:tree.frame.id,worldName:'ocu-page-assets'});
    const result=await session.send('Runtime.evaluate',{contextId:executionContextId,expression:`fetch(${JSON.stringify(asset.url)}).then(response=>response.blob())`,awaitPromise:true});
    objectId=result.result.objectId;
    if(result.exceptionDetails || !objectId)throw Error('Blob resource unavailable');
    contentType=(await session.send('Runtime.callFunctionOn',{objectId,functionDeclaration:'function(){return this.type}',returnByValue:true})).result.value||null;
    const {uuid}=await session.send('IO.resolveBlob',{objectId});stream=`blob:${uuid}`;
   }else {
    const {resource}=await session.send('Network.loadNetworkResource',{frameId:tree.frame.id,url:asset.url,options:{disableCache:false,includeCredentials:true}});
    stream=resource.stream;contentType=Object.entries(resource.headers??{}).find(([name])=>name.toLowerCase()==='content-type')?.[1]??null;
    if(!resource.success||!stream)throw Error(`Resource fetch failed: ${resource.httpStatusCode??resource.netErrorName??'no body'}`);
   }
   const file=await open(filePath,'wx');
   try {for(;;){guard();const chunk=await session.send('IO.read',{handle:stream,size:64*1024});await file.writeFile(chunk.base64Encoded?Buffer.from(chunk.data,'base64'):chunk.data);if(chunk.eof)break;}}finally{await file.close();}
   return contentType;
  } finally {
   try{if(stream)await session.send('IO.close',{handle:stream});}
   finally{if(objectId)await session.send('Runtime.releaseObject',{objectId});}
  }
 }
 cancel(owner){this.closedOwners.add(owner);const state=this.owners.get(owner);if(state)state.closed=true;}
 async cleanup(owner){
  this.cancel(owner);const state=this.owners.get(owner);
  if(state){
   await Promise.allSettled([...state.pending]);
   const results=await Promise.allSettled([...state.connections].map(async browser=>{await browser.close();state.connections.delete(browser);}));
   const failed=results.find(result=>result.status==='rejected');if(failed)throw failed.reason;
  }
  this.owners.delete(owner);
 }
}
function frameIdentity(tree){return [tree.frame.id,tree.frame.loaderId,tree.frame.url,(tree.childFrames??[]).map(frameIdentity)];}
function flattenFrames(tree){return [tree,...(tree.childFrames??[]).flatMap(flattenFrames)];}
function hasSvgAncestor(index,parents,names){for(let parent=parents[index];parent>=0;parent=parents[parent])if(names[parent].toLowerCase()==='svg')return true;return false;}

async function bounded(promise,label){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(`${label} timed out after 10000 ms`)),10000);})]);}finally{clearTimeout(timer);}}
