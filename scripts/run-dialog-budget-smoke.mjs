// Owns its managed headless browser, dialogs and upload files; never attaches a user profile.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
const runtime=await import(process.argv[2]?pathToFileURL(path.join(process.argv[2],'scripts/open-computer-use-repl.mjs')).href:'./node-repl/open-computer-use-repl.mjs');
const binary=process.env.OCU_TEST_CHROME_EXECUTABLE;if(!binary)throw Error('Set OCU_TEST_CHROME_EXECUTABLE');
const scratch=await mkdtemp(path.join(tmpdir(),'ocu-dialog-budget-')),saved={...process.env},native={async request(){throw Error('Desktop unused');}};let manager;
const upload=path.join(scratch,'upload.txt');await writeFile(upload,'Owned upload');
const pendingResponses=new Set();
const server=createServer((request,response)=>{if(request.url==='/pending'){pendingResponses.add(response);response.once('close',()=>pendingResponses.delete(response));return;}response.setHeader('Content-Type','text/html');response.end(`<title>Dialog deadlines</title><output>Ready</output><button onclick="document.querySelector('output').textContent=String(confirm('Owned confirm'))">Confirm</button><button onclick="document.querySelector('output').textContent=prompt('One')+' '+prompt('Two')">Sequential</button><button onclick="if(confirm('Navigate'))location.href='/pending'">Navigate</button><input type="file" aria-label="Upload" onchange="document.querySelector('output').textContent=prompt('Upload')">`);});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}/`;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function run(session,code){const result=await session.run(code,30000);assert.equal(result.isError,false,result.content.at(-1)?.text);return JSON.parse(result.content.at(-1).text);}
try{
 let executable=path.resolve(binary);if(process.platform==='linux'){const quoted="'"+executable.replaceAll("'","'\\''")+"'";executable=path.join(scratch,'owned-chrome');await writeFile(executable,`#!/bin/sh\nexec ${quoted} --no-sandbox "$@"\n`,{mode:0o700});}
 process.env.OPEN_COMPUTER_USE_BROWSER_EXECUTABLE=executable;process.env.OPEN_COMPUTER_USE_BROWSER_MODE='headless';delete process.env.OPEN_COMPUTER_USE_CDP_URL;
 for(const Session of [runtime.WorkerJavaScriptSession,runtime.PersistentJavaScriptSession]){
  const session=new Session({native});manager=session.browserRuntime;
  try{
   await run(session,`var tab=await cua.createBrowserTab('cdp',${JSON.stringify(url)},{visible:false});await tab.markHandoff();await tab.playwright.getByRole('button',{name:'Confirm',exact:true}).click();var dialog=await tab.getJsDialog();nodeRepl.write(JSON.stringify(tab.id));`);
   await pause(11000);assert.equal(await run(session,"await dialog.accept();nodeRepl.write(JSON.stringify(await tab.playwright.locator('output').innerText()));"),'true');
   await run(session,"await tab.playwright.getByRole('button',{name:'Sequential'}).click({timeoutMs:3000});var first=await tab.getJsDialog();nodeRepl.write(JSON.stringify(true));");await pause(3500);
   await run(session,"await first.accept('one');var second=await tab.getJsDialog();nodeRepl.write(JSON.stringify(true));");await pause(3500);
   assert.equal(await run(session,"await second.accept('two');nodeRepl.write(JSON.stringify(await tab.playwright.locator('output').innerText()));"),'one two');
   await run(session,`var choosing=tab.playwright.waitForEvent('filechooser');await tab.playwright.getByLabel('Upload').click();await(await choosing).setFiles(${JSON.stringify(upload)},{timeoutMs:3000});var uploaded=await tab.getJsDialog();nodeRepl.write(JSON.stringify(uploaded.type));`);await pause(3500);
   assert.equal(await run(session,"await uploaded.accept('file');nodeRepl.write(JSON.stringify(await tab.playwright.locator('output').innerText()));"),'file');
   const missing=await session.run("await tab.playwright.getByRole('button',{name:'Missing'}).click({timeoutMs:100});");assert.equal(missing.isError,true);assert.match(missing.content.at(-1).text,/Timeout 100ms/);
   await run(session,"await tab.playwright.getByRole('button',{name:'Navigate'}).click({timeoutMs:3000});var navigation=await tab.getJsDialog();nodeRepl.write(JSON.stringify(true));");await pause(3500);
   const responding=session.run('await navigation.accept();');responding.catch(()=>{});await pause(3500);for(const response of pendingResponses)response.end('<title>Settled navigation</title>');const resumed=await responding;assert.equal(resumed.isError,true);assert.match(resumed.content.at(-1).text,/Timeout 3000ms/);
   await run(session,'await tab.close();nodeRepl.write(JSON.stringify(true));');
   const restored=await run(session,`var tab=await cua.createBrowserTab('cdp',${JSON.stringify(url)},{visible:false});await tab.markHandoff();nodeRepl.write(JSON.stringify(tab.id));`);
   const reset=await session.run("await tab.playwright.getByRole('button',{name:'Missing'}).click({timeoutMs:0});",150);assert.equal(reset.isError,true);assert.match(reset.content.at(-1).text,/timed out/);await session.reset();
   assert.equal(session.browserDialogs.waiters.size,0);assert.equal(session.browserFocusLeases.entries.size,0);
   assert.equal(await run(session,`var tab=await cua.getTab(${JSON.stringify(restored)});nodeRepl.write(JSON.stringify(await tab.playwright.locator('output').innerText()));`),'Ready');await run(session,'await tab.close();nodeRepl.write(JSON.stringify(true));');
   console.log(`${Session.name} PASS >10s confirm, repeated dialog pauses, file selection dialog, bounded missing/resumed navigation and timeout=0 reset cleanup`);
  }finally{await session.close();}
 }
}finally{await manager?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(scratch,{recursive:true,force:true});for(const key of ['OPEN_COMPUTER_USE_CDP_URL','OPEN_COMPUTER_USE_BROWSER_EXECUTABLE','OPEN_COMPUTER_USE_BROWSER_MODE']){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
