package main

import (
	"fmt"
	"os/exec"
	"strings"
)

func launchApplication(args map[string]any) toolCallResult {
	app, ok := args["app"].(string)
	if !ok || strings.TrimSpace(app) == "" || len(app) > 4096 || strings.ContainsAny(app, "\x00\r\n") {
		return textResult("launch_app requires an executable name or path of at most 4096 bytes", true)
	}
	for key := range args {
		if key != "app" {
			return textResult("Unknown launch_app option: "+key, true)
		}
	}
	executable, err := exec.LookPath(app)
	if err != nil {
		return textResult(fmt.Sprintf("Cannot resolve application executable: %v", err), true)
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
