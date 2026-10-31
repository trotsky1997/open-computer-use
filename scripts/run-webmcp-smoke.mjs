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
 const child=req.url.startsWith('/child'),empty=req.url.startsWith('/empty'),cancellation=req.url.startsWith('/cancel');
 res.end(`<title>Owned WebMCP fixture</title><p id="status">Ready</p>${!child&&!empty?'<form toolname="submit_echo" tooldescription="Submit an owned fixture value" toolautosubmit action="/empty" method="get"><input name="text" type="text" required><button type="submit">Submit fixture</button></form>':''}${!child&&!empty&&!cancellation?`<iframe src="/child"></iframe><iframe src="/child"></iframe><iframe src="http://localhost:${server.address().port}/child" allow="tools"></iframe><iframe src="http://localhost:${server.address().port}/empty"></iframe>`:''}<script>
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
let browser=await chromium.connectOverCDP(endpoint,{noDefaults:true});const native={async request(){throw Error('native unused');}};
async function run(session,code){const result=await session.run(code,30000);assert.equal(result.isError,false,result.content.at(-1).text);return JSON.parse(result.content.at(-1).text);}
async function until(fn){const end=Date.now()+5000;while(!fn()){assert.ok(Date.now()<end,'Native tool notice did not arrive');await new Promise(resolve=>setTimeout(resolve,20));}}
async function settleNotices(session){
 const states=[...session.browserWebMcp.owners.values()];await Promise.all(states.flatMap(state=>[...state.observers.values()].map(entry=>entry.sync)));
 const sessions=new Set(states.flatMap(state=>[...state.collections.values(),...state.observers.values()].flatMap(entry=>[...entry.watchers.keys()])));
 await Promise.all([...sessions].map(session=>session.send('Page.getFrameTree')));
}
async function targetPage(id){for(const context of browser.contexts())for(const page of context.pages()){const cdp=await context.newCDPSession(page);try{if((await cdp.send('Target.getTargetInfo')).targetInfo.targetId===id)return page;}finally{await cdp.detach();}}throw Error('Owned fixture page is missing');}
function listing(text){const start=text.indexOf('['),end=text.lastIndexOf(']');return start<0?[]:JSON.parse(text.slice(start,end+1));}
try{
 for(const Session of [WorkerJavaScriptSession,PersistentJavaScriptSession]){
  const session=new Session({native});let page;
  try{
   const initial=await session.run(`var b=await cua.getBrowser({id:'cdp'});var tab=await b.tabs.new();await tab.goto(${JSON.stringify(url)});await tab.markHandoff();nodeRepl.write(JSON.stringify(tab.id));`);assert.equal(initial.isError,false);let id=JSON.parse(initial.content.at(-1).text);
   page=await targetPage(id);
   assert.ok(page);await page.waitForURL(url,{waitUntil:'load'});for(const frame of page.frames())await frame.evaluate(()=>fixture.ready);
   if(missing){assert.equal(await run(session,`var cap=await tab.capabilities.get('webmcp');var failed=false;try{await cap.fetchTools();}catch(e){failed=/Native WebMCP is unavailable/.test(e.message);}nodeRepl.write(JSON.stringify(failed));`),true);console.log(`${Session.name} PASS explicit missing-native failure`);continue;}
   assert.equal([...session.browserWebMcp.owners.values()].reduce((n,state)=>n+state.collections.size,0),0,'Discovery fetched callable handles');
   if(!initial.content.some(item=>item._meta?.id==='cua.webmcp')){await until(()=>[...session.browserWebMcp.owners.values()].some(state=>state.notifications.has(id)));const discovered=await session.run('nodeRepl.write("initial-discovery")');assert.equal(discovered.content.filter(item=>item._meta?.id==='cua.webmcp').length,1);}
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
   await until(()=>[...session.browserWebMcp.owners.values()].some(state=>state.notifications.has(id)));
   const notice=await session.run('nodeRepl.write("notice-check")');assert.equal(notice.isError,false);assert.equal(notice.content.filter(item=>item._meta?.id==='cua.webmcp').length,1);assert.match(notice.content[0].text,new RegExp(id));assert.equal(notice.content.at(-1).text,'notice-check');
   assert.equal(await run(session,`var stale=false;try{await tools.call(${JSON.stringify(echo.name)},{text:'stale'});}catch(e){stale=true;}nodeRepl.write(JSON.stringify(stale));`),true);assert.equal(await page.evaluate(()=>fixture.calls),calls);
   const fresh=listing(await run(session,`var fresh=await cap.fetchTools();nodeRepl.write(JSON.stringify(fresh.description()));`)),replacement=fresh.find(tool=>tool.name.startsWith('echo__'));
   assert.notEqual(replacement.name,echo.name);assert.equal(await run(session,`nodeRepl.write(JSON.stringify(await fresh.call(${JSON.stringify(replacement.name)},{})));`),'replacement');
   for(const frame of page.frames().filter(frame=>new URL(frame.url()).pathname==='/child'))await frame.evaluate(()=>fixture.replace());
   await settleNotices(session);await until(()=>[...session.browserWebMcp.owners.values()].some(state=>state.notifications.has(id)));
   const childNotice=await session.run('nodeRepl.write("child-notice")');assert.equal(childNotice.content.filter(item=>item._meta?.id==='cua.webmcp').length,1);
   assert.equal((await session.run('nodeRepl.write("drained")')).content.filter(item=>item._meta?.id==='cua.webmcp').length,0);
   const unrelated=await page.context().newPage();try{await unrelated.goto(url+'cancel?unrelated');await unrelated.evaluate(()=>fixture.ready);await unrelated.evaluate(()=>fixture.replace());const isolated=await session.run('nodeRepl.write("unrelated")');assert.equal(isolated.content.filter(item=>item._meta?.id==='cua.webmcp').length,0,JSON.stringify({content:isolated.content,observers:[...session.browserWebMcp.owners.values()].flatMap(state=>[...state.observers.values()].map(entry=>({incomplete:entry.incomplete,frames:entry.frames.size,watchers:entry.watchers.size})))}));const cdp=await unrelated.context().newCDPSession(unrelated);let preexistingId;try{preexistingId=(await cdp.send('Target.getTargetInfo')).targetInfo.targetId;}finally{await cdp.detach();}const bound=await session.run(`var prebound=await b.tabs.get(${JSON.stringify(preexistingId)});nodeRepl.write("bound-existing")`);assert.equal(bound.isError,false);assert.ok(bound.content.some(item=>item._meta?.id==='cua.webmcp'&&item.text.includes(preexistingId)));}finally{await unrelated.close();}
   for(const late of [url+'child?late',url.replace('127.0.0.1','localhost')+'child?late']){
    const navigated=page.waitForEvent('framenavigated',{predicate:frame=>frame.url()===late});await page.evaluate(src=>{const frame=document.createElement('iframe');frame.allow='tools';frame.src=src;document.body.append(frame);},late);
    const frame=await navigated;await frame.waitForLoadState('load');await frame.evaluate(()=>fixture.ready);await until(()=>[...session.browserWebMcp.owners.values()].some(state=>state.notifications.has(id)));
    const discovered=await session.run('nodeRepl.write("late-frame")');assert.equal(discovered.content.filter(item=>item._meta?.id==='cua.webmcp').length,1);
   }
   const active=listing(await run(session,`var active=await cap.fetchTools();nodeRepl.write(JSON.stringify(active.description()));`)),activeSlow=active.find(tool=>tool.name.startsWith('slow__'));assert.ok(activeSlow);
   await run(session,`var pending=active.call(${JSON.stringify(activeSlow.name)},{}).catch(()=>{});nodeRepl.write(JSON.stringify(true));`);
   await page.waitForFunction(()=>fixture.started===1);const started=Date.now();await session.endTurn();assert.ok(Date.now()-started<5000);await page.waitForFunction(()=>fixture.aborted===1);
   assert.equal(session.browserWebMcp.owners.size,0);
   const resumed=await session.run('await tab.getAXState({emit:false});nodeRepl.write("resumed")');assert.equal(resumed.isError,false);assert.equal([...session.browserWebMcp.owners.values()].reduce((n,state)=>n+state.observers.size,0),1);assert.equal([...session.browserWebMcp.owners.values()].reduce((n,state)=>n+state.collections.size,0),0);
   assert.equal(await run(session,`var stale=false;try{await tools.call(${JSON.stringify(slow.name)},{});}catch(e){stale=/Stale|unknown|turn ended/.test(e.message);}nodeRepl.write(JSON.stringify(stale));`),true);
   const next=listing(await run(session,`var next=await cap.fetchTools();nodeRepl.write(JSON.stringify(next.description()));`)),nav=next.find(tool=>tool.name.startsWith('navigate__'));
   assert.equal(await run(session,`nodeRepl.write(JSON.stringify(await next.call(${JSON.stringify(nav.name)},{})));`),null);
   await page.waitForURL(url+'empty');
   assert.equal(await run(session,`var stale=false;try{await next.call(${JSON.stringify(nav.name)},{});}catch(e){stale=true;}nodeRepl.write(JSON.stringify(stale));`),true);
   assert.equal(await run(session,`var empty=await cap.fetchTools();nodeRepl.write(JSON.stringify(empty.description()));`),'No WebMCP tools are available in this document.');
   await run(session,`await tab.goto(${JSON.stringify(url+'form')});nodeRepl.write(JSON.stringify(true));`);await page.waitForURL(url+'form',{waitUntil:'load'});await page.evaluate(()=>fixture.ready);
   const formTools=listing(await run(session,`var formTools=await cap.fetchTools();nodeRepl.write(JSON.stringify(formTools.description()));`)),form=formTools.find(tool=>tool.name.startsWith('submit_echo__'));assert.ok(form);
   assert.equal(await run(session,`nodeRepl.write(JSON.stringify(await formTools.call(${JSON.stringify(form.name)},{text:'owned-form-value'})));`),null);await page.waitForURL(url+'empty?text=owned-form-value');
   await session.reset();assert.equal(session.browserWebMcp.owners.size,0);
   for(const ending of ['crash','reload','reset','close']){
    await run(session,`var b=await cua.getBrowser({id:'cdp'});var tab=await b.tabs.get(${JSON.stringify(id)});await tab.markHandoff();await tab.goto(${JSON.stringify(url+'cancel?'+ending)});nodeRepl.write(JSON.stringify(true));`);
    await page.waitForURL(url+'cancel?'+ending,{waitUntil:'load'});await page.evaluate(()=>fixture.ready);
    const current=listing(await run(session,`var cap=await tab.capabilities.get('webmcp');var current=await cap.fetchTools();nodeRepl.write(JSON.stringify(current.description()));`)),waiting=current.find(tool=>tool.name.startsWith('slow__'));assert.ok(waiting);
    await run(session,`var pending=current.call(${JSON.stringify(waiting.name)},{}).catch(error=>error.message);nodeRepl.write(JSON.stringify(true));`);await page.waitForFunction(()=>fixture.started===1);
    if(ending==='crash'||ending==='reload'){
     const cdp=await page.context().newCDPSession(page),crashed=page.waitForEvent('crash',{timeout:5000});void cdp.send('Page.crash').catch(()=>{});await crashed;assert.match(await run(session,'nodeRepl.write(JSON.stringify(await pending));'),/renderer crashed/);
     if(ending==='reload'){
      const reload=await session.run('await tab.reload();await tab.playwright.waitForLoadState({timeoutMs:5000});nodeRepl.write(JSON.stringify(tab.id));');assert.equal(reload.isError,false,JSON.stringify(reload.content));assert.equal(JSON.parse(reload.content.at(-1).text),id);
      void cdp.detach().catch(()=>{});await browser.close();browser=await chromium.connectOverCDP(endpoint,{noDefaults:true});page=await targetPage(id);await page.waitForLoadState('load');await page.evaluate(()=>fixture.ready);
      assert.equal((await session.run(`await current.call(${JSON.stringify(waiting.name)},{});`)).isError,true);assert.equal(await page.evaluate(()=>fixture.started),0);
      await page.evaluate(()=>document.modelContext.registerTool({name:'recovered_echo',description:'Owned same-tab recovery',inputSchema:{type:'object'},execute:()=> 'same-tab-ready'}));await settleNotices(session);await until(()=>[...session.browserWebMcp.owners.values()].some(state=>state.notifications.has(id)));
      const notice=await session.run('nodeRepl.write("reload-notice")');assert.equal(notice.content.filter(item=>item._meta?.id==='cua.webmcp').length,1);
      const reloaded=listing(await run(session,`var reloaded=await cap.fetchTools();nodeRepl.write(JSON.stringify(reloaded.description()));`)),echo=reloaded.find(tool=>tool.name.startsWith('recovered_echo__'));assert.ok(echo);assert.equal(await run(session,`nodeRepl.write(JSON.stringify(await reloaded.call(${JSON.stringify(echo.name)},{})));`),'same-tab-ready');continue;
     }
     let timer;try{await Promise.race([session.reset(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Crashed WebMCP cleanup did not finish within 15000 ms')),15000);})]);}finally{clearTimeout(timer);}
     assert.equal(session.browserWebMcp.owners.size,0);void cdp.detach().catch(()=>{});await page.close();
     const previousId=id;id=await run(session,`var b=await cua.getBrowser({id:'cdp'});var tab=await b.tabs.new();await tab.goto(${JSON.stringify(url+'cancel?recovered')});await tab.markHandoff();nodeRepl.write(JSON.stringify(tab.id));`);assert.notEqual(id,previousId);page=await targetPage(id);await page.waitForURL(url+'cancel?recovered',{waitUntil:'load'});await page.evaluate(()=>fixture.ready);
     const recovered=listing(await run(session,`var cap=await tab.capabilities.get('webmcp');var recovered=await cap.fetchTools();nodeRepl.write(JSON.stringify(recovered.description()));`)),echo=recovered.find(tool=>tool.name.startsWith('echo__'));assert.ok(echo);assert.equal(await run(session,`nodeRepl.write(JSON.stringify(await recovered.call(${JSON.stringify(echo.name)},{text:'after-crash'})));`),JSON.stringify({content:[{type:'text',text:'after-crash'}]}));
    }else{await session[ending]();await page.waitForFunction(()=>fixture.aborted===1);assert.equal(session.browserWebMcp.owners.size,0);}
   }
   console.log(`${Session.name} PASS native tools, isolated API, exact same-URL/OOP frames, stale replacement/turn/navigation, provider validation errors, initial and late-frame discovery, coalesced main/child/OOP tool-change notices, renderer crash/reset, fresh-tab and same-tab reload recovery, turn/reset/close native cancellation settlement, declarative form and empty listing`);
  }finally{await page?.close();await session.close();}
 }
}finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
