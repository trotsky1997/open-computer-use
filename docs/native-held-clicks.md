# Native held input

The current reference API exposes click options `key` and `durationMs`. The key
stays held across the full click sequence; each mouse press lasts durationMs.
This contract was read from the live computer-use API documentation on 2026-10-30.

```javascript
const app = await cua.getApp(appName);
await app.click(elementIndex, {key:"shift", clickCount:2, durationMs:100});
await app.pressKey("shift+Return", {durationMs:100});
await app.getAXState();
```

The macOS backend now implements targeted PID-posted held clicks. `auto` selects
`app_post` for these options, preserving real press/release semantics instead of
an accessibility action. Explicit accessibility/sky_click/global methods reject
held options before input. The synthetic fixture bridge also rejects them; use
an independently hosted native app to test real events. Keys use the existing
native key syntax, including modifier-only chords such as shift+cmd and ordinary
keys such as super+a. Duplicate keys are held once. The current native key map
still defines supported spellings.

Click counts are integers 1...3. Duration is finite non-negative milliseconds,
and zero is allowed. Omitting duration retains a short default press. The SDK
normalizes l/r/m mouse aliases and rejects malformed/unknown options. It checks
the native click schema before sending held options: stale backends and the current Windows backend fail explicitly. Linux now
advertises these options through verified visible X11 input; see
[Linux held clicks](linux-held-clicks.md) for mapping, routing and live evidence.
Raw Windows calls reject these options before platform input. Windows support
remains open.

Native macOS pressKey also accepts durationMs through the JS facade and
press_key.duration_ms through raw MCP. It holds the full chord for that duration,
then releases in reverse order. Modifier-only keys are supported. The auto route
uses targeted private-source events; sky_key and the synthetic fixture bridge
reject explicit duration before input. Ordinary auto key presses use the same
release registry with zero added dwell and retain their existing settle behavior.
No synthetic repeat is generated. The native key map defines supported names and
layout behavior still requires broader verification.

The SDK validates the native key options and checks press_key's duration schema.
Linux now advertises timed pressKey through the same verified visible X11
key ownership used for its held clicks; see [Linux held input](linux-held-clicks.md#timed-presskey).
Raw Windows key calls still reject duration_ms before platform work. Windows
timed key delivery remains open.

Mouse release and reverse-order key release are registered before each down
is sent. Release bypasses normal action authorization so cancellation or a
revoked session can still release already-held input. App-agent requests now
carry a separate disconnect validator in both protected and ordinary sessions;
the protected authorization and capture policy are unchanged. Signal handling
is registered before the MCP handshake admits requests. SIGTERM/SIGINT and application
termination release active held events before exit. Host replacement/reset waits
for native process exit; lazy startup and source-level sessions share that
cleanup barrier. The outer JS execution deadline controls held operations.
Persistent app-agent input checks inspect the client socket directly; drain
confirmation still completes asynchronously; confirming its
drain acknowledgement before reset returns remains part of live proxy validation.

This covers graceful cancellation. SIGKILL, a hung event-post call, host/process
crashes, legacy input paths and cross-process native-app/browser ownership need
further work. Private event-source routing and real background UI behavior need
native live evidence; system keyboard/focus isolation is not yet established.

## Verification

```sh
node --test scripts/node-repl/*.test.mjs
scripts/tests/run-native-held-input-check.sh
node scripts/tests/macos-held-click-smoke.mjs .build/debug/OpenComputerUse
```

The assert-based Swift check links the actual debug product and emits no GUI
events. It verifies modifiers across double clicks, per-press timestamps,
cancellation/shutdown release order, argument validation and capture-policy
preservation. Real stdio subprocess checks verify the held schema and SIGTERM/
SIGINT exit handlers without GUI input. Its build wrapper currently uses the Swift 6.4 native build layout.
The installed Command Line Tools lack XCTest, so the repository Swift XCTest
suite could not run here. Node checks cover both session types, unsupported
schema rejection and native replacement waiting for graceful termination.

The live smoke builds an independent bundled AppKit fixture with a unique bundle
ID, checks real mouse/key events, modifier-only/chord timing and resets during
held input. A read-only locked-use status probe now validates GUI-session and AX
readiness before starting the fixture; resolving a nonexistent app is not a
session-readiness probe. It exercises direct
stdio mode; signed app-agent/proxy mode needs its own follow-up verification. Its preflight
currently stops because the Mac is locked, despite existing AX/capture
permissions. It changes no lock or permission settings. Run it after normal
unlock to establish native event, background/focus and cancellation evidence;
current implementation/build checks do not establish full native parity.

Windows Go protocol tests pass on this host. The new Linux unsupported-option
check passes, while the full Linux Go suite hits its existing Linux-only bridge
check when run on macOS; this is not native Linux desktop evidence.
