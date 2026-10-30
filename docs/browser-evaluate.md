# Read-only browser evaluation

```js
await tab.playwright.evaluate(() => ({
  title: document.title,
  headings: Array.from(document.querySelectorAll('h1'), node => node.innerText),
}));
await tab.playwright.getByRole('link').first().evaluate((node, prefix) => ({
  text: prefix + node.textContent,
  href: node.href,
}), 'Link: ');
await tab.playwright.locator('.item').evaluateAll(nodes => nodes.map(node => ({
  text: node.textContent,
  color: getComputedStyle(node).color,
})));
```

All three calls accept a function or expression string, an optional data argument
and `{timeoutMs}`. Functions are serialized and have no access to REPL lexical
variables. Single-element locators require exactly one match. Collection calls
receive an array, including an empty array when nothing matches. Frame locators
retain their frame's document/window scope even for an empty collection.

## Isolation and reads

User source executes in a dedicated Worker using the pinned QuickJS WASM engine.
It never executes in the live page or Node's VM. The worker receives serialized
values and an RPC bridge, without process environment or inherited Node flags.
The only browser RPC destination is a host-owned reader with explicit DOM read
properties and methods. A separate Chrome isolated world supplies native DOM
getters/methods, so main-world overrides do not supply evaluator code or getters.
Read getters and methods come from trusted native descriptors across realms;
same-origin parent pointers retain browser origin checks. In-process descendants
use their nearest process-owning frame session. DOM references are private to one invocation; source and Worker REPL sessions use
the same host controller. This scopes the `evaluate` APIs; the surrounding REPL
and explicit developer CDP commands retain their existing capabilities.

Supported reads include native CSS selectors, text/HTML, attributes, dataset,
classes, traversal, open shadow roots, current form values, geometry, styles,
selection/ranges, media state, document metadata and viewport values. `window`,
`document` and `location` are read facades; `getComputedStyle`, `getSelection`,
`matchMedia` and `CSS.escape` use native reads. `Element` type checks and Node
constants are supplied. Collections and rectangles are local data copies.
Returned elements become `{id,tagName,textContent}` summaries. A property outside
the explicit schema is unavailable; unsupported calls fail normally.

Live setters and mutation methods cannot cross the bridge. Page network,
storage, event dispatch, page-defined functions and Node APIs are unavailable.
Function-constructor or module syntax executes only within the separate engine
and cannot acquire page/Node globals. Local JavaScript data can change normally.
Local `URL`/`URLSearchParams` parsing and `setTimeout`/`clearTimeout` support
extraction and asynchronous computation without navigation or page timers.
Pending timers are discarded when the invocation finishes. Timer callbacks must
be functions; string timer source and intervals are unavailable.

Arguments/results support plain objects, arrays, undefined, special numbers,
BigInt, Date and RegExp; cyclic values, functions and unsupported object types
fail explicitly. Sources are limited to 1 MiB and argument/result/bridge messages to
16 MiB. Each interpreter has a 64 MiB QuickJS heap and a 1 MiB stack limit.
QuickJS syntax support can differ from the connected browser.

## Deadlines and ownership

The default deadline is 10 seconds for setup and evaluation. `timeoutMs:0`
disables this deadline; the enclosing JS call budget and turn/reset/close still
cancel it. Browser discovery has its own maximum 10-second connection attempt.
CPU interruption is confined to the evaluator Worker. Inner evaluation timeouts
preserve REPL bindings. Native document navigation, same-document navigation,
frame detachment, main renderer crash, tab closure and turn cleanup cancel pending work, terminate the interpreter,
close the browser connection and release owned DOM references.

All browser waits share the cancellation barrier, including object-group cleanup.
A protocol reply may never arrive after disconnect; a confirmed disconnect frees
that session's references and ends the canceled wait. Failed disconnects retain
ownership for cleanup retry. Reads happen at separate moments against current native state; ordinary DOM
updates may appear between reads.

Locators use Playwright's resolved native handles, including shadow and iframe
scopes. A small pinned `toImpl` bridge retrieves the backend node identity; it
needs review when upgrading Playwright. The binding retains that exact backend node identity.

## Evidence and remaining coverage

`node --test scripts/node-repl/*.test.mjs` checks scope/data validation, deadline
cancellation during a missing protocol reply, disconnect retry and staged WASM
runtime/dependency loading. Against disposable headless Chrome:

```sh
OPEN_COMPUTER_USE_CDP_URL=http://127.0.0.1:9222 node scripts/run-evaluate-smoke.mjs
```

The smoke covers both session classes: live input/style/shadow reads under
main-world getter poisoning; exact/strict/regex/composed locators; cross-origin, nested in-process
and empty-list frame scopes; local timers/URL; writes, network and constructor/
module escape attempts; a CPU deadline after an observed completed DOM read;
navigation, frame-detach, renderer-crash and turn cancellation after confirmed
interpreter execution; and reset/reuse. Broader DOM schema/provider/ECMAScript compatibility, automatic crash recovery
and mixed-platform behavior remain open. The overall harness goal remains active.

Engine reference: [QuickJS embedding and lifecycle documentation](https://github.com/justjake/quickjs-emscripten).
