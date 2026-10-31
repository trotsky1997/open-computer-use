//go:build !linux

package main

import "os/exec"

// Native operations reject unsupported platforms before creating a child.
func prepareRuntimeProcess(command *exec.Cmd) {}
