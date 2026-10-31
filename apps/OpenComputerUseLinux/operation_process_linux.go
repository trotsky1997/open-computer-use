package main

import (
	"os/exec"
	"syscall"
)

func prepareRuntimeProcess(command *exec.Cmd) {
	command.SysProcAttr = &syscall.SysProcAttr{Pdeathsig: syscall.SIGTERM}
}
