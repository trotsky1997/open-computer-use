# Verified visible X11 clicks

Linux `app.click(pointOrIndex, options)` now routes basic physical clicks through
XTest after verifying the selected native frame and actual pointer target. The
route supports left/middle/right buttons and click counts 1..3. Points use the
current window screenshot's pixel coordinates. Use fresh AX indexes after a
screenshot-only observation; coordinate actions need a screenshot when the last
observation explicitly omitted it.

`auto` uses a usable default accessibility action for a single left click.
If no usable default action exists, it uses verified pointer input. An attempted
accessibility action returning failure raises an error without replaying the
click through the pointer. Explicit `accessibility` supports one left click;
`global` keeps its existing `OPEN_COMPUTER_USE_ALLOW_GLOBAL_POINTER_FALLBACKS=1`
requirement and uses the same verified route. `app_post` and `sky_click` remain unsupported on Linux.
[Held key/chord and duration options](linux-held-clicks.md) use verified physical
events through auto/global and bypass semantic actions.

The current route shares [visible-window verification](linux-window-images.md):
local, noncomposited X11; sole active AT-SPI window and unique geometry; native
focus/PID/frame agreement; no intersecting mapped window above it. Bounds changes,
missing evidence and unsupported frame layouts fail before input. Indexed
fallback requires an exact current native object, VISIBLE/SHOWING state and
positive live geometry. It never selects a same-name replacement or reuses the
old element rectangle. App-specific clipping/overlap and effect validation still
need broader provider coverage.

The helper checks existing core buttons/action modifiers, briefly probes pointer
grab availability, moves the pointer and verifies its root child/window and pixel
position. An input-only overlay or existing pointer grab is rejected before a
button is sent. Caps/Num/Scroll Lock modifiers are permitted only when the native
modifier map identifies them as locks; their state is preserved.

The server is grabbed during frame verification/pointer placement and released
before button delivery, allowing a window manager to replay passive grabs. Every
attempted press has a matching release attempt, and an unconfirmed attempt stops
the remaining sequence. Native errors and held-button state are reported; there
is no automatic replay. A normal popup or window closure after delivery is
allowed. Read the resulting UI state to verify the intended action.

Physical clicks visibly move the system pointer and leave it at the selected
point. Pointer probes briefly own/release the pointer. Concurrent hardware input,
window movement or a newly acquired grab can race the sequential checks; user
interruption/claim handling remains open. A post-send error can follow a partial
UI effect, so inspect before retrying. Cooperative [native cancellation](linux-native-cancellation.md) has reset/close
and active-child cleanup coverage. Hard interruption and XTest withdrawal can prevent release
confirmation. [Verified within-window drag](linux-drag-input.md) shares the pointer preflight.
Wider keymap/layout, background,
Wayland/composited and wider window-manager/provider routes remain open.

Private Ubuntu arm64 Xvfb checks in both REPL modes verify actual receiving-widget
coordinates, left/middle/right, double/triple click counts and paired releases,
index fallback, real GTK context-menu completion, transparent input-only and
active-grab interception, inactive/occluded/outside/stale rejection. Temporary
GDK grab surfaces are hidden and retained until fixture exit to preserve queued
grab-event references; the process owns and releases those test resources.
Targeted checks cover failed semantic action without replay, fresh/hidden field
geometry, release-on-error, lock classification and invalid native arguments.

```sh
# Inside an owned private D-Bus/Xvfb desktop:
dbus-update-activation-environment DISPLAY XAUTHORITY
XDG_SESSION_TYPE=x11 GDK_BACKEND=x11 \
  node scripts/tests/linux-click-js-smoke.mjs /path/to/open-computer-use-linux
```

The [XTest specification](https://xorg.freedesktop.org/archive/current/doc/libXtst/xtestlib.html)
describes extension discovery and logical button/motion synthesis. Success is
native event delivery evidence; the application effect is checked separately.
