# Browser held input

```javascript
await tab.click(elementIndex, {key:"shift", durationMs:100, clickCount:2});
await tab.pressKey(null, "shift+Down", {durationMs:100});
await tab.getAXState();
```

The raw CDP tab pressKey wrapper accepts durationMs, including for modifier-only
keys. All pressKey calls use host ownership, even when duration is omitted.
The optional element index is resolved against fresh AX identity, then focused
after the host acquires the input lease; null uses the current focus. The entire
chord stays down for the duration, with one primary down and no synthesized
auto-repeat. Keys release in reverse order. Navigation or scroll admitted by
the primary key can complete before release; document changes before another
key down abort the remaining sequence. Platform auto-repeat and broad keyboard
layout behavior require further verification.

All raw CDP tab clicks use host ownership, including calls without options, button aliases and multi-clicks. The wrapper accepts key/durationMs alongside mouseButton and
clickCount. Key stays down across the entire sequence; each press lasts at least
durationMs. Duration is finite and non-negative, with no added dwell when omitted.
Click counts are integers 1...3, and l/r/m button aliases normalize to full names.
Modifier aliases include alt/option, ctrl/control, meta/super/cmd/command and shift,
with _l/_r spellings for side-specific modifiers. Named and printable primary
keys use the existing browser key parser; its full keyboard/layout coverage
remains open. Ordinary keys are delivered to the current focus before clicking.

The host verifies input/cancellation/dialog/focus protocol support before dispatch.
It owns the input connection, pressed keys/buttons, duration wait and
virtual focus lease. It validates document/viewport/content geometry before new
presses. Once down, content-size and scroll effects are admitted while the loader
and coordinate viewport remain stable for release. Explicit viewport revisions and screenshot
crop/DPR mapping remain enforced. Input uses trusted CDP events, with reverse key
release and no text/editor commands on key-up.

Managed pointer drags, key presses, held clicks and HTML/file drops share a configured-origin input lease.
New raw tab input and locator actions fail while that lease is active; read-only
observations from existing bindings remain available. The lease coordinates one host process. External
clients, pre-existing legacy gestures, native-app input and clipboard management
retain their separate boundaries and need broader ownership work.

JavaScript dialogs return control through getJsDialog(), and the pending sequence
continues after the response. Owned metadata requests have no independent
10-second timer that could interrupt a dialog; active JS calls retain their
outer execution budget. Session reset/timeout/close aborts remaining stages and
closes the work connection. Cleanup uses a fresh controller to release buttons
outside the target without a preceding move, cancel native dragging and release keys before restoring
focus. Dialogs triggered by cleanup are dismissed with a bounded drain.

Releases can still run page handlers or finish effects of an already admitted
press; cancellation does not roll back page changes. Uncertain acknowledgements
can require repeated releases, while new presses are never replayed. Failed
cleanup retains pointer/focus ownership, stops the session, and permits a reset
retry after the failure is resolved. Browser/host crashes, focus-loss dialogs,
headful and broad cross-platform behavior remain open.

## Verification

```sh
node --test scripts/node-repl/*.test.mjs
OPEN_COMPUTER_USE_CDP_URL=http://127.0.0.1:9222 node scripts/run-held-input-smoke.mjs
```

Use disposable Chrome. The live smoke checks trusted events, modifier/key-up
order, per-press duration, targeted and ordinary-key typing, key-triggered navigation/scroll, prompts held beyond ten seconds,
release-triggered dialogs, cancellation over draggable targets, pointer/drop exclusivity, reset/timeout/close release,
failed cleanup with blocked reuse and retry, explicit viewport/cropped-pixel
coordinates and in-process sessions. Mac headless Chrome evidence is recorded
in the task history; headful/hardware keyboard state remains unverified.

## Host-owned pointer drag

