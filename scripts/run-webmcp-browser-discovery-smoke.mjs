// Owns its fixture pages; discovery must leave their tab ownership and tool calls untouched.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {chromium} from 'playwright-core';
const endpoint=process.env.OPEN_COMPUTER_USE_CDP_URL;if(!endpoint)throw Error('Set OPEN_COMPUTER_USE_CDP_URL to an owned Chrome 158+ instance');
const runtime=await import(process.argv[2]?pathToFileURL(path.join(process.argv[2],'scripts/open-computer-use-repl.mjs')).href:'./node-repl/open-computer-use-repl.mjs');
const server=createServer((_request,response)=>{response.setHeader('Content-Type','text/html');response.end(`<title>Owned discovery fixture</title><p>Owned browser discovery</p><script>window.calls=0;window.register=async()=>document.modelContext.registerTool({name:'owned_echo',description:'Owned discovery echo',inputSchema:{type:'object'},execute:()=>{window.calls++;return 'owned result';}});</script>`);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}/`;
const browser=await chromium.connectOverCDP(endpoint,{noDefaults:true}),context=browser.contexts()[0];
const native={async request(){throw Error('Native desktop must remain unused');}};
async function id(page){const cdp=await context.newCDPSession(page);try{return (await cdp.send('Target.getTargetInfo')).targetInfo.targetId;}finally{await cdp.detach();}}
async function ready(page){await page.waitForLoadState('load');await page.evaluate(()=>window.register());}
async function until(check,label){const deadline=Date.now()+15000;while(!check()){assert.ok(Date.now()<deadline,label);await new Promise(resolve=>setTimeout(resolve,20));}}
async function run(session,code){const result=await session.run(code,30000);assert.equal(result.isError,false,result.content.at(-1)?.text);return result;}
function state(session){const owner=session.resourceOwner??session.resourceOwners.get(session.worker);return session.browserWebMcp.owners.get(owner);}
function notice(result,target){return result.content.some(item=>item._meta?.id==='cua.webmcp'&&item.text.includes(target));}
try{
 for(const Session of [runtime.WorkerJavaScriptSession,runtime.PersistentJavaScriptSession]){
  const page=await context.newPage();let late;const session=new Session({native});
  try{
   await page.goto(url);await ready(page);const first=await id(page);
   const initial=await run(session,'await cua.listBrowsers({emit:false});nodeRepl.write("inventory");');
   assert.ok(notice(initial,first),'Initial inventory missed an unbound page');assert.equal(state(session).collections.size,0);
   assert.equal(await page.evaluate(()=>window.calls),0,'Discovery executed a tool');
   assert.equal([...session.browserTabs.browsers.values()].some(entry=>entry.tabs.has(first)),false,'Discovery claimed an existing tab');
   late=await context.newPage();await late.goto(url+'late');await ready(late);const later=await id(late);
   await until(()=>state(session).notifications.has(later),'New unbound tab notice missing');assert.ok(notice(await run(session,'nodeRepl.write("later");'),later));
   await late.goto('about:blank');await until(()=>!state(session).observers.has(later),'Non-web target observer was retained');
   await late.goto(url+'returned');await ready(late);await until(()=>state(session).notifications.has(later),'Navigated unbound tab was not rediscovered');
   assert.ok(notice(await run(session,'nodeRepl.write("returned");'),later));
   await late.close();late=undefined;await until(()=>!state(session).observers.has(later),'Closed unbound tab observer was retained');
   const output=await run(session,`var tab=await cua.getTab(${JSON.stringify(first)});var tools=await(await tab.capabilities.get('webmcp')).fetchTools();nodeRepl.write(tools.description());`);
   const text=output.content.at(-1).text,start=text.indexOf('[\n'),end=text.indexOf('\nCall tools.call');
   const listing=JSON.parse(text.slice(start,end));assert.equal(listing.length,1);
   await run(session,`nodeRepl.write(await tools.call(${JSON.stringify(listing[0].name)},{}));`);assert.equal(await page.evaluate(()=>window.calls),1);
   await session.endTurn();assert.equal(session.browserWebMcp.owners.size,0);assert.equal(page.isClosed(),false);
   const resumed=await run(session,'await cua.listTabs({emit:false});nodeRepl.write("resumed");');assert.ok(notice(resumed,first));assert.equal(state(session).collections.size,0);
   await session.reset();assert.equal(session.browserWebMcp.owners.size,0);assert.equal(page.isClosed(),false);
   const reset=await run(session,'await cua.listBrowsers({emit:false});nodeRepl.write("reset");');assert.ok(notice(reset,first));
   assert.equal(await page.evaluate(()=>window.calls),1);console.log(`${Session.name} PASS browser-wide initial/new/navigated/closed unbound discovery, no claims/calls, explicit tool call and turn/reset resubscription`);
  }finally{await session.close();await late?.close();await page.close();}
 }
}finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
