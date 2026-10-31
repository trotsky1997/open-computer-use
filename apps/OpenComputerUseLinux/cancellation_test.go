//go:build linux

package main

import (
	"context"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"
)

func TestRuntimeCancellationReapsChild(t *testing.T) {
	for _, ignore := range []bool{false, true} {
		t.Run(strconv.FormatBool(ignore), func(t *testing.T) {
			dir := t.TempDir()
			ready := filepath.Join(dir, "ready")
			script := "#!/usr/bin/python3\nimport os,signal,time\n"
			if ignore {
				script += "signal.signal(signal.SIGTERM,signal.SIG_IGN)\n"
			}
			script += "open(os.environ['OCU_CANCEL_READY'],'w').write(str(os.getpid()))\nwhile True: time.sleep(1)\n"
			if err := os.WriteFile(filepath.Join(dir, "python3"), []byte(script), 0700); err != nil {
				t.Fatal(err)
			}
			t.Setenv("PATH", dir+":"+os.Getenv("PATH"))
			t.Setenv("OCU_CANCEL_READY", ready)
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			svc := newService()
			svc.operationContext = ctx
			done := make(chan error, 1)
			go func() { _, err := svc.runPython(linuxRequest{Tool: "list_apps"}); done <- err }()
			var pid int
			deadline := time.Now().Add(5 * time.Second)
			for pid == 0 {
				data, _ := os.ReadFile(ready)
				pid, _ = strconv.Atoi(string(data))
				if time.Now().After(deadline) {
					t.Fatal("child did not start")
				}
				time.Sleep(10 * time.Millisecond)
			}
			cancel()
			select {
			case err := <-done:
				if err == nil || !strings.Contains(err.Error(), "cancelled") {
					t.Fatalf("unexpected cancellation: %v", err)
				}
			case <-time.After(3 * time.Second):
				syscall.Kill(pid, syscall.SIGKILL)
				t.Fatal("child was not reaped")
			}
			if err := syscall.Kill(pid, 0); err != syscall.ESRCH {
				t.Fatalf("child still exists: %v", err)
			}
			if !svc.callTool("list_apps", nil).IsError {
				t.Fatal("cancelled service accepted work")
			}
		})
	}
}
