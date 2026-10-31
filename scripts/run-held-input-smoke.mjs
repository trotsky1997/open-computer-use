import assert from "node:assert/strict";
import {createServer} from "node:http";
import {WorkerJavaScriptSession,PersistentJavaScriptSession} from "./node-repl/open-computer-use-repl.mjs";
import {withConnection} from "./node-repl/browser-cdp.mjs";

const endpoint=process.env.OPEN_COMPUTER_USE_CDP_URL;
if(!endpoint) throw new Error("Set OPEN_COMPUTER_USE_CDP_URL to disposable Chrome");
const server=createServer((req,res)=>{
 res.setHeader('Content-Type','text/html');
 res.end(`<!doctype html><style>body{margin:0;height:${req.url.includes('key-scroll')?'4000':'1000'}px}button{position:fixed;left:80px;top:70px;width:200px;height:70px}input{position:fixed;left:80px;top:180px}output{position:fixed;left:10px;top:240px;width:600px;height:150px;overflow:auto;white-space:pre-wrap}</style><button ${req.url.includes("draggable")?'draggable="true"':''}>Held target</button><input id="typing" aria-label="Typing"><input id="other" aria-label="Other" style="top:210px"><output id="log">[]</output><script>
 const events=location.search==='?arrived'?JSON.parse(sessionStorage.getItem('navigationEvents')||'[]'):[];log.textContent=JSON.stringify(events);for(const type of ['keydown','keyup','mousedown','mouseup','click','dblclick','beforeinput','input','focusin']) document.addEventListener(type,e=>{
 events.push({type:e.type,target:e.target.tagName,id:e.target.id,data:e.data,inputType:e.inputType,visibility:document.visibilityState,x:e.clientX,y:e.clientY,key:e.key,shift:e.shiftKey,ctrl:e.ctrlKey,alt:e.altKey,meta:e.metaKey,buttons:e.buttons,detail:e.detail,scrollY,repeat:e.repeat,trusted:e.isTrusted,time:e.timeStamp});log.textContent=JSON.stringify(events);
 if(e.type==='focusin'&&e.target.id==='typing'&&location.search==='?text-redirect')document.getElementById('other').focus();
 if(e.type==='focusin'&&e.target.id==='typing'&&location.search==='?text-selection')e.target.setSelectionRange(1,3);
 if(e.type==='keydown'&&e.key==='Shift'&&location.search==='?key-shift-redirect')document.getElementById('other').focus();
 if(e.type==='keydown'&&e.key==='Shift'&&location.search==='?key-shift-name')document.getElementById('typing').setAttribute('aria-label','Changed typing');
 if(e.type==='beforeinput'&&location.search==='?text-dialog'){history.replaceState({},'',location.pathname);prompt('Text pause');}
 if(e.type==='mousedown' && location.search==='?dialog') {history.replaceState({},'',location.pathname);prompt('Held pause');}
 if(e.type==='keydown' && e.key==='ArrowDown' && location.search==='?key-dialog') {history.replaceState({},'',location.pathname);prompt('Key pause');}
 if(e.type==='keyup'&&sessionStorage.getItem('navigationEvents'))sessionStorage.setItem('navigationEvents',JSON.stringify(events));
 if(e.type==='keydown' && e.key==='Enter' && location.search==='?key-nav') {sessionStorage.setItem('navigationEvents',JSON.stringify(events));location.href='/?arrived';}
 if(e.type==='keyup' && location.search==='?release-dialog') {history.replaceState({},'',location.pathname);alert('Release pause');}
 });if(location.search==='?text-selection')document.getElementById('typing').value='abcd';</script>`);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}/`;
const native={async request(){throw Error('Native unused');}};
const session=new WorkerJavaScriptSession({native}),other=new WorkerJavaScriptSession({native});
const ids=[];
async function run(source,target=session,timeout=30000){const result=await target.run(source,timeout);assert.equal(result.isError,false,result.content.at(-1).text);return JSON.parse(result.content.at(-1).text);}
async function setup(route='',name='tab',target=session){const id=await run(`var ${name}=await cua.createBrowserTab('cdp',${JSON.stringify(url+route)},{visible:false});await ${name}.markHandoff();nodeRepl.write(JSON.stringify(${name}.id));`,target);ids.push(id);return id;}
async function state(name='tab'){return run(`nodeRepl.write(JSON.stringify(await ${name}.getAXState({emit:false})));`);}
async function index(name='tab'){const result=(await state(name)).match(/\[(\d+)\] button "Held target"/);assert.ok(result);return result[1];}
async function events(id){const target=(await(await fetch(new URL('/json/list',endpoint))).json()).find(target=>target.id===id);return withConnection(target.webSocketDebuggerUrl,async send=>JSON.parse((await send('Runtime.evaluate',{expression:'document.querySelector("output").textContent',returnByValue:true})).result.value));}
async function waitFor(test){const deadline=Date.now()+5000;while(!await test()){assert.ok(Date.now()<deadline,'Input event timeout');await new Promise(resolve=>setTimeout(resolve,10));}}
async function textState(id){const target=(await(await fetch(new URL('/json/list',endpoint))).json()).find(target=>target.id===id);return withConnection(target.webSocketDebuggerUrl,async send=>(await send('Runtime.evaluate',{expression:"({events:JSON.parse(document.querySelector('output').textContent),value:document.getElementById('typing').value,other:document.getElementById('other').value,visibility:document.visibilityState})",returnByValue:true})).result.value);}
try{
 for(const Session of [WorkerJavaScriptSession,PersistentJavaScriptSession])for(const mode of ['redirect','normal','shift-redirect','shift-name','navigation']){
  const current=new Session({native});let originalOpen;const acknowledgements=[];
  try{
   if(mode==='navigation'){originalOpen=current.browserInputs.open;current.browserInputs.open=async(...args)=>{const connection=await originalOpen(...args),send=connection.send;connection.send=async(method,params,...rest)=>{const result=await send(method,params,...rest);if(method==='Input.dispatchKeyEvent')acknowledgements.push(params);return result;};return connection;};}
   const id=await setup(mode==='redirect'?'?text-redirect':mode==='navigation'?'?key-nav':mode.startsWith('shift-')?'?key-'+mode:'','keytarget',current),baseline=await textState(id);
   await run(`var ax=await keytarget.getAXState({emit:false});var field=ax.split('\\n').find(line=>line.includes(' textbox \"Typing\"')).trimStart().match(/^\\[([^\\]]+)\\]/)[1];nodeRepl.write(JSON.stringify(true));`,current);
   const result=await current.run(`await keytarget.pressKey(field,${JSON.stringify(mode==='navigation'?'shift+Return':mode==='redirect'?'a':'shift+a')});`);
   if(mode==='navigation')await run(`await keytarget.playwright.waitForURL(${JSON.stringify(url+'?arrived')});nodeRepl.write(JSON.stringify(true));`,current);
   const final=await textState(id);
   const refused=!['normal','navigation'].includes(mode),down=final.events.filter(e=>e.type==='keydown'),up=final.events.filter(e=>e.type==='keyup');
   assert.equal(result.isError,refused,JSON.stringify({content:result.content,final}));
   if(refused)assert.match(result.content.at(-1).text,/focus|changed/i);
   assert.equal(final.value,mode==='normal'?'A':'');assert.equal(final.other,'');
   assert.deepEqual(down.map(e=>e.key),mode==='normal'?['Shift','A']:mode==='navigation'?['Shift','Enter']:mode.startsWith('shift-')?['Shift']:[]);
   const expectedUp=down.map(e=>e.key).reverse();
   if(mode==='navigation'){
    assert.deepEqual(acknowledgements.filter(e=>e.type!=='keyUp').map(e=>e.key),down.map(e=>e.key));
    assert.deepEqual(acknowledgements.filter(e=>e.type==='keyUp').map(e=>e.key),expectedUp);
    assert.deepEqual(up.map(e=>e.key),expectedUp.filter(key=>up.some(e=>e.key===key)));
   }else assert.deepEqual(up.map(e=>e.key),expectedUp);
   assert.ok(final.events.every(e=>e.trusted));
   assert.equal(final.visibility,baseline.visibility);assert.equal(current.browserInputs.leases.size,0);assert.equal(current.browserFocusLeases.entries.size,0);
   console.log(`${Session.name} PASS ${mode} indexed key target, native focus, no unintended primary down and balanced release`);
  }finally{if(originalOpen)current.browserInputs.open=originalOpen;await current.close();}
 }
 for(const Session of [WorkerJavaScriptSession,PersistentJavaScriptSession])for(const action of ['paste','text'])for(const mode of ['redirect','normal','current','selection','reply','turn','reset','timeout','close',...(Session===WorkerJavaScriptSession?['exit']:[]),'focus-failure',...(action==='paste'?['release-failure','prepare-normal','prepare-reset']:[])]){
  const current=new Session({native});let competitor,originalRelease,originalOpen,originalPaste,releasePrepare,prepared=false;
  try{
   const modal=['reply','turn','reset','timeout','close','exit'].includes(mode),id=await setup(modal?'?text-dialog':mode==='redirect'?'?text-redirect':mode==='selection'?'?text-selection':'','texttab',current);
   const baseline=await textState(id);
   await run(`var ax=await texttab.getAXState({emit:false});var field=ax.split('\\n').find(line=>line.includes(' textbox \"Typing\"')).trimStart().match(/^\\[([^\\]]+)\\]/)[1];nodeRepl.write(JSON.stringify(true));`,current);
   if(mode==='current')await run(`await texttab.playwright.getByLabel('Typing').fill('pre');nodeRepl.write(JSON.stringify(true));`,current);
   const beforeCount=(await textState(id)).events.length;
   let competitorId;
   if(modal||['focus-failure','release-failure'].includes(mode)||mode.startsWith('prepare-')){competitor=new Session({native});competitorId=await setup('','textcompetitor',competitor);}
   if(mode==='focus-failure'){
    const focus=current.browserInputs.focus;originalRelease=focus.release;focus.release=function(owner,lease){if(this.entries.get(lease)?.targetId===id)return Promise.reject(Error('Injected text focus-release outage'));return originalRelease.call(this,owner,lease);};
   }
   if(mode==='release-failure'){originalOpen=current.browserInputs.open;current.browserInputs.open=async(...args)=>{const connection=await originalOpen(...args),send=connection.send;connection.send=(method,params,...rest)=>method==='Input.dispatchKeyEvent'&&params?.type==='keyUp'?Promise.reject(Error('Injected paste release outage')):send(method,params,...rest);return connection;};}
   if(mode.startsWith('prepare-')){const gate=new Promise(resolve=>{releasePrepare=resolve;});originalPaste=current.browserInputs.paste;current.browserInputs.paste=function(owner,args,prepare){return originalPaste.call(this,owner,args,async()=>{await prepare();prepared=true;await gate;});};}
   const running=current.run(`await texttab.${action==='paste'?'paste':'typeText'}(${mode==='current'?'null':'field'},'中😀');${modal&&!['turn','reply'].includes(mode)?'await new Promise(()=>{});':''}`, mode==='timeout'?1200:30000);
   if(mode.startsWith('prepare-')){
    await waitFor(()=>prepared);const record=[...current.browserInputs.leases.values()].find(record=>record.targetId===id);assert.ok(record);assert.equal(record.keys.length,0);
    const untouched=await textState(id);assert.equal(untouched.value,'');assert.equal(untouched.events.filter(e=>e.type==='keydown'||e.type==='input').length,0);
    const denied=await competitor.run(`await textcompetitor.typeText(null,'wrong');`);assert.equal(denied.isError,true);assert.match(denied.content.at(-1).text,/already owns/);
    if(mode==='prepare-reset'){const resetting=current.reset();await waitFor(()=>record.canceled);releasePrepare();await resetting;}else releasePrepare();
   }
   if(modal){
    await waitFor(()=>[...current.browserDialogs.targets.values()].some(entry=>entry.targetId===id&&entry.dialog?.type==='prompt'));
    assert.ok([...current.browserInputs.leases.values()].some(record=>record.targetId===id));
    const denied=await competitor.run(`await textcompetitor.typeText(null,'wrong');`);assert.equal(denied.isError,true);assert.match(denied.content.at(-1).text,/already owns|dialog/);
    if(mode==='reply'){assert.equal((await running).isError,false);await run(`await (await texttab.getJsDialog()).accept('continue');nodeRepl.write(JSON.stringify(true));`,current);}
    if(mode==='turn')await current.endTurn();if(mode==='reset')await current.reset();if(mode==='close')await current.close();if(mode==='exit')await current.worker.terminate();
   }
   const result=await running;
   if(['focus-failure','release-failure'].includes(mode)){
    assert.equal(result.isError,true);assert.equal(current.browserInputs.leases.size,1);
    const denied=await competitor.run(`await textcompetitor.typeText(null,'wrong');`);assert.equal(denied.isError,true);assert.match(denied.content.at(-1).text,/already owns/);
    if(action==='paste'){const blocked=await competitor.run(`await textcompetitor.clipboard.writeText('wrong');`);assert.equal(blocked.isError,true);assert.match(blocked.content.at(-1).text,/paste.*owns|owns.*paste/i);}
    assert.equal((await current.run('nodeRepl.write(1)')).isError,true);
    if(originalRelease){current.browserInputs.focus.release=originalRelease;originalRelease=undefined;}
    if(originalOpen){current.browserInputs.open=originalOpen;originalOpen=undefined;}
    await current.reset();
    if(action==='paste')assert.equal(await run(`nodeRepl.write(JSON.stringify(await textcompetitor.clipboard.readText()));`,competitor),'中😀');
   }
   const final=await textState(id),insertions=final.events.slice(beforeCount).filter(e=>e.type==='input');
   assert.equal(result.isError,modal&&!['turn','reply'].includes(mode)||mode==='redirect'||['focus-failure','release-failure','prepare-reset'].includes(mode),JSON.stringify({content:result.content,final}));
   if(mode==='redirect'){assert.match(result.content.at(-1).text,/focus/i);assert.equal(final.value,'');assert.equal(final.other,'');assert.equal(insertions.length,0);}
   else if(mode==='prepare-reset'){assert.equal(final.value,'');assert.equal(insertions.length,0);assert.equal(final.events.filter(e=>e.type==='keydown').length,0);assert.equal(await run(`nodeRepl.write(JSON.stringify(await textcompetitor.clipboard.readText()));`,competitor),'中😀');}
   else if(modal&&mode!=='reply'){assert.ok(['','中😀'].includes(final.value));assert.ok(insertions.length<=1);}
   else{assert.equal(final.value,mode==='current'?'pre中😀':mode==='selection'?'a中😀d':'中😀');assert.equal(insertions.length,1);assert.ok(final.events.slice(beforeCount).filter(e=>['beforeinput','input'].includes(e.type)).every(e=>e.trusted&&e.visibility==='visible'));}
   assert.equal(final.other,'');assert.equal(final.visibility,baseline.visibility);
   assert.equal(current.browserInputs.leases.size,0);assert.equal(current.browserFocusLeases.entries.size,0);
   if(competitorId){const untouched=await textState(competitorId);assert.equal(untouched.value,'');assert.equal(untouched.other,'');}
   console.log(`${Session.name} PASS ${mode} ${action} input, trusted receiver, native target focus, no replay and cleanup`);
  }finally{releasePrepare?.();if(originalPaste)current.browserInputs.paste=originalPaste;if(originalRelease)current.browserInputs.focus.release=originalRelease;if(originalOpen)current.browserInputs.open=originalOpen;await competitor?.close();await current.close();}
 }
 const id=await setup();let target=await index();
 await run(`await tab.click(${JSON.stringify(target)},{key:'shift+ctrl',durationMs:80,clickCount:2});nodeRepl.write(JSON.stringify(true));`);
 let log=await events(id),mouse=log.filter(e=>['mousedown','mouseup'].includes(e.type));
 assert.equal(mouse.length,4);assert.ok(mouse.every(e=>e.shift && e.ctrl && e.trusted));
 assert.ok(mouse[1].time-mouse[0].time>=75);assert.ok(mouse[3].time-mouse[2].time>=75);
 assert.deepEqual(log.filter(e=>e.type==='keyup').map(e=>e.key),['Control','Shift']);
 assert.equal(log.at(-1).shift,false);assert.equal(log.at(-1).ctrl,false);
 const typed=await setup('', 'typed');
 await run(`await typed.playwright.getByLabel('Typing').fill('');nodeRepl.write(JSON.stringify(true));`);
 target=await index('typed');await run(`await typed.click(${JSON.stringify(target)},{key:'a',durationMs:20});nodeRepl.write(JSON.stringify(true));`);
 assert.equal(await run(`nodeRepl.write(JSON.stringify(await typed.playwright.getByLabel('Typing').inputValue()));`),'a');
 assert.ok((await events(typed)).every(e=>e.trusted));
 const keyboard=await setup('', 'keyboard');
 const field=(await state('keyboard')).match(/\[(\d+)\] textbox "Typing"/)[1];
 await run(`await keyboard.pressKey(${JSON.stringify(field)},'shift+a',{durationMs:80});nodeRepl.write(JSON.stringify(true));`);
 let keylog=(await events(keyboard)).filter(e=>e.type==='keydown'||e.type==='keyup');
 assert.deepEqual(keylog.map(e=>[e.type,e.key]),[['keydown','Shift'],['keydown','A'],['keyup','A'],['keyup','Shift']]);
 assert.ok(keylog.every(e=>e.target==='INPUT' && e.trusted && !e.repeat));assert.ok(keylog[2].time-keylog[1].time>=75);
 assert.equal(await run(`nodeRepl.write(JSON.stringify(await keyboard.playwright.getByLabel('Typing').inputValue()));`),'A');
 await run(`await keyboard.pressKey(null,'shift_r',{durationMs:20});nodeRepl.write(JSON.stringify(true));`);
 assert.equal((await events(keyboard)).at(-1).shift,false);
 const keymodal=await setup('?key-dialog','keymodal');
 assert.equal(await run(`await keymodal.pressKey(null,'shift+Down',{durationMs:80});nodeRepl.write(JSON.stringify((await keymodal.getJsDialog()).type));`),'prompt');
 await new Promise(resolve=>setTimeout(resolve,10_200));
 await run(`await (await keymodal.getJsDialog()).dismiss();nodeRepl.write(JSON.stringify(true));`);
 assert.deepEqual((await events(keymodal)).filter(e=>e.type==='keyup').map(e=>e.key),['ArrowDown','Shift']);
 const navigated=await setup('?key-nav','navigated');
 await run(`await navigated.pressKey(null,'shift+Return',{durationMs:150});nodeRepl.write(JSON.stringify(true));`);
 await run(`await navigated.playwright.waitForURL('**/?arrived');nodeRepl.write(JSON.stringify(true));`);
 assert.equal((await events(navigated)).filter(e=>e.type==='keydown' && e.key==='Enter').length,1);
 assert.equal((await events(navigated)).filter(e=>e.type==='keyup').at(-1).shift,false);
 const keyscroll=await setup('?key-scroll', 'keyscroll');
 await run(`await keyscroll.pressKey(null,'Down',{durationMs:200});nodeRepl.write(JSON.stringify(true));`);
 assert.ok((await events(keyscroll)).filter(e=>e.type==='keyup').at(-1).scrollY>0);
 const keyowner=await setup('', 'keyowner');
 const keyheld=session.run(`await keyowner.pressKey(null,'shift',{durationMs:5000});`);
 await waitFor(async()=> (await events(keyowner)).some(e=>e.type==='keydown'));
 await setup('', 'keycompetitor',other);
 const keydenied=await other.run(`await keycompetitor.playwright.getByLabel('Typing').fill('blocked');`);
 assert.equal(keydenied.isError,true);assert.match(keydenied.content.at(-1).text,/already owns/);
 await session.reset();assert.equal((await keyheld).isError,true);
 assert.equal((await events(keyowner)).filter(e=>e.type==='keyup').at(-1).shift,false);
 for(const mode of ['timeout','close','release-dialog']) {
   const keycanceled=await setup(mode==='release-dialog'?'?release-dialog':'','keycanceled');
   const pending=session.run(`await keycanceled.pressKey(null,'shift+Down',{durationMs:5000});`,mode==='timeout'?1500:30000);
   await waitFor(async()=> (await events(keycanceled)).filter(e=>e.type==='keydown').length===2);
   if(mode==='close') await session.close();else if(mode==='release-dialog') await session.reset();
   assert.equal((await pending).isError,true);
   const canceledEvents=await events(keycanceled);
   assert.equal(canceledEvents.filter(e=>e.type==='keydown').length,2);
   assert.deepEqual(canceledEvents.filter(e=>e.type==='keyup').map(e=>e.key),['ArrowDown','Shift']);
   if(mode==='close') {await session.reset();}
 }
 const keyfailure=await setup('', 'keyfailure');
 const beforeKeyFailure=(await events(keyfailure)).filter(e=>e.type==='keydown').length;
 const keyOpen=session.browserInputs.open;
 try {
   session.browserInputs.open=async(...args)=>{
     const connection=await keyOpen(...args),send=connection.send;
     connection.send=(method,params,...rest)=>method==='Input.dispatchKeyEvent' && params.type==='keyUp'?Promise.reject(Error('Injected key release outage')):send(method,params,...rest);
     return connection;
   };
   const failed=await session.run(`await keyfailure.pressKey(null,'shift',{durationMs:20});`);
   assert.equal(failed.isError,true);assert.match(failed.content.at(-1).text,/key release outage/);
   const denied=await other.run(`await keycompetitor.pressKey(null,'a');`);
   assert.equal(denied.isError,true);assert.match(denied.content.at(-1).text,/already owns/);
 } finally {session.browserInputs.open=keyOpen;}
 await session.reset();
 assert.equal((await events(keyfailure)).filter(e=>e.type==='keydown').length,beforeKeyFailure+1);
 assert.equal((await events(keyfailure)).filter(e=>e.type==='keyup').at(-1).shift,false);
 const paused=await setup('?dialog','paused');target=await index('paused');
 await run(`await paused.click(${JSON.stringify(target)},{key:'shift',durationMs:50});nodeRepl.write(JSON.stringify((await paused.getJsDialog()).type));`).then(type=>assert.equal(type,'prompt'));
 await new Promise(resolve=>setTimeout(resolve,10_200));
 await run(`await (await paused.getJsDialog()).dismiss();nodeRepl.write(JSON.stringify(true));`);
 assert.equal((await events(paused)).filter(e=>e.type==='mouseup').length,1);
 const ownerId=await setup('', 'owner');target=await index('owner');
 const otherId=await setup('', 'competitor',other);
 const owned=session.run(`await owner.click(${JSON.stringify(target)},{key:'shift',durationMs:500});`);
 await waitFor(async()=> (await events(ownerId)).some(e=>e.type==='mousedown'));
 const denied=await other.run(`await competitor.playwright.getByRole('button',{name:'Held target'}).drop({data:{'text/plain':'blocked'}});`);
 assert.equal(denied.isError,true);assert.match(denied.content.at(-1).text,/already owns/);
 assert.equal((await owned).isError,false);
 for(const route of ['?dialog','?release-dialog','?draggable']) {
   const modal=await setup(route,'modal');target=await index('modal');
   const running=session.run(`await modal.click(${JSON.stringify(target)},{key:'shift',durationMs:5000,clickCount:2});`);
   if(route==='?dialog') {assert.equal((await running).isError,false);await session.reset();}
   else {await waitFor(async()=> (await events(modal)).some(e=>e.type==='mousedown'));await session.reset();assert.equal((await running).isError,true);}
   const released=await events(modal);assert.equal(released.filter(e=>e.type==='mousedown').length,1);assert.equal(released.filter(e=>e.type==='keyup').at(-1)?.shift,false,route+JSON.stringify(released));
 }
 const canceled=await setup('', 'canceled');target=await index('canceled');
 const pending=session.run(`await canceled.click(${JSON.stringify(target)},{key:'shift',durationMs:5000,clickCount:2});`);
 await waitFor(async()=> (await events(canceled)).some(e=>e.type==='mousedown'));
 await session.reset();assert.equal((await pending).isError,true);
 log=await events(canceled);assert.equal(log.filter(e=>e.type==='mousedown').length,1);assert.equal(log.filter(e=>e.type==='mouseup').length,1);assert.equal(log.filter(e=>e.type==='keyup').at(-1).shift,false);
 assert.equal(log.filter(e=>e.type==='click' && e.target==='BUTTON').length,0,JSON.stringify(log));
 await run(`var tab=await cua.getTab(${JSON.stringify(canceled)});nodeRepl.write(JSON.stringify(true));`);
 target=await index();await run(`await tab.click(${JSON.stringify(target)},{key:'shift',durationMs:0});nodeRepl.write(JSON.stringify(true));`);
 const timeoutId=await setup('', 'timed');target=await index('timed');
 const timed=session.run(`await timed.click(${JSON.stringify(target)},{key:'shift',durationMs:5000,clickCount:2});`,1500);
 await waitFor(async()=> (await events(timeoutId)).some(e=>e.type==='mousedown'));
 assert.equal((await timed).isError,true);
 const timedLog=await events(timeoutId);assert.equal(timedLog.filter(e=>e.type==='mousedown').length,1);assert.equal(timedLog.filter(e=>e.type==='keyup').at(-1).shift,false);
 await run(`var tab=await cua.getTab(${JSON.stringify(canceled)});nodeRepl.write(JSON.stringify(true));`);
 await run(`var browser=await cua.getBrowser({id:'cdp'});var viewport=await browser.capabilities.get('viewport');await viewport.set({width:320,height:240});nodeRepl.write(JSON.stringify(true));`);
 const scale=await run(`nodeRepl.write(JSON.stringify((await tab.getScreenshot({emit:false,clip:{x:50,y:40,width:220,height:130}})).readUInt32BE(16)/220));`);
 await run(`await tab.click([${130*scale},${65*scale}],{key:'shift',durationMs:20});nodeRepl.write(JSON.stringify(true));`);
 await run(`await viewport.reset();nodeRepl.write(JSON.stringify(true));`);
 target=await index();
 const beforeFailure=(await events(canceled)).filter(e=>e.type==='mousedown').length;
 const originalOpen=session.browserInputs.open;
 try {
   session.browserInputs.open=async(...args)=>{
     const connection=await originalOpen(...args),originalSend=connection.send;
     connection.send=(method,params,...rest)=>{
       if(method==='Input.dispatchMouseEvent' && params.type==='mouseReleased') return Promise.reject(Error('Injected release outage'));
       return originalSend(method,params,...rest);
     };return connection;
   };
   const failed=await session.run(`await tab.click(${JSON.stringify(target)},{key:'shift',durationMs:20});`);
   assert.equal(failed.isError,true);assert.match(failed.content.at(-1).text,/release outage/);
   assert.equal((await session.run('nodeRepl.write(1)')).isError,true);
   const denied=await other.run(`await competitor.pressKey(null,'a');`);
   assert.equal(denied.isError,true);assert.match(denied.content.at(-1).text,/already owns/);
 } finally {session.browserInputs.open=originalOpen;}
 await session.reset();
 assert.equal((await events(canceled)).filter(e=>e.type==='mousedown').length,beforeFailure+1);
 const closing=await setup('', 'closing');target=await index('closing');
 const closed=session.run(`await closing.click(${JSON.stringify(target)},{key:'shift',durationMs:5000,clickCount:2});`);
 await waitFor(async()=> (await events(closing)).some(e=>e.type==='mousedown'));
 await session.close();assert.equal((await closed).isError,true);
 assert.equal((await events(closing)).filter(e=>e.type==='keyup').at(-1).shift,false);
 const source=new PersistentJavaScriptSession({native});
 try {
   const result=await source.run(String.raw`var tab=await cua.getTab(${JSON.stringify(canceled)});var state=await tab.getAXState({emit:false});var index=state.match(/\[(\d+)\] button "Held target"/)[1];await tab.click(index,{key:'shift',durationMs:20});await tab.pressKey(null,'shift',{durationMs:20});`);
   assert.equal(result.isError,false,result.content.at(-1).text);
 } finally {await source.close();}
 console.log(`PASS trusted held clicks/keys, duration, targeted typing, key navigation, >10s prompts, cleanup dialogs, pointer exclusivity, reset/timeout/close, failure retry, cropped-pixel viewport input at scale ${scale} and source sessions`);
}finally{
 await Promise.allSettled([session.close(),other.close()]);
 const version=await(await fetch(new URL('/json/version',endpoint))).json();for(const targetId of ids)await withConnection(version.webSocketDebuggerUrl,send=>send('Target.closeTarget',{targetId}));
 server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
}
