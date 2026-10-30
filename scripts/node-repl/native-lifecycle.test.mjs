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
