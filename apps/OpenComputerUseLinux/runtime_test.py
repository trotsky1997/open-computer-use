import contextlib
import importlib.util
import pathlib
import sys
import types
import unittest
from unittest import mock


class FakeText:
    @staticmethod
    def get_character_count(_interface):
        return len(getattr(_interface, "text", "hello"))

    @staticmethod
    def get_text(_interface, _start, _end):
        return getattr(_interface, "text", "hello")

    @staticmethod
    def get_caret_offset(node):
        return node.caret

    @staticmethod
    def get_n_selections(node):
        return int(node.selection is not None)

    @staticmethod
    def get_selection(node, _index):
        return types.SimpleNamespace(start_offset=node.selection[0], end_offset=node.selection[1])

    @staticmethod
    def set_caret_offset(node, value):
        node.caret = value
        node.selection = None
        return True


    @staticmethod
    def add_selection(node, start, end):
        node.selection = (start, end)
        return True

    @staticmethod
    def set_selection(node, _index, start, end):
        node.selection = (start, end)
        return True


class FakeEditableText:
    @staticmethod
    def insert_text(_interface, _offset, _text, _length):
        _interface.byte_length = _length
        _interface.text = _interface.text[:_offset] + _text + _interface.text[_offset:]
        return True

    @staticmethod
    def set_text_contents(_interface, _text):
        _interface.text = _text
        return True


def load_runtime():
    gi = types.ModuleType("gi")
    gi.require_version = lambda *_args: None
    repository = types.ModuleType("gi.repository")
    repository.Atspi = types.SimpleNamespace(
        Text=FakeText,
        EditableText=FakeEditableText,
        StateType=types.SimpleNamespace(EDITABLE="editable", FOCUSED="focused", ACTIVE="active", VISIBLE="visible", SHOWING="showing"),
    )
    repository.Gdk = types.SimpleNamespace()
    gi.repository = repository

    runtime_path = pathlib.Path(__file__).with_name("runtime.py")
    spec = importlib.util.spec_from_file_location("open_computer_use_linux_runtime", runtime_path)
    module = importlib.util.module_from_spec(spec)
    with mock.patch.dict(
        sys.modules,
        {"gi": gi, "gi.repository": repository},
    ):
        spec.loader.exec_module(module)
    return module


class InterfaceOnlyAccessible:
    def __init__(self, interfaces):
        self.interfaces = interfaces
        self.text, self.caret, self.selection = "hello", 2, None
        self.editable, self.focused = True, False

    def get_state_set(self):
        return types.SimpleNamespace(contains=lambda state: self.editable if state == "editable" else self.focused if state == "focused" else False)

    def get_role_name(self):
        return getattr(self, "role", "text")

    def get_interfaces(self):
        return self.interfaces

    def get_text_iface(self):
        return self

    def get_editable_text_iface(self):
        return self

    def get_child_count(self):
        return 0


class RuntimeInterfaceDetectionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.runtime = load_runtime()

    def test_text_value_uses_accessible_interfaces(self):
        node = InterfaceOnlyAccessible(["Accessible", "Text"])

        self.assertEqual(self.runtime.text_value(node), "hello")

    def test_insert_text_uses_accessible_interfaces(self):
        node = InterfaceOnlyAccessible(["Accessible", "Text", "EditableText"])

        self.assertTrue(self.runtime.insert_text(node, "hello", node=node))

    def test_set_value_uses_accessible_interfaces(self):
        node = InterfaceOnlyAccessible(["Accessible", "Text", "EditableText"])

        self.assertTrue(self.runtime.set_element_value(node, "hello"))


class FakeKeySynthType:
    PRESS = "PRESS"
    RELEASE = "RELEASE"
    PRESSRELEASE = "PRESSRELEASE"
    SYM = "SYM"
    STRING = "STRING"
    LOCKMODIFIERS = "LOCKMODIFIERS"
    UNLOCKMODIFIERS = "UNLOCKMODIFIERS"


class FakeModifierType:
    SHIFT = 0
    CONTROL = 2
    ALT = 3
    META3 = 6


KEYSYMS = {"Return": 0xFF0D, "Tab": 0xFF09, "Down": 0xFF54}


