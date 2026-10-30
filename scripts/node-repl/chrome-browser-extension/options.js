const status=document.querySelector('#status'),enable=document.querySelector('#enable'),disable=document.querySelector('#disable');
async function refresh(){const granted=await chrome.permissions.contains({permissions:['history']});status.textContent=granted?'History access is enabled.':'History access is disabled.';enable.disabled=granted;disable.disabled=!granted;}
enable.addEventListener('click',async()=>{try{const granted=await chrome.permissions.request({permissions:['history']});await refresh();if(!granted)status.textContent='History access was not granted.';}catch(error){status.textContent=error.message;}});
disable.addEventListener('click',async()=>{try{await chrome.permissions.remove({permissions:['history']});await refresh();}catch(error){status.textContent=error.message;}});
chrome.permissions.onAdded.addListener(()=>void refresh());chrome.permissions.onRemoved.addListener(()=>void refresh());
await refresh();
