import {mkdtemp,open,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {BrowserAssets,bounded} from './browser-assets.mjs';
import {findBrowserPage} from './browser-playwright.mjs';

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
  if(!args||!['exportGsuite','exportYouTubeTranscript'].includes(args.action)||typeof args.targetId!=='string'||!args.targetId||Object.keys(args).some(key=>!['action','targetId','type'].includes(key))||args.action==='exportGsuite'&&!Object.values(formats).flat().includes(args.type)||args.action==='exportYouTubeTranscript'&&args.type!==undefined)return Promise.reject(Error('Invalid content export request'));
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
 async perform(state,args){
  const connection=await this.connect(state,args.targetId),source=connection.page.url();let directory,completed=false,filePath;
  const guard=connection.guard;
  try{
   const info=args.action==='exportGsuite'?gsuiteExport(source,args.type):youtubeVideo(source);
   guard();directory=await mkdtemp(path.join(tmpdir(),'ocu-content-'));filePath=path.join(directory,`${args.action==='exportGsuite'?'gsuite':'youtube'}-${info.id}.${args.type??'txt'}`);
   const records=connection.records.map(record=>({...record,session:{send:(method,params)=>{if(method!=='IO.close')guard();return bounded(state.wait(record.session.send(method,params)),method);}}}));
   const download=(url,file)=>this.download(state,{url},records,file,records[0].frameTree.frame.id,guard);
   if(args.action==='exportGsuite'){
    const contentType=await download(info.url,filePath);
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
