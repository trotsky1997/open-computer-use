# Verified X11 coordinate and indexed scroll

Linux supports both forms:

```javascript
await app.scroll(elementIndex, 'down', 0.25);
await app.scroll([x, y], 'right', 1);
```

Direction is up/down/left/right, case-insensitive, and pages is finite and
positive (default 1). The JS facade checks the native scroll schema for x/y
before sending coordinates; other current native platforms still accept their
existing indexed form. Native calls require exactly one target. Coordinates use
the window screenshot; an explicitly omitted screenshot must be refreshed first.
Indexed scroll uses fresh exact-object geometry and works after AX-only reads.

The old Linux route sent PageDown/arrows to the current keyboard focus and did
not use the supplied element. It has been removed. Click and scroll now share
[verified pointer targeting](linux-click-input.md): live visible/showing indexed
geometry or screenshot point, exact active window identity, native focus/PID/
frame/stacking agreement, no occlusion, neutral button/modifier state, available
grab and confirmed pointer placement on supported local X11, including
composited desktops.
Bounding/Input regions of the native frame and app-PID windows must contain the
target and are rechecked before each wheel pair. This includes input-only holes
that leave screenshot pixels unchanged. Scroll visibly moves the pointer to that target; it does not click or focus it.

The XTest route sends paired logical wheel buttons 4/5/6/7. It checks the native
frame and pointer before each pair and input/error state after each pair. A
failed/cancelled press still attempts release, and later pairs stop without
keyboard fallback or replay. A short interval lets receivers process the wheel.
[Native cancellation](linux-native-cancellation.md) stops/reaps the active child
on reset/close; ordinary operations keep their 30-second allowance. Already
accepted scroll effects remain applied, so inspect the UI after an error.

A page is an approximation: max(1, round(12 * pages)) native wheel steps, rounded
half up and capped at the existing native int32 range. The 12-unit convention
follows the repository's native scroll approximation; X11 wheel steps and macOS
line deltas have different toolkit mappings. This does not promise one viewport
or a precise pixel delta. Native widget settings, scroll limits and acceleration
determine displacement. Very large requests can be interrupted after partial
scrolling. Pixel/smooth scrolling and broader paging calibration remain open.

Private GTK tests without compositing and with xcompmgr + Openbox pass through
both REPLs and verify actual ScrolledWindow adjustment changes
on both axes while an unrelated Entry retains keyboard focus. They check
coordinate/index recipients and root coordinates, fractional/default wheel
counts, no key fallback, AX-only indexed use, outside/omitted/intercepted/grabbed/
occluded/inactive/stale rejection, reset/close stop and fresh post-reset input.
Targeted checks cover native/JS argument validation, schema rejection, exact live
index geometry, four buttons, changed pointer routing and release on failed or
cancelled press. Concurrent input/new grabs can race sequential checks. Wider
clipping, broader window managers/hardware, Qt/Electron, background/
Wayland and other-platform coordinate routes remain open or unverified.

```sh
# Inside an owned private D-Bus/Xvfb desktop with AT-SPI enabled:
node scripts/tests/linux-scroll-js-smoke.mjs ./open-computer-use-linux
```
