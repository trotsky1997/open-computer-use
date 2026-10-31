# Verified visible X11 drag

Linux `await app.drag([fromX, fromY], [toX, toY])` holds the left button while
moving between window screenshot coordinates. Both endpoints must lie inside the
selected window. Coordinates are rounded to native pixels. A fresh screenshot is
required after explicitly omitting screenshot collection. The route works with
window-ID bindings and application-name bindings and visibly moves the pointer.

The runtime reuses [verified click preflight](linux-click-input.md): exact AT-SPI
window identity/active geometry, native focus/PID/frame/stacking agreement, local
X11 with or without a compositor, no occlusion, neutral input state, available pointer grab and
confirmed pointer placement. Both endpoints are validated before pointer motion.
The legacy AT-SPI global drag route has been removed. No opt-in global fallback
is involved; unsupported desktop routes return an error.

One press is followed by twelve interpolated moves, with 20 ms between steps,
then one release. Between steps the runtime rechecks native frame evidence,
expected previous pointer position, the held left button and other button/modifier
state. Each move is confirmed at its requested native position. A brief server
grab protects verification and the motion request, then releases before the
confirmation query so the WM can replay its passive grab. If the pointer still
has the previous position, a bounded 250 ms poll waits for the queued motion.
Unexpected motion, target/button changes and timeout stop the drag; no motion
is resent. Input delivery uses the [XTest API](https://xorg.freedesktop.org/archive/current/doc/libXtst/xtestlib.html).

An attempted press always has a release attempt, including failed motion,
changed frame/pointer state and cooperative cancellation. Cleanup releases at the
current pointer position without jumping to the requested endpoint. There is no
replay. [Native cancellation](linux-native-cancellation.md) gives reset/close a
bounded child cleanup path; a forced kill cannot confirm release. Already
accepted effects remain applied, so inspect the UI before retrying.

The isolated GTK fixture records actual press/release positions and held-button
motion. Both source and Worker REPLs, without compositing and with xcompmgr + Openbox,
verify bidirectional endpoints, one paired
press/release per drag, no input to sibling windows, outside/omitted/inactive/
occluded/input-only/grab rejection, and actual receiver release during mid-drag
reset/close. Fresh post-reset drag is also verified. Targeted checks cover
numeric validation, native identity/coordinate mapping, frame/pointer/motion
failure and cancellation cleanup.

```sh
# Inside an owned private D-Bus/Xvfb desktop with AT-SPI enabled:
dbus-update-activation-environment DISPLAY XAUTHORITY
XDG_SESSION_TYPE=x11 GDK_BACKEND=x11 \
  node scripts/tests/linux-drag-js-smoke.mjs /path/to/open-computer-use-linux
```

Verification is sequential: concurrent hardware input, newly acquired grabs and
UI changes can race checks. Application drag effects require observation.
Cross-window drag/drop, complex clipping, real window managers, physical devices,
Qt/Electron, broader compositor/WM behavior, Wayland and other platform routes
remain open or unverified. This within-window route does not complete the full
harness parity goal.
