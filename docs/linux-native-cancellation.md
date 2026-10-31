# Linux native-operation cancellation

MCP and CLI SIGINT/SIGTERM cancellation reaches every one-shot Python operation.
The Go service rejects later requests, signals the running child with SIGTERM,
and waits for it to exit. A child that ignores termination is killed after
500 ms. The ordinary 30-second operation allowance uses the same cleanup path. Timed
clicks add their requested total mouse dwell to that allowance.
Operation JSON travels over stdin; no temporary operation payload file is written.

Owned runtime children receive a Linux parent-death SIGTERM. The creating Go OS
thread stays locked until the child is reaped, because Linux ties this signal to
that thread. Applications started by launch_app retain their independent lifetime.
A hard-killed native process can leave temporary source files; normal cancellation
removes them. Parent-death handling only covers the one-shot runtime process.

Python cancellation bypasses ordinary action-fallback exception handlers. Short
key-chord and XTest press/release groups finish their release attempt before
raising cancellation. A multi-click stops before its next pair. Verified X11 drag
cleanup releases at the current pointer position without jumping to its endpoint. Cancellation can interrupt a
long backend call; after 500 ms an unresponsive child is killed. Already accepted
UI changes remain applied, and forced termination cannot confirm input release.
Inspect the current UI before retrying an interrupted operation.

Validation uses an owned GTK fixture in private D-Bus/Xvfb sessions. A wrapper gates
the actual runtime child before a text edit, then source and Worker REPL reset and
close must reap that child without delivering the edit. Fresh post-reset input
must work; the explicitly launched fixture must survive. Separate CLI checks
cover SIGTERM, parent SIGKILL, stdin payloads and source cleanup. Python checks
inject cancellation during key, drag and pointer delivery; Go checks both normal
and SIGTERM-ignoring child cleanup.

```sh
node scripts/tests/linux-cancel-js-smoke.mjs ./open-computer-use-linux
python3 scripts/tests/linux-cancel-process-smoke.py ./open-computer-use-linux
```

Run the GTK check inside an owned X11 desktop with AT-SPI enabled, as with the
other Linux fixture controllers. No ordinary user desktop or profile is needed.
Wayland, physical devices, other platforms, user-input monitoring and broader
claim/takeover lifecycle remain open.
