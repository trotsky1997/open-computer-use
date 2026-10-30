import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,rm,readdir} from 'node:fs/promises';
import {WorkerJavaScriptSession,PersistentJavaScriptSession} from './node-repl/open-computer-use-repl.mjs';
import {tmpdir} from 'node:os';
import {withConnection} from './node-repl/browser-cdp.mjs';
const endpoint=process.env.OPEN_COMPUTER_USE_CDP_URL;
if(!endpoint)throw Error('Set OPEN_COMPUTER_USE_CDP_URL to disposable Chrome');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlAAAAABJRU5ErkJggg==','base64');
let slowResponse,slowStarted;
const server=createServer((req,res)=>{
 if(req.url?.startsWith('/private') && !req.headers.cookie?.includes('asset=allowed')){res.writeHead(403);res.end('missing cookie');return;}
 if(req.url?.endsWith('.png')){res.setHeader('Content-Type','image/png');res.end(png);return;}
 if(req.url?.startsWith('/slow')){slowResponse=res;res.setHeader('Content-Type','video/webm');res.write(Buffer.alloc(65536));slowStarted?.();return;}
 if(req.url==='/missing'){res.writeHead(404);res.end();return;}
 if(req.url==='/fixture.woff2'){res.setHeader('Content-Type','font/woff2');res.end('font asset bytes');return;}
 if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');res.end('body{background-image:url("/background.png")}');return;}
 if(req.url==='/script.js'){res.setHeader('Content-Type','text/javascript');res.end('console.log("asset fixture")');return;}
 if(req.url==='/child'){res.setHeader('Content-Type','text/html');res.end('<video preload="none" src="/child-cold.png"></video><img src="/child.png"><svg id="child-svg"><path d="M0 0"/></svg>');return;}
 res.setHeader('Content-Type','text/html');res.setHeader('Set-Cookie','asset=allowed; Path=/; SameSite=Lax');
 res.end(`<!doctype html><title>asset fixture</title><link rel="stylesheet" href="/style.css"><link rel="preload" as="font" href="/fixture.woff2" crossorigin><script src="/script.js"></script><script>addEventListener('DOMContentLoaded',()=>{const image=document.createElement('img');image.src=URL.createObjectURL(new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>'],{type:'image/svg+xml'}));document.body.append(image);});</script><img src="/private.png"><video preload="none" src="/private-cold.png"></video><img src="/missing"><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E"><svg id="root-svg"><svg><path d="M0 0"/></svg></svg><iframe src="http://localhost:${server.address().port}/child"></iframe>`);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}/`;
const native={async request(){throw Error('Native unused');}};
async function run(session,code){const result=await session.run(code,30000);assert.equal(result.isError,false,result.content.at(-1).text);return JSON.parse(result.content.at(-1).text);}
try {
 for(const Session of [WorkerJavaScriptSession,PersistentJavaScriptSession]) {
  const session=new Session({native});let id;const directories=[];
  try {
   id=await run(session,`var tab=await cua.createBrowserTab('cdp',${JSON.stringify(url)},{visible:false});await tab.markHandoff();await tab.playwright.waitForURL(${JSON.stringify(url)});await tab.playwright.frameLocator('iframe').locator('svg').waitFor();var assets=await tab.capabilities.get('pageAssets');nodeRepl.write(JSON.stringify(tab.id));`);
   const inventory=await run(session,`var inventory=await assets.list();nodeRepl.write(JSON.stringify(inventory));`);
   for(const suffix of ['/private.png','/child.png','/background.png','/style.css','/script.js'])assert.ok(inventory.assets.some(asset=>asset.url.endsWith(suffix)),suffix);
   assert.equal(inventory.inlineSvgs.length,2);
   assert.ok(inventory.assets.find(asset=>asset.url.endsWith('/background.png')).sources.some(source=>source.kind==='computedStyle'));
   const bundle=await run(session,`var bundle=await assets.bundle({inventoryId:inventory.id,kinds:['image','stylesheet','video']});nodeRepl.write(JSON.stringify(bundle));`);
   directories.push(bundle.directoryPath);assert.equal(bundle.failures.length,1,JSON.stringify(bundle.failures));assert.match(bundle.failures[0].url,/missing$/u);
   assert.deepEqual(await readFile(bundle.assets.find(asset=>asset.url.endsWith('/private.png')).path),png);
   assert.equal(JSON.parse(await readFile(bundle.manifestPath,'utf8')).assets.length,bundle.assets.length);
   assert.ok(bundle.assets.some(asset=>asset.url.startsWith('data:')));
   assert.ok(bundle.assets.some(asset=>asset.url.startsWith('blob:')));
   assert.deepEqual(await readFile(bundle.assets.find(asset=>asset.url.endsWith('/child-cold.png')).path),png);
   assert.deepEqual(await readFile(bundle.assets.find(asset=>asset.url.endsWith('/private-cold.png')).path),png);
   const union=await run(session,`nodeRepl.write(JSON.stringify(await assets.bundle({inventoryId:inventory.id,kinds:['font'],assetIds:[inventory.assets.find(asset=>asset.url.endsWith('/private.png')).id]})));`);
   directories.push(union.directoryPath);assert.equal(union.assets.length,2);assert.equal(union.failures.length,0);
   assert.equal(await readFile(union.assets.find(asset=>asset.kind==='font').path,'utf8'),'font asset bytes');
   const all=await run(session,`nodeRepl.write(JSON.stringify(await assets.bundle({inventoryId:inventory.id})));`);
   directories.push(all.directoryPath);assert.equal(all.summary.requestedCount,inventory.assets.filter(asset=>['font','image','stylesheet','video'].includes(asset.kind)).length);
   const isolated=await run(session,`var mutableInventory=await assets.list();var mutableAsset=mutableInventory.assets.find(asset=>asset.url.endsWith('/private.png'));var mutableId=mutableAsset.id;mutableAsset.url='file:///unavailable-local-file';nodeRepl.write(JSON.stringify(await assets.bundle({inventoryId:mutableInventory.id,assetIds:[mutableId]})));`);
   directories.push(isolated.directoryPath);assert.equal(isolated.failures.length,0);assert.match(isolated.assets[0].url,/private.png$/u);
   const invalid=await session.run(`await assets.bundle({inventoryId:inventory.id,assetIds:['made-up']});`);assert.equal(invalid.isError,true);
   const script=await session.run(`await assets.bundle({inventoryId:inventory.id,assetIds:[inventory.assets.find(asset=>asset.kind==='script').id]});`);assert.equal(script.isError,true);
   await run(session,`await tab.goto(${JSON.stringify(url+'?changed')});await tab.playwright.waitForURL(${JSON.stringify(url+'?changed')});nodeRepl.write(JSON.stringify(true));`);
   const stale=await session.run(`await assets.bundle({inventoryId:inventory.id});`);assert.equal(stale.isError,true);assert.match(stale.content.at(-1).text,/navigated/);
   const before=new Set((await readdir(tmpdir())).filter(name=>name.startsWith('ocu-assets-')));
   const begun=new Promise(resolve=>{slowStarted=resolve;});
   const addSlow=`document.body.insertAdjacentHTML('beforeend','<video preload="none" src="/slow"></video>')`;
   await run(session,`var cdp=await tab.capabilities.get('cdp');await cdp.send('Runtime.evaluate',{expression:${JSON.stringify(addSlow)}});var cancelInventory=await assets.list();void assets.bundle({inventoryId:cancelInventory.id,assetIds:[cancelInventory.assets.find(asset=>asset.url.endsWith('/slow')).id]}).catch(()=>{});nodeRepl.write(JSON.stringify(true));`);
   await begun;const ending=session.endTurn();setTimeout(()=>slowResponse.end(),150);await ending;
   assert.deepEqual((await readdir(tmpdir())).filter(name=>name.startsWith('ocu-assets-')&&!before.has(name)),[]);
   assert.equal(session.browserAssets.owners.size,0);
   await readFile(bundle.manifestPath);
   const old=await session.run(`await assets.bundle({inventoryId:inventory.id});`);assert.equal(old.isError,true);assert.match(old.content.at(-1).text,/Unknown/);
   assert.ok((await run(session,`nodeRepl.write(JSON.stringify((await assets.list()).assets.length));`))>0);
   const beforeNavigation=new Set((await readdir(tmpdir())).filter(name=>name.startsWith('ocu-assets-')));
   const navigationFetch=new Promise(resolve=>{slowStarted=resolve;});
   const addNavigationSlow=addSlow.replace('/slow','/slow?navigation');
   await run(session,`await cdp.send('Runtime.evaluate',{expression:${JSON.stringify(addNavigationSlow)}});var movingInventory=await assets.list();var movingExport=assets.bundle({inventoryId:movingInventory.id,assetIds:[movingInventory.assets.find(asset=>asset.url.endsWith('/slow?navigation')).id]}).then(()=>{throw Error('Unexpected export success')},error=>error.message);nodeRepl.write(JSON.stringify(true));`);
   await navigationFetch;
   await run(session,`await tab.goto(${JSON.stringify(url+'?mid-export')});await tab.playwright.waitForURL(${JSON.stringify(url+'?mid-export')});nodeRepl.write(JSON.stringify(true));`);
   slowResponse.end();assert.match(await run(session,`nodeRepl.write(JSON.stringify(await movingExport));`),/navigated/u);
   assert.deepEqual((await readdir(tmpdir())).filter(name=>name.startsWith('ocu-assets-')&&!beforeNavigation.has(name)),[]);
   await session.reset();assert.equal(session.browserAssets.owners.size,0);
   console.log(`${Session.name} PASS asset discovery, computed styles, cross-origin frames, SVGs, credentialed/data export, failures, validation, navigation, retained artifacts and turn/reset cleanup`);
  } finally {
   await session.close();for(const directory of directories)await rm(directory,{recursive:true,force:true});
   if(id && (await(await fetch(new URL('/json/list',endpoint))).json()).some(tab=>tab.id===id)) {
    const version=await(await fetch(new URL('/json/version',endpoint))).json();
    await withConnection(version.webSocketDebuggerUrl,send=>send('Target.closeTarget',{targetId:id}));
   }
  }
 }
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
