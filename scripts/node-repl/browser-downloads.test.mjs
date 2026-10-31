import assert from 'node:assert/strict';
import test from 'node:test';
import {BrowserDownloads} from './browser-downloads.mjs';
function record(){let begin,finish;return {id:1,frames:new Set(['selected']),candidates:new Map(),began:{resolve:value=>{begin=value;},reject:error=>{throw error;}},finished:{resolve:()=>{finish='completed';},reject:()=>{finish='canceled';}},get begin(){return begin;},get finish(){return finish;}};}
test('downloads wait for proven frame identity even when completion arrives first',async()=>{
 const downloads=new BrowserDownloads();let closed=0;downloads.close=async()=>{closed++;};const state=record();
 downloads.begin(state,{guid:'foreign',frameId:'unrelated'});downloads.progress(state,{guid:'foreign',state:'completed'});
 downloads.begin(state,{guid:'owned',frameId:'popup'});downloads.progress(state,{guid:'owned',state:'completed'});
 assert.equal(state.begin,undefined);assert.equal(closed,0);downloads.frame(state,'popup');
 assert.equal(state.guid,'owned');assert.equal(state.begin,1);assert.equal(state.finish,'completed');assert.equal(closed,1);assert.equal(state.candidates.size,0);
});
test('unattributed download metadata is bounded and invalid identifiers fail before attribution',()=>{
 const downloads=new BrowserDownloads(),state=record();
 assert.throws(()=>downloads.begin(state,{guid:'../unsafe',frameId:'selected'}),/Invalid download identifier/);
 for(let i=0;i<128;i++)downloads.begin(state,{guid:'candidate-'+i,frameId:'unrelated'});
 assert.throws(()=>downloads.begin(state,{guid:'overflow',frameId:'unrelated'}),/Too many unattributed/);assert.equal(state.guid,undefined);
});
