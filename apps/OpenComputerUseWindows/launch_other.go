//go:build !windows

package main

import "os/exec"

func prepareApplicationProcess(command *exec.Cmd) {}
