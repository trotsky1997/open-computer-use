#!/usr/bin/env python3

import base64
import hashlib
import json
import math
import os
import sys
import time
import traceback
import warnings

warnings.filterwarnings("ignore", category=DeprecationWarning)

import gi

gi.require_version("Atspi", "2.0")

try:
    gi.require_version("Gdk", "3.0")
    from gi.repository import Gdk
except (ImportError, ValueError):
    Gdk = None

from gi.repository import Atspi


MAX_ELEMENTS = 1200
MAX_DEPTH = 64
DEFAULT_TEXT_LIMIT = 500


def frame(x, y, width, height):
    if width is None or height is None or width < 0 or height < 0:
        return None
    return {
        "x": float(x),
        "y": float(y),
        "width": float(width),
        "height": float(height),
    }


def safe(call, default=None):
    try:
        value = call()
        if value is None:
            return default
        return value
    except Exception:
        return default


def supports_interface(node, interface_name):
    interfaces = safe(lambda: node.get_interfaces(), [])
    expected = str(interface_name).casefold()
    return any(str(interface).casefold() == expected for interface in interfaces)


def require_desktop_session():
    missing = []
    if not os.environ.get("XDG_RUNTIME_DIR"):
        missing.append("XDG_RUNTIME_DIR")
    if not os.environ.get("DBUS_SESSION_BUS_ADDRESS"):
        missing.append("DBUS_SESSION_BUS_ADDRESS")
    if missing:
        raise RuntimeError(
            "Linux runtime requires an active desktop session; missing "
            + ", ".join(missing)
        )


def desktop():
    return Atspi.get_desktop(0)


def child_count(node):
    return int(safe(node.get_child_count, 0) or 0)


def child_at(node, index):
    return safe(lambda: node.get_child_at_index(index))


def node_name(node):
    return str(safe(node.get_name, "") or "")


def limit_text(value, text_limit=DEFAULT_TEXT_LIMIT):
    text = str(value or "")
    if text_limit is None:
        return text
    if len(text) > text_limit:
        return text[:text_limit] + "..."
    return text


def node_role(node):
    return str(safe(node.get_role_name, "") or "")


def node_pid(node):
    value = safe(node.get_process_id, 0)
    try:
        return int(value or 0)
    except Exception:
        return 0


def state_contains(node, state):
    state_set = safe(node.get_state_set)
    if state_set is None:
        return False
    return bool(safe(lambda: state_set.contains(state), False))


def extents(node):
    component = safe(node.get_component_iface)
    if component is None:
        return None
    rect = safe(lambda: Atspi.Component.get_extents(component, Atspi.CoordType.SCREEN))
    if (
        rect is None
        or rect.width <= 0
        or rect.height <= 0
        or rect.width > 100000
        or rect.height > 100000
    ):
        return None
    return frame(rect.x, rect.y, rect.width, rect.height)


def relative_frame(node, window_bounds):
    bounds = extents(node)
    if bounds is None:
        return None
    if window_bounds is None:
        return bounds
    return frame(
        bounds["x"] - window_bounds["x"],
        bounds["y"] - window_bounds["y"],
        bounds["width"],
        bounds["height"],
    )


def iter_apps():
    root = desktop()
    apps = []
    for index in range(child_count(root)):
        app = child_at(root, index)
        if app is not None and node_name(app):
            apps.append(app)
    return apps


def app_windows(app):
    windows = []
    for index in range(child_count(app)):
        child = child_at(app, index)
        if child is None:
            continue
        role = node_role(child).lower()
        bounds = extents(child)
        if role in {"frame", "window", "dialog", "alert"} or bounds is not None:
            windows.append((index, child))
    return windows


def main_window(app):
    windows = app_windows(app)
    if not windows:
        raise RuntimeError(
            "No top-level AT-SPI window is available for " + node_name(app)
        )
    for index, window in windows:
        if state_contains(window, Atspi.StateType.ACTIVE):
            return index, window
    for index, window in windows:
        if state_contains(window, Atspi.StateType.SHOWING):
            return index, window
    return windows[0]


def matches_query(app, query):
    normalized = query.strip().lower()
    if not normalized:
        return False
    if normalized.isdigit() and node_pid(app) == int(normalized):
        return True
    app_name = node_name(app).lower()
    if app_name == normalized or normalized in app_name:
        return True
    for _, window in app_windows(app):
        title = node_name(window).lower()
        if title == normalized or normalized in title:
            return True
    return False


