import contextlib
import importlib.util
import io
import pathlib
import sys
import types
import unittest
from unittest import mock
from runtime_test import load_runtime


def load_clipboard():
    runtime = load_runtime()
    gi = types.ModuleType("gi")
    gi.require_version = lambda *_args: None
    repository = types.ModuleType("gi.repository")
    repository.Gtk = types.SimpleNamespace()
    repository.Gdk = types.SimpleNamespace()
    repository.GdkX11 = types.SimpleNamespace()
    repository.GLib = types.SimpleNamespace()
    gi.repository = repository
    spec = importlib.util.spec_from_file_location("ocu_clipboard", pathlib.Path(__file__).with_name("clipboard.py"))
    module = importlib.util.module_from_spec(spec)
    with mock.patch.dict(sys.modules, {"gi": gi, "gi.repository": repository, "runtime": runtime}):
        spec.loader.exec_module(module)
    return module


class ClipboardTests(unittest.TestCase):
    def test_formats_preserve_unicode_and_html_source(self):
        module = load_clipboard()
        self.assertEqual(module.payloads({"text": "你好🙂\n**raw**", "format": "md"}), ("你好🙂\n**raw**", None))
        html = '<p>你好 <b>world🙂</b></p><script>hidden</script><p>next</p>'
        self.assertEqual(module.payloads({"text": html, "format": "html"}), ("你好 world🙂\nnext\n", html))
        self.assertEqual(module.payloads({"text": ""}), ("", None))
        for operation in [{"text": None}, {"text": "x\0"}, {"text": "x", "format": "other"}, {"text": "x" * (module.LIMIT + 1)}]:
            with self.assertRaises(RuntimeError):
                module.payloads(operation)

    def test_focus_failure_precedes_ownership_and_stale_callbacks_do_not_finish_new_paste(self):
        module = load_clipboard()
        owner = object.__new__(module.ClipboardOwner)
        with mock.patch.object(module, "verify_focus", side_effect=RuntimeError("focus changed")):
            with self.assertRaisesRegex(RuntimeError, "focus changed"):
                owner.request({"app": "owned", "text": "value"})
        self.assertFalse(hasattr(owner, "plain"))
        owner.pending, owner.generation, owner.timeout = True, 2, None
        with contextlib.redirect_stdout(io.StringIO()) as output:
            owner.finish(generation=1)
        self.assertEqual(output.getvalue(), "")
        self.assertTrue(owner.pending)

    def test_paste_key_failure_releases_modifier_without_replay(self):
        module = load_clipboard()
        module.Atspi.ModifierType = types.SimpleNamespace(CONTROL=2)
        module.Atspi.KeySynthType = types.SimpleNamespace(LOCKMODIFIERS="lock", UNLOCKMODIFIERS="unlock", SYM="symbol")
        module.Atspi.generate_keyboard_event = mock.Mock(side_effect=[True, False, True])
        with mock.patch.object(module, "verify_focus"), mock.patch.object(module, "keyval", return_value=118):
            with self.assertRaisesRegex(RuntimeError, "Could not synthesize"):
                module.paste_key("owned")
        self.assertEqual(module.Atspi.generate_keyboard_event.call_args_list, [mock.call(4, None, "lock"), mock.call(118, None, "symbol"), mock.call(4, None, "unlock")])


if __name__ == "__main__":
    unittest.main()
