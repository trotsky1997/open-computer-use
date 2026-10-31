#!/usr/bin/python3
"""Owned D-Bus activated GTK application; never registers with the normal desktop."""
import json
import os
import sys
import gi

gi.require_version('Gtk', '3.0')
from gi.repository import Gio, GLib, Gtk

root = os.environ['OCU_LAUNCH_FIXTURE_ROOT']
name = os.environ['OCU_LAUNCH_FIXTURE_NAME']
if '--fallback' in sys.argv:
    with open(os.path.join(root, 'exec-fallback'), 'w') as output:
        output.write('Unexpected desktop Exec fallback')
    raise SystemExit(0)
GLib.set_prgname(name)
GLib.set_application_name(name)
class Fixture(Gtk.Application):
    def do_before_emit(self, platform_data):
        self.platform_data = platform_data.unpack()


app = Fixture(application_id=os.environ['OCU_LAUNCH_FIXTURE_ID'],
                      flags=Gio.ApplicationFlags.FLAGS_NONE)
count = 0
window = None
pending = []
interface = Gio.DBusNodeInfo.new_for_xml("""<node><interface name="org.freedesktop.Application">
<method name="Activate"><arg type="a{sv}" direction="in"/></method>
</interface></node>""").interfaces[0]


def controlled_call(connection, sender, object_path, _interface, _method, _args, invocation):
    if object_path.endswith('_Reject'):
        invocation.return_dbus_error('org.ocu.Denied', 'Owned activation refused')
        return
    helper = connection.call_sync('org.freedesktop.DBus', '/org/freedesktop/DBus',
                                  'org.freedesktop.DBus', 'GetConnectionUnixProcessID',
                                  GLib.Variant('(s)', (sender,)), GLib.VariantType.new('(u)'),
                                  Gio.DBusCallFlags.NONE, 2500, None).unpack()[0]
    with open(os.path.join(root, 'hold.json'), 'w') as output:
        json.dump({'helperPid': helper}, output)
    pending.append(invocation)  # Keep the reply pending until the harness cancels its helper.


def startup(application):
    connection = application.get_dbus_connection()
    for suffix in ('Reject', 'Hold'):
        alias = os.environ['OCU_LAUNCH_FIXTURE_ID'] + '-' + suffix
        connection.register_object('/' + alias.replace('.', '/').replace('-', '_'),
                                   interface, controlled_call, None, None)
        connection.call_sync('org.freedesktop.DBus', '/org/freedesktop/DBus',
                             'org.freedesktop.DBus', 'RequestName',
                             GLib.Variant('(su)', (alias, 0)), GLib.VariantType.new('(u)'),
                             Gio.DBusCallFlags.NONE, 2500, None)


def activated(application):
    global count, window
    count += 1
    if window is None:
        window = Gtk.ApplicationWindow(application=application, title=name)
        window.set_default_size(450, 180)
        window.add(Gtk.Label(label='Owned D-Bus launch fixture ready'))
        window.show_all()
    state = {'pid': os.getpid(), 'activations': count, 'args': sys.argv,
             'starter': os.environ.get('DBUS_STARTER_BUS_TYPE'),
             'platformData': application.platform_data}
    with open(os.path.join(root, 'state.next'), 'w', encoding='utf-8') as output:
        json.dump(state, output)
    os.replace(os.path.join(root, 'state.next'), os.path.join(root, 'state.json'))
    print('Owned D-Bus fixture activation ' + str(count), flush=True)


app.connect('startup', startup)
app.connect('activate', activated)
app.run(sys.argv)
