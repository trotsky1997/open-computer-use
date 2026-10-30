// Use an owned disposable Chrome 158+ profile with WebMCP enabled.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {chromium} from 'playwright-core';
import {WorkerJavaScriptSession,PersistentJavaScriptSession} from './node-repl/open-computer-use-repl.mjs';
const endpoint=process.env.OPEN_COMPUTER_USE_CDP_URL;
if(!endpoint)throw Error('Set OPEN_COMPUTER_USE_CDP_URL to an owned disposable WebMCP browser');
const missing=process.argv.includes('--missing-native');
const server=createServer((req,res)=>{
 res.setHeader('Content-Type','text/html');
 const child=req.url.startsWith('/child'),empty=req.url.startsWith('/empty');
 res.end(`<title>Owned WebMCP fixture</title><p id="status">Ready</p>${!child&&!empty?'<form toolname="submit_echo" tooldescription="Submit an owned fixture value" toolautosubmit action="/empty" method="get"><input name="text" type="text" required><button type="submit">Submit fixture</button></form>':''}${!child&&!empty?`<iframe src="/child"></iframe><iframe src="/child"></iframe><iframe src="http://localhost:${server.address().port}/child" allow="tools"></iframe><iframe src="http://localhost:${server.address().port}/empty"></iframe>`:''}<script>
 globalThis.fixture={calls:0,aborted:0,started:0,controller:new AbortController()};
 const mc=document.modelContext,token=crypto.randomUUID();
 fixture.ready=(async()=>{if(!mc||${empty})return;
 await mc.registerTool({name:${JSON.stringify(child?'frame_echo':'echo')},description:'Owned echo fixture',inputSchema:{type:'object',properties:{text:{type:'string'}},required:['text']},annotations:{readOnlyHint:true},execute:({text})=>{if(typeof text!=='string')throw Error('Fixture text must be a string');fixture.calls++;return {content:[{type:'text',text:${child?"token+':'+text":"text"}}]};}},{signal:fixture.controller.signal});
 ${!child?`await mc.registerTool({name:'slow',description:'Owned cancelable wait',inputSchema:{type:'object'},execute:async(_input,{signal})=>{fixture.started++;await new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>{fixture.aborted++;reject(Error('Stopped'));},{once:true});});return 'unused';}});
 await mc.registerTool({name:'navigate',description:'Owned fixture navigation',inputSchema:{type:'object'},execute:()=>{location.href='/empty';return new Promise(()=>{});}});`:''}
 })();fixture.replace=async()=>{fixture.controller.abort();await mc.registerTool({name:${JSON.stringify(child?'frame_echo':'echo')},description:'Replacement',inputSchema:{type:'object'},execute:()=>{fixture.calls++;return 'replacement';}});};
 </script>`);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}/`;
const browser=await chromium.connectOverCDP(endpoint,{noDefaults:true}),native={async request(){throw Error('native unused');}};
async function run(session,code){const result=await session.run(code,30000);assert.equal(result.isError,false,result.content.at(-1).text);return JSON.parse(result.content.at(-1).text);}
function listing(text){const start=text.indexOf('['),end=text.lastIndexOf(']');return start<0?[]:JSON.parse(text.slice(start,end+1));}
try{
 for(const Session of [WorkerJavaScriptSession,PersistentJavaScriptSession]){
  const session=new Session({native});let page;
  try{
   const id=await run(session,`var b=await cua.getBrowser({id:'cdp'});var tab=await b.tabs.new();await tab.goto(${JSON.stringify(url)});await tab.markHandoff();nodeRepl.write(JSON.stringify(tab.id));`);
   for(const context of browser.contexts())for(const candidate of context.pages()){const cdp=await context.newCDPSession(candidate);try{if((await cdp.send('Target.getTargetInfo')).targetInfo.targetId===id)page=candidate;}finally{await cdp.detach();}}
   assert.ok(page);await page.waitForURL(url,{waitUntil:'load'});for(const frame of page.frames())await frame.evaluate(()=>fixture.ready);
   if(missing){assert.equal(await run(session,`var cap=await tab.capabilities.get('webmcp');var failed=false;try{await cap.fetchTools();}catch(e){failed=/Native WebMCP is unavailable/.test(e.message);}nodeRepl.write(JSON.stringify(failed));`),true);console.log(`${Session.name} PASS explicit missing-native failure`);continue;}
   // Main-world API spoofing cannot replace the isolated native API.
   await page.evaluate(()=>Object.defineProperty(document,'modelContext',{value:{getTools(){throw Error('Page spoof');}}}));
   const tools=listing(await run(session,`var cap=await tab.capabilities.get('webmcp');var tools=await cap.fetchTools();nodeRepl.write(JSON.stringify(tools.description()));`));
   const echo=tools.find(tool=>tool.name.startsWith('echo__')),frames=tools.filter(tool=>tool.name.startsWith('frame_echo__')),slow=tools.find(tool=>tool.name.startsWith('slow__')),navigate=tools.find(tool=>tool.name.startsWith('navigate__'));
   assert.ok(echo&&slow&&navigate);assert.equal(frames.length,3);assert.ok(frames.some(tool=>tool.origin.startsWith('http://localhost:')));
   assert.equal(await run(session,`nodeRepl.write(JSON.stringify(await tools.call(${JSON.stringify(echo.name)},{text:'你好'})));`),JSON.stringify({content:[{type:'text',text:'你好'}]}));
   const beforeInvalid=await page.evaluate(()=>fixture.calls);assert.equal(await run(session,`var invalid=false;try{await tools.call(${JSON.stringify(echo.name)},{});}catch(e){invalid=/Tool execution failed/.test(e.message);}nodeRepl.write(JSON.stringify(invalid));`),true);assert.equal(await page.evaluate(()=>fixture.calls),beforeInvalid);
   const outputs=[];for(const tool of frames)outputs.push(await run(session,`nodeRepl.write(JSON.stringify(await tools.call(${JSON.stringify(tool.name)},{text:'frame'})));`));assert.equal(new Set(outputs).size,3);
   assert.equal(await run(session,`var denied=false;try{await tools.call('guessed',{});}catch(e){denied=/Unknown WebMCP/.test(e.message);}nodeRepl.write(JSON.stringify(denied));`),true);
   await page.evaluate(()=>fixture.replace());const calls=await page.evaluate(()=>fixture.calls);
   assert.equal(await run(session,`var stale=false;try{await tools.call(${JSON.stringify(echo.name)},{text:'stale'});}catch(e){stale=true;}nodeRepl.write(JSON.stringify(stale));`),true);assert.equal(await page.evaluate(()=>fixture.calls),calls);
   const fresh=listing(await run(session,`var fresh=await cap.fetchTools();nodeRepl.write(JSON.stringify(fresh.description()));`)),replacement=fresh.find(tool=>tool.name.startsWith('echo__'));
   assert.notEqual(replacement.name,echo.name);assert.equal(await run(session,`nodeRepl.write(JSON.stringify(await fresh.call(${JSON.stringify(replacement.name)},{})));`),'replacement');
   await run(session,`var pending=tools.call(${JSON.stringify(slow.name)},{}).catch(()=>{});nodeRepl.write(JSON.stringify(true));`);
   await page.waitForFunction(()=>fixture.started===1);const started=Date.now();await session.endTurn();assert.ok(Date.now()-started<5000);await page.waitForFunction(()=>fixture.aborted===1);
   assert.equal(session.browserWebMcp.owners.size,0);
   assert.equal(await run(session,`var stale=false;try{await tools.call(${JSON.stringify(slow.name)},{});}catch(e){stale=/Stale|unknown|turn ended/.test(e.message);}nodeRepl.write(JSON.stringify(stale));`),true);
   const next=listing(await run(session,`var next=await cap.fetchTools();nodeRepl.write(JSON.stringify(next.description()));`)),nav=next.find(tool=>tool.name.startsWith('navigate__'));
   assert.equal(await run(session,`nodeRepl.write(JSON.stringify(await next.call(${JSON.stringify(nav.name)},{})));`),null);
   await page.waitForURL(url+'empty');
   assert.equal(await run(session,`var stale=false;try{await next.call(${JSON.stringify(nav.name)},{});}catch(e){stale=true;}nodeRepl.write(JSON.stringify(stale));`),true);
   assert.equal(await run(session,`var empty=await cap.fetchTools();nodeRepl.write(JSON.stringify(empty.description()));`),'No WebMCP tools are available in this document.');
   await run(session,`await tab.goto(${JSON.stringify(url+'form')});nodeRepl.write(JSON.stringify(true));`);await page.waitForURL(url+'form',{waitUntil:'load'});for(const frame of page.frames())await frame.evaluate(()=>fixture.ready);
   const formTools=listing(await run(session,`var formTools=await cap.fetchTools();nodeRepl.write(JSON.stringify(formTools.description()));`)),form=formTools.find(tool=>tool.name.startsWith('submit_echo__'));assert.ok(form);
   assert.equal(await run(session,`nodeRepl.write(JSON.stringify(await formTools.call(${JSON.stringify(form.name)},{text:'owned-form-value'})));`),null);await page.waitForURL(url+'empty?text=owned-form-value');
   await session.reset();assert.equal(session.browserWebMcp.owners.size,0);
   console.log(`${Session.name} PASS native tools, isolated API, exact same-URL/OOP frames, stale replacement/turn/navigation, provider validation errors, cancellation, declarative form and empty listing`);
  }finally{await session.close();await page?.close();}
 }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
