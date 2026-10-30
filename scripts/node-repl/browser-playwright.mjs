import {validateDrop, dropFrames} from "./browser-drop.mjs";
import { isAbsolute } from "node:path";

export const PLAYWRIGHT_VERSION = "1.64.1";
const eventBarriers = new Map();
export async function waitForBrowserEventReady(endpoint, targetId) {
  for (const event of ["filechooser","download"]) await eventBarriers.get(`${endpoint}|${targetId}|${event}`)?.ready;
}

export function createPlaywrightApi(endpoint, targetId, invalidate, focusLease, downloadRequest, withAction, checkDialog, dropRequest) {
  const recipes = new WeakMap();
  const selectors = ["locator", "getByRole", "getByText", "getByLabel", "getByPlaceholder", "getByTestId", "getByTitle", "getByAltText", "frameLocator"];
  const chains = [...selectors, "filter", "nth", "first", "last", "and", "or"];
  const reads = ["count", "innerText", "textContent", "allTextContents", "getAttribute", "inputValue", "isVisible", "isEnabled", "isChecked", "waitFor", "ariaSnapshot"];
  const actions = ["click", "dblclick", "fill", "press", "check", "uncheck", "setChecked", "selectOption", "hover", "scrollIntoViewIfNeeded", "pressSequentially", "type", "drop"];
  async function invoke(path, method, args) {
    if (checkDialog) await checkDialog();
    if (withAction && actions.includes(method)) return withAction(opened => perform(path,method,args,opened));
    return perform(path,method,args);
  }
  async function perform(path, method, args, dialogOpened) {
    const {chromium} = await import("playwright-core");
    const browser = await chromium.connectOverCDP(endpoint(), {timeout:10_000, noDefaults:true});
    for (const context of browser.contexts()) context.on("dialog", () => {});
    let focusSession, emulatedFocus = false, lease, retained = false, intercepting = false, closing;
    const cleanup = () => closing ??= (async () => {
      try {
        if (intercepting) await focusSession.send("Page.setInterceptFileChooserDialog", {enabled:false});
      } finally {
        try {
          if (lease !== undefined) await focusLease({action:"release", lease});
          else if (emulatedFocus) await focusSession.send("Emulation.setFocusEmulationEnabled", {enabled:false});
        } finally {
          try { if (focusSession) await focusSession.detach(); }
          finally { await browser.close(); }
        }
      }
    })();
    try {
      const selected = await findBrowserPage(browser,targetId);
      const page = selected.page;
      focusSession = selected.session;
      page.setDefaultTimeout(10_000);
      const convert = value => {
        if (value && recipes.has(value)) return resolve(recipes.get(value));
        if (Array.isArray(value)) return value.map(convert);
        if (value && Object.prototype.toString.call(value) === "[object Object]") return Object.fromEntries(Object.entries(value).map(([key,item]) => [key === "timeoutMs" ? "timeout" : key, convert(item)]));
        return value;
      };
      const resolve = steps => {
        let locator = page;
        for (const step of steps) locator = locator[step.method](...step.args.map(convert));
        return locator;
      };
      const locator = resolve(path);
      if (actions.includes(method)) {
        await waitForBrowserEventReady(endpoint(), targetId);
        // Background CDP tabs need virtual focus for Playwright's frame-based stability check.
        if (focusLease) lease = await focusLease({action:"acquire", targetId});
        else {
          await focusSession.send("Emulation.setFocusEmulationEnabled", {enabled:true});
          emulatedFocus = true;
        }
        invalidate();
      }
      try {
        if (method === "drop") {
          if (!dropRequest) throw new Error("Native drop backend unavailable");
          const [payload,options] = args;
          const id = await dropRequest({action:"acquire",targetId,payload});
          let timer;
          const timeout = options.timeoutMs ?? 10_000;
          const work = (async () => {
            for (const type of ["dragEnter","dragOver","drop"]) {
              const geometry = await nativeDropPoint(locator,page,focusSession,options,dropRequest);
              await dropRequest({action:"stage",id,type,...geometry});
            }
          })();
          work.catch(()=>{});
          const expired = new Promise((_,reject)=>{if (timeout) timer=setTimeout(()=>reject(new Error(`Native drop timeout after ${timeout} ms`)),timeout);});
          dialogOpened?.then(result=>{if(result.opened) clearTimeout(timer);}).catch(()=>{});
          try {await Promise.race([work,expired]);}
          finally {clearTimeout(timer);await dropRequest({action:"release",id});}
          return;
        }
        if (method === "filechooser") {
          const [options, ready, done] = args;
          const waiting = page.waitForEvent("filechooser", {timeout:options.timeoutMs ?? 10_000});
          waiting.catch(() => {});
          intercepting = true;
          await focusSession.send("Page.setInterceptFileChooserDialog", {enabled:true});
          ready();
          const chooser = await waiting;
          const multiple = chooser.isMultiple();
          let consumed = false;
          retained = true;
          return Object.freeze({
            isMultiple() { return multiple; },
            async setFiles(files, fileOptions = {}) {
              if (consumed) throw new Error("File chooser already consumed");
              const paths = typeof files === "string" ? [files] : files;
              if (!Array.isArray(paths) || paths.some(file => typeof file !== "string" || !isAbsolute(file))) throw new Error("setFiles requires absolute file paths");
              if (!multiple && paths.length > 1) throw new Error("File chooser accepts only one file");
              validateWaitOptions(fileOptions, ["timeoutMs"]);
              const select = async () => {
                await waitForBrowserEventReady(endpoint(),targetId);
                consumed = true;
                invalidate();
                try { await chooser.setFiles(paths, {timeout:fileOptions.timeoutMs ?? 10_000}); }
                finally { try { await cleanup(); } finally { done(); } }
              };
              return withAction ? withAction(select) : select();
            },
          });
        }
        if (method === "expectNavigation") {
          const [action, options] = args;
          const timeout = options.timeoutMs ?? 10_000;
          const deadline = Date.now() + timeout;
          const remaining = () => timeout === 0 ? 0 : Math.max(1, deadline - Date.now());
          const navigation = page.waitForEvent("framenavigated", {predicate:frame => frame === page.mainFrame(), timeout});
          // Action failure closes the watcher connection; consume its rejection too.
          navigation.catch(() => {});
          try {
            const value = await action();
            await navigation;
            if (options.url !== undefined) await page.waitForURL(options.url, {waitUntil:options.waitUntil ?? "load", timeout:remaining()});
            else await page.waitForLoadState(options.waitUntil ?? "load", {timeout:remaining()});
            return value;
          } finally { invalidate(); }
        }
        if (method === "waitForLoadState") {
          const options = args[0];
          return await page.waitForLoadState(options.state ?? "load", {timeout:options.timeoutMs ?? 10_000});
        }
        if (method === "domSnapshot") {
          const snapshots = [];
          for (const frame of page.frames()) snapshots.push(`${frame === page.mainFrame() ? "Page" : "Frame"}: ${frame.url()}\n${await frame.locator("body").ariaSnapshot()}`);
          return snapshots.join("\n\n");
        }
        return await locator[method](...args.map(convert));
      }
      finally { if (actions.includes(method)) invalidate(); }
    } finally {
      // Event handles keep the attached connection until their one-shot operation finishes.
      if (!retained) await cleanup();
    }
  }

  function binding(path = []) {
    const api = {};
    for (const method of path.length ? chains : selectors) {
      api[method] = (...args) => binding([...path, {method, args}]);
    }
    if (!path.length) {
      api.domSnapshot = () => invoke([], "domSnapshot", []);
      api.waitForEvent = (event, options = {}) => {
        if (!["filechooser","download"].includes(event)) throw new Error(`Unsupported browser event: ${event}`);
        if (event === "download" && !downloadRequest) throw new Error("Download backend is unavailable");
        validateWaitOptions(options, ["timeoutMs"]);
        const key = `${endpoint()}|${targetId}|${event}`;
        if (eventBarriers.has(key)) throw new Error("A browser event is already pending for this tab");
        let resolve, reject;
        const ready = new Promise((yes,no) => {resolve=yes;reject=no;});
        ready.catch(() => {});
        const entry = {ready};
        eventBarriers.set(key,entry);
        const done = () => {if(eventBarriers.get(key) === entry) eventBarriers.delete(key);};
        const waiting = event === "filechooser" ? invoke([], "filechooser", [{...options}, resolve, done]) : (async()=>{
          const id = await downloadRequest({action:"start",targetId,options:{...options}});
          resolve();
          await downloadRequest({action:"wait",id});
          done();
          return Object.freeze({async path(pathOptions = {}) {
            validateWaitOptions(pathOptions,["timeoutMs"]);
            try {return await downloadRequest({action:"path",id,options:{...pathOptions}});}
            finally {done();}
          }});
        })();
        const pending = waiting.catch(error => {reject(error);done();throw error;});
        pending.catch(() => {});
        return pending;
      };
      api.expectNavigation = (action, options = {}) => {
        if (typeof action !== "function") throw new Error("expectNavigation requires an action callback");
        validateWaitOptions(options, ["timeoutMs", "url", "waitUntil"]);
        return invoke([], "expectNavigation", [action, {...options}]);
      };
      api.waitForURL = (url, options = {}) => {
        if (typeof url !== "string") throw new Error("waitForURL requires a URL or glob string");
        validateWaitOptions(options, ["timeoutMs", "waitUntil"]);
        return invoke([], "waitForURL", [url, {timeoutMs:10_000, ...options}]);
      };
      api.waitForLoadState = (options = {}) => {
        validateWaitOptions(options, ["timeoutMs", "state"]);
        return invoke([], "waitForLoadState", [{...options}]);
      };
    }
    if (path.length) api.all = async () => Array.from({length:await invoke(path, "count", [])}, (_,index) => binding([...path, {method:"nth",args:[index]}]));
    if (path.length) for (const method of [...reads, ...actions]) {
      api[method] = (...args) => invoke(path, method, args);
    }
    if (path.length) api.drop = (payload,options = {}) => {
      validateDrop(payload,options);
      return invoke(path,"drop",[payload,{...options}]);
    };
    recipes.set(api, path);
    return Object.freeze(api);
  }
  return binding();
}


