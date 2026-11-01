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
test('CDP validates command, event, child and timeout boundaries before connecting',async()=>{
 for(const method of ['Browser.close','Target.setAutoAttach','Input.dispatchKeyEvent','Network.getAllCookies','Security.setIgnoreCertificateErrors','invalid'])assert.throws(()=>cdpCommand(method));
 for(const options of [{limit:0},{limit:1001},{methods:[]},{methods:['invalid']},{afterSequence:-1},{afterSequence:1.1},{target:{sessionId:'x',targetId:'y'}},{target:{}},{timeoutMs:Infinity},{unknown:true}])assert.throws(()=>cdpOptions(options,true));
 assert.throws(()=>cdpCommand('Runtime.evaluate',[]));assert.throws(()=>cdpCommand('Network.getCookies',{}));
 assert.throws(()=>cdpCommand('Page.navigate',{url:'file:///tmp/fixture'}));
 cdpCommand('Runtime.evaluate',{expression:'document.title'});
 assert.throws(()=>cdpCommand('Network.enable',{enableDurableMessages:true}));
 cdpCommand('Network.enable',{maxTotalBufferSize:10485760,enableDurableMessages:false});
 cdpCommand('Network.configureDurableMessages',{});
 cdpCommand('Network.configureDurableMessages',{maxResourceBufferSize:1024});
 const {manager,owner,sends}=fixture();
 for(const method of ['Network.deleteDeviceBoundSession','Network.enableDeviceBoundSessions','Network.getResponseBodyForInterception','Network.setCookieControls','Network.setExtraHTTPHeaders','Network.setRequestInterception','Network.takeResponseBodyForInterceptionAsStream'])await assert.rejects(manager.request(owner,{action:'send',targetId:'tab',method}),/not supported/);
 for(const [method,params] of [['Network.enable',{enableDurableMessages:true}],['Network.configureDurableMessages',{maxTotalBufferSize:10485760}],['Network.configureDurableMessages',{maxTotalBufferSize:0}]])await assert.rejects(manager.request(owner,{action:'send',targetId:'tab',method,params}),/not supported/);
 for(const [method,params] of [
  ['Fetch.continueResponse',{binaryResponseHeaders:''}],['Fetch.fulfillRequest',{binaryResponseHeaders:''}],
  ['Page.reload',{scriptToEvaluateOnLoad:''}],['Page.createIsolatedWorld',{grantUniveralAccess:true}]
 ])await assert.rejects(manager.request(owner,{action:'send',targetId:'tab',method,params}),/not supported/);
 for(const [method,params] of [
  ['Fetch.continueResponse',{responseHeaders:[]}],['Fetch.fulfillRequest',{responseHeaders:[]}],
  ['Page.reload',{}],['Page.createIsolatedWorld',{grantUniveralAccess:false}]
 ])cdpCommand(method,params);
 for(const method of ['Page.addScriptToEvaluateOnLoad','Page.addScriptToEvaluateOnNewDocument'])await assert.rejects(manager.request(owner,{action:'send',targetId:'tab',method,params:{source:'self.__ownedPersistentHook=true'}}),/not supported/);
 for(const [method,params] of [['Fetch.disable',{}],['Fetch.enable',{}],['Fetch.enable',{patterns:null}],['Fetch.enable',{patterns:[{}]}],['Fetch.enable',{patterns:[{resourceType:'Document'}]}],['Fetch.enable',{patterns:[{resourceType:'Fetch'},null]}]])await assert.rejects(manager.request(owner,{action:'send',targetId:'tab',method,params}),/not supported/);
 cdpCommand('Fetch.enable',{patterns:[]});cdpCommand('Fetch.enable',{patterns:[{resourceType:'Fetch',requestStage:'Response'}]});
 cdpCommand('Fetch.disable',{}, {target:{sessionId:'child'}});cdpCommand('Fetch.enable',{}, {target:{targetId:'frame'}});
 for(const method of ['DOM.getFileInfo', 'DOM.setFileInputFiles', 'Network.continueInterceptedRequest', 'Network.getCertificate', 'Network.replayXHR', 'Page.crash', 'Page.disable', 'Page.getNavigationHistory', 'Page.resetNavigationHistory', 'Page.navigate', 'Page.navigateToHistoryEntry', 'Page.setAdBlockingEnabled', 'Page.setBypassCSP', 'Page.setDownloadBehavior', 'Page.setInterceptFileChooserDialog', 'Page.setRPHRegistrationMode', 'Page.setSPCTransactionMode']){assert.throws(()=>cdpCommand(method));await assert.rejects(manager.request(owner,{action:'send',targetId:'tab',method}),/not supported/);await assert.rejects(manager.request(owner,{action:'send',targetId:'tab',method,options:{target:{sessionId:'child'}}}),/not supported/);}
 assert.equal(manager.owners.size,0);assert.deepEqual(sends,[]);
});
test('CDP domain matrix and tracing restrictions validate before transport',async()=>{
 const {manager,owner,sends}=fixture();
 for(const domain of ['Browser','CacheStorage','Database','Security','Storage','Target','WebAuthn'])await assert.rejects(manager.request(owner,{action:'send',targetId:'tab',method:domain+'.enable'}),/not supported/);
 for(const method of ['Input.dispatchKeyEvent','Input.dispatchDragEvent','Input.setInterceptDrags','Tracing.requestMemoryDump'])await assert.rejects(manager.request(owner,{action:'send',targetId:'tab',method}),/not supported/);
 for(const params of [{perfettoConfig:''},{tracingBackend:'system'},{options:'record-until-full, enable-systrace '},{traceConfig:{enableSystrace:true}},{traceConfig:{memoryDumpConfig:{}}}])await assert.rejects(manager.request(owner,{action:'send',targetId:'tab',method:'Tracing.start',params}),/not supported/);
 assert.equal(manager.owners.size,0);assert.deepEqual(sends,[]);
 for(const method of ['Audits.enable','Console.enable','IO.read','Input.insertText','Inspector.enable','Tracing.getCategories'])cdpCommand(method);
 cdpCommand('Tracing.start',{tracingBackend:'chrome',options:'record-until-full',traceConfig:{enableSystrace:false,memoryDumpConfig:null}});
});
test('CDP explicit cookie URLs and dynamic parameter shapes validate before dispatch',async()=>{
 const valid={name:'owned',value:'value',url:'http://fixture.test/'};
 const {manager,owner,sends}=fixture();
 for(const [method,params] of [
  ['Network.getCookies',{}],['Network.getCookies',{urls:[]}],['Network.getCookies',{urls:[123]}],
  ['Network.setCookie',{name:'owned',value:'value'}],
  ...['domain','sourcePort','sourceScheme'].map(key=>['Network.setCookie',{...valid,[key]:undefined}]),
  ['Network.setCookie',{...valid,partitionKey:'invalid'}],['Network.setCookie',{...valid,partitionKey:{topLevelSite:123}}],
  ['Network.setCookies',{cookies:'invalid'}],['Network.setCookies',{cookies:[valid,{...valid,domain:'fixture.test'}]}],
  ['Network.deleteCookies',{name:'owned'}],['Page.deleteCookie',{}],
  ['Fetch.continueRequest',{url:123}],['Fetch.fulfillRequest',{responseHeaders:'invalid'}],
  ['Fetch.continueResponse',{responseHeaders:[{name:'Location',value:123}]}]
 ])await assert.rejects(manager.request(owner,{action:'send',targetId:'tab',method,params}),/url|cookie|header/i);
 assert.equal(manager.owners.size,0);assert.deepEqual(sends,[]);
 for(const [method,params] of [
  ['Network.getCookies',{urls:['http://fixture.test/','https://other.test/']}],
  ['Network.setCookie',valid],['Network.setCookies',{cookies:[]}],['Network.setCookies',{cookies:[valid]}],
  ['Network.deleteCookies',{name:'owned',url:valid.url}],['Page.deleteCookie',{cookieName:'owned',url:valid.url}],
  ['Fetch.continueRequest',{url:'https://other.test/data'}],['Fetch.fulfillRequest',{responseHeaders:[{name:'Location',value:'/next'}]}]
 ])cdpCommand(method,params);
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
 await manager.request(owner,{action:'send',targetId:'tab',method:'Fetch.disable',options:{target:{sessionId:'child'}}});assert.equal(sends.at(-1)[0],'Fetch.disable');assert.equal(sends.at(-1)[3],'child');
 await assert.rejects(manager.request(owner,{action:'send',targetId:'tab',method:'Fetch.disable',options:{target:{targetId:'tab'}}}),/attached|unknown|target/i);
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

test('CDP command deadlines pause on observed dialogs, resume remaining time and cancel unlimited requests',async()=>{
 const {manager,owner}=fixture(),entry=await manager.entry(owner,'tab');let entered;
 entry.connection.send=(_method,_params,nativeTimeout,_session,signal)=>new Promise((resolve,reject)=>{assert.equal(nativeTimeout,0);signal.addEventListener('abort',()=>reject(signal.reason),{once:true});entered({resolve,signal});});
 let started=new Promise(resolve=>entered=resolve);
 const pending=manager.request(owner,{action:'send',targetId:'tab',method:'Runtime.evaluate',options:{timeoutMs:60}}),failed=assert.rejects(pending,/timed out/);
 const wire=await started;manager.append(entry,{method:'Page.javascriptDialogOpening',params:{}});
 await new Promise(resolve=>setTimeout(resolve,100));assert.equal(wire.signal.aborted,false);
 manager.append(entry,{method:'Page.javascriptDialogClosed',params:{}});await failed;assert.equal(entry.commands.size,0);
 started=new Promise(resolve=>entered=resolve);
 const unlimited=manager.request(owner,{action:'send',targetId:'tab',method:'Runtime.evaluate',options:{timeoutMs:0}}),canceled=assert.rejects(unlimited,/abort|closed/i);
 await started;manager.append(entry,{method:'Page.javascriptDialogOpening',params:{}});await manager.cleanup(owner);await canceled;assert.equal(entry.commands.size,0);assert.equal(manager.owners.size,0);
});

test('CDP owner cancellation aborts pending connection setup before dispatch',async()=>{
 const {manager,owner,sends}=fixture();let enter;const started=new Promise(resolve=>enter=resolve);
 manager.open=(_url,_event,_closed,signal)=>new Promise((_resolve,reject)=>{enter(signal);signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});
 const pending=manager.request(owner,{action:'send',targetId:'tab',method:'Runtime.evaluate'}),canceled=assert.rejects(pending,/abort|closed/i);
 const signal=await started;await manager.cleanup(owner);await canceled;assert.equal(signal.aborted,true);assert.equal(sends.length,0);assert.equal(manager.owners.size,0);
});

test('CDP dialog clocks retain observed sources, reject disabling and clear detached streams',async()=>{
 const {manager,owner}=fixture(),entry=await manager.entry(owner,'tab');
 manager.append(entry,{method:'Target.attachedToTarget',params:{sessionId:'child',targetInfo:{targetId:'frame',type:'iframe'}}});
 manager.append(entry,{method:'Page.javascriptDialogOpening'});manager.append(entry,{method:'Page.javascriptDialogOpening',sessionId:'child'});
 manager.append(entry,{method:'Page.javascriptDialogClosed'});assert.equal(entry.dialogs.size,1);
 await assert.rejects(manager.request(owner,{action:'send',targetId:'tab',method:'Page.disable',options:{target:{sessionId:'child'}}}),/not supported/);assert.equal(entry.dialogs.size,1);
 manager.append(entry,{method:'Page.javascriptDialogClosed',sessionId:'child'});assert.equal(entry.dialogs.size,0);
 await manager.request(owner,{action:'send',targetId:'tab',method:'Page.enable',options:{target:{sessionId:'child'}}});manager.append(entry,{method:'Page.javascriptDialogOpening',sessionId:'child'});assert.equal(entry.dialogs.size,1);
 manager.append(entry,{method:'Target.detachedFromTarget',params:{sessionId:'child'}});assert.equal(entry.dialogs.size,0);manager.append(entry,{method:'Page.javascriptDialogOpening',sessionId:'child'});assert.equal(entry.dialogs.size,0);
 await manager.cleanup(owner);
});
