import {createServer} from "node:http";
import {randomUUID} from "node:crypto";

const LIMIT = 16 * 1024 * 1024;
const queues = new Map();
const controls = new Map();

export function validateClipboardWrite(method, value) {
  if (method === "writeText") {
    if (typeof value !== "string" || Buffer.byteLength(value) > LIMIT) throw new Error("Clipboard text must be a string of at most 16 MiB");
    return;
  }
  if (!Array.isArray(value)) throw new Error("Clipboard write expects an array of items");
  let size = 0;
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item) || Object.keys(item).some(key=>!["entries","presentationStyle"].includes(key)) || !Array.isArray(item.entries) || !item.entries.length) throw new Error("Clipboard items require entries");
    if (item.presentationStyle !== undefined && !["unspecified","inline","attachment"].includes(item.presentationStyle)) throw new Error("Invalid clipboard presentationStyle");
    const types = new Set();
    for (const entry of item.entries) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry) || Object.keys(entry).some(key=>!["mimeType","text","base64"].includes(key))) throw new Error("Invalid clipboard entry");
      if (typeof entry.mimeType !== "string" || !/^(?:web )?[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(entry.mimeType) || types.has(entry.mimeType)) throw new Error("Clipboard MIME types must be valid and unique per item");
      types.add(entry.mimeType);
      if ((typeof entry.text === "string") === (typeof entry.base64 === "string")) throw new Error("Clipboard entry requires exactly one text or base64 payload");
      if (entry.text !== undefined && typeof entry.text !== "string" || entry.base64 !== undefined && typeof entry.base64 !== "string") throw new Error("Invalid clipboard payload");
      if (entry.base64 !== undefined) {
        if (entry.base64.length > Math.ceil(LIMIT / 3) * 4 || Buffer.from(entry.base64,"base64").toString("base64") !== entry.base64) throw new Error("Clipboard base64 must be canonical and at most 16 MiB");
        size += Buffer.from(entry.base64,"base64").length;
      } else size += Buffer.byteLength(entry.text);
      if (size > LIMIT) throw new Error("Clipboard content exceeds 16 MiB");
    }
  }
}

async function clipboardOperation(method, value, limit) {
  const clipboard = navigator.clipboard;
  if (!clipboard) throw new Error("Native clipboard API is unavailable on the control page");
  if (method === "writeText") return clipboard.writeText(value);
  if (method === "write" || method === "paste") {
    return clipboard.write(value.map(item => new ClipboardItem(Object.fromEntries(item.entries.map(entry => {
      const payload = entry.text !== undefined ? entry.text : Uint8Array.from(atob(entry.base64),character=>character.charCodeAt(0));
      return [entry.mimeType,new Blob([payload],{type:entry.mimeType})];
    })),{presentationStyle:item.presentationStyle ?? "unspecified"})));
  }
  if (method === "readText") {
    const text = await clipboard.readText();
    if (new TextEncoder().encode(text).length > limit) throw new Error("Clipboard content exceeds 16 MiB");
    return text;
  }
  let size = 0;
  const result = [];
  for (const item of await clipboard.read()) {
    const entries = [];
    for (const mimeType of item.types) {
      const blob = await item.getType(mimeType);
      size += blob.size;
      if (size > limit) throw new Error("Clipboard content exceeds 16 MiB");
      if (mimeType.startsWith("text/")) entries.push({mimeType,text:await blob.text()});
      else {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = "";
        for (let offset=0;offset<bytes.length;offset+=8192) binary += String.fromCharCode(...bytes.subarray(offset,offset+8192));
        entries.push({mimeType,base64:btoa(binary)});
      }
    }
    result.push({entries,presentationStyle:item.presentationStyle ?? "unspecified"});
  }
  return result;
}