def resolve_app(query):
    for app in iter_apps():
        if matches_query(app, query):
            return app
    raise RuntimeError('appNotFound("{}")'.format(query))


WINDOW_PREFIX = "ocu-window:"


def window_identity(window):
    pid = node_pid(window)
    bus = str(window.app.bus_name or "")
    path = str(window.path or "")
    try:
        with open("/proc/{}/stat".format(pid), encoding="utf-8") as source:
            start = source.read().rsplit(")", 1)[1].split()[19]
    except (OSError, IndexError):
        raise RuntimeError("Window process identity is unavailable")
    if not bus or not path or pid <= 0 or not start.isdigit():
        raise RuntimeError("Window identity is unavailable")
    return {"bus": bus, "path": path, "pid": pid, "start": start}


def identity_text(identity):
    return json.dumps(identity, sort_keys=True, separators=(",", ":"))


def window_id(identity):
    return int.from_bytes(hashlib.sha256(identity_text(identity).encode()).digest()[:6], "big") + 1


def window_selector(identity):
    return WINDOW_PREFIX + base64.urlsafe_b64encode(identity_text(identity).encode()).decode()


def window_entries(expected=None):
    entries = []
    for app in iter_apps():
        if expected and (node_pid(app) != expected["pid"] or str(safe(lambda: app.app.bus_name, "")) != expected["bus"]):
            continue
        for index, window in app_windows(app):
            if expected and str(window.path) != expected["path"]:
                continue
            if node_role(window).lower() not in {"frame", "window", "dialog", "alert"}:
                continue
            identity = window_identity(window)
            entries.append((app, index, window, identity))
            if len(entries) > MAX_ELEMENTS:
                raise RuntimeError("Window enumeration exceeds the native budget")
    return entries


def list_windows():
    entries = window_entries()
    ids = [window_id(item[3]) for item in entries]
    if len(ids) != len(set(ids)):
        raise RuntimeError("Ambiguous native window IDs")
    return [{"id": window_id(identity), "app": limit_text(node_name(app)), "title": limit_text(node_name(window))}
            for app, _index, window, identity in entries]


def bind_window(value):
    if isinstance(value, bool) or not isinstance(value, int) or not 0 < value <= 9007199254740991:
        raise RuntimeError("window_id must be a positive safe integer")
    matches = [entry for entry in window_entries() if window_id(entry[3]) == value]
    if len(matches) != 1:
        raise RuntimeError("Window is unavailable or ambiguous; list windows again")
    return window_selector(matches[0][3])


def resolve_target(query):
    if not query.startswith(WINDOW_PREFIX):
        app = resolve_app(query)
        index, window = main_window(app)
        return app, index, window
    try:
        identity = json.loads(base64.b64decode(query[len(WINDOW_PREFIX):], altchars=b"-_", validate=True))
        if not isinstance(identity, dict) or set(identity) != {"bus", "path", "pid", "start"} or type(identity["pid"]) is not int or identity["pid"] <= 0 or not all(isinstance(identity[key], str) and identity[key] for key in ("bus", "path", "start")) or not identity["path"].startswith("/") or not identity["start"].isdigit():
            raise ValueError("Invalid identity")
    except (ValueError, TypeError):
        raise RuntimeError("Invalid native window binding")
    matches = [entry for entry in window_entries(identity) if entry[3] == identity]
    if len(matches) != 1:
        raise RuntimeError("Bound window is closed or replaced; list windows and bind again")
    return matches[0][:3]


def action_names(node):
    names = []
    count = int(safe(node.get_n_actions, 0) or 0)
    for index in range(count):
        name = str(safe(lambda i=index: node.get_action_name(i), "") or "")
        description = str(
            safe(lambda i=index: node.get_action_description(i), "") or ""
        )
        label = name or description
        if label and label not in names:
            names.append(label)
    return names


def accessible_id(node):
    return str(safe(node.get_accessible_id, "") or "")


def text_value(node, text_limit=DEFAULT_TEXT_LIMIT):
    if not supports_interface(node, "Text"):
        return ""
    text_iface = safe(node.get_text_iface)
    if text_iface is None:
        return ""
    count = int(safe(lambda: Atspi.Text.get_character_count(text_iface), 0) or 0)
    if count <= 0:
        return ""
    end_offset = count if text_limit is None else min(count, text_limit + 1)
    value = str(safe(lambda: Atspi.Text.get_text(text_iface, 0, end_offset), "") or "")
    return limit_text(value, text_limit=text_limit)


