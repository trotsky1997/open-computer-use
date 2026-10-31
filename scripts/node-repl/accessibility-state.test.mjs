import test from 'node:test';
import assert from 'node:assert/strict';
import {accessibilityStateDiff,browserAccessibilityState} from './accessibility-state.mjs';

test('AX rendering retains native indices, ignored ancestry, state values and partial-tree nodes',()=>{
 const nodes=[
  {nodeId:'1',role:{value:'RootWebArea'},childIds:['2','4']},
  {nodeId:'2',parentId:'1',ignored:true,childIds:['3']},
  {nodeId:'3',parentId:'2',role:{value:'checkbox'},name:{value:'Remember'},description:{value:'Keep this choice'},properties:[{name:'checked',value:{type:'tristate',value:'mixed'}},{name:'disabled',value:{type:'boolean',value:false}},{name:'focusable',value:{type:'boolean',value:true}},{name:'controls',value:{relatedNodes:[{backendDOMNodeId:9}]}}]},
  {nodeId:'4',parentId:'1',role:{value:'textbox'},value:{value:'line\nvalue'},childIds:['1']},
  {nodeId:'-5',parentId:'missing',role:{value:'StaticText'},name:{value:'Tail'}},
  {nodeId:'6',parentId:'cycle',role:{value:'generic'}},
  {nodeId:'-7',parentId:'4',role:{value:'InlineTextBox'},name:{value:'layout duplicate'}}
 ];
 const rendered=browserAccessibilityState(nodes);assert.match(rendered,/^  \[3\] checkbox "Remember" description="Keep this choice" checked=mixed disabled=false$/m);
 assert.match(rendered,/^  \[4\] textbox "" value="line\\nvalue"$/m);assert.match(rendered,/^\[-5\] StaticText "Tail"$/m);assert.match(rendered,/^\[6\] generic/m);assert.equal(rendered.split('\n').length,5);
 assert.equal(accessibilityStateDiff(undefined,rendered,'tab'),rendered);assert.equal(accessibilityStateDiff(rendered,rendered,'tab'),'Accessibility state unchanged.');
 assert.equal(accessibilityStateDiff('short','changed','tab'),'changed');
 const previous=Array.from({length:40},(_,i)=>`[${i}] button "Item ${i}"`).join('\n'),current=previous.replace('Item 12','Updated');
 assert.match(accessibilityStateDiff(previous,current,'tab'),/- \[12\] button "Item 12"\n\+ \[12\] button "Updated"/);
});
