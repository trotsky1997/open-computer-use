Object.defineProperty(globalThis,'ocuSelectionBridge',{value:Object.freeze({
 protocol:1,
 async selected(){
  const query={active:true,lastFocusedWindow:true};
  const [before]=await chrome.tabs.query(query);
  if(!before)return null;
  const targets=await chrome.debugger.getTargets();
  const [after]=await chrome.tabs.query(query);
  if(before.id!==after?.id)throw Error('Selected tab changed during observation; retry');
  const matches=targets.filter(target=>target.tabId===before.id&&target.type==='page');
  if(matches.length!==1)throw Error('Selected tab has no unique debugger target');
  return matches[0].id;
 },
})});
