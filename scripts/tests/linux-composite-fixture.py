#!/usr/bin/python3
"""Owned mapped GTK windows for XComposite pixel/identity checks."""
import json
import os
import ctypes as C
import ctypes.util
import gi
import cairo

gi.require_version('Gtk', '3.0')
gi.require_version('GdkX11', '3.0')
from gi.repository import Gdk, GdkX11, GLib, Gtk


class NativeRectangle(C.Structure):
    _fields_ = [('x', C.c_short), ('y', C.c_short), ('width', C.c_ushort), ('height', C.c_ushort)]


xlib = C.CDLL(ctypes.util.find_library('X11'))
xlib.XOpenDisplay.restype, xlib.XOpenDisplay.argtypes = C.c_void_p, [C.c_char_p]
xlib.XSync.argtypes = [C.c_void_p, C.c_int]
xlib.XCloseDisplay.argtypes = [C.c_void_p]
xshape = C.CDLL(ctypes.util.find_library('Xext'))
xshape.XShapeCombineRectangles.argtypes = [C.c_void_p, C.c_ulong, C.c_int, C.c_int, C.c_int, C.POINTER(NativeRectangle), C.c_int, C.c_int, C.c_int]
xshape.XShapeCombineRectangles.restype = None
xshape.XShapeCombineMask.argtypes = [C.c_void_p, C.c_ulong, C.c_int, C.c_int, C.c_int, C.c_ulong, C.c_int]
xshape.XShapeCombineMask.restype = None

root, name = os.environ['OCU_WINDOW_FIXTURE_ROOT'], os.environ['OCU_WINDOW_FIXTURE_NAME']
error_fd = os.open(root + '/fixture-errors.log', os.O_CREAT | os.O_WRONLY | os.O_APPEND, 0o600)
os.dup2(error_fd, 2)
os.close(error_fd)
GLib.set_prgname(name)
GLib.set_application_name(name)
windows = {}
events = {}
canvases = {}
shaped = {}


def window_point(key, x, y):
    window = windows[key]
    native = window.get_window()
    if not native:
        return None
    success, wx, wy = native.get_origin()
    if not success:
        return None
    frame = native.get_frame_extents()
    return [wx + x - frame.x, wy + y - frame.y]


def canvas_point(key, x=40, y=23):
    canvas = canvases.get(key)
    point = canvas.translate_coordinates(windows[key], x, y) if canvas else None
    return window_point(key, *point) if point is not None else None


def state(*_args):
    result = {'pid': os.getpid(), 'shaped': shaped, 'events': events, 'pointerPoints': {key: canvas_point(key) for key in windows}, 'holePoints': {key: canvas_point(key, 72, 30) for key in windows}, 'cornerPoints': {key: window_point(key, 2, 2) for key in windows}, 'windows': {key: {'x': window.get_position()[0], 'y': window.get_position()[1], 'visible': window.get_visible()} for key, window in windows.items()}}
    with open(os.path.join(root, 'state.next'), 'w') as output:
        json.dump(result, output)
    os.replace(os.path.join(root, 'state.next'), os.path.join(root, 'state.json'))
    return False


