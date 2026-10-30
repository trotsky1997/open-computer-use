import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {normalizeHistoryOptions,readHistory} from './chrome-browser-extension/history.mjs';
import {BrowserChrome} from './browser-chrome.mjs';
const options={from:'2026-01-01',to:'2026-01-02',queries:['one','two'],limit:2};
const time=Date.parse('2026-01-01T12:00:00Z');
test('history bounds accept cross-realm Dates and reject unsupported options before IO',()=>{
 assert.equal(normalizeHistoryOptions({from:vm.runInNewContext('new Date("2026-01-01")'),to:'2026-01-02'}).from,'2026-01-01T00:00:00.000Z');
 assert.deepEqual(normalizeHistoryOptions({},86400000),{from:'1970-01-01T00:00:00.000Z',to:'1970-01-02T00:00:00.000Z',limit:100,queries:[]});
 for(const value of [null,{extra:true},{from:0},{from:'bad'},{from:'2027',to:'2026'},{limit:null},{limit:1001},{limit:1.5},{queries:null},{queries:['']},{queries:Array(21).fill('q')}])assert.throws(()=>normalizeHistoryOptions(value));
});
test('history merges OR queries, filters private pages and finds latest visit within bounds',async()=>{
 const searches=[],visits=[];
 const chrome={runtime:{id:'fixture'},permissions:{contains:async()=>true},history:{
  search:async query=>{searches.push(query);return query.text==='one'?[{url:'https://a.test',lastVisitTime:time,title:'A'},{url:'https://b.test',lastVisitTime:time+86400000}]:[{url:'https://a.test',lastVisitTime:time},{url:'chrome-extension://fixture/options.html',lastVisitTime:time},{url:'about:blank#ocu-bridge',lastVisitTime:time}];},
  getVisits:async({url})=>{visits.push(url);return [{visitTime:time-1},{visitTime:time+86400000}];},
 }};
 const rows=await readHistory(chrome,options);
 assert.deepEqual(rows.map(row=>row.url),['https://a.test','https://b.test']);assert.equal(rows[1].dateVisited,new Date(time-1).toISOString());
 assert.deepEqual(searches.map(q=>q.text),['one','two']);assert.deepEqual(visits,['https://b.test']);
});
test('history permission and cancellation fence native calls and returned rows',async()=>{
 let granted=false,canceled=false,calls=0;
 const chrome={runtime:{id:'fixture'},permissions:{contains:async()=>granted},history:{search:async()=>{calls++;canceled=true;return [];}}};
 await assert.rejects(readHistory(chrome,options),/disabled/);assert.equal(calls,0);
 granted=true;await assert.rejects(readHistory(chrome,options,()=>{if(canceled)throw Error('Canceled');}),/Canceled/);assert.equal(calls,1);
 canceled=false;chrome.history.search=async()=>{granted=false;return [];};await assert.rejects(readHistory(chrome,{...options,queries:[]}),/revoked/);
});
test('history turn cleanup waits for stop acknowledgement and retries failures without early disconnect',async()=>{
 const bridge=new BrowserChrome(()=> 'http://history.test/'),owner={};let fail=true,stops=0,closes=0;
 bridge.initialize=async entry=>{entry.connection={send:async()=>{stops++;if(fail)throw Error('Stop outage');return {};},close(){closes++;}};};
 bridge.invoke=()=>new Promise(()=>{});bridge.tabs.end=async()=>{};
 const pending=bridge.request(owner,{action:'history',options});pending.catch(()=>{});
 await new Promise(resolve=>setImmediate(resolve));
 await assert.rejects(bridge.cleanup(owner),/Stop outage/);assert.equal(closes,0);assert.equal(bridge.owners.size,1);
 fail=false;await bridge.cleanup(owner);assert.equal(closes,1);assert.equal(bridge.owners.size,0);assert.ok(stops>=2);
});
test('history lost transport requires an acknowledged stop before releasing ownership',async()=>{
 const bridge=new BrowserChrome(()=> 'http://history.test/'),owner={};
 bridge.initialize=async entry=>{entry.connection={send:async()=>{throw Error('Lost transport');},close(){}};};
 bridge.invoke=async()=>{throw Error('Lost read acknowledgement');};bridge.tabs.end=async()=>{};
 await assert.rejects(bridge.request(owner,{action:'history',options}),/Lost transport/);
 await assert.rejects(bridge.cleanup(owner),/Lost transport/);assert.equal(bridge.owners.size,1);
});
