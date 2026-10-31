// Owns its managed browser, fixture tabs and native drag operations.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
const runtime=await import(process.argv[2]?pathToFileURL(path.join(process.argv[2],'scripts/open-computer-use-repl.mjs')).href:'./node-repl/open-computer-use-repl.mjs');
const binary=process.env.OCU_TEST_CHROME_EXECUTABLE;assert.ok(binary,'Set OCU_TEST_CHROME_EXECUTABLE');
const scratch=await mkdtemp(path.join(tmpdir(),'ocu-drop-budget-')),saved={...process.env},native={async request(){throw Error('Desktop unused');}};let manager;
const server=createServer((_request,response)=>{response.setHeader('Content-Type','text/html');response.end(`<title>Owned drop budgets</title><style>#zone{width:220px;height:120px;background:#acf;margin:30px}</style><div id="zone">Drop here</div><output>Ready</output><button onclick="zone.style.display='block'">Restore</button><script>
let paused=false;const mode=new URL(location).searchParams.get('mode');
for(const type of ['dragenter','dragover','drop'])zone.addEventListener(type,event=>{
 event.preventDefault();
 if(type==='dragover'&&!paused){paused=true;prompt('First drop prompt');if(mode==='repeat')prompt('Second drop prompt');if(mode==='hide')zone.style.display='none';}
 if(type==='drop'){const output=document.querySelector('output');output.dataset.count=String(Number(output.dataset.count??0)+1);output.textContent=event.isTrusted+':'+event.dataTransfer.getData('text/plain');}
});</script>`);});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}/`;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function run(session,code){const result=await session.run(code,30000);assert.equal(result.isError,false,result.content.at(-1)?.text);return JSON.parse(result.content.at(-1).text);}
try{
 let executable=path.resolve(binary);if(process.platform==='linux'){const quoted="'"+executable.replaceAll("'","'\\''")+"'";executable=path.join(scratch,'owned-chrome');await writeFile(executable,`#!/bin/sh\nexec ${quoted} --no-sandbox "$@"\n`,{mode:0o700});}
 process.env.OPEN_COMPUTER_USE_BROWSER_EXECUTABLE=executable;process.env.OPEN_COMPUTER_USE_BROWSER_MODE='headless';delete process.env.OPEN_COMPUTER_USE_CDP_URL;
 for(const Session of [runtime.WorkerJavaScriptSession,runtime.PersistentJavaScriptSession]){
  const session=new Session({native});manager=session.browserRuntime;
  try{
   // Before the fix, the first prompt cleared this deadline permanently.
   await run(session,`var tab=await cua.createBrowserTab('cdp',${JSON.stringify(url+'?mode=hide')},{visible:false});await tab.markHandoff();await tab.playwright.locator('#zone').drop({data:{'text/plain':'hidden'}},{timeoutMs:3000});nodeRepl.write(JSON.stringify((await tab.getJsDialog()).type));`);
   await pause(3500);
   const failed=await session.run('await(await tab.getJsDialog()).accept("hide");',7000);assert.equal(failed.isError,true);assert.match(failed.content.at(-1).text,/Timeout 3000ms/);
   assert.equal(session.browserDrops.leases.size,0);assert.equal(session.browserFocusLeases.entries.size,0);
   assert.equal(await run(session,"nodeRepl.write(JSON.stringify(await tab.playwright.locator('output').innerText()));"),'Ready');
   assert.equal(await run(session,"await tab.playwright.getByRole('button',{name:'Restore'}).click();nodeRepl.write(JSON.stringify(await tab.playwright.locator('#zone').isVisible()));"),true);
   // Linux restored-target trial checks can take ~17s; expiry assertions above keep their 3s budget.
   await run(session,"await tab.playwright.locator('#zone').drop({data:{'text/plain':'recovered'}},{timeoutMs:30000});nodeRepl.write(JSON.stringify(true));");
   assert.equal(await run(session,"nodeRepl.write(JSON.stringify(await tab.playwright.locator('output').innerText()));"),'true:recovered');
   assert.equal(await run(session,"nodeRepl.write(JSON.stringify(await tab.playwright.locator('output').getAttribute('data-count')));"),'1');
   const missing=await session.run("await tab.playwright.locator('#missing').drop({data:{'text/plain':'missing'}},{timeoutMs:100});");assert.equal(missing.isError,true);assert.match(missing.content.at(-1).text,/Timeout 100ms/);
   await run(session,'await tab.close();nodeRepl.write(JSON.stringify(true));');
   await run(session,`var tab=await cua.createBrowserTab('cdp',${JSON.stringify(url+'?mode=repeat')},{visible:false});await tab.markHandoff();await tab.playwright.locator('#zone').drop({data:{'text/plain':'repeated'}},{timeoutMs:3000});nodeRepl.write(JSON.stringify(true));`);await pause(3500);
   await run(session,'await(await tab.getJsDialog()).accept("one");nodeRepl.write(JSON.stringify((await tab.getJsDialog()).type));');await pause(3500);
   assert.equal(await run(session,"await(await tab.getJsDialog()).accept('two');nodeRepl.write(JSON.stringify(await tab.playwright.locator('output').innerText()));"),'true:repeated');
   await run(session,'await tab.close();nodeRepl.write(JSON.stringify(true));');
   const retained=await run(session,`var tab=await cua.createBrowserTab('cdp',${JSON.stringify(url)},{visible:false});await tab.markHandoff();await tab.playwright.locator('#zone').drop({data:{'text/plain':'canceled'}},{timeoutMs:0});nodeRepl.write(JSON.stringify(tab.id));`);
   await session.reset();assert.equal(session.browserDrops.leases.size,0);assert.equal(session.browserDialogs.waiters.size,0);assert.equal(session.browserFocusLeases.entries.size,0);
   assert.equal(await run(session,`var tab=await cua.getTab(${JSON.stringify(retained)});nodeRepl.write(JSON.stringify(await tab.playwright.locator('output').innerText()));`),'Ready');
   await run(session,"await tab.playwright.locator('#zone').drop({data:{'text/plain':'after reset'}});nodeRepl.write(JSON.stringify(true));");
   assert.equal(await run(session,"nodeRepl.write(JSON.stringify(await tab.playwright.locator('output').innerText()));"),'true:after reset');await run(session,'await tab.close();nodeRepl.write(JSON.stringify(true));');
   console.log(`${Session.name} PASS native drop repeated dialog pauses, resumed readiness deadline, no late drop, missing target deadline, unlimited-action reset and fresh input recovery`);
  }finally{await session.close();}
 }
}finally{await manager?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(scratch,{recursive:true,force:true});for(const key of ['OPEN_COMPUTER_USE_CDP_URL','OPEN_COMPUTER_USE_BROWSER_EXECUTABLE','OPEN_COMPUTER_USE_BROWSER_MODE']){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
