import {browserExitProof} from './browser-process.mjs';
import {randomUUID} from "node:crypto";

export class BrowserTabs {
  constructor(endpoint,open,markerPrefix='ocu') {this.markerPrefix=markerPrefix;this.endpoint=endpoint;this.open=open;this.browsers=new Map();this.owners=new WeakMap();this.active=new Map();}
  state(owner) {
    if(!this.owners.has(owner)) this.owners.set(owner,{pending:new Set(),ended:false});
    return this.owners.get(owner);
  }
  begin(owner) {
    const state=this.state(owner);
    if(state.ending) throw new Error('Browser tab cleanup is still running');
    if(state.ended) {
      for(const entry of this.browsers.values()) for(const record of entry.tabs.values()) if(record.owner===owner) record.mark=undefined;
      state.ended=false;
    }
  }
  inherit(entry,info) {
    if(info.type!=='page') return;
    const owner=entry.creating.get(info.url) ?? entry.lineage.get(info.openerId);
    if(owner && !entry.tabs.has(info.targetId)) {
      entry.tabs.set(info.targetId,{owner});entry.lineage.set(info.targetId,owner);entry.creating.delete(info.url);
    }
  }
  async snapshot(entry) {
    const {targetInfos}=await entry.connection.send('Target.getTargets');
    for(let pass=0;pass<targetInfos.length;pass++) {
      const before=entry.tabs.size;for(const info of targetInfos) this.inherit(entry,info);
      if(entry.tabs.size===before) break;
    }
    const live=new Set(targetInfos.filter(info=>info.type==='page').map(info=>info.targetId));
    for(const id of entry.tabs.keys()) if(!live.has(id)) entry.tabs.delete(id);
    return live;
  }
  async closeTarget(entry,targetId) {
    try {
      const result=await entry.connection.send('Target.closeTarget',{targetId});
      if(!result.success && (await this.snapshot(entry)).has(targetId))throw Error('Browser refused to close tab');
    } catch(error) {
      if(!error.cdpError || (await this.snapshot(entry)).has(targetId))throw error;
    }
    // Chrome can acknowledge close before removing the target from discovery.
    const deadline=Date.now()+10000;
    while((await this.snapshot(entry)).has(targetId)){
      if(Date.now()>=deadline)throw Error('Tab close was acknowledged but the target remained available');
      await new Promise(resolve=>setTimeout(resolve,10));
    }
  }
  async browser(endpoint) {
    let entry=this.browsers.get(endpoint);
    if(entry?.exitProof?.browserGone()){entry.connection?.close();this.browsers.delete(endpoint);entry=undefined;}
    if(entry?.ready && !entry.error) {await entry.ready;return entry;}
    if(!entry) {entry={endpoint,tabs:new Map(),lineage:new Map(),creating:new Map()};this.browsers.set(endpoint,entry);}
    entry.error=undefined;
    entry.ready=(async()=>{
      const response=await fetch(new URL('/json/version',endpoint),{signal:AbortSignal.timeout(10000),redirect:'error'});
      if(!response.ok) throw new Error(`Tab discovery failed: HTTP ${response.status}`);
      const {webSocketDebuggerUrl}=await response.json(),browserId=new URL(webSocketDebuggerUrl).pathname;
      if(entry.browserId&&entry.browserId!==browserId&&(entry.tabs.size||entry.lineage.size||entry.creating.size))throw Error('Browser instance changed; previous tab cleanup is unconfirmed; reconnect the original browser');
      entry.browserId=browserId;
      let connection;connection=await this.open(webSocketDebuggerUrl,event=>{
        if(event.method==='Target.targetCreated') this.inherit(entry,event.params.targetInfo);
        if(event.method==='Target.targetDestroyed') entry.tabs.delete(event.params.targetId);
      },error=>{if(connection && entry.connection===connection)entry.error=error ?? new Error('Browser tab observer closed');});
      entry.connection=connection;entry.exitProof=await browserExitProof(endpoint,webSocketDebuggerUrl,connection.send);
      await entry.connection.send('Target.setDiscoverTargets',{discover:true});
      await this.snapshot(entry);
    })().catch(error=>{entry.error=error;entry.connection?.close();throw error;});
    await entry.ready;return entry;
  }
  idle(entry) {
    if(entry && !entry.lineage.size && !entry.creating.size && !this.active.get(entry.endpoint)) {
      this.browsers.delete(entry.endpoint);entry.connection?.close();
    }
  }
  request(owner,args) {
    const state=this.state(owner);
    if(state.ending || state.ended) throw new Error('Browser tab turn ended');
    if(!args || !['create','mark','close','name','session'].includes(args.action)) throw new Error('Unknown browser tab action');
    if(args.action==='create' && args.visible!==undefined && typeof args.visible!=='boolean') throw new Error('Tab visible must be a boolean');
    if(['mark','close'].includes(args.action) && (typeof args.targetId!=='string' || (args.action==='mark' && !['deliverable','handoff'].includes(args.mark)))) throw new Error('Invalid tab retention mark');
    const endpoint=this.endpoint();if(!endpoint) throw new Error('No CDP browser configured');
    if(args.action==='name'){
      if(typeof args.name!=='string'||!args.name.trim()||[...args.name].length>100||/[\u0000-\u001f\u007f-\u009f]/u.test(args.name))throw Error('Session name must be 1...100 characters without control characters');
      state.sessionName=args.name;return Promise.resolve();
    }
    if(args.action==='session')return Promise.resolve({name:state.sessionName});
    this.active.set(endpoint,(this.active.get(endpoint) ?? 0)+1);
    const work=(async()=>{
      const entry=await this.browser(endpoint);
      if(args.action==='create') {
        const marker=`about:blank#${this.markerPrefix}-${randomUUID()}`;entry.creating.set(marker,owner);
        let result;
        try {result=await entry.connection.send('Target.createTarget',{url:marker,background:args.visible===false});}
        catch(error) {if(error.cdpError)entry.creating.delete(marker);throw error;}
        if(typeof result.targetId!=='string' || !result.targetId) throw new Error('Created tab identity unavailable');
        if(!entry.tabs.has(result.targetId)) entry.tabs.set(result.targetId,{owner});entry.lineage.set(result.targetId,owner);entry.creating.delete(marker);
        await this.snapshot(entry);
        return result;
      }
      const live=await this.snapshot(entry);
      if(!live.has(args.targetId)) throw new Error('Tab closed or no longer available');
      const record=entry.tabs.get(args.targetId);
      if(record && record.owner!==owner) throw new Error('Tab retention belongs to another session');
      if(args.action==='close') {
        await this.closeTarget(entry,args.targetId);
      } else if(record) record.mark=args.mark;
    })();
    state.pending.add(work);work.finally(()=>{
      state.pending.delete(work);this.active.set(endpoint,this.active.get(endpoint)-1);
      if(!this.active.get(endpoint)) this.active.delete(endpoint);
      this.idle(this.browsers.get(endpoint));
    }).catch(()=>{});return work;
  }
  end(owner,{final=false}={}) {
    const state=this.state(owner);
    if(state.ending) return state.ending;
    state.ended=true;if(final)state.sessionName=undefined;
    state.ending=(async()=>{
      await Promise.allSettled([...state.pending]);
      for(const entry of this.browsers.values()) {
        if(![...entry.lineage.values(),...entry.creating.values()].includes(owner)) continue;
        if(entry.exitProof?.browserGone()){entry.tabs.clear();entry.lineage.clear();entry.creating.clear();entry.connection?.close();this.browsers.delete(entry.endpoint);continue;}
        await this.browser(entry.endpoint);
        for(let pass=0;pass<16;pass++) {
          await this.snapshot(entry);
          const close=[...entry.tabs].filter(([,record])=>record.owner===owner && !record.mark);
          if(!close.length) break;
          if(pass===15) throw new Error('Owned popups kept opening during tab cleanup');
          for(const [targetId] of close) {
            await this.closeTarget(entry,targetId);
          }
        }
        if([...entry.creating.values()].includes(owner)) throw new Error('The outcome of tab creation is unknown; retry cleanup after browser recovery');
        for(const [id,record] of entry.tabs) if(record.owner===owner && final) entry.tabs.delete(id);
        for(const [id,recordOwner] of entry.lineage) if(recordOwner===owner && !entry.tabs.has(id)) entry.lineage.delete(id);
        this.idle(entry);
      }
    })().finally(()=>{state.ending=undefined;});
    state.ending.catch(()=>{});return state.ending;
  }
}
