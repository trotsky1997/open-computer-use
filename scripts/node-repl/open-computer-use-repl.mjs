#!/usr/bin/env node
import {browserRuntime} from './browser-runtime.mjs';
import {BrowserWebMcp} from './browser-webmcp.mjs';
import {BrowserContent} from "./browser-content.mjs";
import {BrowserChrome} from "./browser-chrome.mjs";
import {BrowserEvaluator} from "./browser-evaluate.mjs";
import {BrowserAssets} from "./browser-assets.mjs";
import {BrowserDebugger} from "./browser-debugger.mjs";
import {BrowserTabs} from "./browser-tabs.mjs";
import { BrowserDownloads } from "./browser-downloads.mjs";
import { BrowserClipboard } from "./browser-clipboard.mjs";
import {BrowserInputs} from "./browser-input.mjs";
import {BrowserDrops} from "./browser-drop.mjs";
import { BrowserViewport } from "./browser-viewport.mjs";

import { AsyncLocalStorage } from "node:async_hooks";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { BrowserFocusLeases } from "./browser-playwright.mjs";
import { BrowserConsoleLogs, BrowserDialogs, browserEndpoint, openConnection, withConnection, createBrowserApi, updateBrowserFocus } from "./browser-cdp.mjs";
import { inspectConfig } from "./ocu-config.mjs";

const require = createRequire(import.meta.url);
// The js call whose code is running. Timers and promises carry it, so a callback
// scheduled by a finished call still names that call, not the one running now.
const evaluationOwner = new AsyncLocalStorage();
const repl = require("node:repl");
const { PassThrough } = require("node:stream");

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 300_000;
const MAX_FRAME_BYTES = 32 * 1024 * 1024;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const BROWSER_FAILURE_HANDLERS = new WeakMap();
const HOST_BROWSER_DOWNLOADS = new BrowserDownloads(undefined,(owner,error)=>BROWSER_FAILURE_HANDLERS.get(owner)?.(error),openConnection);
const HOST_BROWSER_FOCUS = new BrowserFocusLeases(updateBrowserFocus);
const HOST_BROWSER_LOGS = new BrowserConsoleLogs();
const HOST_BROWSER_DIALOGS = new BrowserDialogs();
const HOST_BROWSER_CLIPBOARD = new BrowserClipboard(() => browserEndpoint(process.env)?.href,withConnection,(owner,args,prepare)=>args.action==='paste'?HOST_BROWSER_INPUTS.paste(owner,args,prepare):HOST_BROWSER_INPUTS.request(owner,args),browserIdentity,openConnection);
const HOST_BROWSER_CHROME=new BrowserChrome(()=>browserEndpoint(process.env)?.href,openConnection);
const HOST_BROWSER_VIEWPORT = new BrowserViewport(() => browserEndpoint(process.env)?.href,openConnection,withConnection,()=>{const hidden=HOST_BROWSER_CHROME.hidden();return [...HOST_BROWSER_CLIPBOARD.internalTargets(),...hidden.ids,...hidden.urls];},(owner,error)=>BROWSER_FAILURE_HANDLERS.get(owner)?.(error));
const HOST_BROWSER_DROPS = new BrowserDrops(() => browserEndpoint(process.env)?.href,openConnection,withConnection,()=>HOST_BROWSER_VIEWPORT.request(null,{action:"state"}));
const HOST_BROWSER_TABS = new BrowserTabs(()=>browserEndpoint(process.env)?.href,openConnection);
async function browserIdentity(endpoint,socket) {
  const managed=browserRuntime.current;
  if(managed?.headless===false&&!managed.closing&&managed.endpoint===endpoint&&managed.socket===socket&&managed.proof&&!managed.proof.browserGone())return {...managed.proof,systemClipboard:true};
  const browser=HOST_BROWSER_DIALOGS.browsers.get(endpoint);
  return browser && (!socket || browser.browserId===new URL(socket).pathname) ? browser.exitProof : undefined;
}
const HOST_BROWSER_INPUTS = new BrowserInputs(()=>browserEndpoint(process.env)?.href,openConnection,()=>HOST_BROWSER_VIEWPORT.request(null,{action:"state"}),HOST_BROWSER_FOCUS,(owner,targetId)=>HOST_BROWSER_DIALOGS.request(owner,{action:"state",targetId}),()=>HOST_BROWSER_CLIPBOARD.assertSettled(),browserIdentity);

const HOST_BROWSER_CDP=new BrowserDebugger(()=>browserEndpoint(process.env)?.href,openConnection);
const HOST_BROWSER_WEBMCP=new BrowserWebMcp(()=>browserEndpoint(process.env)?.href,openConnection);
const HOST_BROWSER_CONTENT=new BrowserContent(()=>browserEndpoint(process.env)?.href);
const HOST_BROWSER_ASSETS=new BrowserAssets(()=>browserEndpoint(process.env)?.href);
const HOST_BROWSER_EVALUATOR=new BrowserEvaluator(()=>browserEndpoint(process.env)?.href);
const HOST_BROWSER_SERVICES={browserRuntime,browserWebMcp:HOST_BROWSER_WEBMCP,browserContent:HOST_BROWSER_CONTENT,browserChrome:HOST_BROWSER_CHROME,browserEvaluator:HOST_BROWSER_EVALUATOR,browserAssets:HOST_BROWSER_ASSETS,browserCdp:HOST_BROWSER_CDP,browserTabs:HOST_BROWSER_TABS,browserFocusLeases:HOST_BROWSER_FOCUS,browserDownloads:HOST_BROWSER_DOWNLOADS,browserLogs:HOST_BROWSER_LOGS,browserDialogs:HOST_BROWSER_DIALOGS,browserClipboard:HOST_BROWSER_CLIPBOARD,browserViewport:HOST_BROWSER_VIEWPORT,browserDrops:HOST_BROWSER_DROPS,browserInputs:HOST_BROWSER_INPUTS};

async function hostRequest(services,owner,tabOwner,method,params,timeoutMs) {
  let result;
  if(method.startsWith('browser/')&&method!=='browser/tabs'&&typeof params?.targetId==='string'&&!['stop','end','cancel','release'].includes(params.action))await services.browserTabs.request(tabOwner,{action:'claim',targetId:params.targetId});
  if (method === "browser/runtime") {
    result=await services.browserRuntime.request(params);
  } else if (method === "browser/focus") {
    if (params?.action === "acquire") result = await services.browserFocusLeases.acquire(owner, params.targetId);
    else if (params?.action === "release") result = await services.browserFocusLeases.release(owner, params.lease);
    else throw new Error("Unknown browser focus action");
  } else if(method === "browser/download") {
    const args = params;
    if(args?.action === "start") result = await services.browserDownloads.start(owner,args.targetId,args.options);
    else if(args?.action === "wait") result = await services.browserDownloads.wait(owner,args.id);
    else if(args?.action === "path") result = await services.browserDownloads.path(owner,args.id,args.options);
    else throw new Error("Unknown download action");
  } else if(method === "browser/logs") {
    const args = params;
    if(args?.action === "start") result = await services.browserLogs.start(owner,args.targetId);
    else if(args?.action === "read") result = await services.browserLogs.read(owner,args.targetId,args.options);
    else if(args?.action === "stop") result = services.browserLogs.stop(owner,args.targetId);
    else throw new Error("Unknown browser logs action");
  } else if(method === "browser/dialog") {
    const args=params;
    if(args?.targetId && !['start','stop'].includes(args.action)) {
      const entry=services.browserDialogs.targets.get(`${services.browserDialogs.endpoint()}|${args.targetId}`);
      if(!entry?.owners.has(owner)) await services.browserDialogs.start(owner,args.targetId);
    }
    result=await services.browserDialogs.request(owner,args);
  }
  else if(method === "browser/webmcp") result=await services.browserWebMcp.request(owner,params);
  else if(method === "browser/chrome") result=await services.browserChrome.request(owner,params);
  else if(method === "browser/evaluate") result=await services.browserEvaluator.request(owner,params);
  else if(method === "browser/content") result=await services.browserContent.request(owner,params);
  else if(method === "browser/assets") result=await services.browserAssets.request(owner,params);
  else if(method === "browser/cdp") result=await services.browserCdp.request(owner,params);
  else if(method === "browser/clipboard") result = await services.browserClipboard.request(owner,params);
  else if(method === "browser/tabs") result=await services.browserTabs.request(tabOwner,params);
  else if(method === "browser/input") result = await services.browserInputs.request(owner,params);
  else if(method === "browser/drop") result = await services.browserDrops.request(owner,params);
  else if(method === "browser/viewport") result = await services.browserViewport.request(owner,params);
  else result = await services.native.request(method, params, timeoutMs);
  return result;
}

