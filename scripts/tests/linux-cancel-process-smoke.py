"""Owned one-shot CLI process lifecycle checks; no desktop needed."""
import json
import os
from pathlib import Path
import signal
import shutil
import subprocess
import sys
import tempfile
import time

binary = str(Path(sys.argv[1]).resolve())
with tempfile.TemporaryDirectory(prefix="ocu-cancel-process-") as root:
    root = Path(root)
    wrapper = root / "python3"
    wrapper.write_text('''#!/usr/bin/python3
import json,os,sys,time
payload=json.load(sys.stdin)
with open(os.environ['OCU_CANCEL_READY'],'w') as f:
    json.dump({'pid':os.getpid(),'script':sys.argv[1],'tool':payload['tool']},f)
while True: time.sleep(1)
''')
    wrapper.chmod(0o700)
    for stop in (signal.SIGTERM, signal.SIGKILL):
        ready = root / "ready"
        env = {**os.environ, "PATH": str(root) + ":" + os.environ["PATH"], "OCU_CANCEL_READY": str(ready)}
        parent = subprocess.Popen([binary, "list-apps"], env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        child = None
        directory = None
        try:
            deadline = time.monotonic() + 5
            while child is None:
                try:
                    info = json.loads(ready.read_text())
                    child = info["pid"]
                    directory = Path(info["script"]).parent
                except (FileNotFoundError, json.JSONDecodeError):
                    assert time.monotonic() < deadline, "runtime child did not start"
                    time.sleep(.02)
            assert info["tool"] == "list_apps"
            assert not (directory / "operation.json").exists(), "operation payload written to disk"
            parent.send_signal(stop)
            parent.communicate(timeout=3)
            deadline = time.monotonic() + 3
            while Path(f"/proc/{child}/stat").exists():
                # A killed parent's orphan can await init reaping; it cannot execute input.
                if Path(f"/proc/{child}/stat").read_text().split(") ", 1)[1].startswith("Z "):
                    assert stop == signal.SIGKILL
                    break
                assert time.monotonic() < deadline, "runtime child survived native exit"
                time.sleep(.02)
            if stop == signal.SIGTERM:
                assert not directory.exists(), "normal cancellation leaked runtime sources"
            print(f"PASS CLI {stop.name}: runtime stopped, stdin payload, bounded exit")
        finally:
            if parent.poll() is None:
                parent.kill()
                parent.communicate(timeout=3)
            if child:
                try:
                    os.kill(child, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            if directory:
                shutil.rmtree(directory, ignore_errors=True)
            ready.unlink(missing_ok=True)
