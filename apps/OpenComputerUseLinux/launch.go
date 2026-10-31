package main

import (
	"fmt"
	"os/exec"
	"strings"
)

func (s *service) launchApplication(args map[string]any) toolCallResult {
	app, ok := args["app"].(string)
	if !ok || strings.TrimSpace(app) == "" || len(app) > 4096 || strings.ContainsAny(app, "\x00\r\n") {
		return textResult("launch_app requires an executable name/path, desktop ID or display name of at most 4096 bytes", true)
	}
	for key := range args {
		if key != "app" {
			return textResult("Unknown launch_app option: "+key, true)
		}
	}
	executable, err := exec.LookPath(app)
	if strings.HasSuffix(app, ".desktop") || err != nil {
		response, launchErr := s.runPython(linuxRequest{Tool: "launch_app", App: app})
		if launchErr != nil {
			return textResult(launchErr.Error(), true)
		}
		if !response.OK {
			return textResult(response.Error, true)
		}
		return textResult(response.Text, false)
	}
	command := exec.Command(executable)
	prepareApplicationProcess(command)
	if err := command.Start(); err != nil {
		return textResult(fmt.Sprintf("Cannot start application: %v", err), true)
	}
	// Accepted applications outlive the native MCP peer; reap children while it is alive.
	go func() { _ = command.Wait() }()
	return textResult("Application process started.", false)
}
