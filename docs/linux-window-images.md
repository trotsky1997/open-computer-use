# Verified X11 window images

Linux app screenshots use verified native window pixels for both window-ID and
string bindings. AX observations remain available when capture is unavailable.
A legitimate black window can return a valid PNG; pixel colors never determine
whether a source is valid.

The selected AT-SPI window must have a unique current rectangle among its app's
windows. Its bus/object/PID/process-start identity is checked before and after
capture. Titles never select a screenshot source. Both capture routes require a
local X11 display, a mapped InputOutput top-level frame with matching geometry,
and native PID/tree evidence for the selected process. Remote/forwarded DISPLAY
and Wayland sessions are rejected.

## Existing compositor backing images

When a compositor owns `_NET_WM_CM_Sn` and XComposite 0.2 or later is available,
the runtime names the selected frame's existing redirected backing pixmap with
`XCompositeNameWindowPixmap`. It never redirects/unredirects windows, changes
stacking, raises windows or moves focus. Mapped background, occluded and partially
offscreen frames can be captured independently of the visible desktop.

The mapped descendant tree must have a single matching PID and consistent depth.
Same-geometry ambiguity, shaped frames, absent backing storage, native errors and
changed pixmap dimensions fail capture. XRender must report a supported direct
24/32-bit visual with RGB888 masks and optional eight-bit alpha. The native image
must match its geometry, depth, format, byte order and stride. ARGB backing pixels
are converted from premultiplied color to straight-alpha RGBA PNG; opaque visuals
use RGB PNG. The source pixmap is named anew for each capture so resize/map cycles
do not reuse a stale image. This route additionally needs libXcomposite/libXrender.

## Exposed frames without a compositor

The fallback requires the selected window to be its app's sole active window.
Native keyboard-focus ancestry must reach that process/frame. The full rectangle
must be on screen, with no intersecting mapped window above it. `XGetImage` reads
that verified root region. A compositor owner, shaped/mixed-depth frames, missing
focus/PID evidence or unsupported layouts return no image. This route needs
libX11 and libXext/Shape support.

Input continues to use the existing focused, exposed-frame verifier. A successful
background/composited screenshot gives no additional input capability; see
[Linux clicks](linux-click-input.md), [drag](linux-drag-input.md) and
[scroll](linux-scroll-input.md).

## Lifetime and validation

Both routes use a private local Xlib connection and grab the server during
verification and pixel copying. Every exit releases the server and frees native
images, named pixmaps, properties and tree allocations. PNG encoding happens
after release. Node/depth/pixel budgets and a 250 ms verification deadline bound
work between synchronous requests; a blocked X request can exceed that deadline.
The outer bridge retains its process timeout. X11 metadata and AT-SPI state are
trusted OS/provider observations, and external provider changes can still race
the before/after identity checks.

Private Ubuntu arm64 Xvfb/D-Bus checks with a real xcompmgr pass through both source
and Worker JS hosts: same-title red/blue isolation, background and overlapping
frames, partially offscreen pixels, half-alpha red, opaque black, unchanged native
focus, same-geometry/hidden/closed refusal and rejection of composited pointer
input. The existing noncomposited checks retain their exposure/black-frame and
refusal behavior. Python self-checks cover PNG byte order/CRC/alpha conversion,
PID/geometry validation, identity changes and resource cleanup on failure.

```sh
# In an owned private Xvfb/D-Bus desktop, with GTK3, AT-SPI and Cairo installed:
XDG_SESSION_TYPE=x11 GDK_BACKEND=x11 xcompmgr -n &
compositor=$!
trap 'kill "$compositor"; wait "$compositor"' EXIT
XDG_SESSION_TYPE=x11 GDK_BACKEND=x11 \
  node scripts/tests/linux-composite-image-js-smoke.mjs /path/to/open-computer-use-linux
# Run linux-image-js-smoke.mjs separately in a desktop without a compositor.
python3 -m unittest discover -s apps/OpenComputerUseLinux -p '*_test.py'
```

Real GNOME/KWin desktops, decorated/reparented frames, GPU/full-screen paths,
minimized/unmapped windows, Wayland/portal capture and other providers remain open.
Current evidence covers owned undecorated GTK windows in Xvfb with xcompmgr.

The upstream X.Org `Xcomposite(3)` manual specifies named redirected pixmaps,
map/resize lifetimes, the 0.2 minimum and explicit pixmap release. The installed
Xrender header defines the visual format/alpha masks used here. The
[Xlib specification](https://xorg.freedesktop.org/archive/current/doc/libX11/libX11/libX11.html)
describes stacking, grabs, image formats and obscured-window pixel limitations.
GTK's [Accessible.get_id](https://gnome.pages.gitlab.gnome.org/at-spi2-core/libatspi/method.Accessible.get_id.html)
is an application ID; the owned GTK probe exposed no native XID attribute. See
[GTK's window accessibility source](https://github.com/GNOME/gtk/blob/gtk-3-24/gtk/a11y/gtkwindowaccessible.c).