class RuntimeKeyTests(unittest.TestCase):
    def setUp(self):
        self.runtime = load_runtime()
        self.events = []
        self.runtime.Atspi = types.SimpleNamespace(
            KeySynthType=FakeKeySynthType,
            ModifierType=FakeModifierType,
            generate_keyboard_event=lambda value, text, synth: self.events.append(
                (value, text, synth)
            ),
        )
        self.runtime.Gdk = types.SimpleNamespace(
            # Like GDK, unknown names map to VoidSymbol rather than 0.
            keyval_from_name=lambda name: KEYSYMS.get(name, 0xFFFFFF),
            unicode_to_keyval=lambda codepoint: codepoint,
        )

    def test_named_key_is_sent_as_keysym(self):
        self.runtime.send_key("Enter")

        self.assertEqual(self.events, [(0xFF0D, None, "SYM")])

    def test_modifiers_are_held_around_the_key(self):
        self.runtime.send_key("ctrl+shift+Tab")

        mask = (1 << FakeModifierType.CONTROL) | (1 << FakeModifierType.SHIFT)
        self.assertEqual(
            self.events,
            [
                (mask, None, "LOCKMODIFIERS"),
                (0xFF09, None, "SYM"),
                (mask, None, "UNLOCKMODIFIERS"),
            ],
        )

    def test_modified_character_is_sent_as_keysym(self):
        self.runtime.send_key("ctrl+a")

        mask = 1 << FakeModifierType.CONTROL
        self.assertEqual(self.events[1], (ord("a"), None, "SYM"))
        self.assertEqual(self.events[0], (mask, None, "LOCKMODIFIERS"))

    def test_modified_punctuation_is_sent_as_keysym(self):
        self.runtime.send_key("ctrl+/")

        self.assertEqual(self.events[1], (ord("/"), None, "SYM"))

    def test_unknown_key_name_is_rejected(self):
        with self.assertRaises(RuntimeError):
            self.runtime.send_key("NoSuchKey")

        self.assertEqual(self.events, [])

    def test_plain_character_is_typed(self):
        self.runtime.send_key("a")

        self.assertEqual(self.events, [(0, "a", "STRING")])

    def test_unknown_modifier_is_rejected(self):
        with self.assertRaises(RuntimeError):
            self.runtime.send_key("hyper+a")

        self.assertEqual(self.events, [])


class RuntimeSelectiveObservationTests(unittest.TestCase):
    def setUp(self):
        self.runtime = load_runtime()
        self.app = object()
        self.window = object()
        self.patches = []
        for name, value in {
            "resolve_app": self.app,
            "main_window": (0, self.window),
            "extents": {"x": 1, "y": 2, "width": 300, "height": 200},
            "node_pid": 42,
            "node_name": "Editor",
            "render_tree": ([{"index": 7}], ["tree"]),
            "focus_details": ("focus", "selection", False),
            "capture_bound_window_png": "png",
        }.items():
            patch = mock.patch.object(self.runtime, name, return_value=value)
            self.patches.append(patch)
            patch.start()
            self.addCleanup(patch.stop)

    def test_defaults_still_collect_full_state(self):
        state = self.runtime.build_snapshot("Editor")
        self.assertEqual(state["elements"], [{"index": 7}])
        self.assertEqual(state["screenshotPngBase64"], "png")
        self.runtime.focus_details.assert_called_once()

    def test_screenshot_only_skips_tree_focus_and_selection(self):
        state = self.runtime.build_snapshot("Editor", include_ax=False)
        self.assertEqual(state["screenshotPngBase64"], "png")
        self.assertEqual(state["elements"], [])
        self.assertEqual(state["treeLines"], [])
        self.assertIsNone(state["focusedSummary"])
        self.assertIsNone(state["selectedText"])
        for name in ("render_tree", "focus_details"):
            getattr(self.runtime, name).assert_not_called()

    def test_ax_only_skips_capture(self):
        state = self.runtime.build_snapshot("Editor", include_screenshot=False)
        self.assertEqual(state["treeLines"], ["tree"])
        self.assertIsNone(state["screenshotPngBase64"])
        self.runtime.capture_bound_window_png.assert_not_called()

    def test_ax_only_preserves_bounded_focus_reporting(self):
        self.runtime.focus_details.return_value = (None, None, True)
        state = self.runtime.build_snapshot("Editor", text_limit=20, max_tree_nodes=2,
                                            max_tree_depth=1, include_screenshot=False)
        self.runtime.focus_details.assert_called_once_with(self.window, 20, 2, 1)
        self.assertIn("[Focus search incomplete: node/depth budget reached.]", state["treeLines"])
        self.runtime.capture_bound_window_png.assert_not_called()

    def test_tool_forwards_explicit_observation_flags(self):
        state = self.runtime.perform_operation({"tool": "get_app_state", "app": "Editor", "include_ax": False})
        self.assertTrue(state["ok"])
        self.runtime.render_tree.assert_not_called()

    def test_invalid_or_empty_observations_are_rejected(self):
        for flags in ({"include_ax": "false"}, {"include_screenshot": None},
                      {"include_ax": 0}, {"include_ax": False, "include_screenshot": False}):
            with self.subTest(flags=flags):
                with self.assertRaises(RuntimeError):
                    self.runtime.perform_operation({"tool": "get_app_state", "app": "Editor", **flags})
        self.runtime.resolve_app.assert_not_called()