async function nativeDropPoint(locator,page,session,options,request) {
  const handle = await locator.elementHandle({timeout:0});
  if (!handle) throw new Error("Drop target missing");
  try {
    await handle.hover({trial:true,timeout:0});
    const box = await handle.boundingBox();
    if (!box) throw new Error("Drop target has no visible bounds");
    const viewport = (await session.send("Page.getLayoutMetrics")).cssVisualViewport;
    const border = await handle.evaluate(el=>({x:parseFloat(getComputedStyle(el).borderLeftWidth)||0,y:parseFloat(getComputedStyle(el).borderTopWidth)||0}));
    let left=Math.max(0,box.x), top=Math.max(0,box.y), right=Math.min(viewport.clientWidth,box.x+box.width), bottom=Math.min(viewport.clientHeight,box.y+box.height);
    const frame = await handle.ownerFrame();
    for (let current=frame;current?.parentFrame();current=current.parentFrame()) {
      const element = await current.frameElement();
      try {
        const bounds = await element.boundingBox();
        if (!bounds) throw new Error("Drop frame invisible");
        left=Math.max(left,bounds.x);top=Math.max(top,bounds.y);right=Math.min(right,bounds.x+bounds.width);bottom=Math.min(bottom,bounds.y+bounds.height);
      } finally {await element.dispose();}
    }
    const point = options.position ? {x:Math.round(box.x+border.x+options.position.x),y:Math.round(box.y+border.y+options.position.y)} : {x:Math.floor((left+right)/2),y:Math.floor((top+bottom)/2)};
    if (point.x<left || point.x>=right || point.y<top || point.y>=bottom) throw new Error("Drop point outside visible target");
    await handle.hover({trial:true,timeout:0,position:{x:point.x-box.x-border.x,y:point.y-box.y-border.y}});
    const after = await handle.boundingBox();
    if (!after || ["x","y","width","height"].some(key=>Math.abs(after[key]-box[key])>.25)) throw new Error("Drop target moved; resolve again");
    const frames = dropFrames((await session.send("Page.getFrameTree")).frameTree);
    const frameTargets=[];
    let nearest;
    for(let current=frame;current && current!==page.mainFrame();current=current.parentFrame()) {
      let child;
      try {child=await page.context().newCDPSession(current);}
      catch(error) {
        if(!error.message.includes("does not have a separate CDP session")) throw error;
        continue;
      }
      try {
        const tree=dropFrames((await child.send("Page.getFrameTree")).frameTree);
        const {targetInfo}=await child.send("Target.getTargetInfo");
        nearest ??= tree[0].id;
        frameTargets.push({frameId:tree[0].id,targetId:targetInfo.targetId});
        for(const item of tree) if(!frames.some(existing=>existing.id===item.id)) frames.push(item);
      } finally {await child.detach();}
    }
    nearest ??= frames[0].id;
    const framePath=[];
    for(let current=frame;current;current=current.parentFrame()) framePath.unshift(current.url());
    const matching = frames.filter(item=>{
      const path=[], ids=[];
      for(let current=item;current;current=frames.find(parent=>parent.id===current.parentId)) {path.unshift(current.url);ids.push(current.id);}
      return ids.includes(nearest) && JSON.stringify(path)===JSON.stringify(framePath);
    });
    // shortcut: identical same-process sibling URLs need an additional native owner binding.
    if(matching.length!==1) throw new Error("Native drop frame path is ambiguous or changed");
    return {point,frames,framePath,frameTargets,frameId:matching[0].id,geometry:{loaderId:frames[0].loaderId,viewport,revision:await request({action:"revision"})}};
  } finally {await handle.dispose();}
}


