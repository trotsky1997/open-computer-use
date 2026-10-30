import assert from "node:assert/strict";
import {createServer} from "node:http";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {WorkerJavaScriptSession} from "./node-repl/open-computer-use-repl.mjs";
import {withConnection} from "./node-repl/browser-cdp.mjs";

const endpoint=process.env.OPEN_COMPUTER_USE_CDP_URL;
if(!endpoint) throw new Error("Set OPEN_COMPUTER_USE_CDP_URL to disposable headless Chrome");
const server=createServer((req,res)=>{
  res.setHeader("Content-Type","text/html; charset=utf-8");
  res.end(`<!doctype html><style>#zone{width:200px;height:100px;background:#acf;margin:30px;border:3px solid}iframe{width:400px;height:250px}</style><div id="zone">Drop here</div><div id="edit" contenteditable style="width:200px;height:40px;border:1px solid">Editor</div><output id="result">[]</output><button id="cover" onclick="zone.style.pointerEvents='none'">Cover</button>${req.url.startsWith("/frame")?'':`<iframe src="${req.url==="/cross"?`http://localhost:${server.address().port}/frame`:"/frame"}"></iframe>`}<script>
  let events=[];
  for(const type of ['dragenter','dragover','drop']) zone.addEventListener(type,async e=>{
    e.preventDefault();events.push({type:e.type,trusted:e.isTrusted,text:e.dataTransfer.getData('text/plain'),files:e.dataTransfer.files.length});
    if(e.type==='dragover' && location.search==='?dialog') {history.replaceState({},'',location.pathname);prompt('Drop paused');}
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
const session=new WorkerJavaScriptSession({native});
const other=new WorkerJavaScriptSession({native});
async function run(source,target=session,timeout=30000){const result=await target.run(source,timeout);assert.equal(result.isError,false,JSON.stringify(result.content));return JSON.parse(result.content.at(-1).text);}
const ids=[];
try{
 const id=await run(`var tab=await cua.createBrowserTab("cdp",${JSON.stringify(url)},{visible:false});nodeRepl.write(JSON.stringify(tab.id));`);ids.push(id);
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
 const crossDrop=await session.run(`await cross.playwright.frameLocator('iframe').locator('#zone').drop({data:{'text/plain':'must not arrive'}});`);
 assert.equal(crossDrop.isError,true);assert.match(crossDrop.content.at(-1).text,/outside this page CDP target/);
 assert.equal(await run(`nodeRepl.write(JSON.stringify(await cross.playwright.frameLocator('iframe').locator('#result').innerText()));`),'[]');
 for(const payload of [{files:'relative.txt'},{files:dir},{files:path.join(dir,'missing')},{data:{'invalid':'x'}}]) assert.equal((await session.run(`await tab.playwright.locator('#zone').drop(${JSON.stringify(payload)});`)).isError,true);
 await run(`await tab.playwright.locator('#cover').click();nodeRepl.write(JSON.stringify(true));`);
 assert.equal((await session.run(`await tab.playwright.locator('#zone').drop({data:{'text/plain':'blocked'}},{timeoutMs:100});`)).isError,true);
 await run(`nodeRepl.write(JSON.stringify(await tab.playwright.locator('#zone').count()));`);
 const accepted=await run(`var accepted=await cua.createBrowserTab('cdp',${JSON.stringify(url+'?dialog')},{visible:false});await accepted.playwright.locator('#zone').drop({data:{'text/plain':'resumed'}},{timeoutMs:2000});nodeRepl.write(JSON.stringify(accepted.id));`);ids.push(accepted);
 await run(`var outsider=await cua.getTab(${JSON.stringify(id)});nodeRepl.write(JSON.stringify(outsider.id));`,other);
 const exclusive=await other.run(`await outsider.playwright.frameLocator('iframe').locator('#zone').drop({data:{'text/plain':'competing'}});`);
 assert.equal(exclusive.isError,true);assert.match(exclusive.content.at(-1).text,/Resolve.*dialog/);
 await new Promise(resolve=>setTimeout(resolve,2100));
 await run(`await (await accepted.getJsDialog()).accept('yes');nodeRepl.write(JSON.stringify(true));`);
 assert.equal(JSON.parse(await run(`nodeRepl.write(JSON.stringify(await accepted.playwright.locator('#result').innerText()));`)).data[0][1],'resumed');
 const paused=await run(`var paused=await cua.createBrowserTab('cdp',${JSON.stringify(url+'?dialog')},{visible:false});await paused.playwright.locator('#zone').drop({data:{'text/plain':'canceled'}});nodeRepl.write(JSON.stringify(paused.id));`);ids.push(paused);
 assert.equal(await run(`nodeRepl.write(JSON.stringify((await paused.getJsDialog()).type));`),'prompt');
 await session.reset();
 await run(`var paused=await cua.getTab(${JSON.stringify(paused)});nodeRepl.write(JSON.stringify(await paused.playwright.locator('#result').innerText()));`).then(value=>assert.equal(value,'[]'));
 await run(`await paused.playwright.locator('#zone').drop({data:{'text/plain':'after reset'}});nodeRepl.write(JSON.stringify(true));`);
 assert.equal(JSON.parse(await run(`nodeRepl.write(JSON.stringify(await paused.playwright.locator('#result').innerText()));`)).data[0][1],'after reset');
 const timeoutTab=await run(`var timeoutTab=await cua.createBrowserTab('cdp',${JSON.stringify(url+'?dialog')},{visible:false});nodeRepl.write(JSON.stringify(timeoutTab.id));`);ids.push(timeoutTab);
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
 const closeTab=await run(`var closeTab=await cua.createBrowserTab('cdp',${JSON.stringify(url+'?dialog')},{visible:false});await closeTab.playwright.locator('#zone').drop({data:{'text/plain':'closed'}});nodeRepl.write(JSON.stringify(closeTab.id));`);ids.push(closeTab);
 await session.close();
 assert.equal(await run(`var closedTab=await cua.getTab(${JSON.stringify(closeTab)});nodeRepl.write(JSON.stringify(await closedTab.playwright.locator('#result').innerText()));`,other),'[]');
 console.log('Native drop smoke passed: trusted mixed MIME/file data, protected mode, iframe, invalid files, covered target timeout, prompt response/reset/timeout/close and reuse, browser exclusivity, cross-process frame rejection, cleanup failure/retry without replay');
}finally{
 await Promise.allSettled([session.close(),other.close()]);
 const version=await(await fetch(new URL('/json/version',endpoint))).json();
 for(const targetId of ids) await withConnection(version.webSocketDebuggerUrl,send=>send('Target.closeTarget',{targetId}));
 server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});
}
