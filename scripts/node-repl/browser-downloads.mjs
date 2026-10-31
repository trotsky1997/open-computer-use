import {mkdtemp, lstat} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {findBrowserPage} from "./browser-playwright.mjs";

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes,no) => {resolve=yes;reject=no;});
  promise.catch(() => {});
  return {promise,resolve,reject};
}
async function bounded(promise, timeout, label) {
  if (!timeout) return promise;
  let timer;
  try { return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} timed out after ${timeout} ms`)),timeout);})]); }
  finally {clearTimeout(timer);}
}

const activeContexts = new Map();
export class BrowserDownloads {
  constructor(endpoint = () => process.env.OPEN_COMPUTER_USE_CDP_URL, onFailure = () => {}, open) {
    this.endpoint = endpoint;
    this.onFailure = onFailure;
    this.open = open;
    this.entries = new Map();
    this.active = activeContexts;
    this.nextId = 1;
  }
  async start(owner, targetId, options = {}) {
    const id = this.nextId++;
    const record = {id,owner,targetId,timeout:options.timeoutMs ?? 10000,began:deferred(),finished:deferred()};
    this.entries.set(id,record);
    record.initialized = this.initialize(record);
    try {await record.initialized;return id;}
    catch(error) {await this.close(record);this.entries.delete(id);throw error;}
  }
  async initialize(record) {
    const origin = new URL(this.endpoint());
    if (!["http:","https:"].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) throw new Error("Invalid CDP download origin");
    record.endpoint = origin.href;
    const {chromium} = await import("playwright-core");
    record.browser = await chromium.connectOverCDP(record.endpoint,{timeout:10000,noDefaults:true});
    record.session = await record.browser.newBrowserCDPSession();
    const {targetInfo} = await this.send(record,"Target.getTargetInfo",{targetId:record.targetId});
    record.context = targetInfo.browserContextId;
    record.key = `${record.endpoint}|${record.context ?? "default"}`;
    if (this.active.has(record.key)) throw new Error("A download already owns this browser context");
    this.active.set(record.key,record);
    const {session} = await findBrowserPage(record.browser,record.targetId);
    record.pageSession = session;
    record.frames = new Set();record.candidates=new Map();
    session.on("Page.frameAttached",event=>this.frame(record,event.frameId));
    await session.send("Page.enable");
    {
      const {frameTree} = await session.send("Page.getFrameTree");
      const visit = tree => {record.frames.add(tree.frame.id);for(const child of tree.childFrames ?? []) visit(child);};
      visit(frameTree);
    }
    record.directory = await mkdtemp(path.join(tmpdir(),"ocu-download-"));
    record.session.on("Browser.downloadWillBegin",event=>this.begin(record,event));
    record.session.on("Browser.downloadProgress",event=>this.progress(record,event));
    await this.observePopups(record);
    // Register the attempted mutation before dispatch so failed acknowledgements are cleaned up.
    record.policy = true;
    await this.send(record,"Browser.setDownloadBehavior",{behavior:"allowAndName",downloadPath:record.directory,eventsEnabled:true,browserContextId:record.context});
  }
  frame(record,frameId) {
    if (typeof frameId !== "string") return;
    record.frames.add(frameId);
    for (const event of record.candidates.values()) if (event.frameId === frameId) {this.begin(record,event);break;}
  }
  begin(record,event) {
    if(record.guid) return;
    if(!/^[A-Za-z0-9_-]{1,128}$/u.test(event.guid)) {record.began.reject(new Error("Invalid download identifier"));return;}
    if(!record.frames.has(event.frameId)) {
      if(record.candidates.size >= 128) {record.began.reject(new Error("Too many unattributed download events"));return;}
      record.candidates.set(event.guid,event);return;
    }
    record.guid = event.guid;record.candidates.clear();record.began.resolve(record.id);
    if(event.state) this.progress(record,event);
  }
  progress(record,event) {
    if(!["completed","canceled"].includes(event.state)) return;
    if(event.guid !== record.guid) {const pending=record.candidates.get(event.guid);if(pending)pending.state=event.state;return;}
    record.ended = true;record.completed = event.state === "completed";
    if(record.completed) record.finished.resolve();
    else record.finished.reject(new Error("Browser download canceled"));
    void this.close(record).catch(error=>this.onFailure(record.owner,error));
  }
  async observePopups(record) {
    if(typeof this.open !== "function") throw new Error("Download popup transport is unavailable");
    const {targetInfos}=await this.send(record,"Target.getTargets");
    const baseline=new Set(targetInfos.map(info=>info.targetId)),lineage=new Set([record.targetId]);
    const sessions=new Map();record.popupTasks=new Set();
    const response=await fetch(new URL('/json/version',record.endpoint),{signal:AbortSignal.timeout(10000),redirect:'error'});
    if(!response.ok)throw new Error(`Download discovery failed: HTTP ${response.status}`);
    let connection;
    const failure=error=>{record.popupError=error;record.began.reject(error);if(!record.ended)record.finished.reject(error);};
    connection=await this.open((await response.json()).webSocketDebuggerUrl,event=>{
      if(event.sessionId && sessions.has(event.sessionId)){
        if(record.popupClosing)return;
        if(event.method.startsWith('Page.'))sessions.get(event.sessionId).ready.resolve();
        if(event.method==='Page.frameNavigated')this.frame(record,event.params.frame.id);
        else if(['Page.frameAttached','Page.frameStartedNavigating'].includes(event.method))this.frame(record,event.params.frameId);
        return;
      }
      if(event.method==='Target.detachedFromTarget'){sessions.delete(event.params.sessionId);return;}
      if(event.method!=='Target.attachedToTarget')return;
      const {sessionId,targetInfo,waitingForDebugger}=event.params;
      const related=!record.guid&&!record.popupClosing&&!baseline.has(targetInfo.targetId)&&lineage.has(targetInfo.openerId)&&(targetInfo.browserContextId??null)===(record.context??null);
      if(related){lineage.add(targetInfo.targetId);sessions.set(sessionId,{targetId:targetInfo.targetId,ready:deferred()});}
      const checkFailure=async error=>{
        if(record.popupClosing)return;
        const {targetInfos}=await this.send(record,'Target.getTargets');
        if(targetInfos.some(info=>info.targetId===targetInfo.targetId))failure(error);
      };
      const work=(async()=>{
        let resumed=false;
        try {
          if(related){
            await Promise.race([connection.send('Page.enable',{},10000,sessionId),sessions.get(sessionId).ready.promise]);
            const tree=connection.send('Page.getFrameTree',{},10000,sessionId);
            if(waitingForDebugger){resumed=true;connection.send('Runtime.runIfWaitingForDebugger',{},10000,sessionId).catch(checkFailure).catch(failure);}
            const {frameTree}=await tree;
            const visit=tree=>{this.frame(record,tree.frame.id);for(const child of tree.childFrames??[])visit(child);};visit(frameTree);
          }
        }catch(error){await checkFailure(error);}
        finally{if(waitingForDebugger&&!resumed)await connection.send('Runtime.runIfWaitingForDebugger',{},10000,sessionId).catch(checkFailure);}
      })();
      record.popupTasks.add(work);work.finally(()=>record.popupTasks.delete(work)).catch(failure);
    },()=>{record.popupDisconnected=true;if(!record.popupClosing)failure(new Error('Download popup observer disconnected'));});
    record.popupConnection=connection;
    await connection.send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:true,filter:[{type:'page',exclude:false},{exclude:true}]});
    await Promise.allSettled([...record.popupTasks]);
    if(record.popupError)throw record.popupError;
  }
  send(record,method,params) {return bounded(record.session.send(method,params),10000,method);}
  get(owner,id) {
    const record = this.entries.get(id);
    if(!record || record.owner !== owner) throw new Error("Unknown download handle");
    return record;
  }
  async wait(owner,id) {
    const record = this.get(owner,id);
    try {await bounded(record.began.promise,record.timeout,"Download event");return id;}
    catch(error) {await this.close(record);throw error;}
  }
  async path(owner,id,options = {}) {
    const record = this.get(owner,id);
    try {
      await bounded(record.finished.promise,options.timeoutMs ?? 10000,"Download completion");
      await this.close(record);
      const file = path.join(record.directory,record.guid);
      if(!(await lstat(file)).isFile()) throw new Error("Downloaded artifact is not a regular file");
      return file;
    } catch(error) {await this.close(record);throw error;}
  }
  close(record) {
    if(!record.closing) record.closing = (async()=>{
      await record.initialized.catch(()=>{});
      if(!record.ended) {
        const error = new Error("Download session ended");
        record.began.reject(error);
        if(!record.guid) record.finished.reject(error);
      }
      try {
        if(record.policy) {
          if(!record.browser.isConnected()) {
            const {chromium} = await import("playwright-core");
            record.browser = await chromium.connectOverCDP(record.endpoint,{timeout:10000,noDefaults:true});
            record.session = await record.browser.newBrowserCDPSession();
          }
          try {
            if(record.guid && !record.ended) {
              try {
                await this.send(record,"Browser.cancelDownload",{guid:record.guid,browserContextId:record.context});
                await bounded(record.finished.promise.catch(error=>{if(!record.ended) throw error;}),10000,"Download cancellation");
              } catch(error) {record.finished.reject(error);throw error;}
            }
          } finally {
            await this.send(record,"Browser.setDownloadBehavior",{behavior:"default",eventsEnabled:false,browserContextId:record.context});
          }
        }
      } finally {
        record.popupClosing=true;
        try {
          await Promise.allSettled([...(record.popupTasks??[])]);
          if(record.popupConnection&&!record.popupDisconnected)await record.popupConnection.send('Target.setAutoAttach',{autoAttach:false,waitForDebuggerOnStart:false,flatten:true});
          await Promise.allSettled([...(record.popupTasks??[])]);
        } finally {
          const connection=record.popupConnection;record.popupConnection=undefined;record.popupDisconnected=true;
          connection?.close();await record.browser?.close();
        }
      }
      // Keep context ownership until policy restoration and disconnect have both succeeded.
      if(this.active.get(record.key) === record) this.active.delete(record.key);
      record.browser=undefined;record.session=undefined;record.pageSession=undefined;
      record.frames?.clear();record.candidates?.clear();record.popupConnection=undefined;
    })().catch(error=>{
      record.closing=undefined;
      error = error instanceof Error ? error : new Error(String(error));
      error.browserCleanupFailed=true;
      throw error;
    });
    return record.closing;
  }
  async cleanup(owner) {
    const records = [...this.entries.values()].filter(record=>record.owner===owner);
    const results = await Promise.allSettled(records.map(async record=>{await this.close(record);this.entries.delete(record.id);}));
    const failure = results.find(result=>result.status === "rejected");
    if(failure) throw failure.reason;
  }
}
