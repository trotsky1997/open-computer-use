import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright-core';
import { createBrowserApi } from './node-repl/browser-cdp.mjs';
import { WorkerJavaScriptSession } from './node-repl/open-computer-use-repl.mjs';
if (!process.env.OPEN_COMPUTER_USE_CDP_URL) throw new Error('Set OPEN_COMPUTER_USE_CDP_URL to a disposable browser debugging origin');
const server = createServer((req, res) => {res.setHeader('Content-Type', 'text/html');
if (req.url === '/files') {
  res.end(`<html><body><label>Single upload<input type="file" onchange="document.getElementById('file-result').textContent=Array.from(this.files).map(f=>f.name).join(',')||'empty'"></label><label>Multiple upload<input type="file" multiple onchange="document.getElementById('file-result').textContent=Array.from(this.files).map(f=>f.name).join(',')||'empty'"></label><p id="file-result">empty</p></body></html>`);
  return;
}
if (req.url === '/redirect') {res.writeHead(302,{Location:'/arrived'});res.end();return;}
if (req.url === '/slow-navigation') {
  res.write('<html><body><h1>Slow navigation</h1>');
  setTimeout(()=>res.end('<p>Document completed</p></body></html>'),300);
  return;
}
if (req.url === '/navigation') {
  res.end(`<html><body><a href="/redirect">Redirect link</a><a href="#section">Same document</a><a href="/slow-navigation">Slow link</a><button>No navigation</button><iframe srcdoc='<a href="/arrived">Child navigation</a>'></iframe><div id="section">Section</div></body></html>`);
  return;
}
if (req.url === '/arrived') {res.end('<html><body><h1>Navigation arrived</h1></body></html>');return;}
if (req.url === '/locators') {
  res.end(`<html><body><label>User name<input placeholder="Enter your name"></label><input type="checkbox" aria-label="Accept"><select aria-label="Plan"><option value="basic">Basic</option><option value="pro">Pro</option></select><button data-testid="save" onclick="document.getElementById('result').textContent='Saved '+document.querySelector('input').value">Save</button><p id="result">Waiting</p><button>Duplicate</button><button>Duplicate</button><button disabled>Never enabled</button><ul><li>Alpha</li><li>Beta</li></ul><div id="dynamic"></div><iframe title="child" srcdoc="<label>Child field<input></label>"></iframe><script>window.showLate=()=>{const button=document.createElement('button');button.textContent='Late button';button.onclick=()=>button.textContent='Late clicked';document.getElementById('dynamic').appendChild(button)};setTimeout(showLate,500)</script></body></html>`);
  return;
}
if (req.url === '/pointer') {
  res.end(`<html><body style="margin:0;min-height:2000px"><p id="viewport-width" style="position:absolute;left:300px;top:20px"></p><button style="position:absolute;left:20px;top:20px;width:100px;height:40px" onclick="this.textContent='Coordinate clicked'">Coordinate button</button><div role="slider" aria-label="Drag area" style="position:absolute;left:20px;top:100px;width:240px;height:60px;background:lightblue" onmousedown="window.dragging=true">Drag here</div><p id="drag-state" style="position:absolute;left:300px;top:100px">Not dragged</p><div role="region" aria-label="Coordinate scroll" style="position:absolute;left:20px;top:220px;width:240px;height:100px;overflow:auto" onscroll="document.getElementById('scroll-feedback').textContent='Coordinate scrolled'"><p style="height:1500px">Long content</p></div><p id="scroll-feedback" style="position:absolute;left:300px;top:220px">Not scrolled</p><script>document.getElementById("viewport-width").textContent="Viewport width "+visualViewport.width;window.onmousemove=e=>{if(window.dragging&&e.buttons===1)document.getElementById('drag-state').textContent='Dragged '+e.clientX};window.onmouseup=()=>{window.dragging=false}</script></body></html>`);
  return;
}
 res.end(`<html><title>OCU ${req.url}</title><body><h1>Browser harness ${req.url}</h1><label>Name<input aria-label="Name"></label><textarea aria-label="Notes"></textarea><div contenteditable="true" role="textbox" aria-label="Rich"><span>head tar</span><b>get tail</b></div><input aria-label="Read only" readonly value="original"><button onclick="this.textContent='Clicked'">Test button</button><div role="region" aria-label="Scroll area" tabindex="0" style="height:100px;overflow:auto" onscroll="document.getElementById('scroll-state').textContent='Scrolled'"><p style="height:1800px">Long content</p></div><p id="scroll-state">Not scrolled</p><div style="position:relative;width:100px;height:40px"><button>Covered button</button><div style="position:absolute;inset:0"></div></div></body></html>`);});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const disposers = [];
