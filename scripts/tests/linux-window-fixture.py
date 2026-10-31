#!/usr/bin/python3
import json
import os
import gi

gi.require_version('Gtk', '3.0')
from gi.repository import Gtk, GLib, Gdk

root = os.environ['OCU_WINDOW_FIXTURE_ROOT']
name = os.environ['OCU_WINDOW_FIXTURE_NAME']
error_fd = os.open(root + '/fixture-errors.log', os.O_CREAT | os.O_WRONLY | os.O_APPEND, 0o600)
os.dup2(error_fd, 2)
os.close(error_fd)
GLib.set_prgname(name)
GLib.set_application_name(name)
windows, entries, notes, keys = {}, {}, {}, {}
scrollers, scroll_events = {}, {}
clipboard_data = []
image_windows, popup_menus = [], []
pointer_events, pointer_areas, pointer_motion, key_events = {}, {}, {}, {}
interceptors, pointer_grabbed = [], False
retired_interceptors = []

def frame_point(area, window, x, y):
    point = area.translate_coordinates(window, x, y)
    if point is None or window.get_window() is None:
        return None
    px, py = point
    success, wx, wy = window.get_window().get_origin()
    if not success:
        return None
    frame = window.get_window().get_frame_extents()
    return [wx + px - frame.x, wy + py - frame.y]

