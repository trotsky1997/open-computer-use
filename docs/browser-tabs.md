# Browser tabs and turn boundaries

```javascript
const tab = await cua.createBrowserTab("cdp", url, {visible:false});
await tab.markDeliverable(); // keep a user-facing result through this turn
await tab.markHandoff();     // latest mark wins; keep unfinished work instead
```

Marks belong to the current execution turn. Both kinds keep an owned tab open
at turn end. The first JS call of the next turn clears previous marks; mark again
when that tab must survive the next boundary. Existing user tabs remain open
without a mark. Marking one does not transfer its lifecycle ownership. A different
session may observe an owned tab, but cannot change its retention or close it through managed lifecycle APIs. Raw
developer CDP and arbitrary Node.js remain privileged, as described in
[tab CDP capability](browser-debugger.md).

The host records created target IDs before returning control to the Worker. It
observes popup opener IDs, including nested popups, and reconciles live browser
targets before cleanup. A unique temporary about:blank fragment identifies a
creation whose acknowledgement was lost. An uncertain outcome retains ownership
and stops reuse until discovery/cleanup can resolve it. Definite CDP errors are
reported without retaining a speculative creation. New tabs navigate to the
requested URL after registration; markers do not appear in returned tab metadata.

`js_reset`, JS timeouts and Worker replacement preserve logical tab ownership.
`WorkerJavaScriptSession.endTurn()` first releases native/browser resources,
then closes unmarked owned tabs and popups. It preserves marked tabs and never
closes pre-existing user tabs through automatic cleanup. Failed cleanup retains
records for retry and blocks the next JS call; `reset()` retries the boundary.
Closing the host session performs the same cleanup and detaches marked survivors,
leaving their pages open after the session has gone away.

Idle turn boundaries retain the JS context and tab/browser variables. Browser
resources acquire fresh per-turn owners, and dialog capture is re-established
when a retained binding is next used. Proxy requests carry their originating
AsyncLocalStorage turn ID; callbacks from an ended turn cannot perform later
native/browser API actions, including tab close. An active JS call or unfinished detached browser action is interrupted
by terminating its Worker, so that interrupted context is replaced. Arbitrary
Node.js code is trusted and is not a security sandbox.

The MCP adapter handles `notifications/turn-ended` immediately, including while
JS is running. Earlier queued JS calls are rejected; subsequent calls wait for
the cleanup barrier. The next call begins a new turn. `close()` and MCP shutdown
also release resources. A host that sends no boundary notification receives
session-close cleanup, with its whole connection acting as one turn.

`PersistentJavaScriptSession.endTurn()` now uses the same host request dispatch,
resource release order and tab ownership as the Worker session. Calls serialize;
idle JS bindings survive, queued earlier calls fail, and the first call of the
next turn obtains a fresh resource owner. Native/browser calls carry their
originating evaluation owner, so old source callbacks also fail. Interrupted
async evaluations reject and discard their REPL context. Timeouts wait for reset
cleanup before returning; failed cleanup blocks reuse and can be retried with
`reset()` or `endTurn()`. Source-session reset keeps logical tab ownership.

In-process execution cannot preempt a CPU loop that blocks its own event loop,
and discarding a REPL does not stop arbitrary Node.js promises or timers. Use
`WorkerJavaScriptSession` when termination is required. Managed input is canceled
and its releases acknowledged before the source turn finishes. Standalone
`createBrowserApi` disposal still ends that API's lifetime and closes unmarked
created tabs after resource cleanup. User takeover, exclusive claims,
extension/in-app transports, crash recovery and headful/cross-platform behavior
remain open.

## Verification

```sh
node --test scripts/node-repl/*.test.mjs
OPEN_COMPUTER_USE_CDP_URL=http://127.0.0.1:9222 node scripts/run-turn-smoke.mjs
OPEN_COMPUTER_USE_CDP_URL=http://127.0.0.1:9222 node scripts/run-turn-smoke.mjs --source
```

Use disposable Chrome. The live smoke checks user preservation, popup ancestry,
latest marks, resuming/re-marking, stale callback denial, held-key and viewport
cleanup, retained close failures and retry, direct source reset/close/turns and timeout release barriers, and the real MCP
notification path. Other feature fixtures explicitly retain pages that
they inspect after session close, and close those disposable pages afterward.


Close requests admitted against a live target can race target destruction. The
host reconciles a protocol close error with a fresh target snapshot. An absent
target satisfies the close; a still-live target or unverified snapshot failure
retains ownership and reports the error for retry.


Browser namespaces, native selected-tab identity, fresh title/URL getters and
logical session labels are described in [browser session metadata](browser-session.md).
The extension bridge uses a transient private bootstrap tab through the same
controller. It closes before the worker serves selection/management requests;
turn cleanup disconnects the worker and joins accepted changes.


A close acknowledgement is followed by bounded confirmation that the exact target
ID disappeared. Target-list lag is handled without resending close or counting
the same closing target as a newly opened popup. A target that remains available
after the deadline retains ownership and reports the close failure.
