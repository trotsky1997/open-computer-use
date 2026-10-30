package main

import (
	"math"
	"strings"
)

const windowPrefix = "ocu-window:"

func snapshotKey(app string) string {
	if strings.HasPrefix(app, windowPrefix) {
		return app
	}
	return strings.ToLower(strings.TrimSpace(app))
}

func windowTool(name string, args map[string]any) toolCallResult {
	request := linuxRequest{Tool: name}
	if name == "bind_window" {
		value, ok := args["window_id"].(float64)
		if !ok || math.IsNaN(value) || value < 1 || value > 9007199254740991 || math.Trunc(value) != value {
			return textResult("window_id must be a positive safe integer", true)
		}
		request.WindowID = int64(value)
	}
	for key := range args {
		if name != "bind_window" || key != "window_id" {
			return textResult("Unknown window option: "+key, true)
		}
	}
	response, err := runPython(request)
	if err != nil {
		return textResult(err.Error(), true)
	}
	if !response.OK {
		return textResult(response.Error, true)
	}
	return textResult(response.Text, false)
}