def state(*_args):
    with open(root + '/state.tmp', 'w', encoding='utf-8') as output:
        json.dump({'pid': os.getpid(), 'windows': list(windows), 'keys': keys, 'clipboard': clipboard_data, 'popups': sum(menu.get_visible() for menu in popup_menus), 'pointer': pointer_events, 'pointerMotion': pointer_motion, 'keyEvents': key_events, 'pointerGrabbed': pointer_grabbed, 'interceptors': len(interceptors), 'pointerSizes': {key: [area.get_allocated_width(), area.get_allocated_height()] for key, area in pointer_areas.items() if key in windows},
                   'pointerPoints': {key: frame_point(area, windows[key], area.get_allocated_width() // 2, area.get_allocated_height() // 2) for key, area in pointer_areas.items() if key in windows},
                   'windowPositions': {key: window.get_position() for key, window in windows.items()}, 'scroll': scroll_events,
                   'scrollOffsets': {key: [pane.get_hadjustment().get_value(), pane.get_vadjustment().get_value()] for key, pane in scrollers.items() if key in windows},
                   'scrollLimits': {key: [pane.get_hadjustment().get_upper() - pane.get_hadjustment().get_page_size(), pane.get_vadjustment().get_upper() - pane.get_vadjustment().get_page_size()] for key, pane in scrollers.items() if key in windows},
                   'scrollPoints': {key: frame_point(notes[key], windows[key], notes[key].get_allocated_width() // 2, notes[key].get_allocated_height() // 2) for key in scrollers if key in windows},
                   'values': {key: entry.get_text() for key, entry in entries.items()},
                   'selections': {key: entry.get_selection_bounds() for key, entry in entries.items()},
                   'carets': {key: entry.get_position() for key, entry in entries.items()},
                   'focused': {key: entry.has_focus() for key, entry in entries.items()},
                   'notes': {key: view.get_buffer().get_text(view.get_buffer().get_start_iter(), view.get_buffer().get_end_iter(), True) for key, view in notes.items()}}, output)
    os.replace(root + '/state.tmp', root + '/state.json')

def entry_for(key, value):
    entry = Gtk.Entry()
    entry.get_accessible().set_name('Editor ' + key)
    entry.set_text(value)
    entry.connect('changed', state)
    def popup(_entry, menu):
        popup_menus.append(menu)
        menu.connect('show', state)
        menu.connect('hide', state)
    entry.connect('populate-popup', popup)
    for signal in ['notify::cursor-position', 'notify::selection-bound', 'focus-in-event', 'focus-out-event']:
        entry.connect(signal, state)
    entries[key] = entry
    return entry

def create(key, value):
    if key in windows:
        return
    window = Gtk.Window(title=name + ' shared title')
    window.set_default_size(450, 260)
    box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
    window.add(box)
    box.pack_start(Gtk.Label(label='Window ' + key), False, False, 0)
    box.pack_start(entry_for(key, value), False, False, 0)
    view = Gtk.TextView()
    view.get_accessible().set_name('Notes ' + key)
    view.get_buffer().set_text('line1\nline2')
    view.get_buffer().connect('changed', state)
    notes[key] = view
    pane = Gtk.ScrolledWindow()
    pane.set_policy(Gtk.PolicyType.AUTOMATIC, Gtk.PolicyType.AUTOMATIC)
    pane.set_min_content_height(34)
    pane.add(view)
    scrollers[key], scroll_events[key] = pane, []
    for adjustment in (pane.get_hadjustment(), pane.get_vadjustment()):
        adjustment.connect('value-changed', state)
        adjustment.connect('changed', state)
    view.add_events(Gdk.EventMask.SCROLL_MASK)
    def record_scroll(_view, event):
        scroll_events[key].append({'direction': event.direction.value_nick, 'x': event.x, 'y': event.y, 'rootX': event.x_root, 'rootY': event.y_root, 'state': int(event.state), 'time': event.time})
        state()
        return False
    view.connect('scroll-event', record_scroll)
    box.pack_start(pane, True, True, 0)
    def black_image(_button):
        black = Gtk.Window(title=name + ' black image')
        black.set_decorated(False)
        black.set_default_size(160, 120)
        black.move(200, 200)
        black.override_background_color(Gtk.StateFlags.NORMAL, Gdk.RGBA(0, 0, 0, 1))
        image_windows.append(black)
        black.show_all()
        black.present()
        black.get_window().focus(Gdk.CURRENT_TIME)
    def focus(_button):
        window.present()
        entries[key].grab_focus()
        entries[key].set_position(-1)
        window.get_window().focus(Gdk.CURRENT_TIME)
    keys[key] = {'press': [], 'release': []}
    key_events[key] = []
    key_area = Gtk.DrawingArea()
    key_area.set_can_focus(True)
    key_area.add_events(Gdk.EventMask.KEY_PRESS_MASK | Gdk.EventMask.KEY_RELEASE_MASK | Gdk.EventMask.BUTTON_PRESS_MASK | Gdk.EventMask.BUTTON_RELEASE_MASK | Gdk.EventMask.POINTER_MOTION_MASK)
    pointer_events[key], pointer_areas[key], pointer_motion[key] = [], key_area, []
    def record_pointer(_area, event, phase):
        pointer_events[key].append({"phase": phase, "button": event.button, "type": event.type.value_nick, "x": event.x, "y": event.y, "state": int(event.state), "time": event.time})
        state()
        return True
    key_area.connect("button-press-event", record_pointer, "press")
    key_area.connect("button-release-event", record_pointer, "release")
    def record_motion(_area, event):
        if event.state & Gdk.ModifierType.BUTTON1_MASK:
            pointer_motion[key].append({'x': event.x, 'y': event.y, 'state': int(event.state)})
            state()
        return True
    key_area.connect('motion-notify-event', record_motion)

    key_area.set_size_request(100, 24)
    color = '#ff0000' if key == 'A' else '#0000ff'
    marker = Gtk.Label()
    marker.set_markup('<span background="' + color + '" foreground="' + color + '">window image marker</span>')
    box.pack_start(marker, False, False, 0)
    key_area.get_accessible().set_name('Key surface ' + key)
    def got_html(_clipboard, data, _unused):
        clipboard_data.append({'target': data.get_target().name(), 'data': bytes(data.get_data()).decode('utf-8') if data.get_length() >= 0 else None})
        state()
    def record_key(_area, event, kind):
        key_events[key].append({'phase': kind, 'key': Gdk.keyval_name(event.keyval), 'code': event.hardware_keycode, 'state': int(event.state), 'time': event.time})
        if kind == 'press' and event.state & Gdk.ModifierType.CONTROL_MASK and Gdk.keyval_to_lower(event.keyval) == Gdk.KEY_v:
            Gtk.Clipboard.get(Gdk.SELECTION_CLIPBOARD).request_contents(Gdk.Atom.intern('text/html', False), got_html, None)
            return True
        value = Gdk.keyval_to_unicode(event.keyval)
        keys[key][kind].append(chr(value) if value else Gdk.keyval_name(event.keyval))
        state()
        return True
    key_area.connect('key-press-event', record_key, 'press')
    key_area.connect('key-release-event', record_key, 'release')
    box.pack_start(key_area, False, False, 0)
    def focus_keys(_button):
        window.present()
        key_area.grab_focus()
        window.get_window().focus(Gdk.CURRENT_TIME)
    def intercept_pointer(_button):
        global pointer_grabbed
        display = Gdk.Display.get_default()
        if interceptors:
            pointer_grabbed = display.get_default_seat().grab(interceptors[0], Gdk.SeatCapabilities.POINTER, False, None, None, None, None) == Gdk.GrabStatus.SUCCESS
        else:
            px, py = pointer_areas['B'].translate_coordinates(windows['B'], pointer_areas['B'].get_allocated_width() // 2, pointer_areas['B'].get_allocated_height() // 2)
            _success, wx, wy = windows['B'].get_window().get_origin()
            attrs = Gdk.WindowAttr()
            attrs.window_type, attrs.wclass = Gdk.WindowType.TEMP, Gdk.WindowWindowClass.INPUT_ONLY
            attrs.override_redirect = True
            attrs.x, attrs.y, attrs.width, attrs.height = wx + px - 10, wy + py - 10, 20, 20
            overlay = Gdk.Window.new(Gdk.get_default_root_window(), attrs, Gdk.WindowAttributesType.X | Gdk.WindowAttributesType.Y | Gdk.WindowAttributesType.NOREDIR)
            interceptors.append(overlay)
            overlay.show()
        window.get_window().focus(Gdk.CURRENT_TIME)
        interceptors[0].raise_()
        display.sync()
        state()
    def separate_windows(_button):
        global pointer_grabbed
        display = Gdk.Display.get_default()
        display.get_default_seat().ungrab()
        pointer_grabbed = False
        for overlay in interceptors:
            overlay.hide()
        # Keep GDK grab-event references alive until the fixture process exits.
        retired_interceptors.extend(interceptors)
        interceptors.clear()
        windows['A'].move(10, 10)
        windows['B'].move(520, 10)
        display.sync()
        state()
    def select_notes(_button):
        buffer = notes[key].get_buffer()
        buffer.select_range(buffer.get_iter_at_offset(2), buffer.get_iter_at_offset(8))
    extra = [('Prepare caret', lambda _b: entries[key].set_position(2)),
             ('Prepare selection', lambda _b: entries[key].select_region(1, 4)),
             ('Select notes', select_notes), ('Focus entry', focus),
             ('Read only', lambda _b: entries[key].set_editable(False)), ('Focus keys', focus_keys),
             ('Separate windows', separate_windows), ('Intercept pointer', intercept_pointer),
             ('Black image', black_image),
             ('Close black', lambda _b: [window.destroy() for window in image_windows]),
             ('Offscreen A', lambda _b: windows['A'].move(-10, 10)),
             ('Occlude B', lambda _b: (windows['A'].move(530, 20), windows['A'].get_window().raise_())),
             ('Occlude A', lambda _b: (windows['B'].move(20, 20), windows['B'].get_window().raise_())),
             ('Copy external', lambda _b: Gtk.Clipboard.get(Gdk.SELECTION_CLIPBOARD).set_text('external-owned', -1)),
             ('Focus notes', lambda _b: (window.present(), notes[key].grab_focus(), window.get_window().focus(Gdk.CURRENT_TIME)))]
    def replace(_button):
        old = entries.pop(key)
        box.remove(old)
        old.destroy()
        replacement = entry_for(key, 'replacement-entry')
        box.pack_start(replacement, False, False, 0)
        box.reorder_child(replacement, 1)
        window.show_all()
        state()
    for label, callback in [('Replace entry', replace), ('Close window', lambda _b: window.destroy()),
                            ('Recreate A', lambda _b: create('A', 'replacement-window'))] + extra:
        button = Gtk.Button(label=label)
        button.connect('clicked', callback)
        box.pack_start(button, False, False, 0)
    def destroyed(_window):
        windows.pop(key, None)
        entries.pop(key, None)
        notes.pop(key, None)
        state()
    window.connect('destroy', destroyed)
    windows[key] = window
    window.show_all()
    state()

create('A', 'initial-A')
create('B', 'initial-B')
Gtk.main()
