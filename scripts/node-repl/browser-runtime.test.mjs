import test from 'node:test';
import assert from 'node:assert/strict';
import {BrowserRuntime} from './browser-runtime.mjs';
test('managed startup is opt-in and external CDP configuration takes precedence',async()=>{
 const empty=new BrowserRuntime({});assert.deepEqual(await empty.ensure(),{endpoint:null,managed:false});assert.equal(empty.current,undefined);
 const environment={OPEN_COMPUTER_USE_CDP_URL:'http://127.0.0.1:9222',OPEN_COMPUTER_USE_BROWSER_EXECUTABLE:'/invalid/unused'};
 const manual=new BrowserRuntime(environment);assert.deepEqual(await manual.ensure(),{endpoint:environment.OPEN_COMPUTER_USE_CDP_URL,managed:false});await manual.close();assert.equal(manual.current,undefined);assert.equal(environment.OPEN_COMPUTER_USE_CDP_URL,'http://127.0.0.1:9222');
});
test('managed executable validation precedes process creation',{skip:!['darwin','linux'].includes(process.platform)},async()=>{
 for(const executable of ['relative/chrome','/nonexistent/ocu-browser-test']){
  const environment={OPEN_COMPUTER_USE_BROWSER_EXECUTABLE:executable},runtime=new BrowserRuntime(environment);
  await assert.rejects(runtime.ensure(),/absolute|ENOENT/);assert.equal(runtime.current,undefined);assert.equal(environment.OPEN_COMPUTER_USE_CDP_URL,undefined);
 }
});
test('host shutdown cancels asynchronous executable preflight before any guardian is created',{skip:!['darwin','linux'].includes(process.platform)},async()=>{
 const runtime=new BrowserRuntime({OPEN_COMPUTER_USE_BROWSER_EXECUTABLE:process.execPath});
 const starting=runtime.ensure();starting.catch(()=>{});await runtime.close();
 await assert.rejects(starting,/startup canceled/);assert.equal(runtime.current,undefined);
});
