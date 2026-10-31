# Linux held input

Linux advertises native click `key` and `duration_ms`; the JS facade discovers
these as `key` and `durationMs`:

```javascript
await app.click(index, {key: 'shift+ctrl', clickCount: 2, durationMs: 150});
await app.click([100, 80], {key: 'ctrl+a', durationMs: 0});
```

Keys stay down across the whole sequence; each mouse press dwells for durationMs.
Zero is allowed. Omitting duration adds no dwell to the existing short click.
Click counts remain 1..3, with left/middle/right mouse buttons. Explicit held
options use real events and bypass default accessibility actions. `auto` uses
[verified visible X11 input](linux-click-input.md); explicit `global` keeps its
opt-in flag and uses the same verification. `accessibility`, `app_post` and
`sky_click` reject held options before input. Windows support remains open.

Chord parsing supports modifier aliases ctrl/control, shift, alt and
super/win/cmd; named keys use the existing native key names. Empty components are
rejected and duplicate physical keys are held once. ASCII letter names identify
the physical letter key. Each keysym must round-trip through a primary keycode in
the current native layout. Missing/shifted-only mappings and lock/toggle keys are
rejected before pointer input. This avoids temporary keymap replacement. Layouts,
IME and shifted symbol coverage remain limited to the verified primary mapping.

The runtime checks the logical keyboard map before starting, confirms native
frame/pointer/key/modifier/button state during dwell and before subsequent clicks,
and stops on a mismatch. Modifier masks come from the native modifier map.
[XQueryKeymap](https://xorg.freedesktop.org/archive/current/doc/libX11/libX11/libX11.html)
reports logical state, which can lag physical state when processing is frozen.
Sequential checks cannot provide exclusive input ownership; concurrent hardware
input, remapping and newly acquired grabs can race them. Native auto-repeat and
system shortcuts remain possible while ordinary keys are held.

Each attempted down is registered before delivery. Cleanup attempts mouse release
first, then every attempted key release in reverse order, including cancellation
and failed sends. A failed key release does not skip the other key releases.
[Native cancellation](linux-native-cancellation.md) stops the remaining sequence;
reset/close waits for child exit. The ordinary 30-second operation allowance is
extended by requested total mouse dwell, within the native timer range. The host
execution deadline still controls a live call. A hard kill or hung backend can
prevent confirmed release. Accepted UI effects remain applied; inspect before
retrying. No automatic replay or clipboard fallback is used.

Private GTK checks in both REPL modes verify modifier-only and ordinary-key
chords, duplicate keys, exact mouse modifier state, per-press receiver timestamps,
key ownership across double clicks, reverse key releases, zero dwell, invalid
rejection, mid-hold reset/close and successful fresh global input. Targeted checks
cover native mapping/keyboard bits, existing-key rejection, cancellation and
release failure. Other providers, real window managers/hardware, background,
composited/Wayland input remain open or unverified.

```sh
# Inside an owned D-Bus/Xvfb desktop with AT-SPI enabled:
node scripts/tests/linux-held-click-js-smoke.mjs ./open-computer-use-linux
```


## Timed pressKey

Linux also advertises press_key.duration_ms / `app.pressKey(key, {durationMs})`.
Explicit duration holds the whole chord using the same native mapping and
reverse-release scope as held clicks. Modifier-only chords, duplicate keys and
zero duration are supported. Auto is the supported method; sky_key fails before
input. A prior AX-only observation is sufficient. The current route requires the
selected active exposed local noncomposited X11 frame and confirms its native
keyboard focus. It reads input state without moving or clicking the pointer.

Native frame, logical held keys and modifier/button state are checked during the
hold. Focus/frame/input changes stop the hold and trigger reverse releases. The
operation allowance includes requested dwell. Ordinary pressKey without explicit
duration retains the existing AT-SPI delivery path. This new verified route does
not add background, compositor/Wayland or wider keymap/IME support.

Both source and Worker GTK checks cover modifier-only and ordinary-key chords,
receiver timestamps, reverse releases, duplicate keys, zero duration, AX-only
use, inactive/occluded/invalid rejection, mid-hold reset/close and successful
fresh input after reset. The fixture receives no mouse events. Targeted checks
verify no pointer synthesis, partial-down failure, focus failure, cancellation
cleanup and no legacy replay after an attempted verified-key failure.

```sh
node scripts/tests/linux-held-key-js-smoke.mjs ./open-computer-use-linux
```