class HiddenDetailsTests(unittest.TestCase):
    def setUp(self):
        self.runtime = load_runtime()
        self.runtime.Atspi.StateType = types.SimpleNamespace(SHOWING="showing")

    def node(self, showing):
        node = mock.Mock()
        node.get_name.return_value = "Menu"
        node.get_role_name.return_value = "menu"
        node.get_child_count.return_value = 0
        node.get_state_set.return_value.contains.return_value = showing
        return node

    def test_hidden_record_retains_identity_and_skips_expensive_properties(self):
        node = self.node(False)
        with mock.patch.object(self.runtime, "relative_frame") as geometry, \
             mock.patch.object(self.runtime, "element_value") as value, \
             mock.patch.object(self.runtime, "action_names") as actions:
            record = self.runtime.record_for(node, 7, [0, 3], None, lightweight_hidden=True)
        self.assertEqual((record["index"], record["runtimeId"], record["name"]), (7, [0, 3], "Menu"))
        self.assertTrue(record["detailsOmitted"])
        for query in (geometry, value, actions):
            query.assert_not_called()
        node.get_toolkit_name.assert_not_called()
        node.get_accessible_id.assert_not_called()

    def test_default_and_unknown_or_showing_state_keep_full_details(self):
        for enabled, showing in ((False, False), (True, True), (True, None)):
            with self.subTest(enabled=enabled, showing=showing):
                node = self.node(showing)
                with mock.patch.object(self.runtime, "relative_frame", return_value=None), \
                     mock.patch.object(self.runtime, "accessible_id", return_value="id"), \
                     mock.patch.object(self.runtime, "element_value", return_value="value"), \
                     mock.patch.object(self.runtime, "action_names", return_value=["open"]):
                    record = self.runtime.record_for(node, 0, [0], None, lightweight_hidden=enabled)
                self.assertNotIn("detailsOmitted", record)
                self.assertEqual((record["value"], record["actions"]), ("value", ["open"]))
                if not enabled:
                    node.get_state_set.assert_not_called()

    def test_hidden_parent_does_not_prune_visible_menu_children_or_renumber(self):
        parent = self.node(False)
        child = self.node(True)
        parent.get_child_count.return_value = 1
        parent.get_child_at_index.return_value = child
        with mock.patch.dict(self.runtime.os.environ, {"OPEN_COMPUTER_USE_LINUX_LIGHTWEIGHT_HIDDEN": "1"}), \
             mock.patch.object(self.runtime, "relative_frame", return_value=None), \
             mock.patch.object(self.runtime, "accessible_id", return_value="id"), \
             mock.patch.object(self.runtime, "element_value", return_value="value"), \
             mock.patch.object(self.runtime, "action_names", return_value=[]):
            records, lines = self.runtime.render_tree(parent, None, [0])
        self.assertEqual([r["index"] for r in records], [0, 1])
        self.assertTrue(records[0]["detailsOmitted"])
        self.assertNotIn("detailsOmitted", records[1])
        self.assertIn("hidden details omitted", lines[0])
        self.assertEqual(records[1]["runtimeId"], [0, 0])

    def test_failed_state_reads_keep_full_details(self):
        for failure in ("state-set", "missing-state-set", "contains"):
            with self.subTest(failure=failure):
                node = self.node(False)
                if failure == "state-set":
                    node.get_state_set.side_effect = RuntimeError("state unavailable")
                elif failure == "missing-state-set":
                    node.get_state_set.return_value = None
                else:
                    node.get_state_set.return_value.contains.side_effect = RuntimeError("state unavailable")
                with mock.patch.object(self.runtime, "relative_frame", return_value=None), \
                     mock.patch.object(self.runtime, "element_value", return_value="retained"), \
                     mock.patch.object(self.runtime, "action_names", return_value=["click"]):
                    record = self.runtime.record_for(node, 0, [0], None, lightweight_hidden=True)
                self.assertNotIn("detailsOmitted", record)
                self.assertEqual((record["value"], record["actions"]), ("retained", ["click"]))

    def test_showing_node_with_negative_geometry_keeps_details(self):
        node = self.node(True)
        bounds = {"x": -100, "y": -200, "width": 30, "height": 40}
        with mock.patch.object(self.runtime, "relative_frame", return_value=bounds), \
             mock.patch.object(self.runtime, "element_value", return_value="visible"), \
             mock.patch.object(self.runtime, "action_names", return_value=["click"]):
            record = self.runtime.record_for(node, 0, [0], None, lightweight_hidden=True)
        self.assertNotIn("detailsOmitted", record)
        self.assertEqual((record["frame"], record["value"], record["actions"]), (bounds, "visible", ["click"]))


