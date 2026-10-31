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

The mapped descendant tree must have a single matching PID. Descendant depths
may differ: XComposite storage contains the complete hierarchy, including WM
decoration children; the named pixmap is validated against the frame visual.
Same-geometry ambiguity, invalid/over-budget shape metadata, absent backing
storage, native errors and
changed pixmap dimensions fail capture. XRender must report a supported direct
24/32-bit visual with RGB888 masks and optional eight-bit alpha. The native image
must match its geometry, depth, format, byte order and stride. ARGB backing pixels
are converted from premultiplied color to straight-alpha RGBA PNG; opaque visuals
use RGB PNG. The source pixmap is named anew for each capture so resize/map cycles
do not reuse a stale image. This route additionally needs libXcomposite/libXrender.

For a shaped frame, `XShapeGetRectangles(ShapeBounding)` reads the native client
region under the same server grab. Interior coordinates are translated by the
native border width and clipped to the pixmap rectangle, giving the effective
bounding region. Encoding unions these rectangles after server release and sets
all RGBA channels outside the region to zero. ARGB opacity inside the region is
preserved; shaped RGB sources produce opaque RGBA inside the region. Empty
regions yield a transparent image. There is a 4096-rectangle cap, a 16-million
clipped rectangle-pixel work budget and the existing 250 ms native verification
deadline. Native rectangle storage is freed on every exit. Missing/invalid
region evidence returns no image.

Physical input validates native Bounding/Input regions and supports shaped
frames under the existing focus/exposure rules; see [Linux clicks](linux-click-input.md).
The noncomposited root-image fallback retains its shape refusal. Semantic AX
actions remain available for shaped windows.


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
focus, same-geometry/hidden/closed refusal, inactive-input rejection and actual
ARGB-window click recipients. The same controller also passes with Openbox in
both decorated and undecorated modes, including mixed-depth reparented ARGB
frames, RGB/ARGB growth, shrink and hide/show remapping. It verifies PNG
dimensions after resize and native negative window position before offscreen
capture. Frame-relative fixture coordinates include WM borders/titlebars. The
existing noncomposited checks retain their exposure/black-frame and refusal
behavior. Python self-checks cover PNG byte order/CRC/alpha conversion,
PID/geometry validation, mixed-depth frame acceptance with foreign-PID refusal,
identity changes, shape clipping/union/empty regions, border translation,
rectangle/pixel budget failures and native region cleanup. Both hosts also verify
real opaque/ARGB corner cuts and interior holes, zero RGB outside shape, preserved
half-alpha inside shape, shape reset and refusal of hole-targeted physical clicks. The
fixture sets server bounding regions via XShape on its own native window IDs and
keeps errors in its private test directory.

```sh
# In an owned private Xvfb/D-Bus desktop, with GTK3, AT-SPI and Cairo installed:
XDG_SESSION_TYPE=x11 GDK_BACKEND=x11 xcompmgr -n &
compositor=$!
trap 'kill "$compositor"; wait "$compositor"' EXIT
XDG_SESSION_TYPE=x11 GDK_BACKEND=x11 \
  node scripts/tests/linux-composite-image-js-smoke.mjs /path/to/open-computer-use-linux
# With Openbox running in that private desktop, run the same controller twice:
# OCU_WINDOW_FIXTURE_DECORATED=0 node scripts/tests/linux-composite-image-js-smoke.mjs /path/to/open-computer-use-linux
# OCU_WINDOW_FIXTURE_DECORATED=1 node scripts/tests/linux-composite-image-js-smoke.mjs /path/to/open-computer-use-linux
# See linux-click-input.md for private WM startup/readiness/cleanup.
# Run linux-image-js-smoke.mjs separately in a desktop without a compositor.
python3 -m unittest discover -s apps/OpenComputerUseLinux -p '*_test.py'
```

Real GNOME/KWin desktops, other WM/compositor themes and shape/input effects,
GPU/full-screen paths, minimized/unmapped windows, Wayland/portal capture and other providers remain open.
Current evidence uses owned GTK windows in Xvfb with xcompmgr and Openbox.

The upstream X.Org `Xcomposite(3)` manual specifies named redirected pixmaps,
per-hierarchy storage including descendant contents, map/resize lifetimes, the
0.2 minimum and explicit pixmap release. The installed
Xrender header defines the visual format/alpha masks used here. The
[Xlib specification](https://xorg.freedesktop.org/archive/current/doc/libX11/libX11/libX11.html)
describes stacking, grabs, image formats and obscured-window pixel limitations.
GTK's [Accessible.get_id](https://gnome.pages.gitlab.gnome.org/at-spi2-core/libatspi/method.Accessible.get_id.html)
is an application ID; the owned GTK probe exposed no native XID attribute. See
[GTK's window accessibility source](https://github.com/GNOME/gtk/blob/gtk-3-24/gtk/a11y/gtkwindowaccessible.c).

The [X.Org Shape protocol](https://xorg.freedesktop.org/archive/X11R7.5/doc/Xext/shape.html)
defines effective bounding regions and the native rectangle representation. The
[Xlib Shape API](https://xorg.freedesktop.org/archive/X11R7.6/doc/libXext/shapelib.html)
defines the native rectangle retrieval binding.
