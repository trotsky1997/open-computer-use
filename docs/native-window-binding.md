# Linux native window identities

```js
const windows = await cua.listWindows({emit: false});
nodeRepl.write(windows); // [{id, app, title}, ...]
const app = await cua.getApp({windowId: selectedId}, {initialState: false});
nodeRepl.write(await app.getAXState({includeScreenshot: false}));
// Use a fresh element index from this window's state:
await app.setValue(entryIndex, 'requested value');
```

Linux exposes `listWindows()` and `getApp({windowId})`; the existing string binding
remains available. Native support is advertised through `list_windows` and
`bind_window` tools. Earlier native installs fail explicitly until rebuilt.
macOS/Windows object binding is currently rejected; their native window routes
remain open work. The list contains opaque numeric IDs, app names and window
titles. Titles and AX text are untrusted content; binding an ID grants no action
authorization beyond the user's request. IDs accept only positive safe integers. Listing options allow `emit`
only. Invalid target shapes and options fail before native requests.

## Identity and lifetime

The Linux bridge uses each AT-SPI window's connection name and object path with
its process ID and `/proc` process-start identity. See the native
[Accessible API](https://gnome.pages.gitlab.gnome.org/at-spi2-core/libatspi/class.Accessible.html)
and [Application fields](https://docs.gtk.org/atspi2/class.Application.html).
The discovery ID is a 48-bit digest of that full identity plus one; duplicate
live IDs are rejected. It is an opaque harness ID. The bound selector preserves
the full tuple, so every later observation/action resolves that exact native
object. Titles, order and geometry do not select a replacement window. The opaque
selector stays internal to the app binding; observation diffs use the numeric ID.

IDs and bindings survive native-peer replacement while the underlying application
and AT-SPI objects live. Closed/replaced windows fail and need fresh discovery.
A fresh read is required before actions after native peer/turn/reset cleanup.
Bindings can observe different windows of the same process without overwriting
each other's native snapshot caches. The full selector remains case-sensitive.
AX omission invalidates the selected bound window's indexes, while sibling
bound-window caches remain separate. Generic app/PID aliases keep their existing
conservative invalidation behavior.

Element records retain native object paths. Bound semantic actions search only
the selected window for that exact object and reject removed/replaced elements.
Name, role and geometry fallback never substitute another bound element. Traversal
has native node/depth budgets, including protection against a cyclic provider tree.
A window close initiated by an action can invalidate its following state read;
inspect fresh windows before another action and never replay the close blindly.

## Image and physical-input limits

This phase implements AX observation and targeted native semantic actions. Linux's
existing screenshot implementation crops the desktop and cannot prove the pixels
belong to an occluded selected window. These new bindings therefore return no
image, and `getScreenshot()` reports unavailability. Exact native window image
capture remains required work. String app bindings retain their prior behavior.

Physical pointer/drag fallback for bound windows fails before input until native
window hit routing is verified. Semantic accessibility click/set-value actions
remain usable. Keyboard/scroll/text-synthesis fallback requires native ACTIVE
state and focused content inside the selected window. A failed focus check sends
no global input; there is no automatic focus transfer. Provider-specific focus,
hit testing, capture and the broader native input surface remain open.

## Verification

```sh
node --test scripts/node-repl/*.test.mjs
python3 apps/OpenComputerUseLinux/runtime_test.py
(cd apps/OpenComputerUseLinux && go test ./...) # Linux
# Only an owned private dbus-run-session / Xvfb GTK desktop:
GTK_MODULES=gail:atk-bridge NO_AT_BRIDGE=0 GDK_BACKEND=x11 \
  node scripts/tests/linux-window-js-smoke.mjs /path/to/open-computer-use-linux
```

All 140 Node checks, 39 Python checks and 46 native Linux Go checks passed.
Existing source/Worker launch/lifecycle GTK regressions passed as well.

Owned Ubuntu arm64 GTK checks in both source and Worker sessions cover two
same-title windows in one process, equal element indexes with independent writes,
a replaced same-name widget, window closure, child-index reordering, recreation,
old-handle rejection, stable discovery across peer replacement and reset/rebind.
Unavailable bound screenshots do not invalidate a sibling window's cached input
indexes. Fixtures and their private desktop are cleaned up. Node, Python and
native Go checks cover invalid arguments, duplicate metadata, selector identity,
cache casing/isolation, bounded traversal and rejection before global synthesis.

This is GTK/AT-SPI evidence. Qt, Chromium/Electron, LibreOffice, headful desktop,
Wayland, permission-denied/transient provider and multi-seat cases remain
unverified. Windows binding, native screenshot/physical routing and full harness
transport/claims/native parity remain open; keep the broader goal active.