class FocusDetailsTests(unittest.TestCase):
    def setUp(self):
        self.runtime = load_runtime()
        self.runtime.Atspi.StateType = types.SimpleNamespace(FOCUSED="focused")

    def node(self, children=(), focused=False):
        node = mock.Mock()
        node.get_child_count.return_value = len(children)
        node.get_child_at_index.side_effect = lambda i: children[i]
        node.get_state_set.return_value.contains.side_effect = lambda s: focused
        node.get_name.return_value = "Editor"
        node.get_role_name.return_value = "text"
        node.get_interfaces.return_value = ["Text"]
        return node

    def test_summary_and_selection_share_one_focus_lookup(self):
        focused = self.node(focused=True)
        root = self.node([focused])
        self.runtime.Atspi.Text = types.SimpleNamespace(
            get_n_selections=lambda _: 1,
            get_selection=lambda _iface, index: types.SimpleNamespace(start_offset=1, end_offset=8),
            get_text=lambda _iface, start, end: "hello"[start:end],
        )
        summary, selected, truncated = self.runtime.focus_details(root)
        self.assertEqual((summary, selected, truncated), ("text Editor", "ello", False))
        root.get_child_at_index.assert_called_once_with(0)
        focused.get_state_set.assert_called_once()

    def test_node_budget_reports_incomplete_instead_of_absent(self):
        children = [self.node() for _ in range(100)]
        root = self.node(children)
        self.assertEqual(self.runtime.focus_details(root, max_nodes=3), (None, None, True))
        self.assertEqual(root.get_child_at_index.call_count, 2)

    def test_depth_budget_and_complete_absence(self):
        root = self.node([self.node([self.node(focused=True)])])
        self.assertEqual(self.runtime.focus_details(root, max_depth=1), (None, None, True))
        self.assertEqual(self.runtime.focus_details(self.node()), (None, None, False))

    def test_depth_boundary_does_not_fetch_out_of_budget_children(self):
        boundary = self.node()
        boundary.get_child_count.return_value = 100
        boundary.get_child_at_index.side_effect = None
        boundary.get_child_at_index.return_value = None
        root = self.node([boundary])
        self.assertEqual(self.runtime.focus_details(root, max_nodes=3, max_depth=1), (None, None, True))
        boundary.get_child_at_index.assert_not_called()

    def test_depth_boundary_leaf_is_complete(self):
        root = self.node([self.node()])
        self.assertEqual(self.runtime.focus_details(root, max_depth=1), (None, None, False))

    def test_focus_after_a_pruned_branch_is_still_reported(self):
        pruned = self.node([self.node()])
        focused = self.node(focused=True)
        root = self.node([pruned, focused])
        self.assertEqual(self.runtime.focus_details(root, max_depth=1), ("text Editor", None, False))
        pruned.get_child_at_index.assert_not_called()

    def test_selection_uses_standard_atspi_api_and_character_offsets(self):
        focused = self.node(focused=True)
        self.runtime.Atspi.Text = types.SimpleNamespace(
            get_n_selections=lambda _: 1,
            get_selection=lambda _iface, index: types.SimpleNamespace(start_offset=1, end_offset=4),
            get_text=lambda _iface, start, end: "a中文🙂z"[start:end],
        )
        self.assertEqual(self.runtime.focus_details(focused), ("text Editor", "中文🙂", False))
        self.assertEqual(self.runtime.focus_details(focused, text_limit=2), ("text Ed...", "中文...", False))

    def test_no_selection_does_not_fetch_a_range(self):
        selection = mock.Mock()
        self.runtime.Atspi.Text = types.SimpleNamespace(get_n_selections=lambda _: 0, get_selection=selection)
        self.assertEqual(self.runtime.focus_details(self.node(focused=True)), ("text Editor", None, False))
        selection.assert_not_called()

    def test_selection_read_failure_keeps_the_focus_summary(self):
        self.runtime.Atspi.Text = types.SimpleNamespace(
            get_n_selections=lambda _: 1,
            get_selection=mock.Mock(side_effect=RuntimeError("element became unavailable")),
        )
        self.assertEqual(self.runtime.focus_details(self.node(focused=True)), ("text Editor", None, False))

    def test_snapshot_reports_focus_budget_exhaustion(self):
        with mock.patch.object(self.runtime, "resolve_app"), \
             mock.patch.object(self.runtime, "main_window", return_value=(0, self.node())), \
             mock.patch.object(self.runtime, "extents"), \
             mock.patch.object(self.runtime, "render_tree", return_value=([], [])), \
             mock.patch.object(self.runtime, "focus_details", return_value=(None, None, True)) as focus, \
             mock.patch.object(self.runtime, "node_pid", return_value=42), \
             mock.patch.object(self.runtime, "node_name", return_value="Editor"), \
             mock.patch.object(self.runtime, "capture_bound_window_png"):
            state = self.runtime.build_snapshot("Editor", max_tree_nodes=5, max_tree_depth=2)
        self.assertIn("incomplete", state["treeLines"][0])
        self.assertEqual(focus.call_args.args[2:], (5, 2))


class RuntimeActionReadBackTests(unittest.TestCase):
    def setUp(self):
        self.runtime = load_runtime()
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.stack.enter_context(mock.patch.object(self.runtime, "resolve_app"))
        self.stack.enter_context(mock.patch.object(self.runtime, "main_window", return_value=(0, object())))
        for name in ("extents", "find_element", "send_key", "send_verified_drag", "send_verified_click",
                     "invoke_secondary_action", "send_verified_scroll", "insert_text", "set_element_value"):
            self.stack.enter_context(mock.patch.object(self.runtime, name))
        self.snapshot = self.stack.enter_context(mock.patch.object(self.runtime, "build_snapshot", return_value={"elements": []}))
        self.sleep = self.stack.enter_context(mock.patch.object(self.runtime.time, "sleep"))

    def test_all_actions_skip_snapshot_and_settle_when_requested(self):
        for tool, arguments in (
            ("click", {"x": 1, "y": 2}),
            ("drag", {"from_x": 1, "from_y": 2, "to_x": 3, "to_y": 4}),
            ("press_key", {"key": "Return"}),
            ("type_text", {"text": "hello"}),
            ("set_value", {"value": "hello"}),
            ("perform_secondary_action", {"action": "activate"}),
            ("scroll", {"direction": "down", "pages": 1}),
        ):
            with self.subTest(tool=tool):
                with mock.patch.object(self.runtime, "screen_point", side_effect=[(1, 2), (3, 4)]):
                    result = self.runtime.perform_operation({"tool": tool, "app": "Editor", "skip_read_back": True, **arguments})
                self.assertEqual(result, {"ok": True})
                self.snapshot.assert_not_called()
                self.sleep.assert_not_called()
        self.runtime.send_key.assert_called_once_with("Return")
        self.runtime.send_verified_drag.assert_called_once()
        self.runtime.insert_text.assert_called_once()

    def test_default_action_still_waits_and_returns_snapshot(self):
        result = self.runtime.perform_operation({"tool": "press_key", "app": "Editor", "key": "Return"})
        self.assertEqual(result, {"ok": True, "snapshot": {"elements": []}})
        self.sleep.assert_called_once_with(0.12)
        self.snapshot.assert_called_once_with("Editor")

    def test_explicit_observation_is_not_suppressed(self):
        result = self.runtime.perform_operation({"tool": "get_app_state", "app": "Editor", "skip_read_back": True})
        self.assertIn("snapshot", result)
        self.snapshot.assert_called_once()

    def test_action_errors_are_not_suppressed(self):
        self.runtime.send_key.side_effect = RuntimeError("input failed")
        with self.assertRaisesRegex(RuntimeError, "input failed"):
            self.runtime.perform_operation({"tool": "press_key", "app": "Editor", "key": "Return", "skip_read_back": True})
        self.snapshot.assert_not_called()



