// Use only an owned disposable Chrome profile. This script serves all of its own fixtures.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,rm,stat,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {WorkerJavaScriptSession,PersistentJavaScriptSession} from './node-repl/open-computer-use-repl.mjs';
const endpoint=process.env.OPEN_COMPUTER_USE_CDP_URL;if(!endpoint)throw Error('Set OPEN_COMPUTER_USE_CDP_URL to owned disposable Chromium');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlAAAAABJRU5ErkJggg==','base64');
const large='<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="blue"/></svg>';
const pending=new Map(),begun=new Map(),requests=[];
const server=createServer((req,res)=>{
 res.setHeader('Cache-Control','no-store');const url=new URL(req.url,'http://fixture');requests.push(url.pathname);
 if(url.pathname==='/file'){if(!req.headers.cookie?.includes('media=allowed')){res.writeHead(403);res.end('missing cookie');return;}res.setHeader('Content-Type','text/plain');res.setHeader('Content-Disposition',`attachment; filename="fallback.txt"; filename*=UTF-8''%E4%BD%A0%E5%A5%BD.txt`);res.end('Owned credentialed file 你好');return;}
 if(url.pathname==='/image.png'){res.setHeader('Content-Type','image/png');res.end(png);return;}
 if(url.pathname==='/large.svg'){res.setHeader('Content-Type','image/svg+xml');res.end(large);return;}
 if(url.pathname==='/audio.mp3'){res.setHeader('Content-Type','audio/mpeg');res.end('Owned audio resource');return;}
 if(url.pathname==='/video.mp4'){res.setHeader('Content-Type','video/mp4');res.end('Owned video resource');return;}
 if(url.pathname==='/captions.vtt'){res.setHeader('Content-Type','text/vtt');res.end('WEBVTT\n\n00:00.000 --> 00:01.000\nOwned caption\n');return;}
 if(url.pathname==='/missing'){res.writeHead(404);res.end();return;}
 if(url.pathname==='/frame-file'){res.setHeader('Content-Type','text/plain');res.end(`frame ${url.searchParams.get('name')}`);return;}
 if(url.pathname==='/slow'){
  const key=url.searchParams.get('id');res.setHeader('Content-Type','application/octet-stream');res.write('Held media fixture\n');pending.set(key,res);begun.get(key)?.();return;
 }
 res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Set-Cookie','media=allowed; Path=/; SameSite=Lax');
 if(url.pathname==='/nested'){res.end(`<a id="nested">Nested blob</a><script>nested.href=URL.createObjectURL(new Blob(['nested '+parent.name],{type:'text/plain'}));nested.download='nested.txt';</script>`);return;}
 if(url.pathname==='/frame'){res.end(`<a id="frame">Frame file</a><a id="frame-slow">Slow frame file</a><iframe id="nested-frame" src="/nested"></iframe><script>frame.href='/frame-file?name='+window.name;document.getElementById('frame-slow').href='/slow?id=frame';</script>`);return;}
 res.end(`<!doctype html><meta charset="utf-8"><title>Owned media fixture</title>
 <section id="downloads"><a id="file" href="/file" download="attribute.txt">File fixture</a></section>
 <a href="/file"><img id="image" src="/image.png" alt="Linked image"></a>
 <picture id="picture"><source srcset="/image.png 10w, /large.svg 2000w" sizes="1000px"><img id="responsive" src="/image.png" alt="Responsive image"></picture>
 <img id="spoof" src="/image.png" alt="Spoof fixture"><img id="data" src="data:image/png;base64,${png.toString('base64')}" alt="Data image">
 <a id="blob">Blob file</a><audio id="audio" preload="none" src="/audio.mp3"></audio><video id="video" preload="none"><source src="/video.mp4"><track id="track" src="/captions.vtt"></video>
 <a id="slow" href="/slow?id=main">Slow file</a><a id="timeout" href="/slow?id=timeout">Deadline file</a><a id="keep" href="/slow?id=keep">Kept file</a><a id="cancel" href="/slow?id=cancel">Canceled file</a>
 <a id="bad" href="/missing">Missing file</a><a id="js" href="javascript:document.body.setAttribute('data-executed','yes')">Unsafe URL</a><a id="local" href="file:///private/never-read">Local URL</a><div id="plain">Non-media</div>
 <iframe id="first" name="first" src="http://localhost:${server.address().port}/frame"></iframe><iframe id="second" name="second" src="http://localhost:${server.address().port}/frame"></iframe>
 <script>blob.href=URL.createObjectURL(new Blob(['Owned blob 你好'],{type:'text/plain'}));blob.download='blob.txt';Object.defineProperty(HTMLImageElement.prototype,'currentSrc',{get(){return '/wrong-source'}});Object.defineProperty(document.querySelector('#spoof'),'src',{get(){return '/wrong-source'}});</script>`);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}/`;
const native={async request(){throw Error('native unused');}},directories=[];
async function run(session,code,timeout=30000){const r=await session.run(code,timeout);assert.equal(r.isError,false,r.content.at(-1).text);return JSON.parse(r.content.at(-1).text);}
async function failure(session,code,pattern){const r=await session.run(code);assert.equal(r.isError,true);assert.match(r.content.at(-1).text,pattern);}
async function saved(session,expression,expected){const file=await run(session,`nodeRepl.write(JSON.stringify(await ${expression}));`);directories.push(path.dirname(file));assert.deepEqual(await readFile(file),Buffer.isBuffer(expected)?expected:Buffer.from(expected));assert.equal((await stat(file)).mode&0o777,0o600);assert.deepEqual(await readdir(path.dirname(file)),[path.basename(file)]);return file;}
function start(key){return new Promise(resolve=>{begun.set(key,resolve);});}
const artifacts=async()=>new Set((await readdir(tmpdir())).filter(name=>name.startsWith('ocu-media-')));
try{
 for(const Session of [WorkerJavaScriptSession,PersistentJavaScriptSession]){
  const session=new Session({native});
  try{
   await run(session,`var tab=await cua.createBrowserTab('cdp',${JSON.stringify(url)},{visible:false});await tab.markHandoff();await tab.playwright.frameLocator('#second').frameLocator('#nested-frame').locator('#nested').waitFor();nodeRepl.write(JSON.stringify(true));`);
   await failure(session,`await tab.playwright.locator('#file').downloadMedia({extra:true});`,/timeoutMs/u);assert.equal(session.browserContent.owners.size,0);
   const file=await saved(session,`tab.playwright.getByRole('link',{name:/file fixture/i}).and(tab.playwright.locator('#file')).downloadMedia()`,'Owned credentialed file 你好');assert.equal(path.basename(file),'你好.txt');
   await saved(session,`tab.playwright.locator('#image').downloadMedia()`,png);
   await saved(session,`tab.playwright.locator('#picture').downloadMedia()`,large);
   await saved(session,`tab.playwright.locator('#spoof').downloadMedia()`,png);assert.ok(!requests.includes('/wrong-source'));
   await saved(session,`tab.playwright.locator('#data').downloadMedia()`,png);
   await saved(session,`tab.playwright.locator('#blob').downloadMedia()`,'Owned blob 你好');
   await saved(session,`tab.playwright.locator('#audio').downloadMedia()`,'Owned audio resource');
   await saved(session,`tab.playwright.locator('#video').downloadMedia()`,'Owned video resource');
   await saved(session,`tab.playwright.locator('#track').downloadMedia()`,'WEBVTT\n\n00:00.000 --> 00:01.000\nOwned caption\n');
   await saved(session,`tab.playwright.frameLocator('#second').getByRole('link',{name:'Frame file',exact:true}).downloadMedia()`,'frame second');
   await saved(session,`tab.playwright.frameLocator('#second').frameLocator('#nested-frame').getByRole('link',{name:'Nested blob',exact:true}).downloadMedia()`,'nested second');
   const before=await artifacts();
   for(const [selector,pattern] of [['#plain',/downloadable URL/u],['#bad',/404/u],['#js',/protocol/u],['#local',/protocol/u]])await failure(session,`await tab.playwright.locator(${JSON.stringify(selector)}).downloadMedia();`,pattern);
   await failure(session,`await tab.playwright.getByRole('img').downloadMedia();`,/strict mode|exactly one/u);
   await failure(session,`await tab.playwright.locator('#absent').downloadMedia({timeoutMs:100});`,/timed out|Timeout/u);assert.deepEqual(await artifacts(),before);
   assert.equal(await run(session,`nodeRepl.write(JSON.stringify(await tab.playwright.locator('body').getAttribute('data-executed')));`),null);
   let started=start('main');
   await run(session,`var mainDownload=tab.playwright.locator('#slow').downloadMedia().then(file=>({file}),error=>({error:error.message}));var cdp=await tab.capabilities.get('cdp');nodeRepl.write(JSON.stringify(true));`);
   await started;
   await run(session,`await cdp.send('Runtime.evaluate',{expression:"document.querySelector('#first').src='/frame?unrelated=1'"});nodeRepl.write(JSON.stringify(true));`);
   if(Session===WorkerJavaScriptSession)await new Promise(resolve=>setTimeout(resolve,11000));
   pending.get('main').end('end');
   const main=await run(session,`nodeRepl.write(JSON.stringify(await mainDownload));`);assert.ok(main.file,main.error);directories.push(path.dirname(main.file));assert.equal(await readFile(main.file,'utf8'),'Held media fixture\nend');
   const beforeStale=await artifacts();started=start('main');await run(session,`var stale=tab.playwright.locator('#slow').downloadMedia().then(()=>({ok:true}),error=>({error:error.message}));nodeRepl.write(JSON.stringify(true));`);await started;
   await run(session,`await cdp.send('Runtime.evaluate',{expression:"document.querySelector('#slow').replaceWith(document.querySelector('#slow').cloneNode(true))"});nodeRepl.write(JSON.stringify(true));`);pending.get('main').end();
   assert.match((await run(session,`nodeRepl.write(JSON.stringify(await stale));`)).error,/detached|source changed/u);assert.deepEqual(await artifacts(),beforeStale);
   started=start('main');await run(session,`var adopted=tab.playwright.locator('#slow').downloadMedia().then(()=>({ok:true}),error=>({error:error.message}));nodeRepl.write(JSON.stringify(true));`);await started;
   await run(session,`await cdp.send('Runtime.evaluate',{expression:"const target=document.querySelector('#slow');const child=document.querySelector('#first').contentDocument;child.body.append(child.adoptNode(target));"});nodeRepl.write(JSON.stringify(true));`);pending.get('main').end();
   assert.match((await run(session,`nodeRepl.write(JSON.stringify(await adopted));`)).error,/across documents|different document|context.*destroyed/iu);assert.deepEqual(await artifacts(),beforeStale);
   const timeoutStarted=start('timeout'),keepStarted=start('keep');
   await run(session,`var timed=tab.playwright.locator('#timeout').downloadMedia({timeoutMs:1500}).then(()=>({ok:true}),error=>({error:error.message}));var kept=tab.playwright.locator('#keep').downloadMedia({timeoutMs:0});nodeRepl.write(JSON.stringify(true));`);
   await Promise.all([timeoutStarted,keepStarted]);assert.match((await run(session,`nodeRepl.write(JSON.stringify(await timed));`)).error,/timed out/u);pending.get('timeout').end();pending.get('keep').end('sibling');
   const kept=await run(session,`nodeRepl.write(JSON.stringify(await kept));`);directories.push(path.dirname(kept));assert.equal(await readFile(kept,'utf8'),'Held media fixture\nsibling');
   const beforeFrame=await artifacts();started=start('frame');await run(session,`var moving=tab.playwright.frameLocator('#second').getByRole('link',{name:'Slow frame file',exact:true}).downloadMedia().then(()=>({ok:true}),error=>({error:error.message}));nodeRepl.write(JSON.stringify(true));`);await started;
   await run(session,`await cdp.send('Runtime.evaluate',{expression:"document.querySelector('#second').src='/frame?new-document=1'"});nodeRepl.write(JSON.stringify(true));`);
   assert.match((await run(session,`nodeRepl.write(JSON.stringify(await moving));`)).error,/Media frame.*(?:navigated|detached|connection closed)/iu);pending.get('frame').end();assert.deepEqual(await artifacts(),beforeFrame);
   const retained=await artifacts();started=start('cancel');await run(session,`var canceled=tab.playwright.locator('#cancel').downloadMedia({timeoutMs:0}).catch(()=>{});nodeRepl.write(JSON.stringify(true));`);await started;
   const jobs=[...session.browserContent.owners.values()].flatMap(state=>[...state.pending]);assert.equal(jobs.length,1);const stop=Date.now(),ending=session.endTurn();ending.catch(()=>{});await Promise.allSettled(jobs);assert.ok(Date.now()-stop<2000,'Media cancellation did not stop promptly');await ending;pending.get('cancel').end();assert.equal(session.browserContent.owners.size,0);assert.deepEqual(await artifacts(),retained);await readFile(file);
   await session.reset();assert.equal(session.browserContent.owners.size,0);await readFile(file);
   console.log(`${Session.name} PASS credentialed HTTP, server Unicode filenames, selected responsive media, native getters, data/blob/audio/video, exact OOP/nested/same-URL frames, strictness, failures, deadlines/sibling isolation, source changes, frame navigation and turn/reset cleanup${Session===WorkerJavaScriptSession?', >10s default download':''}`);
  }finally{for(const response of pending.values())response.end();await session.close();}
 }
}finally{for(const directory of directories)await rm(directory,{recursive:true,force:true});server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
