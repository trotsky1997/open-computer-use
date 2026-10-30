package main

import (
	"os"
	"os/exec"
	"syscall"
)

func prepareApplicationProcess(command *exec.Cmd) {
	command.Env = linuxRuntimeEnvironment(os.Environ())
	command.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
}
