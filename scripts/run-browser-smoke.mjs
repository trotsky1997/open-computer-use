import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createBrowserApi } from './node-repl/browser-cdp.mjs';
import { WorkerJavaScriptSession } from './node-repl/open-computer-use-repl.mjs';
if (!process.env.OPEN_COMPUTER_USE_CDP_URL) throw new Error('Set OPEN_COMPUTER_USE_CDP_URL to a disposable browser debugging origin');
const server = createServer((req, res) => {res.setHeader('Content-Type', 'text/html'); res.end(`<html><title>OCU ${req.url}</title><body><h1>Browser harness ${req.url}</h1><button>Test button</button></body></html>`);});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const api = createBrowserApi(() => ({write() {}, async emitImage() {}}));
let tab;
try {
  assert.equal((await api.listBrowsers({emit:false}))[0].type, 'cdp');
  await api.getBrowser({id:'cdp'});
  const url = `http://127.0.0.1:${server.address().port}/first`;
  tab = await api.createBrowserTab('cdp', url, {visible:false});
  assert.match(await tab.getAXState({emit:false}), /Browser harness \/first/);
  assert.equal((await api.getTab({url})).id, tab.id);
  const png = await tab.getScreenshot({emit:false});
  assert.equal(png.subarray(1,4).toString(), 'PNG');
  await tab.goto(url.replace('/first','/second'));
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
  } finally {await session.close();}
  await tab.close();
  await assert.rejects(tab.getAXState(), /no longer available/);
  console.log('PASS browser inventory, create/bind, AX, PNG, navigation/history/reload, close, worker inventory failure isolation');
} finally {
  if (tab && (await api.listTabs({emit:false})).some(item=>item.id===tab.id)) await tab.close();
  await new Promise(resolve => server.close(resolve));
}