class WindowBindingTests(unittest.TestCase):
    def test_native_identity_survives_order_and_rejects_replacement(self):
        runtime = load_runtime()
        app, a, b = object(), object(), object()
        aid = {"bus": ":1.2", "path": "/a", "pid": 42, "start": "100"}
        bid = {**aid, "path": "/b"}
        entries = [(app, 0, a, aid), (app, 1, b, bid)]
        with mock.patch.object(runtime, "window_entries", return_value=entries):
            selector = runtime.bind_window(runtime.window_id(aid))
            self.assertEqual(runtime.resolve_target(selector), (app, 0, a))
        with mock.patch.object(runtime, "window_entries", return_value=list(reversed(entries))):
            self.assertEqual(runtime.bind_window(runtime.window_id(aid)), selector)
        with mock.patch.object(runtime, "window_entries", return_value=[(app, 0, b, bid)]):
            with self.assertRaisesRegex(RuntimeError, "closed or replaced"):
                runtime.resolve_target(selector)

    def test_unverified_bound_physical_input_never_reaches_global_synthesis(self):
        runtime = load_runtime()
        runtime.Atspi.StateType = types.SimpleNamespace(ACTIVE=1, FOCUSED=2)
        with mock.patch.object(runtime, "resolve_target", return_value=(object(), 0, object())), mock.patch.object(runtime, "extents", return_value=None), mock.patch.object(runtime, "find_element", return_value=None), mock.patch.object(runtime, "state_contains", return_value=False), mock.patch("x11_capture.drag_visible_window") as drag, mock.patch.object(runtime, "send_key") as key:
            with self.assertRaisesRegex(RuntimeError, "requires local X11 geometry"):
                runtime.perform_operation({"tool": "drag", "app": runtime.WINDOW_PREFIX + "owned"})
            with self.assertRaisesRegex(RuntimeError, "verified focus"):
                runtime.perform_operation({"tool": "press_key", "app": runtime.WINDOW_PREFIX + "owned", "key": "x"})
            drag.assert_not_called()
            key.assert_not_called()

    def test_bound_lookup_traversal_stops_on_a_cyclic_provider_tree(self):
        runtime = load_runtime()
        root = object()
        with mock.patch.object(runtime, "child_count", return_value=1), mock.patch.object(runtime, "child_at", return_value=root):
            self.assertLess(len(runtime.iter_all(root, max_depth=runtime.MAX_DEPTH)), runtime.MAX_ELEMENTS)

    def test_strict_element_lookup_never_uses_name_or_path_fallback(self):
        runtime = load_runtime()
        old = types.SimpleNamespace(path="/old")
        replacement = types.SimpleNamespace(path="/new")
        with mock.patch.object(runtime, "iter_all", return_value=[replacement]), mock.patch.object(runtime, "resolve_path", return_value=replacement):
            with self.assertRaisesRegex(RuntimeError, "removed or replaced"):
                runtime.find_element(object(), {"objectPath": "/old", "runtimeId": [0]}, window=object(), strict=True)
        with mock.patch.object(runtime, "iter_all", return_value=[old]):
            self.assertIs(runtime.find_element(object(), {"objectPath": "/old"}, window=object(), strict=True), old)


