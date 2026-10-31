package main

import (
	"math"
	"os"
	"testing"
)

func TestClickRejectsMalformedOptionsBeforeNativeInput(t *testing.T) {
	requestPath := fakePythonResponse(t, `{"ok":true}`)
	service := newService()
	service.rememberSnapshot("Editor", &appSnapshot{App: appDescriptor{Name: "Editor", PID: 42}, WindowBounds: &frame{Width: 400, Height: 300}})
	for _, change := range []map[string]any{{"click_count": nil}, {"click_count": true}, {"click_count": 1.5}, {"click_count": 0.0}, {"click_count": 4.0}, {"mouse_button": true}, {"mouse_button": "invalid"}, {"element_index": nil}} {
		args := map[string]any{"app": "Editor", "x": 10.0, "y": 10.0}
		for k, v := range change {
			args[k] = v
		}
		if result := service.callTool("click", args); !result.IsError {
			t.Fatalf("accepted invalid click: %#v", args)
		}
	}
	if _, err := os.Stat(requestPath); !os.IsNotExist(err) {
		t.Fatal("invalid click reached native input")
	}
}

func TestDragRejectsMalformedCoordinatesBeforeNativeInput(t *testing.T) {
	requestPath := fakePythonResponse(t, `{"ok":true}`)
	service := newService()
	service.rememberSnapshot("Editor", &appSnapshot{App: appDescriptor{Name: "Editor", PID: 42}, WindowBounds: &frame{Width: 400, Height: 300}})
	for _, key := range []string{"from_x", "from_y", "to_x", "to_y"} {
		for _, value := range []any{nil, true, "1", math.NaN(), math.Inf(1)} {
			args := map[string]any{"app": "Editor", "from_x": 1.0, "from_y": 2.0, "to_x": 3.0, "to_y": 4.0}
			args[key] = value
			if result := service.callTool("drag", args); !result.IsError {
				t.Fatalf("accepted invalid drag: %#v", args)
			}
		}
	}
	if _, err := os.Stat(requestPath); !os.IsNotExist(err) {
		t.Fatal("invalid drag reached native input")
	}
}