def create(key, position, rgba=False):
    window = Gtk.Window(title=name + (' same title' if key in ('A', 'B') else ' ' + key))
    windows[key] = window
    events[key] = []
    window.set_decorated(os.environ.get('OCU_WINDOW_FIXTURE_DECORATED') == '1')
    window.set_default_size(280, 180)
    window.move(*position)
    if rgba:
        visual = window.get_screen().get_rgba_visual()
        if visual is None:
            raise RuntimeError('RGBA visual unavailable')
        window.set_visual(visual)
        window.set_app_paintable(True)
        window.override_background_color(Gtk.StateFlags.NORMAL, Gdk.RGBA(0, 0, 0, 0))
    box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
    window.add(box)
    box.pack_start(Gtk.Label(label='Window ' + key), False, False, 0)
    canvas = Gtk.DrawingArea()
    canvases[key] = canvas
    canvas.set_size_request(260, 80)
    canvas.add_events(Gdk.EventMask.BUTTON_PRESS_MASK | Gdk.EventMask.BUTTON_RELEASE_MASK)
    def received(_widget, event, phase):
        events[key].append({'phase': phase, 'button': event.button, 'x': event.x, 'y': event.y})
        state()
        return False
    canvas.connect('button-press-event', received, 'press')
    canvas.connect('button-release-event', received, 'release')
    def paint(_widget, context):
        context.set_operator(cairo.OPERATOR_SOURCE)
        context.set_source_rgba(0 if key in ('B', 'Black') else 1, 0, 1 if key == 'B' else 0, 0.5 if rgba else 1)
        context.paint()
    canvas.connect('draw', paint)
    box.pack_start(canvas, True, True, 0)
    def separate(_button):
        windows['A'].show_all()
        windows['A'].resize(280, 180)
        windows['Alpha'].resize(280, 180)
        windows['A'].move(10, 10)
        windows['B'].move(360, 10)
    def focus(_button):
        window.present()
        window.get_window().focus(Gdk.CURRENT_TIME)
    def shape(target):
        destination = windows[target]
        shaped[target] = not shaped.get(target, False)
        region = None
        if shaped[target]:
            region = cairo.Region(cairo.RectangleInt(0, 0, destination.get_allocated_width(), destination.get_allocated_height()))
            region.subtract(cairo.RectangleInt(0, 0, 12, 12))
            x, y = canvases[target].translate_coordinates(destination, 60, 20)
            region.subtract(cairo.RectangleInt(x, y, 24, 20))
        display = xlib.XOpenDisplay(None)
        if not display:
            raise RuntimeError('Fixture X11 connection unavailable')
        try:
            xid = destination.get_window().get_xid()
            if region is None:
                xshape.XShapeCombineMask(display, xid, 0, 0, 0, 0, 0)
            else:
                rectangles = [region.get_rectangle(i) for i in range(region.num_rectangles())]
                native = (NativeRectangle * len(rectangles))(*(NativeRectangle(r.x, r.y, r.width, r.height) for r in rectangles))
                xshape.XShapeCombineRectangles(display, xid, 0, 0, 0, native, len(rectangles), 0, 0)
            xlib.XSync(display, 0)
        finally:
            xlib.XCloseDisplay(display)
        state()
    actions = [('Focus', focus), ('Separate', separate),
               ('Cover A', lambda _b: (windows['B'].move(20, 20), windows['B'].present())),
               ('Offscreen A', lambda _b: windows['A'].move(-30, 10)),
               ('Ambiguous A', lambda _b: windows['A'].move(*windows['B'].get_position())),
               ('Grow A', lambda _b: windows['A'].resize(420, 280)),
               ('Grow Alpha', lambda _b: windows['Alpha'].resize(420, 280)),
               ('Shape A', lambda _b: shape('A')),
               ('Shape Alpha', lambda _b: shape('Alpha')),
               ('Hide A', lambda _b: windows['A'].hide()),
               ('Close A', lambda _b: windows['A'].destroy())]
    row = Gtk.Grid()
    for index, (label, action) in enumerate(actions):
        button = Gtk.Button(label=label)
        button.connect('clicked', action)
        row.attach(button, index % 3, index // 3, 1, 1)
    box.pack_start(row, False, False, 0)
    window.connect('configure-event', state)
    window.connect('focus-in-event', state)
    window.connect('focus-out-event', state)
    window.show_all()
    return window


create('A', (10, 10))
create('B', (360, 10))
create('Alpha', (10, 260), True)
create('Black', (360, 260))
windows['B'].present()
windows['B'].get_window().focus(Gdk.CURRENT_TIME)
GLib.timeout_add(50, state)
Gtk.main()
