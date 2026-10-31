#!/usr/bin/python3
"""Owned mapped GTK windows for XComposite pixel/identity checks."""
import json
import os
import gi
import cairo

gi.require_version('Gtk', '3.0')
from gi.repository import Gdk, GLib, Gtk

root, name = os.environ['OCU_WINDOW_FIXTURE_ROOT'], os.environ['OCU_WINDOW_FIXTURE_NAME']
GLib.set_prgname(name)
GLib.set_application_name(name)
windows = {}
events = {}
canvases = {}


def canvas_point(key):
    window, canvas = windows[key], canvases.get(key)
    native = window.get_window()
    point = canvas.translate_coordinates(window, 40, 23) if canvas else None
    if not native or point is None:
        return None
    success, x, y = native.get_origin()
    if not success:
        return None
    frame = native.get_frame_extents()
    return [x + point[0] - frame.x, y + point[1] - frame.y]


def state(*_args):
    result = {'pid': os.getpid(), 'events': events, 'pointerPoints': {key: canvas_point(key) for key in windows}, 'windows': {key: {'x': window.get_position()[0], 'y': window.get_position()[1], 'visible': window.get_visible()} for key, window in windows.items()}}
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
    actions = [('Focus', focus), ('Separate', separate),
               ('Cover A', lambda _b: (windows['B'].move(20, 20), windows['B'].present())),
               ('Offscreen A', lambda _b: windows['A'].move(-30, 10)),
               ('Ambiguous A', lambda _b: windows['A'].move(*windows['B'].get_position())),
               ('Grow A', lambda _b: windows['A'].resize(420, 280)),
               ('Grow Alpha', lambda _b: windows['Alpha'].resize(420, 280)),
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