const api = createBrowserApi(() => ({write() {}, async emitImage() {}}),process.env,{onDispose:dispose=>disposers.push(dispose)});
async function visibility(tabId) {
  const targets = await (await fetch(new URL('/json/list', process.env.OPEN_COMPUTER_USE_CDP_URL))).json();
  const target = targets.find(item=>item.id===tabId);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{ws.close();reject(new Error('focus probe timed out'));},5000);
    ws.addEventListener('open',()=>ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:'document.visibilityState',returnByValue:true}})));
    ws.addEventListener('error',()=>{clearTimeout(timer);ws.close();reject(new Error('focus probe failed'));});
    ws.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id===1){clearTimeout(timer);ws.close();message.error?reject(new Error(message.error.message)):resolve(message.result.result.value);}});
  });
}
const fileDirectory = mkdtempSync(path.join(tmpdir(),'ocu-filechooser-'));
const fileA = path.join(fileDirectory,'a.txt'), fileB = path.join(fileDirectory,'b.txt');
writeFileSync(fileA,'first fixture');writeFileSync(fileB,'second fixture');
let tab;
try {
  assert.equal((await api.listBrowsers({emit:false}))[0].type, 'cdp');
  await api.getBrowser({id:'cdp'});
  const url = `http://127.0.0.1:${server.address().port}/first`;
  tab = await api.createBrowserTab('cdp', url, {visible:false});
  assert.match(await tab.getAXState({emit:false}), /Browser harness \/first/);
  assert.equal((await api.getTab({url})).id, tab.id);
  const find = (state, role, name) => {
    const line = state.split('\n').find(line => line.includes(` ${role} "${name}"`));
    assert.ok(line, `Missing ${role} ${name} in ${state}`);
    return line.match(/^\[([^\]]+)\]/)[1];
  };
  let state = await tab.getAXState({emit:false});
  await assert.rejects(tab.click(find(state, 'button', 'Covered button')), /covered or not visible/);
  state = await tab.getAXState({emit:false});
  const field = find(state, 'textbox', 'Name');
  await tab.typeText(field, 'Original');
  await tab.pressKey(field, process.platform === 'darwin' ? 'meta+a' : 'ctrl+a');
  await tab.typeText(null, '中文🙂 updated');
  assert.match(await tab.getAXState({emit:false}), /value="中文🙂 updated"/);
  await tab.paste(find(await tab.getAXState({emit:false}), 'textbox', 'Notes'), 'line one\nline two', {format:'text'});
  assert.match(await tab.getAXState({emit:false}), /line one\\nline two/);
  await assert.rejects(tab.selectText(field, '', {}), /non-empty text/);
  await assert.rejects(tab.selectText(field, 'x', {selectionType:'invalid'}), /Invalid selectionType/);
  await tab.setValue(field, 'first target second target end');
  await assert.rejects(tab.selectText(field, 'missing'), /not found/);
  assert.match(await tab.getAXState({emit:false}), /value="first target second target end"/);
  await assert.rejects(tab.selectText(field, 'target'), /Ambiguous/);
  await tab.getAXState({emit:false});
  await tab.selectText(field, 'target', {prefix:'second ',suffix:' end'});
  await tab.typeText(null, '中文🙂');
  assert.match(await tab.getAXState({emit:false}), /value="first target second 中文🙂 end"/);
  await tab.selectText(field, '中文🙂', {selectionType:'cursor_before'});
  await tab.typeText(null, '[');
  await tab.getAXState({emit:false});
  await tab.selectText(field, '中文🙂', {selectionType:'cursor_after'});
  await tab.typeText(null, ']');
  assert.match(await tab.getAXState({emit:false}), /value="first target second \[中文🙂\] end"/);
  const notes = find(await tab.getAXState({emit:false}), 'textbox', 'Notes');
  await tab.setValue(notes, 'first\n中文🙂\nlast');
  await tab.selectText(notes, '中文🙂', {prefix:'first\n',suffix:'\nlast'});
  await tab.typeText(null, 'selected');
  assert.match(await tab.getAXState({emit:false}), /value="first\\nselected\\nlast"/);
  const rich = find(await tab.getAXState({emit:false}), 'textbox', 'Rich');
  await tab.selectText(rich, 'target');
  await tab.typeText(null, 'DONE');
  assert.match(await tab.getAXState({emit:false}), /head DONE\s+tail/);
  await tab.setValue(rich, 'replacement target end');
  await tab.getAXState({emit:false});
  await tab.selectText(rich, 'target', {selectionType:'cursor_after'});
  await tab.typeText(null, '!');
  assert.match(await tab.getAXState({emit:false}), /replacement target!\s+end/);
  await assert.rejects(tab.setValue(find(await tab.getAXState({emit:false}), 'textbox', 'Read only'), 'wrong'), /read-only/);
  assert.match(await tab.getAXState({emit:false}), /value="original"/);
  const button = find(await tab.getAXState({emit:false}), 'button', 'Test button');
  await tab.click(button);
  await assert.rejects(tab.click(button), /Element changed/);
  assert.match(await tab.getAXState({emit:false}), /button "Clicked"/);
  state = await tab.getAXState({emit:false});
  await tab.scroll(find(state, 'region', 'Scroll area'), 'down', 1);
  for (let i=0; i<20; i++) {
    state = (await tab.getAXStateAndScreenshot({emit:false})).state;
    if (state.includes('"Scrolled"')) break;
  }
  assert.match(state, /"Scrolled"/);
  const png = await tab.getScreenshot({emit:false});
  assert.equal(png.subarray(1,4).toString(), 'PNG');
  await assert.rejects(tab.typeText(field, 'wrong'), /stale element index/);
  await tab.getAXState({emit:false});
  await tab.goto(url.replace('/first','/second'));
  await assert.rejects(tab.typeText(field, 'wrong'), /stale element index/);
  assert.match(await tab.getAXState({emit:false}), /Browser harness \/second/);
  await tab.back();
  assert.match(await tab.getAXState({emit:false}), /Browser harness \/first/);
  await tab.forward();
  await tab.reload();
  assert.match(await tab.getAXState({emit:false}), /Browser harness \/second/);
  const session = new WorkerJavaScriptSession({native:{async request(){throw new Error('native inventory unavailable');}}});
  try {
    const result = await session.run('var state = await cua.getState({emit:false}); nodeRepl.write(JSON.stringify(state));');
    assert.equal(result.isError, false);
    const state = JSON.parse(result.content.at(-1).text);
    assert.equal(state.browsers[0].tabs.some(item => item.id === tab.id), true);
    assert.match(state.errors[0], /native inventory unavailable/);
    const typed = await session.run(`var workerTab = await cua.getTab(${JSON.stringify(tab.id)}); var ax = await workerTab.getAXState({emit:false}); var field = ax.split("\\n").find(line => line.includes(' textbox "Name"')).match(/^\\[([^\\]]+)\\]/)[1]; await workerTab.setValue(field, "Worker target"); await workerTab.selectText(field, "target"); await workerTab.typeText(null, "input verified"); await workerTab.getAXState();`);
    assert.equal(typed.isError, false, JSON.stringify(typed.content));
    assert.ok(typed.content.some(item => item.text?.includes('value="Worker input verified"')));
  } finally {await session.close();}
  await tab.goto(url.replace('/first','/locators'));
  const originalVisibility = await visibility(tab.id);
  const user = tab.playwright.getByLabel('User name');
  await user.fill('Locator 中文🙂');
  assert.equal(await user.inputValue(), 'Locator 中文🙂');
  assert.equal(await tab.playwright.getByRole('button', {name:/^Save$/}).count(), 1);
  assert.equal(await tab.playwright.getByPlaceholder('Enter your name').inputValue(), 'Locator 中文🙂');
  await tab.playwright.getByRole('checkbox', {name:'Accept'}).check();
  assert.equal(await visibility(tab.id), originalVisibility);
  assert.equal(await tab.playwright.getByRole('checkbox', {name:'Accept'}).isChecked(), true);
  await tab.playwright.getByLabel('Plan').selectOption('pro');
  assert.equal(await tab.playwright.getByLabel('Plan').inputValue(), 'pro');
  await tab.playwright.getByTestId('save').click();
  assert.equal(await tab.playwright.getByText('Saved Locator 中文🙂', {exact:true}).innerText(), 'Saved Locator 中文🙂');
  const duplicate = tab.playwright.getByRole('button', {name:'Duplicate',exact:true});
  assert.equal(await duplicate.count(), 2);
  await assert.rejects(duplicate.click({timeoutMs:1000}), /strict mode violation/);
  assert.equal(await visibility(tab.id), originalVisibility);
  assert.equal(await duplicate.nth(1).innerText(), 'Duplicate');
  assert.equal((await duplicate.all()).length, 2);
  assert.equal(await tab.playwright.getByRole('button').and(tab.playwright.getByTestId('save')).count(), 1);
  assert.equal(await tab.playwright.getByTestId('save').or(duplicate).count(), 3);
  assert.equal(await tab.playwright.locator('body').filter({has:tab.playwright.getByTestId('save')}).count(), 1);
  assert.equal(await tab.playwright.locator('li').filter({hasText:'Beta'}).innerText(), 'Beta');
  await tab.playwright.frameLocator('iframe').getByLabel('Child field').fill('Frame verified');
  assert.equal(await tab.playwright.frameLocator('iframe').getByLabel('Child field').inputValue(), 'Frame verified');
  const snapshot = await tab.playwright.domSnapshot();
  assert.match(snapshot, /User name/);
  assert.match(snapshot, /Child field/);
  await tab.playwright.getByRole('button', {name:'Late button',exact:true}).click({timeoutMs:5000});
  assert.equal(await tab.playwright.getByRole('button', {name:'Late clicked'}).isVisible(), true);
  assert.equal((await api.listTabs({emit:false})).some(item=>item.id===tab.id), true);
  await tab.getAXState();
  const staleButton = find(await tab.getAXState({emit:false}), 'button', 'Save');
  await tab.playwright.getByTestId('save').click();
  await assert.rejects(tab.click(staleButton), /stale element index/);
  await tab.goto(url.replace('/first','/locators'));
  await user.fill('Locator survives navigation');
  assert.equal(await user.inputValue(), 'Locator survives navigation');
  const locatorWorker = new WorkerJavaScriptSession({native:{async request(){throw new Error('Native not used');}}});
  try {
    let result = await locatorWorker.run(`var locatorTab = await cua.getTab(${JSON.stringify(tab.id)}); var userLocator = locatorTab.playwright.getByLabel("User name"); await userLocator.fill("Worker locator"); nodeRepl.write(await userLocator.inputValue());`);
    assert.equal(result.isError, false, JSON.stringify(result.content));
    assert.equal(result.content.at(-1).text, 'Worker locator');
    result = await locatorWorker.run(`await userLocator.fill("Persistent worker locator"); nodeRepl.write(await locatorTab.playwright.getByRole("button", {name:/^Save$/}).count());`);
    assert.equal(result.isError, false, JSON.stringify(result.content));
    assert.equal(result.content.at(-1).text, '1');
  } finally {await locatorWorker.close();}
  for (const mode of ['timeout','reset','close','exit','cleanup-failure']) {
    const cancellation = new WorkerJavaScriptSession({native:{async request(){throw new Error('Native not used');}}});
    const originalUpdate = cancellation.browserFocusLeases.updateFocus;
    try {
      if (mode === 'cleanup-failure') cancellation.browserFocusLeases.updateFocus = (target,enabled) => {
        if (!enabled) throw new Error('Injected cleanup outage');
        return originalUpdate(target,enabled);
      };
      const baseline = await visibility(tab.id);
      const running = cancellation.run(`var t = await cua.getTab(${JSON.stringify(tab.id)}); await t.playwright.getByRole("button", {name:"Never enabled",exact:true}).click({timeoutMs:0});`, ['timeout','cleanup-failure'].includes(mode) ? 1500 : 10000);
      let acquired = false;
      for (let i=0;i<100;i++) {
        if ((await visibility(tab.id)) === 'visible') { acquired = true; break; }
        await new Promise(resolve=>setTimeout(resolve,20));
      }
      assert.equal(acquired,true,`${mode}: host focus lease was never observed`);
      if(mode === 'reset') await cancellation.reset();
      if(mode === 'close') await cancellation.close();
      if(mode === 'exit') await cancellation.worker.terminate();
      const result = await running;
      assert.equal(result.isError,true,mode);
      if(mode === 'cleanup-failure') {
        assert.match(result.content.at(-1).text,/browser cleanup failed/);
        assert.equal((await cancellation.run('nodeRepl.write(99)')).isError,true);
        cancellation.browserFocusLeases.updateFocus = originalUpdate;
        await cancellation.reset();
      }
      assert.equal(await visibility(tab.id),baseline,`${mode}: focus cleanup did not restore background visibility`);
      if(mode !== 'close') {
        const recovered = await cancellation.run('nodeRepl.write(42)');
        assert.equal(recovered.content.at(-1).text,'42',mode);
      }
    } finally {
      cancellation.browserFocusLeases.updateFocus = originalUpdate;
      await cancellation.close();
    }
  }
  const navigationURL = url.replace('/first','/navigation');
  await tab.goto(navigationURL);
  await tab.playwright.waitForLoadState({state:'load'});
  let invalidActionRan = false;
  assert.throws(()=>tab.playwright.expectNavigation(()=>{invalidActionRan=true;},{waitUntil:'invalid'}),/Invalid navigation/);
  assert.equal(invalidActionRan,false);
  assert.throws(()=>tab.playwright.waitForLoadState({timeoutMs:-1}),/non-negative/);
  const navigated = await tab.playwright.expectNavigation(async()=>{
    await tab.playwright.getByRole('link',{name:'Redirect link'}).click();
    return 'action result';
  },{url:'**/arrived',waitUntil:'load',timeoutMs:5000});
  assert.equal(navigated,'action result');
  assert.match(await tab.getAXState({emit:false}),/Navigation arrived/);
  await tab.playwright.waitForURL('**/arrived',{timeoutMs:500});
  await tab.playwright.expectNavigation(()=>tab.reload(),{url:'**/arrived',timeoutMs:5000});
  await tab.goto(navigationURL);
  await tab.playwright.expectNavigation(()=>tab.playwright.getByRole('link',{name:'Same document'}).click(),{url:'**/navigation#section',timeoutMs:5000});
  await tab.playwright.waitForURL('**/navigation#section',{waitUntil:'commit'});
  await assert.rejects(tab.playwright.expectNavigation(async()=>{throw new Error('Action failed intentionally');}),/Action failed intentionally/);
  await assert.rejects(tab.playwright.waitForURL('**/never-navigation',{timeoutMs:100}),/Timeout/);
  await assert.rejects(tab.playwright.expectNavigation(()=>tab.playwright.frameLocator('iframe').getByRole('link',{name:'Child navigation'}).click(),{timeoutMs:300}),/Timeout/);
  await tab.playwright.expectNavigation(()=>tab.playwright.getByRole('link',{name:'Slow link'}).click(),{url:'**/slow-navigation',waitUntil:'domcontentloaded',timeoutMs:5000});
  await tab.playwright.waitForLoadState({state:'load'});
  assert.match(await tab.getAXState({emit:false}),/Document completed/);
  const navigationWorker = new WorkerJavaScriptSession({native:{async request(){throw new Error('Native not used');}}});
  try {
    await tab.goto(navigationURL);
    let result = await navigationWorker.run(`var nt = await cua.getTab(${JSON.stringify(tab.id)}); var value = await nt.playwright.expectNavigation(async()=>{await nt.playwright.getByRole("link",{name:"Redirect link"}).click();return "Worker navigation";},{url:"**/arrived",timeoutMs:5000}); await nt.playwright.waitForLoadState({state:"load"}); nodeRepl.write(value);`);
    assert.equal(result.isError,false,JSON.stringify(result.content));
    assert.equal(result.content.at(-1).text,'Worker navigation');
    result = await navigationWorker.run('await nt.playwright.waitForURL("**/never-navigation",{timeoutMs:0});',500);
    assert.equal(result.isError,true);
    assert.match(result.content.at(-1).text,/timed out/);
    assert.equal((await navigationWorker.run('nodeRepl.write(42)')).content.at(-1).text,'42');
  } finally {await navigationWorker.close();}
  await tab.goto(url.replace('/first','/files'));
  await tab.playwright.waitForLoadState({state:'load'});
  let pendingChooser = tab.playwright.waitForEvent('filechooser',{timeoutMs:5000});
  await tab.playwright.getByLabel('Single upload').click();
  let chooser = await pendingChooser;
  assert.equal(chooser.isMultiple(),false);
  await assert.rejects(chooser.setFiles('relative.txt'),/absolute/);
  await assert.rejects(chooser.setFiles([fileA,fileB]),/only one/);
  await chooser.setFiles(fileA);
  assert.equal(await tab.playwright.getByText('a.txt',{exact:true}).count(),1);
  await assert.rejects(chooser.setFiles(fileB),/already consumed/);
  const fileState = await tab.getAXState({emit:false});
  pendingChooser = tab.playwright.waitForEvent('filechooser',{timeoutMs:5000});
  await tab.click(find(fileState,'button','Multiple upload'));
  chooser = await pendingChooser;
  assert.equal(chooser.isMultiple(),true);
  await chooser.setFiles([fileA,fileB]);
  assert.equal(await tab.playwright.getByText('a.txt,b.txt',{exact:true}).count(),1);
  pendingChooser = tab.playwright.waitForEvent('filechooser',{timeoutMs:5000});
  await tab.playwright.getByLabel('Multiple upload').click();
  await (await pendingChooser).setFiles([]);
  assert.equal(await tab.playwright.getByText('empty',{exact:true}).count(),1);
  await assert.rejects(tab.playwright.waitForEvent('filechooser',{timeoutMs:100}),/Timeout/);
  const fileWorker = new WorkerJavaScriptSession({native:{async request(){throw new Error('Native not used');}}});
  try {
    let result = await fileWorker.run(`var ft = await cua.getTab(${JSON.stringify(tab.id)}); var pendingFile = ft.playwright.waitForEvent("filechooser",{timeoutMs:5000}); await ft.playwright.getByLabel("Single upload").click(); var fileHandle=await pendingFile; nodeRepl.write(fileHandle.isMultiple());`);
    assert.equal(result.isError,false,JSON.stringify(result.content));
    assert.equal(result.content.at(-1).text,'false');
    result = await fileWorker.run(`await fileHandle.setFiles(${JSON.stringify(fileB)}); nodeRepl.write(await ft.playwright.getByText("b.txt",{exact:true}).count());`);
    assert.equal(result.isError,false,JSON.stringify(result.content));
    assert.equal(result.content.at(-1).text,'1');
    result = await fileWorker.run('await ft.playwright.waitForEvent("filechooser",{timeoutMs:0});',500);
    assert.equal(result.isError,true);
    assert.match(result.content.at(-1).text,/timed out/);
    result = await fileWorker.run(`var ft = await cua.getTab(${JSON.stringify(tab.id)}); var pendingFile=ft.playwright.waitForEvent("filechooser",{timeoutMs:5000}); await ft.playwright.getByLabel("Single upload").click(); var fileHandle=await pendingFile;`);
    assert.equal(result.isError,false,JSON.stringify(result.content));
    await fileWorker.reset();
    result = await fileWorker.run(`var ft = await cua.getTab(${JSON.stringify(tab.id)}); var pendingFile=ft.playwright.waitForEvent("filechooser",{timeoutMs:5000}); await ft.playwright.getByLabel("Single upload").click(); await (await pendingFile).setFiles(${JSON.stringify(fileA)}); nodeRepl.write(await ft.playwright.getByText("a.txt",{exact:true}).count());`);
    assert.equal(result.isError,false,JSON.stringify(result.content));
    assert.equal(result.content.at(-1).text,'1');
  } finally {await fileWorker.close();}
  pendingChooser = tab.playwright.waitForEvent('filechooser',{timeoutMs:5000});
  await tab.playwright.getByLabel('Single upload').click();
  await assert.rejects((await pendingChooser).setFiles(path.join(fileDirectory,'missing.txt')),/ENOENT|no such file/i);
  assert.equal(await tab.playwright.getByText('a.txt',{exact:true}).count(),1);
  const observerBrowser = await chromium.connectOverCDP(process.env.OPEN_COMPUTER_USE_CDP_URL,{noDefaults:true});
  try {
    const observedPage = observerBrowser.contexts().flatMap(context=>context.pages()).find(page=>page.url()===url.replace('/first','/files'));
    const observer = await observedPage.context().newCDPSession(observedPage);
    let intercepted = 0;
    observer.on('Page.fileChooserOpened',()=>intercepted++);
    try {
      await observer.send('Page.enable');
      await tab.playwright.getByLabel('Single upload').click();
      await observer.send('Page.disable');
      assert.equal(intercepted,0,'file chooser interception leaked after error/reset');
    } finally {await observer.detach();}
  } finally {await observerBrowser.close();}
  await tab.goto(url.replace('/first','/pointer'));
  await assert.rejects(tab.click([50,40]), /fresh screenshot/);
  const pointerImage = await tab.getScreenshot({emit:false});
  const pointerState = await tab.getAXState({emit:false});
  const width = Number(pointerState.match(/Viewport width ([\d.]+)/)[1]);
  const scale = pointerImage.readUInt32BE(16) / width;
  const pixel = (x,y) => [x*scale,y*scale];
  await tab.click(pixel(50,40));
  assert.match(await tab.getAXState({emit:false}), /Coordinate clicked/);
  await assert.rejects(tab.click(pixel(50,40)), /fresh screenshot/);
  await tab.getScreenshot({emit:false});
  await tab.drag(pixel(50,130),pixel(220,130));
  assert.match(await tab.getAXState({emit:false}), /Dragged 220/);
  await tab.getScreenshot({emit:false});
  await tab.scroll(pixel(50,250), 'down', 1);
  for (let i=0;i<20;i++) {
    state = (await tab.getAXStateAndScreenshot({emit:false})).state;
    if(state.includes('Coordinate scrolled')) break;
  }
  assert.match(state, /Coordinate scrolled/);
  await tab.getScreenshot({emit:false});
  await assert.rejects(tab.click([-1,20]), /outside the screenshot/);
  const alias = await api.getTab(tab.id);
  const aliasState = await alias.getAXState({emit:false});
  await tab.getScreenshot({emit:false});
  await alias.scroll(find(aliasState, 'RootWebArea', ''), 'down', 0.2);
  await assert.rejects(tab.click(pixel(50,40)), /geometry changed/);
  await tab.close();
  await assert.rejects(tab.getAXState(), /no longer available/);
  console.log('PASS browser inventory, create/bind, AX, PNG, click/type/key/paste/scroll/setValue/selectText/coordinate-click/drag/scroll/playwright/cancellation/navigation-waits/filechooser, stale-index rejection, navigation/history/reload, close, worker inventory failure isolation');
} finally {
  if (tab && (await api.listTabs({emit:false})).some(item=>item.id===tab.id)) await tab.close();
  await Promise.all(disposers.map(dispose=>dispose()));
  rmSync(fileDirectory,{recursive:true,force:true});
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