class VerifiedClickTests(unittest.TestCase):
    def test_non_action_nodes_are_not_queried_through_action_interface(self):
        runtime = load_runtime()
        node = InterfaceOnlyAccessible(["Text"])
        node.get_n_actions = mock.Mock()
        self.assertEqual(runtime.action_names(node), [])
        self.assertIsNone(runtime.preferred_action_index(node))
        node.get_n_actions.assert_not_called()

    def test_attempted_accessibility_failure_never_replays_as_pointer(self):
        runtime = load_runtime()
        app, window, element = object(), object(), object()
        with mock.patch.object(runtime, "resolve_target", return_value=(app, 0, window)), mock.patch.object(runtime, "extents"), mock.patch.object(runtime, "find_element", return_value=element), mock.patch.object(runtime, "preferred_action_index", return_value=0) as preferred, mock.patch.object(runtime, "do_action_by_index", return_value=False) as action, mock.patch.object(runtime, "send_verified_click") as pointer:
            with self.assertRaisesRegex(RuntimeError, "was not confirmed"):
                runtime.perform_operation({"tool": "click", "app": "Editor", "element": {"objectPath": "/owned"}, "skip_read_back": True})
            pointer.assert_not_called()
            preferred.return_value = None
            action.reset_mock()
            self.assertTrue(runtime.perform_operation({"tool": "click", "app": "Editor", "element": {"objectPath": "/owned"}, "skip_read_back": True})["ok"])
            pointer.assert_called_once()
            action.assert_not_called()
            preferred.reset_mock()
            pointer.reset_mock()
            self.assertTrue(runtime.perform_operation({"tool": "click", "app": "Editor", "element": {"objectPath": "/owned"}, "duration_ms": 0, "skip_read_back": True})["ok"])
            preferred.assert_not_called()
            action.assert_not_called()
            pointer.assert_called_once()


    def test_hidden_indexed_element_never_reaches_pointer_backend(self):
        runtime = load_runtime()
        provider = types.SimpleNamespace(click_visible_window=mock.Mock())
        with mock.patch.dict(sys.modules, {"x11_capture": provider}), mock.patch.object(runtime, "verified_window_identity", return_value={"pid": 42}), mock.patch.object(runtime, "state_contains", return_value=False):
            with self.assertRaisesRegex(RuntimeError, "not currently visible"):
                runtime.send_verified_click(object(), object(), {}, object(), None, None, "left", 1)
        provider.click_visible_window.assert_not_called()

    def test_indexed_pointer_uses_current_element_geometry(self):
        runtime = load_runtime()
        provider = types.SimpleNamespace(click_visible_window=mock.Mock())
        bounds = {"x": 100, "y": 200, "width": 400, "height": 300}
        with mock.patch.dict(sys.modules, {"x11_capture": provider}), mock.patch.object(runtime, "verified_window_identity", return_value={"pid": 42}), mock.patch.object(runtime, "state_contains", return_value=True), mock.patch.object(runtime, "extents", return_value={"x": 103, "y": 205, "width": 20, "height": 10}):
            runtime.send_verified_click(object(), object(), bounds, object(), None, None, "left", 1)
        provider.click_visible_window.assert_called_once_with(42, bounds, 113, 210, "left", 1, [], None)


class BoundImageTests(unittest.TestCase):
    def test_composite_capture_allows_inactive_identity_and_rechecks_after_pixels(self):
        runtime = load_runtime()
        node, app, bounds = mock.Mock(), mock.Mock(), {"x": 0, "y": 0, "width": 2, "height": 1}
        provider = types.SimpleNamespace(capture_composite_window=mock.Mock(return_value=b"png"))
        identity = {"pid": 42, "path": "owned"}
        with mock.patch.dict(sys.modules, {"x11_capture": provider}), mock.patch.dict(runtime.os.environ, {"XDG_SESSION_TYPE": "x11"}), mock.patch.object(runtime, "child_count", return_value=1), mock.patch.object(runtime, "window_identity", return_value=identity), mock.patch.object(runtime, "extents", return_value=bounds), mock.patch.object(runtime, "state_contains", return_value=False), mock.patch.object(runtime, "app_windows", return_value=[(0, node)]) as windows:
            self.assertEqual(runtime.capture_bound_window_png(app, node, bounds), "cG5n")
            with self.assertRaisesRegex(RuntimeError, 'inactive'):
                runtime.verified_window_identity(app, node, bounds)
            windows.side_effect = [[(0, node)], []]
            self.assertIsNone(runtime.capture_bound_window_png(app, node, bounds))

    def test_identity_and_state_are_verified_around_pixels(self):
        runtime = load_runtime()
        node, app, bounds = mock.Mock(), mock.Mock(), {"x": 0, "y": 0, "width": 2, "height": 1}
        provider = types.SimpleNamespace(capture_visible_window=mock.Mock(return_value=b"png"))
        identity = {"pid": 42, "path": "owned"}
        with mock.patch.dict(sys.modules, {"x11_capture": provider}), mock.patch.dict(runtime.os.environ, {"XDG_SESSION_TYPE": "x11"}), mock.patch.object(runtime, "child_count", return_value=1), mock.patch.object(runtime, "window_identity", return_value=identity), mock.patch.object(runtime, "extents", return_value=bounds), mock.patch.object(runtime, "state_contains", return_value=True), mock.patch.object(runtime, "app_windows", return_value=[(0, node)]) as windows:
            self.assertEqual(runtime.capture_bound_window_png(app, node, bounds), "cG5n")
            windows.side_effect = [[(0, node)], []]
            self.assertIsNone(runtime.capture_bound_window_png(app, node, bounds))
            windows.side_effect = None
            windows.return_value = [(0, node), (1, node)]
            provider.capture_visible_window.reset_mock()
            self.assertIsNone(runtime.capture_bound_window_png(app, node, bounds))
            provider.capture_visible_window.assert_not_called()


