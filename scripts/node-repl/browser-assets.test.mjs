import test from 'node:test';
import assert from 'node:assert/strict';
import {BrowserAssets,cssUrls} from './browser-assets.mjs';

test('computed CSS resource URLs preserve quoting, escapes and multiple layers',()=>{
 assert.deepEqual(cssUrls(String.raw`url("a) b.png"), url('c\'d.png'), url(e\20 f.png), linear-gradient(red,blue)`),['a) b.png',"c'd.png",'e f.png']);
 assert.deepEqual(cssUrls('none'),[]);
 assert.deepEqual(cssUrls(String.raw`url(\0.png),url(\110000.png),url(\d800.png)`),['�.png','�.png','�.png']);
});
test('asset bundle membership and selectors validate before browser connection',async()=>{
 const api=new BrowserAssets(()=>{throw Error('Unexpected browser discovery');}),owner={},state=api.state(owner);
 const inventory={targetId:'tab',result:{assets:[{id:'image',kind:'image'},{id:'script',kind:'script'}]}};
 state.inventories.set('inventory',inventory);
 for(const options of [{inventoryId:'missing'},{inventoryId:'inventory',assetIds:['unknown']},{inventoryId:'inventory',kinds:['script']},{inventoryId:'inventory',assetIds:['script']},{inventoryId:'inventory',assetIds:'image'},{inventoryId:'inventory',url:'https://example.test'}])await assert.rejects(api.request(owner,{targetId:'tab',action:'bundle',options}),/Unknown|Invalid|Only/u);
 await assert.rejects(api.request(owner,{targetId:'another-tab',action:'bundle',options:{inventoryId:'inventory'}}),/Unknown/u);
 await api.cleanup(owner);assert.equal(api.owners.size,0);
 assert.throws(()=>api.request(owner,{targetId:'tab',action:'list'}),/ended/u);
});
test('cleanup waits for exports and retries failed connection disposal',async()=>{
 const api=new BrowserAssets(),owner={},state=api.state(owner);let resolve;
 const job=new Promise(done=>{resolve=done;});state.pending.add(job);
 let failed=true;const connection={async close(){if(failed)throw Error('disconnect failed');}};state.connections.add(connection);
 let settled=false;const cleanup=api.cleanup(owner).finally(()=>{settled=true;});cleanup.catch(()=>{});
 await Promise.resolve();assert.equal(settled,false);resolve();
 await assert.rejects(cleanup,/disconnect failed/u);assert.equal(api.owners.size,1);
 failed=false;await api.cleanup(owner);assert.equal(api.owners.size,0);
});
