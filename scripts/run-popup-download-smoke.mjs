// Use only a disposable CDP profile; every window, HTTP response and file here is owned.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {PersistentJavaScriptSession,WorkerJavaScriptSession} from './node-repl/open-computer-use-repl.mjs';
const endpoint=process.env.OPEN_COMPUTER_USE_CDP_URL;assert.ok(endpoint,'Set a disposable CDP browser endpoint');
const payload=Buffer.from('owned popup download 中文🙂\n'.repeat(4096)),foreign=Buffer.from('unrelated download');
const server=createServer((request,response)=>{
 const route=request.url;
 if(['/file','/foreign','/slow'].includes(route)){
  const bytes=route==='/foreign'?foreign:payload;
  response.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename=../../popup.txt','Content-Length':bytes.length});
  if(route==='/slow'){response.write(bytes.subarray(0,16));const timer=setTimeout(()=>response.end(bytes.subarray(16)),8000);response.on('close',()=>clearTimeout(timer));}
  else response.end(bytes);
 }else{
  response.setHeader('Content-Type','text/html');
  if(route==='/popup')response.end('<title>Download popup</title><script>location.href="/file"</script>');
  else if(route==='/nested')response.end('<title>Nested opener</title><script>window.open("/popup")</script>');
  else if(route==='/foreign-popup')response.end('<script>location.href="/foreign"</script>');
  else if(route==='/idle')response.end('<title>Existing popup</title><a href="/foreign">Existing unrelated download</a>');
  else response.end('<title>Download opener</title><a href="/file" target="_blank">Direct popup download</a><button onclick="window.open(\'/popup\')">Scripted popup download</button><button onclick="window.open(\'/nested\')">Nested popup download</button><button onclick="window.open(\'/idle\')">Prepare existing popup</button><button onclick="window.open(\'/foreign-popup\')">Unrelated new popup</button><button onclick="window.open(\'/slow\')">Slow popup download</button>');
 }
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}/`;
const native={async request(){throw Error('Native backend unused');}},pause=()=>new Promise(resolve=>setTimeout(resolve,20));
async function until(fn){const end=Date.now()+15000;for(;;){const value=await fn();if(value)return value;assert.ok(Date.now()<end,'Owned download state did not arrive');await pause();}}
async function run(session,source){const result=await session.run(source,30000);assert.equal(result.isError,false,JSON.stringify(result.content));return JSON.parse(result.content.at(-1).text);}
async function active(session){const record=await until(()=>[...session.browserDownloads.active.values()][0]);await record.initialized;return record;}
try{
 for(const Session of [PersistentJavaScriptSession,WorkerJavaScriptSession]){
  const session=new Session({native});let firstFile;
  try{
   const tabId=await run(session,`var tab=await cua.createBrowserTab('cdp',${JSON.stringify(url)},{visible:false});nodeRepl.write(JSON.stringify(tab.id));`);
   for(const [role,name] of [['link','Direct popup download'],['button','Scripted popup download'],['button','Nested popup download']]){
    const file=await run(session,`var waiting=tab.playwright.waitForEvent('download',{timeoutMs:5000});await tab.playwright.getByRole(${JSON.stringify(role)},{name:${JSON.stringify(name)},exact:true}).click();var artifact=await waiting;nodeRepl.write(JSON.stringify(await artifact.path({timeoutMs:10000})));`);
    assert.deepEqual(await readFile(file),payload);firstFile??=file;assert.equal(session.browserDownloads.active.size,0);
   }
   await run(session,'await tab.playwright.getByRole("button",{name:"Prepare existing popup",exact:true}).click();nodeRepl.write(JSON.stringify(true));');
   const old=await until(async()=>(await(await fetch(endpoint+'/json/list')).json()).find(t=>t.url===url+'idle'));
   await run(session,`var old=await cua.getTab(${JSON.stringify(old.id)});var unrelated=await cua.createBrowserTab('cdp',${JSON.stringify(url)},{visible:false});var waiting=tab.playwright.waitForEvent('download',{timeoutMs:0});waiting.catch(()=>{});nodeRepl.write(JSON.stringify(true));`);
   const isolated=await active(session);
   await run(session,'await old.playwright.getByRole("link",{name:"Existing unrelated download",exact:true}).click();await unrelated.playwright.getByRole("button",{name:"Unrelated new popup",exact:true}).click();nodeRepl.write(JSON.stringify(true));');
   await until(()=>[...isolated.candidates.values()].filter(e=>e.state==='completed').length===2);
   assert.equal(isolated.guid,undefined,'Unrelated frame was attributed to selected tab');
   const isolatedFile=await run(session,'await tab.playwright.getByRole("button",{name:"Nested popup download",exact:true}).click();var artifact=await waiting;nodeRepl.write(JSON.stringify(await artifact.path()));');assert.deepEqual(await readFile(isolatedFile),payload);
   await run(session,'var waiting=tab.playwright.waitForEvent("download",{timeoutMs:0});waiting.catch(()=>{});nodeRepl.write(JSON.stringify(true));');
   (await active(session)).popupConnection.close();
   const lost=await session.run('await waiting;');assert.equal(lost.isError,true);assert.match(JSON.stringify(lost.content),/popup observer disconnected/);assert.equal(session.browserDownloads.active.size,0);
   for(const action of ['reset','close']){
    await run(session,`var tab=await cua.getTab(${JSON.stringify(tabId)});var waiting=tab.playwright.waitForEvent('download',{timeoutMs:5000});await tab.playwright.getByRole('button',{name:'Slow popup download',exact:true}).click();var transfer=await waiting;nodeRepl.write(JSON.stringify(true));`);
    const record=await active(session);assert.ok(record.guid);assert.equal(record.ended,undefined);
    await session[action]();assert.equal(record.ended,true);assert.equal(record.completed,false);assert.equal(record.popupConnection,undefined);assert.equal(session.browserDownloads.active.size,0);
   }
   assert.deepEqual(await readFile(firstFile),payload);
   console.log(`${Session.name} PASS direct/scripted/nested popup download bytes, existing/unrelated window rejection, observer loss, reset/close cancellation and policy/transport release`);
  }finally{await session.close();}
 }
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
