import assert from "node:assert/strict";
import {createServer} from "node:http";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {WorkerJavaScriptSession,PersistentJavaScriptSession} from "./node-repl/open-computer-use-repl.mjs";
import {withConnection,imageDimensions} from "./node-repl/browser-cdp.mjs";

const endpoint=process.env.OPEN_COMPUTER_USE_CDP_URL;
if(!endpoint) throw new Error("Set OPEN_COMPUTER_USE_CDP_URL to disposable headless Chrome");
const server=createServer((req,res)=>{
  res.setHeader("Content-Type","text/html; charset=utf-8");
  const sources={
    '/same-nav':['/frame','/frame?navigate'],
    '/same-dupe':['/frame','/frame'],
    '/same-nested':['/frameshell-same','/frameshell-same'],
    '/frameshell-same':['/frame','/frame'],
    '/shadow-dupe':[],
    '/shadow-twins':[],
    '/cross-dialog':[`http://localhost:${server.address().port}/frame?dialog`],
    '/cross':[`http://localhost:${server.address().port}/frame`],
    '/nested':[`http://localhost:${server.address().port}/frameshell`],
    '/frameshell':['/frame'],
    '/perspective':[`http://localhost:${server.address().port}/perspective-inner`],
    '/perspective-inner':[`http://127.0.0.1:${server.address().port}/frame`],
    '/double':[`http://localhost:${server.address().port}/frameshell2`],
    '/frameshell2':[`http://127.0.0.1:${server.address().port}/frame`],
    '/cross-dupe':[`http://localhost:${server.address().port}/frame`,`http://localhost:${server.address().port}/frame`]
  };
  const sourcesForPage=sources[req.url] ?? (req.url.startsWith('/frame')?[]:['/frame']);
  res.end(`<!doctype html><style>#zone{width:200px;height:100px;background:#acf;margin:30px;border:3px solid}iframe{width:400px;height:250px}${req.url.startsWith('/perspective')?'iframe{transform:perspective(700px) rotateY(24deg) rotateX(7deg)}':''}</style><div id="zone">Drop here</div><div id="edit" contenteditable style="width:200px;height:40px;border:1px solid">Editor</div><output id="result">[]</output><button id="reorder" onclick="document.body.moveBefore(document.querySelector('iframe'),null)">Reorder frames</button><button id="cover" onclick="zone.style.pointerEvents='none'">Cover</button>${sourcesForPage.map(src=>`<iframe src="${src}"></iframe>`).join("")}<script>
  ${req.url==='/shadow-dupe'?`const host=document.createElement('div');host.id='shadow';document.body.append(host);host.attachShadow({mode:'open'}).innerHTML='<iframe src="/frame"></iframe><iframe src="/frame"></iframe>';`:''}
  ${req.url==='/shadow-twins'?`const host=document.createElement('div');host.id='twins';host.innerHTML='<iframe name="light-target" src="/frame"></iframe>';document.body.append(host);host.attachShadow({mode:'open'}).innerHTML='<iframe name="shadow-target" src="/frame"></iframe><slot></slot>';Element.prototype.getRootNode=function(){throw Error('Main-world owner walk forbidden');};`:''}
  let events=[];
  for(const type of ['dragenter','dragover','drop']) zone.addEventListener(type,async e=>{
    e.preventDefault();events.push({type:e.type,trusted:e.isTrusted,text:e.dataTransfer.getData('text/plain'),files:e.dataTransfer.files.length});
    if(e.type==='dragover' && location.search==='?dialog') {history.replaceState({},'',location.pathname);prompt('Drop paused');}
    if(e.type==='dragover' && location.search==='?navigate') {prompt('Navigate during drop');location.replace('/frame?replaced');}
    if(e.type==='drop') {
      const data=[...e.dataTransfer.types].filter(type=>type!=='Files').map(type=>[type,e.dataTransfer.getData(type)]);
      const files=await Promise.all([...e.dataTransfer.files].map(async file=>({name:file.name,text:await file.text()})));
      result.textContent=JSON.stringify({events,data,files});
    }
  });</script>`);
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const url=`http://127.0.0.1:${server.address().port}/`;
const dir=await mkdtemp(path.join(tmpdir(),"ocu-drop-"));
const file=path.join(dir,"你好.txt");await writeFile(file,"native file bytes 🙂");
const native={async request(){throw new Error("Native backend unused");}};
const Session=process.argv.includes('--source') ? PersistentJavaScriptSession : WorkerJavaScriptSession;
const session=new Session({native});
const other=new Session({native});
async function run(source,target=session,timeout=30000){const result=await target.run(source,timeout);assert.equal(result.isError,false,JSON.stringify(result.content));return JSON.parse(result.content.at(-1).text);}
const ids=[];
const routeIds=new Map();
let rasterScale;
try{
 const id=await run(`var tab=await cua.createBrowserTab("cdp",${JSON.stringify(url)},{visible:false});nodeRepl.write(JSON.stringify(tab.id));`);ids.push(id);
 const target=(await(await fetch(new URL('/json/list',endpoint))).json()).find(target=>target.id===id);
 const viewport=await withConnection(target.webSocketDebuggerUrl,async send=>(await send('Page.getLayoutMetrics')).cssVisualViewport);
 const png=Buffer.from(await run(`nodeRepl.write(JSON.stringify(Buffer.from(await tab.getScreenshot({emit:false})).toString('base64')));`),'base64');
 rasterScale=imageDimensions(png,'png').width/viewport.clientWidth;
 await run(`await tab.playwright.locator('#zone').drop({data:{'text/plain':'你好 🙂','text/html':'<b>rich</b>'},files:${JSON.stringify(file)}},{position:{x:20,y:20}});nodeRepl.write(JSON.stringify(true));`);
 const result=JSON.parse(await run(`nodeRepl.write(JSON.stringify(await tab.playwright.locator('#result').innerText()));`));
 assert.equal(result.events[0].type,'dragenter');assert.equal(result.events.at(-1).type,'drop');assert.ok(result.events.slice(1,-1).every(e=>e.type==='dragover'));assert.ok(result.events.every(e=>e.trusted));
 assert.deepEqual(result.events.slice(0,2).map(e=>[e.text,e.files]),[['',0],['',0]]);
 assert.deepEqual(result.files,[{name:'你好.txt',text:'native file bytes 🙂'}]);assert.ok(result.data.some(([type,text])=>type==='text/plain'&&text==='你好 🙂'));
 await run(`await tab.playwright.locator('#edit').drop({data:{'text/html':'<b>native rich</b>','text/plain':'native rich'}});nodeRepl.write(JSON.stringify(true));`);
 assert.match(await run(`nodeRepl.write(JSON.stringify(await tab.playwright.locator('#edit').innerText()));`),/native rich/);
 await run(`await tab.playwright.frameLocator('iframe').locator('#zone').drop({data:{'text/plain':'frame'}});nodeRepl.write(JSON.stringify(true));`);
 assert.equal(JSON.parse(await run(`nodeRepl.write(JSON.stringify(await tab.playwright.frameLocator('iframe').locator('#result').innerText()));`)).events.at(-1).trusted,true);
 const cross=await run(`var cross=await cua.createBrowserTab('cdp',${JSON.stringify(url+'cross')},{visible:false});nodeRepl.write(JSON.stringify(cross.id));`);ids.push(cross);
 await run(`await cross.playwright.frameLocator('iframe').locator('#zone').drop({data:{'text/plain':'cross process'},files:${JSON.stringify(file)}});nodeRepl.write(JSON.stringify(true));`);
 const crossResult=JSON.parse(await run(`nodeRepl.write(JSON.stringify(await cross.playwright.frameLocator('iframe').locator('#result').innerText()));`));
 assert.equal(crossResult.events.at(-1).trusted,true);assert.equal(crossResult.data[0][1],'cross process');
 assert.deepEqual(crossResult.files,[{name:'你好.txt',text:'native file bytes 🙂'}]);
 for(const [route,locator] of [['shadow-twins',"frameLocator('#twins iframe[name=shadow-target]')"],['same-dupe',"frameLocator('iframe').nth(1)"],['same-nested',"frameLocator('iframe').nth(1).frameLocator('iframe').nth(1)"],['shadow-dupe',"frameLocator('#shadow iframe').nth(1)"],['nested',"frameLocator('iframe').frameLocator('iframe')"],['double',"frameLocator('iframe').frameLocator('iframe')"],['perspective',"frameLocator('iframe').frameLocator('iframe')"],['cross-dupe',"frameLocator('iframe').nth(1)"]]) {
   const nested=await run(`var nested=await cua.createBrowserTab('cdp',${JSON.stringify(url)}+${JSON.stringify(route)},{visible:false});nodeRepl.write(JSON.stringify(nested.id));`);ids.push(nested);routeIds.set(route,nested);
   await run(`await nested.playwright.${locator}.locator('#zone').drop({data:{'text/plain':${JSON.stringify(route)}},files:${JSON.stringify(file)}});nodeRepl.write(JSON.stringify(true));`);
   const result=JSON.parse(await run(`nodeRepl.write(JSON.stringify(await nested.playwright.${locator}.locator('#result').innerText()));`));
   assert.equal(result.events.at(-1).trusted,true);assert.equal(result.data[0][1],route);assert.equal(result.files[0].text,'native file bytes 🙂');
   if(route==='shadow-twins') assert.equal(await run(`nodeRepl.write(JSON.stringify(await nested.playwright.frameLocator('#twins iframe[name=light-target]').locator('#result').innerText()));`),'[]');
   if(['same-dupe','cross-dupe','shadow-dupe'].includes(route)) {
     const first=route==='shadow-dupe'?"frameLocator('#shadow iframe').nth(0)":"frameLocator('iframe').nth(0)";
     assert.equal(await run(`nodeRepl.write(JSON.stringify(await nested.playwright.${first}.locator('#result').innerText()));`),'[]');
   }
 }
 await run(`var reordered=await cua.getTab(${JSON.stringify(routeIds.get('same-dupe'))});await reordered.playwright.getByRole('button',{name:'Reorder frames',exact:true}).click();await reordered.playwright.frameLocator('iframe').nth(1).locator('#zone').drop({data:{'text/plain':'after reordering'}});nodeRepl.write(JSON.stringify(true));`);
 assert.equal(JSON.parse(await run(`nodeRepl.write(JSON.stringify(await reordered.playwright.frameLocator('iframe').nth(1).locator('#result').innerText()));`)).data[0][1],'after reordering');
 assert.equal(JSON.parse(await run(`nodeRepl.write(JSON.stringify(await reordered.playwright.frameLocator('iframe').nth(0).locator('#result').innerText()));`)).data[0][1],'same-dupe');
 const nav=await run(`var nav=await cua.createBrowserTab('cdp',${JSON.stringify(url+'same-nav')},{visible:false});await nav.playwright.frameLocator('iframe').nth(1).locator('#zone').drop({data:{'text/plain':'must not arrive'},files:${JSON.stringify(file)}});nodeRepl.write(JSON.stringify(nav.id));`);ids.push(nav);
 const navigated=await session.run(`await (await nav.getJsDialog()).dismiss();`);
 assert.equal(navigated.isError,true);assert.match(navigated.content.at(-1).text,/frame|document|context|detached|navigation/i);
 assert.equal(await run(`nodeRepl.write(JSON.stringify(await nav.playwright.frameLocator('iframe').nth(1).locator('#result').innerText()));`),'[]');
 for(const payload of [{files:'relative.txt'},{files:dir},{files:path.join(dir,'missing')},{data:{'invalid':'x'}}]) assert.equal((await session.run(`await tab.playwright.locator('#zone').drop(${JSON.stringify(payload)});`)).isError,true);
 await run(`await tab.playwright.locator('#cover').click();nodeRepl.write(JSON.stringify(true));`);
 assert.equal((await session.run(`await tab.playwright.locator('#zone').drop({data:{'text/plain':'blocked'}},{timeoutMs:100});`)).isError,true);
 await run(`nodeRepl.write(JSON.stringify(await tab.playwright.locator('#zone').count()));`);
 const crossDialog=await run(`var crossDialog=await cua.createBrowserTab('cdp',${JSON.stringify(url+'cross-dialog')},{visible:false});await crossDialog.playwright.frameLocator('iframe').locator('#zone').drop({data:{'text/plain':'cross prompt'}});nodeRepl.write(JSON.stringify(crossDialog.id));`);ids.push(crossDialog);
 assert.equal(await run(`nodeRepl.write(JSON.stringify((await crossDialog.getJsDialog()).type));`),'prompt');
 await run(`await (await crossDialog.getJsDialog()).dismiss();nodeRepl.write(JSON.stringify(true));`);
 assert.equal(JSON.parse(await run(`nodeRepl.write(JSON.stringify(await crossDialog.playwright.frameLocator('iframe').locator('#result').innerText()));`)).data[0][1],'cross prompt');
 const competing=await run(`var outsider=await cua.createBrowserTab('cdp',${JSON.stringify(url)},{visible:false});nodeRepl.write(JSON.stringify(outsider.id));`,other);ids.push(competing);
 const accepted=await run(`var accepted=await cua.createBrowserTab('cdp',${JSON.stringify(url+'?dialog')},{visible:false});await accepted.playwright.locator('#zone').drop({data:{'text/plain':'resumed'}},{timeoutMs:2000});nodeRepl.write(JSON.stringify(accepted.id));`);ids.push(accepted);
 const exclusive=await other.run(`await outsider.playwright.frameLocator('iframe').locator('#zone').drop({data:{'text/plain':'competing'}});`);
 assert.equal(exclusive.isError,true);assert.match(exclusive.content.at(-1).text,/Resolve.*dialog/);
 await new Promise(resolve=>setTimeout(resolve,2100));
 await run(`await (await accepted.getJsDialog()).accept('yes');nodeRepl.write(JSON.stringify(true));`);
 assert.equal(JSON.parse(await run(`nodeRepl.write(JSON.stringify(await accepted.playwright.locator('#result').innerText()));`)).data[0][1],'resumed');
 const paused=await run(`var paused=await cua.createBrowserTab('cdp',${JSON.stringify(url+'?dialog')},{visible:false});await paused.markHandoff();await paused.playwright.locator('#zone').drop({data:{'text/plain':'canceled'}});nodeRepl.write(JSON.stringify(paused.id));`);ids.push(paused);
 assert.equal(await run(`nodeRepl.write(JSON.stringify((await paused.getJsDialog()).type));`),'prompt');
 await session.reset();
 await run(`var paused=await cua.getTab(${JSON.stringify(paused)});nodeRepl.write(JSON.stringify(await paused.playwright.locator('#result').innerText()));`).then(value=>assert.equal(value,'[]'));
 await run(`await paused.playwright.locator('#zone').drop({data:{'text/plain':'after reset'}});nodeRepl.write(JSON.stringify(true));`);
 assert.equal(JSON.parse(await run(`nodeRepl.write(JSON.stringify(await paused.playwright.locator('#result').innerText()));`)).data[0][1],'after reset');
 const timeoutTab=await run(`var timeoutTab=await cua.createBrowserTab('cdp',${JSON.stringify(url+'?dialog')},{visible:false});await timeoutTab.markHandoff();nodeRepl.write(JSON.stringify(timeoutTab.id));`);ids.push(timeoutTab);
 const expired=await session.run(`await timeoutTab.playwright.locator('#zone').drop({data:{'text/plain':'timeout'}});await new Promise(()=>{});`,500);
 assert.equal(expired.isError,true);
 assert.equal(await run(`var timeoutTab=await cua.getTab(${JSON.stringify(timeoutTab)});nodeRepl.write(JSON.stringify(await timeoutTab.playwright.locator('#result').innerText()));`),'[]');
 const originalConnect=session.browserDrops.connect;
 try {
   session.browserDrops.connect=async()=>{throw Error('Injected native drag cleanup failure');};
   const failed=await session.run(`await timeoutTab.playwright.locator('#zone').drop({data:{'text/plain':'cleanup result'}});`);
   assert.equal(failed.isError,true);assert.match(failed.content.at(-1).text,/cleanup failed/);
   assert.equal((await session.run('nodeRepl.write(1)')).isError,true);
 } finally {session.browserDrops.connect=originalConnect;}
 await session.reset();
 assert.equal(JSON.parse(await run(`var timeoutTab=await cua.getTab(${JSON.stringify(timeoutTab)});nodeRepl.write(JSON.stringify(await timeoutTab.playwright.locator('#result').innerText()));`)).events.filter(e=>e.type==='drop').length,1);
 await run(`await timeoutTab.playwright.locator('#zone').drop({data:{'text/plain':'retry success'}});nodeRepl.write(JSON.stringify(true));`);
 const closeTab=await run(`var closeTab=await cua.createBrowserTab('cdp',${JSON.stringify(url+'?dialog')},{visible:false});await closeTab.markHandoff();await closeTab.playwright.locator('#zone').drop({data:{'text/plain':'closed'}});nodeRepl.write(JSON.stringify(closeTab.id));`);ids.push(closeTab);
 await session.close();
 assert.equal(await run(`var closedTab=await cua.getTab(${JSON.stringify(closeTab)});nodeRepl.write(JSON.stringify(await closedTab.playwright.locator('#result').innerText()));`,other),'[]');
 console.log(`Native drop smoke passed at raster scale ${rasterScale}: trusted mixed MIME/file data, protected mode, iframe, invalid files, covered target timeout, prompt response/reset/timeout/close and reuse, browser exclusivity, nested cross-process frame delivery and prompts, same-URL native owners including shadow/reorder/navigation, cleanup failure/retry without replay`);
}finally{
 await Promise.allSettled([session.close(),other.close()]);
 const version=await(await fetch(new URL('/json/version',endpoint))).json();
 const live=new Set((await(await fetch(new URL('/json/list',endpoint))).json()).map(target=>target.id));
 for(const targetId of ids.filter(id=>live.has(id))) await withConnection(version.webSocketDebuggerUrl,send=>send('Target.closeTarget',{targetId}));
 server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});
}
