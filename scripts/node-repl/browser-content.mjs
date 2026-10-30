import {mkdtemp,open,readFile,writeFile,rm,rename} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {BrowserAssets,bounded} from './browser-assets.mjs';
import {findBrowserPage,resolveBrowserLocator,nativeBrowserFrame,nativeBrowserNode} from './browser-playwright.mjs';
import {validateLocatorPath,validateTimeoutOptions} from './browser-evaluate-dom.mjs';

const formats={document:['pdf','md','docx'],spreadsheets:['pdf','xlsx','csv'],presentation:['pdf','pptx']};
export function gsuiteExport(raw,type){
 const url=new URL(raw),match=url.pathname.match(/^(\/(document|spreadsheets|presentation)\/(?:u\/\d+\/)?d\/([\w-]+))(?:\/(?:edit|view|preview|present|mobilebasic|htmlview|copy))?\/?$/u);
 if(url.protocol!=='https:'||url.hostname!=='docs.google.com'||url.port||url.username||url.password||!match||!formats[match[2]].includes(type))throw Error('Unsupported Google Workspace URL or export format');
 const [,prefix,kind,id]=match;
 const output=new URL(`${prefix}/export${kind==='presentation'?`/${type}`:''}`,url.origin);
 if(kind!=='presentation')output.searchParams.set('format',type);
 for(const key of ['authuser','resourcekey'])if(url.searchParams.has(key))output.searchParams.set(key,url.searchParams.get(key));
 if(kind==='spreadsheets'&&type==='csv'){
  const gid=new URLSearchParams(url.hash.slice(1)).get('gid')??url.searchParams.get('gid');
  if(gid!==null){if(!/^\d+$/u.test(gid))throw Error('Invalid spreadsheet gid');output.searchParams.set('gid',gid);}
 }
 return {url:output.href,id,kind,type};
}
export function youtubeVideo(raw){
 const url=new URL(raw),id=url.searchParams.get('v');
 if(url.protocol!=='https:'||!['youtube.com','www.youtube.com'].includes(url.hostname)||url.port||url.username||url.password||url.pathname!=='/watch'||!id||!/^[\w-]{11}$/u.test(id)||url.searchParams.getAll('v').length!==1)throw Error('YouTube transcript requires an HTTPS youtube.com /watch?v=videoId tab');
 return {id,url:`https://www.youtube.com/watch?v=${id}`};
}
export function playerResponse(html,id){
 const marker=/\bytInitialPlayerResponse\s*=\s*\{/gu;let match,unavailable;
 while((match=marker.exec(html))){
  const start=marker.lastIndex-1;let depth=0,quoted=false,escaped=false;
  for(let i=start;i<html.length;i++){
   const c=html[i];
   if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
   if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}'&&!--depth){
    let value;try{value=JSON.parse(html.slice(start,i+1));}catch{break;}
    const status=value?.playabilityStatus?.status;
    const failed=typeof status==='string'&&status!=='OK'&&/^[A-Z_]{1,100}$/u.test(status)?status:undefined;
    if(failed)unavailable=failed;
    if(value?.videoDetails?.videoId===id){if(failed)break;return value;}break;
   }
  }
 }
 if(unavailable)throw Error(`YouTube video unavailable in this browser session (${unavailable}); check sign-in and access`);
 throw Error('No matching YouTube player response; check video access and captions');
}
export function captionTrack(response,id){
 const renderer=response.captions?.playerCaptionsTracklistRenderer,tracks=renderer?.captionTracks;
 if(!Array.isArray(tracks)||!tracks.length)throw Error('This video has no available caption track');
 const index=renderer.audioTracks?.[renderer.defaultAudioTrackIndex??0]?.defaultCaptionTrackIndex;
 const track=tracks[index]??tracks.find(track=>track&&track.kind!=='asr')??tracks[0];
 if(!track||typeof track.baseUrl!=='string')throw Error('Invalid YouTube caption track');
 const url=new URL(track.baseUrl);
 if(url.protocol!=='https:'||!['youtube.com','www.youtube.com'].includes(url.hostname)||url.port||url.username||url.password||url.pathname!=='/api/timedtext'||url.searchParams.get('v')!==id||url.searchParams.getAll('v').length!==1)throw Error('Caption URL does not match the requested YouTube video');
 url.searchParams.set('fmt','json3');return {url:url.href};
}
const timestamp=ms=>{const seconds=Math.floor(ms/1000),hours=Math.floor(seconds/3600);return `${hours?`${hours}:`:''}${String(Math.floor(seconds/60)%60).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;};
export function captionText(json){
 if(!Array.isArray(json?.events))throw Error('YouTube captions did not return transcript data');
 const lines=[];
 for(const event of json.events){
  if(!event||typeof event!=='object')throw Error('Invalid YouTube caption event');
  if(!event.segs)continue;
  if(!Number.isFinite(event.tStartMs)||event.tStartMs<0||!Array.isArray(event.segs)||event.segs.some(segment=>!segment||typeof segment.utf8!=='string'))throw Error('Invalid YouTube caption event');
  const text=event.segs.map(segment=>segment.utf8).join('').replace(/\s+/gu,' ').trim();
  if(text)lines.push(`[${timestamp(event.tStartMs)}] ${text}`);
 }
 if(!lines.length)throw Error('This video has no available transcript text');return lines.join('\n');
}
export async function verifyExport(filePath,type,contentType){
 const file=await open(filePath,'r');let head;
 try{const buffer=Buffer.alloc(512),result=await file.read(buffer,0,buffer.length,0);head=buffer.subarray(0,result.bytesRead);}finally{await file.close();}
 const mime=contentType?.split(';')[0].trim().toLowerCase();
 if(!head.length&&!['md','csv'].includes(type))throw Error('Empty Google Workspace export');
 if(mime==='text/html'||mime==='application/json')throw Error('Google returned a login/error page instead of the requested export');
 if(type==='pdf'&&!head.subarray(0,5).equals(Buffer.from('%PDF-'))||['docx','xlsx','pptx'].includes(type)&&!head.subarray(0,4).equals(Buffer.from([0x50,0x4b,3,4])))throw Error('Google Workspace export has an unexpected file signature');
 if(['md','csv'].includes(type)&&!['text/plain','text/markdown','text/csv','application/octet-stream'].includes(mime))throw Error('Google Workspace text export has an unexpected content type');
}

// Content and page assets share exact-target connections, credentialed Chrome streams and owner cleanup.
export class BrowserContent extends BrowserAssets {
 state(owner){
  const state=super.state(owner);
  if(!state.stopped){state.stopped=new Promise((_,reject)=>{state.stop=reject;});state.stopped.catch(()=>{});state.wait=promise=>Promise.race([promise,state.stopped]);}
  return state;
 }
 request(owner,args){
  if(args?.action==='downloadMedia')validateMediaRequest(args);
  else if(!args||!['exportGsuite','exportYouTubeTranscript'].includes(args.action)||typeof args.targetId!=='string'||!args.targetId||Object.keys(args).some(key=>!['action','targetId','type'].includes(key))||args.action==='exportGsuite'&&!Object.values(formats).flat().includes(args.type)||args.action==='exportYouTubeTranscript'&&args.type!==undefined)return Promise.reject(Error('Invalid content export request'));
  const state=this.state(owner),job=this.perform(state,args);state.pending.add(job);job.finally(()=>state.pending.delete(job)).catch(()=>{});return job;
 }
 async connect(state,targetId){
  const check=()=>{if(state.closed)throw Error('Content export session ended');};
  check();const {chromium}=await import('playwright-core');
  const browser=await chromium.connectOverCDP(this.endpoint(),{timeout:10000,noDefaults:true});state.connections.add(browser);
  try{
   check();for(const context of browser.contexts())context.on('dialog',()=>{});
   const {page,session}=await state.wait(findBrowserPage(browser,targetId)),source=page.url();let root,navigated=false;
   const guard=(disconnected=false)=>{check();if(navigated||(!disconnected&&page.isClosed())||page.url()!==source)throw Error('Page navigated or closed during content export');};
   session.on('Page.frameNavigated',({frame})=>{if(frame.id===root)navigated=true;});
   await bounded(state.wait(session.send('Page.enable')),'Page.enable');const {frameTree}=await bounded(state.wait(session.send('Page.getResourceTree')),'Page.getResourceTree');root=frameTree.frame.id;
   guard();return {browser,page,guard,records:[{frameTree,session}]};
  }catch(error){await browser.close();state.connections.delete(browser);throw error;}
 }
 cancel(owner){
  super.cancel(owner);
  const state=this.owners.get(owner);
  state?.stop(Error('Content export session ended'));
  for(const browser of state?.connections??[])void browser.close().catch(()=>{});
 }
 async media(state,args){
  let connection,directory,completed=false,closing=false,error,rejectStop,timer;
  const stopped=new Promise((_,reject)=>{rejectStop=reject;});stopped.catch(()=>{});
  const abort=reason=>{error??=Error(reason);rejectStop(error);if(connection)void connection.browser.close().catch(()=>{});};
  const operation={connections:state.connections,get closed(){return state.closed||!!error;},wait:promise=>state.wait(Promise.race([promise,stopped]))};
  const timeout=args.options?.timeoutMs??120000,deadline=timeout?Date.now()+timeout:null,remaining=()=>deadline===null?0:Math.max(1,deadline-Date.now());
  if(timeout)timer=setTimeout(()=>abort(`Media download timed out after ${timeout} ms`),timeout);
  try{
   connection=await this.connect(operation,args.targetId);const {page}=connection,root=connection.records[0].session;
   const {locator}=resolveBrowserLocator(page,args.path);
   if(typeof locator.elementHandle!=='function')throw Error('Media download requires an element locator');
   const handle=await operation.wait(locator.elementHandle({timeout:remaining()}));
   if(!handle||await operation.wait(locator.count())!==1)throw Error('Media locator must resolve to exactly one element');
   const frame=await operation.wait(handle.ownerFrame());if(!frame)throw Error('Media frame detached');
   const {session,frameId}=await nativeBrowserFrame(page,root,frame,operation.wait);
   const send=(method,params)=>{if(method!=='IO.close')guard();return operation.wait(session.send(method,params));};
   const guard=(disconnected=false)=>{if(error)throw error;connection.guard(disconnected);if(frame.isDetached())throw Error('Media frame detached');};
   await send('Page.enable');
   page.on('framenavigated',changed=>{if(changed===frame||changed===page.mainFrame())abort('Media frame navigated during download');});
   page.on('framedetached',detached=>{if(!closing&&detached===frame)abort('Media frame detached');});
   const {executionContextId}=await send('Page.createIsolatedWorld',{frameId,worldName:'ocu-media-reader'});
   const backendNodeId=await nativeBrowserNode(handle,operation.wait),group='ocu-media';
   const {object}=await send('DOM.resolveNode',{backendNodeId,executionContextId,objectGroup:group});
   const read=async()=>{const result=await send('Runtime.callFunctionOn',{objectId:object.objectId,functionDeclaration:readMediaSource.toString(),returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description??result.exceptionDetails.text);return result.result.value;};
   const media=await read();guard();
   directory=await mkdtemp(path.join(tmpdir(),'ocu-media-'));const temporary=path.join(directory,'download.partial');
   const {frameTree}=await send('Page.getResourceTree');
   const metadata=await this.download(operation,{url:media.url},[{session:{send},frameTree}],temporary,frameId,guard);
   guard();if(JSON.stringify(await read())!==JSON.stringify(media))throw Error('Media element/source changed during download');
   const filePath=path.join(directory,mediaFilename(media,metadata));await rename(temporary,filePath);guard();
   await send('Runtime.releaseObjectGroup',{objectGroup:group});guard();completed=true;return filePath;
  }catch(cause){if(error)throw error;if(/Target page, context or browser has been closed|Session (?:has been )?closed|Browser connection closed/iu.test(cause.message))throw Error('Media frame or browser connection closed during download',{cause});throw cause;}
  finally{
   clearTimeout(timer);
   try{if(connection){closing=true;await connection.browser.close();state.connections.delete(connection.browser);if(completed){if(error)throw error;connection.guard(true);}}}
   catch(cause){completed=false;throw cause;}
   finally{if(directory&&!completed)await rm(directory,{recursive:true,force:true});}
  }
 }
 async perform(state,args){
  if(args.action==='downloadMedia')return this.media(state,args);
  const connection=await this.connect(state,args.targetId),source=connection.page.url();let directory,completed=false,filePath;
  const guard=connection.guard;
  try{
   const info=args.action==='exportGsuite'?gsuiteExport(source,args.type):youtubeVideo(source);
   guard();directory=await mkdtemp(path.join(tmpdir(),'ocu-content-'));filePath=path.join(directory,`${args.action==='exportGsuite'?'gsuite':'youtube'}-${info.id}.${args.type??'txt'}`);
   const records=connection.records.map(record=>({...record,session:{send:(method,params)=>{if(method!=='IO.close')guard();return bounded(state.wait(record.session.send(method,params)),method);}}}));
   const download=(url,file)=>this.download(state,{url},records,file,records[0].frameTree.frame.id,guard);
   if(args.action==='exportGsuite'){
    const {contentType}=await download(info.url,filePath);
    guard();await verifyExport(filePath,args.type,contentType);
   }else{
    const segments=connection.page.locator(`ytd-watch-flexy[video-id="${info.id}"] ytd-transcript-renderer`).filter({visible:true}).locator('ytd-transcript-segment-renderer');
    let text;
    if(await state.wait(segments.count())){
     const lines=await state.wait(segments.allTextContents());guard();text=lines.map(line=>line.replace(/\s+/gu,' ').trim()).filter(Boolean).join('\n');
    }
    if(!text){
     const watch=path.join(directory,'watch.html');await download(info.url,watch);guard();
     const response=playerResponse(await readFile(watch,'utf8'),info.id),track=captionTrack(response,info.id),captions=path.join(directory,'captions.json');
     await download(track.url,captions);guard();
     let json;try{json=JSON.parse(await readFile(captions,'utf8'));}catch{throw Error('YouTube caption endpoint returned no usable transcript; open its transcript panel and try again');}
     text=captionText(json);await rm(watch);await rm(captions);
    }
    await writeFile(filePath,`YouTube transcript\nURL: ${info.url}\n\n${text}\n`,{flag:'wx',mode:0o600});
   }
   guard();completed=true;return filePath;
  }finally{
   // CDP disconnect closes Playwright page objects; retain owner/source checks after disconnect.
   try{await connection.browser.close();state.connections.delete(connection.browser);connection.guard(true);}
   catch(error){completed=false;throw error;}
   finally{if(directory&&!completed)await rm(directory,{recursive:true,force:true});}
  }
 }
}

export function validateMediaRequest(args){
 if(!args||args.action!=='downloadMedia'||typeof args.targetId!=='string'||!args.targetId||Object.keys(args).some(key=>!['action','targetId','path','options'].includes(key)))throw Error('Invalid media download request');
 validateLocatorPath(args.path);
 validateTimeoutOptions(args.options===undefined?{}:args.options);
}
function readMediaSource(){
 const get=(node,prototype,key)=>Object.getOwnPropertyDescriptor(prototype,key).get.call(node);
 if(!get(this,Node.prototype,'isConnected'))throw Error('Media element detached');
 if(get(this,Node.prototype,'ownerDocument')!==document)throw Error('Media element moved across documents');
 const attr=(node,name)=>Element.prototype.getAttribute.call(node,name),tag=get(this,Element.prototype,'localName');
 let node=this,url;
 if(tag==='picture'){node=Element.prototype.querySelector.call(this,'img');if(!node)throw Error('Picture has no image');}
 const kind=get(node,Element.prototype,'localName');
 if(kind==='img')url=get(node,HTMLImageElement.prototype,'currentSrc')||get(node,HTMLImageElement.prototype,'src');
 else if(kind==='video'||kind==='audio'){
  url=get(node,HTMLMediaElement.prototype,'currentSrc')||get(node,HTMLMediaElement.prototype,'src');
  if(!url){const source=Element.prototype.querySelector.call(node,'source[src]');if(source)url=get(source,HTMLSourceElement.prototype,'src');}
 }else if(kind==='a')url=get(node,HTMLAnchorElement.prototype,'href');
 else if(kind==='area')url=get(node,HTMLAreaElement.prototype,'href');
 else if(kind==='source')url=get(node,HTMLSourceElement.prototype,'src');
 else if(kind==='track')url=get(node,HTMLTrackElement.prototype,'src');
 else if(kind==='image')url=attr(node,'href')||attr(node,'xlink:href');
 else if(kind==='object')url=get(node,HTMLObjectElement.prototype,'data');
 else if(kind==='embed')url=get(node,HTMLEmbedElement.prototype,'src');
 else if(kind==='input'&&get(node,HTMLInputElement.prototype,'type')==='image')url=get(node,HTMLInputElement.prototype,'src');
 if(!url)throw Error('Matched element does not expose a downloadable URL');
 url=new URL(url,get(node,Node.prototype,'baseURI'));
 if(!['http:','https:','data:','blob:'].includes(url.protocol))throw Error('Unsupported media URL protocol');
 if(url.href.length>16*1024*1024)throw Error('Media URL exceeds the 16 MiB inline URL budget');
 return {url:url.href,download:attr(this,'download')??''};
}
const mediaExtensions={'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp','image/gif':'.gif','image/svg+xml':'.svg','video/mp4':'.mp4','video/webm':'.webm','audio/mpeg':'.mp3','audio/mp4':'.m4a','audio/wav':'.wav','audio/ogg':'.ogg','text/plain':'.txt','text/html':'.html','text/csv':'.csv','text/markdown':'.md','application/pdf':'.pdf','application/json':'.json','application/zip':'.zip','application/vnd.apple.mpegurl':'.m3u8','application/x-mpegurl':'.m3u8','application/dash+xml':'.mpd'};
export function mediaFilename(media,{headers={},contentType=null}){
 const disposition=String(Object.entries(headers).find(([key])=>key.toLowerCase()==='content-disposition')?.[1]??'');
 let name;const encoded=disposition.match(/(?:^|;)\s*filename\*\s*=\s*UTF-8'[^']*'([^;]*)/iu);
 if(encoded)try{name=decodeURIComponent(encoded[1].trim());}catch{}
 if(!name){const plain=disposition.match(/(?:^|;)\s*filename\s*=\s*(?:"((?:\\.|[^"\\])*)"|([^;]*))/iu);name=plain?.[1]?.replace(/\\(.)/gu,'$1')??plain?.[2]?.trim();}
 if(!name)name=media.download;
 if(!name&&/^https?:/u.test(media.url))try{name=decodeURIComponent(new URL(media.url).pathname.split('/').at(-1));}catch{}
 name=path.posix.basename((name||'media').replaceAll('\\','/')).replace(/[<>:"|?*\p{Cc}\p{Cf}]/gu,'_').trim().replace(/^\.+|[. ]+$/gu,'')||'media';
 const old=path.extname(name),mime=contentType?.split(';')[0].trim().toLowerCase(),extension=mediaExtensions[mime]??(/^\.[a-z0-9]{1,12}$/iu.test(old)?old:'.bin');
 let stem=(old?name.slice(0,-old.length):name).replace(/[. ]+$/gu,'')||'media';
 if(/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(stem.normalize('NFKC')))stem=`media-${stem}`;
 return [...stem].slice(0,50).join('')+extension;
}
