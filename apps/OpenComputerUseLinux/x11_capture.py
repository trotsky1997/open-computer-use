"""Verify exposed focused X11 frames for observation and pointer input."""
from contextlib import contextmanager
import ctypes as C
import ctypes.util
import struct
import os
import math
import re
import time
import zlib
from native_cancel import check_cancelled, defer_cancellation


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


class ModifierMap(C.Structure):
    _fields_ = [("max_keypermod", C.c_int), ("modifiermap", C.POINTER(C.c_ubyte))]


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
            "XGrabPointer": (C.c_int, [C.c_void_p, C.c_ulong, C.c_int, C.c_uint, C.c_int, C.c_int, C.c_ulong, C.c_ulong, C.c_ulong]),
            "XUngrabPointer": (C.c_int, [C.c_void_p, C.c_ulong]),
            "XQueryPointer": (C.c_int, [C.c_void_p, C.c_ulong, C.POINTER(C.c_ulong), C.POINTER(C.c_ulong), C.POINTER(C.c_int), C.POINTER(C.c_int), C.POINTER(C.c_int), C.POINTER(C.c_int), C.POINTER(C.c_uint)]),
            "XGetModifierMapping": (C.POINTER(ModifierMap), [C.c_void_p]),
            "XFreeModifiermap": (C.c_int, [C.POINTER(ModifierMap)]),
            "XKeycodeToKeysym": (C.c_ulong, [C.c_void_p, C.c_ubyte, C.c_int]),
            "XQueryKeymap": (C.c_int, [C.c_void_p, C.POINTER(C.c_ubyte)]),
            "XKeysymToKeycode": (C.c_ubyte, [C.c_void_p, C.c_ulong]),
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

    def verify_frame(self, expected_pid, rectangle, deadline):
        x, y, width, height = rectangle
        if min(x, y) < 0 or min(width, height) <= 0 or width * height > 16_000_000:
            raise RuntimeError("X11 window bounds unavailable")
        screen = self.lib.XDefaultScreen(self.display)
        compositor = self.lib.XInternAtom(self.display, ("_NET_WM_CM_S" + str(screen)).encode("ascii"), 1)
        if compositor and self.lib.XGetSelectionOwner(self.display, compositor):
            raise RuntimeError("Composited native window routing is unsupported")
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
            raise RuntimeError("Shaped native frame routing is unsupported")
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
                raise RuntimeError("Mixed-depth native frame routing is unsupported")
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
        return window

    def read(self, expected_pid, rectangle):
        x, y, width, height = rectangle
        if min(x, y) < 0 or min(width, height) <= 0 or width * height > 16_000_000:
            raise RuntimeError("X11 screenshot bounds unavailable")
        self.lib.XGrabServer(self.display)
        deadline = time.monotonic() + 0.25
        image = None
        try:
            self.verify_frame(expected_pid, rectangle, deadline)
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

    def pointer(self):
        root, child = C.c_ulong(), C.c_ulong()
        rx, ry, wx, wy, mask = C.c_int(), C.c_int(), C.c_int(), C.c_int(), C.c_uint()
        if not self.lib.XQueryPointer(self.display, self.root, C.byref(root), C.byref(child), C.byref(rx), C.byref(ry), C.byref(wx), C.byref(wy), C.byref(mask)) or root.value != self.root:
            raise RuntimeError("Native pointer screen unavailable")
        return child.value, rx.value, ry.value, mask.value

    def require_neutral(self, mask):
        if mask & 0x1f00:
            raise RuntimeError("A pointer button is already held")
        modifiers = mask & 0xff
        if not modifiers:
            return
        mapping = self.lib.XGetModifierMapping(self.display)
        if not mapping:
            raise RuntimeError("Native modifier mapping unavailable")
        try:
            size = mapping.contents.max_keypermod
            if not 0 < size <= 32:
                raise RuntimeError("Invalid native modifier mapping")
            for bit in range(8):
                if not modifiers & (1 << bit):
                    continue
                keys = [mapping.contents.modifiermap[bit * size + index] for index in range(size)]
                symbols = [self.lib.XKeycodeToKeysym(self.display, key, 0) for key in keys if key]
                if not symbols or any(symbol not in (0xffe5, 0xff7f, 0xff14) for symbol in symbols):
                    raise RuntimeError("An action modifier is already held")
        finally:
            self.lib.XFreeModifiermap(mapping)

    def require_point(self, rectangle, point):
        x, y, width, height = rectangle
        if len(point) != 2 or any(type(value) not in (int, float) or not float(value).is_integer() for value in point):
            raise RuntimeError("Native pointer input requires integral pixel coordinates")
        px, py = point
        if not x <= px < x + width or not y <= py < y + height:
            raise RuntimeError("Pointer point is outside the selected frame")

    def xtest(self):
        xtest = C.CDLL(ctypes.util.find_library("Xtst") or "libXtst.so.6")
        for name, args in {
            "XTestQueryExtension": [C.c_void_p] + [C.POINTER(C.c_int)] * 4,
            "XTestFakeKeyEvent": [C.c_void_p, C.c_uint, C.c_int, C.c_ulong],
            "XTestFakeMotionEvent": [C.c_void_p, C.c_int, C.c_int, C.c_int, C.c_ulong],
            "XTestFakeButtonEvent": [C.c_void_p, C.c_uint, C.c_int, C.c_ulong],
        }.items():
            function = getattr(xtest, name)
            function.restype, function.argtypes = C.c_int, args
        event, error, major, minor = C.c_int(), C.c_int(), C.c_int(), C.c_int()
        if not xtest.XTestQueryExtension(self.display, C.byref(event), C.byref(error), C.byref(major), C.byref(minor)):
            raise RuntimeError("XTest pointer synthesis unavailable")
        return xtest

    def prepare_pointer(self, expected_pid, rectangle, point):
        px, py = map(int, point)
        xtest = self.xtest()
        self.lib.XGrabServer(self.display)
        try:
            deadline = time.monotonic() + 0.25
            frame = self.verify_frame(expected_pid, rectangle, deadline)
            self.require_neutral(self.pointer()[3])
            status = self.lib.XGrabPointer(self.display, frame, 0, 0, 1, 1, 0, 0, 0)
            if status != 0:
                raise RuntimeError("Native pointer grab unavailable (status {})".format(status))
            self.lib.XUngrabPointer(self.display, 0)
            if time.monotonic() > deadline:
                raise RuntimeError("X11 pointer verification time budget reached")
            check_cancelled()
            if not xtest.XTestFakeMotionEvent(self.display, self.lib.XDefaultScreen(self.display), px, py, 0):
                raise RuntimeError("Pointer motion failed")
            self.lib.XSync(self.display, 0)
            child, actual_x, actual_y, state = self.pointer()
            self.require_neutral(state)
            if self.error or (child, actual_x, actual_y) != (frame, px, py):
                raise RuntimeError("Native pointer target did not match the selected frame")
            if time.monotonic() > deadline:
                raise RuntimeError("Pointer moved but input time budget expired; inspect before retrying")
        finally:
            self.lib.XUngrabServer(self.display)
            self.lib.XSync(self.display, 0)
        # A window manager may need to replay a passive grab while input is delivered.
        child, actual_x, actual_y, state = self.pointer()
        self.require_neutral(state)
        if self.error or (child, actual_x, actual_y) != (frame, px, py):
            raise RuntimeError("Pointer target changed before input; inspect before retrying")
        return xtest, frame

    def keyboard_state(self):
        vector = (C.c_ubyte * 32)()
        if not self.lib.XQueryKeymap(self.display, vector):
            raise RuntimeError("Native keyboard state unavailable")
        return {code for code in range(256) if vector[code // 8] & (1 << (code % 8))}

    def resolve_held_keys(self, symbols):
        keys, mask = [], 0
        for symbol in symbols:
            if symbol in (0xffe5, 0xff7f, 0xff14):
                raise RuntimeError("Lock keys are unsupported for held clicks")
            code = self.lib.XKeysymToKeycode(self.display, symbol)
            if not code or self.lib.XKeycodeToKeysym(self.display, code, 0) != symbol:
                raise RuntimeError("Held key has no unambiguous primary mapping in the native layout")
            if code not in keys:
                keys.append(code)
        mapping = self.lib.XGetModifierMapping(self.display)
        if not mapping:
            raise RuntimeError("Native modifier map unavailable")
        try:
            size = mapping.contents.max_keypermod
            if not 1 <= size <= 256:
                raise RuntimeError("Invalid native modifier map")
            for bit in range(8):
                if any(mapping.contents.modifiermap[bit * size + index] in keys for index in range(size)):
                    mask |= 1 << bit
        finally:
            self.lib.XFreeModifiermap(mapping)
        return keys, mask

    def check_held_click(self, expected_pid, rectangle, frame, point, keys, modifiers, button_mask):
        if self.verify_frame(expected_pid, rectangle, time.monotonic() + 0.25) != frame:
            raise RuntimeError("Held click frame changed; inspect before retrying")
        child, x, y, state = self.pointer()
        if self.error or (child, x, y) != (frame, *point) or state != (modifiers | button_mask) or self.keyboard_state() != set(keys):
            raise RuntimeError("Held click input state changed; inspect before retrying")

    @contextmanager
    def held_keys(self, xtest, keys):
        held = []
        try:
            for key in keys:
                with defer_cancellation():
                    check_cancelled()
                    held.append(key)
                    if not xtest.XTestFakeKeyEvent(self.display, key, 1, 0):
                        raise RuntimeError("Held key press failed; inspect before retrying")
                    self.lib.XSync(self.display, 0)
            yield
        finally:
            with defer_cancellation():
                failed = False
                for key in reversed(held):
                    try:
                        failed = not bool(xtest.XTestFakeKeyEvent(self.display, key, 0, 0)) or failed
                    except Exception:
                        failed = True
                self.lib.XSync(self.display, 0)
                if failed:
                    raise RuntimeError("Held key release failed; inspect keyboard state before retrying")

    def click(self, expected_pid, rectangle, point, button, count, symbols=(), duration=None):
        if button not in ("left", "middle", "right") or type(count) is not int or not 1 <= count <= 3:
            raise RuntimeError("Click requires left/middle/right and count 1..3")
        if duration is not None and (type(duration) not in (int, float) or not math.isfinite(duration) or duration < 0):
            raise RuntimeError("Click duration must be finite non-negative milliseconds")
        self.require_point(rectangle, point)
        extended = bool(symbols) or duration is not None
        keys, mask = self.resolve_held_keys(symbols) if symbols else ([], 0)
        if extended and self.keyboard_state():
            raise RuntimeError("A keyboard key is already held")
        xtest, frame = self.prepare_pointer(expected_pid, rectangle, point)
        modifiers = (self.pointer()[3] & 0xff) | mask if extended else 0
        code = {"left": 1, "middle": 2, "right": 3}[button]
        with self.held_keys(xtest, keys):
            for _ in range(count):
                if extended:
                    self.check_held_click(expected_pid, rectangle, frame, point, keys, modifiers, 0)
                attempted = False
                try:
                    with defer_cancellation():
                        check_cancelled()
                        attempted = True
                        if not xtest.XTestFakeButtonEvent(self.display, code, 1, 0):
                            raise RuntimeError("Button press failed; inspect before retrying")
                        self.lib.XSync(self.display, 0)
                    deadline = time.monotonic() + (duration if duration is not None else 0) / 1000
                    while time.monotonic() < deadline:
                        time.sleep(min(0.02, max(0, deadline - time.monotonic())))
                        check_cancelled()
                        self.check_held_click(expected_pid, rectangle, frame, point, keys, modifiers, 1 << (code + 7))
                finally:
                    if attempted:
                        with defer_cancellation():
                            if not xtest.XTestFakeButtonEvent(self.display, code, 0, 0):
                                raise RuntimeError("Button release failed; inspect pointer state before retrying")
                            self.lib.XSync(self.display, 0)
        self.require_neutral(self.pointer()[3])
        if self.error or (extended and self.keyboard_state()):
            raise RuntimeError("Native click delivery/release failed; inspect before retrying")

    def press_key(self, expected_pid, rectangle, symbols, duration):
        if type(duration) not in (int, float) or not math.isfinite(duration) or duration < 0 or not symbols:
            raise RuntimeError("Timed key requires a chord and finite non-negative duration")
        keys, mask = self.resolve_held_keys(symbols)
        if self.keyboard_state():
            raise RuntimeError("A keyboard key is already held")
        xtest = self.xtest()
        frame = self.verify_frame(expected_pid, rectangle, time.monotonic() + 0.25)
        state = self.pointer()[3]
        self.require_neutral(state)
        modifiers = (state & 0xff) | mask
        with self.held_keys(xtest, keys):
            deadline = time.monotonic() + duration / 1000
            while True:
                check_cancelled()
                if self.verify_frame(expected_pid, rectangle, time.monotonic() + 0.25) != frame:
                    raise RuntimeError("Timed key frame changed; inspect before retrying")
                if self.error or self.pointer()[3] != modifiers or self.keyboard_state() != set(keys):
                    raise RuntimeError("Timed key input state changed; inspect before retrying")
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    break
                time.sleep(min(0.02, remaining))
        self.require_neutral(self.pointer()[3])
        if self.error or self.keyboard_state():
            raise RuntimeError("Native key delivery/release failed; inspect before retrying")

    def close(self):
        self.lib.XSync(self.display, 0)
        self.lib.XSetErrorHandler(self.previous)
        self.lib.XCloseDisplay(self.display)

    def drag(self, expected_pid, rectangle, start, end):
        self.require_point(rectangle, start)
        self.require_point(rectangle, end)
        xtest, frame = self.prepare_pointer(expected_pid, rectangle, start)
        px, py = map(int, start)
        attempted = False
        try:
            with defer_cancellation():
                check_cancelled()
                attempted = True
                if not xtest.XTestFakeButtonEvent(self.display, 1, 1, 0):
                    raise RuntimeError("Drag press failed; inspect before retrying")
                self.lib.XSync(self.display, 0)
            for step in range(1, 13):
                check_cancelled()
                # Release the server between steps so receivers can process grabs and motion.
                self.lib.XGrabServer(self.display)
                try:
                    if self.verify_frame(expected_pid, rectangle, time.monotonic() + 0.25) != frame:
                        raise RuntimeError("Drag frame changed; inspect before retrying")
                    child, actual_x, actual_y, state = self.pointer()
                    self.require_neutral(state & ~0x100)
                    if (child, actual_x, actual_y) != (frame, px, py) or not state & 0x100 or self.error:
                        raise RuntimeError("Drag pointer/button state changed; inspect before retrying")
                    px = round(start[0] + (end[0] - start[0]) * step / 12)
                    py = round(start[1] + (end[1] - start[1]) * step / 12)
                    if not xtest.XTestFakeMotionEvent(self.display, self.lib.XDefaultScreen(self.display), px, py, 0):
                        raise RuntimeError("Drag motion failed; inspect before retrying")
                    self.lib.XSync(self.display, 0)
                    child, actual_x, actual_y, state = self.pointer()
                    self.require_neutral(state & ~0x100)
                    if self.error or (child, actual_x, actual_y) != (frame, px, py) or not state & 0x100:
                        raise RuntimeError("Drag motion was not confirmed; inspect before retrying")
                finally:
                    self.lib.XUngrabServer(self.display)
                    self.lib.XSync(self.display, 0)
                time.sleep(0.02)
        finally:
            if attempted:
                with defer_cancellation():
                    if not xtest.XTestFakeButtonEvent(self.display, 1, 0, 0):
                        raise RuntimeError("Drag release failed; inspect pointer state before retrying")
                    self.lib.XSync(self.display, 0)
        self.require_neutral(self.pointer()[3])
        if self.error:
            raise RuntimeError("Native drag delivery failed; inspect before retrying")


def local_rectangle(bounds):
    if not re.fullmatch(r":\d+(?:\.\d+)?", os.environ.get("DISPLAY", "")):
        raise RuntimeError("Verified native window routing requires a local X11 display")
    values = tuple(bounds[key] for key in ("x", "y", "width", "height"))
    if any(not isinstance(value, (int, float)) or not float(value).is_integer() for value in values):
        raise RuntimeError("Non-integral native window bounds")
    return tuple(map(int, values))


def capture_visible_window(pid, bounds):
    rectangle = local_rectangle(bounds)
    client = X11()
    try:
        return client.read(pid, rectangle)
    finally:
        client.close()


def click_visible_window(pid, bounds, x, y, button, count, symbols=(), duration=None):
    rectangle = local_rectangle(bounds)
    client = X11()
    try:
        return client.click(pid, rectangle, (x, y), button, count, symbols, duration)
    finally:
        client.close()


def drag_visible_window(pid, bounds, start, end):
    rectangle = local_rectangle(bounds)
    client = X11()
    try:
        return client.drag(pid, rectangle, start, end)
    finally:
        client.close()


def press_visible_keys(pid, bounds, symbols, duration):
    rectangle = local_rectangle(bounds)
    client = X11()
    try:
        return client.press_key(pid, rectangle, symbols, duration)
    finally:
        client.close()
