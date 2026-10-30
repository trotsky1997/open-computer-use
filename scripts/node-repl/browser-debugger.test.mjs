import test from 'node:test';
import assert from 'node:assert/strict';
import {BrowserDebugger,cdpCommand,cdpOptions} from './browser-debugger.mjs';
function fixture() {
 let url='http://fixture.test/',closed=false;
 const sends=[];
 const manager=new BrowserDebugger(()=> 'http://endpoint.test/',async()=>({async send(...args){sends.push(args);return {ok:true};},close(){closed=true;}}));
 manager.current=async()=>({url,webSocketDebuggerUrl:'ws://page'});
 return {manager,owner:{},sends,setUrl(value){url=value;},get closed(){return closed;}};
}
test('CDP validates command, event, child and timeout boundaries before connecting',()=>{
 for(const method of ['Browser.close','Target.setAutoAttach','Input.dispatchKeyEvent','Network.getAllCookies','Network.setCookies','Security.setIgnoreCertificateErrors','invalid'])assert.throws(()=>cdpCommand(method));
 for(const options of [{limit:0},{limit:1001},{methods:[]},{methods:['invalid']},{afterSequence:-1},{afterSequence:1.1},{target:{sessionId:'x',targetId:'y'}},{target:{}},{timeoutMs:Infinity},{unknown:true}])assert.throws(()=>cdpOptions(options,true));
 assert.throws(()=>cdpCommand('Runtime.evaluate',[]));assert.throws(()=>cdpCommand('Network.getCookies',{urls:['http://elsewhere.test/']}));
 assert.throws(()=>cdpCommand('Page.navigate',{url:'file:///tmp/fixture'}));
 cdpCommand('Runtime.evaluate',{expression:'document.title'});
});
test('CDP cursors paginate filters, report eviction and rotate on origin change',async()=>{
 const {manager,owner,setUrl}=fixture();const entry=await manager.entry(owner,'tab');
 const before=(await manager.request(owner,{action:'events',targetId:'tab'})).cursor;
 for(const method of ['Runtime.consoleAPICalled','Network.loadingFinished','Runtime.consoleAPICalled'])manager.append(entry,{method,params:{}});
 const first=await manager.request(owner,{action:'events',targetId:'tab',options:{afterSequence:before,methods:['Runtime.consoleAPICalled'],limit:1}});
 assert.equal(first.events.length,1);assert.equal(first.hasMore,true);
 const second=await manager.request(owner,{action:'events',targetId:'tab',options:{afterSequence:first.cursor,methods:['Runtime.consoleAPICalled'],limit:1}});
 assert.equal(second.events.length,1);assert.equal(second.hasMore,false);
 for(let i=0;i<2050;i++)manager.append(entry,{method:'Runtime.consoleAPICalled',params:{i}});
 assert.equal((await manager.request(owner,{action:'events',targetId:'tab',options:{afterSequence:before}})).truncated,true);
 setUrl('https://next.test/');const next=await manager.request(owner,{action:'events',targetId:'tab',options:{afterSequence:before}});
 assert.equal(next.events.length,0);assert.equal(next.truncated,true);await manager.cleanup(owner);
});
test('CDP child selectors preserve detached history and cancellation releases pending readers',async()=>{
 const f=fixture(),{manager,owner,sends}=f,entry=await manager.entry(owner,'tab');
 manager.append(entry,{method:'Target.attachedToTarget',params:{sessionId:'child',targetInfo:{targetId:'frame',type:'iframe',url:'http://foreign.test/'}}});
 const before=entry.cursor;manager.append(entry,{sessionId:'child',method:'Runtime.consoleAPICalled',params:{}});
 await manager.request(owner,{action:'send',targetId:'tab',method:'Runtime.enable',options:{target:{targetId:'frame'}}});assert.equal(sends.at(-1)[3],'child');
 manager.append(entry,{method:'Target.detachedFromTarget',params:{sessionId:'child'}});
 const history=await manager.request(owner,{action:'events',targetId:'tab',options:{afterSequence:before,target:{targetId:'frame'}}});assert.equal(history.events.length,1);
 await assert.rejects(manager.request(owner,{action:'send',targetId:'tab',method:'Runtime.enable',options:{target:{sessionId:'child'}}}),/detached/);
 const waiting=manager.request(owner,{action:'events',targetId:'tab',options:{timeoutMs:1000,methods:['Network.loadingFailed']}});const rejected=assert.rejects(waiting,/closed/);
 await new Promise(resolve=>setTimeout(resolve,10));await manager.cleanup(owner);await rejected;assert.equal(f.closed,true);assert.equal(manager.owners.size,0);
});


test('CDP cancellation during discovery cannot dispatch a later command',async()=>{
 const {manager,owner,sends}=fixture();await manager.entry(owner,'tab');
 let enter,release;const entered=new Promise(resolve=>enter=resolve),gate=new Promise(resolve=>release=resolve);
 manager.current=async()=>{enter();await gate;return {url:'http://fixture.test/'};};
 const pending=manager.request(owner,{action:'send',targetId:'tab',method:'Runtime.evaluate',params:{expression:'1'}});
 const rejected=assert.rejects(pending,/closed/);await entered;await manager.cleanup(owner);release();await rejected;
 assert.equal(sends.some(call=>call[0]==='Runtime.evaluate'),false);
});


import {PersistentJavaScriptSession,WorkerJavaScriptSession} from './open-computer-use-repl.mjs';
for(const Session of [PersistentJavaScriptSession,WorkerJavaScriptSession]) test(`${Session.name}: command timeout text preserves the JS context`,async()=>{
 const session=new Session({native:{async request(){throw Error('unused');}}});
 try {
  assert.equal((await session.run('var marker=7;throw new Error("CDP command timed out");')).isError,true);
  const result=await session.run('nodeRepl.write(marker)');assert.equal(result.isError,false);assert.equal(result.content.at(-1).text,'7');
 }finally{await session.close();}
});
