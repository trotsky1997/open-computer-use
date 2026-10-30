import assert from "node:assert/strict";
import {createServer} from "node:http";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {WorkerJavaScriptSession} from "./node-repl/open-computer-use-repl.mjs";

const endpoint = process.env.OPEN_COMPUTER_USE_CDP_URL;
if (!endpoint) throw new Error("Set OPEN_COMPUTER_USE_CDP_URL to a disposable headless Chrome launched with --enable-automation");
const server = createServer((request,response) => {
  response.setHeader("Content-Type","text/html; charset=utf-8");
  response.end(`<!doctype html><title>Clipboard fixture</title>
    <label>Text<textarea onbeforeinput="this.dataset.beforeTrusted=event.isTrusted;if(prevent.checked&&event.inputType==='insertFromPaste')event.preventDefault()" onpaste="this.dataset.trusted=event.isTrusted;this.dataset.pasted=event.clipboardData.getData('text/plain');if(triggerPrompt.checked)prompt('Paste?')" oninput="this.dataset.inputType=event.inputType"></textarea></label>
    <label>Prompt on paste<input type="checkbox" id="triggerPrompt"></label>
    <label>Prevent<input type="checkbox" id="prevent"></label><label>Password<input type="password" value="fixture secret"></label>
    <label>Limited<input maxlength="4"></label><label>Read only<input readonly value="original"></label>
    <div contenteditable="true" role="textbox" aria-label="Rich" oninput="this.dataset.html=this.innerHTML" onpaste="this.dataset.trusted=event.isTrusted;this.dataset.fileType=event.clipboardData.files[0]?.type??''"></div>
    <output id="result">Ready</output><script>var canvas=document.createElement('canvas');canvas.width=canvas.height=1;canvas.getContext('2d').fillRect(0,0,1,1);document.body.dataset.png=canvas.toDataURL('image/png').split(',')[1];</script>`);
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
const native = {async request(){throw new Error("Native backend unused");}};
const session = new WorkerJavaScriptSession({native});
const other = new WorkerJavaScriptSession({native});
async function run(source,target=session) {
  const result = await target.run(source);
  assert.equal(result.isError,false,JSON.stringify(result.content));
  return JSON.parse(result.content.at(-1).text);
}
const modifier = process.platform === "darwin" ? "Meta" : "Control";
const systemClipboardHash = () => process.platform === "darwin" ? createHash("sha256").update(execFileSync("pbpaste")).digest("hex") : undefined;
const originalSystemClipboard = systemClipboardHash();
async function index(name) {
  const state = await run('nodeRepl.write(JSON.stringify(await tab.getAXState({emit:false})));');
  const found = state.match(new RegExp(`\\[(\\d+)\\] textbox ${JSON.stringify(name)}`));
  assert.ok(found,`Missing textbox ${name}`);
  return found[1];
}
try {
  const id = await run(`var tab=await cua.createBrowserTab("cdp",${JSON.stringify(url)},{visible:false}); await tab.clipboard.writeText("Clipboard 你好 🙂"); nodeRepl.write(JSON.stringify(tab.id));`);
  assert.equal(await run('nodeRepl.write(JSON.stringify(await tab.clipboard.readText()));'),"Clipboard 你好 🙂");
  assert.deepEqual(await run('nodeRepl.write(JSON.stringify((await cua.listTabs({emit:false})).filter(item=>item.url.includes("__ocu_clipboard_"))));'),[]);
  await run(`var tab=await cua.getTab(${JSON.stringify(id)}); nodeRepl.write(JSON.stringify(await tab.clipboard.readText()));`,other);
  const state = await run('nodeRepl.write(JSON.stringify(await tab.getAXState({emit:false})));');
  const textIndex = state.match(/\[(\d+)\] textbox "Text"/)[1];
  const richIndex = state.match(/\[(\d+)\] textbox "Rich"/)[1];
  assert.equal(await run(`await tab.pressKey(${JSON.stringify(textIndex)},${JSON.stringify(modifier + "+v")}); nodeRepl.write(JSON.stringify(await tab.playwright.getByLabel("Text",{exact:true}).inputValue()));`),"Clipboard 你好 🙂");
  assert.equal(await run('nodeRepl.write(JSON.stringify(await tab.playwright.getByLabel("Text",{exact:true}).getAttribute("data-trusted")));'),"true");
  assert.equal(await run('nodeRepl.write(JSON.stringify(await tab.playwright.getByLabel("Text",{exact:true}).getAttribute("data-input-type")));'),"insertFromPaste");
  await run('await tab.clipboard.write([{entries:[{mimeType:"text/plain",text:"Rich text"},{mimeType:"text/html",text:"<b>Rich text</b><script>window.unwanted=1</script>"}]}]); nodeRepl.write(JSON.stringify(true));');
  const items = await run('nodeRepl.write(JSON.stringify(await tab.clipboard.read()));');
  assert.equal(items[0].entries.find(entry=>entry.mimeType === "text/plain").text,"Rich text");
  assert.doesNotMatch(items[0].entries.find(entry=>entry.mimeType === "text/html").text,/<script/i);
  await run(`await tab.pressKey(${JSON.stringify(richIndex)},${JSON.stringify(modifier + "+v")}); nodeRepl.write(JSON.stringify(true));`);
  assert.match(await run('nodeRepl.write(JSON.stringify(await tab.playwright.getByRole("textbox",{name:"Rich",exact:true}).getAttribute("data-html")));'),/<b>Rich text<\/b>/);

  await run(`await tab.paste(${JSON.stringify(await index("Rich"))},"<i>Formatted</i><script>window.unwanted=1</script>",{format:"html"}); nodeRepl.write(JSON.stringify(true));`);
  const rich = await run('nodeRepl.write(JSON.stringify(await tab.playwright.getByRole("textbox",{name:"Rich",exact:true}).getAttribute("data-html")));');
  assert.match(rich,/<i>Formatted<\/i>/);
  assert.doesNotMatch(rich,/<script/i);
  await run(`await tab.playwright.getByLabel("Text",{exact:true}).press(${JSON.stringify(modifier + "+a")}); nodeRepl.write(JSON.stringify(true));`);
  await run(`await tab.paste(${JSON.stringify(await index("Text"))},"undo payload"); nodeRepl.write(JSON.stringify(true));`);
  assert.equal(await run('nodeRepl.write(JSON.stringify(await tab.playwright.getByLabel("Text",{exact:true}).inputValue()));'),"undo payload");
  await run(`await tab.playwright.getByLabel("Text",{exact:true}).press(${JSON.stringify(modifier + "+z")}); nodeRepl.write(JSON.stringify(true));`);
  assert.equal(await run('nodeRepl.write(JSON.stringify(await tab.playwright.getByLabel("Text",{exact:true}).inputValue()));'),"Clipboard 你好 🙂");
  await run('await tab.playwright.getByLabel("Prevent",{exact:true}).check(); nodeRepl.write(JSON.stringify(true));');
  await run(`await tab.paste(${JSON.stringify(await index("Text"))},"canceled"); nodeRepl.write(JSON.stringify(true));`);
  assert.equal(await run('nodeRepl.write(JSON.stringify(await tab.playwright.getByLabel("Text",{exact:true}).inputValue()));'),"Clipboard 你好 🙂");
  assert.equal(await run('nodeRepl.write(JSON.stringify(await tab.playwright.getByLabel("Text",{exact:true}).getAttribute("data-before-trusted")));'),"true");
  await run('await tab.playwright.getByLabel("Prevent",{exact:true}).uncheck(); nodeRepl.write(JSON.stringify(true));');
  await run(`await tab.paste(${JSON.stringify(await index("Limited"))},"ABCDE"); await tab.paste(${JSON.stringify(await index("Read only"))},"blocked"); nodeRepl.write(JSON.stringify(true));`);
  assert.equal(await run('nodeRepl.write(JSON.stringify(await tab.playwright.getByLabel("Limited",{exact:true}).inputValue()));'),"ABCD");
  assert.equal(await run('nodeRepl.write(JSON.stringify(await tab.playwright.getByLabel("Read only",{exact:true}).inputValue()));'),"original");

  await run(`await tab.setValue(${JSON.stringify(await index("Text"))},"copy this"); await tab.selectText(${JSON.stringify(await index("Text"))},"copy"); await tab.pressKey(null,${JSON.stringify(modifier + "+c")}); nodeRepl.write(JSON.stringify(true));`);
  assert.equal(await run('nodeRepl.write(JSON.stringify(await tab.clipboard.readText()));'),"copy");
  await run(`await tab.pressKey(null,${JSON.stringify(modifier + "+x")}); nodeRepl.write(JSON.stringify(true));`);
  assert.equal(await run('nodeRepl.write(JSON.stringify(await tab.playwright.getByLabel("Text",{exact:true}).inputValue()));')," this");
  await run(`await tab.pressKey(${JSON.stringify(await index("Password"))},${JSON.stringify(modifier + "+a")}); await tab.pressKey(null,${JSON.stringify(modifier + "+c")}); nodeRepl.write(JSON.stringify(true));`);
  assert.equal(await run('nodeRepl.write(JSON.stringify(await tab.clipboard.readText()));'),"copy");
  const invalidPng = await session.run('await tab.clipboard.write([{entries:[{mimeType:"image/png",base64:"AA=="}]}]);');
  assert.equal(invalidPng.isError,true);
  assert.equal(await run('nodeRepl.write(JSON.stringify(await tab.clipboard.readText()));'),"copy");

  const png = await run('nodeRepl.write(JSON.stringify(await tab.playwright.locator("body").getAttribute("data-png")));');
  await run(`await tab.clipboard.write([{entries:[{mimeType:"image/png",base64:${JSON.stringify(png)}}]}]); nodeRepl.write(JSON.stringify(true));`);
  const image = (await run('nodeRepl.write(JSON.stringify(await tab.clipboard.read()));'))[0].entries.find(entry=>entry.mimeType === "image/png");
  const bytes = Buffer.from(image.base64,"base64");
  assert.equal(bytes.subarray(1,4).toString(),"PNG");
  assert.equal(bytes.readUInt32BE(16),1);
  await run(`await tab.pressKey(${JSON.stringify(await index("Rich"))},${JSON.stringify(modifier + "+v")}); await tab.playwright.locator("[contenteditable] img").waitFor({state:"attached"}); nodeRepl.write(JSON.stringify(true));`);
  assert.equal(await run('nodeRepl.write(JSON.stringify(await tab.playwright.getByRole("textbox",{name:"Rich",exact:true}).getAttribute("data-file-type")));'),"image/png");

  await run('await tab.clipboard.writeText("persistent browser state"); nodeRepl.write(JSON.stringify(true));');
  const owner = session.worker;
  await session.reset();
  assert.equal(session.browserClipboard.owners.has(owner),false);
  assert.equal(await run('nodeRepl.write(JSON.stringify(await tab.clipboard.readText()));',other),"persistent browser state");
  await other.close();
  assert.equal(session.browserClipboard.server,undefined);
  assert.equal(await run(`var tab=await cua.getTab(${JSON.stringify(id)}); nodeRepl.write(JSON.stringify(await tab.clipboard.readText()));`),"persistent browser state");
  const timedOutOwner = session.worker;
  assert.equal((await session.run('while(true){}',150)).isError,true);
  assert.equal(session.browserClipboard.owners.has(timedOutOwner),false);
  assert.equal(session.browserClipboard.server,undefined);

  await run(`var tab=await cua.getTab(${JSON.stringify(id)}); await tab.clipboard.writeText("stable before cancellation"); nodeRepl.write(JSON.stringify(true));`);
  const manager = session.browserClipboard;
  const originalJson = manager.json;
  let enter, release, timer;
  const entered = new Promise(resolve=>{enter=resolve;});
  const gate = new Promise(resolve=>{release=resolve;});
  manager.json = async function(endpoint,route) {if(route === "/json/list"){enter();await gate;}return originalJson.call(this,endpoint,route);};
  try {
    const pending = session.run('await tab.clipboard.writeText("canceled before dispatch")');
    await Promise.race([entered,new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(new Error("Clipboard operation never reached discovery")),5000);})]);
    clearTimeout(timer);
    const resetting = session.reset();
    release();
    await resetting;
    assert.equal((await pending).isError,true);
  } finally {clearTimeout(timer);release();manager.json=originalJson;}
  assert.equal(await run(`var tab=await cua.getTab(${JSON.stringify(id)}); nodeRepl.write(JSON.stringify(await tab.clipboard.readText()));`),"stable before cancellation");
  const originalConnect = manager.connect;
  manager.connect = (url,operation)=>originalConnect(url,send=>operation((method,params)=>method === "Target.closeTarget" ? Promise.reject(new Error("Injected clipboard cleanup outage")) : send(method,params)));
  try {
    await assert.rejects(session.reset(),/cleanup outage/);
    assert.equal((await session.run('nodeRepl.write(42)')).isError,true);
    assert.ok(manager.internalTargets().length);
  } finally {manager.connect=originalConnect;}
  await session.reset();
  assert.deepEqual(manager.internalTargets(),[]);
  assert.equal(manager.server,undefined);

  await run(`var tab=await cua.getTab(${JSON.stringify(id)}); await tab.playwright.getByLabel("Prompt on paste",{exact:true}).check(); nodeRepl.write(JSON.stringify(true));`);
  assert.equal(await run(`await tab.paste(${JSON.stringify(await index("Text"))},"dialog paste"); nodeRepl.write(JSON.stringify((await tab.getJsDialog()).type));`),"prompt");
  const controls = manager.internalTargets();
  await session.reset();
  assert.equal(manager.server,undefined);
  const targets = await(await fetch(new URL("/json/list",endpoint))).json();
  assert.ok(controls.every(id=>!targets.some(target=>target.id===id)));
  assert.equal(await run(`var tab=await cua.getTab(${JSON.stringify(id)}); nodeRepl.write(JSON.stringify((await tab.getJsDialog())===undefined));`),true);
  manager.connect = (url,operation)=>originalConnect(url,send=>operation(async (method,params)=>{
    const result = await send(method,params);
    if (method === "Emulation.setFocusEmulationEnabled" && params.enabled) throw new Error("Injected uncertain clipboard focus acquisition");
    return result;
  }));
  try {
    assert.equal((await session.run('await tab.clipboard.writeText("must not be dispatched")')).isError,true);
    assert.equal(manager.server,undefined);
    assert.deepEqual(manager.internalTargets(),[]);
  } finally {manager.connect=originalConnect;}
  assert.equal(await run(`var tab=await cua.getTab(${JSON.stringify(id)}); nodeRepl.write(JSON.stringify(await tab.clipboard.readText()));`),"dialog paste");
  assert.equal(systemClipboardHash(),originalSystemClipboard);
  console.log("PASS native text/HTML/PNG clipboard, trusted copy/cut/paste, sanitization, undo, editability limits, password protection, hidden bridges, shared state, cancellation before dispatch, paste dialogs and reset/timeout/close with cleanup failure/retry; macOS system clipboard unchanged");
} finally {
  await session.close();
  await other.close();
  for (const target of await(await fetch(new URL("/json/list",endpoint))).json()) if (target.type === "page" && target.url.startsWith(url)) await fetch(new URL(`/json/close/${target.id}`,endpoint));
  server.closeAllConnections();
  await new Promise(resolve=>server.close(resolve));
}
