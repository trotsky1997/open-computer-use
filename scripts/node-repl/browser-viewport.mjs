const leases = new Map();
const revisions = new Map();

export function validateViewport(options) {
  if (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).some(key=>!["width","height"].includes(key))) throw new Error("viewport.set expects width and height");
  for (const key of ["width","height"]) if (!Number.isInteger(options[key]) || options[key] < 1 || options[key] > 10_000) throw new Error(`Viewport ${key} must be an integer from 1 to 10000`);
}

export const VIEWPORT_DOCUMENTATION = `Browser viewport override control.
Use set({width,height}) for an explicit responsive-size task. Dimensions are CSS pixels;
only size is overridden, with desktop layout and the browser's native device pixel ratio.
The override covers existing user tabs and new tabs observed while the session owns it.
Call reset() to clear the override and return to normal browser sizing. Temporary overrides
also clear on JS reset, timeout or close. One session may own a browser's override at a time.
Read a fresh screenshot after resizing. Width/height must be integers from 1 to 10000.
Native window bounds are untouched. Existing external-client emulation is not reconstructed.`;

export class BrowserViewport {
  constructor(endpoint, open, connect, hiddenTargets = () => [], onFailure = () => {}) {
    this.endpoint = endpoint;
    this.open = open;
    this.connect = connect;
    this.hiddenTargets = hiddenTargets;
    this.onFailure = onFailure;
    this.closedOwners = new WeakSet();
    this.leases = leases;
  }
  async json(endpoint,route) {
    const response = await fetch(new URL(route,endpoint),{signal:AbortSignal.timeout(10_000),redirect:"error"});
    if (!response.ok) throw new Error(`Viewport browser discovery failed: HTTP ${response.status}`);
    return response.json();
  }
  bump(endpoint) {revisions.set(endpoint,(revisions.get(endpoint) ?? 0)+1);}
  queue(lease, operation) {
    const pending = lease.queue.then(async () => {
      if (lease.closing || this.closedOwners.has(lease.owner)) throw new Error("Viewport session closed");
      return operation();
    });
    lease.queue = pending;
    pending.catch(()=>{});
    return pending;
  }
  async apply(lease, targetId) {
    if ((await this.hiddenTargets()).includes(targetId)) return;
    const targets = await this.json(lease.endpoint,"/json/list");
    const target = targets.find(target=>target.type === "page" && target.id === targetId);
    if (!target) return;
    const hidden=await this.hiddenTargets();if(hidden.includes(targetId)||hidden.includes(target.url))return;
    if (lease.closing || this.closedOwners.has(lease.owner)) throw new Error("Viewport session closed");
    let record = lease.targets.get(targetId);
    if (!record) lease.targets.set(targetId,record={});
    try {
      record.connection ??= await this.open(target.webSocketDebuggerUrl);
      await record.connection.send("Emulation.setDeviceMetricsOverride",{...lease.size,deviceScaleFactor:0,mobile:false});
      await record.connection.send("Page.captureScreenshot",{format:"jpeg",quality:1,captureBeyondViewport:false});
    } catch (error) {
      if (!(await this.json(lease.endpoint,"/json/list")).some(target=>target.id===targetId)) {lease.targets.delete(targetId);return;}
      throw error;
    }
  }
  async request(owner,args) {
    const endpoint = this.endpoint();
    if (args?.action === "state") return revisions.get(endpoint) ?? 0;
    if (!endpoint) throw new Error("No CDP browser configured");
    if (args?.action === "capabilities") {
      const protocol = await this.json(endpoint,"/json/protocol");
      const required = {Emulation:["setDeviceMetricsOverride","clearDeviceMetricsOverride"],Page:["captureScreenshot"],Target:["setDiscoverTargets"]};
      const available = Object.entries(required).every(([domain,names])=>names.every(name=>protocol.domains?.find(item=>item.domain===domain)?.commands?.some(command=>command.name===name)));
      return available ? [{id:"viewport",description:"Override browser viewport size for responsive testing"}] : [];
    }
    if (args?.action === "reset") return this.reset(owner);
    let lease = leases.get(endpoint);
    if (args?.action === "capture") {
      if (!lease) return null;
      return lease.manager.queue(lease,async () => {
        if (!lease.targets.has(args.targetId)) await lease.manager.apply(lease,args.targetId);
        const record = lease.targets.get(args.targetId);
        if (!record) throw new Error("Screenshot tab closed");
        return record.connection.send("Page.captureScreenshot",args.params);
      });
    }
    if (args?.action === "sync") {
      if (!lease) return;
      if (lease.closing) {
        if (lease.resetting) await lease.resetting;
        else throw new Error("Viewport cleanup in progress");
        return;
      }
      await lease.queue;
      if (args.targetId && !lease.targets.has(args.targetId)) await lease.manager.queue(lease,()=>lease.manager.apply(lease,args.targetId));
      return;
    }
    if (args?.action !== "set") throw new Error("Unknown viewport action");
    validateViewport(args.options);
    if (this.closedOwners.has(owner)) throw new Error("Viewport session closed");
    if (lease && lease.owner !== owner) throw new Error("Another session owns this browser viewport override");
    if (lease?.closing) throw new Error("Viewport cleanup must finish before setting its size");
    if (!lease) {
      lease = {endpoint,owner,manager:this,queue:Promise.resolve(),targets:new Map(),closing:false};
      leases.set(endpoint,lease);
    }
    const size = {...args.options};
    try {
      await this.queue(lease,async () => {
        if (!lease.connection) {
          const version = await this.json(endpoint,"/json/version");
          lease.connection = await this.open(version.webSocketDebuggerUrl,event => {
            const target = event.params?.targetInfo;
            if (!lease.closing && event.method === "Target.targetCreated" && target?.type === "page") {
              const applying = this.queue(lease,async () => {if (!lease.targets.has(target.targetId)) await this.apply(lease,target.targetId);});
              applying.catch(error=>{if(!lease.closing)this.onFailure(owner,error);});
            }
          }, () => {if(!lease.closing)this.onFailure(owner,new Error("Viewport observer disconnected"));});
          if (lease.closing) throw new Error("Viewport session closed");
          await lease.connection.send("Target.setDiscoverTargets",{discover:true});
        }
        lease.size = size;
        this.bump(endpoint);
        const targets = await this.json(endpoint,"/json/list");
        for (const target of targets) if (target.type === "page") await this.apply(lease,target.id);
      });
    } catch (error) {
      try {await this.reset(owner);}
      catch (cleanupError) {cleanupError.browserCleanupFailed=true;throw cleanupError;}
      throw error;
    }
  }
  reset(owner) {
    const endpoint = this.endpoint();
    const lease = leases.get(endpoint);
    if (!lease) return Promise.resolve();
    if (lease.owner !== owner) return Promise.reject(new Error("Another session owns this browser viewport override"));
    if (lease.resetting) return lease.resetting;
    lease.closing = true;
    this.bump(endpoint);
    lease.resetting = (async () => {
      await lease.queue.catch(()=>{});
      const targets = lease.targets.size ? await this.json(endpoint,"/json/list") : [];
      for (const [targetId,record] of lease.targets) {
        const target = targets.find(target=>target.id===targetId);
        if (target) {
          const clear = async send => {
            await send("Emulation.clearDeviceMetricsOverride");
            // A rendered frame commits the default size before another agent observes it.
            await send("Page.captureScreenshot",{format:"jpeg",quality:1,captureBeyondViewport:false});
          };
          try {
            if (record.connection) await clear(record.connection.send);
            else await this.connect(target.webSocketDebuggerUrl,clear);
          } catch (error) {
            if ((await this.json(endpoint,"/json/list")).some(target=>target.id===targetId)) await this.connect(target.webSocketDebuggerUrl,clear);
          }
        }
        record.connection?.close();
        lease.targets.delete(targetId);
      }
      lease.connection?.close();
      if (leases.get(endpoint) === lease) leases.delete(endpoint);
    })().catch(error=>{lease.resetting=undefined;error.browserCleanupFailed=true;throw error;});
    return lease.resetting;
  }
  cancel(owner) {
    this.closedOwners.add(owner);
    for (const lease of leases.values()) if (lease.owner === owner) lease.closing=true;
  }
  async cleanup(owner) {this.cancel(owner);const lease=leases.get(this.endpoint());if(lease?.owner===owner)await this.reset(owner);}
}
