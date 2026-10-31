# Verified visible X11 window images

Linux app screenshots now require verified visible-window evidence for both
window-ID and string bindings. The old unchecked desktop crop and black-pixel
heuristic were removed. A legitimate all-black window can return a valid PNG.
AX observations remain available when capture is unavailable.

The selected AT-SPI window must be the sole active window in its app, with a
unique current rectangle among that app's windows. Its existing bus/object/PID/
process-start identity is checked before and after capture. Titles never select
a screenshot source. The native X11 keyboard-focus ancestry must lead to the same
process and a mapped top-level frame whose full rectangle exactly matches.

A private local Xlib connection verifies stacking and copies pixels while the
server is grabbed, preventing another client's window movement/restacking during
that interval. PNG conversion/compression happens after release. Every exit path
ungrabs the server; native image/property/tree allocations are freed. Checks have
node/depth/pixel budgets and a 250 ms verification budget between synchronous
requests. A blocked X server request can still exceed that budget; the outer
native bridge retains its existing process timeout. Remote/forwarded DISPLAY
connections are rejected. This route needs libX11 and libXext/Shape support.

Current supported captures use a local noncomposited X11 display, fully on-screen
rectangular frames, no intersecting mapped windows above the frame, and matching
32-bit pixels with standard RGB masks. Compositor-manager ownership, shaped
frames, mixed-depth descendants, ambiguous geometry, missing PID/focus evidence,
unsupported layouts and provider/native errors all return no image. No focus or
stacking change is made to obtain a picture. [Basic X11 clicks](linux-click-input.md)
reuse the frame verifier; wider pointer/drag/held routes remain open.

The implementation uses XGetImage from the verified exposed frame's root region.
It supplies visible-frame pixels under these conditions. Background/occluded and
composited backing-store capture remains required work, along with Wayland and
other providers. Standard compositing window managers and decorated frames need
real desktop validation. Current evidence is a private Ubuntu arm64 Xvfb desktop.
X11 metadata and AT-SPI provider state are trusted OS/provider observations;
external provider changes can still race the before/after checks.

Both source and Worker REPL checks read actual PNG pixels from same-title windows
with distinct red/blue markers, reject background/occluded/offscreen windows,
recover after exposure, accept an all-black window, and reject a closed handle
without returning a cached image. Python checks cover CRC/channel order, image
free/ungrab paths, wrong PID, compositor/shape/depth refusal, remote display,
ambiguous provider geometry and state changes around capture. Existing input,
paste, multi-window and launch/lifecycle flows also run against the same revision.

```sh
# Inside an owned private D-Bus/Xvfb desktop:
dbus-update-activation-environment DISPLAY XAUTHORITY
XDG_SESSION_TYPE=x11 GDK_BACKEND=x11 \
  node scripts/tests/linux-image-js-smoke.mjs /path/to/open-computer-use-linux
python3 apps/OpenComputerUseLinux/x11_capture_test.py
```

GTK's window attributes expose window type and toolkit metadata, while
[Accessible.get_id](https://gnome.pages.gitlab.gnome.org/at-spi2-core/libatspi/method.Accessible.get_id.html)
is an application ID rather than a native XID. The owned GTK probe confirmed no
native window ID attribute. See [GTK's window accessibility source](https://github.com/GNOME/gtk/blob/gtk-3-24/gtk/a11y/gtkwindowaccessible.c).
The [Xlib specification](https://xorg.freedesktop.org/archive/current/doc/libX11/libX11/libX11.html)
describes stacking queries, server grabs, image formats and the undefined pixels
that can occur when reading obscured windows without backing store.
