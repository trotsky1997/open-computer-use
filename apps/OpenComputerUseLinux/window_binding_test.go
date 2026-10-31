package main

import "testing"

func TestWindowSnapshotCachesStaySeparateAndCaseSensitive(t *testing.T) {
	service := newService()
	a := &appSnapshot{App: appDescriptor{Name: "shared", PID: 42}, WindowTitle: "A"}
	b := &appSnapshot{App: appDescriptor{Name: "shared", PID: 42}, WindowTitle: "B"}
	service.rememberSnapshot(windowPrefix+"Aa", a)
	service.rememberSnapshot(windowPrefix+"aa", b)
	if service.currentSnapshot(windowPrefix+"Aa") != a || service.currentSnapshot(windowPrefix+"aa") != b || service.currentSnapshot("shared") != nil || service.currentSnapshot("42") != nil {
		t.Fatal("bound window snapshots leaked across aliases")
	}
}

func TestWindowArgumentsFailBeforeBridge(t *testing.T) {
	for _, args := range []map[string]any{nil, {"window_id": true}, {"window_id": 0.0}, {"window_id": 1.5}, {"window_id": 9007199254740992.0}, {"window_id": 1.0, "guess": true}} {
		if !newService().windowTool("bind_window", args).IsError {
			t.Fatalf("invalid window arguments admitted: %#v", args)
		}
	}
	if !newService().windowTool("list_windows", map[string]any{"guess": true}).IsError {
		t.Fatal("unknown listing options admitted")
	}
}

func TestBoundScreenshotInvalidationKeepsSiblingWindowIndexes(t *testing.T) {
	fakePythonResponse(t, `{"ok":true,"snapshot":{"app":{"name":"shared","pid":42}}}`)
	service := newService()
	a := &appSnapshot{App: appDescriptor{Name: "shared", PID: 42}, Elements: []elementRecord{{Index: 1}}}
	b := &appSnapshot{App: appDescriptor{Name: "shared", PID: 42}, Elements: []elementRecord{{Index: 2}}}
	service.rememberSnapshot(windowPrefix+"A", a)
	service.rememberSnapshot(windowPrefix+"B", b)
	disabled := false
	_, result := service.refreshSnapshot(windowPrefix+"B", linuxRequest{Tool: "get_app_state", App: windowPrefix + "B", IncludeAX: &disabled})
	if result.IsError || service.currentSnapshot(windowPrefix+"A") != a || len(service.currentSnapshot(windowPrefix+"B").Elements) != 0 {
		t.Fatalf("screenshot invalidation crossed a bound window: %#v", result)
	}
}
