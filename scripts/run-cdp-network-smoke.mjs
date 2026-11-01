// Owns two fixture origins and closes all tabs it creates.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const {WorkerJavaScriptSession,PersistentJavaScriptSession}=await import(process.argv[2]?pathToFileURL(path.join(process.argv[2],'scripts/open-computer-use-repl.mjs')).href:'./node-repl/open-computer-use-repl.mjs');
const endpoint=process.env.OPEN_COMPUTER_USE_CDP_URL;assert.ok(endpoint,'Set OPEN_COMPUTER_USE_CDP_URL to disposable Chrome');
const servers=['A','B'].map(name=>createServer((request,response)=>{
 assert.equal(request.headers['x-owned-probe'],undefined);response.setHeader('Cache-Control','no-store');
 if(request.url==='/child'){response.setHeader('Content-Type','text/html');response.end('<title>Owned child</title><p>child</p>');return;}
 if(request.url==='/data'){
  const chunks=[];request.on('data',chunk=>chunks.push(chunk));request.on('end',()=>{response.setHeader('Content-Type','text/plain; charset=utf-8');response.setHeader('x-fixture-origin',name);response.end(name+':'+Buffer.concat(chunks).toString());});return;
 }
 response.setHeader('Content-Type','text/html');response.end(`<title>Network ${name}</title><button onclick="document.querySelector('output').textContent='loading';fetch('/data',{method:'POST',headers:{'Content-Type':'text/plain'},body:'owned post'}).then(r=>{document.querySelector('output').dataset.header=r.headers.get('x-structured')||'';return r.text()}).then(t=>document.querySelector('output').textContent=t)">Load</button><output></output><iframe src="http://localhost:${request.socket.localPort}/child"></iframe>`);
}));await Promise.all(servers.map(server=>new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))));
const origins=servers.map(server=>`http://127.0.0.1:${server.address().port}`);
async function until(check,label){const deadline=Date.now()+8000;for(;;){if(await check())return;assert.ok(Date.now()<deadline,label);await new Promise(resolve=>setTimeout(resolve,20));}}
try{
 for(const Session of [WorkerJavaScriptSession,PersistentJavaScriptSession]){
  const session=new Session({native:{async request(){throw Error('Desktop unused');}}});
  async function run(code){const result=await session.run(code,30000);assert.equal(result.isError,false,result.content.at(-1)?.text);return JSON.parse(result.content.at(-1).text);}
  async function denied(code,pattern){const result=await session.run(code,30000);assert.equal(result.isError,true,JSON.stringify(result.content));assert.match(result.content.at(-1).text,pattern);}
  async function load(name){
   await run('var cursor=(await cdp.readEvents()).cursor;await tab.playwright.getByRole("button",{name:"Load",exact:true}).click();nodeRepl.write(JSON.stringify(true));');
   await until(async()=>await run('nodeRepl.write(JSON.stringify(await tab.playwright.locator("output").innerText()));')===name+':owned post','Fetch did not complete');
   await until(()=>run('var trace=(await cdp.readEvents({afterSequence:cursor,limit:1000})).events;var request=trace.find(e=>e.method==="Network.requestWillBeSent"&&e.params.request.url.endsWith("/data"));nodeRepl.write(JSON.stringify(Boolean(request&&trace.some(e=>e.method==="Network.responseReceived"&&e.params.requestId===request.params.requestId)&&trace.some(e=>e.method==="Network.loadingFinished"&&e.params.requestId===request.params.requestId))));'),'Network trace did not settle');
   const trace=await run('var trace=(await cdp.readEvents({afterSequence:cursor,limit:1000})).events;var request=trace.find(e=>e.method==="Network.requestWillBeSent"&&e.params.request.url.endsWith("/data"));var requestId=request.params.requestId;nodeRepl.write(JSON.stringify({request:request.params.request,response:trace.find(e=>e.method==="Network.responseReceived"&&e.params.requestId===requestId).params.response,finished:trace.some(e=>e.method==="Network.loadingFinished"&&e.params.requestId===requestId),body:await cdp.send("Network.getResponseBody",{requestId}),post:await cdp.send("Network.getRequestPostData",{requestId})}));');
   assert.equal(trace.request.method,'POST');assert.equal(trace.request.postData,'owned post');assert.equal(trace.response.status,200);assert.equal(trace.response.headers['x-fixture-origin'],name);assert.equal(trace.finished,true);assert.equal(trace.post.postData,'owned post');assert.equal(trace.body.base64Encoded?Buffer.from(trace.body.body,'base64').toString():trace.body.body,name+':owned post');
  }
  try{
   await run(`var tab=await cua.createBrowserTab('cdp',${JSON.stringify(origins[0]+'/')},{visible:false});await tab.markHandoff();var cdp=await tab.capabilities.get('cdp');nodeRepl.write(JSON.stringify(tab.id));`);
   for(const options of ['{enableDurableMessages:true}','{enableDurableMessages:true,maxTotalBufferSize:10485760}'])await denied(`await cdp.send('Network.enable',${options});`,/not supported/);
   await denied("await cdp.send('Network.configureDurableMessages',{maxTotalBufferSize:10485760});",/not supported/);
   for(const method of ['Network.deleteDeviceBoundSession','Network.enableDeviceBoundSessions','Network.getResponseBodyForInterception','Network.setCookieControls','Network.setExtraHTTPHeaders','Network.setRequestInterception','Network.takeResponseBodyForInterceptionAsStream'])await denied(`await cdp.send(${JSON.stringify(method)},{headers:{'X-Owned-Probe':'owned-A'}});`,/not supported/);
   for(const [method,params] of [['Fetch.continueResponse',{requestId:'absent',binaryResponseHeaders:''}],['Fetch.fulfillRequest',{requestId:'absent',responseCode:200,binaryResponseHeaders:''}],['Page.reload',{scriptToEvaluateOnLoad:''}],['Page.createIsolatedWorld',{frameId:'absent',grantUniveralAccess:true}]])await denied(`await cdp.send(${JSON.stringify(method)},${JSON.stringify(params)});`,/not supported/);
   for(const [method,params] of [['Fetch.disable',{}],['Fetch.enable',{}],['Fetch.enable',{patterns:[{}]}],['Fetch.enable',{patterns:[{resourceType:'Document'}]}]])await denied(`await cdp.send(${JSON.stringify(method)},${JSON.stringify(params)});`,/not supported/);
   assert.equal(session.browserCdp.owners.has(session.resourceOwners.get(session.worker)),false,'Rejected commands opened a debugger capture');
   assert.deepEqual(await run('nodeRepl.write(JSON.stringify(await cdp.send("Network.configureDurableMessages",{})));'),{});
   await run('await cdp.send("Network.enable",{maxTotalBufferSize:10485760,maxPostDataSize:1024,enableDurableMessages:false});nodeRepl.write(JSON.stringify(true));');
   await until(()=>run('var child=(await cdp.readEvents({afterSequence:0,methods:["Target.attachedToTarget"]})).events.find(e=>e.params.targetInfo.type==="iframe");nodeRepl.write(JSON.stringify(Boolean(child)));'),'Owned child did not attach');
   assert.deepEqual(await run('var childTarget={target:{sessionId:child.params.sessionId}};await cdp.send("Fetch.enable",{},childTarget);nodeRepl.write(JSON.stringify(await cdp.send("Fetch.disable",{},childTarget)));'),{});
   await load('A');
   for(const destination of [origins[1]+'/',origins[0].replace('127.0.0.1','localhost')+'/']){
    await run(`await tab.goto(${JSON.stringify(destination)});nodeRepl.write(JSON.stringify(true));`);
    await denied('await cdp.send("Network.getResponseBody",{requestId});',/No resource with given identifier/i);
    await denied('await cdp.send("Network.getRequestPostData",{requestId});',/No (?:resource|post data|data)/i);
    await load(destination.startsWith(origins[1])?'B':'A');
   }
   await session.endTurn();assert.equal(session.browserCdp.owners.size,0);
   await run(`await cdp.send('Network.enable',{maxPostDataSize:1024});nodeRepl.write(JSON.stringify(true));`);await load('A');
   const isolated=await run('var frameId=(await cdp.send("Page.getFrameTree")).frameTree.frame.id;var world=(await cdp.send("Page.createIsolatedWorld",{frameId,worldName:"owned-policy-fixture",grantUniveralAccess:false})).executionContextId;nodeRepl.write(JSON.stringify((await cdp.send("Runtime.evaluate",{contextId:world,expression:"document.title",returnByValue:true})).result.value));');assert.equal(isolated,'Network A');
   await run('await tab.playwright.expectNavigation(()=>cdp.send("Page.reload",{ignoreCache:true}),{waitUntil:"load"});nodeRepl.write(JSON.stringify(true));');
   for(const [stage,method,expected] of [['Request','Fetch.fulfillRequest','structured replacement'],['Response','Fetch.continueResponse','A:owned post']]){
    await run(`await cdp.send('Fetch.enable',{patterns:[{urlPattern:'*/data',resourceType:'Fetch',requestStage:${JSON.stringify(stage)}}]});var fetchCursor=(await cdp.readEvents()).cursor;await tab.playwright.getByRole('button',{name:'Load',exact:true}).click();nodeRepl.write(JSON.stringify(true));`);
    await until(()=>run('var paused=(await cdp.readEvents({afterSequence:fetchCursor,methods:["Fetch.requestPaused"]})).events.find(e=>e.params.request.url.endsWith("/data"));nodeRepl.write(JSON.stringify(Boolean(paused)));'),'Fetch interception did not pause');
    await denied(`await cdp.send(${JSON.stringify(method)},{requestId:paused.params.requestId,responseCode:200,binaryResponseHeaders:''});`,/not supported/);
    const params={responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/plain'},{name:'x-structured',value:stage}],...(stage==='Request'?{body:Buffer.from(expected).toString('base64')}:{})};
    await run(`await cdp.send(${JSON.stringify(method)},{...${JSON.stringify(params)},requestId:paused.params.requestId});nodeRepl.write(JSON.stringify(true));`);
    await until(async()=>await run('nodeRepl.write(JSON.stringify(await tab.playwright.locator("output").innerText()));')===expected,'Structured response did not arrive');
    assert.equal(await run('nodeRepl.write(JSON.stringify(await tab.playwright.locator("output").getAttribute("data-header")));'),stage);
   }
   await run('await tab.playwright.expectNavigation(()=>tab.reload(),{waitUntil:"load"});nodeRepl.write(JSON.stringify(true));');
   await run('await cdp.send("Fetch.enable",{patterns:[]});nodeRepl.write(JSON.stringify(true));');await load('A');
   await run('await cdp.send("Fetch.enable",{patterns:[{resourceType:"Fetch",requestStage:"Request",urlPattern:"*/data"}]});await tab.markHandoff();var pendingCursor=(await cdp.readEvents()).cursor;await tab.playwright.getByRole("button",{name:"Load",exact:true}).click();nodeRepl.write(JSON.stringify(true));');
   await until(()=>run('nodeRepl.write(JSON.stringify((await cdp.readEvents({afterSequence:pendingCursor,methods:["Fetch.requestPaused"]})).events.some(e=>e.params.request.url.endsWith("/data"))));'),'Pending request did not pause');
   await session.endTurn();assert.equal(session.browserCdp.owners.size,0);
   await until(async()=>await run('nodeRepl.write(JSON.stringify(await tab.playwright.locator("output").innerText()));')==='A:owned post','Turn end did not release paused request');

   await run('await tab.close();nodeRepl.write(JSON.stringify(true));');
   console.log(Session.name+' PASS ordinary Network request/response/post bodies, header/interception/session and persistent-mode refusal before attachment, durable disable, same-site/cross-site origin invalidation and turn rebind; Page/Fetch parameter refusal, ordinary reload/isolated worlds and structured response fulfillment/continuation; root Fetch scope, navigation while enabled, clear and pending-request turn cleanup');
  }finally{await session.close();}
 }
}finally{for(const server of servers)server.closeAllConnections();await Promise.all(servers.map(server=>new Promise(resolve=>server.close(resolve))));}
