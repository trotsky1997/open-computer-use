#!/usr/bin/python3
import json
import os
import gi

gi.require_version('Gtk', '3.0')
from gi.repository import Gtk, GLib, Gdk

root = os.environ['OCU_WINDOW_FIXTURE_ROOT']
name = os.environ['OCU_WINDOW_FIXTURE_NAME']
GLib.set_prgname(name)
GLib.set_application_name(name)
windows, entries, notes, keys = {}, {}, {}, {}
clipboard_data = []

def state(*_args):
    with open(root + '/state.tmp', 'w', encoding='utf-8') as output:
        json.dump({'pid': os.getpid(), 'windows': list(windows), 'keys': keys, 'clipboard': clipboard_data,
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
    box.pack_start(view, True, True, 0)
    def focus(_button):
        window.present()
        entries[key].grab_focus()
        entries[key].set_position(-1)
        window.get_window().focus(Gdk.CURRENT_TIME)
    keys[key] = {'press': [], 'release': []}
    key_area = Gtk.DrawingArea()
    key_area.set_can_focus(True)
    key_area.add_events(Gdk.EventMask.KEY_PRESS_MASK | Gdk.EventMask.KEY_RELEASE_MASK)
    key_area.set_size_request(100, 24)
    key_area.get_accessible().set_name('Key surface ' + key)
    def got_html(_clipboard, data, _unused):
        clipboard_data.append({'target': data.get_target().name(), 'data': bytes(data.get_data()).decode('utf-8') if data.get_length() >= 0 else None})
        state()
    def record_key(_area, event, kind):
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
    def select_notes(_button):
        buffer = notes[key].get_buffer()
        buffer.select_range(buffer.get_iter_at_offset(2), buffer.get_iter_at_offset(8))
    extra = [('Prepare caret', lambda _b: entries[key].set_position(2)),
             ('Prepare selection', lambda _b: entries[key].select_region(1, 4)),
             ('Select notes', select_notes), ('Focus entry', focus),
             ('Read only', lambda _b: entries[key].set_editable(False)), ('Focus keys', focus_keys),
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
