// Owns its managed browser, profile and frame/event fixtures.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
const runtime=await import(process.argv[2]?pathToFileURL(path.join(process.argv[2],'scripts/open-computer-use-repl.mjs')).href:'./node-repl/open-computer-use-repl.mjs');
const binary=process.env.OCU_TEST_CHROME_EXECUTABLE;assert.ok(binary,'Set OCU_TEST_CHROME_EXECUTABLE');
const scratch=await mkdtemp(path.join(tmpdir(),'ocu-frame-ax-')),saved={...process.env},native={async request(){throw Error('Desktop unused');}};let manager;
const server=createServer((request,response)=>{
 const url=new URL(request.url,'http://fixture/'),name=url.searchParams.get('name')??'Root',port=server.address().port;
 response.setHeader('Content-Type','text/html; charset=utf-8');
 const frames=request.url==='/'?`<iframe title="Same" src="/frame?name=Same"></iframe><iframe title="Cross" src="http://localhost:${port}/frame?name=Cross"></iframe>`:name==='Cross'?'<iframe title="Nested" src="/frame?name=Nested"></iframe>':name==='Nested'?`<iframe title="Back" src="http://127.0.0.1:${port}/frame?name=Back"></iframe>`:'';
 response.end(`<!doctype html><title>Frame ${name}</title><style>iframe{display:block;margin:25px;width:600px;height:280px;border:6px solid}body{margin:8px;min-height:1000px}button{margin:15px}</style><label>Field ${name}<input id="field"></label><label>Other ${name}<input id="other"></label><label>Choice ${name}<input id="choice" type="checkbox"></label><button onclick="this.textContent='Clicked ${name}'">Button ${name}</button><button onclick="if(confirm('Owned frame dialog'))this.textContent='Accepted ${name}'">Dialog ${name}</button><button data-testid="hover" onmouseenter="if(this.dataset.arm)this.textContent='Moved ${name}'" onclick="this.dataset.clicked='yes'">Hover ${name}</button><button onclick="Element.prototype.getBoundingClientRect=()=>({x:0,y:0,width:1,height:1});window.getComputedStyle=()=>{throw Error('page style poison')};Object.defineProperty(HTMLInputElement.prototype,'value',{get(){throw Error('page value poison')},set(){throw Error('page value poison')}})">Poison ${name}</button><div role="region" aria-label="Scroll ${name}" data-testid="scroll" style="height:70px;width:200px;overflow:auto" onscroll="this.setAttribute('data-offset',this.scrollTop)"><div style="height:700px">Long content</div></div><output data-testid="events"></output>${frames}<script>const events=[];for(const type of ['mousedown','mouseup','click','input','keydown','keyup'])document.addEventListener(type,event=>{events.push({type,trusted:event.isTrusted,id:event.target.id,key:event.key,x:event.clientX,y:event.clientY});document.querySelector('output').textContent=JSON.stringify(events);});</script>`);
});await new Promise(resolve=>server.listen(0,resolve));const url=`http://127.0.0.1:${server.address().port}/`;
async function run(session,code){const result=await session.run(code,30000);assert.equal(result.isError,false,result.content.at(-1)?.text);return result;}
function value(result){return JSON.parse(result.content.at(-1).text);}
async function until(check,label){const deadline=Date.now()+10000;for(;;){const value=await check();if(value)return value;assert.ok(Date.now()<deadline,label);await new Promise(resolve=>setTimeout(resolve,10));}}
async function rootEval(session,id,expression,awaitPromise=false){const entry=[...session.browserDialogs.targets.values()].find(entry=>entry.targetId===id);assert.ok(entry);const result=await entry.connection.send('Runtime.evaluate',{expression,awaitPromise,returnByValue:true});assert.ok(!result.exceptionDetails,JSON.stringify(result.exceptionDetails));return result.result.value;}

async function frameEval(session,id,name,expression){
 const entry=[...session.browserDialogs.targets.values()].find(entry=>entry.targetId===id),base=process.argv[2],load=file=>import(base?pathToFileURL(path.join(base,'scripts',file+'.mjs')).href:'./node-repl/'+file+'.mjs');
 const {FrameConnections}=await load('browser-frames'),{openConnection}=await load('browser-cdp'),target=(await(await fetch(new URL('/json/list',entry.endpoint))).json()).find(target=>target.id===id),connection=await openConnection(target.webSocketDebuggerUrl);
 try{const frames=new FrameConnections(connection.send);await frames.refresh();const frame=[...frames.frames.values()].find(frame=>new URL(frame.url).searchParams.get('name')===name);assert.ok(frame);const result=await frames.sendFor(frame.id)('Runtime.evaluate',{contextId:await frames.world(frame.id),expression,returnByValue:true});assert.ok(!result.exceptionDetails,JSON.stringify(result.exceptionDetails));return result.result.value;}finally{connection.close();}
}

