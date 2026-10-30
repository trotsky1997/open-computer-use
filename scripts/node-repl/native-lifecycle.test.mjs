import assert from 'node:assert/strict';
import test from 'node:test';
import {createCuaApi} from './open-computer-use-repl.mjs';
const result=(text,isError=false)=>({content:[{type:'text',text}],isError});
test('native computer target matches the local platform without starting a backend',()=>{
 for(const [platform,target] of [['darwin','mac'],['linux','linux'],['win32','windows']]){
  const cua=createCuaApi({request(){throw Error('Unexpected native startup');}},()=>({write(){}}),undefined,{platform});
  assert.equal(cua.computer.target,target);assert.equal(typeof cua.computer.launch_app,platform==='darwin'?'undefined':'function');assert.equal(Object.isFrozen(cua.computer),true);
 }
});
test('explicit native launch validates shape and preserves one literal executable',async()=>{
 const calls=[];let advertised=true,fail=false;
 const native={async request(method,params){calls.push({method,params});return method==='tools/list'?{tools:advertised?[{name:'launch_app',inputSchema:{properties:{app:{type:'string'}}}}]:[]}:result(fail?'Start failed':'Started',fail);}};
 const cua=createCuaApi(native,()=>({write(){}}),undefined,{platform:'linux'});
 for(const input of [undefined,null,{},[],{app:1},{app:' '},{app:'bad\npath'},{app:'x'.repeat(4097)},{app:'editor',args:[]}])await assert.rejects(cua.computer.launch_app(input),/launch_app requires/);
 assert.equal(calls.length,0);
 const app='/owned path/编辑器 $(literal)';await cua.computer.launch_app({app});assert.deepEqual(calls[1],{method:'tools/call',params:{name:'launch_app',arguments:{app}}});
 advertised=false;await assert.rejects(cua.computer.launch_app({app}),/does not advertise/);assert.equal(calls.length,3);
 advertised=true;fail=true;await assert.rejects(cua.computer.launch_app({app}),/Start failed/);
});
test('Linux windows bind an exact opaque selector and validate inventory/IDs before actions',async()=>{
 const calls=[];let advertised=true,listing=[{id:12,app:'shared',title:'same'}];
 const native={async request(method,params){calls.push({method,params});if(method==='tools/list')return {tools:advertised?[{name:'list_windows'},{name:'bind_window'}]:[]};if(params.name==='list_windows')return result(JSON.stringify(listing));if(params.name==='bind_window')return result(JSON.stringify({app:'ocu-window:identityAa'}));return result('exact state');}};
 const cua=createCuaApi(native,()=>({write(){}}),undefined,{platform:'linux'});
 for(const target of [{windowId:0},{windowId:1.5},{windowId:12,extra:1}])await assert.rejects(cua.getApp(target),/windowId/);
 assert.equal(calls.length,0);assert.deepEqual(await cua.listWindows({emit:false}),listing);
 const app=await cua.getApp({windowId:12},{initialState:false});assert.equal(await app.getAXState({emit:false}),'exact state');assert.equal(calls.at(-1).params.arguments.app,'ocu-window:identityAa');
 listing=[listing[0],listing[0]];await assert.rejects(cua.listWindows({emit:false}),/Invalid native window listing/);
 advertised=false;await assert.rejects(cua.getApp({windowId:12}),/does not advertise/);
 const mac=createCuaApi(native,()=>({write(){}}),undefined,{platform:'darwin'});assert.equal(mac.listWindows,undefined);await assert.rejects(mac.getApp({windowId:12}),/available on Linux/);
});
test('Linux text uses the focused/indexed signature and checks native support before input',async()=>{
 const calls=[];let advertised=true;
 const native={async request(method,params){calls.push({method,params});return method==='tools/list'?{tools:advertised?[{name:'type_text',inputSchema:{properties:{element_index:{type:'integer'}}}}]:[]}:result('ok');}};
 const cua=createCuaApi(native,()=>({write(){}}),undefined,{platform:'linux'}),app=await cua.getApp('Editor',{initialState:false});
 for(const [text,index] of [['',0],['x\0',0],['x',-1],['x',1.5],['x',{}],['x',null]])await assert.rejects(app.typeText(text,index),/Linux typeText/);
 assert.equal(calls.length,0);await app.typeText('你🙂',2);assert.deepEqual(calls.at(-1).params.arguments,{app:'Editor',text:'你🙂',element_index:2});
 await app.typeText('focus');assert.deepEqual(calls.at(-1).params.arguments,{app:'Editor',text:'focus'});
 advertised=false;await assert.rejects(app.typeText('must-not-send',2),/does not advertise/);
});
test('Linux printable keys validate input, capability and native emission counts',async()=>{
 const calls=[];let advertised=true,count=4,fail=false;
 const native={async request(method,params){calls.push({method,params});return method==='tools/list'?{tools:advertised?[{name:'type_characters'}]:[]}:result(fail?'1 characters confirmed sent; inspect before retrying':JSON.stringify({charactersSent:count}),fail);}};
 const cua=createCuaApi(native,()=>({write(){}}),undefined,{platform:'linux'}),app=await cua.getApp('Editor',{initialState:false});
 for(const text of [null,1,'x\n','x\0','\t','\ud800','\u200d'])await assert.rejects(app.typeCharacters(text),/printable Unicode/);
 assert.equal(calls.length,0);assert.deepEqual(await app.typeCharacters('A 你🙂'),{charactersSent:4});assert.deepEqual(calls.at(-1).params.arguments,{app:'Editor',text:'A 你🙂'});
 count=0;assert.deepEqual(await app.typeCharacters(''),{charactersSent:0});count=1;await assert.rejects(app.typeCharacters('ab'),/Invalid charactersSent/);
 fail=true;await assert.rejects(app.typeCharacters('ab'),/1 characters confirmed sent/);fail=false;advertised=false;await assert.rejects(app.typeCharacters('ab'),/does not advertise/);
 const mac=createCuaApi(native,()=>({write(){}}),undefined,{platform:'darwin'});assert.equal((await mac.getApp('Editor',{initialState:false})).typeCharacters,undefined);
});
