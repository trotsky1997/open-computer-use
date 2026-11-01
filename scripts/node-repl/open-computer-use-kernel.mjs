import {AsyncLocalStorage} from "node:async_hooks";
const nativeOwner=new AsyncLocalStorage();
import { parentPort } from "node:worker_threads";
import { JavaScriptKernel } from "./open-computer-use-repl.mjs";

const channel=parentPort??{postMessage:message=>{if(process.connected)process.send(message);},on:(...args)=>process.on(...args)};
if(!parentPort)process.on('disconnect',()=>process.exit(0));

let nextNativeId = 1;
let activeTimeoutMs;
const pendingNative = new Map();
const native = {
  browserHost: true,
  request(method, params, timeoutMs = activeTimeoutMs) {
    const id = nextNativeId++;
    return new Promise((resolve, reject) => {
      pendingNative.set(id, { resolve, reject });
      channel.postMessage({ type: "native_request", id, method, params, timeoutMs,turnId:nativeOwner.getStore() });
    });
  },
};
const session = new JavaScriptKernel({ native });

channel.on("message", async message => {
  if (message.type === "native_response") {
    const pending = pendingNative.get(message.id);
    if (!pending) return;
    pendingNative.delete(message.id);
    if (message.error) pending.reject(new Error(message.error));
    else pending.resolve(message.result);
    return;
  }
  if (message.type === "exec") {
    let result;
    try {
      activeTimeoutMs = message.timeoutMs;
      result = await nativeOwner.run(message.turnId,()=>session.run(message.code, 0, message.requestMeta));
    } catch (error) {
      result = { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
    activeTimeoutMs = undefined;
    channel.postMessage({ type: "result", id: message.id, result });
  }
});
