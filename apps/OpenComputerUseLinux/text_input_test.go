package main

import (
	"encoding/json"
	"os"
	"testing"
)

func TestIndexedTextCarriesExactObservedField(t *testing.T) {
	requestPath := fakePythonResponse(t, `{"ok":true}`)
	t.Setenv("OPEN_COMPUTER_USE_ACTION_READ_BACK", "0")
	service := newService()
	service.rememberSnapshot("Editor", &appSnapshot{App: appDescriptor{Name: "Editor", PID: 42}, Elements: []elementRecord{{Index: 0, ObjectPath: "/owned/field"}}})
	result := service.callTool("type_text", map[string]any{"app": "Editor", "text": "你🙂", "element_index": 0.0})
	if result.IsError {
		t.Fatalf("indexed text failed: %#v", result)
	}
	data, err := os.ReadFile(requestPath)
	if err != nil {
		t.Fatal(err)
	}
	var request linuxRequest
	if err := json.Unmarshal(data, &request); err != nil {
		t.Fatal(err)
	}
	if request.Element == nil || request.Element.ObjectPath != "/owned/field" || request.Text != "你🙂" || !request.SkipReadBack {
		t.Fatalf("field identity lost: %#v", request)
	}
	if err := os.Remove(requestPath); err != nil {
		t.Fatal(err)
	}
	for _, index := range []any{nil, true, -1.0, 1.5, "missing", 99.0} {
		if !service.callTool("type_text", map[string]any{"app": "Editor", "text": "wrong", "element_index": index}).IsError {
			t.Fatalf("bad index admitted: %#v", index)
		}
	}
	if _, err := os.Stat(requestPath); !os.IsNotExist(err) {
		t.Fatal("invalid field reached the native bridge")
	}
}

func TestPrintableKeysValidateBeforeNativeAndRequireEmissionCount(t *testing.T) {
	requestPath := fakePythonResponse(t, `{"ok":true,"charactersSent":4}`)
	service := newService()
	service.rememberSnapshot("Editor", &appSnapshot{App: appDescriptor{Name: "Editor", PID: 42}})
	if result := service.callTool("type_characters", map[string]any{"app": "Editor", "text": "A 你🙂"}); result.IsError || result.Content[0].Text != `{"charactersSent":4}` {
		t.Fatalf("bad result: %#v", result)
	}
	data, err := os.ReadFile(requestPath)
	if err != nil {
		t.Fatal(err)
	}
	var request linuxRequest
	if err = json.Unmarshal(data, &request); err != nil {
		t.Fatal(err)
	}
	if request.Tool != "type_characters" || !request.SkipReadBack || request.Element != nil {
		t.Fatalf("unexpected request: %#v", request)
	}
	if err = os.Remove(requestPath); err != nil {
		t.Fatal(err)
	}
	for _, text := range []any{nil, true, "x\n", "x\x00", string([]byte{0xff})} {
		if !service.callTool("type_characters", map[string]any{"app": "Editor", "text": text}).IsError {
			t.Fatalf("admitted invalid text: %#v", text)
		}
	}
	if _, err = os.Stat(requestPath); !os.IsNotExist(err) {
		t.Fatal("invalid text reached bridge")
	}
	if !service.callTool("type_characters", map[string]any{"app": "Editor", "text": "wrong count"}).IsError {
		t.Fatal("accepted invalid emitted count")
	}
}
