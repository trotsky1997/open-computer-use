# Browser history queries

```js
const browser = await cua.getBrowser({id: 'cdp'});
nodeRepl.write(await browser.history({
  from: '2026-10-29T00:00:00Z',
  to: new Date(),
  queries: ['project documentation', 'example.com'],
  limit: 30,
}));
```

Use history only when it serves the user's request, with focused keywords and
dates. Each keyword string uses Chrome's native title/URL search; separate strings
are combined with OR. The result contains one latest matching visit per URL,
sorted by descending `dateVisited` (ISO timestamp), with `url` and optional
`title`. Query results are returned to the requesting host; the extension adds
no result log or persistent cache. Management audit records exclude history reads.
There is no history mutation API.

Bounds accept valid date strings or Dates, including REPL cross-realm Dates.
Defaults are the last 24 hours and 100 URLs; the maximum limit is 1000, with up to
20 non-empty keywords of at most 200 characters each. Empty keyword lists query
the date window. Unknown options, invalid dates, reversed bounds and invalid
limits fail before browser IO. Native Chrome search supplies date-window
candidates; when its returned global `lastVisitTime` lies outside the window,
`getVisits` selects the latest visit within the requested bounds. Own extension
pages and private bootstrap markers are filtered. The returned JSON is capped
at 6 MiB; a larger result requires a narrower query.

## Permission and setup

History uses the [bundled Chrome bridge](browser-session.md), protocol 3 and
Chrome/Chromium 137+. Reload an older extension after updating it. `history` is
an optional permission, disabled until the user opens the extension's options
page and presses **Enable history access**. Chrome's permission request runs
inside that button gesture. **Remove history access** revokes it. The options
page only reports permission status and never queries history.

A denied permission fails explicitly; queries never request permission or grant
it automatically. The worker checks permission before searching and before
returning rows. Chrome's [history API](https://developer.chrome.com/docs/extensions/reference/api/history)
and [optional permission API](https://developer.chrome.com/docs/extensions/reference/api/permissions)
supply these native operations. Existing required extension permissions remain
unchanged; no host permissions or remote endpoints are added.

## Cancellation and lifecycle

History reads have a 10-second observation budget. Each request has an independent
identity; reads can run concurrently without blocking the management queue.
Timeout, turn end, reset and close ask the worker to cancel that identity and
wait for its acknowledgement before releasing the owner. The worker checks this
flag around every native await and before returning rows. An already accepted
Chrome API call may finish; the canceled request schedules no following history
operation and returns no history rows. Unacknowledged cancellation retains host
ownership for cleanup retry. A lost worker/transport requires recovery before
that retained owner can be released. Other owners are left running.

## Validation

```sh
node --test scripts/node-repl/*.test.mjs
# Only an owned disposable profile, with synthetic history and history enabled:
OPEN_COMPUTER_USE_CDP_URL=http://127.0.0.1:9222 node scripts/run-history-smoke.mjs
# Separate disposable profile with the production optional permission ungranted:
OPEN_COMPUTER_USE_CDP_URL=http://127.0.0.1:9223 node scripts/run-history-smoke.mjs --permission-denied
```

macOS headless Chromium 141 passed both source and Worker sessions: native
multiple visits, an older date window after a later repeat visit, OR queries,
limit/order, cross-realm Date bounds, argument rejection, acknowledged cancellation
with a deferred native call and next-turn reuse. The production manifest passed
denial and the options-page disabled/enabled-button state. Positive native tests
used a disposable copy declaring `history` as required, allowing synthetic data
checks without an automated optional-permission grant. Fixtures and profiles were
removed. Browser selection/lifecycle, native windows/tabs/groups/bookmarks/audit (including
worker restart and 32-second idle survival) and native-free CLI/MCP regressions
passed.

A real user-profile optional-permission grant/revoke flow, headful/platform
coverage and reference-provider visit cardinality remain unverified. This
implementation explicitly deduplicates URLs. Full extension/in-app transport,
claims/takeover, WebMCP and the wider harness goal remain open.
