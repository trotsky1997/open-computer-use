import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {WorkerJavaScriptSession,PersistentJavaScriptSession} from './node-repl/open-computer-use-repl.mjs';
import {withConnection} from './node-repl/browser-cdp.mjs';
const endpoint=process.env.OPEN_COMPUTER_USE_CDP_URL;
if(!endpoint)throw Error('Set OPEN_COMPUTER_USE_CDP_URL to disposable Chrome');
let requests=0;
const server=createServer((req,res)=>{
 if(req.url==='/side-effect'){requests++;res.end('unexpected');return;}
 res.setHeader('Content-Type','text/html');
 if(req.url==='/grand'){res.end('<title>grand scope</title><p>Grand item</p>');return;}
 if(req.url==='/child'){res.end('<title>child scope</title><p class="item" data-key="child">Child item</p><iframe src="/grand"></iframe><script>document.querySelector=()=>{throw Error("child query poison")};window.getComputedStyle=()=>{throw Error("child style poison")};</script>');return;}
 res.end(`<!doctype html><title>read scope</title><style>.item {color:rgb(12,34,56)}</style><p class="item first" data-key="one" undefined="typed">First item</p><p class="item" data-key="two">Second item</p><input aria-label="Name" value="initial"><button onclick="document.title='clicked'">Click me</button><div id="shadow"></div><iframe src="http://localhost:${server.address().port}/child"></iframe><script>document.querySelector('#shadow').attachShadow({mode:'open'}).innerHTML='<span data-key="shadow">Shadow item</span>';document.querySelector('input').value='live value';Object.defineProperty(HTMLInputElement.prototype,'value',{get(){throw Error('page input poison')}});window.getComputedStyle=()=>{throw Error('page poison')};document.querySelector=()=>{throw Error('page query poison')};window.fetch=()=>{throw Error('page fetch poison')};</script>`);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}/`;
const native={async request(){throw Error('Native unused');}};
async function run(session,code){const result=await session.run(code,30000);assert.equal(result.isError,false,result.content.at(-1).text);return JSON.parse(result.content.at(-1).text);}
function observeRead(manager) {
 let complete;const completed=new Promise(resolve=>{complete=resolve;}),perform=manager.perform;
 manager.perform=function(record,args){
  let worker,userRead=false;
  Object.defineProperty(record,'worker',{get:()=>worker,set:value=>{
   worker=value;worker.on('message',message=>{const request=message.type==='read'?JSON.parse(message.request):{};userRead=request.op==='get'&&request.property==='textContent';});
  }});
  const add=record.reads.add.bind(record.reads);record.reads.add=job=>{if(userRead)job.then(complete,()=>{});return add(job);};
  return perform.call(this,record,args);
 };
 return {completed,restore(){manager.perform=perform;}};
}
async function waitForRead(probe){let timer;try{await Promise.race([probe.completed,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Interpreter did not complete its initial DOM read')),2000);})]);}finally{clearTimeout(timer);}}
try {
 for(const Session of [WorkerJavaScriptSession,PersistentJavaScriptSession]) {
  const session=new Session({native});let id;
  try {
   id=await run(session,`var tab=await cua.createBrowserTab('cdp',${JSON.stringify(url)},{visible:false});await tab.markHandoff();await tab.playwright.waitForURL(${JSON.stringify(url)});await tab.playwright.frameLocator('iframe').locator('p').waitFor();nodeRepl.write(JSON.stringify(tab.id));`);
   const page=await run(session,`var preserved=19;nodeRepl.write(JSON.stringify(await tab.playwright.evaluate(arg=>({title:document.title,items:Array.from(document.querySelectorAll('.item'),node=>({key:node.dataset.key,text:node.innerText})),value:document.querySelector('input').value,style:getComputedStyle(document.querySelector('p')).color,rect:document.querySelector('p').getBoundingClientRect().width,classes:Array.from(document.querySelector('p').classList),shadow:document.querySelector('#shadow').shadowRoot.querySelector('span').textContent,arg,typed:document.querySelector('p').getAttribute(undefined),root:document.querySelector('p').getRootNode({composed:true}).URL,globals:[typeof fetch,typeof process,typeof globalThis,typeof window.fetch],hasText:'textContent' in document.body,hasMissing:'missing' in document.body}),{phrase:'hello'})));`);
   assert.equal(page.title,'read scope');assert.deepEqual(page.items,[{key:'one',text:'First item'},{key:'two',text:'Second item'}]);assert.equal(page.value,'live value');assert.equal(page.style,'rgb(12, 34, 56)');assert.ok(page.rect>0);assert.deepEqual(page.classes,['item','first']);assert.equal(page.shadow,'Shadow item');assert.deepEqual(page.arg,{phrase:'hello'});assert.deepEqual(page.globals,['undefined','undefined','undefined','undefined']);assert.equal(page.hasText,true);assert.equal(page.hasMissing,false);assert.equal(page.typed,'typed');assert.equal(page.root,url);
   assert.deepEqual(await run(session,`nodeRepl.write(JSON.stringify(await tab.playwright.getByText('Second item',{exact:true}).evaluate((node,arg)=>({text:node.textContent,hasClass:node.classList.contains('item'),key:node.dataset.key,arg}),7)));`),{text:'Second item',hasClass:true,key:'two',arg:7});
   assert.equal(await run(session,`nodeRepl.write(JSON.stringify(await tab.playwright.locator('.item').filter({hasText:/Second/}).and(tab.playwright.getByText('Second item',{exact:true})).evaluate(node=>node.dataset.key)));`),'two');
   assert.deepEqual(await run(session,`nodeRepl.write(JSON.stringify(await tab.playwright.locator('.item').evaluateAll(nodes=>nodes.map(node=>node.dataset.key))));`),['one','two']);
   assert.deepEqual(await run(session,`nodeRepl.write(JSON.stringify(await tab.playwright.frameLocator('iframe').locator('p').evaluate(node=>({text:node.textContent,title:document.title}))));`),{text:'Child item',title:'child scope'});
   assert.deepEqual(await run(session,`nodeRepl.write(JSON.stringify(await tab.playwright.frameLocator('iframe').locator('.absent').evaluateAll(nodes=>({count:nodes.length,title:document.title}))));`),{count:0,title:'child scope'});
   assert.deepEqual(await run(session,`nodeRepl.write(JSON.stringify(await tab.playwright.frameLocator('iframe').frameLocator('iframe').locator('p').evaluate(node=>({text:node.textContent,title:document.title,parent:window.parent.document.title,parentKey:window.parent.document.querySelector('p').dataset.key,parentStyle:window.parent.getComputedStyle(window.parent.document.querySelector('p')).display}))));`),{text:'Grand item',title:'grand scope',parent:'child scope',parentKey:'child',parentStyle:'block'});
   assert.deepEqual(await run(session,`nodeRepl.write(JSON.stringify(await tab.playwright.frameLocator('iframe').frameLocator('iframe').locator('.absent').evaluateAll(nodes=>({count:nodes.length,title:document.title}))));`),{count:0,title:'grand scope'});
   assert.equal(await run(session,`nodeRepl.write(JSON.stringify(await tab.playwright.evaluate(async()=>{let fired=false;const canceled=setTimeout(()=>{fired=true;},1);clearTimeout(canceled);await new Promise(resolve=>setTimeout(resolve,5));if(fired)throw Error('Canceled timer fired');const url=new URL('/x?a=1',location.href);url.searchParams.set('b','two words');return url.searchParams.get('b')})));`),'two words');
   console.log(`${Session.name} PASS DOM/locator/frame reads`);
   const many=await session.run(`await tab.playwright.locator('.item').evaluate(node=>node.textContent);`);assert.equal(many.isError,true);assert.match(many.content.at(-1).text,/exactly one|strict mode/);
   for(const expression of ["document.title='changed'","document.querySelector('button').click()","document.body.setAttribute('data-bad','yes')","location.href='/side-effect'","fetch('/side-effect')","window.scrollTo(0,100)","(()=>{}).constructor('return process')()","import('node:fs')"]) {
    const result=await session.run(`await tab.playwright.evaluate(${JSON.stringify('()=>('+expression+')')});`);assert.equal(result.isError,true,expression);
   }
   console.log(`${Session.name} PASS mutation/escape rejection`);
   assert.equal(requests,0);assert.equal(await run(session,`nodeRepl.write(JSON.stringify(await tab.playwright.evaluate('document.title')));`),'read scope');
   const cpuProbe=observeRead(session.browserEvaluator);
   const timeout=await session.run(`await tab.playwright.evaluate(()=>{document.body.textContent;while(true){}},undefined,{timeoutMs:500});`);
   await waitForRead(cpuProbe);cpuProbe.restore();assert.equal(timeout.isError,true);assert.match(timeout.content.at(-1).text,/timed out|interrupted/);
   assert.equal(await run(session,`nodeRepl.write(JSON.stringify(preserved));`),19);
   console.log(`${Session.name} PASS CPU deadline`);
   for(const step of [1,2,3]){
    const navigationProbe=observeRead(session.browserEvaluator);
    await run(session,`var navigating=tab.playwright.evaluate(()=>{document.body.textContent;return new Promise(()=>{});},undefined,{timeoutMs:0}).catch(error=>error.message);nodeRepl.write(JSON.stringify(true));`);
    await waitForRead(navigationProbe);navigationProbe.restore();
    const destination=url+'?navigated='+step;
    await run(session,`await tab.goto(${JSON.stringify(destination)});await tab.playwright.waitForURL(${JSON.stringify(destination)});nodeRepl.write(JSON.stringify(true));`);
    assert.match(await run(session,`nodeRepl.write(JSON.stringify(await navigating));`),/navigated/u);
    assert.equal(await run(session,`nodeRepl.write(JSON.stringify(await tab.playwright.frameLocator('iframe').frameLocator('iframe').locator('p').evaluate(()=>document.title)));`),'grand scope');
   }
   const detachProbe=observeRead(session.browserEvaluator);
   await run(session,`var detached=tab.playwright.frameLocator('iframe').locator('p').evaluate(()=>{document.body.textContent;return new Promise(()=>{});},undefined,{timeoutMs:0}).catch(error=>error.message);nodeRepl.write(JSON.stringify(true));`);
   await waitForRead(detachProbe);detachProbe.restore();
   assert.match(await run(session,`var fixtureCdp=await tab.capabilities.get('cdp');await fixtureCdp.send('Runtime.evaluate',{expression:"document.getElementsByTagName('iframe')[0].remove()"});nodeRepl.write(JSON.stringify(await detached));`),/detached/u);
   const pendingProbe=observeRead(session.browserEvaluator);
   await run(session,`void tab.playwright.evaluate(()=>{document.body.textContent;return new Promise(()=>{});},undefined,{timeoutMs:0}).catch(()=>{});nodeRepl.write(JSON.stringify(true));`);
   await waitForRead(pendingProbe);pendingProbe.restore();await session.endTurn();assert.equal(session.browserEvaluator.owners.size,0);
   assert.equal(await run(session,`nodeRepl.write(JSON.stringify(await tab.playwright.evaluate(()=>document.title)));`),'read scope');
   const crashProbe=observeRead(session.browserEvaluator);
   await run(session,`var crashTab=await cua.createBrowserTab('cdp',${JSON.stringify(url)},{visible:false});await crashTab.playwright.waitForURL(${JSON.stringify(url)});var crashed=crashTab.playwright.evaluate(()=>{document.body.textContent;return new Promise(()=>{});},undefined,{timeoutMs:0}).catch(error=>error.message);nodeRepl.write(JSON.stringify(true));`);
   await waitForRead(crashProbe);crashProbe.restore();
   assert.match(await run(session,`var crashCdp=await crashTab.capabilities.get('cdp');try{await crashCdp.send('Page.crash',{}, {timeoutMs:500});}catch{}nodeRepl.write(JSON.stringify(await crashed));`),/crashed/u);
   await session.reset();assert.equal(session.browserEvaluator.owners.size,0);
   console.log(`${Session.name} PASS read-only DOM, exact locators, iframe/empty-list scopes, native state/style/shadow reads, local timers/URL, mutation and escape rejection, CPU deadline, repeated navigation/OOP load, renderer crash and turn/reset cleanup`);
  } finally {
   await session.close();
   if(id && (await(await fetch(new URL('/json/list',endpoint))).json()).some(tab=>tab.id===id)) {const version=await(await fetch(new URL('/json/version',endpoint))).json();await withConnection(version.webSocketDebuggerUrl,send=>send('Target.closeTarget',{targetId:id})).catch(async error=>{if(!error.cdpError || (await(await fetch(new URL('/json/list',endpoint))).json()).some(tab=>tab.id===id))throw error;});}
  }
 }
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
