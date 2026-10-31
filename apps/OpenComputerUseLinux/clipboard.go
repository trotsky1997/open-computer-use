package main

import (
	_ "embed"
	"encoding/json"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

//go:embed clipboard.py
var clipboardScript string

type clipboardPeer struct {
	once   sync.Once
	cmd    *exec.Cmd
	input  io.WriteCloser
	output *json.Decoder
	done   chan error
	reader *os.File
	dir    string
}

func (s *service) closeClipboard() {
	s.clipboardMu.Lock()
	p := s.clipboard
	if p == nil {
		p = s.clipboardClosing
	}
	s.clipboard = nil
	s.clipboardClosing = p
	s.clipboardMu.Unlock()
	if p != nil {
		p.close()
	}
	s.clipboardMu.Lock()
	if s.clipboardClosing == p {
		s.clipboardClosing = nil
	}
	s.clipboardMu.Unlock()
}

func (p *clipboardPeer) close() {
	p.once.Do(func() {
		_ = p.input.Close()
		select {
		case <-p.done:
		case <-time.After(time.Second):
			_ = p.cmd.Process.Kill()
			<-p.done
		}
		_ = p.reader.Close()
		_ = os.RemoveAll(p.dir)
	})
}

func (p *clipboardPeer) response() (*linuxResponse, error) {
	type result struct {
		response linuxResponse
		err      error
	}
	ready := make(chan result, 1)
	go func() { var response linuxResponse; err := p.output.Decode(&response); ready <- result{response, err} }()
	select {
	case value := <-ready:
		return &value.response, value.err
	case <-time.After(10 * time.Second):
		return nil, errors.New("Clipboard helper timed out; inspect before retrying")
	}
}

func (s *service) startClipboard() (*clipboardPeer, error) {
	s.clipboardMu.Lock()
	defer s.clipboardMu.Unlock()
	if s.clipboardStopped {
		return nil, errors.New("Native clipboard session is stopping")
	}
	if s.clipboard != nil {
		return s.clipboard, nil
	}
	if runtime.GOOS != "linux" {
		return nil, errors.New("Native clipboard paste requires Linux")
	}
	dir, err := os.MkdirTemp("", "open-computer-use-clipboard-*")
	if err != nil {
		return nil, err
	}
	for name, script := range map[string]string{"runtime.py": linuxRuntimeScript, "clipboard.py": clipboardScript, "native_cancel.py": nativeCancelScript} {
		if err = os.WriteFile(filepath.Join(dir, name), []byte(script), 0o600); err != nil {
			_ = os.RemoveAll(dir)
			return nil, err
		}
	}
	cmd := exec.Command("python3", filepath.Join(dir, "clipboard.py"))
	cmd.Env = linuxRuntimeEnvironment(os.Environ())
	input, err := cmd.StdinPipe()
	if err != nil {
		_ = os.RemoveAll(dir)
		return nil, err
	}
	output, writer, err := os.Pipe()
	if err != nil {
		_ = input.Close()
		_ = os.RemoveAll(dir)
		return nil, err
	}
	cmd.Stdout = writer
	if err = cmd.Start(); err != nil {
		_ = writer.Close()
		_ = input.Close()
		_ = output.Close()
		_ = os.RemoveAll(dir)
		return nil, err
	}
	_ = writer.Close()
	p := &clipboardPeer{cmd: cmd, input: input, output: json.NewDecoder(output), reader: output, done: make(chan error, 1), dir: dir}
	s.clipboard = p
	go func() { p.done <- cmd.Wait() }()
	response, err := p.response()
	if err != nil {
		s.clipboard = nil
		p.close()
		return nil, err
	}
	if !response.OK {
		s.clipboard = nil
		p.close()
		return nil, errors.New(response.Error)
	}
	// Both modules are loaded; remove temporary sources before serving payloads.
	_ = os.RemoveAll(dir)
	return p, nil
}

func (s *service) paste(args map[string]any) toolCallResult {
	app := requiredString(args, "app")
	text, ok := args["text"].(string)
	if !ok || !utf8.ValidString(text) || strings.ContainsRune(text, 0) || len(text) > 16*1024*1024 {
		return textResult("Paste requires Unicode text without NUL, at most 16 MiB", true)
	}
	format := "text"
	if value, present := args["format"]; present {
		format, ok = value.(string)
		if !ok {
			return textResult("Paste format must be text, md or html", true)
		}
	}
	if format != "text" && format != "md" && format != "html" {
		return textResult("Paste format must be text, md or html", true)
	}
	if app == "" || s.currentSnapshot(app) == nil {
		return textResult("Run get_app_state before paste", true)
	}
	p, err := s.startClipboard()
	if err != nil {
		return textResult(err.Error(), true)
	}
	if err := json.NewEncoder(p.input).Encode(map[string]string{"app": app, "text": text, "format": format}); err != nil {
		s.closeClipboard()
		return textResult("Clipboard helper write failed; inspect before retrying", true)
	}
	response, err := p.response()
	if err != nil {
		s.closeClipboard()
		return textResult("Clipboard helper failed; inspect before retrying: "+err.Error(), true)
	}
	if !response.OK {
		return textResult(response.Error, true)
	}
	return textResult("Clipboard payload requested; inspect app state to verify paste", false)
}