export class BrowserFocusLeases {
  constructor(updateFocus) {
    this.updateFocus = updateFocus;
    this.entries = new Map();
    this.nextId = 1;
  }
  async acquire(owner, targetId) {
    if (typeof targetId !== "string" || !targetId) throw new Error("Invalid browser focus target");
    if ([...this.entries.values()].some(entry => entry.targetId === targetId)) throw new Error("Browser target already has an active input lease");
    const id = this.nextId++;
    const entry = {owner, targetId};
    this.entries.set(id, entry);
    entry.ready = Promise.resolve().then(() => this.updateFocus(targetId, true));
    try { await entry.ready; return id; }
    catch (error) { await this.release(owner, id); throw error; }
  }
  async release(owner, id) {
    const entry = this.entries.get(id);
    if (!entry || entry.owner !== owner) throw new Error("Unknown browser focus lease");
    if (!entry.releasing) entry.releasing = (async () => {
      await entry.ready.catch(() => {});
      await this.updateFocus(entry.targetId, false);
      this.entries.delete(id);
    })().catch(error => {
      entry.releasing = undefined;
      error = error instanceof Error ? error : new Error(String(error));
      error.browserCleanupFailed = true;
      throw error;
    });
    return entry.releasing;
  }
  async cleanup(owner) {
    const results = await Promise.allSettled([...this.entries].filter(([,entry]) => entry.owner === owner).map(([id]) => this.release(owner, id)));
    const failure = results.find(result => result.status === "rejected");
    if (failure) throw failure.reason;
  }
}


