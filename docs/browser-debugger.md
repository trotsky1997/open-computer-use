# Tab CDP capability

```javascript
await tab.goto(url);
await tab.playwright.waitForURL(url);
const cdp = await tab.capabilities.get("cdp");
await cdp.send("Network.enable");
const {cursor} = await cdp.readEvents();
await tab.playwright.getByRole("button", {name:"Load"}).click();
let page = await cdp.readEvents({
  afterSequence:cursor, methods:["Network.requestWillBeSent"], limit:100,
});
while (page.hasMore) {
  // Process page.events before advancing; keep the same filters.
  page = await cdp.readEvents({
    afterSequence:page.cursor, methods:["Network.requestWillBeSent"], limit:100,
  });
}
```

Discover with `tab.capabilities.list()` and read `cdp.documentation()`. This
optional developer surface requires a committed HTTP(S) page. It operates on the
bound tab and automatically attached iframe/worker descendants. Discover selectors
from `Target.attachedToTarget`, then pass either `{target:{sessionId}}` or
`{target:{targetId}}` to send/readEvents. Cross-origin descendants are supported;
unrelated browser targets cannot be selected. Detached children retain buffered
history, while sends to their old sessions fail.

`send(method, params?, {target?,timeoutMs?})` returns the protocol result, including
normal browser protocol errors. Default command timeout is ten seconds; zero uses
the surrounding execution budget without a separate command deadline. All sends
invalidate that binding's higher-level AX and screenshot coordinates. Read fresh
state before ordinary input. A command timeout preserves JS variables and does
not imply cancellation of page execution. `Runtime.terminateExecution` can stop
an explicitly started running script; arbitrary effects/promises/timers are not
rolled back. CPU/renderer and host-crash recovery need broader work.

`readEvents({afterSequence?,limit?,methods?,target?,timeoutMs?})` returns
`{cursor,events,hasMore,truncated}`. Each event includes method, optional params,
sequence and source targetId, plus sessionId for child sources. Omitting a cursor
starts at the current position. Limit is 1...1000. A positive timeout waits for
matching events; zero returns immediately. Filters apply before pagination, and
an exhausted page advances the cursor through nonmatching events too. Buffers
retain at most 2048 events and eight MiB per capture. Oversized events are dropped
with a cursor boundary; older requested history reports truncated. Main-page
origin changes evict prior history and child-session bindings while retaining a
monotonic cursor. Navigate with the normal tab API before debugging a new origin.

The current policy supports Accessibility, CSS, DOM, DOMDebugger, DOMSnapshot,
Debugger, Emulation, Fetch, Log, Network, Overlay, Page, Performance, Profiler,
Runtime, Security and WebAudio domains. Security is limited to enable/disable.
Browser/Target/Input, global cookie/cache commands, Network cookie-write methods, cookie URL or
domain overrides, Network.loadNetworkResource and non-HTTP navigation are refused.
This explicit provider policy still needs a broader reference-command matrix;
matching the method signatures establishes only this implemented surface.

Connections, event buffers, attached sessions and pending reads belong to the
execution-turn resource owner in both session implementations. Reset, endTurn,
timeout and close cancel discovery and close captures. Retained facades open fresh
captures next turn. Debugger pause release on disconnect has real Chrome evidence.
Connection loss requires reset/reconnection instead of silently reusing old
history. A discovery request canceled before dispatch cannot send a late command.

Raw CDP is trusted developer access and can mutate DOM, change/intercept requests,
pause execution or alter persistent browser/page state. It does not provide a
read-only evaluation sandbox, automatic rollback or user-consent enforcement.
Higher-level APIs remain the normal interaction surface. As with other arbitrary
Node.js code, lifecycle guards do not isolate an adversarial script. Managed tab
retention/close checks apply to the lifecycle API; low-level developer operations
remain privileged.

## Verification

```sh
node --test scripts/node-repl/*.test.mjs
OPEN_COMPUTER_USE_CDP_URL=http://127.0.0.1:9222 node scripts/run-cdp-smoke.mjs
```

Use disposable Chrome with site isolation enabled. The live smoke covers source
and Worker sessions, HTTP guard/retry, commands, filtered pagination/waits,
bounded eviction, cross-origin iframe and worker selectors, detached history,
origin changes, command-timeout recovery, paused-page release and turn/reset
cleanup. Source/Worker turn and native-free CLI/MCP regression smokes also run.
Headful/native desktop, other browser transports, full command-policy parity,
shared/service worker edge cases and renderer/host-crash recovery remain open.