`await tab.drag(fromPixels, toPixels)` resolves both points against a fresh
viewport screenshot, then transfers the gesture to BrowserInputs outside the
Worker. The host validates both endpoints and the initial geometry before input,
acquires the shared origin pointer lease and virtual focus, and interpolates
trusted left-button motion. The initial move uses `button: "none"`: Chromium
adds the button flag to the buttons mask, so `button: "left", buttons: 0` would
report a held move before the actual press. See the [Chromium dispatch implementation](https://github.com/chromium/chromium/blob/158.0.8127.2/content/browser/devtools/protocol/input_handler.cc#L454).

After the down, drag handlers may change content size or scroll the document.
Navigation, viewport size/zoom/offset changes and explicit viewport revisions stop
further motion. Normal release uses the destination. Turn end, reset, timeout,
close or Worker exit stops remaining moves and uses the existing fresh-controller
outside release, drag cancellation and focus restoration. Release failures keep
the input lease and block competing input until cleanup succeeds; no new press
or motion is replayed. Successful drags restore focus before returning.

```sh
node scripts/run-pointer-input-smoke.mjs
```

The controller checks trusted down/move/up events and visibility at the receiver,
content resizing during motion, post-drag screenshots, turn/reset/timeout/close
and Worker-exit cleanup, competing input and failed-release retry in both JS hosts.
macOS and Linux Chrome 158 pass all thirteen cases per platform. Windows/headful,
external clients and broader HTML native-drag/drop behavior remain unverified.
Linux's headless screenshot configuration is described in [browser CDP](browser-cdp.md#headless-screenshot-rendering).


The pointer controller also checks ordinary AX-index and coordinate clicks,
right-button aliases and three-click counts. A default click that opens a prompt
on down remains host-owned across turn/reset/timeout/close and Worker exit.
Release failure retains ownership and blocks competing input until reset succeeds.
The already admitted down is never replayed. A press-triggered navigation or
viewport change aborts remaining stages and releases outside; inspect the new
page/state before retrying. Thirty click/drag cases pass per macOS/Linux platform
across both JS hosts, including press-triggered content growth and document scroll.


## AX click preparation

AX-index clicks transfer the observed backend-node ID, role/name and document
identity to BrowserInputs. The host acquires the origin input/focus lease before
revalidating the AX node, scrolling it into view and resolving its point. The
lease stays held through press/release and cleanup, so a competing actor cannot
enter between the scroll and the press. Scrolling may change page offsets and
content size; a changed loader, coordinate viewport or viewport revision stops
preparation. The resolved point and geometry are checked before pressing.

Reset and Worker exit during preparation stop later stages, restore focus and
release ownership without pressing. An already accepted scroll can remain after
cancellation. Point resolution uses a browser isolated world for its bounding-box and
hit-test calls, fencing page-world prototype and instance overrides. It requires
the resolved node to belong to the main document; child-frame transforms, native
geometry and coordination with external CDP clients remain open. Temporary resolved-node handles are released.

The pointer controller now runs 53 cases per macOS/Linux platform. Five added
cases use a real offscreen button and pause the host after native scrolling to
check competing-input rejection, successful completion and reset/Worker-exit
cancellation before any down. The installed-runtime smoke also clicks an AX
textbox and verifies typing into its resulting focus after source removal.


## Isolated AX point geometry

BrowserInputs creates an isolated world using the verified main frame ID and
resolves the native backend node into that execution context. The fixed point
resolver runs there with DOM getters/methods independent of page-world JavaScript.
Missing isolated-world capability or an invalid context stops the click; there
is no page-world fallback. Existing lease, viewport and cancellation guards stay
in place. The temporary resolved-node object is released before input.

Four added real-browser cases overwrite both prototype and instance geometry,
hit-test and containment methods. An uncovered target still receives the trusted
click at its actual point; an overlay causes refusal without a down. The same
fixture under the previous implementation delivered a trusted down to its decoy.
Installed-runtime flows also use a page whose geometry/hit-test methods throw.
This verifies isolation from those overrides; arbitrary DOM/layout changes and
external clients can still race between measurement and input.


## Recheck before each down

Every managed pointer action checks document/geometry again after the initial
unpressed move. AX clicks also revalidate the observed role/name/backend node and
use the isolated-world hit test at the original point before each new down.
Rechecks do not scroll, recompute a center or silently move to the target's new
position. A moved/covered/renamed target stops the sequence and requires a fresh
observation. This applies to the second and third press of a multi-click too.

Fourteen added real-browser cases cover hover-driven movement, overlays with a
held Shift key, AX name changes, first-click name/movement changes and
content-size changes on coordinate click/drag. They assert actual receiver
presses, clicks and balanced key releases; multi-click changes allow only the
first already completed click. A pre-change control on each platform recorded a
trusted background click after the button moved away during the initial move.

CDP inspection and event dispatch remain separate commands. Arbitrary concurrent
layout/handler changes can still occur after the final check. The harness aborts
observed changes and preserves admitted effects; atomic browser-side target
fencing, child-frame transforms and external-client coordination remain open.
