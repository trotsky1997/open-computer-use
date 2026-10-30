# Linux text input

`await app.typeText(text, elementIndex?)` requires the current native runtime's
advertised `type_text.element_index` capability. The optional index comes from
`getAXState()` and binds the observed AT-SPI object path in the selected window.
Removed/replaced and read-only fields fail before editing. Refresh indexes after
UI changes. Empty strings, NUL and invalid indexes are rejected at the boundary.

Without an index, the selected window must be active and have one focused
editable text field. A physical STRING fallback requires verified window and
descendant focus before sending global input. Explicit indexed edits never fall
back to global input, and an attempted semantic edit is never replayed.

Text is inserted at the native caret or replaces one native selection. Offsets
use Unicode code points and `EditableText.insert_text` receives UTF-8 byte length.
Readable selections use one `set_text_contents` call followed by exact readback
and caret placement. Providers that transform text can return an error after
editing; inspect the field before retrying. Whole-field selection replacement
can affect rich-text formatting; rich-text preservation remains unverified.

Password fields never reuse masked content: full selection replacement and
caret insertion validate character count, while partial selection returns an
error before editing. Content equality cannot be checked for protected text.
Provider calls are sequential; concurrent user edits can still race a write.

Validation uses an owned GTK fixture in private D-Bus/Xvfb sessions, with source
and Worker REPLs. It checks separate same-title windows, indexed Unicode input,
caret/selection replacement, consecutive multiline edits, focus omission,
inactive/read-only/stale rejection. Existing window identity and launch/lifecycle
flows run alongside it. Python checks cover protected fields and attempted-edit
failure without replay. Broader providers, Wayland/headful and native input on other platforms remain open.

Run the fixture controller in a configured private desktop:

```sh
node scripts/tests/linux-text-js-smoke.mjs /path/to/open-computer-use-linux
```

AT-SPI contract: [EditableText.insert_text](https://gnome.pages.gitlab.gnome.org/at-spi2-core/libatspi/method.EditableText.insert_text.html).


## Printable key events

Linux `await app.typeCharacters(text)` sends `KeySynthType.SYM` for each printable
Unicode code point to the currently focused control, including controls that
have no Text/EditableText interface. It never searches for a text field or uses
the clipboard. Native window focus is checked before each key. Controls,
newlines and invalid Unicode are rejected before any emission. Empty input
returns `{charactersSent: 0}` without sending a key.

`charactersSent` counts native API acknowledgments, in Unicode code points.
Inspect app state to verify the task outcome. If synthesis or focus verification
fails partway through, the error reports the acknowledged prefix length and
stops without replay. Transport failure can leave the last emission uncertain.
Native delivery and focus checks are sequential, so external focus changes can
race an emission. Keymap/compositor/IME support varies; the implementation keeps
AT-SPI failures visible and has no paste or semantic-edit fallback.

The GTK controller also focuses a DrawingArea with no editable-text interface
and checks exact press/release events for `aA 1!+é你🙂`, empty input and inactive
window rejection in both REPLs. When launching a private D-Bus session before
Xvfb, update that private bus activation environment after Xvfb starts:

```sh
dbus-update-activation-environment DISPLAY XAUTHORITY
```

Without the display environment, an AT-SPI registry can acknowledge synthesis
while emitting no events. The test checks the receiving widget, beyond the
native acknowledgment. Production desktop sessions need a correctly configured
accessibility bus and display. See [AT-SPI keyboard synthesis](https://gnome.pages.gitlab.gnome.org/at-spi2-core/libatspi/func.generate_keyboard_event.html)
and [key synthesis types](https://gnome.pages.gitlab.gnome.org/at-spi2-core/libatspi/enum.KeySynthType.html).


## Text selection

Linux `await app.selectText(index, text, {prefix?, suffix?, selectionType?})`
uses the exact observed native object and the current readable Text interface.
The default mode selects the match; `cursor_before` / `cursor_after` collapse
the selection at its respective boundary. Immediate prefix and suffix context
are literal, with no normalization. All overlapping occurrences count; missing
or ambiguous matches fail before changing the selection. AT-SPI offsets use
Unicode code points. Protected text and providers with multiple selections are
rejected before writes.

The runtime checks unchanged content before selection and verifies both native
range/caret and unchanged content afterward, even with action read-back disabled.
An error after a provider call can leave a changed selection; inspect before
retrying. Native object replacement fails through exact identity lookup, with
no name/position or global-key fallback. External edits can still race these
sequential checks. Providers that refuse or transform selection return errors.

The GTK controller verifies repeated text with context, an astral character
before the target, replacement after selection, both cursor modes, multiline
selection and stale-widget rejection in both REPL modes. Python checks cover
overlapping matches, changed text, provider refusal/wrong range and protected
fields without reading their contents. X11 clipboard paste and its ownership/lifecycle are covered in
[Linux native paste](linux-paste.md).

AT-SPI contracts: [add selection](https://gnome.pages.gitlab.gnome.org/at-spi2-core/libatspi/method.Text.add_selection.html)
and [set selection](https://gnome.pages.gitlab.gnome.org/at-spi2-core/libatspi/method.Text.set_selection.html).


X11 clipboard paste is now implemented with a session-owned MIME provider; see
[Linux native paste](linux-paste.md) for clipboard effects, lifecycle and evidence.