class TextSelectionTests(unittest.TestCase):
    def test_context_unicode_modes_and_existing_selection(self):
        runtime = load_runtime()
        node = InterfaceOnlyAccessible(["Text", "EditableText"])
        node.text = "前🙂 repeat 中 repeat 后"
        with self.assertRaisesRegex(RuntimeError, "ambiguous"):
            runtime.select_text(node, "repeat")
        self.assertIsNone(node.selection)
        runtime.select_text(node, "repeat", "中 ", " 后")
        self.assertEqual(node.selection, (12, 18))
        runtime.select_text(node, "🙂")
        self.assertEqual(node.selection, (1, 2))
        runtime.select_text(node, "🙂", selection="cursor_before")
        self.assertEqual(node.caret, 1)
        self.assertIsNone(node.selection)
        runtime.select_text(node, "🙂", selection="cursor_after")
        self.assertEqual(node.caret, 2)
        node.text = "aaa"
        with self.assertRaisesRegex(RuntimeError, "ambiguous"):
            runtime.select_text(node, "aa")

    def test_unreadable_missing_refused_and_changed_text_fail(self):
        runtime = load_runtime()
        node = InterfaceOnlyAccessible(["Text"])
        with self.assertRaisesRegex(RuntimeError, "not found"):
            runtime.select_text(node, "missing")
        with mock.patch.object(runtime.Atspi.Text, "add_selection", return_value=False):
            with self.assertRaisesRegex(RuntimeError, "Could not verify"):
                runtime.select_text(node, "ell")
        with mock.patch.object(runtime.Atspi.Text, "get_text", side_effect=["hello", "hello", "changed"]):
            with self.assertRaisesRegex(RuntimeError, "Text changed during"):
                runtime.select_text(node, "ell")
        node.selection = None
        with mock.patch.object(runtime.Atspi.Text, "get_text", side_effect=["hello", "changed"]), mock.patch.object(runtime.Atspi.Text, "add_selection") as add:
            with self.assertRaisesRegex(RuntimeError, "Text changed before"):
                runtime.select_text(node, "ell")
            add.assert_not_called()
        with mock.patch.object(runtime.Atspi.Text, "get_selection", return_value=types.SimpleNamespace(start_offset=0, end_offset=1)):
            with self.assertRaisesRegex(RuntimeError, "Could not verify"):
                runtime.select_text(node, "ell")
        node.role = "password text"
        with mock.patch.object(runtime.Atspi.Text, "get_text", side_effect=AssertionError("secret read")):
            with self.assertRaisesRegex(RuntimeError, "no readable"):
                runtime.select_text(node, "ell")


class PrintableKeyTests(unittest.TestCase):
    def test_unicode_keysyms_without_gdk(self):
        runtime = load_runtime()
        runtime.Gdk = None
        self.assertEqual(runtime.keyval("é"), 0xe9)
        self.assertEqual(runtime.keyval("你"), 0x01004f60)
        self.assertEqual(runtime.keyval("🙂"), 0x0101f642)

    def test_printable_keys_use_symbols_and_stop_without_replay(self):
        runtime = load_runtime()
        runtime.Atspi.KeySynthType = types.SimpleNamespace(SYM="symbol")
        runtime.Atspi.generate_keyboard_event = mock.Mock(return_value=True)
        focus = mock.Mock()
        with mock.patch.object(runtime, "keyval", side_effect=ord):
            self.assertEqual(runtime.send_characters("A 你🙂", focus), 4)
            self.assertEqual(focus.call_count, 4)
            self.assertEqual(runtime.Atspi.generate_keyboard_event.call_args_list,
                             [mock.call(ord(c), None, "symbol") for c in "A 你🙂"])
            runtime.Atspi.generate_keyboard_event.reset_mock(side_effect=True)
            runtime.Atspi.generate_keyboard_event.side_effect = [True, False]
            with self.assertRaisesRegex(RuntimeError, "1 characters confirmed sent"):
                runtime.send_characters("abc", focus)
            self.assertEqual(runtime.Atspi.generate_keyboard_event.call_count, 2)
            runtime.Atspi.generate_keyboard_event.reset_mock(side_effect=True)
            focus.side_effect = [None, RuntimeError("Focus changed")]
            with self.assertRaisesRegex(RuntimeError, "Focus changed; 1 characters confirmed sent"):
                runtime.send_characters("abc", focus)
            self.assertEqual(runtime.Atspi.generate_keyboard_event.call_count, 1)
            for text in [None, "x\n", "x\0", "\ud800"]:
                runtime.Atspi.generate_keyboard_event.reset_mock()
                with self.assertRaisesRegex(RuntimeError, "printable Unicode"):
                    runtime.send_characters(text, focus)
                runtime.Atspi.generate_keyboard_event.assert_not_called()


class IndexedTextTests(unittest.TestCase):
    def test_caret_unicode_and_selection_preserve_existing_text(self):
        runtime = load_runtime()
        node = InterfaceOnlyAccessible(["Text", "EditableText"])
        runtime.insert_text(node, "你🙂", node=node)
        self.assertEqual(node.text, "he你🙂llo")
        self.assertEqual(node.caret, 4)
        self.assertEqual(node.byte_length, len("你🙂".encode("utf-8")))
        node.selection = (1, 5)
        runtime.insert_text(node, "替", node=node)
        self.assertEqual(node.text, "h替lo")
        self.assertEqual(node.caret, 2)

    def test_protected_selection_never_reuses_masked_contents(self):
        runtime = load_runtime()
        node = InterfaceOnlyAccessible(["Text", "EditableText"])
        node.role, node.selection = "password text", (0, len(node.text))
        with mock.patch.object(runtime.Atspi.Text, "get_text", side_effect=AssertionError("secret read")):
            runtime.insert_text(node, "新🙂", node=node)
        self.assertEqual(node.text, "新🙂")
        node.selection = (0, 1)
        with self.assertRaisesRegex(RuntimeError, "Partial protected selection"):
            runtime.insert_text(node, "wrong", node=node)
        self.assertEqual(node.text, "新🙂")

    def test_read_only_and_attempted_failure_never_fall_back(self):
        runtime = load_runtime()
        node = InterfaceOnlyAccessible(["Text", "EditableText"])
        node.editable = False
        with self.assertRaisesRegex(RuntimeError, "not editable"):
            runtime.insert_text(node, "wrong", node=node)
        self.assertEqual(node.text, "hello")
        node.editable = True
        with mock.patch.object(runtime.Atspi.EditableText, "insert_text", return_value=False):
            with self.assertRaisesRegex(RuntimeError, "inspect"):
                runtime.insert_text(node, "wrong", node=node)
        self.assertEqual(node.text, "hello")

