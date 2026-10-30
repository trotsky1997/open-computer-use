#!/usr/bin/env python3
"""Session-owned X11 clipboard provider. Payloads stay off stdout/logs."""
import json
import sys
from html.parser import HTMLParser

import gi

gi.require_version("Gtk", "3.0")
gi.require_version("GdkX11", "3.0")
from gi.repository import Gtk, Gdk, GdkX11, GLib
from runtime import Atspi, MAX_DEPTH, iter_all, keyval, require_desktop_session, resolve_target, state_contains

LIMIT = 16 * 1024 * 1024


class PlainHTML(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts, self.hidden = [], 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.hidden += 1
        if not self.hidden and tag == "br":
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.hidden = max(0, self.hidden - 1)
        elif not self.hidden and tag in ("p", "div", "li", "tr"):
            self.parts.append("\n")

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)


def payloads(operation):
    text, format_ = operation.get("text"), operation.get("format", "text")
    if not isinstance(text, str) or "\0" in text or len(text.encode("utf-8")) > LIMIT:
        raise RuntimeError("Paste requires Unicode text without NUL, at most 16 MiB")
    if format_ not in ("text", "md", "html"):
        raise RuntimeError("Paste format must be text, md or html")
    if format_ == "html":
        parser = PlainHTML()
        parser.feed(text)
        parser.close()
        return "".join(parser.parts), text
    return text, None


def verify_focus(app):
    _, _, window = resolve_target(app)
    if not state_contains(window, Atspi.StateType.ACTIVE) or not any(state_contains(node, Atspi.StateType.FOCUSED) for node in iter_all(window, max_depth=MAX_DEPTH)):
        raise RuntimeError("Paste requires verified focus in the target window")


def paste_key(app):
    mask = 1 << int(Atspi.ModifierType.CONTROL)
    verify_focus(app)
    try:
        if not Atspi.generate_keyboard_event(mask, None, Atspi.KeySynthType.LOCKMODIFIERS):
            raise RuntimeError("Could not hold paste modifier")
        if not Atspi.generate_keyboard_event(keyval("v"), None, Atspi.KeySynthType.SYM):
            raise RuntimeError("Could not synthesize paste key")
    finally:
        if not Atspi.generate_keyboard_event(mask, None, Atspi.KeySynthType.UNLOCKMODIFIERS):
            raise RuntimeError("Could not release paste modifier; inspect keyboard state")


class ClipboardOwner:
    def __init__(self):
        self.widget = Gtk.Invisible()
        self.widget.realize()
        self.atom = Gdk.Atom.intern("CLIPBOARD", False)
        self.plain, self.html, self.pending, self.timeout = "", None, False, None
        self.generation = 0
        self.widget.connect("selection-get", self.get)
        self.widget.connect("selection-clear-event", self.lost)

    def finish(self, error=None, generation=None):
        if not self.pending or (generation is not None and generation != self.generation):
            return False
        self.pending = False
        if self.timeout is not None:
            GLib.source_remove(self.timeout)
            self.timeout = None
        print(json.dumps({"ok": not bool(error), **({"error": error} if error else {})}), flush=True)
        return False

    def get(self, _widget, data, info, _time):
        if info == 1 and self.html is not None:
            data.set(data.get_target(), 8, self.html.encode("utf-8"))
        elif not data.set_text(self.plain, -1):
            self.finish("Clipboard target encoding failed; inspect before retrying")
            return
        # Payload retrieval confirms a transfer; the caller must verify app state.
        if self.pending:
            GLib.idle_add(self.finish, None, self.generation)

    def lost(self, *_args):
        self.finish("Clipboard ownership changed during paste; inspect before retrying")
        self.plain, self.html = "", None
        return False

    def request(self, operation):
        plain, html = payloads(operation)
        app = operation.get("app", "")
        verify_focus(app)
        self.plain, self.html = plain, html
        Gtk.selection_clear_targets(self.widget, self.atom)
        for target in ("UTF8_STRING", "TEXT", "STRING", "text/plain;charset=utf-8", "text/plain"):
            Gtk.selection_add_target(self.widget, self.atom, Gdk.Atom.intern(target, False), 0)
        if html is not None:
            Gtk.selection_add_target(self.widget, self.atom, Gdk.Atom.intern("text/html", False), 1)
        if not Gtk.selection_owner_set(self.widget, self.atom, Gdk.CURRENT_TIME):
            raise RuntimeError("Could not acquire clipboard ownership")
        self.generation += 1
        self.pending = True
        try:
            paste_key(app)
        except Exception as exc:
            self.finish(str(exc) + "; clipboard changed; inspect before retrying")
            return
        generation = self.generation
        def expired():
            self.timeout = None
            return self.finish("No clipboard payload request observed; clipboard changed; inspect before retrying", generation)
        self.timeout = GLib.timeout_add(5000, expired)

    def read(self, _source, condition):
        line = sys.stdin.readline()
        if not line:
            Gtk.main_quit()
            return False
        try:
            if self.pending:
                raise RuntimeError("Paste is still pending")
            self.request(json.loads(line))
        except Exception as exc:
            print(json.dumps({"ok": False, "error": str(exc)}), flush=True)
        return True


def main():
    require_desktop_session()
    Gtk.init([])
    if not isinstance(Gdk.Display.get_default(), GdkX11.X11Display):
        raise RuntimeError("Native clipboard paste currently requires an X11 desktop")
    Atspi.init()
    owner = ClipboardOwner()
    GLib.io_add_watch(sys.stdin, GLib.IO_IN | GLib.IO_HUP, owner.read)
    print(json.dumps({"ok": True}), flush=True)
    Gtk.main()
    owner.widget.destroy()


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}), flush=True)
