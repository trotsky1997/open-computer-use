// Owns the entire disposable profile; Tracing can include browser-wide data.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const {WorkerJavaScriptSession,PersistentJavaScriptSession}=await import(process.argv[2]?pathToFileURL(path.join(process.argv[2],'scripts/open-computer-use-repl.mjs')).href:'./node-repl/open-computer-use-repl.mjs');
assert.ok(process.env.OPEN_COMPUTER_USE_CDP_URL,'Set a disposable Chrome endpoint');
const server=createServer((_request,response)=>{response.setHeader('Content-Type','text/html');response.end('<title>Owned tracing fixture</title><input><button onclick="document.querySelector(\'output\').textContent=String(event.isTrusted)">Raw click</button><output></output>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
async function until(check,label){const deadline=Date.now()+10000;for(;;){if(await check())return;assert.ok(Date.now()<deadline,label);await new Promise(resolve=>setTimeout(resolve,20));}}
try{
 for(const Session of [WorkerJavaScriptSession,PersistentJavaScriptSession]){
  const session=new Session({native:{async request(){throw Error('Desktop unused');}}});
  async function run(code){const result=await session.run(code,30000);assert.equal(result.isError,false,JSON.stringify(result.content));return JSON.parse(result.content.at(-1).text);}
  async function denied(method,params={}){const result=await session.run(`await cdp.send(${JSON.stringify(method)},${JSON.stringify(params)});`);assert.equal(result.isError,true);assert.match(result.content.at(-1).text,/not supported/);}
  const config={includedCategories:['devtools.timeline','v8.execute'],recordMode:'recordContinuously',traceBufferSizeInKb:512};
  async function start(mode){await run(`var traceCursor=(await cdp.readEvents()).cursor;await cdp.send('Tracing.start',{tracingBackend:'chrome',transferMode:${JSON.stringify(mode)},traceConfig:${JSON.stringify(config)}});await cdp.send('Runtime.evaluate',{expression:'for(let i=0;i<1000;i++)Math.sqrt(i);',returnByValue:true});nodeRepl.write(JSON.stringify(true));`);}
  async function finish(){await run("await cdp.send('Tracing.end');nodeRepl.write(JSON.stringify(true));");await until(()=>run("var traceEvents=(await cdp.readEvents({afterSequence:traceCursor,methods:['Tracing.dataCollected','Tracing.tracingComplete']})).events;nodeRepl.write(JSON.stringify(traceEvents.some(e=>e.method==='Tracing.tracingComplete')));"),'Trace did not finish');}
  try{
   await run(`var tab=await cua.createBrowserTab('cdp','http://127.0.0.1:${server.address().port}/',{visible:false});await tab.markHandoff();var cdp=await tab.capabilities.get('cdp');nodeRepl.write(JSON.stringify(tab.id));`);
   for(const method of ['Security.enable','Input.dispatchKeyEvent','Input.dispatchDragEvent','Input.setInterceptDrags','Tracing.requestMemoryDump'])await denied(method);
   for(const params of [{perfettoConfig:''},{tracingBackend:'system'},{options:'enable-systrace'},{traceConfig:{enableSystrace:true}},{traceConfig:{memoryDumpConfig:{}}}])await denied('Tracing.start',params);
   assert.equal(session.browserCdp.owners.has(session.resourceOwners.get(session.worker)),false,'Refused options opened a capture');
   assert.deepEqual(await run("var enabled=[];for(var method of ['Audits.enable','Console.enable','Inspector.enable'])enabled.push(await cdp.send(method));nodeRepl.write(JSON.stringify(enabled));"),[{},{},{}]);
   await run("await tab.playwright.locator('input').click();await cdp.send('Input.insertText',{text:'owned λ🙂'});nodeRepl.write(JSON.stringify(true));");
   assert.equal(await run("nodeRepl.write(JSON.stringify((await cdp.send('Runtime.evaluate',{expression:'document.querySelector(\"input\").value',returnByValue:true})).result.value));"),'owned λ🙂');
   assert.equal(await run("var point=(await cdp.send('Runtime.evaluate',{expression:'(()=>{const r=document.querySelector(\"button\").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()',returnByValue:true})).result.value;await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});nodeRepl.write(JSON.stringify((await cdp.send('Runtime.evaluate',{expression:'document.querySelector(\"output\").textContent',returnByValue:true})).result.value));"),'true');
   const categories=await run("nodeRepl.write(JSON.stringify((await cdp.send('Tracing.getCategories')).categories.length));");assert.ok(Number.isSafeInteger(categories)&&categories>=0);
   await start('ReportEvents');await finish();assert.equal(await run("nodeRepl.write(JSON.stringify(traceEvents.some(e=>e.method==='Tracing.dataCollected'&&e.params.value.length>0)));"),true);
   await start('ReturnAsStream');await finish();
   const stream=await run("var handle=traceEvents.find(e=>e.method==='Tracing.tracingComplete').params.stream;var chunks=[],total=0,eof=false;try{while(!eof){var chunk=await cdp.send('IO.read',{handle,size:65536});var bytes=Buffer.from(chunk.data,chunk.base64Encoded?'base64':'utf8');total+=bytes.length;if(total>8*1024*1024)throw Error('Fixture trace exceeded its budget');chunks.push(bytes);eof=chunk.eof;}nodeRepl.write(JSON.stringify({eof,events:JSON.parse(Buffer.concat(chunks).toString()).traceEvents.length}));}finally{await cdp.send('IO.close',{handle});}");assert.equal(stream.eof,true);assert.ok(stream.events>0);
   const closed=await session.run("await cdp.send('IO.read',{handle});");assert.equal(closed.isError,true);assert.match(closed.content.at(-1).text,/stream|handle/i);
   await start('ReportEvents');await session.endTurn();assert.equal(session.browserCdp.owners.size,0);
   await run('await tab.markHandoff();nodeRepl.write(JSON.stringify(true));');await start('ReportEvents');await finish();
   await run('await tab.close();nodeRepl.write(JSON.stringify(true));');
   console.log(Session.name+' PASS Audits/Console/Inspector, native raw text/trusted pointer input, Chrome trace events/IO streams, restricted configurations, closed handles and active-trace turn cleanup/rebind');
  }finally{await session.close();}
 }
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
