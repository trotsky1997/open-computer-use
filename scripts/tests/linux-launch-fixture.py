#!/usr/bin/python3
# Owned fixture: launched with no arguments by the native lifecycle smoke.
import json
import os
import sys
import gi

gi.require_version('Gtk', '3.0')
from gi.repository import Gtk, GLib

root = os.environ['OCU_LAUNCH_FIXTURE_ROOT']
name = os.environ['OCU_LAUNCH_FIXTURE_NAME']
GLib.set_prgname(name)
GLib.set_application_name(name)
window = Gtk.Window(title=name)
window.set_default_size(450, 180)
window.add(Gtk.Label(label='Owned launch fixture ready'))
window.connect('destroy', Gtk.main_quit)
window.show_all()

def ready():
    with open(os.path.join(root, 'state.json'), 'w', encoding='utf-8') as output:
        json.dump({'pid': os.getpid(), 'sid': os.getsid(0), 'args': sys.argv}, output)
    print('Owned fixture stdout must stay outside MCP', flush=True)
    return False

GLib.idle_add(ready)
Gtk.main()
