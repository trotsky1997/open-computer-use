export function normalizeHistoryOptions(options={},now=Date.now()){
 if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(key=>!['from','to','queries','limit'].includes(key)))throw Error('Invalid browser history options');
 const date=(value,fallback)=>{
  if(value===undefined)return fallback;
  let time;if(typeof value==='string')time=Date.parse(value);else try{time=Date.prototype.getTime.call(value);}catch{}
  if(!Number.isFinite(time))throw Error('History bounds require a valid date string or Date');return time;
 };
 const from=date(options.from,now-86400000),to=date(options.to,now);
 if(from>to)throw Error('History from must not exceed to');
 const limit=options.limit===undefined?100:options.limit;
 if(!Number.isInteger(limit)||limit<1||limit>1000)throw Error('History limit must be an integer from 1 to 1000');
 const queries=options.queries===undefined?[]:options.queries;
 if(!Array.isArray(queries)||queries.length>20||queries.some(query=>typeof query!=='string'||!query.trim()||query.length>200))throw Error('History queries require up to 20 non-empty strings of at most 200 characters');
 return {from:new Date(from).toISOString(),to:new Date(to).toISOString(),limit,queries:[...new Set(queries.map(query=>query.trim()))]};
}
export async function readHistory(chrome,options,check=()=>{}){
 const normalized=normalizeHistoryOptions(options),from=Date.parse(normalized.from),to=Date.parse(normalized.to);
 check();if(!await chrome.permissions.contains({permissions:['history']}))throw Error('History access is disabled. Open the browser extension options and grant the optional history permission.');check();
 const pages=new Map();
 for(const text of normalized.queries.length?normalized.queries:['']){
  check();const found=await chrome.history.search({text,startTime:from,endTime:to,maxResults:normalized.limit});check();
  for(const item of found)if(typeof item.url==='string'&&item.url&&!item.url.startsWith(`chrome-extension://${chrome.runtime.id}/`)&&!/^about:blank#ocu-/u.test(item.url))pages.set(item.url,item);
 }
 const rows=[];
 for(const item of pages.values()){
  check();let time=item.lastVisitTime;
  if(!Number.isFinite(time)||time<from||time>to){
   const visits=await chrome.history.getVisits({url:item.url});check();time=undefined;
   for(const visit of visits)if(Number.isFinite(visit.visitTime)&&visit.visitTime>=from&&visit.visitTime<=to&&(time===undefined||visit.visitTime>time))time=visit.visitTime;
  }
  if(time!==undefined&&time>=from&&time<=to)rows.push({dateVisited:new Date(time).toISOString(),...(typeof item.title==='string'?{title:item.title}:{}),url:item.url});
 }
 check();if(!await chrome.permissions.contains({permissions:['history']}))throw Error('History permission was revoked during the query');check();
 rows.sort((a,b)=>b.dateVisited.localeCompare(a.dateVisited)||a.url.localeCompare(b.url));const result=rows.slice(0,normalized.limit);
 if(new TextEncoder().encode(JSON.stringify(result)).byteLength>6*1024*1024)throw Error('History result exceeds 6 MiB; narrow the query');
 return result;
}
