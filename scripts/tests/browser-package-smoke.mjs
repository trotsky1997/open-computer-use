// Build, pack and install only in owned temporary directories; no registry publication.
import assert from 'node:assert/strict';
import {spawn,spawnSync,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {copyFileSync,cpSync,existsSync,mkdirSync,mkdtempSync,readFileSync,realpathSync,renameSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {JsonLinePeer} from '../node-repl/open-computer-use-repl.mjs';
const source=fileURLToPath(new URL('../../',import.meta.url)),root=mkdtempSync(path.join(tmpdir(),'ocu-browser-package-'));
const fixture=path.join(root,'source checkout'),staged=path.join(root,'staged'),packs=path.join(root,'packs'),prefix=path.join(root,'installed'),bin=path.join(root,'bin');
const chrome=process.argv[2],artifactOutput=process.argv[3];let browser;
const write=(file,value,options)=>{mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,value,options);};
const env={...process.env,PATH:bin+path.delimiter+process.env.PATH,NODE_PATH:'',OPEN_COMPUTER_USE_CONFIG_FILE:path.join(root,'config.json'),OCU_FORBIDDEN_BUILD_LOG:path.join(root,'forbidden.log')};write(env.OPEN_COMPUTER_USE_CONFIG_FILE,'{}');
function run(command,args,options={}){const result=spawnSync(command,args,{env,encoding:'utf8',timeout:120000,...options});assert.equal(result.status,0,(result.stderr??'')+(result.stdout??'')+(result.error?.message??''));return result;}
const pause=()=>new Promise(resolve=>setTimeout(resolve,30));
async function until(fn){const deadline=Date.now()+15000;for(;;){const value=await fn();if(value)return value;assert.ok(Date.now()<deadline,'Owned browser did not become ready');await pause();}}
async function mcp(launcher,command){const peer=new JsonLinePeer({command:process.execPath,args:[launcher,command],env});try{await peer.initialize();assert.deepEqual((await peer.request('tools/list',{})).tools.map(tool=>tool.name),['js','js_reset']);let result=await peer.request('tools/call',{name:'js',arguments:{code:'var answer=41;nodeRepl.write(++answer);'}});assert.equal(result.isError,false,JSON.stringify(result.content));assert.ok(result.content.some(item=>item.text==='42'));await peer.request('tools/call',{name:'js_reset',arguments:{}});result=await peer.request('tools/call',{name:'js',arguments:{code:'nodeRepl.write(typeof answer);'}});assert.ok(result.content.some(item=>item.text==='undefined'));}finally{await peer.close();}}
try{
 for(const relative of ['scripts','skills','plugins','.agents','LICENSE','THIRD_PARTY_NOTICES.md','package.json'])cpSync(path.join(source,relative),path.join(fixture,relative),{recursive:true});
 symlinkSync(path.join(source,'node_modules'),path.join(fixture,'node_modules'),'dir');
 const blocked='#!/bin/sh\nprintf "%s\\n" "$0" >> "$OCU_FORBIDDEN_BUILD_LOG"\nexit 97\n';
 for(const name of ['go','swift','xcrun','codesign','open-computer-use'])write(path.join(bin,name),blocked,{mode:0o700});
 for(const name of ['build-open-computer-use-app.sh','build-open-computer-use-linux.sh','build-open-computer-use-windows.sh','verify-locked-use-bundle.sh'])write(path.join(fixture,'scripts',name),blocked,{mode:0o700});
 const builder=path.join(fixture,'scripts/npm/build-packages.mjs');
 run(process.execPath,[builder,'--browser-only','--package','open-computer-use','--out-dir',staged]);assert.equal(existsSync(env.OCU_FORBIDDEN_BUILD_LOG),false);
 const defaultOutput=run(process.execPath,[builder,'--browser-only','--package','open-computer-use']).stdout.trim();assert.equal(realpathSync(defaultOutput),realpathSync(path.join(fixture,'dist/npm-browser')));assert.equal(JSON.parse(readFileSync(path.join(defaultOutput,'open-computer-use/package.json'),'utf8')).openComputerUseRuntime,'browser-only');
 mkdirSync(packs);const packed=JSON.parse(run('npm',['pack','--json','--pack-destination',packs],{cwd:path.join(staged,'open-computer-use')}).stdout)[0];
 assert.ok(packed.files.length>20);assert.ok(packed.files.every(file=>!file.path.startsWith('dist/')&&!file.path.startsWith('scripts/build-')),'Native payload/build script included');
 const tarball=path.join(packs,packed.filename);
 run('npm',['install','--prefix',prefix,'--cache',path.join(root,'npm cache'),'--no-audit','--no-fund',tarball]);
 const installed=path.join(prefix,'node_modules/open-computer-use'),launcher=path.join(installed,'bin/open-computer-use'),manifest=JSON.parse(readFileSync(path.join(installed,'package.json'),'utf8'));
 assert.equal(manifest.openComputerUseRuntime,'browser-only');assert.equal(existsSync(path.join(installed,'dist')),false);
 for(const alias of Object.keys(manifest.bin)){const shim=path.join(prefix,'node_modules/.bin',alias);assert.equal(existsSync(shim),true);assert.equal(run(process.execPath,[shim,'--version']).stdout.trim(),manifest.version);}
 const report=JSON.parse(run(process.execPath,[launcher,'capabilities','--json']).stdout);assert.equal(report.capabilities.nativeMcp.available,false);assert.equal(report.capabilities.js.available,true);assert.equal(report.capabilities.jsMcp.available,true);
 assert.equal(JSON.parse(run(process.execPath,[launcher,'js','--json','nodeRepl.write(6*7);']).stdout).isError,false);
 const repl=run(process.execPath,[launcher,'repl'],{input:'var n=41;nodeRepl.write(++n);\n.reset\nnodeRepl.write(typeof n);\n.exit\n'}).stdout;assert.match(repl,/42\n/);assert.match(repl,/undefined\n/);
 const rejected=spawnSync(process.execPath,[launcher,'doctor'],{env,encoding:'utf8'});assert.equal(rejected.status,1);assert.match(rejected.stderr,/No native runtime is bundled/);
 await mcp(launcher,'mcp');await mcp(launcher,'js-mcp');
 const globalPrefix=path.join(root,'global prefix');run('npm',['install','--global','--prefix',globalPrefix,'--cache',path.join(root,'npm cache'),'--no-audit','--no-fund',tarball]);
 const globalRoot=run('npm',['root','--global','--prefix',globalPrefix]).stdout.trim(),globalPackage=path.join(globalRoot,'open-computer-use'),globalLauncher=path.join(globalPackage,'bin/open-computer-use');
 assert.equal(run(process.execPath,[globalLauncher,'--version']).stdout.trim(),manifest.version);await mcp(globalLauncher,'mcp');

 const target=path.join(root,'plugin home');run(process.execPath,[launcher,'install-codex-plugin','--codex-home',target]);
 const plugin=path.join(target,'plugins/cache/open-computer-use-local/open-computer-use',manifest.version);
 assert.ok(readFileSync(path.join(target,'config.toml'),'utf8').includes('enabled = true'));assert.equal(existsSync(path.join(plugin,'open-computer-use')),false);assert.equal(existsSync(path.join(plugin,'Open Computer Use.app')),false);
 run(process.execPath,[globalLauncher,'install-codex-plugin','--codex-home',path.join(root,'global plugin home')]);
 const peer=new JsonLinePeer({command:path.join(plugin,'scripts/launch-open-computer-use-repl.sh'),cwd:plugin,env});try{await peer.initialize();const result=await peer.request('tools/call',{name:'js',arguments:{code:'nodeRepl.write(42);'}});assert.equal(result.isError,false);assert.ok(result.content.some(item=>item.text==='42'));}finally{await peer.close();}
 // Existing full-package builds still expose explicit JS MCP without touching native input.
 for(const relative of ['Open Computer Use.app/Contents/MacOS/OpenComputerUse','linux/arm64/open-computer-use','linux/amd64/open-computer-use','windows/arm64/open-computer-use.exe','windows/amd64/open-computer-use.exe'])write(path.join(fixture,'dist',relative),'fixture',{mode:0o755});
 const full=path.join(root,'full');run(process.execPath,[builder,'--configuration','debug','--skip-build','--package','open-computer-use','--out-dir',full]);
 run(process.execPath,['--check',path.join(full,'open-computer-use/scripts/postinstall.mjs')]);await mcp(path.join(full,'open-computer-use/bin/open-computer-use'),'js-mcp');
 assert.equal(existsSync(env.OCU_FORBIDDEN_BUILD_LOG),false);
 renameSync(fixture,fixture+' hidden');renameSync(staged,staged+' hidden');
 console.log('PASS native-free build/pack/tarball install, no native artifacts/toolchains, metadata, version/capabilities, CLI/REPL/reset, default/explicit JS MCP, npm plugin installation and full-package JS MCP');
 if(chrome){
  const profile=path.join(root,'chrome profile');mkdirSync(profile);let errors='',launchError;
  browser=spawn(chrome,['--headless=new','--no-sandbox','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
  browser.stderr.on('data',chunk=>{errors=(errors+chunk).slice(-4000);});browser.once('error',error=>{launchError=error;});
  const port=await until(()=>{if(launchError)throw launchError;if(browser.exitCode!==null||browser.signalCode!==null)throw Error(`Chrome exited: ${errors}`);try{return readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];}catch{return null;}});
  for(const packageRoot of [installed,globalPackage]){const result=await promisify(execFile)(process.execPath,[path.join(source,'scripts/run-browser-only-smoke.mjs'),packageRoot],{env:{...env,OPEN_COMPUTER_USE_CDP_URL:`http://127.0.0.1:${port}`},maxBuffer:8*1024*1024,timeout:60000});assert.equal(result.stderr,'');process.stdout.write(result.stdout);}
 }else console.log('SKIP live browser: pass a Chromium executable to include it');
 if(artifactOutput){mkdirSync(path.dirname(path.resolve(artifactOutput)),{recursive:true});copyFileSync(tarball,artifactOutput);console.log(`Verified tarball copied to ${path.resolve(artifactOutput)}`);}
}finally{
 if(browser?.pid&&browser.exitCode===null&&browser.signalCode===null){const exited=new Promise(resolve=>browser.once('exit',resolve));browser.kill('SIGTERM');const timer=setTimeout(()=>browser.kill('SIGKILL'),3000);await exited;clearTimeout(timer);}
 rmSync(root,{recursive:true,force:true});
}
