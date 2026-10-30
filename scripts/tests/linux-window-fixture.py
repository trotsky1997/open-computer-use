#!/usr/bin/python3
import json
import os
import gi

gi.require_version('Gtk', '3.0')
from gi.repository import Gtk, GLib

root = os.environ['OCU_WINDOW_FIXTURE_ROOT']
name = os.environ['OCU_WINDOW_FIXTURE_NAME']
GLib.set_prgname(name)
GLib.set_application_name(name)
windows, entries = {}, {}

def state(*_args):
    with open(root + '/state.tmp', 'w', encoding='utf-8') as output:
        json.dump({'pid': os.getpid(), 'windows': list(windows),
                   'values': {key: entry.get_text() for key, entry in entries.items()}}, output)
    os.replace(root + '/state.tmp', root + '/state.json')

def entry_for(key, value):
    entry = Gtk.Entry()
    entry.get_accessible().set_name('Editor ' + key)
    entry.set_text(value)
    entry.connect('changed', state)
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
                            ('Recreate A', lambda _b: create('A', 'replacement-window'))]:
        button = Gtk.Button(label=label)
        button.connect('clicked', callback)
        box.pack_start(button, False, False, 0)
    def destroyed(_window):
        windows.pop(key, None)
        entries.pop(key, None)
        state()
    window.connect('destroy', destroyed)
    windows[key] = window
    window.show_all()
    state()

create('A', 'initial-A')
create('B', 'initial-B')
Gtk.main()
