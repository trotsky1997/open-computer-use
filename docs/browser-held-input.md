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

The raw CDP tab click wrapper accepts key/durationMs alongside mouseButton and
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
presses and before normal release. Explicit viewport revisions and screenshot
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
node scripts/run-drag-smoke.mjs
```

The controller checks trusted down/move/up events and visibility at the receiver,
content resizing during motion, post-drag screenshots, turn/reset/timeout/close
and Worker-exit cleanup, competing input and failed-release retry in both JS hosts.
macOS and Linux Chrome 158 pass all thirteen cases per platform. Windows/headful,
external clients and broader HTML native-drag/drop behavior remain unverified.
Linux's headless screenshot configuration is described in [browser CDP](browser-cdp.md#headless-screenshot-rendering).
