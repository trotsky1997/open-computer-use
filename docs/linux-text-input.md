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
failure without replay. Broader providers, Wayland/headful, `typeCharacters`,
paste and Windows input remain open.

Run the fixture controller in a configured private desktop:

```sh
node scripts/tests/linux-text-js-smoke.mjs /path/to/open-computer-use-linux
```

AT-SPI contract: [EditableText.insert_text](https://gnome.pages.gitlab.gnome.org/at-spi2-core/libatspi/method.EditableText.insert_text.html).
