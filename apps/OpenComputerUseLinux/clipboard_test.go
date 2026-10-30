package main

import "testing"

func TestPasteValidatesBeforeStartingClipboardOwner(t *testing.T) {
	service := newService()
	service.rememberSnapshot("Editor", &appSnapshot{App: appDescriptor{Name: "Editor", PID: 42}})
	for _, args := range []map[string]any{
		{"app": "Editor", "text": nil},
		{"app": "Editor", "text": "x\x00"},
		{"app": "Editor", "text": string([]byte{0xff})},
		{"app": "Editor", "text": "x", "format": true},
		{"app": "Editor", "text": "x", "format": "other"},
		{"app": "Unobserved", "text": "x"},
	} {
		if result := service.callTool("paste", args); !result.IsError {
			t.Fatalf("accepted invalid paste: %#v", args)
		}
		if service.clipboard != nil {
			t.Fatal("invalid input started clipboard owner")
		}
	}
}

func TestStoppedClipboardCannotStartAnotherOwner(t *testing.T) {
	service := newService()
	service.clipboardStopped = true
	if _, err := service.startClipboard(); err == nil {
		t.Fatal("stopped clipboard restarted")
	}
	if service.clipboard != nil {
		t.Fatal("stopped clipboard created a process")
	}
}
