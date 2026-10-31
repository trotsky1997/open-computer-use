# Native computer platform and explicit app launch

```js
nodeRepl.write(cua.computer.target); // 'mac', 'linux' or 'windows'
// Linux/Windows, for an application executable installed on the executor:
await cua.computer.launch_app({app: '/path/to/application'});
// Linux also resolves installed desktop IDs and exact display names:
await cua.computer.launch_app({app: 'org.gnome.TextEditor.desktop'});
const app = await cua.getApp('application window title', {initialState: false});
nodeRepl.write(await app.getAXState({includeScreenshot: false}));
```

`computer.target` describes the local Node executor's platform. Reading it starts
no native process. The frozen computer binding is available in source and Worker
sessions. macOS exposes `target: 'mac'` and keeps application launch in `getApp`;
it omits the optional `launch_app` method, matching the inspected reference API.
Linux and Windows expose the explicit method and require a native backend that
advertises the `launch_app` tool. Existing runtime installs must be rebuilt or
updated to include it. A missing advertised capability fails before launch.

The native method accepts one object property, `app`, containing a literal
executable name on PATH or a filesystem executable path. Linux also accepts
installed desktop IDs, desktop-file paths and exact display names. It allows spaces and
Unicode in a path. The limit is 4096 UTF-8 bytes; empty/whitespace values, NUL,
line breaks, unknown properties and failed executable resolution are rejected.
For executable inputs, `os/exec.LookPath` resolves the executable and
`exec.Command(executable)` starts it with no extra arguments. Caller shell
expansion, command parsing and argument-list inputs are unavailable. URL and
Windows AppUserModelID resolution remain unavailable. See
[Go process execution](https://pkg.go.dev/os/exec) for the native command and
stdio semantics.

The launch requests process creation and resolves with no JavaScript value.
A process may exit immediately or take time to display a window, so inspect its
actual state through `getApp` before input. Errors propagate as tool errors/JS
exceptions. The harness never replays an uncertain start. Launching a new process
can produce visible application state; use it within the user's authorized task.
It does not change the existing Windows auto-launch-on-bind environment gate.

## Linux desktop entries

Values ending in .desktop use GIO desktop resolution: an ID is looked up in the
applications subdirectories of XDG_DATA_HOME/XDG_DATA_DIRS, including GIO's
nested-directory ID mapping; a path loads that exact file. Other values first
try the executable resolver, then match GIO's registered application display
names exactly. Display-name matching uses the executor locale, preserves Unicode,
spaces and slash characters, and performs no fuzzy/case-insensitive matching.
Multiple matches fail with candidate desktop IDs; select an ID explicitly.
Hidden entries fail before dispatch. Exec-backed entries with invalid/missing
executable definitions fail before a confirmed start. Name lookup includes registered NoDisplay entries, following GIO's list.

The embedded GI helper delegates Exec field-code expansion to the system
[GIO desktop application API](https://docs.gtk.org/gio-unix/method.DesktopAppInfo.launch_uris_as_manager_with_fds.html).
It supplies no document URIs or caller arguments. Arguments configured in the
selected desktop entry still apply. Spawned processes get an independent session
and /dev/null for all protocol stdio. D-Bus activated applications use the desktop
service's process/lifetime/stdio behavior. The helper shares the native operation
deadline/cancellation path and never retries an uncertain start. Observe the app
after acceptance or an interrupted/error result. Terminal-emulator entries and
broader registry/locale/platform behavior remain unverified.

For DBusActivatable=true entries, the helper uses the desktop ID's well-known
bus name and standardized object path to call org.freedesktop.Application.Activate
through [GIO's synchronous D-Bus API](https://docs.gtk.org/gio/method.DBusConnection.call_sync.html).
It waits up to 25 seconds for a unit reply within the native operation deadline,
and validates the bus name before dispatch. The reply acknowledges the method;
observe the window separately for readiness. These entries can omit Exec.
Errors from missing services or refused activation propagate to JavaScript;
the harness does not fall back to Exec or replay an uncertain activation.
Reset/close reap a waiting helper and leave an accepted service application alive.
Non-empty XDG_ACTIVATION_TOKEN and DESKTOP_STARTUP_ID from the native request
environment are forwarded as activation-token and desktop-startup-id in the
standard platform-data dictionary. Token focus effects on a real Wayland
compositor remain unverified.

## Ownership and cleanup

The launched application persists independently of REPL/native-peer cleanup.
Linux executable/Exec starts inherit the detected desktop environment and use a
new session (`setsid`); D-Bus service applications use the service manager
environment and lifecycle.
Windows uses `DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP`; see
[Windows creation flags](https://learn.microsoft.com/en-us/windows/win32/procthread/process-creation-flags).
The executable/Exec launcher's stdin/stdout/stderr are discarded rather than inherited from the
MCP JSON pipe. The peer reaps child exits while it remains alive. Turn end, reset
and close release automation state and leave accepted application processes open.
The user/application owns subsequent shutdown.

## Validation

```sh
node --test scripts/node-repl/*.test.mjs
(cd apps/OpenComputerUseLinux && go test ./...)   # Run on Linux
(cd apps/OpenComputerUseWindows && go test ./...) # Native Windows for full coverage
# In an owned Linux dbus-run-session / Xvfb desktop with GTK/AT-SPI installed:
GTK_MODULES=gail:atk-bridge NO_AT_BRIDGE=0 GDK_BACKEND=x11 \
  node scripts/tests/linux-launch-js-smoke.mjs /path/to/open-computer-use-linux
# This controller creates its own private XDG registry, D-Bus session and Xvfb:
node scripts/tests/linux-dbus-launch-js-smoke.mjs /path/to/open-computer-use-linux
```

All 151 Node checks passed on macOS; arm64 Linux passed 150 with one macOS-only
skip. These include local platform shape, lazy native startup,
input rejection, literal app forwarding, missing capability and native errors.
The Linux Go suite (47 top-level checks plus 10 subchecks) and 83 Python checks
passed in an arm64 Ubuntu VM. Both source and Worker sessions
completed JS → native MCP → GTK startup and AX observation in a private D-Bus/Xvfb
session. The executable path contained spaces, Unicode and literal `$()`; its
argument list stayed intact and its stdout did not corrupt MCP. The fixture had
an independent Linux session and remained observable after turn end, native peer
replacement and JS reset; it also survived final REPL close. The expanded launch controller also verified desktop ID, exact display name
(including slash), and desktop-file-path starts in both session types. Configured
%c/%k/%% arguments and omitted no-URI %f/%u codes arrived correctly; duplicate
names, hidden entries, missing IDs and missing executable entries were rejected
without launching the fixture. All eight successful starts survived the same
observation/turn/reset/close checks. The D-Bus controller additionally activated a
real GTK service from an entry without Exec, observed its window, and repeated
Activate by ID/display name on the same PID across both hosts. It checks refused
methods, absent services, invalid IDs, exact hyphen-to-underscore object paths,
absence of an Exec fallback marker, per-request startup-ID/token values on the
same service PID, and reset/close while Activate is pending.
The real helper PIDs are obtained from the bus and confirmed reaped; service PID,
activation count and AX state remain intact after automation cleanup. Fixtures were stopped and removed afterward. A host-side Linux suite run on macOS hit its existing
Linux-only bridge guard; native VM execution supplied the actual Linux evidence.

Prior validation: Windows common Go tests passed on macOS and amd64/arm64 Windows
binaries built. Windows code was unchanged in the desktop-entry update.
A real Windows desktop, console/job-object cleanup behavior, application aliases,
installer distribution and startup-error/dialog cases remain unverified. [Linux window binding](native-window-binding.md) now supports AX/semantic actions;
Windows binding/display-name/AppUserModelID resolution, Linux terminal launch,
real compositor activation-token effects, broader desktop registry/locale coverage,
remote native executors,
per-platform input/paste and the broader harness goal remain open.
