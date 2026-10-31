"""Read an exposed focused X11 frame without changing focus or stacking."""
import ctypes as C
import ctypes.util
import struct
import os
import re
import time
import zlib


class Attributes(C.Structure):
    _fields_ = [(name, kind) for name, kind in [
        ("x", C.c_int), ("y", C.c_int), ("width", C.c_int), ("height", C.c_int),
        ("border_width", C.c_int), ("depth", C.c_int), ("visual", C.c_void_p),
        ("root", C.c_ulong), ("window_class", C.c_int), ("bit_gravity", C.c_int),
        ("win_gravity", C.c_int), ("backing_store", C.c_int),
        ("backing_planes", C.c_ulong), ("backing_pixel", C.c_ulong),
        ("save_under", C.c_int), ("colormap", C.c_ulong),
        ("map_installed", C.c_int), ("map_state", C.c_int),
        ("all_event_masks", C.c_long), ("your_event_mask", C.c_long),
        ("do_not_propagate_mask", C.c_long), ("override_redirect", C.c_int),
        ("screen", C.c_void_p),
    ]]


class Image(C.Structure):
    _fields_ = [(name, kind) for name, kind in [
        ("width", C.c_int), ("height", C.c_int), ("xoffset", C.c_int),
        ("format", C.c_int), ("data", C.c_void_p), ("byte_order", C.c_int),
        ("bitmap_unit", C.c_int), ("bitmap_bit_order", C.c_int),
        ("bitmap_pad", C.c_int), ("depth", C.c_int), ("bytes_per_line", C.c_int),
        ("bits_per_pixel", C.c_int), ("red_mask", C.c_ulong),
        ("green_mask", C.c_ulong), ("blue_mask", C.c_ulong),
    ]]


def png(raw, width, height, stride, order, masks):
    if order not in (0, 1) or stride != width * 4 or masks != (0xff0000, 0xff00, 0xff):
        raise RuntimeError("Unsupported X11 pixel layout")
    rgb = bytearray(width * height * 3)
    red, green, blue = (2, 1, 0) if order == 0 else (1, 2, 3)
    rgb[0::3], rgb[1::3], rgb[2::3] = raw[red::4], raw[green::4], raw[blue::4]
    rows = b"".join(b"\0" + rgb[y * width * 3:(y + 1) * width * 3] for y in range(height))
    def chunk(kind, data):
        return struct.pack("!I", len(data)) + kind + data + struct.pack("!I", zlib.crc32(kind + data))
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack("!2I5B", width, height, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b"")


