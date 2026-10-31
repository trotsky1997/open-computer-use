"""Explicit desktop-entry launch using the executor's GIO/XDG registry."""
import os

from gi.repository import Gio, GLib

from native_cancel import check_cancelled


def launch_desktop(app):
    if app.endswith('.desktop'):
        info = (Gio.DesktopAppInfo.new_from_filename(os.path.abspath(app))
                if '/' in app else Gio.DesktopAppInfo.new(app))
    else:
        matches = [item for item in Gio.AppInfo.get_all()
                   if item.get_display_name() == app]
        if len(matches) > 1:
            ids = ', '.join(sorted(item.get_id() for item in matches))
            raise RuntimeError('Ambiguous application display name; use a desktop ID: ' + ids)
        info = matches[0] if matches else None
    if info is None or info.get_is_hidden():
        raise RuntimeError('No installed desktop application matches: ' + app)
    check_cancelled()
    if info.get_boolean('DBusActivatable'):
        bus_name = info.get_id().removesuffix('.desktop')
        if not Gio.dbus_is_name(bus_name) or bus_name.startswith(':'):
            raise RuntimeError('Invalid D-Bus desktop application ID: ' + bus_name)
        object_path = '/' + bus_name.replace('.', '/').replace('-', '_')
        platform_data = {key: GLib.Variant('s', os.environ[variable])
                         for variable, key in (('DESKTOP_STARTUP_ID', 'desktop-startup-id'),
                                               ('XDG_ACTIVATION_TOKEN', 'activation-token'))
                         if os.environ.get(variable)}
        # The short-lived helper must receive Activate's reply before closing its connection.
        connection = Gio.bus_get_sync(Gio.BusType.SESSION, None)
        try:
            connection.call_sync(bus_name, object_path, 'org.freedesktop.Application',
                                 'Activate', GLib.Variant('(a{sv})', (platform_data,)),
                                 GLib.VariantType.new('()'), Gio.DBusCallFlags.NONE,
                                 25000, None)
        except GLib.Error as error:
            raise RuntimeError('D-Bus activation failed; inspect before retrying: ' + str(error)) from error
        return {'ok': True, 'text': 'Desktop application acknowledged activation; observe readiness before input.'}
    # GIO owns Exec field-code expansion; never parse a shell command.
    with open(os.devnull, 'r+b') as null:
        accepted = info.launch_uris_as_manager_with_fds(
            [], None, GLib.SpawnFlags.SEARCH_PATH, lambda *_: os.setsid(), None, None, None,
            null.fileno(), null.fileno(), null.fileno())
    if not accepted:
        raise RuntimeError('Desktop application launch was not accepted; inspect before retrying')
    return {'ok': True, 'text': 'Desktop application launch accepted; observe readiness before input.'}
