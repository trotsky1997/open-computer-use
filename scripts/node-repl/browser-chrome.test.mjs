import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {BrowserChrome,CHROME_EXTENSION_ID} from './browser-chrome.mjs';
import {BrowserTabs} from './browser-tabs.mjs';
import {BrowserViewport} from './browser-viewport.mjs';

test('bundled browser extension identity and required assets match the host',async()=>{
 const manifest=JSON.parse(await readFile(new URL('./chrome-browser-extension/manifest.json',import.meta.url),'utf8'));
 const id=createHash('sha256').update(Buffer.from(manifest.key,'base64')).digest('hex').slice(0,32).replace(/[0-9a-f]/g,char=>String.fromCharCode(97+parseInt(char,16)));
 assert.deepEqual(manifest.optional_permissions,['history']);assert.equal(manifest.options_ui.page,'options.html');
 assert.equal(id,CHROME_EXTENSION_ID);assert.equal(manifest.manifest_version,3);assert.deepEqual(manifest.permissions,['tabs','debugger','tabGroups','bookmarks','storage']);
 assert.match(await readFile(new URL('./chrome-browser-extension/bridge.html',import.meta.url),'utf8'),/src="bridge.js"/u);
 assert.match(await readFile(new URL('./chrome-browser-extension/background.mjs',import.meta.url),'utf8'),/chrome\.debugger\.getTargets/u);
});
test('logical browser names validate before IO, survive turns and clear at final close',async()=>{
 const tabs=new BrowserTabs(()=> 'http://name.test/',()=>{throw Error('Unexpected IO');}),owner={},other={};
 for(const name of ['',null,'x\nnext','x'.repeat(101)])assert.throws(()=>tabs.request(owner,{action:'name',name}),/Session name/u);
 await tabs.request(owner,{action:'name',name:'🔎 my session'});await tabs.end(owner);tabs.begin(owner);
 assert.equal((await tabs.request(owner,{action:'session'})).name,'🔎 my session');assert.equal((await tabs.request(other,{action:'session'})).name,undefined);
 await tabs.end(owner,{final:true});tabs.begin(owner);assert.equal((await tabs.request(owner,{action:'session'})).name,undefined);
});
test('selection cancellation joins pending calls and retains failed bootstrap cleanup for retry',async()=>{
 const selection=new BrowserChrome(()=> 'http://selection.test/'),owner={};let failed=true;
 selection.initialize=async entry=>{entry.connection={close(){}};};selection.invoke=()=>new Promise(()=>{});
 selection.tabs.end=async()=>{if(failed)throw Error('Close outage');};
 const waiting=selection.request(owner,{action:'selected'});waiting.catch(()=>{});await Promise.resolve();await Promise.resolve();
 await assert.rejects(selection.cleanup(owner),/Close outage/u);await assert.rejects(waiting,/turn ended/u);assert.equal(selection.owners.size,1);
 failed=false;await selection.cleanup(owner);assert.equal(selection.owners.size,0);assert.throws(()=>selection.request(owner,{action:'selected'}),/turn ended/u);
});
test('viewport excludes a pending private control URL before its target acknowledgement',async()=>{
 const marker='about:blank#ocu-private';let opened=false;
 const viewport=new BrowserViewport(()=> 'http://selection.test/',async()=>{opened=true;throw Error('Unexpected emulation');},undefined,()=>[marker]);
 viewport.json=async()=>[{id:'pending-target',type:'page',url:marker}];
 await viewport.apply({endpoint:'http://selection.test/'},'pending-target');assert.equal(opened,false);
});
