// Owns two fixture origins and closes all tabs it creates.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const {WorkerJavaScriptSession,PersistentJavaScriptSession}=await import(process.argv[2]?pathToFileURL(path.join(process.argv[2],'scripts/open-computer-use-repl.mjs')).href:'./node-repl/open-computer-use-repl.mjs');
const endpoint=process.env.OPEN_COMPUTER_USE_CDP_URL;assert.ok(endpoint,'Set OPEN_COMPUTER_USE_CDP_URL to disposable Chrome');
const servers=['A','B'].map(name=>createServer((request,response)=>{
 response.setHeader('Cache-Control','no-store');
 if(request.url==='/data'){
  const chunks=[];request.on('data',chunk=>chunks.push(chunk));request.on('end',()=>{response.setHeader('Content-Type','text/plain; charset=utf-8');response.setHeader('x-fixture-origin',name);response.end(name+':'+Buffer.concat(chunks).toString());});return;
 }
 response.setHeader('Content-Type','text/html');response.end(`<title>Network ${name}</title><button onclick="document.querySelector('output').textContent='loading';fetch('/data',{method:'POST',headers:{'Content-Type':'text/plain'},body:'owned post'}).then(r=>r.text()).then(t=>document.querySelector('output').textContent=t)">Load</button><output></output>`);
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
   assert.equal(session.browserCdp.owners.has(session.resourceOwners.get(session.worker)),false,'Rejected commands opened a debugger capture');
   await run('await cdp.send("Network.enable",{maxTotalBufferSize:10485760,maxPostDataSize:1024,enableDurableMessages:false});nodeRepl.write(JSON.stringify(true));');await load('A');
   for(const destination of [origins[1]+'/',origins[0].replace('127.0.0.1','localhost')+'/']){
    await run(`await tab.goto(${JSON.stringify(destination)});nodeRepl.write(JSON.stringify(true));`);
    await denied('await cdp.send("Network.getResponseBody",{requestId});',/No resource with given identifier/i);
    await denied('await cdp.send("Network.getRequestPostData",{requestId});',/No (?:resource|post data|data)/i);
    await load(destination.startsWith(origins[1])?'B':'A');
   }
   await session.endTurn();assert.equal(session.browserCdp.owners.size,0);
   await run(`await cdp.send('Network.enable',{maxPostDataSize:1024});nodeRepl.write(JSON.stringify(true));`);await load('A');
   await run('await tab.close();nodeRepl.write(JSON.stringify(true));');
   console.log(Session.name+' PASS ordinary Network request/response/post bodies, persistent-mode refusal before attachment, same-site/cross-site origin invalidation and turn rebind');
  }finally{await session.close();}
 }
}finally{for(const server of servers)server.closeAllConnections();await Promise.all(servers.map(server=>new Promise(resolve=>server.close(resolve))));}
