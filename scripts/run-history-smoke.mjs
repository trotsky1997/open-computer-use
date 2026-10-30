// Use only an owned disposable profile. Positive tests seed synthetic history.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright-core';
import {WorkerJavaScriptSession,PersistentJavaScriptSession} from './node-repl/open-computer-use-repl.mjs';
const endpoint=process.env.OPEN_COMPUTER_USE_CDP_URL,denied=process.argv.includes('--permission-denied');
if(!endpoint)throw Error('Set OPEN_COMPUTER_USE_CDP_URL to disposable Chromium with the bundled extension');
const native={async request(){throw Error('native unused');}};
async function run(session,code){const result=await session.run(code,30000);assert.equal(result.isError,false,result.content.at(-1).text);return JSON.parse(result.content.at(-1).text);}
for(const Session of [WorkerJavaScriptSession,PersistentJavaScriptSession]){
 const session=new Session({native});
 try{
  await run(session,`var b=await cua.getBrowser({id:'cdp'});nodeRepl.write(JSON.stringify(true));`);
  if(denied){
   assert.equal(await run(session,`var denied=false;try{await b.history({queries:['ocu-owned-fixture']});}catch(e){denied=/History access is disabled/.test(e.message);}nodeRepl.write(JSON.stringify(denied));`),true);
   const browser=await chromium.connectOverCDP(endpoint,{noDefaults:true});
   try{const page=await browser.contexts()[0].newPage();try{await page.goto('chrome-extension://mbhbomghoccgpofpfkkfiaonndokcbpj/options.html');await page.waitForFunction(()=>document.querySelector('#status').textContent==='History access is disabled.');assert.equal(await page.locator('#enable').isEnabled(),true);assert.equal(await page.locator('#disable').isEnabled(),false);}finally{await page.close();}}finally{await browser.close();}
   console.log(`${Session.name} PASS production optional permission denial and options status`);continue;
  }
  await run(session,`nodeRepl.write(JSON.stringify(await b.history({queries:['ocu-owned-fixture']})));`);
  const entry=[...session.browserChrome.owners.values()][0],connection=entry.connection,sid=entry.sessionId;
  const evaluate=async(expression,awaitPromise=true)=>{const result=await connection.send('Runtime.evaluate',{expression,awaitPromise,returnByValue:true},10000,sid);if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description??result.exceptionDetails.text);return result.result.value;};
  const token=`ocu-owned-fixture-${randomUUID()}`,alpha=`https://example.test/${token}/alpha`,beta=`https://example.test/${token}/beta`,from=Date.now()-1000;
  await evaluate(`chrome.history.addUrl({url:${JSON.stringify(alpha)}})`);await new Promise(resolve=>setTimeout(resolve,60));
  await evaluate(`chrome.history.addUrl({url:${JSON.stringify(beta)}})`);await new Promise(resolve=>setTimeout(resolve,60));const to=Date.now();await new Promise(resolve=>setTimeout(resolve,60));
  await evaluate(`chrome.history.addUrl({url:${JSON.stringify(alpha)}})`);
  const args={from:new Date(from).toISOString(),to:new Date(to).toISOString(),queries:[token],limit:10};
  const history=await run(session,`nodeRepl.write(JSON.stringify(await b.history(${JSON.stringify(args)})));`);
  assert.deepEqual(history.map(row=>row.url),[beta,alpha]);assert.ok(history.every(row=>Date.parse(row.dateVisited)>=from&&Date.parse(row.dateVisited)<=to));
  assert.deepEqual((await run(session,`nodeRepl.write(JSON.stringify(await b.history({...${JSON.stringify(args)},limit:1})));`)).map(row=>row.url),[beta]);
  assert.deepEqual((await run(session,`nodeRepl.write(JSON.stringify(await b.history({...${JSON.stringify(args)},from:new Date(${from}),queries:[${JSON.stringify(token+'/alpha')},${JSON.stringify(token+'/beta')}]})));`)).map(row=>row.url),[beta,alpha]);
  assert.equal(await run(session,`var invalid=false;try{await b.history({extra:true});}catch(e){invalid=/Invalid browser history options/.test(e.message);}nodeRepl.write(JSON.stringify(invalid));`),true);
  await evaluate(`globalThis.ocuHistoryOriginal=chrome.history.search;globalThis.ocuHistoryCalls=0;chrome.history.search=async()=>{globalThis.ocuHistoryCalls++;return await new Promise(resolve=>{globalThis.ocuHistoryRelease=()=>resolve([]);});};`);
  await run(session,`var stopped=b.history({queries:['first','second']}).catch(()=>{});nodeRepl.write(JSON.stringify(true));`);
  const deadline=Date.now()+5000;while(!await evaluate('!!globalThis.ocuHistoryRelease')){if(Date.now()>deadline)throw Error('Fixture read did not start');await new Promise(resolve=>setTimeout(resolve,10));}
  // A separate fixture connection survives owner cleanup so the accepted read can be released.
  const {openConnection}=await import('./node-repl/browser-cdp.mjs');const version=await(await fetch(new URL('/json/version',endpoint))).json(),observer=await openConnection(version.webSocketDebuggerUrl);
  try{
   const {sessionId}=await observer.send('Target.attachToTarget',{targetId:entry.workerId,flatten:true});
   await session.endTurn();assert.equal(session.browserChrome.owners.size,0);
   const result=await observer.send('Runtime.evaluate',{expression:'ocuHistoryRelease();chrome.history.search=ocuHistoryOriginal;new Promise(resolve=>setTimeout(()=>resolve(ocuHistoryCalls),30));',awaitPromise:true,returnByValue:true},10000,sessionId);assert.equal(result.result.value,1);
  }finally{observer.close();}
  await run(session,`nodeRepl.write(JSON.stringify((await b.history({queries:[${JSON.stringify(token)}]})).length));`);
  await session.reset();
  console.log(`${Session.name} PASS native dated visits, OR queries, cross-realm Date, limit/order, acknowledged cancellation and next turn`);
 }finally{await session.close();}
}
