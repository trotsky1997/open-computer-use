// Owns the X server, window manager, browsers and fixture pages; requires Linux Xvfb/Openbox/xprop/xwininfo and system Python Gtk 3.
import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {once} from 'node:events';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,rm,access} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {withConnection} from './node-repl/browser-cdp.mjs';
const runtime=await import(process.argv[2]?pathToFileURL(path.join(process.argv[2],'scripts/open-computer-use-repl.mjs')).href:'./node-repl/open-computer-use-repl.mjs');
if(process.platform!=='linux')throw Error('This owned native-window fixture requires Linux');
const binary=process.env.OCU_TEST_CHROME_EXECUTABLE;if(!binary)throw Error('Set OCU_TEST_CHROME_EXECUTABLE');
const scratch=await mkdtemp(path.join(tmpdir(),'ocu-visibility-')),saved={...process.env};let display,wm,server;
const execute=promisify(execFile),pause=()=>new Promise(resolve=>setTimeout(resolve,20));
async function until(check,label){const deadline=Date.now()+15000;for(;;){if(await check())return;assert.ok(Date.now()<deadline,label);await pause();}}
async function run(session,code){const result=await session.run(code,30000);assert.equal(result.isError,false,result.content.at(-1)?.text);return JSON.parse(result.content.at(-1).text);}
async function stop(child){if(child?.pid&&child.exitCode===null&&child.signalCode===null){const exited=once(child,'exit');child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),3000);try{await exited;}finally{clearTimeout(timer);}}}
const gtk="import gi,json,sys;gi.require_version('Gtk','3.0');from gi.repository import Gtk,Gdk;Gtk.init([]);clipboard=Gtk.Clipboard.get(Gdk.SELECTION_CLIPBOARD);";
async function nativeText(){return JSON.parse((await execute('/usr/bin/python3',['-c',gtk+'print(json.dumps(clipboard.wait_for_text()))'])).stdout);}
async function seedClipboard(text){const child=spawn('/usr/bin/python3',['-u','-c',gtk+"clipboard.set_text(sys.argv[1],-1);print('ready',flush=True);Gtk.main()",text],{stdio:['ignore','pipe','inherit']});let ready=false;child.stdout.on('data',()=>{ready=true;});await until(()=>ready,'Native fixture clipboard owner did not start');return child;}
async function closeWindows(socket){
 await withConnection(socket,async send=>{
    const {targetInfos}=await send('Target.getTargets',{filter:[{type:'page'}]}),visible=[];
    for(const info of targetInfos){try{await send('Browser.getWindowForTarget',{targetId:info.targetId});visible.push(info.targetId);}catch(error){if(error.message!=='No browser window found')throw error;}}
    for(const targetId of visible)await send('Target.closeTarget',{targetId});
   });
}
async function nativeWindows(pid){
 const {stdout}=await execute('xprop',['-root','_NET_CLIENT_LIST']);const result=[];
 for(const id of stdout.match(/0x[\da-f]+/giu)??[]){
  try{
   const owner=await execute('xprop',['-id',id,'_NET_WM_PID']);if(!owner.stdout.trim().endsWith('= '+pid))continue;
   const info=await execute('xwininfo',['-id',id]);result.push({id,visible:/Map State: IsViewable/u.test(info.stdout)});
  }catch(error){if(!/BadWindow|Bad Drawable|No such window/u.test(error.stderr??''))throw error;}
 }return result;
}
try{
 display=spawn('Xvfb',['-displayfd','3','-screen','0','1280x800x24','-nolisten','tcp','-noreset'],{stdio:['ignore','ignore','inherit','pipe']});
 let number='';display.stdio[3].on('data',chunk=>{number+=chunk;});await until(()=>/^\d+\s*$/u.test(number),'Owned X display did not start');process.env.DISPLAY=':'+number.trim();
 wm=spawn('openbox',[],{env:process.env,stdio:['ignore','ignore','ignore']});
 await until(async()=>{try{return /0x[1-9a-f][\da-f]*/iu.test((await execute('xprop',['-root','_NET_SUPPORTING_WM_CHECK'])).stdout);}catch{return false;}},'Owned window manager did not start');
 const executable=path.join(scratch,'owned-chrome'),quoted="'"+path.resolve(binary).replaceAll("'","'\\''")+"'";
 await writeFile(executable,`#!/bin/sh\nexec ${quoted} --no-sandbox "$@"\n`,{mode:0o700});
 process.env.OPEN_COMPUTER_USE_BROWSER_EXECUTABLE=executable;process.env.OPEN_COMPUTER_USE_BROWSER_MODE='headful';delete process.env.OPEN_COMPUTER_USE_CDP_URL;
 server=createServer((request,response)=>{response.setHeader('Content-Type','text/html');response.setHeader('Set-Cookie','window_retained=1; Path=/; SameSite=Lax');response.end(`<title>Owned visibility fixture</title><output>${request.headers.cookie??''}</output><label>Value<input onpaste="this.dataset.trusted=event.isTrusted"></label><div contenteditable="true" role="textbox" aria-label="Rich" onpaste="this.dataset.trusted=event.isTrusted;this.dataset.fileType=event.clipboardData.files[0]?.type??''"></div><script>var canvas=document.createElement('canvas');canvas.width=canvas.height=1;canvas.getContext('2d').fillRect(0,0,1,1);document.body.dataset.png=canvas.toDataURL('image/png').split(',')[1];</script>`);});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}/`;
 for(const Session of [runtime.WorkerJavaScriptSession,runtime.PersistentJavaScriptSession]){
  const clipboardOwner=await seedClipboard('Native GTK 你好');
  const session=new Session({native:{async request(){throw Error('Desktop runtime must remain unused');}}});let owned;
  try{
   assert.equal(await run(session,"var browser=await cua.getBrowser({id:'cdp'});var visibility=await browser.capabilities.get('visibility');nodeRepl.write(JSON.stringify(await visibility.get()));"),false);
   owned=session.browserRuntime.current;assert.equal(owned.headless,false);
   await until(async()=>{const windows=await nativeWindows(owned.pid);return windows.length>0&&windows.every(window=>!window.visible);},'Headful startup unexpectedly presented a window');
   const id=await run(session,`var tab=await cua.createBrowserTab('cdp',${JSON.stringify(url)},{visible:true});await tab.playwright.getByLabel('Value').click();await tab.typeText(null,'preserved');await tab.markHandoff();nodeRepl.write(JSON.stringify(tab.id));`);
   assert.equal(await run(session,'nodeRepl.write(JSON.stringify(await visibility.get()));'),true);
   assert.equal(await run(session,'nodeRepl.write(JSON.stringify(await tab.clipboard.readText()));'),'Native GTK 你好');
   await run(session,"await tab.clipboard.writeText('Headful clipboard 你好 🙂');nodeRepl.write(JSON.stringify(true));");assert.equal(await nativeText(),'Headful clipboard 你好 🙂');
   const bridges=[...session.browserClipboard.owners.values()].flatMap(state=>[...state.bridges.values()]);assert.equal(bridges.length,1);assert.ok(bridges[0].connection);
   const visibleTabs=await run(session,"var management=await browser.capabilities.get('management');nodeRepl.write(JSON.stringify(await management.tabs.query({}))); ");assert.equal(visibleTabs.some(tab=>tab.url===bridges[0].url),false,'Clipboard helper appeared in the native tab strip');

   const runtimeURL=process.argv[2]?pathToFileURL(path.join(process.argv[2],'scripts/open-computer-use-repl.mjs')).href:new URL('./node-repl/open-computer-use-repl.mjs',import.meta.url).href;
   const rejected=await execute(process.execPath,['--input-type=module','-e',`const runtime=await import(${JSON.stringify(runtimeURL)});const session=new runtime.WorkerJavaScriptSession({native:{async request(){throw Error('Native unused');}}});try{const result=await session.run(${JSON.stringify("var tab=await cua.getTab("+JSON.stringify(id)+");await tab.clipboard.writeText('Rejected external write');")});console.log(JSON.stringify({failed:result.isError,error:result.content.at(-1)?.text}));}finally{await session.close();}`],{env:{...process.env,OPEN_COMPUTER_USE_CDP_URL:owned.endpoint}});
   const refusal=JSON.parse(rejected.stdout);assert.equal(refusal.failed,true);assert.match(refusal.error,/host-owned headful/);assert.equal(await nativeText(),'Headful clipboard 你好 🙂');

   assert.equal(await run(session,"await tab.playwright.getByLabel('Value').press('Control+a');await tab.paste(null,'preserved');nodeRepl.write(JSON.stringify(await tab.playwright.getByLabel('Value').getAttribute('data-trusted')));"),'true');
   assert.equal(await nativeText(),'preserved');
   assert.match(await run(session,"await tab.playwright.getByRole('textbox',{name:'Rich'}).click();await tab.paste(null,'<strong>Rich 你好</strong><script>window.unwanted=1</script>',{format:'html'});nodeRepl.write(JSON.stringify(await tab.playwright.getByRole('textbox',{name:'Rich'}).getAttribute('data-trusted')));"),/true/);
   const html=await run(session,"nodeRepl.write(JSON.stringify(await tab.playwright.getByRole('textbox',{name:'Rich'}).evaluate(node=>node.innerHTML)));");assert.match(html,/Rich 你好/);assert.doesNotMatch(html,/<script/iu);
   const png=await run(session,"nodeRepl.write(JSON.stringify(await tab.playwright.locator('body').getAttribute('data-png')));");
   await run(session,`await tab.clipboard.write([{entries:[{mimeType:'image/png',base64:${JSON.stringify(png)}}]}]);nodeRepl.write(JSON.stringify(true));`);
   const pixels=JSON.parse((await execute('/usr/bin/python3',['-c',gtk+"image=clipboard.wait_for_image();print(json.dumps([image.get_width(),image.get_height()] if image else None))"])).stdout);assert.deepEqual(pixels,[1,1]);
   const image=await run(session,"nodeRepl.write(JSON.stringify(await tab.clipboard.read()));");assert.ok(image.some(item=>item.entries.some(entry=>entry.mimeType==='image/png'&&Buffer.from(entry.base64,'base64').subarray(1,4).toString()==='PNG')));
   assert.equal(await run(session,"await tab.playwright.getByRole('textbox',{name:'Rich'}).click();await tab.pressKey(null,'Control+v');nodeRepl.write(JSON.stringify(await tab.playwright.getByRole('textbox',{name:'Rich'}).getAttribute('data-file-type')));"),'image/png');
   await run(session,"await tab.clipboard.writeText('Clipboard retained across reset');nodeRepl.write(JSON.stringify(true));");

   await until(async()=>{const windows=await nativeWindows(owned.pid);return windows.some(window=>window.visible);},'Presentation did not map a native window');
   await withConnection(owned.socket,send=>send('Target.createTarget',{url:url+'second',newWindow:true}));
   await until(async()=>(await nativeWindows(owned.pid)).length===2,'Second native window missing');
   await run(session,'await visibility.set(false);nodeRepl.write(JSON.stringify(await visibility.get()));');
   await until(async()=>{const windows=await nativeWindows(owned.pid);return windows.length===2&&windows.every(window=>!window.visible);},'Hide did not minimize both owned windows');
   assert.equal(await run(session,"var rejected=false;try{await visibility.set('true');}catch{rejected=true;}nodeRepl.write(JSON.stringify(rejected));"),true);
   assert.equal(await run(session,`var background=await cua.createBrowserTab('cdp',${JSON.stringify(url+'background')},{visible:false});nodeRepl.write(JSON.stringify(await visibility.get()));`),false);
   await until(async()=>{const windows=await nativeWindows(owned.pid);return windows.length===2&&windows.every(window=>!window.visible);},'Background tab unexpectedly presented a window');
   bridges[0].connection.close();await bridges[0].closed;
   const interrupted=await session.run('await tab.clipboard.readText();');assert.equal(interrupted.isError,true);assert.match(interrupted.content.at(-1).text,/helper connection lost/);
   await session.reset();assert.equal(session.browserRuntime.current,owned);assert.equal(session.browserClipboard.owners.size,0);
   assert.equal(await run(session,"var browser=await cua.getBrowser({id:'cdp'});var visibility=await browser.capabilities.get('visibility');nodeRepl.write(JSON.stringify(await visibility.get()));"),false);
   assert.equal(await run(session,'await visibility.set(true);nodeRepl.write(JSON.stringify(await visibility.get()));'),true);
   await until(async()=>{const windows=await nativeWindows(owned.pid);return windows.length===2&&windows.every(window=>window.visible);},'Restore did not present both native windows');
   assert.equal(await run(session,`var tab=await cua.getTab(${JSON.stringify(id)});await tab.markHandoff();nodeRepl.write(JSON.stringify(await tab.playwright.getByLabel('Value').inputValue()));`),'preserved');
   assert.equal(await run(session,'nodeRepl.write(JSON.stringify(await tab.clipboard.readText()));'),'Clipboard retained across reset');
   await session.endTurn();assert.equal(session.browserRuntime.current,owned);
   assert.equal(await run(session,'nodeRepl.write(JSON.stringify(await visibility.get()));'),true);
   assert.match(await run(session,`await tab.goto(${JSON.stringify(url+'cookie-before-close')});nodeRepl.write(JSON.stringify(await tab.playwright.locator('output').innerText()));`),/window_retained=1/);
   await run(session,'await tab.clipboard.readText();nodeRepl.write(JSON.stringify(true));');
   await closeWindows(owned.socket);
   await until(async()=>(await nativeWindows(owned.pid)).length===0,'Visible windows remained after close');
   assert.equal(owned.proof.browserGone(),false,'Hidden helper did not retain the browser');
   assert.equal(await run(session,'nodeRepl.write(JSON.stringify(await visibility.get()));'),false);
   assert.equal(await run(session,'await visibility.set(false);nodeRepl.write(JSON.stringify(await visibility.get()));'),false);
   assert.equal((await nativeWindows(owned.pid)).length,0,'Hiding an empty browser created a window');
   for(const options of [{visible:false},{}]){
    assert.equal(await run(session,`var background=await cua.createBrowserTab('cdp',${JSON.stringify(url+'empty-background')},${JSON.stringify(options)});nodeRepl.write(JSON.stringify(await visibility.get()));`),false);
    await until(async()=>{const windows=await nativeWindows(owned.pid);return windows.length===1&&windows.every(window=>!window.visible);},'Empty-browser background creation showed a window');
    await closeWindows(owned.socket);await until(async()=>(await nativeWindows(owned.pid)).length===0,'Background window did not close');
   }
   assert.equal(await run(session,'await visibility.set(true);nodeRepl.write(JSON.stringify(await visibility.get()));'),true);
   await until(async()=>(await nativeWindows(owned.pid)).some(window=>window.visible),'Showing an empty browser did not create a native window');
   assert.deepEqual(await run(session,"nodeRepl.write(JSON.stringify((await cua.listTabs({emit:false})).map(tab=>tab.url)));"),['about:blank'],'Showing an empty browser restored closed tabs');
   await closeWindows(owned.socket);await until(async()=>(await nativeWindows(owned.pid)).length===0,'Recreated window did not close');
   const presented=await run(session,`var reopened=await cua.createBrowserTab('cdp',${JSON.stringify(url+'reopened')},{visible:true});await reopened.markHandoff();nodeRepl.write(JSON.stringify(await visibility.get()));`);assert.equal(presented,true);assert.equal(session.browserRuntime.current,owned);
   assert.match(await run(session,"nodeRepl.write(JSON.stringify(await reopened.playwright.locator('output').innerText()));"),/window_retained=1/);
   assert.equal(await run(session,'nodeRepl.write(JSON.stringify(await reopened.clipboard.readText()));'),'Clipboard retained across reset');
   console.log(`${Session.name} PASS owned headful startup, native multi-window presentation/hide, native input/text/HTML/PNG clipboard/paste with GTK interop, reset/turn state, empty-window reopening and retained session cookies`);
  }finally{try{await session.close();}finally{try{if(Session===runtime.WorkerJavaScriptSession&&owned){owned.child.kill('SIGKILL');await owned.closed;}await session.browserRuntime.close();}finally{await stop(clipboardOwner);}}}
  await assert.rejects(access(owned.profile),/ENOENT/);
 }
 const entry=process.argv[2]?path.join(process.argv[2],'scripts/open-computer-use-repl.mjs'):fileURLToPath(new URL('./node-repl/open-computer-use-repl.mjs',import.meta.url));
 const peer=new runtime.JsonLinePeer({command:process.execPath,args:[entry,'--',path.join(scratch,'native-unused'),'mcp'],env:process.env});let mcpBrowser;
 try{
  await peer.initialize();
  const result=await peer.request('tools/call',{name:'js',arguments:{code:`var browser=await cua.getBrowser({id:'cdp'});var visibility=await browser.capabilities.get('visibility');var tab=await cua.createBrowserTab('cdp',${JSON.stringify(url+'mcp')},{visible:true});await tab.playwright.getByLabel('Value').click();await tab.paste(null,'MCP paste');await tab.markHandoff();nodeRepl.write(JSON.stringify({endpoint:process.env.OPEN_COMPUTER_USE_CDP_URL,visible:await visibility.get(),trusted:await tab.playwright.getByLabel('Value').getAttribute('data-trusted')}));`}});
  assert.equal(result.isError,false,result.content.at(-1)?.text);const value=JSON.parse(result.content.at(-1).text);assert.equal(value.visible,true);assert.equal(value.trusted,'true');assert.equal(await nativeText(),'MCP paste');
  const {webSocketDebuggerUrl}=await(await fetch(new URL('/json/version',value.endpoint))).json();
  mcpBrowser=await withConnection(webSocketDebuggerUrl,async send=>{const {arguments:args}=await send('Browser.getBrowserCommandLine'),{processInfo}=await send('SystemInfo.getProcessInfo');return {pid:processInfo.find(info=>info.type==='browser').id,profile:args.find(arg=>arg.startsWith('--user-data-dir=')).slice('--user-data-dir='.length)};});
  await until(async()=>(await nativeWindows(mcpBrowser.pid)).some(window=>window.visible),'MCP presentation did not map a native window');
  const hidden=await peer.request('tools/call',{name:'js',arguments:{code:'await visibility.set(false);nodeRepl.write(JSON.stringify(await visibility.get()));'}});assert.equal(hidden.isError,false);assert.equal(JSON.parse(hidden.content.at(-1).text),false);
  await peer.request('tools/call',{name:'js_reset',arguments:{}});
  const retained=await peer.request('tools/call',{name:'js',arguments:{code:`var browser=await cua.getBrowser({id:'cdp'});var visibility=await browser.capabilities.get('visibility');var tab=await cua.getTab({url:${JSON.stringify(url+'mcp')}});var retainedClipboard=await tab.clipboard.readText();nodeRepl.write(JSON.stringify({visible:await visibility.get(),clipboard:retainedClipboard}));`}});assert.equal(retained.isError,false);assert.deepEqual(JSON.parse(retained.content.at(-1).text),{visible:false,clipboard:'MCP paste'});
  await until(async()=>{const windows=await nativeWindows(mcpBrowser.pid);return windows.length>0&&windows.every(window=>!window.visible);},'Hidden clipboard read unexpectedly presented a native window');
  await closeWindows(webSocketDebuggerUrl);await until(async()=>(await nativeWindows(mcpBrowser.pid)).length===0,'MCP windows remained open');
  const reopened=await peer.request('tools/call',{name:'js',arguments:{code:`var reopened=await cua.createBrowserTab('cdp',${JSON.stringify(url+'mcp-reopened')},{visible:true});await reopened.markHandoff();nodeRepl.write(JSON.stringify({visible:await visibility.get(),cookie:await reopened.playwright.locator('output').innerText(),clipboard:await reopened.clipboard.readText()}));`}});
  assert.equal(reopened.isError,false,reopened.content.at(-1)?.text);const reopenedState=JSON.parse(reopened.content.at(-1).text);assert.equal(reopenedState.visible,true);assert.match(reopenedState.cookie,/window_retained=1/);assert.equal(reopenedState.clipboard,'MCP paste');
  await until(async()=>(await nativeWindows(mcpBrowser.pid)).some(window=>window.visible),'MCP did not reopen a window in the original browser');

 }finally{await peer.close();}
 await until(async()=>{try{process.kill(mcpBrowser.pid,0);return false;}catch(error){if(error.code!=='ESRCH')throw error;}try{await access(mcpBrowser.profile);return false;}catch(error){if(error.code==='ENOENT')return true;throw error;}},'MCP headful browser/profile survived shutdown');
 console.log('PASS headful MCP native paste/clipboard, presentation, hidden reset retention, empty-window reopening and browser/profile shutdown');
 if(!process.argv[2])for(const kill of [false,true]){
  const child=spawn(process.execPath,[fileURLToPath(new URL('./run-managed-browser-smoke.mjs',import.meta.url)),'--host-child',...(kill?['--hold']:[])],{env:{...process.env,OCU_MANAGED_FIXTURE_URL:url},stdio:['ignore','pipe','inherit']});
  const exited=once(child,'exit');exited.catch(()=>{});let output='';child.stdout.on('data',chunk=>{output+=chunk;});
  try{
  let owned;await until(()=>{try{owned=JSON.parse(output.trim());return typeof owned.pid==='number';}catch{return false;}},'Headful child host did not become ready');
  if(kill)child.kill('SIGKILL');await exited;
  await until(async()=>{try{process.kill(owned.pid,0);return false;}catch(error){if(error.code!=='ESRCH')throw error;}try{await access(owned.profile);return false;}catch(error){if(error.code==='ENOENT')return true;throw error;}},'Headful browser/profile survived host exit');
  console.log(`PASS headful host ${kill?'SIGKILL':'natural exit'} reclaims browser and profile`);
  }finally{await stop(child);await exited.catch(()=>{});}
 }
}finally{
 if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 await stop(wm);await stop(display);await rm(scratch,{recursive:true,force:true});
 for(const key of ['DISPLAY','OPEN_COMPUTER_USE_BROWSER_EXECUTABLE','OPEN_COMPUTER_USE_BROWSER_MODE','OPEN_COMPUTER_USE_CDP_URL']){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}
}