class HeldKeyParsingTests(unittest.TestCase):
    def test_aliases_deduplication_and_invalid_chords(self):
        runtime = load_runtime()
        with mock.patch.object(runtime, 'keyval', side_effect=lambda name: name):
            self.assertEqual(runtime.held_keysyms('ctrl+control+Shift+A'), ['Control_L', 'Shift_L', 'a'])
            self.assertEqual(runtime.held_keysyms('shift'), ['Shift_L'])
            self.assertEqual(runtime.held_keysyms(None), [])
            for key in ('', '+shift', 'ctrl++a', 1):
                with self.assertRaises(RuntimeError):
                    runtime.held_keysyms(key)


class VerifiedScrollTests(unittest.TestCase):
    def test_scroll_uses_fresh_index_geometry_without_key_fallback(self):
        runtime = load_runtime()
        bounds = {'x': 100, 'y': 200, 'width': 400, 'height': 300}
        with mock.patch.object(runtime, 'verified_window_identity', return_value={'pid': 42}), mock.patch.object(runtime, 'state_contains', return_value=True), mock.patch.object(runtime, 'extents', return_value={'x': 120, 'y': 220, 'width': 40, 'height': 20}), mock.patch('x11_capture.scroll_visible_window', side_effect=RuntimeError('wheel failed')) as send, mock.patch.object(runtime, 'send_key') as key:
            with self.assertRaisesRegex(RuntimeError, 'wheel failed'):
                runtime.send_verified_scroll(object(), object(), bounds, object(), None, None, 'right', 0.5)
        send.assert_called_once_with(42, bounds, 140, 230, 'right', 0.5)
        key.assert_not_called()


class VerifiedTimedKeyTests(unittest.TestCase):
    def test_explicit_duration_uses_verified_route_without_legacy_replay(self):
        runtime = load_runtime()
        app, window, bounds = object(), object(), {'x': 0, 'y': 0, 'width': 400, 'height': 300}
        with mock.patch.object(runtime, 'resolve_target', return_value=(app, 0, window)), mock.patch.object(runtime, 'find_element', return_value=None), mock.patch.object(runtime, 'extents', return_value=bounds), mock.patch.object(runtime, 'verified_window_identity', return_value={'pid': 42}), mock.patch.object(runtime, 'held_keysyms', return_value=[50, 37]), mock.patch('x11_capture.press_visible_keys', side_effect=RuntimeError('native failure')) as send, mock.patch.object(runtime, 'send_key') as legacy:
            with self.assertRaisesRegex(RuntimeError, 'native failure'):
                runtime.perform_operation({'tool': 'press_key', 'app': 'Editor', 'key': 'shift+ctrl', 'duration_ms': 0, 'skip_read_back': True})
        send.assert_called_once_with(42, bounds, [50, 37], 0)
        legacy.assert_not_called()


class VerifiedDragTests(unittest.TestCase):
    def test_drag_uses_fresh_identity_and_window_relative_coordinates(self):
        runtime = load_runtime()
        app, window = object(), object()
        bounds = {'x': 100, 'y': 200, 'width': 400, 'height': 300}
        with mock.patch.object(runtime, 'verified_window_identity', return_value={'pid': 42}) as identity, mock.patch('x11_capture.drag_visible_window') as send:
            runtime.send_verified_drag(app, window, bounds, 10.2, 20.2, 110.1, 120.1)
        identity.assert_called_once_with(app, window, bounds)
        send.assert_called_once_with(42, bounds, (110, 220), (210, 320))


class CancellationTests(unittest.TestCase):
    def test_key_chord_releases_before_cancellation_escapes(self):
        import native_cancel as cancel
        runtime = load_runtime()
        runtime.Atspi.ModifierType = types.SimpleNamespace(CONTROL=2)
        runtime.Atspi.KeySynthType = types.SimpleNamespace(LOCKMODIFIERS="lock", SYM="sym", UNLOCKMODIFIERS="unlock")
        events = []
        def send(_code, _text, kind):
            events.append(kind)
            if kind == "lock":
                cancel.handle_signal(None, None)
        runtime.Atspi.generate_keyboard_event = send
        with mock.patch.object(cancel, "_requested", False), mock.patch.object(runtime, "keyval", return_value=65):
            with self.assertRaises(cancel.OperationCancelled):
                runtime.send_key("Ctrl+a")
        self.assertEqual(events, ["lock", "sym", "unlock"])



if __name__ == "__main__":
    unittest.main()
