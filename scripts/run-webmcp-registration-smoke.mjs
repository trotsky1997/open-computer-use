// Native-only control: no harness or Playwright imports may mask document-binding failures.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {access,mkdtemp,readFile,rm} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const configured=process.env.OCU_TEST_CHROME_EXECUTABLE;if(!configured)throw Error('Set OCU_TEST_CHROME_EXECUTABLE to Chrome 158+');
const executable=resolve(configured);await access(executable,constants.X_OK);
assert.ok(process.argv.slice(2).every(arg=>arg==='--inline-registration'),'Unknown probe option');
const inline=process.argv.includes('--inline-registration'),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const server=createServer((req,res)=>{
 const child=req.url.startsWith('/child');res.setHeader('Content-Type','text/html');
 res.end(`<title>Native registration fixture</title><p>Owned fixture</p>${!child?`<iframe src="/child"></iframe><iframe src="/child"></iframe><iframe allow="tools" src="http://localhost:${server.address().port}/child?nested"></iframe>`:req.url.includes('?nested')?'<iframe src="/child?grand"></iframe>':''}<script>
 globalThis.fixture={token:crypto.randomUUID(),stage:0};fixture.start=async()=>{const context=document.modelContext;if(!context?.getTools)throw Error('Native WebMCP is unavailable');for(const name of ['echo','slow']){fixture.stage++;await context.registerTool({name,description:'Owned native registration',inputSchema:{type:'object'},execute:()=>name+':'+fixture.token});}fixture.stage++;};if(${inline})fixture.ready=fixture.start();
 </script>`);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const profile=await mkdtemp(join(tmpdir(),'ocu-native-registration-'));
const browser=spawn(executable,['--headless=new','--enable-automation','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--enable-features=WebMCP','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',`--user-data-dir=${profile}`,...(process.platform==='darwin'?['--use-mock-keychain']:process.platform==='linux'?['--no-sandbox']:[]),'about:blank'],{stdio:['ignore','ignore','inherit']});
const exited=once(browser,'exit');exited.catch(()=>{});let socket,next=0;const pending=new Map();
function send(method,params={},sessionId){return new Promise((resolve,reject)=>{
 const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(Error(`Native ${method} timed out`));},5000);
 pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});
 try{socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));}catch(error){pending.get(id).reject(error);pending.delete(id);}
});}
async function read(w){
 let current;try{await (w.fixture.ready??=w.fixture.start());const context=w.document.modelContext,tools=(await context.getTools()).filter(tool=>tool.window===w),echo=tools.find(tool=>tool.name==='echo');current={url:w.location.href,names:tools.map(tool=>tool.name).sort(),token:w.fixture.token,result:echo?await context.executeTool(echo,{}):null};}catch(error){if(error.name==='SecurityError')return [];throw error;}
 const results=[current];for(let i=0;i<w.frames.length;i++)results.push(...await read(w.frames[i]));return results;
}
try{
 let port;const deadline=Date.now()+10000;
 while(!port){if(browser.exitCode!==null||browser.signalCode!==null)throw Error('Owned Chrome exited during startup');try{port=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];}catch{}if(Date.now()>deadline)throw Error('Owned Chrome startup timed out');if(!port)await pause(20);}
 const version=await(await fetch(`http://127.0.0.1:${port}/json/version`,{signal:AbortSignal.timeout(5000),redirect:'error'})).json();console.log(version.Browser,process.version,inline?'inline registration':'post-load registration');
 socket=new WebSocket(version.webSocketDebuggerUrl);
 socket.addEventListener('message',event=>{const message=JSON.parse(event.data),request=pending.get(message.id);if(!request)return;pending.delete(message.id);if(message.error)request.reject(Error(message.error.message));else request.resolve(message.result);});
 const lost=()=>{for(const request of pending.values())request.reject(Error('Native connection lost'));pending.clear();};socket.addEventListener('close',lost);socket.addEventListener('error',lost);
 let opening;try{await Promise.race([once(socket,'open'),new Promise((_,reject)=>{opening=setTimeout(()=>reject(Error('Native connection open timed out')),5000);})]);}finally{clearTimeout(opening);}
 for(let step=0;step<20;step++){
  const {targetId}=await send('Target.createTarget',{url:`http://127.0.0.1:${server.address().port}/?step=${step}`,background:true}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
  await send('Page.enable',{},sessionId);const loaded=Date.now()+5000;
  for(;;){const state=await send('Runtime.evaluate',{expression:'location.protocol==="http:"&&document.readyState==="complete"',returnByValue:true},sessionId);if(state.result.value)break;assert.ok(Date.now()<loaded,'Owned fixture did not load');await pause(20);}
  const {targetInfos}=await send('Target.getTargets'),selected=new Set([targetId]);let count;
  do{count=selected.size;for(const info of targetInfos)if(selected.has(info.parentId))selected.add(info.targetId);}while(count!==selected.size);
  const records=[];
  for(const info of targetInfos.filter(info=>selected.has(info.targetId)&&['page','iframe'].includes(info.type))){
   const session=info.targetId===targetId?sessionId:(await send('Target.attachToTarget',{targetId:info.targetId,flatten:true})).sessionId;
   try{const result=await send('Runtime.evaluate',{expression:`(${read.toString()})(window)`,awaitPromise:true,returnByValue:true},session);assert.equal(result.exceptionDetails,undefined,JSON.stringify(result.exceptionDetails));records.push(...result.result.value);}
   catch(error){const state=await send('Runtime.evaluate',{expression:'({url:location.href,stage:fixture.stage,childStage:frames[0]?.fixture?.stage})',returnByValue:true},session).catch(error=>({error:error.message}));throw Error('Native registration failed: '+JSON.stringify({step,target:info,state}),{cause:error});}
  }
  assert.equal(records.length,5);assert.equal(new Set(records.map(item=>item.token)).size,5);
  for(const record of records){assert.deepEqual(record.names,['echo','slow']);assert.equal(record.result,'echo:'+record.token);}
  await send('Target.closeTarget',{targetId});
 }
 console.log('PASS 20 native registration/settlement/inventory/call cycles across main, duplicate-URL siblings and an OOP frame with its same-process child');
}finally{
 socket?.close();for(const request of pending.values())request.reject(Error('Owned probe ended'));pending.clear();
 if(browser.exitCode===null&&browser.signalCode===null)browser.kill('SIGKILL');
 try{await exited;}finally{await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