async function index(session,role,name){const text=value(await run(session,'nodeRepl.write(JSON.stringify(await tab.getAXState({emit:false})));')),line=text.split('\n').find(line=>line.includes(` ${role} ${JSON.stringify(name)}`));assert.ok(line,`Missing ${role} ${name}: ${text}`);return Number(line.match(/\[(\d+)\]/)[1]);}
try{
 let executable=path.resolve(binary);if(process.platform==='linux'){const quoted="'"+executable.replaceAll("'","'\\''")+"'";executable=path.join(scratch,'owned-chrome');await writeFile(executable,`#!/bin/sh\nexec ${quoted} --no-sandbox "$@"\n`,{mode:0o700});}
 process.env.OPEN_COMPUTER_USE_BROWSER_EXECUTABLE=executable;process.env.OPEN_COMPUTER_USE_BROWSER_MODE='headless';delete process.env.OPEN_COMPUTER_USE_CDP_URL;
 for(const Session of [runtime.WorkerJavaScriptSession,runtime.PersistentJavaScriptSession]){
  const session=new Session({native});manager=session.browserRuntime;
  try{
   await run(session,`var tab=await cua.createBrowserTab('cdp',${JSON.stringify(url)},{visible:false});await tab.markHandoff();await tab.playwright.frameLocator('iframe[title="Cross"]').frameLocator('iframe').frameLocator('iframe').getByLabel('Field Back',{exact:true}).waitFor({state:'visible'});`);
   for(const name of ['Same','Cross','Nested','Back']){
    const frame=name==='Same'?`tab.playwright.frameLocator('iframe[title="Same"]')`:name==='Cross'?`tab.playwright.frameLocator('iframe[title="Cross"]')`:name==='Nested'?`tab.playwright.frameLocator('iframe[title="Cross"]').frameLocator('iframe')`:`tab.playwright.frameLocator('iframe[title="Cross"]').frameLocator('iframe').frameLocator('iframe')`;
    let field=await index(session,'textbox','Field '+name);await run(session,`await tab.typeText(${field},'native ${name} 🌍');`);
    assert.equal(value(await run(session,`nodeRepl.write(JSON.stringify(await ${frame}.getByLabel('Field ${name}',{exact:true}).inputValue()));`)),`native ${name} 🌍`);
    assert.equal(value(await run(session,`nodeRepl.write(JSON.stringify(await ${frame}.getByLabel('Other ${name}',{exact:true}).inputValue()));`)),'');
    field=await index(session,'textbox','Field '+name);await run(session,`await tab.pressKey(${field},'End');await tab.typeText(null,'!');`);
    field=await index(session,'textbox','Field '+name);await run(session,`await tab.setValue(${field},'first target tail');`);
    field=await index(session,'textbox','Field '+name);await run(session,`await tab.selectText(${field},'target');await tab.typeText(null,'replacement');`);
    assert.equal(value(await run(session,`nodeRepl.write(JSON.stringify(await ${frame}.getByLabel('Field ${name}',{exact:true}).inputValue()));`)),'first replacement tail');
    const choice=await index(session,'checkbox','Choice '+name);await run(session,`await tab.click(${choice});`);
    const checked=value(await run(session,`nodeRepl.write(JSON.stringify(await ${frame}.getByLabel('Choice ${name}',{exact:true}).isChecked()));`));assert.equal(checked,true,JSON.stringify({name,events:value(await run(session,`nodeRepl.write(JSON.stringify(await ${frame}.getByTestId('events').innerText()));`))}));
    field=await index(session,'textbox','Field '+name);await run(session,`await tab.paste(${field},' pasted');`);
    assert.match(value(await run(session,`nodeRepl.write(JSON.stringify(await ${frame}.getByLabel('Field ${name}',{exact:true}).inputValue()));`)),/ pasted/);
    const scroll=await index(session,'region','Scroll '+name);await run(session,`await tab.scroll(${scroll},'down',1);`);
    const offset=value(await run(session,`nodeRepl.write(JSON.stringify(await ${frame}.getByTestId('scroll').evaluate(node=>node.scrollTop)));`));assert.ok(offset>0,'Native frame scroll did not change the target offset: '+offset);
    const documentIndex=await index(session,'RootWebArea','Frame '+name);await run(session,`await tab.scroll(${documentIndex},'down',1);`);assert.ok(value(await run(session,`nodeRepl.write(JSON.stringify(await ${frame}.locator('html').evaluate(node=>node.scrollTop)));`))>0);
    const button=await index(session,'button','Button '+name);await run(session,`await tab.click(${button});`);
    assert.equal(value(await run(session,`nodeRepl.write(JSON.stringify(await ${frame}.getByRole('button',{name:'Clicked ${name}',exact:true}).count()));`)),1);
    const events=JSON.parse(value(await run(session,`nodeRepl.write(JSON.stringify(await ${frame}.getByTestId('events').innerText()));`)));assert.ok(events.some(event=>event.type==='input'&&event.trusted));assert.ok(events.some(event=>event.type==='keydown'&&event.trusted));assert.ok(events.some(event=>event.type==='click'&&event.trusted));
    const dialogButton=await index(session,'button','Dialog '+name);assert.equal(value(await run(session,`await tab.click(${dialogButton});nodeRepl.write(JSON.stringify((await tab.getJsDialog()).type));`)),'confirm');await run(session,'await(await tab.getJsDialog()).accept();');assert.equal(value(await run(session,`nodeRepl.write(JSON.stringify(await ${frame}.getByRole('button',{name:'Accepted ${name}',exact:true}).count()));`)),1);
    console.log(`${Session.name} PASS native AX ${name} frame click/text/key/paste/edit/selection/scroll trusted receiver events and modal resume`);
   }
   assert.equal(value(await run(session,"nodeRepl.write(JSON.stringify(await tab.playwright.getByLabel('Field Root',{exact:true}).inputValue()));")),'');
   const id=value(await run(session,'nodeRepl.write(JSON.stringify(tab.id));')),back=`tab.playwright.frameLocator('iframe[title="Cross"]').frameLocator('iframe').frameLocator('iframe')`;
   await run(session,`await ${back}.getByRole('button',{name:'Poison Back',exact:true}).click();`);
   let field=await index(session,'textbox','Field Back');await run(session,`await tab.setValue(${field},'poison target');`);field=await index(session,'textbox','Field Back');await run(session,`await tab.selectText(${field},'target');await tab.typeText(null,'safe');`);
   assert.equal(value(await run(session,`nodeRepl.write(JSON.stringify(await ${back}.getByLabel('Field Back',{exact:true}).inputValue()));`)),'poison safe');
   for(const transform of ['scale(.9) rotate(4deg) skewX(2deg)','perspective(800px) rotateY(28deg) rotateX(8deg)','perspective(800px) rotateY(-24deg) scaleX(-1)']){
    await rootEval(session,id,`document.querySelector('iframe[title=Cross]').style.transform=${JSON.stringify(transform)}`);
    await frameEval(session,id,'Nested',"document.querySelector('iframe').style.transform='perspective(600px) rotateX(20deg) rotateZ(-5deg)'");
    for(const expected of [false,true]){const transformed=await index(session,'checkbox','Choice Back');await run(session,`await tab.click(${transformed});`);assert.equal(value(await run(session,`nodeRepl.write(JSON.stringify(await ${back}.getByLabel('Choice Back',{exact:true}).isChecked()));`)),expected);}
   }
   await frameEval(session,id,'Nested',"document.querySelector('iframe').style.transform=''");
   await rootEval(session,id,"document.querySelector('iframe[title=Cross]').style.transform=''");
   await frameEval(session,id,'Same',"document.querySelector('#choice').style.cssText='position:fixed;left:-50px;top:50px;width:141.421356px;height:14.142136px;margin:0;padding:0;border:0;transform-origin:0 0;transform:rotate(-45deg)'");
   await rootEval(session,id,"document.querySelector('iframe[title=Same]').scrollIntoView()");
   let clipped=await index(session,'checkbox','Choice Same');await run(session,`await tab.click(${clipped});`);assert.equal(value(await run(session,"nodeRepl.write(JSON.stringify(await tab.playwright.frameLocator('iframe[title=Same]').getByLabel('Choice Same',{exact:true}).isChecked()));")),false);
   await frameEval(session,id,'Same',"document.querySelector('#choice').style.cssText=''");
   console.log(`${Session.name} PASS nested projective/mirrored frame input and clipped diagonal target`);
   const collapsed=await index(session,'checkbox','Choice Back'),beforeCollapse=await frameEval(session,id,'Back',"document.querySelector('output').textContent");
   await rootEval(session,id,"document.querySelector('iframe[title=Cross]').style.transform='scaleX(0)'");
   const refused=await session.run(`await tab.click(${collapsed});`);assert.equal(refused.isError,true);assert.match(refused.content.at(-1).text,/degenerate|unsupported|folded/i);assert.equal(await frameEval(session,id,'Back',"document.querySelector('output').textContent"),beforeCollapse);
   await rootEval(session,id,"document.querySelector('iframe[title=Cross]').style.transform='perspective(800px) rotateY(28deg)'");
   let choice=await index(session,'checkbox','Choice Back');
   await rootEval(session,id,`{const frame=document.querySelector('iframe[title="Cross"]'),rect=frame.getBoundingClientRect(),cover=document.createElement('div');cover.id='owned-cover';cover.style='position:absolute;z-index:999;background:red;left:'+(rect.left+scrollX)+'px;top:'+(rect.top+scrollY)+'px;width:'+rect.width+'px;height:'+rect.height+'px';document.body.append(cover);}`);
   let blocked=await session.run(`await tab.click(${choice});`);assert.equal(blocked.isError,true);assert.match(blocked.content.at(-1).text,/covered|different frame/i);
   await rootEval(session,id,"document.getElementById('owned-cover').remove()");assert.equal(value(await run(session,`nodeRepl.write(JSON.stringify(await ${back}.getByLabel('Choice Back',{exact:true}).isChecked()));`)),true);
   await rootEval(session,id,"document.querySelector('iframe[title=Cross]').style.transform=''");
   await run(session,`await ${back}.getByTestId('hover').evaluate(node=>node.textContent);`);
   // Fixture-only native mutation leaves the frontend's observed index cache intact.
   const backFrame=[...session.browserDialogs.targets.values()].find(target=>target.targetId===id);const {FrameConnections}=await import(process.argv[2]?pathToFileURL(path.join(process.argv[2],'scripts/browser-frames.mjs')).href:'./node-repl/browser-frames.mjs');
   const {openConnection}=await import(process.argv[2]?pathToFileURL(path.join(process.argv[2],'scripts/browser-cdp.mjs')).href:'./node-repl/browser-cdp.mjs');
   const target=(await(await fetch(new URL('/json/list',backFrame.endpoint))).json()).find(target=>target.id===id),connection=await openConnection(target.webSocketDebuggerUrl);
   try{const nativeFrames=new FrameConnections(connection.send);await nativeFrames.refresh();const backId=[...nativeFrames.frames.values()].find(frame=>frame.url.includes('name=Back')).id,backWorld=await nativeFrames.world(backId);await nativeFrames.sendFor(backId)('Runtime.evaluate',{contextId:backWorld,expression:'document.querySelector("[data-testid=hover]").dataset.arm="yes"'});await connection.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:1,y:1,button:'none',buttons:0});}finally{connection.close();}
   const hover=await index(session,'button','Hover Back');blocked=await session.run(`await tab.click(${hover});`);assert.equal(blocked.isError,true);assert.match(blocked.content.at(-1).text,/changed|covered/i);assert.equal(value(await run(session,`nodeRepl.write(JSON.stringify(await ${back}.getByTestId('hover').getAttribute('data-clicked')));`)),null);
   field=await index(session,'textbox','Field Back');const held=session.run(`await tab.pressKey(${field},'a',{durationMs:10000});`,20000);
   await until(async()=>{const record=[...session.browserInputs.leases.values()].find(record=>record.keys.length);if(!record?.frames)return false;const send=record.frames.sendFor(record.framePath.at(-1).id),contextId=await record.frames.world(record.framePath.at(-1).id);const result=await send('Runtime.evaluate',{contextId,expression:'document.querySelector("output").textContent',returnByValue:true});return JSON.parse(result.result.value||'[]').some(event=>event.type==='keydown'&&event.key==='a'&&event.trusted);},'Native child keydown not received');
   await session.reset();assert.equal((await held).isError,true);assert.equal(session.browserInputs.leases.size,0);assert.equal(session.browserFocusLeases.entries.size,0);
   await run(session,`var tab=await cua.getTab(${JSON.stringify(id)});await tab.markHandoff();`);const released=JSON.parse(value(await run(session,`nodeRepl.write(JSON.stringify(await ${back}.getByTestId('events').innerText()));`)));assert.ok(released.some(event=>event.type==='keyup'&&event.key==='a'&&event.trusted));
   console.log(`${Session.name} PASS native frame pristine realms, projective nested-frame points, collapsed-frame/root occlusion, hover identity refusal and admitted child-key reset/release`);
   field=await index(session,'textbox','Field Same');
   await rootEval(session,id,`new Promise(resolve=>{const frame=document.querySelector('iframe[title="Same"]');frame.addEventListener('load',()=>resolve(true),{once:true});frame.src=${JSON.stringify(url+'frame?name=Same&revision=2')};})`,true);
   blocked=await session.run(`await tab.typeText(${field},'wrong document');`);assert.equal(blocked.isError,true);assert.match(blocked.content.at(-1).text,/frame|stale/i);
   choice=await index(session,'checkbox','Choice Same');await rootEval(session,id,`new Promise(resolve=>{const frame=document.querySelector('iframe[title="Same"]');frame.addEventListener('load',()=>resolve(true),{once:true});frame.src=${JSON.stringify(url+'frame?name=Same&revision=3')};})`,true);
   blocked=await session.run(`await tab.click(${choice});`);assert.equal(blocked.isError,true);assert.match(blocked.content.at(-1).text,/frame|stale/i);assert.equal(value(await run(session,"nodeRepl.write(JSON.stringify(await tab.playwright.frameLocator('iframe[title=Same]').getByLabel('Choice Same',{exact:true}).isChecked()));")),false);
   for(const [name,base] of [['CrossMoved',url],['CrossAgain',url.replace('127.0.0.1','localhost')]]){
    await rootEval(session,id,`new Promise(resolve=>{const frame=document.querySelector('iframe[title="Cross"]');frame.addEventListener('load',()=>resolve(true),{once:true});frame.src=${JSON.stringify(base+'frame?name=') }+${JSON.stringify(name)};})`,true);
    field=await index(session,'textbox','Field '+name);await run(session,`await tab.typeText(${field},'fresh process');`);assert.equal(value(await run(session,`nodeRepl.write(JSON.stringify(await tab.playwright.frameLocator('iframe[title="Cross"]').getByLabel('Field ${name}',{exact:true}).inputValue()));`)),'fresh process');
   }
   await rootEval(session,id,`Promise.all(['TwinA','TwinB'].map(title=>new Promise(resolve=>{const frame=document.createElement('iframe');frame.title=title;frame.addEventListener('load',()=>resolve(true),{once:true});frame.src=${JSON.stringify(url.replace('127.0.0.1','localhost')+'frame?name=Twin')};document.body.append(frame);})))`,true);
   let ax=value(await run(session,'nodeRepl.write(JSON.stringify(await tab.getAXState({emit:false})));'));let twins=ax.split('\n').filter(line=>line.includes(' checkbox "Choice Twin"')).map(line=>Number(line.match(/\[(\d+)\]/)[1]));assert.equal(twins.length,2);assert.notEqual(twins[0],twins[1]);await run(session,`await tab.click(${twins[0]});`);
   assert.equal(value(await run(session,"nodeRepl.write(JSON.stringify(await tab.playwright.frameLocator('iframe[title=TwinA]').getByLabel('Choice Twin',{exact:true}).isChecked()));")),true);assert.equal(value(await run(session,"nodeRepl.write(JSON.stringify(await tab.playwright.frameLocator('iframe[title=TwinB]').getByLabel('Choice Twin',{exact:true}).isChecked()));")),false);
   ax=value(await run(session,'nodeRepl.write(JSON.stringify(await tab.getAXState({emit:false})));'));twins=ax.split('\n').filter(line=>line.includes(' checkbox "Choice Twin"')).map(line=>Number(line.match(/\[(\d+)\]/)[1]));await rootEval(session,id,"document.querySelector('iframe[title=TwinA]').remove()");blocked=await session.run(`await tab.click(${twins[0]});`);assert.equal(blocked.isError,true);assert.equal(value(await run(session,"nodeRepl.write(JSON.stringify(await tab.playwright.frameLocator('iframe[title=TwinB]').getByLabel('Choice Twin',{exact:true}).isChecked()));")),false);
   await rootEval(session,id,`Promise.all(['Hidden','HiddenAria'].map(name=>new Promise(resolve=>{const frame=document.createElement('iframe');if(name==='Hidden')frame.style.display='none';else frame.setAttribute('aria-hidden','true');frame.addEventListener('load',()=>resolve(true),{once:true});frame.src=${JSON.stringify(url.replace('127.0.0.1','localhost')+'frame?name=')}+name;document.body.append(frame);})))`,true);
   ax=value(await run(session,'nodeRepl.write(JSON.stringify(await tab.getAXState({emit:false})));'));assert.doesNotMatch(ax,/textbox "Field Hidden/);
   console.log(`${Session.name} PASS frame reload/detach stale-index refusal, OOP/process-swap rebinding and duplicate/hidden-frame isolation`);

  }finally{await session.close();}
 }
}finally{await manager?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(scratch,{recursive:true,force:true});for(const key of ['OPEN_COMPUTER_USE_CDP_URL','OPEN_COMPUTER_USE_BROWSER_EXECUTABLE','OPEN_COMPUTER_USE_BROWSER_MODE']){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
