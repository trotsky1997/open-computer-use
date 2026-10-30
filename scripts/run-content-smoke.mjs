// Only use an owned disposable Chrome. Provider URLs below are routed fixture pages.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,rm,readdir,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {findBrowserPage} from './node-repl/browser-playwright.mjs';
import {WorkerJavaScriptSession,PersistentJavaScriptSession} from './node-repl/open-computer-use-repl.mjs';
const endpoint=process.env.OPEN_COMPUTER_USE_CDP_URL;
if(!endpoint)throw Error('Set OPEN_COMPUTER_USE_CDP_URL to owned disposable Chromium');
const zip=Buffer.from('UEsDBBQAAAAIAJAjX119j8M5SgAAAE0AAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbLMJqSxILVaoyM3JK7ZVyigpKbDS1y9OzkjNTSzWyy9IzQPKpOUX5SaWALlF6foFicnZiemp+kYGBmb6yfl5Jal5JbolIDOU9O0AUEsBAhQDFAAAAAgAkCNfXX2PwzlKAAAATQAAABMAAAAAAAAAAAAAAIABAAAAAFtDb250ZW50X1R5cGVzXS54bWxQSwUGAAAAAAEAAQBBAAAAewAAAAAA','base64');
const data={pdf:Buffer.from('%PDF-1.7\nOwned PDF export fixture\n%%EOF\n'),md:Buffer.from('# Owned Markdown\n\n你好\n'),csv:Buffer.from('Name,Value\nFixture,你好\n'),docx:zip,xlsx:zip,pptx:zip};
const mimes={pdf:'application/pdf',md:'text/markdown',csv:'text/csv',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation'};
const requests=[];let slowStarted,slowResponse;
const server=createServer((req,res)=>{
 const raw=new URL(req.url,'http://fixture').searchParams.get('url');if(!raw){res.setHeader('Content-Type','text/html');res.end('<title>Owned stream fixture</title>');return;}
 const url=new URL(raw);
 requests.push({url:url.href,cookie:req.headers.cookie});
 if(url.pathname.includes('/slow/')){res.setHeader('Content-Type','application/pdf');res.write('%PDF-1.7\n');slowResponse=res;slowStarted?.();return;}
 if(url.pathname.includes('/empty/')){res.setHeader('Content-Type',url.searchParams.get('format')==='md'?'text/markdown':'text/csv');res.end();return;}
 if(url.pathname.includes('/login/')){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Sign in</title>');return;}
 if(url.pathname.includes('/bad/')){res.setHeader('Content-Type','application/pdf');res.end('wrong file bytes');return;}
 if(url.hostname==='www.youtube.com'){
  if(url.pathname==='/watch'){
   const response={videoDetails:{videoId:url.searchParams.get('v')},captions:{playerCaptionsTracklistRenderer:{captionTracks:[{baseUrl:'https://www.youtube.com/api/timedtext?v=jNQXAC9IVRw&sig=owned-fixture',languageCode:'zh'}]}}};
   res.setHeader('Content-Type','text/html');res.end(`<script>var ytInitialPlayerResponse = ${JSON.stringify(response)};</script>`);return;
  }
  assert.equal(url.pathname,'/api/timedtext');assert.equal(url.searchParams.get('fmt'),'json3');
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({events:[{tStartMs:1000,segs:[{utf8:'你好 transcript'}]},{tStartMs:62000,segs:[{utf8:'Second line'}]}]}));return;
 }
 const type=url.searchParams.get('format')??url.pathname.split('/').at(-1);res.setHeader('Content-Type',mimes[type]);res.end(data[type]);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const fixture=`http://127.0.0.1:${server.address().port}/?url=`;
const browser=await chromium.connectOverCDP(endpoint,{noDefaults:true}),context=browser.contexts()[0];
await context.addCookies([{name:'content_fixture',value:'allowed',url:fixture}]);
const native={async request(){throw Error('native unused');}};
const directories=[],pages=[];
const transport=await context.newPage();pages.push(transport);await transport.goto(fixture.split('?')[0]);
const transportSession=await context.newCDPSession(transport),{targetInfo:transportTarget}=await transportSession.send('Target.getTargetInfo');await transportSession.detach();
async function run(session,code){const r=await session.run(code,30000);assert.equal(r.isError,false,r.content.at(-1).text);return JSON.parse(r.content.at(-1).text);}
const artifacts=async()=>new Set((await readdir(tmpdir())).filter(name=>name.startsWith('ocu-content-')));
async function fixtureTab(session,url){
 const page=await context.newPage();pages.push(page);
 await page.route(/^https:\/\/(?:docs\.google\.com|www\.youtube\.com)\//u,async route=>{
  if(route.request().url().includes('fixture=panel'))return route.fulfill({contentType:'text/html; charset=utf-8',body:'<ytd-watch-flexy video-id="jNQXAC9IVRw"><ytd-transcript-renderer><ytd-transcript-segment-renderer>00:01 Visible transcript 你好</ytd-transcript-segment-renderer></ytd-transcript-renderer></ytd-watch-flexy>'});
  return route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><title>Owned provider fixture</title><body>Fixture<iframe srcdoc="first"></iframe></body>'});
 });
 await page.goto(url);const s=await context.newCDPSession(page),{targetInfo}=await s.send('Target.getTargetInfo');await s.detach();
 await run(session,`var tab=await cua.getTab(${JSON.stringify(targetInfo.targetId)});await tab.markHandoff();nodeRepl.write(JSON.stringify(true));`);
 return page;
}
try{
 for(const Session of [WorkerJavaScriptSession,PersistentJavaScriptSession]){
  const session=new Session({native}),service=session.browserContent,download=service.download,connect=service.connect;
  // Native Network.loadNetworkResource bypasses Fetch interception. Redirect only this test's
  // transport seam to an owned HTTP frame/server; production validates exact provider URLs.
  // This keeps local fixture requests in their own origin without changing Chrome network permissions.
  service.connect=async function(...args){const c=await connect.apply(this,args);const {session}=await findBrowserPage(c.browser,transportTarget.targetId);const {frameTree}=await session.send('Page.getResourceTree');c.records=[{frameTree,session}];return c;};
  service.download=function(state,asset,...args){requests.push({mapped:asset.url});return download.call(this,state,{url:fixture+encodeURIComponent(asset.url)},...args);};

  try{
   for(const [kind,types] of [['document',['pdf','md','docx']],['spreadsheets',['pdf','xlsx','csv']],['presentation',['pdf','pptx']]]){
    await fixtureTab(session,`https://docs.google.com/${kind}/u/1/d/fixture_ID/edit?authuser=1#gid=25`);
    for(const type of types){
     const file=await run(session,`nodeRepl.write(JSON.stringify(await tab.content.exportGsuite(${JSON.stringify(type)})));`);directories.push(path.dirname(file));
     assert.deepEqual(await readFile(file),data[type]);assert.equal((await stat(file)).mode&0o777,0o600);
    }
   }
   for(const [kind,type] of [['spreadsheets','csv'],['document','md']]){
    await fixtureTab(session,`https://docs.google.com/${kind}/d/empty/edit`);
    const file=await run(session,`nodeRepl.write(JSON.stringify(await tab.content.exportGsuite(${JSON.stringify(type)})));`);directories.push(path.dirname(file));assert.equal((await stat(file)).size,0);
   }
   assert.ok(requests.some(r=>r.mapped?.includes('format=csv&authuser=1&gid=25')));
   await fixtureTab(session,'https://www.youtube.com/watch?v=jNQXAC9IVRw');
   const transcript=await run(session,`nodeRepl.write(JSON.stringify(await tab.content.exportYouTubeTranscript()));`);directories.push(path.dirname(transcript));
   assert.match(await readFile(transcript,'utf8'),/\[00:01\] 你好 transcript\n\[01:02\] Second line/u);
   assert.deepEqual((await readdir(path.dirname(transcript))),[path.basename(transcript)]);
   await fixtureTab(session,'https://www.youtube.com/watch?v=jNQXAC9IVRw&fixture=panel');
   const beforeRequests=requests.length;
   const panel=await run(session,`nodeRepl.write(JSON.stringify(await tab.content.exportYouTubeTranscript()));`);directories.push(path.dirname(panel));
   assert.match(await readFile(panel,'utf8'),/Visible transcript 你好/u);assert.equal(requests.length,beforeRequests);
   for(const id of ['login','bad']){
    await fixtureTab(session,`https://docs.google.com/document/d/${id}/edit`);const before=await artifacts();
    const failed=await session.run(`await tab.content.exportGsuite('pdf');`);assert.equal(failed.isError,true);assert.match(failed.content.at(-1).text,id==='login'?/login\/error/u:/signature/u);
    assert.deepEqual(await artifacts(),before);
   }
   const slow=await fixtureTab(session,'https://docs.google.com/document/d/slow/edit');let begun=new Promise(resolve=>{slowStarted=resolve;});await run(session,`var frameExport=tab.content.exportGsuite('pdf').then(file=>({file}),error=>({error:error.message}));nodeRepl.write(JSON.stringify(true));`);
   await begun;await slow.locator('iframe').evaluate(element=>{element.srcdoc='second';});await slow.frameLocator('iframe').getByText('second',{exact:true}).waitFor();slowResponse.end('%%EOF');
   const frameResult=await run(session,`nodeRepl.write(JSON.stringify(await frameExport));`);assert.ok(frameResult.file,frameResult.error);directories.push(path.dirname(frameResult.file));
   begun=new Promise(resolve=>{slowStarted=resolve;});const before=await artifacts();
   await run(session,`var transfer=tab.content.exportGsuite('pdf').then(()=>{throw Error('Unexpected success')},error=>error.message);nodeRepl.write(JSON.stringify(true));`);
   await begun;const pending=[...service.owners.values()].flatMap(state=>[...state.pending]);assert.equal(pending.length,1);const stopStarted=Date.now(),ending=session.endTurn();ending.catch(()=>{});await Promise.allSettled(pending);console.log(`${Session.name} content read canceled in ${Date.now()-stopStarted}ms`);assert.ok(Date.now()-stopStarted<2000,'Content read cancellation did not disconnect promptly');await ending;slowResponse.end();assert.equal(service.owners.size,0);assert.deepEqual(await artifacts(),before);
   await readFile(transcript);
   await run(session,`var tab=await cua.getTab(tab.id);nodeRepl.write(JSON.stringify(true));`);begun=new Promise(resolve=>{slowStarted=resolve;});
   await run(session,`var transfer=tab.content.exportGsuite('pdf').then(()=>{throw Error('Unexpected success')},error=>error.message);nodeRepl.write(JSON.stringify(true));`);
   await begun;await slow.goto('https://docs.google.com/document/d/changed/edit');slowResponse.end();
   assert.match(await run(session,`nodeRepl.write(JSON.stringify(await transfer));`),/navigated/u);assert.deepEqual(await artifacts(),before);
   await session.reset();assert.equal(service.owners.size,0);await readFile(transcript);
   console.log(`${Session.name} PASS all Workspace format routes, exact byte streams/private files, video-matched captions/rendered transcript, login/signature rejection, navigation, retained artifacts and immediate turn/reset cleanup`);
  }finally{service.download=download;service.connect=connect;slowResponse?.end();await session.close();}
 }
 const streamed=requests.filter(r=>r.url);assert.ok(streamed.length>0);assert.ok(streamed.every(r=>r.cookie?.includes('content_fixture=allowed')));
 console.log('Native Chrome credentialed fixture streams:',streamed.length);
}finally{
 for(const p of pages)await p.close();for(const directory of directories)await rm(directory,{recursive:true,force:true});
 await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
}