export class BrowserClipboard {
  constructor(endpoint, connect, input) {
    this.endpoint = endpoint;
    this.connect = connect;
    this.input = input;
    this.owners = new Map();
    this.closedOwners = new WeakSet();
    this.tokens = new Set();
  }
  internalTargets() {
    return [...(controls.get(this.endpoint()) ?? [])];
  }
  async json(endpoint, route) {
    const response = await fetch(new URL(route,endpoint),{signal:AbortSignal.timeout(10_000),redirect:"error"});
    if (!response.ok) throw new Error(`Clipboard browser discovery failed: HTTP ${response.status}`);
    return response.json();
  }
  async ensureServer() {
    if (!this.serverReady) {
      const server = createServer((request,response) => {
        if (request.method !== "GET" || !this.tokens.has(request.url)) {response.writeHead(404);response.end();return;}
        response.setHeader("Content-Type","text/html; charset=utf-8");
        response.setHeader("Cache-Control","no-store");
        response.end("<!doctype html><title>Open Computer Use clipboard</title>");
      });
      this.server = server;
      this.serverReady = new Promise((resolve,reject) => {
        server.once("error",reject);
        server.listen(0,"127.0.0.1",() => resolve(`http://127.0.0.1:${server.address().port}`));
      });
      this.serverReady.catch(()=>{});
    }
    return this.serverReady;
  }
  async enqueue(endpoint, operation) {
    const task = (queues.get(endpoint) ?? Promise.resolve()).catch(()=>{}).then(operation);
    queues.set(endpoint,task);
    try {return await task;}
    finally {if (queues.get(endpoint) === task) queues.delete(endpoint);}
  }
  async request(owner, args) {
    if (args?.method === "targets") return this.internalTargets();
    if (!args || !["read","readText","write","writeText","paste"].includes(args.method)) throw new Error("Unknown clipboard operation");
    if(args.method==="paste" && !this.input)throw new Error("Paste requires managed browser input");
    if (["write","writeText","paste"].includes(args.method)) validateClipboardWrite(args.method,args.value);
    if (this.closedOwners.has(owner)) throw new Error("Browser clipboard session closed");
    const endpoint = this.endpoint();
    if (!endpoint) throw new Error("No CDP browser configured");
    let state = this.owners.get(owner);
    if (!state) this.owners.set(owner,state={bridges:new Map(),pending:new Set(),tickets:new Set()});
    const ticket = {started:false};
    const canceled = new Promise((resolve,reject)=>{ticket.cancel=()=>reject(new Error("Browser clipboard session closed"));});
    state.tickets.add(ticket);
    const work = this.enqueue(endpoint,async () => {
      ticket.started = true;
      if (this.closedOwners.has(owner)) throw new Error("Browser clipboard session closed");
      await this.input?.(owner,{action:"checkClipboard"});
      const version = await this.json(endpoint,"/json/version");
      return this.connect(version.webSocketDebuggerUrl,async send => {
        let commandLine;
        try {commandLine=await send("Browser.getBrowserCommandLine");}
        catch {throw new Error("Clipboard requires headless Chromium launched with --enable-automation");}
        if (!commandLine.arguments?.some(argument=>["--headless","--headless=new"].includes(argument))) throw new Error("Clipboard requires verified headless Chromium with an isolated virtual clipboard");
        const {targetInfo} = await send("Target.getTargetInfo",{targetId:args.targetId});
        if (targetInfo.type !== "page" || this.internalTargets().includes(args.targetId)) throw new Error("Clipboard requires a live user tab");
        const contexts = await send("Target.getBrowserContexts");
        const context = contexts.browserContextIds.includes(targetInfo.browserContextId) ? {browserContextId:targetInfo.browserContextId} : {};
        const key = targetInfo.browserContextId ?? "default";
        let bridge = state.bridges.get(key);
        if (!bridge) {
          bridge = {context};
          state.bridges.set(key,bridge);
          const origin = await this.ensureServer();
          bridge.path = `/__ocu_clipboard_${randomUUID()}`;
          this.tokens.add(bridge.path);
          bridge.url = origin + bridge.path;
          bridge.origin = origin;
          const created = await send("Target.createTarget",{url:bridge.url,background:true,...context});
          bridge.targetId = created.targetId;
          if (!controls.has(endpoint)) controls.set(endpoint,new Set());
          controls.get(endpoint).add(bridge.targetId);
        }
        await send("Browser.setPermission",{permission:{name:"clipboard-read",allowWithoutSanitization:true},setting:"granted",origin:bridge.origin,...context});
        const target = (await this.json(endpoint,"/json/list")).find(target=>target.id===bridge.targetId);
        if (!target) throw new Error("Clipboard control tab closed; reset the session");
        const operation = () => this.connect(target.webSocketDebuggerUrl,async page => {
          let ready = false;
          for (let attempt=0;attempt<100;attempt++) {
            const result = await page("Runtime.evaluate",{expression:"location.href",returnByValue:true});
            if (result.result.value === bridge.url) {ready=true;break;}
            if (result.result.value !== "about:blank") throw new Error("Clipboard control tab navigated; reset the session");
            await new Promise(resolve=>setTimeout(resolve,20));
          }
          if (!ready) throw new Error("Clipboard control page did not load; the browser must reach the host loopback server");
          if (this.closedOwners.has(owner)) throw new Error("Browser clipboard session closed");
          try {await page("Emulation.setFocusEmulationEnabled",{enabled:true});}
          catch (error) {error.browserCleanupFailed=true;throw error;}
          try {
            if(this.closedOwners.has(owner))throw new Error("Browser clipboard session closed");
            const result = await page("Runtime.evaluate",{expression:`(${clipboardOperation.toString()})(${JSON.stringify(args.method)},${JSON.stringify(args.value) ?? "undefined"},${LIMIT})`,awaitPromise:true,returnByValue:true,userGesture:true});
            if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "Clipboard operation failed");
            return result.result.value;
          } finally {
            try {await page("Emulation.setFocusEmulationEnabled",{enabled:false});}
            catch (error) {error.browserCleanupFailed=true;throw error;}
          }
        });
        if (args.method === "paste") {
          if (this.closedOwners.has(owner)) throw new Error("Browser clipboard session closed");
          return this.input(owner,{action:"paste",targetId:args.targetId,element:args.element,geometry:args.geometry},operation);
        }
        return operation();
      });
    });
    const task = Promise.race([work,canceled]);
    state.pending.add(task);
    try {return await task;}
    finally {state.pending.delete(task);state.tickets.delete(ticket);}
  }
  cancel(owner) {
    this.closedOwners.add(owner);
    for (const ticket of this.owners.get(owner)?.tickets ?? []) if (!ticket.started) ticket.cancel();
  }
  async cleanup(owner) {
    this.cancel(owner);
    const state = this.owners.get(owner);
    if (!state) return;
    await Promise.allSettled([...state.pending]);
    const endpoint = this.endpoint();
    for (const [key,bridge] of state.bridges) {
      if (bridge.targetId) {
        const version = await this.json(endpoint,"/json/version");
        await this.connect(version.webSocketDebuggerUrl,async send => {
          const contexts = await send("Target.getBrowserContexts");
          const shared = [...this.owners.values()].some(state=>[...state.bridges.values()].some(other=>other !== bridge && other.origin === bridge.origin && other.context.browserContextId === bridge.context.browserContextId));
          if (!shared && bridge.origin && (!bridge.context.browserContextId || contexts.browserContextIds.includes(bridge.context.browserContextId))) await send("Browser.setPermission",{permission:{name:"clipboard-read",allowWithoutSanitization:true},setting:"prompt",origin:bridge.origin,...bridge.context});
          const target = (await send("Target.getTargets")).targetInfos.find(target=>target.targetId===bridge.targetId);
          if (target && !(await send("Target.closeTarget",{targetId:bridge.targetId})).success) throw new Error("Browser refused clipboard control tab cleanup");
        });
      }
      this.tokens.delete(bridge.path);
      controls.get(endpoint)?.delete(bridge.targetId);
      if (controls.get(endpoint)?.size === 0) controls.delete(endpoint);
      state.bridges.delete(key);
    }
    this.owners.delete(owner);
    if (!this.owners.size && this.server) {
      this.server.closeAllConnections();
      if (this.server.listening) await new Promise((resolve,reject)=>this.server.close(error=>error ? reject(error) : resolve()));
      this.server = undefined;
      this.serverReady = undefined;
    }
  }
}