class X11:
    def __init__(self):
        self.lib = C.CDLL(ctypes.util.find_library("X11") or "libX11.so.6")
        signatures = {
            "XOpenDisplay": (C.c_void_p, [C.c_char_p]),
            "XDefaultRootWindow": (C.c_ulong, [C.c_void_p]),
            "XDefaultScreen": (C.c_int, [C.c_void_p]),
            "XGetSelectionOwner": (C.c_ulong, [C.c_void_p, C.c_ulong]),
            "XCloseDisplay": (C.c_int, [C.c_void_p]),
            "XGrabServer": (C.c_int, [C.c_void_p]),
            "XUngrabServer": (C.c_int, [C.c_void_p]),
            "XSync": (C.c_int, [C.c_void_p, C.c_int]),
            "XFree": (C.c_int, [C.c_void_p]),
            "XSetErrorHandler": (C.c_void_p, [C.c_void_p]),
            "XGetInputFocus": (C.c_int, [C.c_void_p, C.POINTER(C.c_ulong), C.POINTER(C.c_int)]),
            "XQueryTree": (C.c_int, [C.c_void_p, C.c_ulong, C.POINTER(C.c_ulong), C.POINTER(C.c_ulong), C.POINTER(C.POINTER(C.c_ulong)), C.POINTER(C.c_uint)]),
            "XGetWindowAttributes": (C.c_int, [C.c_void_p, C.c_ulong, C.POINTER(Attributes)]),
            "XTranslateCoordinates": (C.c_int, [C.c_void_p, C.c_ulong, C.c_ulong, C.c_int, C.c_int, C.POINTER(C.c_int), C.POINTER(C.c_int), C.POINTER(C.c_ulong)]),
            "XInternAtom": (C.c_ulong, [C.c_void_p, C.c_char_p, C.c_int]),
            "XGetWindowProperty": (C.c_int, [C.c_void_p, C.c_ulong, C.c_ulong, C.c_long, C.c_long, C.c_int, C.c_ulong, C.POINTER(C.c_ulong), C.POINTER(C.c_int), C.POINTER(C.c_ulong), C.POINTER(C.c_ulong), C.POINTER(C.c_void_p)]),
            "XGetImage": (C.POINTER(Image), [C.c_void_p, C.c_ulong, C.c_int, C.c_int, C.c_uint, C.c_uint, C.c_ulong, C.c_int]),
            "XDestroyImage": (C.c_int, [C.POINTER(Image)]),
        }
        for name, (result, args) in signatures.items():
            function = getattr(self.lib, name)
            function.restype, function.argtypes = result, args
        self.shape = C.CDLL(ctypes.util.find_library("Xext") or "libXext.so.6")
        self.shape.XShapeQueryExtents.restype = C.c_int
        self.shape.XShapeQueryExtents.argtypes = [C.c_void_p, C.c_ulong, C.POINTER(C.c_int), C.POINTER(C.c_int), C.POINTER(C.c_int), C.POINTER(C.c_uint), C.POINTER(C.c_uint), C.POINTER(C.c_int), C.POINTER(C.c_int), C.POINTER(C.c_int), C.POINTER(C.c_uint), C.POINTER(C.c_uint)]
        self.display = self.lib.XOpenDisplay(None)
        if not self.display:
            raise RuntimeError("X11 display unavailable")
        self.root = self.lib.XDefaultRootWindow(self.display)
        self.error = False
        self.handler = C.CFUNCTYPE(C.c_int, C.c_void_p, C.c_void_p)(self.on_error)
        self.previous = self.lib.XSetErrorHandler(C.cast(self.handler, C.c_void_p))

    def on_error(self, *_args):
        self.error = True
        return 0

    def tree(self, window):
        root, parent, children, count = C.c_ulong(), C.c_ulong(), C.POINTER(C.c_ulong)(), C.c_uint()
        try:
            if not self.lib.XQueryTree(self.display, window, C.byref(root), C.byref(parent), C.byref(children), C.byref(count)) or count.value > 1200:
                raise RuntimeError("X11 window tree unavailable or exceeds budget")
            return parent.value, [children[i] for i in range(count.value)]
        finally:
            if children:
                self.lib.XFree(children)

    def attributes(self, window):
        value = Attributes()
        if not self.lib.XGetWindowAttributes(self.display, window, C.byref(value)):
            raise RuntimeError("X11 window disappeared")
        return value

    def rectangle(self, window):
        attributes = self.attributes(window)
        x, y, child = C.c_int(), C.c_int(), C.c_ulong()
        if not self.lib.XTranslateCoordinates(self.display, window, self.root, 0, 0, C.byref(x), C.byref(y), C.byref(child)):
            raise RuntimeError("X11 frame geometry unavailable")
        border = attributes.border_width
        return (x.value - border, y.value - border, attributes.width + border * 2, attributes.height + border * 2)

    def pid(self, window):
        atom = self.lib.XInternAtom(self.display, b"_NET_WM_PID", 1)
        if not atom:
            return None
        type_, format_, count, remaining, data = C.c_ulong(), C.c_int(), C.c_ulong(), C.c_ulong(), C.c_void_p()
        try:
            status = self.lib.XGetWindowProperty(self.display, window, atom, 0, 1, 0, 6, C.byref(type_), C.byref(format_), C.byref(count), C.byref(remaining), C.byref(data))
            if status or type_.value != 6 or format_.value != 32 or count.value != 1 or remaining.value or not data:
                return None
            return C.cast(data, C.POINTER(C.c_ulong))[0]
        finally:
            if data:
                self.lib.XFree(data)

    def read(self, expected_pid, rectangle):
        x, y, width, height = rectangle
        if min(x, y) < 0 or min(width, height) <= 0 or width * height > 16_000_000:
            raise RuntimeError("X11 screenshot bounds unavailable")
        self.lib.XGrabServer(self.display)
        deadline = time.monotonic() + 0.25
        image = None
        try:
            screen = self.lib.XDefaultScreen(self.display)
            compositor = self.lib.XInternAtom(self.display, ("_NET_WM_CM_S" + str(screen)).encode("ascii"), 1)
            if compositor and self.lib.XGetSelectionOwner(self.display, compositor):
                raise RuntimeError("Composited desktop requires backing-store capture")
            focus, revert = C.c_ulong(), C.c_int()
            self.lib.XGetInputFocus(self.display, C.byref(focus), C.byref(revert))
            window, found_pid = focus.value, None
            if window in (0, 1, self.root):
                raise RuntimeError("Native keyboard focus unavailable")
            for _depth in range(64):
                if time.monotonic() > deadline:
                    raise RuntimeError("X11 verification time budget reached")
                found_pid = found_pid or self.pid(window)
                parent, _children = self.tree(window)
                if parent == self.root:
                    break
                if parent in (0, window):
                    raise RuntimeError("Invalid X11 parent chain")
                window = parent
            else:
                raise RuntimeError("X11 parent chain exceeds budget")
            if found_pid != expected_pid or self.rectangle(window) != rectangle or self.attributes(window).map_state != 2:
                raise RuntimeError("Native focus/PID/frame does not match AT-SPI")
            _, stacking = self.tree(self.root)
            if window not in stacking:
                raise RuntimeError("Native frame missing from stacking order")
            root = self.attributes(self.root)
            shaped, bx, by, bw, bh = C.c_int(), C.c_int(), C.c_int(), C.c_uint(), C.c_uint()
            clipped, cx, cy, cw, ch = C.c_int(), C.c_int(), C.c_int(), C.c_uint(), C.c_uint()
            if not self.shape.XShapeQueryExtents(self.display, window, C.byref(shaped), C.byref(bx), C.byref(by), C.byref(bw), C.byref(bh), C.byref(clipped), C.byref(cx), C.byref(cy), C.byref(cw), C.byref(ch)) or shaped.value:
                raise RuntimeError("Shaped frame capture is unsupported")
            pending, visited = [(window, 0)], set()
            while pending:
                if time.monotonic() > deadline or len(visited) >= 1200:
                    raise RuntimeError("X11 child verification budget reached")
                child, depth = pending.pop()
                if child in visited or depth > 64:
                    raise RuntimeError("Invalid X11 child tree")
                visited.add(child)
                attributes = self.attributes(child)
                if attributes.map_state != 2:
                    continue
                if attributes.window_class == 1 and attributes.depth != root.depth:
                    raise RuntimeError("Mixed-depth window pixels are unsupported")
                _, children = self.tree(child)
                pending.extend((entry, depth + 1) for entry in children)
            if x + width > root.width or y + height > root.height:
                raise RuntimeError("Window extends outside the display")
            for other in stacking[stacking.index(window) + 1:]:
                if time.monotonic() > deadline:
                    raise RuntimeError("X11 verification time budget reached")
                attributes = self.attributes(other)
                if attributes.window_class != 1 or attributes.map_state != 2:
                    continue
                ox, oy, ow, oh = self.rectangle(other)
                if x < ox + ow and ox < x + width and y < oy + oh and oy < y + height:
                    raise RuntimeError("Selected window is occluded")
            if time.monotonic() > deadline:
                raise RuntimeError("X11 verification time budget reached")
            image = self.lib.XGetImage(self.display, self.root, x, y, width, height, C.c_ulong(-1).value, 2)
            self.lib.XSync(self.display, 0)
            if self.error or not image:
                raise RuntimeError("X11 image read failed")
            value = image.contents
            if not value.data or value.bits_per_pixel != 32 or value.bytes_per_line != width * 4 or value.width != width or value.height != height:
                raise RuntimeError("Unsupported X11 image format")
            raw = C.string_at(value.data, value.bytes_per_line * height)
            layout = (value.bytes_per_line, value.byte_order, (value.red_mask, value.green_mask, value.blue_mask))
        finally:
            if image:
                self.lib.XDestroyImage(image)
            self.lib.XUngrabServer(self.display)
            self.lib.XSync(self.display, 0)
        return png(raw, width, height, *layout)

    def close(self):
        self.lib.XSync(self.display, 0)
        self.lib.XSetErrorHandler(self.previous)
        self.lib.XCloseDisplay(self.display)


def capture_visible_window(pid, bounds):
    if not re.fullmatch(r":\d+(?:\.\d+)?", os.environ.get("DISPLAY", "")):
        raise RuntimeError("Verified capture requires a local X11 display")
    values = tuple(bounds[key] for key in ("x", "y", "width", "height"))
    if any(not isinstance(value, (int, float)) or not float(value).is_integer() for value in values):
        raise RuntimeError("Non-integral native window bounds")
    client = X11()
    try:
        return client.read(pid, tuple(map(int, values)))
    finally:
        client.close()
