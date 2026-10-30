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
session may observe an owned tab, but cannot change its retention or close it.

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

Direct `PersistentJavaScriptSession` and standalone `createBrowserApi` close
created tabs at disposal, respecting marks. Source-session reset keeps tab
ownership, while standalone disposal ends that API's lifetime. Direct source
turn notifications and idle context retention, user takeover integration,
provider-specific claims, extension/in-app transports, crash recovery and
headful/cross-platform behavior still need work.

## Verification

```sh
node --test scripts/node-repl/*.test.mjs
OPEN_COMPUTER_USE_CDP_URL=http://127.0.0.1:9222 node scripts/run-turn-smoke.mjs
```

Use disposable Chrome. The live smoke checks user preservation, popup ancestry,
latest marks, resuming/re-marking, stale callback denial, held-key and viewport
cleanup, retained close failures and retry, direct source reset/close, and the
real MCP notification path. Other feature fixtures explicitly retain pages that
they inspect after session close, and close those disposable pages afterward.