def numeric_value(node):
    value_iface = safe(node.get_value_iface)
    if value_iface is None:
        return ""
    current = safe(lambda: Atspi.Value.get_current_value(value_iface))
    if current is None:
        return ""
    return str(current)


def element_value(node, text_limit=DEFAULT_TEXT_LIMIT):
    return text_value(node, text_limit=text_limit) or numeric_value(node)


def positive_int(value, fallback):
    if isinstance(value, bool):
        return fallback
    if isinstance(value, float) and not value.is_integer():
        return fallback
    try:
        integer = int(value)
    except (TypeError, ValueError):
        return fallback
    return integer if integer > 0 else fallback


def parse_text_limit(value, fallback=DEFAULT_TEXT_LIMIT):
    if isinstance(value, str) and value.lower() == "max":
        return None
    return positive_int(value, fallback)


def record_for(node, index, path, window_bounds, text_limit=DEFAULT_TEXT_LIMIT, lightweight_hidden=False):
    # Only an explicit non-SHOWING state qualifies. Errors/unknown state keep
    # full details; geometry alone cannot prove that a menu/control is hidden.
    showing = safe(lambda: node.get_state_set().contains(Atspi.StateType.SHOWING)) if lightweight_hidden else None
    omit_details = showing is not None and not bool(showing)
    bounds = None if omit_details else relative_frame(node, window_bounds)
    role = node_role(node)
    return {
        "index": index,
        "runtimeId": path[:],
        "objectPath": str(getattr(node, "path", "") or ""),
        "automationId": "" if omit_details else accessible_id(node),
        "name": limit_text(node_name(node), text_limit=text_limit),
        "controlType": role,
        "localizedControlType": role,
        "className": "" if omit_details else str(safe(node.get_toolkit_name, "") or ""),
        "value": "" if omit_details else element_value(node, text_limit=text_limit),
        "nativeWindowHandle": 0,
        "frame": bounds,
        "actions": [] if omit_details else action_names(node),
        **({"detailsOmitted": True} if omit_details else {}),
    }


def render_tree(root, window_bounds, root_path, text_limit=DEFAULT_TEXT_LIMIT, max_tree_nodes=MAX_ELEMENTS, max_tree_depth=MAX_DEPTH):
    records = []
    lines = []
    lightweight_hidden = os.environ.get("OPEN_COMPUTER_USE_LINUX_LIGHTWEIGHT_HIDDEN", "").strip().lower() in {"1", "true", "yes", "on"}

    def visit(node, depth, path):
        if len(records) >= max_tree_nodes or depth > max_tree_depth or node is None:
            return
        index = len(records)
        record = record_for(node, index, path, window_bounds, text_limit=text_limit, lightweight_hidden=lightweight_hidden)
        records.append(record)

        role = record["localizedControlType"] or record["controlType"] or "element"
        title = record["name"] or record["automationId"] or ""
        if record.get("detailsOmitted"):
            title += " [hidden details omitted]"
        value_segment = ""
        if record["value"] and record["value"] != title:
            safe_value = record["value"].replace("\r", "\\r").replace("\n", "\\n")
            value_segment = " Value: " + safe_value
        actions_segment = ""
        if record["actions"]:
            actions_segment = " Secondary Actions: " + ", ".join(record["actions"])
        frame_segment = ""
        if record["frame"] is not None:
            f = record["frame"]
            frame_segment = " Frame: {{x: {0}, y: {1}, width: {2}, height: {3}}}".format(
                round(f["x"]),
                round(f["y"]),
                round(f["width"]),
                round(f["height"]),
            )
        lines.append(
            ("\t" * (depth + 1))
            + "{} {} {}{}{}{}".format(
                index, role, title, value_segment, actions_segment, frame_segment
            ).rstrip()
        )

        for child_index in range(child_count(node)):
            child = child_at(node, child_index)
            visit(child, depth + 1, path + [child_index])

    visit(root, 0, root_path)
    return records, lines


def capture_window_png(bounds):
    if Gdk is None or bounds is None:
        return None
    try:
        screen = Gdk.Screen.get_default()
        if screen is None:
            return None
        root = screen.get_root_window()
        pixbuf = Gdk.pixbuf_get_from_window(
            root,
            int(round(bounds["x"])),
            int(round(bounds["y"])),
            max(1, int(round(bounds["width"]))),
            max(1, int(round(bounds["height"]))),
        )
        if pixbuf is None:
            return None
        if pixbuf_looks_black(pixbuf):
            return None
        ok, data = pixbuf.save_to_bufferv("png", [], [])
        if not ok:
            return None
        return base64.b64encode(bytes(data)).decode("ascii")
    except Exception:
        return None


