// Run against an owned disposable headless browser; no normal browser profile is used.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {WorkerJavaScriptSession,PersistentJavaScriptSession} from './node-repl/open-computer-use-repl.mjs';
import {withConnection,openConnection} from './node-repl/browser-cdp.mjs';
const endpoint=process.env.OPEN_COMPUTER_USE_CDP_URL;if(!endpoint)throw Error('Set OPEN_COMPUTER_USE_CDP_URL to an owned disposable browser');
const native={async request(){throw Error('Native app unused');}},ids=new Set();
const server=createServer((_request,response)=>{response.setHeader('Content-Type','text/html');response.end('<input aria-label="Target" oninput="document.body.dataset.edits=Number(document.body.dataset.edits||0)+1">');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}/`;
async function run(session,code){const r=await session.run(code,30000);assert.equal(r.isError,false,JSON.stringify(r.content));return JSON.parse(r.content.at(-1).text);}
async function target(id){return (await(await fetch(new URL('/json/list',endpoint))).json()).find(t=>t.id===id);}
async function read(id,expression){const t=await target(id);return withConnection(t.webSocketDebuggerUrl,async send=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;});}
async function until(check){const end=Date.now()+5000;while(!await check()){assert.ok(Date.now()<end,'Native clipboard job did not reach the expected phase');await new Promise(r=>setTimeout(r,20));}}
async function setup(session){const id=await run(session,`var tab=await cua.createBrowserTab('cdp',${JSON.stringify(url)},{visible:false});await tab.markHandoff();nodeRepl.write(JSON.stringify(tab.id));`);ids.add(id);return id;}
async function release(id){const t=await target(id);if(!t)return;await withConnection(t.webSocketDebuggerUrl,async send=>{await send('Emulation.setFocusEmulationEnabled',{enabled:true});await send('Runtime.evaluate',{expression:'globalThis.__releaseClipboard?.();true',returnByValue:true,userGesture:true});});await until(()=>read(id,'!!(globalThis.__clipboardDone||globalThis.__clipboardError)'));}
try{
 for(const Session of [WorkerJavaScriptSession,PersistentJavaScriptSession])for(const mode of ['lost-ack','paste-ack','pending','paste-pending']){
  const a=new Session({native}),b=new Session({native});let original,control;
  try{
   const user=await setup(a);await setup(b);await run(a,'await tab.clipboard.writeText("baseline");nodeRepl.write(JSON.stringify(true));');
   const manager=a.browserClipboard,owner=a.resourceOwner??a.resourceOwners.get(a.worker),state=manager.owners.get(owner),bridge=[...state.bridges.values()][0];control=bridge.targetId;
   await read(control,`(()=>{for(const name of ['write','writeText']){const original=navigator.clipboard[name].bind(navigator.clipboard);navigator.clipboard[name]=async(...args)=>{globalThis.__clipboardCalls=(globalThis.__clipboardCalls||0)+1;globalThis.__clipboardEntered=true;${mode.includes('pending')?'await new Promise(resolve=>{globalThis.__releaseClipboard=resolve;});':''}try{const value=await original(...args);globalThis.__clipboardDone=true;return value;}catch(error){globalThis.__clipboardError=String(error);throw error;}};}return true;})()`);
   const ws=(await target(control)).webSocketDebuggerUrl;let injected=false;
   original=manager.connect;manager.connect=async(socket,operation)=>{
    if(socket!==ws)return original(socket,operation);
    const connection=await openConnection(socket);
    try{return await operation(async(method,params,...rest)=>{
     if(method==='Runtime.evaluate'&&params.expression?.includes('async function clipboardOperation(')&&!injected){
      injected=true;const pending=connection.send(method,params,...rest);pending.catch(()=>{});
      if(mode.includes('pending'))await until(()=>read(control,'!!globalThis.__clipboardEntered'));else await pending;
      connection.close();throw Error('Injected clipboard connection loss');
     }
     return connection.send(method,params,...rest);
    });}finally{connection.close();}
   };
   const code=mode.startsWith('paste-')?`var ax=await tab.getAXState({emit:false});var field=ax.match(/\\[(\\d+)\\] textbox "Target"/)[1];await tab.paste(field,'accepted once');`:'await tab.clipboard.writeText("accepted once");';
   const result=await a.run(code,30000);
   if(!mode.includes('pending')){
    const value=await run(b,'nodeRepl.write(JSON.stringify(await tab.clipboard.readText()));'),calls=await read(control,'globalThis.__clipboardCalls');
    assert.equal(result.isError,false,JSON.stringify({content:result.content,value,calls}));assert.equal(calls,1);assert.equal(value,'accepted once');
    if(mode==='paste-ack')assert.deepEqual(await run(a,'nodeRepl.write(JSON.stringify({value:await tab.playwright.getByLabel("Target").inputValue(),edits:Number(await tab.playwright.locator("body").getAttribute("data-edits"))}));'),{value:'accepted once',edits:1});
   }else{
    assert.equal(result.isError,true);
    const denied=await b.run('await tab.clipboard.writeText("newer");');
    const input=await b.run('await tab.typeText(null,"wrong");');
    await release(control);assert.equal(await read(control,'globalThis.__clipboardCalls'),1);
    if(mode==='paste-pending')assert.deepEqual(await read(user,'({value:document.querySelector("input").value,edits:Number(document.body.dataset.edits||0)})'),{value:'',edits:0});
    assert.equal(denied.isError,true,JSON.stringify(denied.content));
    assert.equal(input.isError,true,JSON.stringify(input.content));
    manager.connect=original;original=undefined;await a.reset();
    assert.equal(await run(b,'nodeRepl.write(JSON.stringify(await tab.clipboard.readText()));'),'accepted once');
   }
   console.log(`${Session.name} PASS clipboard ${mode}, native completion and one write without replay`);
  }finally{if(control)await release(control).catch(()=>{});if(original)a.browserClipboard.connect=original;await a.close();await b.close();}
 }
}finally{server.closeAllConnections();server.close();const version=await(await fetch(new URL('/json/version',endpoint))).json();for(const id of ids)if(await target(id))await withConnection(version.webSocketDebuggerUrl,send=>send('Target.closeTarget',{targetId:id}));}