async function releaseResources(services,owner,stopped=Promise.resolve()) {
  services.browserWebMcp.cancel(owner);
  services.browserContent.cancel(owner);
  services.browserChrome.cancel(owner);
  services.browserEvaluator.cancel(owner);
  services.browserAssets.cancel(owner);
  services.browserCdp.cancel(owner);
  services.browserClipboard.cancel(owner);services.browserViewport.cancel(owner);
  services.browserDrops.cancel(owner);services.browserInputs.cancel(owner);
  const nativeStopped=Promise.resolve(services.native.endSession?.());nativeStopped.catch(()=>{});
  await stopped;await nativeStopped;
  await services.browserDialogs.cleanup(owner);
  await services.browserDrops.cleanup(owner);await services.browserInputs.cleanup(owner);
  const cleaned=await Promise.allSettled([services.browserWebMcp.cleanup(owner),services.browserContent.cleanup(owner),services.browserChrome.cleanup(owner),services.browserEvaluator.cleanup(owner),services.browserAssets.cleanup(owner),services.browserCdp.cleanup(owner),services.browserFocusLeases.cleanup(owner),services.browserDownloads.cleanup(owner),services.browserLogs.cleanup(owner),services.browserClipboard.cleanup(owner),services.browserViewport.cleanup(owner)]);
  const failed=cleaned.find(result=>result.status==='rejected');if(failed) throw failed.reason;
  BROWSER_FAILURE_HANDLERS.delete(owner);
}

const SERVER_INSTRUCTIONS = `UI automation through a persistent JavaScript REPL using the initialized cua API.

On the first call after startup or js_reset, bind the requested running app with await cua.getApp("Example App"), or call await cua.getState() only when an app inventory is actually needed. For explicitly requested Linux/Windows application startup, use await cua.computer.launch_app({app: executableNameOrPath}) (Linux also accepts installed desktop IDs/exact display names) and then bind/observe the app before input. macOS getApp keeps its existing launch behavior. On Linux, prefer a fresh listWindows() and getApp({windowId}) when selecting a particular native window. On macOS, use getApp(name, { initialState: false }) followed by app.query({ text, role }) for targeted lookup without an initial snapshot. App bindings persist across js calls. Batch deterministic actions and the resulting getAXState() in one js call, then verify the returned UI state. Use nodeRepl.write(value) for additional text and await nodeRepl.emitImage(image) for additional images. Ask the user before destructive or externally visible actions such as sending, deleting, or purchasing.`;

const JS_DESCRIPTION = `Run JavaScript in a persistent Node.js REPL with top-level await and an initialized asynchronous cua API for Open Computer Use. Use this for all desktop interactions. Bind an app with let app = await cua.getApp("Example App"); then call await app.click(...), await app.typeText(...), and await app.getAXState(). Top-level bindings persist until js_reset, so prefer top-level var for names that may be assigned again. Batch deterministic actions and the resulting state read in one call to reduce round trips. Use nodeRepl.write(value) for extra text and await nodeRepl.emitImage(image) for extra images. If timeout_ms is omitted, execution times out after 30000 ms.`;

const RESET_DESCRIPTION = `Reset the persistent Open Computer Use JavaScript session and discard all bindings created by prior js calls. The next js call starts with a freshly initialized cua API. This does not close native apps or erase their state.`;

const COMPUTER_USE_GUIDANCE = `## Open Computer Use JavaScript API

The runtime exposes an asynchronous app-bound API:

- \`await cua.getState({ emit? })\`: list apps and configured browsers with tabs; inventory failures are reported in errors.
- \`cua.computer.target\`: local executor platform (mac, linux or windows). Linux/Windows expose \`await cua.computer.launch_app({app})\` for one literal executable name/path; Linux also accepts installed desktop IDs (.desktop) and exact display names, with ambiguous names rejected. No caller command-line arguments or shell expansion. A successful start persists after reset/turn end; use getApp and observe readiness before acting. macOS launches through getApp.
- \`await cua.listApps({ emit? })\`: list current apps.
- CDP browser: configure OPEN_COMPUTER_USE_CDP_URL or an absolute OPEN_COMPUTER_USE_BROWSER_EXECUTABLE for host-owned Chromium (macOS/Linux; headless by default, OPEN_COMPUTER_USE_BROWSER_MODE=headful enables managed window visibility), then use cua.listBrowsers(), cua.listTabs(), cua.getBrowser({id:"cdp"}), cua.getTab(id or {url}), and cua.createBrowserTab("cdp", url). Binding a tab emits provider documentation and initial AX state.
- \`await cua.listWindows({ emit? })\`: Linux native window metadata with opaque numeric IDs. \`await cua.getApp({windowId}, {initialState?})\` binds exact AT-SPI window identity for AX and semantic actions; close/replacement invalidates it. Window images use verified XComposite backing pixmaps on local composited X11, including mapped background/occluded frames, alpha and native bounding-shape transparency; without a compositor, they require an active fully exposed frame. Coordinate/index fallback clicks, within-window drag, held clicks/keys and wheel input require a verified focused, fully exposed X11 frame and native recipient, with or without a compositor. Pointer targets must be inside native Bounding/Input regions; drag preflights every sent path point. Wayland and wider physical routing remain open. Keyboard fallback requires verified focus.
- \`await cua.getApp(nameOrBundleID, { initialState? })\`: bind an app; initialState defaults to true. Use false for a lightweight binding before query.
- \`await app.query({ text?, role?, exact?, limit?, maxNodes?, windowId? })\`: macOS-only AX lookup; returns matches and truncation metadata, with indexes usable in this native session.
- \`await app.getAXState({ emit?, disableDiffing?, textLimit?, maxTreeNodes?, maxTreeDepth?, windowPlacement? })\`
- \`await app.getScreenshot({ emit? })\`
- \`await app.getAXStateAndScreenshot(options?)\`
- Optional observation on macOS, Windows and Linux: \`app.getScreenshot({ includeAX: false })\` skips AX/focus/selection and invalidates prior element indexes; refresh AX before element actions. \`app.getAXState({ includeScreenshot: false })\` skips capture; screenshot-coordinate actions require a fresh screenshot. Omitted options retain full native observation.
- \`await app.click(elementIndexOrPoint, { mouseButton?, clickCount?, clickMethod?, key?, durationMs? })\`
- Held key duration requires a backend advertising press_key.duration_ms (macOS auto and Linux verified visible X11 auto). It holds the whole chord and owns reverse releases on cancellation/shutdown. Unsupported methods/platforms reject before input.
- Held click options require a backend advertising key/duration_ms (macOS/Linux). key holds a native key/chord across the sequence; durationMs holds each mouse press. macOS auto uses targeted app_post; Linux auto uses verified visible X11 input and current primary native key mappings. Click counts are 1...3. Unsupported backends and explicit non-event methods throw before input.
- \`await app.scroll(elementIndexOrPoint, direction, pages?)\`: Linux coordinate/index routes use verified visible X11 wheel input; page displacement is toolkit-dependent. Coordinate support is discovered from the native schema.
- \`await app.drag([fromX, fromY], [toX, toY])\`
- \`await app.paste(text, {format?})\` on Linux X11: text (default), literal md or html. Replaces the clipboard until native-session cleanup; inspect state after paste or errors. Linux does not restore the previous clipboard.
- \`await app.typeCharacters(text)\` on Linux sends printable keys to current focus without finding a field or pasting; returns \`{charactersSent}\` counting native synthesis acknowledgments. Inspect after errors before retrying.
- \`await app.typeText(text, elementIndex?)\` on Linux: insert at the exact observed editable field caret/selection, or current focus when omitted. Other platforms use \`app.typeText(text, { keyMethod? })\`. Refresh AX indexes after UI changes; inspect after an attempted-edit error before retrying.
- \`await app.pressKey(key, { keyMethod?, durationMs? })\`
- \`await app.setValue(elementIndex, value)\`
- \`await app.selectText(elementIndex, text, { prefix?, suffix?, selectionType? })\`: macOS/Linux; selectionType is text (default), cursor_before or cursor_after. Ambiguous text and unverified selections throw.
- \`await app.performSecondaryAction(elementIndex, action)\`

AX observations emit a compact line replacement diff by default when it is smaller than the full state. Pass { disableDiffing: true } for full output. JavaScript return values always contain the full current state. Screenshot observations and native failures clear diff history.

After actions, call \`getAXState()\` in the same js invocation when the next decision depends on the updated UI. Re-derive element indexes from fresh state after navigation or layout changes. Prefer element indexes over coordinates. Open Computer Use keeps its existing local safety gates, including password-manager denial and explicit authorization for global pointer fallbacks.`;

export function virtualDisplayEnabled(environment = process.env, platform = process.platform) {
  if (platform !== "darwin") return false;
  const override = environment.OPEN_COMPUTER_USE_VIRTUAL_DISPLAY_ENABLED;
  if (override !== undefined) return override === "true";
  try { return inspectConfig(environment).values["virtualDisplay.enabled"] === true; }
  catch { return false; }
}

