// Owns only its browser profile, fixture server and JavaScript kernels.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
const runtime=await import(process.argv[2]?pathToFileURL(path.join(process.argv[2],'scripts/open-computer-use-repl.mjs')).href:'./node-repl/open-computer-use-repl.mjs');
const binary=process.env.OCU_TEST_CHROME_EXECUTABLE;assert.ok(binary,'Set OCU_TEST_CHROME_EXECUTABLE');
const scratch=await mkdtemp(path.join(tmpdir(),'ocu-kernel-budget-')),saved={...process.env},events=new Map();let manager;
const server=createServer((request,response)=>{
 const url=new URL(request.url,'http://fixture');response.setHeader('Content-Type','application/json');
 if(url.pathname==='/event'){const slot=url.searchParams.get('slot');events.get(slot)?.push({kind:url.searchParams.get('kind'),key:url.searchParams.get('key'),trusted:url.searchParams.get('trusted')==='true'});response.end('{}');return;}
 if(url.pathname==='/state'){response.end(JSON.stringify(events.get(url.searchParams.get('slot'))??[]));return;}
 const slot=url.pathname.slice(1);response.setHeader('Content-Type','text/html');response.end(`<!doctype html><label>Field<input></label><script>for(const [name,kind] of [['keydown','down'],['keyup','up']])addEventListener(name,e=>fetch('/event?slot=${slot}&kind='+kind+'&key='+encodeURIComponent(e.key)+'&trusted='+e.isTrusted));</script>`);
});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
async function run(session,code){const result=await session.run(code,30000);assert.equal(result.isError,false,result.content.at(-1)?.text);return JSON.parse(result.content.at(-1).text);}
async function until(check,label){const deadline=Date.now()+5000;for(;;){if(await check())return;assert.ok(Date.now()<deadline,label);await new Promise(resolve=>setTimeout(resolve,10));}}
try{
 let executable=path.resolve(binary);if(process.platform==='linux'){const quoted="'"+executable.replaceAll("'","'\\''")+"'";executable=path.join(scratch,'owned-chrome');await writeFile(executable,`#!/bin/sh\nexec ${quoted} --no-sandbox "$@" --enable-features=WebMCP,CDPScreenshotNewSurface\n`,{mode:0o700});}
 process.env.OPEN_COMPUTER_USE_BROWSER_EXECUTABLE=executable;process.env.OPEN_COMPUTER_USE_BROWSER_MODE='headless';delete process.env.OPEN_COMPUTER_USE_CDP_URL;
 for(const [index,Session] of [runtime.PersistentJavaScriptSession,runtime.WorkerJavaScriptSession].entries()){
  const session=new Session({native:{async request(){throw Error('Desktop unused');}}});manager=session.browserRuntime;const slot=String(index);events.set(slot,[]);
  try{
   const id=await run(session,`var tab=await cua.createBrowserTab('cdp',${JSON.stringify(origin+'/'+slot)},{visible:false});await tab.markHandoff();await tab.playwright.getByLabel('Field').click();var marker=17;nodeRepl.write(JSON.stringify(tab.id));`);
   const execution=session.run(`var held=tab.pressKey(null,'shift',{durationMs:10000});held.catch(()=>{});while(!(await(await fetch(${JSON.stringify(origin+'/state?slot='+slot)})).json()).some(event=>event.kind==='down'))await new Promise(resolve=>setTimeout(resolve,10));while(true){}`,2000);
   await until(()=>events.get(slot).some(event=>event.kind==='down'&&event.trusted),'Held key was never accepted');
   const expired=await execution;assert.equal(expired.isError,true);assert.match(expired.content.at(-1).text,/execution timed out/);
   await until(()=>events.get(slot).some(event=>event.kind==='up'&&event.key==='Shift'&&event.trusted),'CPU timeout failed to release the accepted key');
   assert.equal(await run(session,'nodeRepl.write(JSON.stringify(typeof marker));'),'undefined');
   assert.equal(await run(session,`var tab=await cua.getTab(${JSON.stringify(id)});await tab.markHandoff();await tab.playwright.getByLabel('Field').fill('recovered');nodeRepl.write(JSON.stringify(await tab.playwright.getByLabel('Field').inputValue()));`),'recovered');
   const image=await session.run('await tab.getScreenshot();');assert.equal(image.isError,false,image.content.at(-1)?.text);const png=image.content.find(item=>item.type==='image');assert.ok(png);assert.equal(Buffer.from(png.data,'base64').subarray(0,8).toString('hex'),'89504e470d0a1a0a');
   console.log(`${Session.name} PASS accepted trusted key release on CPU timeout, fresh variables, retained tab, recovered input and screenshot media`);
  }finally{await session.close();}
 }
}finally{await manager?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(scratch,{recursive:true,force:true});for(const key of ['OPEN_COMPUTER_USE_CDP_URL','OPEN_COMPUTER_USE_BROWSER_EXECUTABLE','OPEN_COMPUTER_USE_BROWSER_MODE']){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
