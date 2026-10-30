package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func init() {
	if marker := os.Getenv("OCU_LAUNCH_TEST_MARKER"); marker != "" {
		data, _ := json.Marshal(map[string]any{"pid": os.Getpid(), "args": os.Args})
		_ = os.WriteFile(marker, data, 0600)
		fmt.Println("owned launch fixture stdout")
		time.Sleep(30 * time.Second)
		os.Exit(0)
	}
}

func TestExplicitLaunchValidation(t *testing.T) {
	for _, args := range []map[string]any{nil, {"app": 1}, {"app": " "}, {"app": "bad\nname"}, {"app": strings.Repeat("x", 4097)}, {"app": "missing-ocu-executable"}, {"app": "missing-ocu-executable", "args": []string{"ignored"}}} {
		if result := newService().callTool("launch_app", args); !result.IsError {
			t.Fatalf("invalid launch admitted: %#v", args)
		}
	}
}

func TestExplicitLaunchLiteralExecutable(t *testing.T) {
	source, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(source)
	if err != nil {
		t.Fatal(err)
	}
	name := "owned fixture $(literal) Unicode-你好"
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	executable := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(executable, data, 0700); err != nil {
		t.Fatal(err)
	}
	marker := filepath.Join(t.TempDir(), "started.json")
	t.Setenv("OCU_LAUNCH_TEST_MARKER", marker)
	result := newService().callTool("launch_app", map[string]any{"app": executable})
	if result.IsError {
		t.Fatalf("launch failed: %#v", result)
	}
	var response struct {
		PID  int      `json:"pid"`
		Args []string `json:"args"`
	}
	deadline := time.Now().Add(5 * time.Second)
	for {
		if data, err := os.ReadFile(marker); err == nil {
			if err := json.Unmarshal(data, &response); err != nil {
				t.Fatal(err)
			}
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("application did not start")
		}
		time.Sleep(10 * time.Millisecond)
	}
	process, err := os.FindProcess(response.PID)
	if err != nil {
		t.Fatal(err)
	}
	defer process.Kill()
	if len(response.Args) != 1 || response.Args[0] != executable {
		t.Fatalf("executable was parsed as a command line: %#v", response.Args)
	}
}