def pixbuf_looks_black(pixbuf):
    try:
        pixels = pixbuf.get_pixels()
        channels = pixbuf.get_n_channels()
        rowstride = pixbuf.get_rowstride()
        width = pixbuf.get_width()
        height = pixbuf.get_height()
        if width <= 0 or height <= 0 or channels < 3:
            return True
        step_x = max(1, width // 16)
        step_y = max(1, height // 16)
        checked = 0
        for y in range(0, height, step_y):
            row = y * rowstride
            for x in range(0, width, step_x):
                offset = row + (x * channels)
                if (
                    pixels[offset] > 3
                    or pixels[offset + 1] > 3
                    or pixels[offset + 2] > 3
                ):
                    return False
                checked += 1
        return checked > 0
    except Exception:
        return False


def focus_details(window, text_limit=DEFAULT_TEXT_LIMIT, max_nodes=MAX_ELEMENTS, max_depth=MAX_DEPTH):
    """Find focus once, within the same node/depth budget as the snapshot."""
    visited = 0
    truncated = False

    def visit(node, depth):
        nonlocal visited, truncated
        if visited >= max_nodes or depth > max_depth:
            truncated = True
            return None
        visited += 1
        if node is None:
            return None
        if state_contains(node, Atspi.StateType.FOCUSED):
            return node
        children = child_count(node)
        if depth >= max_depth:
            # Do not fetch children that cannot be visited. Otherwise a wide
            # node at the depth boundary can bypass the node budget entirely.
            truncated = truncated or children > 0
            return None
        for index in range(children):
            if visited >= max_nodes:
                truncated = True
                break
            found = visit(child_at(node, index), depth + 1)
            if found is not None:
                return found
        return None

    focused = visit(window, 0)
    if focused is None:
        return None, None, truncated
    summary = (node_role(focused) + " " + limit_text(node_name(focused), text_limit)).strip()
    selection = None
    if supports_interface(focused, "Text"):
        text_iface = safe(focused.get_text_iface)
        count = safe(lambda: Atspi.Text.get_n_selections(text_iface), 0)
        selected = safe(lambda: Atspi.Text.get_selection(text_iface, 0)) if count > 0 else None
        if selected is not None:
            end = selected.end_offset
            if text_limit is not None:
                end = min(end, selected.start_offset + text_limit + 1)
            selection = safe(lambda: Atspi.Text.get_text(text_iface, selected.start_offset, end))
            if selection is not None:
                selection = limit_text(selection, text_limit)
    return summary, selection, False


def build_snapshot(query, text_limit=DEFAULT_TEXT_LIMIT, max_tree_nodes=MAX_ELEMENTS, max_tree_depth=MAX_DEPTH, include_ax=True, include_screenshot=True):
    app, window_index, window = resolve_target(query)
    bounds = extents(window)
    records, lines = [], []
    focus, selection = None, None
    if include_ax:
        records, lines = render_tree(
            window,
            bounds,
            [window_index],
            text_limit=text_limit,
            max_tree_nodes=max_tree_nodes,
            max_tree_depth=max_tree_depth,
        )
        focus, selection, focus_truncated = focus_details(window, text_limit, max_tree_nodes, max_tree_depth)
        if focus_truncated:
            lines.append("[Focus search incomplete: node/depth budget reached.]")
    if include_screenshot and query.startswith(WINDOW_PREFIX):
        # shortcut: enable images after exact native window capture is verified.
        lines.append("Exact window screenshot capture is unavailable for this AT-SPI binding.")
    pid = node_pid(app)
    return {
        "app": {
            "name": node_name(app),
            "bundleIdentifier": node_name(app),
            "pid": pid,
        },
        "windowTitle": limit_text(node_name(window), text_limit=text_limit),
        "windowBounds": bounds,
        "screenshotPngBase64": capture_window_png(bounds) if include_screenshot and not query.startswith(WINDOW_PREFIX) else None,
        "treeLines": lines,
        "focusedSummary": focus,
        "selectedText": selection,
        "elements": records,
    }


def list_apps_text():
    lines = []
    for app in sorted(iter_apps(), key=lambda item: (node_name(item).lower(), node_pid(item))):
        windows = app_windows(app)
        if not windows:
            continue
        title = node_name(windows[0][1]) or "untitled"
        name = node_name(app)
        lines.append(
            "{} -- {} [running, pid={}, window={}]".format(
                name, name, node_pid(app), title
            )
        )
    return "\n".join(lines)


def find_first(root, predicate):
    if root is None:
        return None
    if predicate(root):
        return root
    for index in range(child_count(root)):
        found = find_first(child_at(root, index), predicate)
        if found is not None:
            return found
    return None


def iter_all(root, max_depth=None):
    items = []

    def visit(node, depth=0):
        if node is None or len(items) >= MAX_ELEMENTS or (max_depth is not None and depth > max_depth):
            return
        items.append(node)
        for index in range(child_count(node)):
            visit(child_at(node, index), depth + 1)

    visit(root)
    return items


def resolve_path(app, path):
    if not path:
        return None
    node = app
    for index in path:
        node = child_at(node, int(index))
        if node is None:
            return None
    return node


def same_frame(record_frame, node_frame):
    if record_frame is None or node_frame is None:
        return False
    for key in ("x", "y", "width", "height"):
        if abs(float(record_frame.get(key, 0)) - float(node_frame.get(key, 0))) > 3:
            return False
    return True


def find_element(app, record, window=None, strict=False):
    if not record:
        return None
    if window is None:
        _, window = main_window(app)
    object_path = record.get("objectPath")
    if strict:
        if not object_path:
            raise RuntimeError("Element identity unavailable; refresh the bound window")
        matches = [node for node in iter_all(window, max_depth=MAX_DEPTH) if str(getattr(node, "path", "")) == object_path]
        if len(matches) != 1:
            raise RuntimeError("Bound element was removed or replaced; refresh the window")
        return matches[0]
    node = resolve_path(app, record.get("runtimeId") or [])
    if node is not None:
        return node

    target_name = str(record.get("name") or "")
    target_id = str(record.get("automationId") or "")
    target_role = str(record.get("controlType") or "")
    window_bounds = extents(window)
    for candidate in iter_all(window):
        if target_id and accessible_id(candidate) == target_id:
            return candidate
        if target_name and node_name(candidate) == target_name and node_role(candidate) == target_role:
            return candidate
        if target_role and node_role(candidate) == target_role:
            if same_frame(record.get("frame"), relative_frame(candidate, window_bounds)):
                return candidate
    return None


def preferred_action_index(node):
    preferred_exact = {
        "click",
        "press",
        "activate",
        "default.activate",
        "invoke",
        "select",
        "toggle",
        "open",
    }
    count = int(safe(node.get_n_actions, 0) or 0)
    fallback = None
    for index in range(count):
        name = str(safe(lambda i=index: node.get_action_name(i), "") or "")
        description = str(safe(lambda i=index: node.get_action_description(i), "") or "")
        lower = (name or description).lower()
        if lower in preferred_exact:
            return index
        if fallback is None and (
            "activate" in lower or "click" in lower or "press" in lower
        ):
            fallback = index
    return fallback


def do_action_by_index(node, index):
    if index is None:
        return False
    return bool(safe(lambda: node.do_action(int(index)), False))


def screen_point(window_bounds, element=None, x=None, y=None):
    if element is not None:
        f = element.get("frame")
        if f is not None and window_bounds is not None:
            return (
                window_bounds["x"] + f["x"] + f["width"] / 2,
                window_bounds["y"] + f["y"] + f["height"] / 2,
            )
    if x is None or y is None or window_bounds is None:
        raise RuntimeError("coordinate action requires window bounds and x/y")
    return window_bounds["x"] + float(x), window_bounds["y"] + float(y)


def mouse_button_events(button):
    normalized = (button or "left").lower()
    if normalized == "right":
        return "b3p", "b3r"
    if normalized == "middle":
        return "b2p", "b2r"
    return "b1p", "b1r"


def send_mouse_click(x, y, button, count):
    down, up = mouse_button_events(button)
    repeat = max(1, int(count or 1))
    for _ in range(repeat):
        Atspi.generate_mouse_event(int(round(x)), int(round(y)), "abs")
        Atspi.generate_mouse_event(int(round(x)), int(round(y)), down)
        time.sleep(0.035)
        Atspi.generate_mouse_event(int(round(x)), int(round(y)), up)
        time.sleep(0.05)


def send_drag(from_x, from_y, to_x, to_y):
    Atspi.generate_mouse_event(int(round(from_x)), int(round(from_y)), "abs")
    Atspi.generate_mouse_event(int(round(from_x)), int(round(from_y)), "b1p")
    steps = 12
    for step in range(1, steps + 1):
        x = from_x + ((to_x - from_x) * step / steps)
        y = from_y + ((to_y - from_y) * step / steps)
        Atspi.generate_mouse_event(int(round(x)), int(round(y)), "abs")
        time.sleep(0.02)
    Atspi.generate_mouse_event(int(round(to_x)), int(round(to_y)), "b1r")


KEY_ALIASES = {
    "return": "Return",
    "enter": "Return",
    "tab": "Tab",
    "escape": "Escape",
    "esc": "Escape",
    "backspace": "BackSpace",
    "back_space": "BackSpace",
    "delete": "Delete",
    "space": "space",
    "left": "Left",
    "up": "Up",
    "right": "Right",
    "down": "Down",
    "home": "Home",
    "end": "End",
    "page_up": "Page_Up",
    "prior": "Page_Up",
    "page_down": "Page_Down",
    "next": "Page_Down",
}

# X11 modifier bits for LOCKMODIFIERS/UNLOCKMODIFIERS. Super is usually Mod4.
MODIFIER_BITS = {
    "ctrl": "CONTROL",
    "control": "CONTROL",
    "shift": "SHIFT",
    "alt": "ALT",
    "super": "META3",
    "win": "META3",
    "cmd": "META3",
}


# GDK returns VoidSymbol for names it doesn't know.
VOID_SYMBOL = 0xFFFFFF


def keyval(name):
    # Characters have no name lookup in GDK ("/" is "slash"), so map them
    # from Unicode instead.
    if len(name) == 1:
        if Gdk is not None:
            return int(Gdk.unicode_to_keyval(ord(name)))
        codepoint = ord(name)
        return codepoint if codepoint <= 0xff else 0x01000000 | codepoint
    if Gdk is not None:
        value = int(Gdk.keyval_from_name(name))
        if value and value != VOID_SYMBOL:
            return value
    raise RuntimeError("Unsupported key: " + name)


def send_key(key):
    parts = [part for part in str(key).split("+") if part]
    if not parts:
        raise RuntimeError("Unsupported key: " + str(key))
    main = parts[-1]
    mask = 0
    for modifier in parts[:-1]:
        name = MODIFIER_BITS.get(modifier.lower())
        if name is None:
            raise RuntimeError("Unsupported modifier: " + modifier)
        mask |= 1 << int(getattr(Atspi.ModifierType, name))
    normalized = KEY_ALIASES.get(main.lower(), main)
    if mask:
        Atspi.generate_keyboard_event(mask, None, Atspi.KeySynthType.LOCKMODIFIERS)
    try:
        if len(normalized) == 1 and not mask:
            Atspi.generate_keyboard_event(0, normalized, Atspi.KeySynthType.STRING)
        else:
            # SYM takes a keysym. PRESS, RELEASE, and PRESSRELEASE take a
            # hardware keycode, so passing a keysym there sends another key.
            Atspi.generate_keyboard_event(
                keyval(normalized), None, Atspi.KeySynthType.SYM
            )
    finally:
        if mask:
            Atspi.generate_keyboard_event(
                mask, None, Atspi.KeySynthType.UNLOCKMODIFIERS
            )


def send_characters(text, verify_focus):
    if not isinstance(text, str) or any(not character.isprintable() for character in text):
        raise RuntimeError("type_characters requires printable Unicode characters")
    symbols = [keyval(character) for character in text]
    sent = 0
    try:
        for symbol in symbols:
            verify_focus()
            if not Atspi.generate_keyboard_event(symbol, None, Atspi.KeySynthType.SYM):
                raise RuntimeError("Native key synthesis failed")
            sent += 1
    except Exception as exc:
        raise RuntimeError("{}; {} characters confirmed sent; inspect before retrying".format(exc, sent)) from exc
    return sent


def send_text(text):
    Atspi.generate_keyboard_event(0, str(text), Atspi.KeySynthType.STRING)


def find_editable_text(root):
    matches = [node for node in iter_all(root, max_depth=MAX_DEPTH)
               if state_contains(node, Atspi.StateType.FOCUSED)
               and supports_interface(node, "EditableText") and supports_interface(node, "Text")]
    return matches[0] if len(matches) == 1 else None


def insert_text(root, text, node=None):
    if node is None:
        if not state_contains(root, Atspi.StateType.ACTIVE):
            return False
        node = find_editable_text(root)
    if node is None:
        return False
    if not supports_interface(node, "EditableText") or not supports_interface(node, "Text") or not state_contains(node, Atspi.StateType.EDITABLE):
        raise RuntimeError("Target field is not editable text")
    editable, text_iface = node.get_editable_text_iface(), node.get_text_iface()
    count = Atspi.Text.get_character_count(text_iface)
    caret = Atspi.Text.get_caret_offset(text_iface)
    selections = Atspi.Text.get_n_selections(text_iface)
    if count < 0 or not 0 <= caret <= count or selections not in (0, 1):
        raise RuntimeError("Invalid or ambiguous text caret/selection")
    start = end = caret
    if selections:
        selected = Atspi.Text.get_selection(text_iface, 0)
        start, end = selected.start_offset, selected.end_offset
        if not 0 <= start <= end <= count:
            raise RuntimeError("Invalid text selection")
    protected = node_role(node).lower() == "password text"
    before = None if protected else Atspi.Text.get_text(text_iface, 0, -1)
    if before is not None and len(before) != count:
        raise RuntimeError("Provider text offsets are inconsistent")
    if start != end:
        if protected and (start != 0 or end != count):
            raise RuntimeError("Partial protected selection requires native keyboard input")
        expected = text if protected else before[:start] + text + before[end:]
        applied = Atspi.EditableText.set_text_contents(editable, expected)
    else:
        expected = None if protected else before[:caret] + text + before[caret:]
        applied = Atspi.EditableText.insert_text(editable, caret, text, len(text.encode("utf-8")))
    if not applied:
        raise RuntimeError("Text edit failed; inspect the field before retrying")
    if protected and Atspi.Text.get_character_count(text_iface) != count - (end - start) + len(text):
        raise RuntimeError("Protected text length changed unexpectedly; inspect before retrying")
    if not protected and Atspi.Text.get_text(text_iface, 0, -1) != expected:
        raise RuntimeError("Text changed or was transformed during the edit; inspect before retrying")
    if not Atspi.Text.set_caret_offset(text_iface, start + len(text)):
        raise RuntimeError("Text was edited but caret placement failed; inspect before retrying")
    return True


def set_element_value(node, value):
    if node is not None and supports_interface(node, "EditableText"):
        editable = safe(node.get_editable_text_iface)
        if editable is not None:
            return bool(
                safe(
                    lambda: Atspi.EditableText.set_text_contents(editable, str(value)),
                    False,
                )
            )
    value_iface = safe(node.get_value_iface) if node is not None else None
    if value_iface is not None:
        try:
            return bool(Atspi.Value.set_current_value(value_iface, float(value)))
        except Exception:
            pass
    return False


def invoke_secondary_action(node, action):
    if node is None:
        raise RuntimeError("unknown element_index")
    normalized = str(action).lower()
    count = int(safe(node.get_n_actions, 0) or 0)
    for index in range(count):
        name = str(safe(lambda i=index: node.get_action_name(i), "") or "")
        description = str(safe(lambda i=index: node.get_action_description(i), "") or "")
        if normalized in {name.lower(), description.lower()}:
            if do_action_by_index(node, index):
                return
            break
    raise RuntimeError("{} is not a valid secondary action for element".format(action))


def scroll_element(direction, pages):
    key = "Page_Down"
    if direction == "up":
        key = "Page_Up"
    elif direction == "left":
        key = "Left"
    elif direction == "right":
        key = "Right"
    repeat = max(1, int(math.ceil(float(pages or 1))))
    for _ in range(repeat):
        send_key(key)
        time.sleep(0.04)


def perform_operation(operation):
    tool = operation.get("tool")
    if tool == "list_windows":
        return {"ok": True, "text": json.dumps(list_windows())}
    if tool == "bind_window":
        return {"ok": True, "text": json.dumps({"app": bind_window(operation.get("window_id"))})}
    if tool == "list_apps":
        return {"ok": True, "text": list_apps_text()}
    if tool == "get_app_state":
        for key in ("include_ax", "include_screenshot"):
            if key in operation and not isinstance(operation[key], bool):
                raise RuntimeError(key + " must be a boolean")
        if not operation.get("include_ax", True) and not operation.get("include_screenshot", True):
            raise RuntimeError("At least one of include_ax or include_screenshot must be true")
        return {
            "ok": True,
            "snapshot": build_snapshot(
                operation.get("app", ""),
                text_limit=parse_text_limit(operation.get("text_limit"), DEFAULT_TEXT_LIMIT),
                max_tree_nodes=positive_int(operation.get("max_tree_nodes"), MAX_ELEMENTS),
                max_tree_depth=positive_int(operation.get("max_tree_depth"), MAX_DEPTH),
                include_ax=operation.get("include_ax", True),
                include_screenshot=operation.get("include_screenshot", True),
            ),
        }

    query = operation.get("app", "")
    app, _, window = resolve_target(query)
    bound = query.startswith(WINDOW_PREFIX)
    bounds = operation.get("windowBounds") or extents(window)
    element_record = operation.get("element")
    element = find_element(app, element_record, window=window, strict=bound or (tool == "type_text" and element_record is not None))

    def physical(pointer=False, force=False):
        if not bound and not force:
            return
        if pointer:
            # shortcut: enable physical pointer input after native hit routing is verified.
            raise RuntimeError("Window-bound physical pointer routing is unavailable; use a native accessibility action")
        if not state_contains(window, Atspi.StateType.ACTIVE) or not any(state_contains(node, Atspi.StateType.FOCUSED) for node in iter_all(window, max_depth=MAX_DEPTH)):
            raise RuntimeError("Window-bound keyboard input requires verified focus in the bound window")


    if tool == "click":
        click_method = (operation.get("click_method") or "auto").lower()
        if click_method == "accessibility":
            if element is None:
                raise RuntimeError("click_method 'accessibility' requires element_index")
            if operation.get("mouse_button", "left") != "left":
                raise RuntimeError(
                    "click_method 'accessibility' only supports mouse_button 'left'"
                )
            if not do_action_by_index(element, preferred_action_index(element)):
                raise RuntimeError(
                    "click_method 'accessibility' could not click the requested element"
                )
        elif click_method == "app_post":
            raise RuntimeError("click_method 'app_post' is not supported on Linux")
        elif click_method == "sky_click":
            raise RuntimeError("click_method 'sky_click' is not supported on Linux")
        elif click_method == "global":
            physical(pointer=True)
            x, y = screen_point(
                bounds,
                element_record,
                operation.get("x"),
                operation.get("y"),
            )
            send_mouse_click(
                x, y, operation.get("mouse_button", "left"), operation.get("click_count", 1)
            )
        elif click_method == "auto":
            handled = False
            if element is not None and operation.get("mouse_button", "left") == "left":
                handled = do_action_by_index(element, preferred_action_index(element))
            if not handled:
                physical(pointer=True)
                x, y = screen_point(
                    bounds,
                    element_record,
                    operation.get("x"),
                    operation.get("y"),
                )
                send_mouse_click(
                    x,
                    y,
                    operation.get("mouse_button", "left"),
                    operation.get("click_count", 1),
                )
        else:
            raise RuntimeError("Invalid click_method '{}'".format(click_method))
    elif tool == "perform_secondary_action":
        invoke_secondary_action(element, operation.get("action", ""))
    elif tool == "scroll":
        physical()
        scroll_element(operation.get("direction", "down"), operation.get("pages", 1))
    elif tool == "drag":
        physical(pointer=True)
        from_x, from_y = screen_point(
            bounds, None, operation.get("from_x"), operation.get("from_y")
        )
        to_x, to_y = screen_point(bounds, None, operation.get("to_x"), operation.get("to_y"))
        send_drag(from_x, from_y, to_x, to_y)
    elif tool == "type_characters":
        return {"ok": True, "charactersSent": send_characters(operation.get("text", ""), lambda: physical(force=True))}
    elif tool == "type_text":
        text = operation.get("text", "")
        if not isinstance(text, str) or not text or "\0" in text:
            raise RuntimeError("type_text requires non-empty text without NUL")
        if element_record is not None:
            if element is None or not insert_text(window, text, node=element):
                raise RuntimeError("Indexed field is not editable text")
        elif not insert_text(window, text):
            physical(force=True)
            send_text(text)
    elif tool == "press_key":
        physical()
        send_key(operation.get("key", ""))
    elif tool == "set_value":
        if element is None:
            raise RuntimeError("unknown element_index")
        if not set_element_value(element, operation.get("value", "")):
            raise RuntimeError("Cannot set a value for an element that is not settable")
    else:
        raise RuntimeError('unsupportedTool("{}")'.format(tool))

    if operation.get("skip_read_back", False):
        return {"ok": True}

    time.sleep(0.12)
    return {"ok": True, "snapshot": build_snapshot(operation.get("app", ""))}


def main():
    if len(sys.argv) != 2:
        raise RuntimeError("runtime.py requires an operation JSON path")
    require_desktop_session()
    Atspi.init()
    with open(sys.argv[1], "r", encoding="utf-8") as file:
        operation = json.load(file)
    try:
        response = perform_operation(operation)
    except Exception as exc:
        response = {"ok": False, "error": str(exc)}
    print(json.dumps(response, separators=(",", ":")))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print(json.dumps({"ok": False, "error": traceback.format_exc()}))
