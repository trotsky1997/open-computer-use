# Linux native paste

`await app.paste(text, {format?})` supports `text` (default), literal `md` source,
and `html` on an X11 desktop with GTK 3/GdkX11 introspection and AT-SPI enabled.
The caller observes the app first and focuses its intended control. The current
native runtime must advertise `paste`; older runtimes fail before input.

The native service owns one GTK clipboard helper per session. It provides UTF-8
text targets and, for HTML, the original `text/html` bytes plus a simple textual
fallback. That fallback strips markup/script/style content and supplies line
breaks for common block tags; it does not render CSS or reproduce layout. Input
is valid Unicode without NUL, at most 16 MiB of UTF-8. Empty payloads are allowed.

Paste checks exact target-window focus before taking clipboard ownership and
before synthesizing Ctrl+V. The shortcut requires an application that uses
Ctrl+V for paste. It performs no editable-field search, semantic text rewrite,
or automatic retry. Content replaces the user's current clipboard. The helper
serves it until another owner takes over or the native session is closed/reset.
Linux does not restore the previous clipboard; releasing the helper can clear
its selection, while a desktop clipboard manager may retain its own copy.

Success means the provider served payload data during the operation. Clipboard
managers can also request data, and applications can transform or reject it.
Call `getAXState()` or inspect the UI to verify the intended result. A five-second
transfer timeout or an error after ownership changes leaves the clipboard
changed and the final insertion potentially uncertain. Inspect before retrying.
External clipboard/focus changes can race the sequential checks.

The owner stays alive across paste actions so asynchronous transfers can finish.
Go removes its temporary source files after startup, serializes requests, bounds
startup/transfer waits, and closes/reaps it on CLI/MCP exit. Native MCP termination
also cancels a pending clipboard transfer before exit. The JS native peer gives
EOF cleanup 250 ms, then sends SIGTERM and retains a one-second SIGKILL fallback.
Hard kills and desktop failures still need broader platform validation.

Owned arm64 Ubuntu tests run in private D-Bus/Xvfb sessions. Both source and
Worker REPLs verify actual multiline Unicode insertion, literal Markdown,
original HTML MIME bytes and plain fallback, empty input, inactive-window and
missing-target errors, reacquisition after external copying, one-helper reuse,
idle/pending reset and final cleanup. A custom HTML receiver checks MIME data;
rich-text rendering in ordinary applications remains unverified. Existing text,
window-identity and launch flows run alongside the paste test.

```sh
# Inside a private D-Bus session, after Xvfb starts:
dbus-update-activation-environment DISPLAY XAUTHORITY
node scripts/tests/linux-paste-js-smoke.mjs /path/to/open-computer-use-linux
```

The clipboard provider uses [GTK selection ownership](https://docs.gtk.org/gtk3/func.selection_owner_set.html),
[selection-get](https://docs.gtk.org/gtk3/signal.Widget.selection-get.html), and
[SelectionData.set](https://docs.gtk.org/gtk3/method.SelectionData.set.html).
Wayland, other native platforms, broader app shortcuts/IME/keymaps and clipboard
restoration remain open under the full harness goal.
