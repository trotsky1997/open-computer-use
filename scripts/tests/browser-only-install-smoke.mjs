// Own temporary source/cache/config/profile only; never changes the caller's Codex home.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {chmodSync,cpSync,existsSync,lstatSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,renameSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {JsonLinePeer} from '../node-repl/open-computer-use-repl.mjs';
const source=fileURLToPath(new URL('../../',import.meta.url)),root=mkdtempSync(path.join(tmpdir(),'ocu-browser-install-'));
const fixture=path.join(root,'source checkout'),target=path.join(root,'codex target'),bin=path.join(root,'bin');
const chrome=process.argv[2];let browser,server;
const pause=()=>new Promise(resolve=>setTimeout(resolve,30));
async function until(fn){const deadline=Date.now()+15000;for(;;){const value=await fn();if(value)return value;assert.ok(Date.now()<deadline,'Owned process did not become ready');await pause();}}
const write=(file,value,options)=>{mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,value,options);};
const originalManifest=JSON.parse(readFileSync(path.join(source,'package.json'),'utf8'));
for(const relative of ['.agents/plugins','plugins/open-computer-use','scripts/node-repl'])cpSync(path.join(source,relative),path.join(fixture,relative),{recursive:true});
for(const relative of ['scripts/install-codex-plugin.sh','scripts/install-config-helper.mjs'])cpSync(path.join(source,relative),path.join(fixture,relative));
write(path.join(fixture,'package.json'),JSON.stringify(originalManifest));symlinkSync(path.join(source,'node_modules'),path.join(fixture,'node_modules'),'dir');
for(const name of ['swift','go','xcrun'])write(path.join(bin,name),'#!/bin/sh\nprintf "%s\\n" "$0" >> "$OCU_FORBIDDEN_BUILD_LOG"\nexit 97\n',{mode:0o700});
for(const name of ['app','linux','windows'])write(path.join(fixture,`scripts/build-open-computer-use-${name}.sh`),'#!/bin/sh\nprintf "%s\\n" "$0" >> "$OCU_FORBIDDEN_BUILD_LOG"\nexit 97\n',{mode:0o700});
const nativeStub=path.join(bin,'open-computer-use');write(nativeStub,'#!/bin/sh\necho "Owned native unavailable fixture" >&2\nexit 97\n',{mode:0o700});
const env={...process.env,PATH:bin+path.delimiter+process.env.PATH,OCU_FORBIDDEN_BUILD_LOG:path.join(root,'forbidden.log'),OPEN_COMPUTER_USE_CONFIG_FILE:path.join(root,'ocu-config.json'),OPEN_COMPUTER_USE_NATIVE_COMMAND:nativeStub,NODE_PATH:''};
write(env.OPEN_COMPUTER_USE_CONFIG_FILE,'{}');
const installer=path.join(fixture,'scripts/install-codex-plugin.sh');
function install(args=[],home=target){return spawnSync('/bin/bash',[installer,...args,'--codex-home',home],{env,encoding:'utf8',timeout:30000});}
function success(result){assert.equal(result.status,0,result.stderr+result.stdout);}
function failure(result){assert.notEqual(result.status,0,'Invalid install unexpectedly succeeded');}
const pluginManifestPath=path.join(fixture,'plugins/open-computer-use/.codex-plugin/plugin.json'),pluginManifest=JSON.parse(readFileSync(pluginManifestPath,'utf8'));
const cache=path.join(target,'plugins/cache/open-computer-use-local/open-computer-use'),installed=path.join(cache,pluginManifest.version),config=path.join(target,'config.toml');
const unchanged='unrelated = "retained"\n\n[mcp_servers.other]\ncommand = "retained"\n';write(config,unchanged);
function nativeAbsent(){for(const name of ['Open Computer Use.app','Open Computer Use (Dev).app','OpenComputerUse.app','open-computer-use','open-computer-use.exe'])assert.equal(existsSync(path.join(installed,name)),false,`Unexpected native payload ${name}`);}
try{
 failure(install(['--browser-only','--rebuild']));assert.equal(existsSync(cache),false);
 failure(install(['--browser-only'],path.join(root,'invalid\nhome')));assert.equal(existsSync(path.join(root,'invalid\nhome')),false);
 success(install(['--browser-only']));nativeAbsent();assert.equal(existsSync(env.OCU_FORBIDDEN_BUILD_LOG),false);
 const expectedConfig=readFileSync(config,'utf8');assert.ok(expectedConfig.includes(unchanged.trim()));assert.ok(expectedConfig.includes('[plugins."open-computer-use@open-computer-use-local"]'));
 for(const name of ['quickjs-emscripten-core','@jitl/quickjs-wasmfile-release-sync','playwright-core'])assert.equal(lstatSync(path.join(installed,'node_modules',name)).isDirectory(),true);
 write(path.join(installed,'preserve.txt'),'previous install');
 write(path.join(fixture,'package.json'),JSON.stringify({...originalManifest,dependencies:{...originalManifest.dependencies,'ocu-missing-install-fixture':'0.0.0'}}));
 failure(install(['--browser-only']));assert.equal(readFileSync(path.join(installed,'preserve.txt'),'utf8'),'previous install');assert.equal(readFileSync(config,'utf8'),expectedConfig);
 write(path.join(fixture,'package.json'),JSON.stringify(originalManifest));
 if(process.getuid?.()!==0){
  const helper=path.join(fixture,'scripts/install-config-helper.mjs'),original=readFileSync(helper,'utf8');
  write(helper,original+`
if(process.argv[2]==='codex-plugin-config') { (await import('node:fs')).chmodSync((await import('node:path')).dirname(process.argv[3]),0o500); }
`);
  let denied;
  try{denied=install(['--browser-only']);}finally{chmodSync(target,0o700);write(helper,original);}
  failure(denied);assert.match(denied.stderr,/EACCES|EPERM/);assert.match(denied.stderr,/rename/);assert.equal(readFileSync(path.join(installed,'preserve.txt'),'utf8'),'previous install');assert.equal(readFileSync(config,'utf8'),expectedConfig);
  for(const file of readdirSync(target).filter(name=>name.startsWith('config.toml.staging.')))rmSync(path.join(target,file));
  assert.deepEqual(readdirSync(cache),[pluginManifest.version]);
 }
 write(pluginManifestPath,JSON.stringify({...pluginManifest,version:'../escaped'}));failure(install(['--browser-only']));assert.equal(readFileSync(path.join(installed,'preserve.txt'),'utf8'),'previous install');write(pluginManifestPath,JSON.stringify(pluginManifest));
 success(install(['--browser-only']));assert.equal(readFileSync(config,'utf8'),expectedConfig);assert.equal(existsSync(path.join(installed,'preserve.txt')),false);assert.deepEqual(readdirSync(cache),[pluginManifest.version]);
 const badHome=path.join(root,'invalid config target');mkdirSync(path.join(badHome,'config.toml'),{recursive:true});write(path.join(badHome,'config.toml/keep'),'retained');
 failure(install(['--browser-only'],badHome));assert.equal(readFileSync(path.join(badHome,'config.toml/keep'),'utf8'),'retained');assert.deepEqual(readdirSync(path.join(badHome,'plugins/cache/open-computer-use-local/open-computer-use')),[]);
 // Existing config symlinks keep their target and identity through staged publication.
 const linkedHome=path.join(root,'linked target'),linkedConfig=path.join(root,'linked config.toml');mkdirSync(linkedHome);write(linkedConfig,unchanged);symlinkSync(linkedConfig,path.join(linkedHome,'config.toml'));
 success(install(['--browser-only'],linkedHome));assert.equal(lstatSync(path.join(linkedHome,'config.toml')).isSymbolicLink(),true);assert.ok(readFileSync(linkedConfig,'utf8').includes(unchanged.trim()));
 // Normal mode still copies an existing native artifact; browser-only reinstall removes it.
 const nativeRelative=process.platform==='darwin'?'dist/Open Computer Use (Dev).app/Contents/MacOS/OpenComputerUse':`dist/linux/${process.arch==='x64'?'amd64':process.arch}/open-computer-use`;
 write(path.join(fixture,nativeRelative),'#!/bin/sh\nexit 97\n',{mode:0o700});success(install());
 const installedNative=process.platform==='darwin'?'Open Computer Use (Dev).app/Contents/MacOS/OpenComputerUse':'open-computer-use';assert.equal(existsSync(path.join(installed,installedNative)),true);
 success(install(['--browser-only']));nativeAbsent();assert.equal(readFileSync(config,'utf8'),expectedConfig);assert.equal(existsSync(env.OCU_FORBIDDEN_BUILD_LOG),false);
 console.log('PASS browser-only install without native builds, copied runtime dependencies, preserved unrelated config, failed-preparation retention, safe cache names, idempotence, config symlinks and native/browser mode replacement');
 // Execute the installed payload after its source checkout has disappeared.
 renameSync(fixture,fixture+' hidden');
 const mcp=JSON.parse(readFileSync(path.join(installed,'.mcp.json'),'utf8')).mcpServers['open-computer-use'];
 const peer=new JsonLinePeer({command:path.resolve(installed,mcp.command),cwd:installed,env});
 try{
  await peer.initialize();assert.deepEqual((await peer.request('tools/list',{})).tools.map(t=>t.name),['js','js_reset']);
  const result=await peer.request('tools/call',{name:'js',arguments:{code:'nodeRepl.write(6*7);'}});assert.equal(result.isError,false,JSON.stringify(result.content));assert.ok(result.content.some(item=>item.text==='42'));
 }finally{await peer.close();}
 console.log('PASS installed standalone MCP initializes and evaluates JavaScript without the source checkout or a native binary');
 if(chrome){
  const profile=path.join(root,'chrome profile');mkdirSync(profile);
  browser=spawn(chrome,['--headless=new','--enable-automation','--enable-features=WebMCP,CDPScreenshotNewSurface','--no-sandbox','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync',...(process.platform==='darwin'?['--use-mock-keychain']:[]),'--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
  let browserErrors='';browser.stderr.on('data',chunk=>{browserErrors=(browserErrors+chunk).slice(-4000);});
  let launchError;browser.once('error',error=>{launchError=error;});
  const port=await until(()=>{if(launchError)throw launchError;if(browser.exitCode!==null||browser.signalCode!==null)throw Error(`Chrome exited ${browser.exitCode??browser.signalCode}: ${browserErrors}`);try{return readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];}catch{return null;}});
  server=createServer((_request,response)=>{response.setHeader('Content-Type','text/html');response.end("<html><body style=\"margin:0;height:2000px\"><label>Name<input></label><div style=\"position:absolute;left:20px;top:70px;width:300px;height:100px;background:lightblue\" onclick=\"document.getElementById('clicked').textContent='Clicked'\" onmousedown=\"window.dragging=true\">Pointer surface</div><p data-testid=\"width\"></p><p data-testid=\"clicked\" id=\"clicked\">Waiting</p><p data-testid=\"drag\">Waiting</p><script>Element.prototype.getBoundingClientRect=()=>{throw Error('Patched page geometry')};Document.prototype.elementFromPoint=()=>{throw Error('Patched page hit test')};document.querySelector('[data-testid=width]').textContent=visualViewport.width;onmousemove=e=>{if(window.dragging&&e.buttons===1)document.querySelector('[data-testid=drag]').textContent=\"Dragged \"+e.clientX};onmouseup=()=>{window.dragging=false};</script></body></html>");});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const endpoint=`http://127.0.0.1:${port}`,url=`http://127.0.0.1:${server.address().port}/`;
  env.OPEN_COMPUTER_USE_CDP_URL=endpoint;
  process.env.OPEN_COMPUTER_USE_CDP_URL=endpoint;process.env.OPEN_COMPUTER_USE_CONFIG_FILE=env.OPEN_COMPUTER_USE_CONFIG_FILE;
  const code=`var inventory=await cua.getState({emit:false});if(!inventory.errors?.some(e=>e.startsWith('apps:'))||inventory.browsers.length!==1)throw Error('Native failure did not stay isolated');var tab=await cua.createBrowserTab('cdp',${JSON.stringify(url)},{visible:false});try{var ax=await tab.getAXState({emit:false});var index=ax.split('\\n').find(line=>line.includes(' textbox \"Name\"')).trimStart().match(/^\\[([^\\]]+)\\]/)[1];await tab.click(index);await tab.typeText(null,'AX prepared');if(await tab.playwright.getByLabel('Name').inputValue()!=='AX prepared')throw Error('Installed AX click failed');await tab.playwright.getByLabel('Name').fill('Installed browser verified');if(await tab.playwright.getByLabel('Name').evaluate(node=>node.value)!=='Installed browser verified')throw Error('Installed QuickJS DOM evaluation failed');await tab.pressKey(null,${JSON.stringify(process.platform==='darwin'?'meta+a':'ctrl+a')});var ax=await tab.getAXState({emit:false});var index=ax.split('\\n').find(line=>line.includes(' textbox \"Name\"')).trimStart().match(/^\\[([^\\]]+)\\]/)[1];await tab.paste(index,'Installed paste verified');if(await tab.playwright.getByLabel('Name').inputValue()!=='Installed paste verified')throw Error('Installed managed paste failed');await tab.playwright.getByLabel('Name').fill('Installed browser verified');var image=await tab.getScreenshot({emit:false});var scale=image.readUInt32BE(16)/Number(await tab.playwright.getByTestId('width').innerText());await tab.click([50*scale,110*scale]);if(await tab.playwright.getByTestId('clicked').innerText()!=='Clicked')throw Error('Installed default click failed');await tab.getScreenshot({emit:false});await tab.drag([50*scale,110*scale],[200*scale,110*scale]);if(await tab.playwright.getByTestId('drag').innerText()!=='Dragged 200')throw Error('Installed managed drag failed');await tab.getScreenshot({emit:false});nodeRepl.write(await tab.playwright.getByLabel('Name').inputValue());}finally{await tab.close();}`;
  const module=await import(pathToFileURL(path.join(installed,'scripts/open-computer-use-repl.mjs')).href);
  for(const Session of [module.PersistentJavaScriptSession,module.WorkerJavaScriptSession]){
   const native=new module.LazyNativePeer({command:nativeStub,args:['mcp'],env}),session=new Session({native});
   try{const result=await session.run(code,30000);assert.equal(result.isError,false,JSON.stringify(result.content));assert.ok(result.content.some(item=>item.text==='Installed browser verified'));console.log(`${Session.name} PASS installed browser inventory, field input, AX/default click, managed paste/drag/capture and QuickJS DOM evaluation`);}finally{await session.close();await native.close();}
  }
  const peer=new JsonLinePeer({command:path.resolve(installed,mcp.command),cwd:installed,env});
  try{await peer.initialize();const result=await peer.request('tools/call',{name:'js',arguments:{code}});assert.equal(result.isError,false,JSON.stringify(result.content));assert.ok(result.content.some(item=>item.text==='Installed browser verified'));console.log('PASS installed plugin launcher MCP real browser flow after source checkout removal');}finally{await peer.close();}
  const discovery=spawn(process.execPath,[path.join(source,'scripts/run-webmcp-browser-discovery-smoke.mjs'),installed],{env,stdio:['ignore','pipe','pipe']});
  let discoveryOutput='';discovery.stdout.on('data',chunk=>{discoveryOutput+=chunk;});discovery.stderr.on('data',chunk=>{discoveryOutput+=chunk;});
  await new Promise((resolve,reject)=>{discovery.once('error',reject);discovery.once('exit',code=>code===0?resolve():reject(Error(discoveryOutput)));});
  process.stdout.write(discoveryOutput);console.log('PASS installed browser-wide WebMCP discovery after source checkout removal');
  const claims=spawn(process.execPath,[path.join(source,'scripts/run-browser-user-claims-smoke.mjs'),installed],{env:{...env,OCU_TEST_CHROME_EXECUTABLE:path.resolve(chrome)},stdio:['ignore','pipe','pipe']});let claimOutput='';
  claims.stdout.on('data',chunk=>{claimOutput+=chunk;});claims.stderr.on('data',chunk=>{claimOutput+=chunk;});
  await new Promise((resolve,reject)=>{claims.once('error',reject);claims.once('exit',code=>code===0?resolve():reject(Error(claimOutput)));});
  for(const line of claimOutput.split('\n').filter(line=>line.includes('PASS')))console.log(line);
  console.log('PASS installed native user-tab metadata and host-local claims after source checkout removal');
  const hosts=spawn(process.execPath,[path.join(source,'scripts/run-browser-cross-host-claims-smoke.mjs'),installed],{env:{...env,OCU_TEST_CHROME_EXECUTABLE:path.resolve(chrome)},stdio:['ignore','pipe','pipe']});let hostOutput='';
  hosts.stdout.on('data',chunk=>{hostOutput+=chunk;});hosts.stderr.on('data',chunk=>{hostOutput+=chunk;});
  await new Promise((resolve,reject)=>{hosts.once('error',reject);hosts.once('exit',code=>code===0?resolve():reject(Error(hostOutput)));});
  for(const line of hostOutput.split('\n').filter(line=>line.includes('PASS')))console.log(line);
  console.log('PASS installed independent-host tab coordination after source checkout removal');
  const budgets=spawn(process.execPath,[path.join(source,'scripts/run-dialog-budget-smoke.mjs'),installed],{env:{...env,OCU_TEST_CHROME_EXECUTABLE:path.resolve(chrome)},stdio:['ignore','pipe','pipe']});let budgetOutput='';
  budgets.stdout.on('data',chunk=>{budgetOutput+=chunk;});budgets.stderr.on('data',chunk=>{budgetOutput+=chunk;});
  await new Promise((resolve,reject)=>{budgets.once('error',reject);budgets.once('exit',code=>code===0?resolve():reject(Error(budgetOutput)));});
  for(const line of budgetOutput.split('\n').filter(line=>line.includes('PASS')))console.log(line);
  console.log('PASS installed dialog-aware locator deadlines after source checkout removal');
  const dialogs=spawn(process.execPath,[path.join(source,'scripts/run-cross-host-dialog-smoke.mjs'),installed],{env:{...env,OCU_TEST_CHROME_EXECUTABLE:path.resolve(chrome)},stdio:['ignore','pipe','pipe']});let dialogOutput='';
  dialogs.stdout.on('data',chunk=>{dialogOutput+=chunk;});dialogs.stderr.on('data',chunk=>{dialogOutput+=chunk;});
  await new Promise((resolve,reject)=>{dialogs.once('error',reject);dialogs.once('exit',code=>code===0?resolve():reject(Error(dialogOutput)));});
  for(const line of dialogOutput.split('\n').filter(line=>line.includes('PASS')))console.log(line);
  console.log('PASS installed independent-host dialog inventory after source checkout removal');
  const drops=spawn(process.execPath,[path.join(source,'scripts/run-drop-budget-smoke.mjs'),installed],{env:{...env,OCU_TEST_CHROME_EXECUTABLE:path.resolve(chrome)},stdio:['ignore','pipe','pipe']});let dropOutput='';
  drops.stdout.on('data',chunk=>{dropOutput+=chunk;});drops.stderr.on('data',chunk=>{dropOutput+=chunk;});
  await new Promise((resolve,reject)=>{drops.once('error',reject);drops.once('exit',code=>code===0?resolve():reject(Error(dropOutput)));});
  for(const line of dropOutput.split('\n').filter(line=>line.includes('PASS')))console.log(line);
  console.log('PASS installed native drop active-time deadlines after source checkout removal');
  const navigation=spawn(process.execPath,[path.join(source,'scripts/run-navigation-budget-smoke.mjs'),installed],{env:{...env,OCU_TEST_CHROME_EXECUTABLE:path.resolve(chrome)},stdio:['ignore','pipe','pipe']});let navigationOutput='';
  navigation.stdout.on('data',chunk=>{navigationOutput+=chunk;});navigation.stderr.on('data',chunk=>{navigationOutput+=chunk;});
  await new Promise((resolve,reject)=>{navigation.once('error',reject);navigation.once('exit',code=>code===0?resolve():reject(Error(navigationOutput)));});
  for(const line of navigationOutput.split('\n').filter(line=>line.includes('PASS')))console.log(line);
  console.log('PASS installed host-owned raw navigation deadlines after source checkout removal');
  const waits=spawn(process.execPath,[path.join(source,'scripts/run-navigation-wait-smoke.mjs'),installed],{env:{...env,OCU_TEST_CHROME_EXECUTABLE:path.resolve(chrome)},stdio:['ignore','pipe','pipe']});let waitOutput='';
  waits.stdout.on('data',chunk=>{waitOutput+=chunk;});waits.stderr.on('data',chunk=>{waitOutput+=chunk;});
  await new Promise((resolve,reject)=>{waits.once('error',reject);waits.once('exit',code=>code===0?resolve():reject(Error(waitOutput)));});
  for(const line of waitOutput.split('\n').filter(line=>line.includes('PASS')))console.log(line);
  console.log('PASS installed dialog-aware navigation waits after source checkout removal');
  const ax=spawn(process.execPath,[path.join(source,'scripts/run-browser-ax-state-smoke.mjs'),installed],{env:{...env,OCU_TEST_CHROME_EXECUTABLE:path.resolve(chrome)},stdio:['ignore','pipe','pipe']});let axOutput='';
  ax.stdout.on('data',chunk=>{axOutput+=chunk;});ax.stderr.on('data',chunk=>{axOutput+=chunk;});
  await new Promise((resolve,reject)=>{ax.once('error',reject);ax.once('exit',code=>code===0?resolve():reject(Error(axOutput)));});
  for(const line of axOutput.split('\n').filter(line=>line.includes('PASS')))console.log(line);
  console.log('PASS installed browser AX semantics and diffs after source checkout removal');








  if(process.platform==='linux'&&process.argv.includes('--headful')){
   const visibility=spawn(process.execPath,[path.join(source,'scripts/run-managed-browser-visibility-smoke.mjs'),installed],{env:{...env,OCU_TEST_CHROME_EXECUTABLE:path.resolve(chrome)},stdio:['ignore','pipe','pipe']});let output='';
   visibility.stdout.on('data',chunk=>{output+=chunk;});visibility.stderr.on('data',chunk=>{output+=chunk;});
   await new Promise((resolve,reject)=>{visibility.once('error',reject);visibility.once('exit',code=>code===0?resolve():reject(Error(output)));});
   for(const line of output.split('\n').filter(line=>line.includes('PASS')))console.log(line);
   console.log('PASS installed headful native visibility and private profile recovery after source checkout removal');
  }

  // The installed host owns the lazy browser even after its source checkout disappears.
  delete env.OPEN_COMPUTER_USE_CDP_URL;delete process.env.OPEN_COMPUTER_USE_CDP_URL;
  let executable=path.resolve(chrome);
  if(process.platform==='linux'){
   executable=path.join(root,'managed-chrome');
   write(executable,'#!/bin/sh\nexec '+"'"+path.resolve(chrome).replaceAll("'","'\\''")+"'"+' --no-sandbox "$@"\n',{mode:0o700});
  }
  env.OPEN_COMPUTER_USE_BROWSER_EXECUTABLE=executable;process.env.OPEN_COMPUTER_USE_BROWSER_EXECUTABLE=executable;env.OPEN_COMPUTER_USE_BROWSER_MODE='headless';process.env.OPEN_COMPUTER_USE_BROWSER_MODE='headless';
  for(const Session of [module.PersistentJavaScriptSession,module.WorkerJavaScriptSession]){
   const native=new module.LazyNativePeer({command:nativeStub,args:['mcp'],env}),session=new Session({native});let owned;
   try{
    const result=await session.run(code,30000);assert.equal(result.isError,false,JSON.stringify(result.content));
    owned=session.browserRuntime.current;assert.ok(owned?.proof);assert.ok(existsSync(owned.profile));
   }finally{await session.close();await session.browserRuntime.close();await native.close();}
   assert.equal(existsSync(owned.profile),false);
   console.log(`${Session.name} PASS installed lazy browser launch, input/clipboard/capture and private profile cleanup`);
  }
  const managedPeer=new JsonLinePeer({command:path.resolve(installed,mcp.command),cwd:installed,env});
  try{await managedPeer.initialize();const result=await managedPeer.request('tools/call',{name:'js',arguments:{code}});assert.equal(result.isError,false,JSON.stringify(result.content));console.log('PASS installed plugin MCP lazy browser flow after source checkout removal');}finally{await managedPeer.close();}
 }else console.log('SKIP live browser flow: pass an owned Chromium/Chrome executable path to include it');
}finally{
 if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 if(browser?.pid&&browser.exitCode===null&&browser.signalCode===null){const exited=new Promise(resolve=>browser.once('exit',resolve));browser.kill('SIGTERM');const timer=setTimeout(()=>browser.kill('SIGKILL'),3000);await exited;clearTimeout(timer);}
 rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
