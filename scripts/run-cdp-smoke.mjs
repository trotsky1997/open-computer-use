import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {WorkerJavaScriptSession,PersistentJavaScriptSession} from './node-repl/open-computer-use-repl.mjs';
import {withConnection} from './node-repl/browser-cdp.mjs';
const endpoint=process.env.OPEN_COMPUTER_USE_CDP_URL;
if(!endpoint)throw Error('Set OPEN_COMPUTER_USE_CDP_URL to disposable Chrome');
const server=createServer((req,res)=>{
 if(req.url==='/worker.js'){res.setHeader('Content-Type','text/javascript');res.end(`self.onmessage=()=>console.log('worker event');`);return;}
 if(req.url==='/child'){res.end('<!doctype html><title>child</title><p>child frame</p>');return;}
 if(req.url.startsWith('/data')){res.end('fixture data');return;}
 res.setHeader('Content-Type','text/html');res.end(`<!doctype html><title>CDP fixture</title><button onclick="console.log('first');console.log('second');fetch('/data?1');fetch('/data?2')">Fetch data</button><iframe src="http://localhost:${server.address().port}/child"></iframe><script>const worker=new Worker('/worker.js');</script>`);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}/`;
const native={async request(){throw Error('Native unused');}};
async function run(session,code,timeout=30000){const result=await session.run(code,timeout);assert.equal(result.isError,false,result.content.at(-1).text);return JSON.parse(result.content.at(-1).text);}
try {
 for(const Session of [WorkerJavaScriptSession,PersistentJavaScriptSession]) {
  const session=new Session({native});let id;
  try {
   id=await run(session,`var tab=await cua.createBrowserTab('cdp','about:blank',{visible:false});await tab.markHandoff();var capabilities=await tab.capabilities.list();if(!capabilities.some(item=>item.id==='cdp'))throw Error('Missing cdp capability');var cdp=await tab.capabilities.get('cdp');nodeRepl.write(JSON.stringify(tab.id));`);
   const blank=await session.run(`await cdp.readEvents();`);assert.equal(blank.isError,true);assert.match(blank.content.at(-1).text,/HTTP/);
   assert.equal(await run(session,`await tab.goto(${JSON.stringify(url)});await tab.playwright.waitForURL(${JSON.stringify(url)});await cdp.send('Runtime.enable');await cdp.send('Network.enable');nodeRepl.write(JSON.stringify((await cdp.send('Runtime.evaluate',{expression:'document.title',returnByValue:true})).result.value));`),'CDP fixture');
   const paging=await run(session,`var cursor=(await cdp.readEvents()).cursor;await tab.playwright.getByRole('button',{name:'Fetch data'}).click();var first=await cdp.readEvents({afterSequence:cursor,methods:['Runtime.consoleAPICalled'],limit:1});var second=await cdp.readEvents({afterSequence:first.cursor,methods:['Runtime.consoleAPICalled'],limit:1});nodeRepl.write(JSON.stringify({first:first.events[0].params.args[0].value,more:first.hasMore,second:second.events[0].params.args[0].value}));`);
   assert.deepEqual(paging,{first:'first',more:true,second:'second'});
   assert.equal(await run(session,`var cursor=(await cdp.readEvents()).cursor;var waiting=cdp.readEvents({afterSequence:cursor,methods:['Runtime.consoleAPICalled'],timeoutMs:2000});await tab.playwright.getByRole('button',{name:'Fetch data'}).click();nodeRepl.write(JSON.stringify((await waiting).events.length>0));`),true);
   const children=await run(session,`nodeRepl.write(JSON.stringify((await cdp.readEvents({afterSequence:0,methods:['Target.attachedToTarget']})).events.map(event=>event.params)));`);
   const frame=children.find(child=>child.targetInfo.type==='iframe'),worker=children.find(child=>child.targetInfo.type==='worker');assert.ok(frame);assert.ok(worker);
   assert.equal(await run(session,`await cdp.send('Runtime.enable',{}, {target:{targetId:${JSON.stringify(frame.targetInfo.targetId)}}});nodeRepl.write(JSON.stringify((await cdp.send('Runtime.evaluate',{expression:'location.origin',returnByValue:true},{target:{sessionId:${JSON.stringify(frame.sessionId)}}})).result.value));`),`http://localhost:${server.address().port}`);
   assert.equal(await run(session,`nodeRepl.write(JSON.stringify((await cdp.send('Runtime.evaluate',{expression:'self.location.pathname',returnByValue:true},{target:{targetId:${JSON.stringify(worker.targetInfo.targetId)}}})).result.value));`),'/worker.js');
   await run(session,`var childCursor=(await cdp.readEvents()).cursor;await cdp.send('Runtime.evaluate',{expression:"console.log('child event')"},{target:{sessionId:${JSON.stringify(frame.sessionId)}}});await cdp.send('Runtime.evaluate',{expression:"document.querySelector('iframe').remove()"});nodeRepl.write(JSON.stringify(true));`);
   const history=await run(session,`nodeRepl.write(JSON.stringify((await cdp.readEvents({afterSequence:childCursor,methods:['Runtime.consoleAPICalled'],target:{targetId:${JSON.stringify(frame.targetInfo.targetId)}}})).events.map(event=>event.params.args[0].value)));`);assert.deepEqual(history,['child event']);
   const detached=await session.run(`await cdp.send('Runtime.enable',{}, {target:{sessionId:${JSON.stringify(frame.sessionId)}}});`);assert.equal(detached.isError,true);assert.match(detached.content.at(-1).text,/detached/);
   assert.equal(await run(session,`var overflowCursor=(await cdp.readEvents()).cursor;await cdp.send('Runtime.evaluate',{expression:"for(let i=0;i<2100;i++)console.log('buffer',i)"});var overflow=await cdp.readEvents({afterSequence:overflowCursor,methods:['Runtime.consoleAPICalled']});nodeRepl.write(JSON.stringify(overflow.truncated));`),true);
   assert.equal(await run(session,`await tab.goto(${JSON.stringify(url.replace('127.0.0.1','localhost'))});await tab.playwright.waitForURL(${JSON.stringify(url.replace('127.0.0.1','localhost'))});var rotated=await cdp.readEvents({afterSequence:overflowCursor});nodeRepl.write(JSON.stringify(rotated.truncated));`),true);
   assert.equal(await run(session,`nodeRepl.write(JSON.stringify((await cdp.send('Runtime.evaluate',{expression:'location.origin',returnByValue:true})).result.value));`),`http://localhost:${server.address().port}`);
   const commandTimeout=await session.run(`var commandMarker=7;await cdp.send('Runtime.evaluate',{expression:'while(true){}'},{timeoutMs:80});`);
   assert.equal(commandTimeout.isError,true);assert.match(commandTimeout.content.at(-1).text,/timed out/);
   assert.equal(await run(session,`await cdp.send('Runtime.terminateExecution');nodeRepl.write(JSON.stringify(commandMarker));`),7);
   assert.equal(await run(session,`await cdp.send('Debugger.enable');await cdp.send('Debugger.pause');var ended=false;void cdp.readEvents({methods:['Network.loadingFailed'],timeoutMs:30000}).catch(()=>ended=true);nodeRepl.write(JSON.stringify(true));`),true);
   await session.endTurn();
   assert.equal(await run(session,`nodeRepl.write(JSON.stringify((await cdp.send('Runtime.evaluate',{expression:'1',returnByValue:true})).result.value));`),1);
   assert.equal(await run(session,`nodeRepl.write(JSON.stringify(ended));`),true);
   assert.equal(session.browserCdp.owners.size,1);
   await session.reset();assert.equal(session.browserCdp.owners.size,0);
   console.log(`${Session.name} PASS CDP discovery, HTTP guard/retry, commands, event paging/waits/eviction, iframe/worker selectors, detached history, origin rotation, pause release and turn/reset cleanup`);
  } finally {await session.close();if(id){const version=await(await fetch(new URL('/json/version',endpoint))).json();await withConnection(version.webSocketDebuggerUrl,send=>send('Target.closeTarget',{targetId:id})).catch(()=>{});}}
 }
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