function validateWaitOptions(options, allowed) {
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new Error("Navigation wait expects an options object");
  for (const key of Object.keys(options)) if (!allowed.includes(key)) throw new Error(`Unsupported navigation wait option: ${key}`);
  if (options.timeoutMs !== undefined && (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 0)) throw new Error("timeoutMs must be non-negative and finite");
  const loadStates = ["load", "domcontentloaded", "networkidle"];
  if (options.state !== undefined && !loadStates.includes(options.state)) throw new Error("Invalid navigation state");
  const waitStates = allowed.includes("url") ? loadStates : [...loadStates, "commit"];
  if (options.waitUntil !== undefined && !waitStates.includes(options.waitUntil)) throw new Error("Invalid navigation waitUntil");
  if (options.url !== undefined && typeof options.url !== "string") throw new Error("Navigation URL must be a string");
}


export async function findBrowserPage(browser,targetId) {
  for(const context of browser.contexts()) for(const page of context.pages()) {
    const session = await context.newCDPSession(page);
    let selected = false;
    try {
      const {targetInfo} = await session.send("Target.getTargetInfo");
      if(targetInfo.targetId === targetId) {selected=true;return {page,session};}
    } finally {if(!selected) await session.detach();}
  }
  throw new Error("Tab closed or no longer available");
}