export function computerUseGuidance(environment = process.env, platform = process.platform) {
  return virtualDisplayEnabled(environment, platform)
    ? COMPUTER_USE_GUIDANCE
    : COMPUTER_USE_GUIDANCE.replace(", windowPlacement?", "");
}

function asError(error) {
  if (error instanceof Error) return error;
  // Errors thrown inside the REPL context come from another realm and fail instanceof.
  return new Error(typeof error?.message === "string" ? error.message : String(error));
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function formatValue(value) {
  if (typeof value === "string") return value;
  return require("node:util").inspect(value, { depth: 6, colors: false, breakLength: 100 });
}

function sniffMimeType(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  throw new Error("nodeRepl.emitImage could not infer PNG, JPEG, or WebP MIME type");
}

function normalizeImage(value) {
  if (typeof value === "string") {
    if (!value.startsWith("data:image/")) throw new Error("nodeRepl.emitImage accepts image data URLs or bytes");
    const match = /^data:([^;,]+);base64,(.*)$/s.exec(value);
    if (!match) throw new Error("nodeRepl.emitImage expected a base64 image data URL");
    return { mimeType: match[1], data: match[2] };
  }
  if (Buffer.isBuffer(value) || value instanceof Uint8Array || value instanceof ArrayBuffer) {
    const bytes = Buffer.from(value instanceof ArrayBuffer ? new Uint8Array(value) : value);
    return { mimeType: sniffMimeType(bytes), data: bytes.toString("base64") };
  }
  if (isPlainObject(value) && value.bytes !== undefined) {
    const bytes = Buffer.from(value.bytes instanceof ArrayBuffer ? new Uint8Array(value.bytes) : value.bytes);
    const mimeType = typeof value.mimeType === "string" ? value.mimeType : sniffMimeType(bytes);
    if (!mimeType.startsWith("image/")) throw new Error("nodeRepl.emitImage expected an image MIME type");
    return { mimeType, data: bytes.toString("base64") };
  }
  throw new Error("nodeRepl.emitImage received an unsupported value");
}

export class JsonLinePeer extends EventEmitter {
  constructor({ command, args = [], cwd, env = process.env, child } = {}) {
    super();
    this.options = { command, args, cwd, env };
    this.injected = Boolean(child);
    this.disposed = false;
    this.reopening = null;
    this.#start(child ?? spawn(command, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] }));
  }

  #start(child) {
    this.child = child;
    this.ending = null;
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = "";
    this.stderr = "";
    this.closed = false;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", chunk => { if (this.child === child) this.#onData(chunk); });
    child.stderr.on("data", chunk => { if (this.child === child) this.stderr = (this.stderr + chunk).slice(-8192); });
    child.stdin.on("error", error => { if (this.child === child) { this.#close(error); this.endSession(); } });
    child.on("error", error => { if (this.child === child) this.#close(error); });
    child.on("exit", (code, signal) => {
      if (this.child === child) this.#close(new Error(`native MCP exited (code=${code ?? "null"}, signal=${signal ?? "null"})${this.stderr ? `: ${this.stderr.trim()}` : ""}`));
    });
  }

  #reopen() {
    if (!this.reopening) {
      this.reopening = (async () => {
        await this.endSession();
        const { command, args, cwd, env } = this.options;
        this.#start(spawn(command, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] }));
        await this.initialize();
      })().catch(error => { this.endSession(); throw error; }).finally(() => { this.reopening = null; });
    }
    return this.reopening;
  }

  #onData(chunk) {
    this.buffer += chunk;
    if (Buffer.byteLength(this.buffer, "utf8") > MAX_FRAME_BYTES) return this.#close(new Error("native MCP response buffer exceeded limit"));
    for (;;) {
      const newline = this.buffer.indexOf("\n");
      if (newline < 0) break;
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;
      let message;
      try { message = JSON.parse(line); } catch (error) { this.emit("protocolError", new Error(`invalid native MCP JSON: ${line.slice(0, 200)}`)); continue; }
      if (message.id !== undefined && this.pending.has(String(message.id))) {
        const pending = this.pending.get(String(message.id));
        this.pending.delete(String(message.id));
        clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error(message.error.message ?? JSON.stringify(message.error)));
        else pending.resolve(message.result);
      } else {
        this.emit("message", message);
      }
    }
  }

  #close(error) {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
    this.emit("close", error);
  }

  request(method, params = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    if (this.reopening && method !== "initialize") return this.reopening.then(() => this.request(method, params, timeoutMs));
    if (this.closed && !this.injected && !this.disposed) return this.#reopen().then(() => this.request(method, params, timeoutMs));
    if (this.closed) return Promise.reject(new Error("native MCP is closed"));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = timeoutMs > 0
        ? setTimeout(() => {
          this.pending.delete(String(id));
          reject(new Error(`native MCP ${method} timed out after ${timeoutMs} ms`));
          this.endSession();
        }, timeoutMs)
        : undefined;
      this.pending.set(String(id), { resolve, reject, timer });
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`, error => {
        if (!error) return;
        if (timer) clearTimeout(timer);
        this.pending.delete(String(id));
        reject(error);
      });
    });
  }

  notify(method, params = {}) {
    if (!this.closed) this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  }

  async initialize() {
    const result = await this.request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "open-computer-use-node-repl", version: "1" },
    });
    this.notify("notifications/initialized", {});
    return result;
  }

  endSession() {
    if (this.ending) return this.ending;
    const child = this.child;
    let timer, graceTimer;
    this.ending = new Promise(resolve=>{
      if(child.exitCode!=null || child.signalCode!=null || child.pid===undefined) resolve();
      else child.once("exit",()=>{clearTimeout(timer);clearTimeout(graceTimer);resolve();});
    });
    this.#close(new Error("native Computer Use session ended"));
    child.stdin.end();
    if(child.exitCode==null && child.signalCode==null) {
      // Give an idle native server time to reap session-owned helpers on EOF.
      graceTimer = setTimeout(() => {
        timer = setTimeout(() => child.kill("SIGKILL"), 1_000);
        timer.unref();
        child.kill("SIGTERM");
      }, 250);
      graceTimer.unref();
    }
    return this.ending;
  }

  close() {
    this.disposed = true;
    return this.endSession();
  }

}

export class LazyNativePeer {
  constructor(options) {
    this.options = options;
    this.disposed = false;
    this.peer = null;
    this.connection = null;
  }
  connect() {
    if (this.disposed) throw new Error("Native runtime is closed");
    if (!this.connection) {
      if (!this.options.command) throw new Error("Native runtime unavailable: no executable configured for this platform");
      let peer;
      const connection = (async()=>{
        await this.ending;
        if(this.connection!==connection || this.disposed) throw new Error("Native session ended before startup");
        peer = new JsonLinePeer(this.options);
        this.peer = peer;
        await peer.initialize();
        return peer;
      })().catch(error => {
        if(peer) this.ending=Promise.all([this.ending,peer.close()]);
        if (this.connection === connection) {this.connection = null;this.peer = null;}
        throw new Error(`Native runtime unavailable: ${asError(error).message}`);
      });
      this.connection = connection;
    }
    return this.connection;
  }
  async request(method, params, timeoutMs) {
    const peer = await this.connect();
    if (this.peer !== peer) throw new Error("Native session ended before request dispatch");
    return peer.request(method, params, timeoutMs);
  }
  notify(method, params) {this.peer?.notify(method, params);}
  endSession() {
    const peer = this.peer;
    this.peer = null;
    this.connection = null;
    this.ending=Promise.all([this.ending,peer?.close()]);
    return this.ending;
  }
  close() {this.disposed = true;return this.endSession();}
}

function toolResultText(result) {
  return (result?.content ?? []).filter(item => item?.type === "text").map(item => item.text ?? "").filter(Boolean).join("\n");
}

function toolResultImages(result) {
  return (result?.content ?? []).filter(item => item?.type === "image" && typeof item.data === "string");
}

function parseListAppMarkers(markers) {
  const app = {};
  for (const marker of markers.split(/,\s*/)) {
    if (marker === "running") app.isRunning = true;
    else if (marker.startsWith("last-used=")) app.lastUsedDate = marker.slice("last-used=".length);
    else if (marker.startsWith("uses=")) {
      const useCount = Number.parseInt(marker.slice("uses=".length), 10);
      if (Number.isSafeInteger(useCount)) app.useCount = useCount;
    }
  }
  return app;
}

// The native compatibility surface intentionally returns human-readable text.
// Normalize its macOS (em dash) and Linux/Windows (double hyphen) renderings
// into the stable code-first shape used by cua.listApps(). Unknown lines are
// retained as display names rather than making discovery fail completely.
export function parseListApps(text) {
  if (!text.trim() || /^No running top-level apps are visible/u.test(text.trim())) return [];
  return text.split(/\r?\n/).map(line => {
    const trimmed = line.trim();
    const match = /^(.*?)\s+(?:—|--)\s+(.+?)\s+\[([^\]]*)\]$/u.exec(trimmed);
    if (!match) return { id: trimmed, displayName: trimmed };
    return { id: match[2], displayName: match[1], ...parseListAppMarkers(match[3]) };
  }).filter(app => app.id);
}

function optionsToSnapshotArgs(options = {}) {
  const args = {};
  if (options.disableDiffing !== undefined && typeof options.disableDiffing !== "boolean") {
    throw new Error("disableDiffing must be a boolean");
  }
  if (options.textLimit !== undefined) args.text_limit = options.textLimit;
  if (options.maxTreeNodes !== undefined) args.max_tree_nodes = options.maxTreeNodes;
  if (options.maxTreeDepth !== undefined) args.max_tree_depth = options.maxTreeDepth;
  if (options.windowPlacement !== undefined) {
    if (options.windowPlacement === "agent_display" && !virtualDisplayEnabled()) {
      throw new Error("windowPlacement 'agent_display' is disabled by virtualDisplay.enabled");
    }
    args.window_placement = options.windowPlacement;
  }
  for (const [option, argument] of [["includeAX", "include_ax"], ["includeScreenshot", "include_screenshot"]]) {
    if (options[option] !== undefined) {
      if (typeof options[option] !== "boolean") throw new Error(`${option} must be a boolean`);
      args[argument] = options[option];
    }
  }
  if (args.include_ax === false && args.include_screenshot === false) {
    throw new Error("At least one of includeAX or includeScreenshot must be true");
  }
  return args;
}

function optionsToClickArgs(options = {}) {
  if(!isPlainObject(options) || Object.keys(options).some(key=>!["mouseButton","clickCount","clickMethod","key","durationMs"].includes(key))) throw new Error("Invalid native click options");
  const args = {};
  if(options.mouseButton!==undefined) {
    const button=({l:"left",r:"right",m:"middle"})[options.mouseButton] ?? options.mouseButton;
    if(!["left","right","middle"].includes(button)) throw new Error("Invalid native click mouseButton");
    args.mouse_button=button;
  }
  if(options.clickCount!==undefined) {
    if(!Number.isInteger(options.clickCount) || options.clickCount<1 || options.clickCount>3) throw new Error("Native clickCount must be 1...3");
    args.click_count=options.clickCount;
  }
  if (options.clickMethod !== undefined) {
    if(!["auto","accessibility","app_post","sky_click","global"].includes(options.clickMethod)) throw new Error("Invalid native clickMethod");
    args.click_method = options.clickMethod;
  }
  if(options.key!==undefined) {
    if(typeof options.key!=="string" || !options.key.trim()) throw new Error("Native click key requires a non-empty string");
    args.key=options.key;
  }
  if(options.durationMs!==undefined) {
    if(!Number.isFinite(options.durationMs) || options.durationMs<0) throw new Error("Native click durationMs must be finite and non-negative");
    args.duration_ms=options.durationMs;
  }
  return args;
}

function optionsToKeyArgs(options = {},held=false) {
  const allowed=held ? ["keyMethod","durationMs"] : ["keyMethod"];
  if(!isPlainObject(options) || Object.keys(options).some(key=>!allowed.includes(key))) throw new Error("Invalid native key options");
  if(options.keyMethod!==undefined && (typeof options.keyMethod!=="string" || !options.keyMethod.trim())) throw new Error("Invalid native keyMethod");
  const args = {};
  if(options.durationMs!==undefined) {
    if(!Number.isFinite(options.durationMs) || options.durationMs<0) throw new Error("Native key durationMs must be finite and non-negative");
    args.duration_ms=options.durationMs;
  }
  if (options.keyMethod !== undefined) args.key_method = options.keyMethod;
  return args;
}

export function createCuaApi(native, activeOutput, onDispose, {tabRequest,platform=process.platform}={}) {
  let docsEmitted = false;
  const observations = new Map();
  if(native.endSession) onDispose?.(()=>native.endSession());
  async function call(tool, args = {}, timeoutMs) {
    try {
      const result = await native.request("tools/call", { name: tool, arguments: args }, timeoutMs);
      if (result?.isError) throw new Error(toolResultText(result) || `${tool} failed`);
      return result;
    } catch (error) {
      observations.clear();
      throw error;
    }
  }
  async function emitText(text, options = {}) {
    if (options.emit === false || !text) return;
    activeOutput().write(text, "cua.state");
  }
  async function emitImages(images, options = {}) {
    if (options.emit === false) return;
    for (const image of images) await activeOutput().emitImage({ bytes: Buffer.from(image.data, "base64"), mimeType: image.mimeType ?? "image/png" });
  }
  async function observe(app, text, options = {}) {
    if (options.includeAX === false) {
      observations.clear();
      await emitText(text, options);
      return;
    }
    if (options.emit === false) return;
    const signature = JSON.stringify(optionsToSnapshotArgs(options));
    const previous = observations.get(app);
    let output = text;
    if (!options.disableDiffing && previous?.signature === signature) {
      const before = previous.text.split("\n"), after = text.split("\n");
      let start = 0, end = 0;
      while (start < before.length && start < after.length && before[start] === after[start]) start++;
      while (end < before.length - start && end < after.length - start && before[before.length - 1 - end] === after[after.length - 1 - end]) end++;
      if (start === before.length && start === after.length) output = "Accessibility state unchanged.";
      else {
        const removed = before.slice(start, before.length - end);
        const added = after.slice(start, after.length - end);
        const diff = `Accessibility state diff for ${app} (replace ${removed.length} line(s) at line ${start + 1} with ${added.length} line(s)):\n${removed.map(line => `- ${line}`).join("\n")}\n${added.map(line => `+ ${line}`).join("\n")}`;
        if (diff.length < text.length) output = diff;
      }
    }
    await emitText(output, options);
    observations.set(app, { text, signature });
  }
  async function emitDocs() {
    if (docsEmitted) return;
    activeOutput().write(computerUseGuidance(), "cua.core");
    docsEmitted = true;
  }
  function appBinding(app,identity=app) {
    return Object.freeze({
      async query(options = {}) {
        if (!isPlainObject(options)) throw new Error("app.query expects an options object");
        for (const key of Object.keys(options)) {
          if (!["text", "role", "exact", "limit", "maxNodes", "windowId"].includes(key)) throw new Error(`Unknown query option: ${key}`);
        }
        for (const key of ["text", "role"]) {
          if (options[key] !== undefined && (typeof options[key] !== "string" || options[key].length > 1000)) throw new Error(`${key} must be a string of at most 1000 UTF-16 code units`);
        }
        if (!options.text?.trim() && !options.role?.trim()) throw new Error("query requires text and/or role");
        if (options.exact !== undefined && typeof options.exact !== "boolean") throw new Error("exact must be true or false");
        for (const key of ["limit", "maxNodes", "windowId"]) {
          if (options[key] !== undefined && (!Number.isSafeInteger(options[key]) || options[key] < 1 || (key === "windowId" && options[key] > 0xffffffff))) throw new Error(`${key} must be a positive integer${key === "windowId" ? " up to 4294967295" : ""}`);
        }
        const result = await call("query", { app, text: options.text, role: options.role, exact: options.exact,
                                             limit: options.limit, max_nodes: options.maxNodes, window_id: options.windowId });
        const response = JSON.parse(toolResultText(result));
        if (!isPlainObject(response) || !Array.isArray(response.matches) || typeof response.truncated !== "boolean" || typeof response.stop_reason !== "string") throw new Error("Invalid query response");
        return response;
      },
      async getAXState(options = {}) {
        const result = await call("get_app_state", { app, ...optionsToSnapshotArgs(options) });
        const text = toolResultText(result);
        await observe(identity, text, options);
        return text;
      },
      async getScreenshot(options = {}) {
        observations.clear();
        const result = await call("get_app_state", { app, ...optionsToSnapshotArgs(options), text_limit: 1 });
        const image = toolResultImages(result)[0];
        if (!image) throw new Error(`Screenshot unavailable for ${identity}`);
        const bytes = Buffer.from(image.data, "base64");
        await emitImages([image], options);
        return bytes;
      },
      async getAXStateAndScreenshot(options = {}) {
        const result = await call("get_app_state", { app, ...optionsToSnapshotArgs(options) });
        const state = toolResultText(result);
        const images = toolResultImages(result);
        await observe(identity, state, options);
        await emitImages(images, options);
        return images[0] ? { state, screenshot: Buffer.from(images[0].data, "base64") } : { state };
      },
      async click(target, options = {}) {
        const targetArgs = Array.isArray(target) ? { x: target[0], y: target[1] } : { element_index: target };
        const args=optionsToClickArgs(options);
        const extended=["key","duration_ms"].filter(key=>args[key]!==undefined);
        if(extended.length) {
          const schema=(await native.request("tools/list",{}))?.tools?.find(tool=>tool.name==="click")?.inputSchema?.properties;
          if(!extended.every(key=>schema && Object.hasOwn(schema,key))) throw new Error("Native runtime does not advertise held click support");
        }
        await call("click", { app, ...targetArgs, ...args }, extended.length ? 0 : undefined);
      },
      async drag(from, to) { await call("drag", { app, from_x: from[0], from_y: from[1], to_x: to[0], to_y: to[1] }); },
      async pressKey(key, options = {}) {
        if(typeof key!=="string" || !key.trim()) throw new Error("Native pressKey requires a non-empty key");
        const args=optionsToKeyArgs(options,true);
        if(args.duration_ms!==undefined) {
          const schema=(await native.request("tools/list",{}))?.tools?.find(tool=>tool.name==="press_key")?.inputSchema?.properties;
          if(!schema || !Object.hasOwn(schema,"duration_ms")) throw new Error("Native runtime does not advertise held key support");
        }
        await call("press_key", { app, key, ...args }, args.duration_ms!==undefined ? 0 : undefined);
      },
      async scroll(target, direction, pages = 1) {
        if(typeof direction!=="string" || !["up","down","left","right"].includes(direction.toLowerCase()) || typeof pages!=="number" || !Number.isFinite(pages) || pages<=0) throw new Error("Scroll requires up/down/left/right and positive finite pages");
        let args;
        if(Array.isArray(target)) {
          if(target.length!==2 || !target.every(value=>typeof value==="number"&&Number.isFinite(value))) throw new Error("Scroll point requires two finite pixel coordinates");
          const schema=(await native.request("tools/list",{}))?.tools?.find(tool=>tool.name==="scroll")?.inputSchema?.properties;
          if(!schema || !Object.hasOwn(schema,"x") || !Object.hasOwn(schema,"y")) throw new Error("Native runtime does not advertise coordinate scroll support");
          args={x:target[0],y:target[1]};
        } else {
          if(!(Number.isSafeInteger(target)&&target>=0) && !(typeof target==="string"&&/^\d+$/u.test(target))) throw new Error("Scroll requires an element index or point");
          args={element_index:target};
        }
        await call("scroll", { app, ...args, direction:direction.toLowerCase(), pages });
      },
      async setValue(elementIndex, value) { await call("set_value", { app, element_index: elementIndex, value }); },
      async selectText(elementIndex, text, options = {}) {
        const index = typeof elementIndex === "string" && /^(0|[1-9]\d*)$/u.test(elementIndex) ? Number(elementIndex) : elementIndex;
        if (!Number.isSafeInteger(index) || index < 0) throw new Error("selectText requires a non-negative integer element index");
        if (typeof text !== "string" || !text.length) throw new Error("selectText requires non-empty text");
        if (!isPlainObject(options)) throw new Error("selectText expects an options object");
        for (const key of Object.keys(options)) {
          if (!["prefix", "suffix", "selectionType"].includes(key)) throw new Error(`Unknown selectText option: ${key}`);
        }
        for (const key of ["prefix", "suffix"]) {
          if (options[key] !== undefined && typeof options[key] !== "string") throw new Error(`${key} must be a string`);
        }
        if (options.selectionType !== undefined && !["text", "cursor_before", "cursor_after"].includes(options.selectionType)) {
          throw new Error("selectionType must be text, cursor_before or cursor_after");
        }
        if(platform==='linux'&&!(await native.request('tools/list',{}))?.tools?.some(tool=>tool.name==='select_text'))throw Error('Native runtime does not advertise select_text; update it before use');
        await call("select_text", { app, element_index: elementIndex, text,
          prefix: options.prefix, suffix: options.suffix, selection: options.selectionType });
      },
      ...(platform==='linux'?{async paste(text, options={}) {
        if(typeof text!=='string'||text.includes('\0')||Buffer.byteLength(text)>16*1024*1024||/[\uD800-\uDFFF]/u.test(text))throw Error('Paste requires Unicode text without NUL, at most 16 MiB');
        if(!isPlainObject(options)||Object.keys(options).some(key=>key!=='format')||!['text','md','html'].includes(options.format??'text'))throw Error('Paste options require format text, md or html');
        if(!(await native.request('tools/list',{}))?.tools?.some(tool=>tool.name==='paste'))throw Error('Native runtime does not advertise paste; update it before use');
        await call('paste',{app,text,format:options.format??'text'});
      }}:{}),
      ...(platform==='linux'?{async typeCharacters(text) {
        if(typeof text!=='string'||/[^\p{L}\p{M}\p{N}\p{P}\p{S} ]/u.test(text))throw Error('Linux typeCharacters requires printable Unicode characters');
        if(!(await native.request('tools/list',{}))?.tools?.some(tool=>tool.name==='type_characters'))throw Error('Native runtime does not advertise type_characters; update it before use');
        const result=JSON.parse(toolResultText(await call('type_characters',{app,text})));
        if(result?.charactersSent!==Array.from(text).length)throw Error('Invalid charactersSent from native input; inspect before retrying');
        return {charactersSent:result.charactersSent};
      }}:{}),
      async typeText(text, indexOrOptions) {
        if(platform==='linux'){
          if(typeof text!=='string'||!text.length||text.includes('\0'))throw Error('Linux typeText requires non-empty text without NUL');
          if(indexOrOptions!==undefined&&(!Number.isSafeInteger(indexOrOptions)||indexOrOptions<0))throw Error('Linux typeText field index must be a non-negative safe integer');
          const properties=(await native.request('tools/list',{}))?.tools?.find(tool=>tool.name==='type_text')?.inputSchema?.properties;
          if(!properties?.element_index)throw Error('Native runtime does not advertise focused/indexed Linux text; update it before use');
          await call('type_text',{app,text,...(indexOrOptions===undefined?{}:{element_index:indexOrOptions})});
        }else await call('type_text',{app,text,...optionsToKeyArgs(indexOrOptions)});
      },
      async performSecondaryAction(elementIndex, action) { await call("perform_secondary_action", { app, element_index: elementIndex, action }); },
    });
  }
  const browserApi = createBrowserApi(activeOutput, process.env, {
    runtimeRequest: native.browserHost ? (args={})=>native.request("browser/runtime",args,0) : undefined,
    focusLease: native.browserHost ? args => native.request("browser/focus", args) : undefined,
    downloadRequest: native.browserHost ? args => native.request("browser/download",args) : undefined,
    logRequest: native.browserHost ? args => native.request("browser/logs",args) : undefined,
    dialogRequest: native.browserHost ? args => native.request("browser/dialog",args) : undefined,
    clipboardRequest: native.browserHost ? args => native.request("browser/clipboard",args) : undefined,
    chromeRequest: native.browserHost ? args=>native.request("browser/chrome",args,0) : undefined,
    evaluateRequest: native.browserHost ? args=>native.request("browser/evaluate",args,0) : undefined,
    webMcpRequest: native.browserHost ? args=>native.request("browser/webmcp",args,0) : undefined,
    contentRequest: native.browserHost ? args=>native.request("browser/content",args,0) : undefined,
    assetsRequest: native.browserHost ? args=>native.request("browser/assets",args,0) : undefined,
    cdpRequest: native.browserHost ? args=>native.request("browser/cdp",args,0) : undefined,
    tabRequest: native.browserHost ? args=>native.request("browser/tabs",args,0) : tabRequest,
    inputRequest: native.browserHost ? args=>native.request("browser/input",args,0) : undefined,
    dropRequest: native.browserHost ? args => native.request("browser/drop",args) : undefined,
    viewportRequest: native.browserHost ? args => native.request("browser/viewport",args) : undefined,
    onDispose,
  });
  async function windowSupport(name){const tools=(await native.request('tools/list',{}))?.tools;if(!tools?.some(tool=>tool.name===name))throw Error('Native runtime does not advertise window-ID binding; update it before use');}
  const target={darwin:'mac',linux:'linux',win32:'windows'}[platform];
  const computer=Object.freeze({target,...(['linux','windows'].includes(target)?{async launch_app(input){
    if(!isPlainObject(input)||Object.keys(input).some(key=>key!=='app')||typeof input.app!=='string'||!input.app.trim()||Buffer.byteLength(input.app)>4096||/[\0\r\n]/u.test(input.app))throw Error('launch_app requires {app: executable name/path, or Linux desktop ID/display name} (max 4096 bytes)');
    await emitDocs();
    const tool=(await native.request('tools/list',{}))?.tools?.find(tool=>tool.name==='launch_app');
    if(!tool?.inputSchema?.properties?.app)throw Error('Native runtime does not advertise explicit application launch');
    await call('launch_app',{app:input.app});
  }}:{})});
  const api = {
    ...browserApi,
    computer,
    async getState(options = {}) {
      await emitDocs();
      const [appsResult, browsersResult] = await Promise.allSettled([
        api.listApps({ emit: false }),
        (async () => {
          const browsers = await browserApi.listBrowsers({ emit: false });
          const tabs = await browserApi.listTabs({ emit: false });
          return browsers.map(browser => ({ ...browser, tabs }));
        })(),
      ]);
      const state = {
        apps: appsResult.status === "fulfilled" ? appsResult.value : [],
        browsers: browsersResult.status === "fulfilled" ? browsersResult.value : [],
      };
      const errors = [appsResult, browsersResult].flatMap((result, index) => result.status === "rejected" ? [`${index === 0 ? "apps" : "browsers"}: ${asError(result.reason).message}`] : []);
      if (errors.length) state.errors = errors;
      if (options.emit !== false) activeOutput().write(state, "cua.state");
      return state;
    },
    ...(target==='linux'?{async listWindows(options={}){
      if(!isPlainObject(options)||Object.keys(options).some(key=>key!=='emit')||options.emit!==undefined&&typeof options.emit!=='boolean')throw Error('listWindows expects {emit?: boolean}');
      await emitDocs();await windowSupport('list_windows');
      const windows=JSON.parse(toolResultText(await call('list_windows',{})));
      if(Buffer.byteLength(JSON.stringify(windows))>6*1024*1024||!Array.isArray(windows)||windows.some(window=>!isPlainObject(window)||!Number.isSafeInteger(window.id)||window.id<1||typeof window.app!=='string'||window.title!==undefined&&typeof window.title!=='string')||new Set(windows.map(window=>window.id)).size!==windows.length)throw Error('Invalid native window listing');
      if(options.emit!==false)activeOutput().write(windows,'cua.state');return windows;
    }}:{}),
    async listApps(options = {}) {
      await emitDocs();
      const result = await call("list_apps", {});
      const text = toolResultText(result);
      let apps;
      try {
        const parsed = JSON.parse(text);
        apps = Array.isArray(parsed) ? parsed : parseListApps(text);
      } catch {
        apps = parseListApps(text);
      }
      if (options.emit !== false) activeOutput().write(apps, "cua.state");
      return apps;
    },
    async getApp(app, options = {}) {
      const window=isPlainObject(app);
      if(window){
        if(Object.keys(app).length!==1||!Object.hasOwn(app,'windowId')||!Number.isSafeInteger(app.windowId)||app.windowId<1)throw Error('getApp requires {windowId: positive safe integer}');
        if(target!=='linux')throw Error('Native window-ID binding is currently available on Linux');
      }else if(typeof app!=='string'||!app.trim())throw Error('getApp requires an app name, bundle ID or {windowId}');
      if (!isPlainObject(options) || (options.initialState !== undefined && typeof options.initialState !== "boolean")) throw new Error("initialState must be true or false");
      await emitDocs();let identity=app;
      if(window){
        identity=`window:${app.windowId}`;await windowSupport('bind_window');
        const bound=JSON.parse(toolResultText(await call('bind_window',{window_id:app.windowId})));
        if(!isPlainObject(bound)||typeof bound.app!=='string'||!bound.app.startsWith('ocu-window:'))throw Error('Invalid native window binding');app=bound.app;
      }
      if (options.initialState !== false) {
        const result = await call("get_app_state", { app, text_limit: "max" });
        await observe(identity, toolResultText(result), { textLimit: "max" });
      }
      return appBinding(app,identity);
    },
    async rewriteDocumentation() { activeOutput().write(computerUseGuidance(), "cua.core"); },
  };
  return Object.freeze(api);
}

export class PersistentJavaScriptSession {
  constructor({ native }) {
    this.native = native;
    Object.assign(this,HOST_BROWSER_SERVICES);
    this.hostsBrowser=native.browserHost!==true;
    this.turnGeneration=0;this.runQueue=Promise.resolve();
    this.browserNative=this.hostsBrowser ? {browserHost:true,request:async(method,params,timeoutMs)=>{
      const owner=evaluationOwner.getStore()?.resourceOwner;
      if(this.closed || !this.accepting || owner!==this.resourceOwner) throw new Error('Execution turn ended');
      try {return await hostRequest(this,owner,this,method,params,timeoutMs);}
      catch(error) {if(error?.browserCleanupFailed)this.#browserFailed(error);throw error;}
    }} : native;
    this.active = null;
    this.disposers = [];
    this.browserTabs=HOST_BROWSER_TABS;
    this.ready = Promise.resolve();
    this.reset();
  }

  #currentOutput() {
    const owner = evaluationOwner.getStore();
    if (!owner || owner !== this.active) throw new Error("nodeRepl output is only available while js is executing");
    return owner;
  }

  #settleOwner(owner, error) {
    if (owner && owner === this.active) owner.reject(error);
  }

  #ownedAsyncCallback(callback) {
    if (typeof callback !== "function") return callback;
    const owner = evaluationOwner.getStore();
    const session = this;
    return function (...args) {
      try {
        const value = evaluationOwner.run(owner, () => Reflect.apply(callback, this, args));
        if (value && typeof value.then === "function") {
          void value.catch(error => session.#settleOwner(owner, error));
        }
        return value;
      } catch (error) {
        session.#settleOwner(owner, error);
        return undefined;
      }
    };
  }

  #newOwner() {
    this.resourceOwner={};this.accepting=true;
    BROWSER_FAILURE_HANDLERS.set(this.resourceOwner,error=>this.#browserFailed(error));
  }
  #browserFailed(error) {
    if(!this.accepting) return;
    this.accepting=false;this.active?.reject(error);
    void this.reset().catch(()=>{});
  }
  async #dispose() {
    this.accepting=false;this.discardContext=true;this.repl?.close();
    if(this.hostsBrowser && this.resourceOwner) await releaseResources(this,this.resourceOwner);
    const results = await Promise.allSettled(this.disposers.map(dispose => Promise.resolve().then(dispose)));
    const failed = results.find(result => result.status === "rejected");
    if (failed) throw failed.reason;
    this.disposers = [];
  }

  reset() {
    this.turnGeneration++;this.accepting=false;
    this.active?.reject(new Error("JavaScript session reset"));
    const boundary=this.turnEnding ? this.endTurn() : this.ready.catch(()=>{});
    this.ready = boundary.then(async () => {
      await this.#dispose();
      this.browserTabs.begin(this);
      this.#initialize();this.turnEnded=false;this.discardContext=false;
      this.closed = false;
    });
    this.ready.catch(() => {});
    return this.ready;
  }

  close() {
    this.closed = true;this.turnGeneration++;this.accepting=false;this.active?.reject(new Error("JavaScript session closed"));
    this.ready = this.ready.catch(() => {}).then(async () => {await this.#dispose();await this.browserTabs.end(this,{final:true});this.closed=true;});
    this.ready.catch(() => {});
    return this.ready;
  }

  endTurn() {
    if(!this.hostsBrowser) throw new Error('The parent Worker host owns this execution turn');
    if(this.closed) return this.ready;
    if(this.endingTurn) return this.endingTurn;
    if(this.turnEnded) return this.ready;
    this.turnGeneration++;this.accepting=false;this.turnEnding=true;
    const interrupted=!!this.active || [...this.browserDialogs.waiters.values()].some(watch=>watch.owner===this.resourceOwner);
    this.active?.reject(new Error('Execution turn ended'));
    this.endingTurn=this.ready.catch(()=>{}).then(async()=>{
      this.accepting=false;
      if(interrupted) {this.discardContext=true;await this.#dispose();}
      else if(this.resourceOwner) await releaseResources(this,this.resourceOwner);
      await this.browserTabs.end(this);this.turnEnded=true;this.turnEnding=false;
    }).finally(()=>{this.endingTurn=undefined;});
    this.ready=this.endingTurn;this.ready.catch(()=>{});return this.ready;
  }
  #initialize() {
    if(this.hostsBrowser)this.#newOwner();
    const input = new PassThrough();
    const output = new PassThrough();
    output.resume();
    // A throw inside evaluated code (sync, or after an await) never reaches the eval
    // callback: the REPL prints it and moves on. Settle the evaluation from the REPL's
    // error path instead (`handleError` on Node 26, a domain on Node 22), but only the
    // call that threw: a late throw from a finished call is dropped, as the REPL would.
    const settle = error => {
      const owner = evaluationOwner.getStore();
      this.#settleOwner(owner, error);
      return "ignore";
    };
    this.repl = repl.start({ prompt: "", input, output, terminal: false, useGlobal: false, ignoreUndefined: true, breakEvalOnSigint: true, handleError: settle });
    this.repl.on("error", () => {});
    this.repl._domain?.on("error", settle);
    // Node's REPL domain can report an old timer's exception while a newer eval is
    // active, losing the AsyncLocalStorage owner that scheduled the callback. Wrap
    // timer callbacks inside the REPL context so their errors settle only their own
    // still-active evaluation and are otherwise dropped.
    this.repl.context.setTimeout = (callback, delay, ...args) => setTimeout(this.#ownedAsyncCallback(callback), delay, ...args);
    this.repl.context.setInterval = (callback, delay, ...args) => setInterval(this.#ownedAsyncCallback(callback), delay, ...args);
    this.repl.context.setImmediate = (callback, ...args) => setImmediate(this.#ownedAsyncCallback(callback), ...args);
    this.repl.context.queueMicrotask = callback => queueMicrotask(this.#ownedAsyncCallback(callback));
    const nodeRepl = {
      cwd: process.cwd(),
      homeDir: process.env.HOME ?? "",
      tmpDir: process.env.TMPDIR ?? "/tmp",
      write: (value, itemId) => this.#currentOutput().write(value, itemId),
      emitImage: async value => this.#currentOutput().emitImage(value),
    };
    Object.defineProperty(nodeRepl, "requestMeta", { get: () => this.requestMeta ?? {} });
    Object.freeze(nodeRepl);
    this.nodeRepl = nodeRepl;
    Object.defineProperty(this.repl.context, "nodeRepl", { value: nodeRepl, configurable: false, writable: false });
    Object.defineProperty(this.repl.context, "cua", { value: createCuaApi(this.browserNative, () => this.#currentOutput(), dispose => this.disposers.push(dispose),{tabRequest:args=>this.browserTabs.request(this,args)}), configurable: false, writable: false });
  }

  run(code,timeoutMs=DEFAULT_TIMEOUT_MS,requestMeta={}) {
    const generation=this.turnGeneration;
    const queued=this.runQueue.then(()=>this.#run(code,timeoutMs,requestMeta,generation));
    this.runQueue=queued.catch(()=>{});return queued;
  }
  async #run(code, timeoutMs, requestMeta,generation) {
    if (typeof code !== "string" || !code.trim()) throw new Error("js expects non-empty JavaScript source");
    try {
      if(generation!==this.turnGeneration) throw new Error('Execution turn ended');
      await this.ready;
      if(generation!==this.turnGeneration) throw new Error('Execution turn ended');
      if (this.closed) throw new Error("JavaScript session closed");
      if(this.turnEnded) {
        this.browserTabs.begin(this);
        if(this.discardContext)this.#initialize();else this.#newOwner();
        this.turnEnded=false;this.discardContext=false;
      }
    } catch (error) { return {content:[{type:"text",text:`Error: ${asError(error).message}`}],isError:true}; }
    const content = [];
    const active = {
      resourceOwner:this.resourceOwner,
      write(value, itemId) { content.push({ type: "text", text: formatValue(value), ...(itemId ? { _meta: { id: itemId } } : {}) }); },
      async emitImage(value) { const image = normalizeImage(await value); content.push({ type: "image", mimeType: image.mimeType, data: image.data }); },
    };
    this.active = active;
    this.requestMeta = requestMeta;
    let timer,executionTimedOut=false;
    const enforceTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0;
    try {
      const evaluation = new Promise((resolve, reject) => {
        active.reject = reject;
        evaluationOwner.run(active, () => this.repl.eval(code, this.repl.context, "open-computer-use-repl", (error, result) => error ? reject(error) : resolve(result)));
      });
      const value = enforceTimeout
        ? await Promise.race([evaluation, new Promise((_, reject) => { timer = setTimeout(() => {executionTimedOut=true;reject(new Error(`js execution timed out after ${timeoutMs} ms; session reset`));}, timeoutMs); })])
        : await evaluation;
      if (content.length === 0) content.push({ type: "text", text: "(no output)" });
      return { content, isError: false };
    } catch (error) {
      let message = asError(error).message;
      if (executionTimedOut) {
        try {await this.reset();}
        catch(cleanupError) {message+=`; browser cleanup failed: ${asError(cleanupError).message}; session stopped`;}
      } else if(error?.browserCleanupFailed) {
        try {await this.ready;}
        catch(cleanupError) {message+=`; browser cleanup failed: ${asError(cleanupError).message}; session stopped`;}
      }
      content.push({ type: "text", text: `Error: ${message}` });
      return { content, isError: true };
    } finally {
      clearTimeout(timer);
      if(this.hostsBrowser)content.unshift(...this.browserWebMcp.notifications(active.resourceOwner));
      if(this.active===active)this.active = null;
    }
  }
}

// Production isolation boundary. JavaScript runs in a worker so a CPU-bound
// loop can be terminated without hanging the MCP transport. Native tool calls
// are brokered back to the parent and still execute serially in the native MCP.
export class WorkerJavaScriptSession {
  constructor({ native }) {
    this.native = native;this.browserRuntime=browserRuntime;
    this.nextId = 1;
    this.nextOwnerId=0;this.resourceOwners=new WeakMap();this.turnGeneration=0;
    this.browserTabs=HOST_BROWSER_TABS;
    this.pending = new Map();
    this.runQueue = Promise.resolve();
    this.invalidatedWorkers = new WeakSet();
    this.browserFocusLeases = HOST_BROWSER_FOCUS;
    this.browserDownloads = HOST_BROWSER_DOWNLOADS;
    this.browserLogs = HOST_BROWSER_LOGS;
    this.browserDialogs = HOST_BROWSER_DIALOGS;
    this.browserClipboard = HOST_BROWSER_CLIPBOARD;
    this.browserDrops = HOST_BROWSER_DROPS;
    this.browserInputs = HOST_BROWSER_INPUTS;
    this.browserChrome=HOST_BROWSER_CHROME;
    this.browserEvaluator=HOST_BROWSER_EVALUATOR;
    this.browserWebMcp=HOST_BROWSER_WEBMCP;
    this.browserContent=HOST_BROWSER_CONTENT;
    this.browserAssets=HOST_BROWSER_ASSETS;
    this.browserCdp=HOST_BROWSER_CDP;
    this.browserViewport = HOST_BROWSER_VIEWPORT;
    this.stoppingWorkers = new WeakMap();
    this.#start();
  }

  #start() {
    const worker = new Worker(new URL("./open-computer-use-kernel.mjs", import.meta.url),{execArgv:[]});
    this.worker = worker;
    this.#newOwner(worker);
    worker.on("message", message => void this.#onMessage(worker, message));
    worker.on("error", error => void this.#workerFailed(worker, error));
    worker.on("exit", code => {
      if (this.worker === worker && !this.invalidatedWorkers.has(worker)) void this.#workerFailed(worker, new Error(`JavaScript kernel exited with code ${code}`));
    });
  }

  #newOwner(worker) {
    const owner={id:++this.nextOwnerId};this.resourceOwners.set(worker,owner);
    BROWSER_FAILURE_HANDLERS.set(owner,error=>void this.#workerFailed(worker,error));
  }

  #stop(worker) {
    if(!this.stoppingWorkers.has(worker)) {
      this.invalidatedWorkers.add(worker);
      for(const pending of this.pending.values()) if(pending.worker===worker) clearTimeout(pending.timer);
      this.stoppingWorkers.set(worker,releaseResources(this,this.resourceOwners.get(worker),worker.terminate()).catch(error=>{this.stoppingWorkers.delete(worker);throw error;}));
    }
    return this.stoppingWorkers.get(worker);
  }
  endTurn({final=false}={}) {
    if(this.endingTurn) return this.endingTurn;
    if(this.turnEnded && !final) return this.turnBarrier;
    const worker=this.worker,owner=this.resourceOwners.get(worker);
    this.turnGeneration++;this.turnEnding=true;
    const active=[...this.pending.values()].some(pending=>pending.worker===worker) || [...this.browserDialogs.waiters.values()].some(watch=>watch.owner===owner);
    const released=active || final || this.invalidatedWorkers.has(worker) ? this.#stop(worker) : releaseResources(this,owner);
    this.endingTurn=released.then(()=>this.browserTabs.end(this,{final})).then(()=>{
      this.turnEnded=true;this.turnEnding=false;
    }).finally(()=>{this.#failWorker(worker,new Error('Execution turn ended'));this.endingTurn=undefined;});
    this.turnBarrier=this.endingTurn;this.turnBarrier.catch(()=>{});return this.turnBarrier;
  }

  async #workerFailed(worker, error) {
    if (this.invalidatedWorkers.has(worker) || this.turnEnding) return;
    try {
      await this.#stop(worker);
      if (this.worker === worker) this.#start();
    } catch (cleanupError) { error = new Error(`${asError(error).message}; browser cleanup failed: ${asError(cleanupError).message}`); }
    this.#failWorker(worker, error);
  }

  async #onMessage(worker, message) {
    if (this.worker !== worker || this.invalidatedWorkers.has(worker)) return;
    if (message.type === "result") {
      const pending = this.pending.get(message.id);
      if (!pending || pending.worker !== worker) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      message.result.content.unshift(...this.browserWebMcp.notifications(this.resourceOwners.get(worker)));
      pending.resolve(message.result);
      return;
    }
    if (message.type === "native_request") {
      const owner=this.resourceOwners.get(worker);
      if(this.turnEnding || message.turnId!==owner.id) {
        worker.postMessage({type:'native_response',id:message.id,error:'Execution turn ended'});return;
      }
      try {
        const result=await hostRequest(this,owner,this,message.method,message.params,message.timeoutMs);
        if (this.worker === worker && !this.invalidatedWorkers.has(worker)) worker.postMessage({ type: "native_response", id: message.id, result });
      } catch (error) {
        if (error?.browserCleanupFailed && ["browser/focus","browser/download","browser/dialog","browser/clipboard","browser/viewport","browser/drop","browser/input"].includes(message.method)) {
          await this.#workerFailed(worker,error);
          return;
        }
        if (this.worker === worker && !this.invalidatedWorkers.has(worker)) worker.postMessage({ type: "native_response", id: message.id, error: asError(error).message });
      }
    }
  }

  #failWorker(worker, error) {
    for (const [id, pending] of this.pending) {
      if (pending.worker !== worker) continue;
      clearTimeout(pending.timer);
      pending.resolve({ content: [{ type: "text", text: `Error: ${asError(error).message}` }], isError: true });
      this.pending.delete(id);
    }
  }

  async reset() {
    if(this.turnEnding) await this.endTurn();
    const old = this.worker;
    try {
      await this.#stop(old);
      if (this.worker === old) this.#start();
      this.browserTabs.begin(this);this.turnEnded=false;this.turnBarrier=undefined;this.closed=false;
    } catch (error) { this.#failWorker(old, error); throw error; }
    this.#failWorker(old, new Error("JavaScript session reset"));
  }

  async close() {this.closed=true;if(this.endingTurn) await this.endingTurn;await this.endTurn({final:true});}

  run(code,timeoutMs=DEFAULT_TIMEOUT_MS,requestMeta={}) {
    const generation=this.turnGeneration;
    const queued=this.runQueue.then(async()=>{
      try {
        if(this.closed) throw new Error('JavaScript session closed');
        if(generation!==this.turnGeneration) throw new Error('Execution turn ended');
        await this.turnBarrier;
        if(this.turnEnded) {
          this.browserTabs.begin(this);
          if(this.invalidatedWorkers.has(this.worker)) this.#start();else this.#newOwner(this.worker);
          this.turnEnded=false;this.turnBarrier=undefined;
        }
        return this.#run(code,timeoutMs,requestMeta);
      } catch(error) {return {content:[{type:'text',text:`Error: ${asError(error).message}`}],isError:true};}
    });
    this.runQueue=queued.catch(()=>{});return queued;
  }

  #run(code, timeoutMs, requestMeta) {
    if (this.invalidatedWorkers.has(this.worker)) return Promise.resolve({content:[{type:"text",text:"Error: JavaScript session stopped; browser cleanup must succeed before reuse"}],isError:true});
    const id = this.nextId++;
    return new Promise(resolve => {
      const worker = this.worker;
      const timer = setTimeout(async () => {
        const pending = this.pending.get(id);
        if (!pending || pending.worker !== worker) return;
        this.pending.delete(id);
        let error = `js execution timed out after ${timeoutMs} ms; session reset`;
        try {
          await this.#stop(worker);
          if (this.worker === worker) this.#start();
        } catch (cleanupError) { error += `; browser cleanup failed: ${asError(cleanupError).message}; session stopped`; }
        resolve({ content: [{ type: "text", text: `Error: ${error}` }], isError: true });
      }, timeoutMs);
      this.pending.set(id, { resolve, timer, worker });
      worker.postMessage({ type: "exec", id, code, timeoutMs, requestMeta,turnId:this.resourceOwners.get(worker).id });
    });
  }
}

function resolveNativeCommand(argv) {
  const separator = argv.indexOf("--");
  if (separator >= 0) {
    const command = argv[separator + 1];
    if (!command) throw new Error("expected native MCP command after --");
    return { command, args: argv.slice(separator + 2) };
  }
  const fromEnv = process.env.OPEN_COMPUTER_USE_NATIVE_COMMAND;
  if (fromEnv) return { command: fromEnv, args: (process.env.OPEN_COMPUTER_USE_NATIVE_ARGS ?? "mcp").split(/\s+/).filter(Boolean) };
  const candidates = [
    path.resolve(HERE, "../../dist/Open Computer Use (Dev).app/Contents/MacOS/OpenComputerUse"),
    path.resolve(HERE, "../../dist/Open Computer Use.app/Contents/MacOS/OpenComputerUse"),
    path.resolve(HERE, "../../dist/linux/arm64/open-computer-use"),
    path.resolve(HERE, "../../dist/linux/amd64/open-computer-use"),
  ];
  const command = candidates.find(existsSync) ?? "open-computer-use";
  return { command, args: ["mcp"] };
}

export async function runServer({ command, args }) {
  // Actions return a short status instead of a settle + full snapshot the adapter would
  // discard; state is read explicitly by getAXState(). Runtimes without the flag ignore it.
  const native = new LazyNativePeer({ command, args, env: { ...process.env, OPEN_COMPUTER_USE_ACTION_READ_BACK: "0" } });
  const session = new WorkerJavaScriptSession({ native });
  let buffer = "";
  let requestQueue = Promise.resolve();
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", chunk => {
    buffer += chunk;
    for (;;) {
      const newline = buffer.indexOf("\n");
      if (newline < 0) break;
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if(line) {
        let event;try {event=JSON.parse(line);}catch {}
        if(event?.id===undefined && event?.method==='notifications/turn-ended') {
          native.notify(event.method,event.params ?? {});
          const boundary=session.endTurn();
          requestQueue=requestQueue.then(()=>boundary).catch(error=>console.error(asError(error).message));
        } else {
          const generation=session.turnGeneration;
          requestQueue=requestQueue.then(()=>handle(line,generation)).catch(error=>console.error(asError(error).message));
        }
      }
    }
  });
  async function handle(line,generation) {
    let request;
    try { request = JSON.parse(line); } catch { return send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Invalid JSON-RPC payload" } }); }
    const { id, method, params = {} } = request;
    if (id === undefined) {
      return;
    }
    try {
      if (method === "initialize") return send({ jsonrpc: "2.0", id, result: { protocolVersion: "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "open-computer-use-repl", version: "1" }, instructions: SERVER_INSTRUCTIONS } });
      if (method === "ping") return send({ jsonrpc: "2.0", id, result: {} });
      if (method === "tools/list") return send({ jsonrpc: "2.0", id, result: { tools: toolDefinitions() } });
      if (method === "tools/call") {
        if (params.name === "js_reset") { await session.reset(); return send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: "Open Computer Use JavaScript session reset" }], isError: false } }); }
        if (params.name === "js") {
          if(generation!==session.turnGeneration) return send({jsonrpc:"2.0",id,result:{isError:true,content:[{type:"text",text:"Error: Execution turn ended"}]}});
          const requestedTimeoutMs = params.arguments?.timeout_ms;
          const timeoutMs = Number.isInteger(requestedTimeoutMs) && requestedTimeoutMs > 0
            ? Math.min(requestedTimeoutMs, MAX_TIMEOUT_MS)
            : DEFAULT_TIMEOUT_MS;
          const result = await session.run(params.arguments?.code, timeoutMs, request._meta ?? {});
          return send({ jsonrpc: "2.0", id, result });
        }
        throw new Error(`Unsupported tool: ${params.name}`);
      }
      throw new Error(`Unsupported method: ${method}`);
    } catch (error) {
      send({ jsonrpc: "2.0", id, error: { code: -32603, message: asError(error).message } });
    }
  }
  function send(message) { process.stdout.write(`${JSON.stringify(message)}\n`); }
  let shuttingDown;
  const shutdown = () => {
    if (!shuttingDown) shuttingDown = session.close().finally(() => browserRuntime.close()).finally(() => native.close());
    return shuttingDown;
  };
  const failedShutdown=error=>{console.error(`Session cleanup failed: ${asError(error).message}`);process.exit(1);};
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => { void shutdown().then(()=>process.exit(0),failedShutdown); });
  process.stdin.on("end", () => { void requestQueue.then(shutdown,shutdown).catch(failedShutdown); });
}

export function toolDefinitions() {
  const annotations = { destructiveHint: false, openWorldHint: false };
  return [
    { name: "js", description: JS_DESCRIPTION, annotations, inputSchema: { type: "object", additionalProperties: false, properties: { code: { type: "string", minLength: 1, description: "JavaScript source to execute with top-level await and the initialized cua API." }, timeout_ms: { type: "integer", minimum: 1, maximum: MAX_TIMEOUT_MS, description: "Optional timeout in milliseconds. Defaults to 30000 and is capped at 300000." }, title: { type: "string", minLength: 1, maxLength: 80, description: "Short user-facing description of what this code is doing." } }, required: ["code"] } },
    { name: "js_reset", description: RESET_DESCRIPTION, annotations: { ...annotations, readOnlyHint: true }, inputSchema: { type: "object", additionalProperties: false, properties: {} } },
  ];
}

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  runServer(resolveNativeCommand(process.argv.slice(2))).catch(error => { console.error(`open-computer-use-repl: ${asError(error).message}`); process.exit(1); });
}
