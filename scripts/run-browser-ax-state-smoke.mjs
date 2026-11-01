// Owns its managed browser, profile and all fixture controls.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
const runtime=await import(process.argv[2]?pathToFileURL(path.join(process.argv[2],'scripts/open-computer-use-repl.mjs')).href:'./node-repl/open-computer-use-repl.mjs');
const binary=process.env.OCU_TEST_CHROME_EXECUTABLE;assert.ok(binary,'Set OCU_TEST_CHROME_EXECUTABLE');
const scratch=await mkdtemp(path.join(tmpdir(),'ocu-ax-state-')),saved={...process.env},native={async request(){throw Error('Desktop unused');}};let manager;
const server=createServer((_request,response)=>{response.setHeader('Content-Type','text/html');if(_request.url.startsWith('/scaled-frame')){const name=_request.url.includes('name=Same')?'Same':'Cross';response.end(`<!doctype html><style>body{zoom:${name==='Same'?1.25:.8}}input{position:fixed;left:20px;top:20px;width:40px;height:30px;margin:0}</style><input type="checkbox" aria-label="Scaled ${name}"><output></output><script>for(const type of ['dragenter','dragover','drop'])document.querySelector('input').addEventListener(type,e=>{e.preventDefault();if(type==='drop')document.body.dataset.scaledDrop=JSON.stringify({trusted:e.isTrusted,text:e.dataTransfer.getData('text/plain')});});document.querySelector('input').addEventListener('click',e=>document.querySelector('output').textContent=JSON.stringify({trusted:e.isTrusted,checked:e.target.checked,x:e.clientX,y:e.clientY}));</script>`);return;}response.end(`<title>Owned AX states</title><button onclick="alert('Owned alert')">Alert</button><h1>State fixture</h1><a href="#details">Same document</a><label><input type="checkbox">Remember</label><button disabled>Unavailable</button><button aria-pressed="mixed">Toggle</button><button aria-expanded="false" onclick="this.setAttribute('aria-expanded',this.getAttribute('aria-expanded')!=='true')">Details</button><input aria-label="Required" required readonly aria-invalid="true" aria-describedby="description"><span id="description">Use a valid code</span><select aria-label="Plan"><option>Basic</option><option selected>Pro</option></select>${Array.from({length:45},(_,i)=>`<p>Unchanged context ${i}</p>`).join('')}`);});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}/`;
async function run(session,code){const result=await session.run(code,30000);assert.equal(result.isError,false,result.content.at(-1)?.text);return result;}
function value(result){return JSON.parse(result.content.at(-1).text);}
function state(result){return result.content.findLast(item=>item.type==='text' && /^Accessibility state|^\s*\[-?\d+\]/m.test(item.text))?.text;}
async function rootEval(session,id,expression){const entry=[...session.browserDialogs.targets.values()].find(entry=>entry.targetId===id);assert.ok(entry);const result=await entry.connection.send('Runtime.evaluate',{expression,returnByValue:true});assert.ok(!result.exceptionDetails,JSON.stringify(result.exceptionDetails));return result.result.value;}
async function index(session,name){const text=value(await run(session,'nodeRepl.write(JSON.stringify(await tab.getAXState({emit:false})));')),line=text.split('\n').find(line=>line.includes(' checkbox '+JSON.stringify(name)));assert.ok(line,text);return Number(line.match(/\[(\d+)\]/)[1]);}
async function panViewport(entry,scale){
 await entry.connection.send('Emulation.setPageScaleFactor',{pageScaleFactor:1});await entry.connection.send('Emulation.setPageScaleFactor',{pageScaleFactor:scale});
    await entry.connection.send('Runtime.evaluate',{expression:'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))',awaitPromise:true});
    await entry.connection.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
    try{await entry.connection.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:200,y:150,id:0}]});for(let i=1;i<=10;i++){await entry.connection.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:200-10*i,y:150-10*i,id:0}]});await new Promise(resolve=>setTimeout(resolve,20));}await new Promise(resolve=>setTimeout(resolve,150));}finally{await entry.connection.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await entry.connection.send('Emulation.setTouchEmulationEnabled',{enabled:false});}
    let previous='',stable=0,viewport;const settled=Date.now()+5000;
    while(stable<3){viewport=(await entry.connection.send('Page.getLayoutMetrics')).cssVisualViewport;const state=JSON.stringify(viewport);stable=state===previous?stable+1:0;previous=state;assert.ok(Date.now()<settled,'Visual viewport did not settle');await new Promise(resolve=>setTimeout(resolve,50));}
   assert.ok(viewport.offsetX>50&&viewport.offsetY>50,JSON.stringify(viewport));assert.equal(viewport.scale,scale);
}
try{
 let executable=path.resolve(binary);if(process.platform==='linux'){const quoted="'"+executable.replaceAll("'","'\\''")+"'";executable=path.join(scratch,'owned-chrome');await writeFile(executable,`#!/bin/sh\nexec ${quoted} --no-sandbox "$@"\n`,{mode:0o700});}
 process.env.OPEN_COMPUTER_USE_BROWSER_EXECUTABLE=executable;process.env.OPEN_COMPUTER_USE_BROWSER_MODE='headless';delete process.env.OPEN_COMPUTER_USE_CDP_URL;
 for(const Session of [runtime.WorkerJavaScriptSession,runtime.PersistentJavaScriptSession]){
  const session=new Session({native});manager=session.browserRuntime;
  try{
   const initial=value(await run(session,`var tab=await cua.createBrowserTab('cdp',${JSON.stringify(url)},{visible:false});await tab.markHandoff();nodeRepl.write(JSON.stringify(await tab.getAXState({emit:false})));`));
   assert.match(initial,/checkbox "Remember"[^\n]*checked=false/);
   assert.match(initial,/button "Unavailable"[^\n]*disabled=true/);
   assert.match(initial,/button "Toggle"[^\n]*pressed=mixed/);
   assert.match(initial,/button "Details"[^\n]*expanded=false/);
   assert.match(initial,/textbox "Required"[^\n]*description="Use a valid code"/);
   assert.match(initial,/textbox "Required"[^\n]*readonly=true/);
   assert.match(initial,/textbox "Required"[^\n]*required=true/);
   assert.match(initial,/option "Pro"[^\n]*selected=true/);
   const full=await run(session,'var full=await tab.getAXState({disableDiffing:true});nodeRepl.write(JSON.stringify(full));');assert.equal(state(full),value(full));
   const same=await run(session,'await tab.getAXState();');assert.equal(state(same),'Accessibility state unchanged.');
   const changed=await run(session,String.raw`var current=await tab.getAXState({emit:false});var remember=Number(current.match(/\[(-?\d+)\] checkbox "Remember"/)[1]);await tab.click(remember);var current=await tab.getAXState();nodeRepl.write(JSON.stringify(current));`);
   assert.match(value(changed),/checkbox "Remember"[^\n]*checked=true/);assert.match(state(changed),/Accessibility state diff for tab/);assert.match(state(changed),/\+ .*checkbox "Remember"[^\n]*checked=true/);assert.ok(state(changed).length<value(changed).length);
   const forced=await run(session,'var current=await tab.getAXState({disableDiffing:true});nodeRepl.write(JSON.stringify(current));');assert.equal(state(forced),value(forced));
   await run(session,'await tab.playwright.getByRole("button",{name:"Details",exact:true}).click();await tab.getAXState({emit:false});');const unseen=await run(session,'await tab.getAXState();');assert.match(state(unseen),/\+ .*button "Details"[^\n]*expanded=true/);
   await run(session,'await tab.getScreenshot({emit:false});');assert.doesNotMatch(state(await run(session,'await tab.getAXState();')),/Accessibility state/);
   await run(session,'await tab.playwright.getByRole("button",{name:"Alert",exact:true}).click();');
   const blocked=await session.run('await tab.getAXState();');assert.equal(blocked.isError,true);assert.match(blocked.content.at(-1).text,/Resolve.*dialog/);
   await run(session,'await(await tab.getJsDialog()).dismiss();');assert.doesNotMatch(state(await run(session,'await tab.getAXState();')),/Accessibility state/);
   const failed=await session.run('await tab.playwright.getByRole("button",{name:"Absent",exact:true}).click({timeoutMs:50});');assert.equal(failed.isError,true);
   assert.doesNotMatch(state(await run(session,'await tab.getAXState();')),/Accessibility state/);
   const invalid=await session.run('await tab.getAXState({disableDiffing:"yes"});');assert.equal(invalid.isError,true);assert.match(invalid.content.at(-1).text,/disableDiffing must be a boolean/);
   await run(session,'await tab.getAXState();await tab.playwright.getByRole("link",{name:"Same document",exact:true}).click();');assert.doesNotMatch(state(await run(session,'await tab.getAXState();')),/Accessibility state/);
   await run(session,'await tab.getAXState();');await run(session,`await tab.goto(${JSON.stringify(url+'next')});await tab.playwright.waitForLoadState({state:'load'});`);assert.doesNotMatch(state(await run(session,'await tab.getAXState();')),/Accessibility state/);
   // Hold a real AX reply until the next JS call owns dialog response output.
   if(Session===runtime.PersistentJavaScriptSession){
    const WebSocket=globalThis.WebSocket;let replyId,replySocket,release,heldResolve;
    const held=new Promise(resolve=>{heldResolve=resolve;});
    globalThis.WebSocket=class extends WebSocket{
     send(payload){const message=JSON.parse(payload);if(message.method==='Accessibility.getFullAXTree' && replyId===undefined){replyId=message.id;replySocket=this;}return super.send(payload);}
     addEventListener(type,listener,options){return super.addEventListener(type,type==='message'?event=>{const message=JSON.parse(event.data);if(this===replySocket && message.id===replyId && !message.method && !release){release=()=>listener.call(this,event);heldResolve();}else listener.call(this,event);}:listener,options);}
    };
    try{
     const id=value(await run(session,'nodeRepl.write(JSON.stringify(tab.id));'));
     const binding=session.run('var rebound=await cua.getTab(tab.id);nodeRepl.write("bound");');
     let timer;try{await Promise.race([held,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Native AX reply not held')),5000);})]);}finally{clearTimeout(timer);}
     const target=[...session.browserDialogs.targets.values()].find(target=>target.targetId===id);
     const opening=target.connection.send('Runtime.evaluate',{expression:'alert("Owned AX resume")'});opening.catch(()=>{});
     assert.equal((await binding).isError,false);const dialog=target.dialog;assert.ok(dialog);
     const response=session.run('await(await rebound.getJsDialog()).dismiss();');
     const deadline=Date.now()+5000;while(!dialog.consumed){assert.ok(Date.now()<deadline,'Dialog response not admitted');await new Promise(resolve=>setTimeout(resolve,5));}
     release();const resumed=await response;assert.equal(resumed.isError,false,'Initial AX output escaped its original JS call: '+JSON.stringify(resumed.content));await opening;
     assert.doesNotMatch(state(await run(session,'await rebound.getAXState();')),/Accessibility state/);
     console.log(`${Session.name} PASS initial AX delayed-native-reply/dialog response across JS output owners`);
    }finally{globalThis.WebSocket=WebSocket;release?.();}
   }
   const id=value(await run(session,'nodeRepl.write(JSON.stringify(tab.id));'));
   await rootEval(session,id,`{const named=document.createElement('form');named.name='host';document.body.append(named);const log=document.createElement('output');log.id='owned-point-events';document.body.append(log);const events=[];
    const input=(parent,name,style)=>{const node=document.createElement('input');node.type='checkbox';node.setAttribute('aria-label',name);node.style=style;for(const type of ['mousedown','click'])node.addEventListener(type,event=>{events.push({type,trusted:event.isTrusted,name,checked:node.checked});log.textContent=JSON.stringify(events);});parent.append(node);return node;};
    input(document.body,'Clipped root','position:fixed;left:-50px;top:50px;width:141.421356px;height:14.142136px;margin:0;padding:0;border:0;transform-origin:0 0;transform:rotate(-45deg)');
    const host=document.createElement('div');document.body.append(host);const inner=document.createElement('div');host.attachShadow({mode:'closed'}).append(inner);input(inner.attachShadow({mode:'closed'}),'Closed root','position:fixed;left:20px;top:100px;width:80px;height:40px;margin:0');
   }`);
   const clipped=await index(session,'Clipped root');await run(session,`await tab.click(${clipped});`);
   const closed=await index(session,'Closed root');await run(session,`await tab.click(${closed});`);
   const events=JSON.parse(await rootEval(session,id,"document.getElementById('owned-point-events').textContent"));for(const name of ['Clipped root','Closed root']){assert.ok(events.some(e=>e.name===name&&e.type==='mousedown'&&e.trusted));assert.ok(events.some(e=>e.name===name&&e.type==='click'&&e.trusted&&e.checked));}
   const covered=await index(session,'Closed root');await rootEval(session,id,`{const cover=document.createElement('div');cover.id='owned-point-cover';cover.style='position:fixed;z-index:999999;left:20px;top:100px;width:80px;height:40px;background:red';document.body.append(cover);}`);
   const refused=await session.run(`await tab.click(${covered});`);assert.equal(refused.isError,true);assert.match(refused.content.at(-1).text,/covered|different frame/i);assert.deepEqual(JSON.parse(await rootEval(session,id,"document.getElementById('owned-point-events').textContent")),events);
   await rootEval(session,id,"document.getElementById('owned-point-cover').remove()");const recovered=await index(session,'Closed root');await run(session,`await tab.click(${recovered});`);assert.equal(JSON.parse(await rootEval(session,id,"document.getElementById('owned-point-events').textContent")).at(-1).checked,false);
   console.log(`${Session.name} PASS clipped root polygon, nested closed-shadow native trusted input, cover refusal without input and recovery`);
   await rootEval(session,id,`{const input=document.createElement('input');input.type='checkbox';input.id='scaled-root';input.setAttribute('aria-label','Scaled Root');input.style='position:fixed;left:250px;top:150px;width:80px;height:40px;margin:0';document.body.append(input);const off=input.cloneNode();off.id='scaled-offscreen';off.setAttribute('aria-label','Scaled Offscreen');off.style.left='650px';off.style.top='450px';off.addEventListener('click',e=>document.body.dataset.scaledOffscreen=JSON.stringify({trusted:e.isTrusted,checked:off.checked}));document.body.append(off);const out=document.createElement('output');out.id='scaled-events';document.body.append(out);for(const type of ['dragenter','dragover','drop'])input.addEventListener(type,e=>{e.preventDefault();if(type==='drop')document.body.dataset.scaledDrop=JSON.stringify({trusted:e.isTrusted,text:e.dataTransfer.getData('text/plain')});});input.addEventListener('click',e=>out.textContent=JSON.stringify({trusted:e.isTrusted,checked:input.checked,x:e.clientX,y:e.clientY}));for(const [name,left,top,host] of [['Same',250,200,'127.0.0.1'],['Cross',350,250,'localhost']]){const f=document.createElement('iframe');f.title='Scaled '+name;f.src=${JSON.stringify(url)}.replace('127.0.0.1',host)+'scaled-frame?name='+name;f.style='position:fixed;left:'+left+'px;top:'+top+'px;width:200px;height:150px;border:2px solid';document.body.append(f);}}`);
   await run(session,`await tab.playwright.frameLocator('iframe[title="Scaled Cross"]').getByLabel('Scaled Cross',{exact:true}).waitFor({state:'visible'});`);
   const entry=[...session.browserDialogs.targets.values()].find(entry=>entry.targetId===id);
   await entry.connection.send('Target.activateTarget',{targetId:id});await entry.connection.send('Emulation.setFocusEmulationEnabled',{enabled:true});
   for(const [config,[dpr,scale]] of [[1,2],[2,2],[1.25,1.5]].entries()){
    await entry.connection.send('Emulation.setDeviceMetricsOverride',{width:800,height:600,deviceScaleFactor:dpr,mobile:false});assert.equal(await rootEval(session,id,'devicePixelRatio'),dpr);
    for(const name of ['Root','Same','Cross']){await panViewport(entry,scale);const target=await index(session,'Scaled '+name);await run(session,`await tab.click(${target});`);const result=name==='Root'?JSON.parse(await rootEval(session,id,"document.getElementById('scaled-events').textContent")):JSON.parse(value(await run(session,`nodeRepl.write(JSON.stringify(await tab.playwright.frameLocator('iframe[title="Scaled ${name}"]').locator('output').innerText()));`)));assert.equal(result.trusted,true);assert.equal(result.checked,config%2===0);if(config===1){await panViewport(entry,scale);const target=name==='Root'?"tab.playwright.getByLabel('Scaled Root',{exact:true})":`tab.playwright.frameLocator('iframe[title="Scaled ${name}"]').getByLabel('Scaled ${name}',{exact:true})`;await run(session,`await ${target}.drop({data:{'text/plain':${JSON.stringify('zoom '+name)}}},{timeoutMs:20000});`);const dropped=name==='Root'?await rootEval(session,id,'document.body.dataset.scaledDrop'):value(await run(session,`nodeRepl.write(JSON.stringify(await tab.playwright.frameLocator('iframe[title="Scaled ${name}"]').locator('body').getAttribute('data-scaled-drop')));`));assert.deepEqual(JSON.parse(dropped),{trusted:true,text:'zoom '+name});}}
    if(config===1){await panViewport(entry,scale);const target=await index(session,'Scaled Offscreen');await run(session,`await tab.click(${target});`);assert.deepEqual(JSON.parse(await rootEval(session,id,'document.body.dataset.scaledOffscreen')),{trusted:true,checked:true});}
   }
   await entry.connection.send('Emulation.setPageScaleFactor',{pageScaleFactor:1});await entry.connection.send('Emulation.clearDeviceMetricsOverride');
   console.log(`${Session.name} PASS panned visual viewport at DPR 1/2/1.25 and pinch 2/1.5 with root/SOP/OOP trusted input/drop and mixed CSS zoom`);
   console.log(`${Session.name} PASS AX semantic states, compact diffs/full values, unseen reads, screenshots, failed reads/actions, invalid options and navigation baselines`);
  }finally{await session.close();}
 }
}finally{await manager?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(scratch,{recursive:true,force:true});for(const key of ['OPEN_COMPUTER_USE_CDP_URL','OPEN_COMPUTER_USE_BROWSER_EXECUTABLE','OPEN_COMPUTER_USE_BROWSER_MODE']){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
