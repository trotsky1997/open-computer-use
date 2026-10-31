// Owns the managed browser and user-like fixture tabs; never claims an existing user profile.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
const runtime=await import(process.argv[2]?pathToFileURL(path.join(process.argv[2],'scripts/open-computer-use-repl.mjs')).href:'./node-repl/open-computer-use-repl.mjs');
const binary=process.env.OCU_TEST_CHROME_EXECUTABLE;if(!binary)throw Error('Set OCU_TEST_CHROME_EXECUTABLE');
const scratch=await mkdtemp(path.join(tmpdir(),'ocu-user-claims-')),saved={...process.env},native={async request(){throw Error('Native desktop must remain unused');}};let browser,manager;
const server=createServer((_request,response)=>{response.setHeader('Content-Type','text/html');response.end('<title>Owned user-tab fixture</title><label>Value<input></label><button onclick="document.body.dataset.clicked=\'true\';document.body.dataset.blocked=String(!window.open(\'/popup\'))">Popup</button>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}/`;
async function run(session,code){const result=await session.run(code,30000);assert.equal(result.isError,false,result.content.at(-1)?.text);return JSON.parse(result.content.at(-1).text);}
async function denied(session,code,pattern){const result=await session.run(code,30000);assert.equal(result.isError,true);assert.match(result.content.at(-1).text,pattern);}
async function id(page){const cdp=await page.context().newCDPSession(page);try{return (await cdp.send('Target.getTargetInfo')).targetInfo.targetId;}finally{await cdp.detach();}}
async function tabs(){return (await fetch(new URL('/json/list',process.env.OPEN_COMPUTER_USE_CDP_URL))).json();}
async function until(check,label){const end=Date.now()+10000;for(;;){const value=await check();if(value)return value;assert.ok(Date.now()<end,label);await new Promise(resolve=>setTimeout(resolve,20));}}
async function existing(context,target){for(const page of context.pages())if(await id(page)===target)return page;throw Error('Owned fixture tab missing');}
try{
 let executable=path.resolve(binary);
 if(process.platform==='linux'){const quoted="'"+executable.replaceAll("'","'\\''")+"'";executable=path.join(scratch,'owned-chrome');await writeFile(executable,`#!/bin/sh\nexec ${quoted} --no-sandbox "$@"\n`,{mode:0o700});}
 delete process.env.OPEN_COMPUTER_USE_CDP_URL;process.env.OPEN_COMPUTER_USE_BROWSER_EXECUTABLE=executable;process.env.OPEN_COMPUTER_USE_BROWSER_MODE='headless';
 for(const Session of [runtime.WorkerJavaScriptSession,runtime.PersistentJavaScriptSession]){
  const a=new Session({native}),b=new Session({native});manager=a.browserRuntime;let first,second;
  try{
   await run(a,"var browser=await cua.getBrowser({id:'cdp'});nodeRepl.write(JSON.stringify(true));");
   browser??=await chromium.connectOverCDP(process.env.OPEN_COMPUTER_USE_CDP_URL,{noDefaults:true});const context=browser.contexts()[0];
   first=await context.newPage();await first.goto(url+'first');second=await context.newPage();await second.goto(url+'second');
   const firstId=await id(first),secondId=await id(second),rows=await run(a,'nodeRepl.write(JSON.stringify(await browser.user.openTabs()));'),row=rows.find(tab=>tab.id===firstId),secondRow=rows.find(tab=>tab.id===secondId);
   assert.ok(row&&secondRow);assert.match(row.providerTabId,/^\d+$/u);assert.ok(Number.isFinite(Date.parse(row.lastOpened)));
   assert.deepEqual(rows.map(tab=>tab.lastOpened).filter(Boolean),rows.map(tab=>tab.lastOpened).filter(Boolean).sort().reverse());
   assert.equal([...a.browserTabs.browsers.values()].some(entry=>entry.tabs.has(firstId)),false,'Listing claimed a user tab');
   await run(a,`var management=await browser.capabilities.get('management');var group=await management.tabs.group({tabIds:[${Number(row.providerTabId)},${Number(secondRow.providerTabId)}]});await management.tabGroups.update(group,{title:'Owned group'});nodeRepl.write(JSON.stringify(true));`);
   assert.equal((await run(a,'nodeRepl.write(JSON.stringify(await browser.user.openTabs()));')).find(tab=>tab.id===firstId).tabGroup,'Owned group');
   await run(b,`var browser=await cua.getBrowser({id:'cdp'});var former=await browser.user.claimTab(${JSON.stringify(row)});nodeRepl.write(JSON.stringify(true));`);await b.endTurn();assert.equal(first.isClosed(),false);
   await run(a,`var claimed=await browser.user.claimTab(${JSON.stringify(row)});await claimed.playwright.getByLabel('Value').fill('owner A');nodeRepl.write(JSON.stringify(true));`);
   await denied(b,"await former.playwright.getByLabel('Value').fill('foreign write');",/another session/);
   await denied(b,`await cua.getTab(${JSON.stringify(firstId)});`,/another session/);
   assert.equal(await first.getByLabel('Value').inputValue(),'owner A');
   assert.equal((await run(b,'nodeRepl.write(JSON.stringify(await browser.user.openTabs()));')).some(tab=>tab.id===firstId),false);
   await run(a,`var created=await cua.createBrowserTab('cdp',${JSON.stringify(url+'created')},{visible:false});nodeRepl.write(JSON.stringify(true));`);
   const createdId=await run(a,'nodeRepl.write(JSON.stringify(created.id));');assert.equal((await run(a,'nodeRepl.write(JSON.stringify(await browser.user.openTabs()));')).some(tab=>tab.id===createdId),false);
   await denied(b,`await cua.getTab(${JSON.stringify(createdId)});`,/another session/);
   await first.bringToFront();await browser.close();browser=undefined;
   await run(a,"await claimed.playwright.getByRole('button',{name:'Popup'}).click();nodeRepl.write(JSON.stringify(true));");
   assert.deepEqual(await run(a,"nodeRepl.write(JSON.stringify({clicked:await claimed.playwright.locator('body').getAttribute('data-clicked'),blocked:await claimed.playwright.locator('body').getAttribute('data-blocked')}));"),{clicked:'true',blocked:'false'});
   const popup=await until(async()=>(await tabs()).find(tab=>tab.url===url+'popup'),'Owned popup did not open');
   await a.endTurn();await until(async()=>!(await tabs()).some(tab=>tab.id===popup.id),'Claimed-tab popup was not closed');
   browser=await chromium.connectOverCDP(process.env.OPEN_COMPUTER_USE_CDP_URL,{noDefaults:true});first=await existing(browser.contexts()[0],firstId);second=await existing(browser.contexts()[0],secondId);
   await run(b,"await former.playwright.getByLabel('Value').fill('owner B');await former.markHandoff();nodeRepl.write(JSON.stringify(true));");await b.endTurn();
   await denied(a,`await browser.user.claimTab(${JSON.stringify(firstId)});`,/another session/);
   await run(b,'nodeRepl.write(JSON.stringify(true));');await b.endTurn();
   await run(a,`var claimed=await browser.user.claimTab(${JSON.stringify(firstId)});nodeRepl.write(JSON.stringify(true));`);await a.reset();assert.equal(first.isClosed(),false);assert.equal(await first.getByLabel('Value').inputValue(),'owner B');
   await second.goto(url+'changed');await run(a,"var browser=await cua.getBrowser({id:'cdp'});nodeRepl.write(JSON.stringify(true));");await denied(a,`await browser.user.claimTab(${JSON.stringify(secondRow)});`,/reference changed/);
   await Promise.all([a.endTurn(),b.endTurn()]);
   const race=await Promise.all([a.run(`await browser.user.claimTab(${JSON.stringify(firstId)});`),b.run(`await browser.user.claimTab(${JSON.stringify(firstId)});`)]);assert.equal(race.filter(result=>!result.isError).length,1);
   await Promise.all([a.reset(),b.reset()]);assert.equal(first.isClosed(),false);
   console.log(`${Session.name} PASS native user-tab metadata/group/order, no claim on listing, explicit/implicit exclusivity, stale handles, popup cleanup, handoff/release/reset and simultaneous claims`);
  }finally{await a.close();await b.close();await first?.close();await second?.close();}
 }
}finally{
 await browser?.close();await manager?.close();
 server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(scratch,{recursive:true,force:true});
 for(const key of ['OPEN_COMPUTER_USE_CDP_URL','OPEN_COMPUTER_USE_BROWSER_EXECUTABLE','OPEN_COMPUTER_USE_BROWSER_MODE']){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}
}
