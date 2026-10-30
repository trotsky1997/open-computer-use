# Native computer platform and explicit app launch

```js
nodeRepl.write(cua.computer.target); // 'mac', 'linux' or 'windows'
// Linux/Windows, for an application executable installed on the executor:
await cua.computer.launch_app({app: '/path/to/application'});
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
executable name on PATH or a filesystem executable path. It allows spaces and
Unicode in a path. The limit is 4096 UTF-8 bytes; empty/whitespace values, NUL,
line breaks, unknown properties and failed executable resolution are rejected.
`os/exec.LookPath` resolves the executable and `exec.Command(executable)` starts
it with no extra arguments. Shell expansion, command parsing and argument-list
inputs are unavailable. No URL, desktop-file or AppUserModelID resolver is added.
Use the executable name/path for this implementation. See
[Go process execution](https://pkg.go.dev/os/exec) for the native command and
stdio semantics.

The launch requests process creation and resolves with no JavaScript value.
A process may exit immediately or take time to display a window, so inspect its
actual state through `getApp` before input. Errors propagate as tool errors/JS
exceptions. The harness never replays an uncertain start. Launching a new process
can produce visible application state; use it within the user's authorized task.
It does not change the existing Windows auto-launch-on-bind environment gate.

## Ownership and cleanup

The launched application persists independently of REPL/native-peer cleanup.
Linux inherits the detected desktop environment and uses a new session (`setsid`).
Windows uses `DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP`; see
[Windows creation flags](https://learn.microsoft.com/en-us/windows/win32/procthread/process-creation-flags).
The launcher's stdin/stdout/stderr are discarded rather than inherited from the
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
```

All 139 Node checks passed, including local platform shape, lazy native startup,
input rejection, literal app forwarding, missing capability and native errors.
The Linux Go suite passed in an arm64 Ubuntu VM. Both source and Worker sessions
completed JS → native MCP → GTK startup and AX observation in a private D-Bus/Xvfb
session. The executable path contained spaces, Unicode and literal `$()`; its
argument list stayed intact and its stdout did not corrupt MCP. The fixture had
an independent Linux session and remained observable after turn end, native peer
replacement and JS reset; it also survived final REPL close. Fixtures were stopped
and removed afterward. A host-side Linux suite run on macOS hit its existing
Linux-only bridge guard; native VM execution supplied the actual Linux evidence.

Windows common Go tests passed on macOS and amd64/arm64 Windows binaries built.
A real Windows desktop, console/job-object cleanup behavior, application aliases,
installer distribution and startup-error/dialog cases remain unverified. [Linux window binding](native-window-binding.md) now supports AX/semantic actions;
Windows binding, display-name/desktop-ID resolution, remote native executors,
per-platform input/paste and the broader harness goal remain open.
