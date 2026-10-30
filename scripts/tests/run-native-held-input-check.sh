#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/../.."
swift build --product OpenComputerUse
native_bin="$(swift build --show-bin-path)"
check_dir="$(mktemp -d "${TMPDIR:-/tmp}/ocu-held-check.XXXXXX")"
trap 'rm -rf "$check_dir"' EXIT
# shortcut: Swift 6.4's native build layout; expand discovery when another toolchain is validated.
module_maps=.build/out/Intermediates.noindex/GeneratedModuleMaps
swiftc -I "$native_bin" \
  -Xcc "-fmodule-map-file=$module_maps/LockedUseNative.modulemap" \
  -Xcc "-fmodule-map-file=$module_maps/OpenComputerUseVirtualDisplayShim.modulemap" \
  -Xcc "-fmodule-map-file=$module_maps/libwebp.modulemap" \
  scripts/tests/native-held-input-check.swift \
  "$native_bin/OpenComputerUseKit.o" "$native_bin/libwebp.o" \
  "$native_bin/LockedUseNative.o" "$native_bin/OpenComputerUseVirtualDisplayShim.o" \
  -framework AppKit -framework CoreGraphics -framework Carbon -framework Security \
  -framework ScreenCaptureKit -lbsm -lc++ -o "$check_dir/check"
"$check_dir/check"

node --input-type=module - "$native_bin/OpenComputerUse" <<'NODE'
import assert from "node:assert/strict";
import {JsonLinePeer} from "./scripts/node-repl/open-computer-use-repl.mjs";
for(const [signal,expected] of [["SIGTERM",143],["SIGINT",130]]) {
  const peer=new JsonLinePeer({command:process.argv[2],args:["mcp"],env:{...process.env,OPEN_COMPUTER_USE_VISUAL_CURSOR:"0",OPEN_COMPUTER_USE_DISABLE_APP_AGENT_PROXY:"1"}});
  try {
    await peer.initialize();
    const fields=(await peer.request("tools/list")).tools.find(tool=>tool.name==="click").inputSchema.properties;
    assert.ok(fields.key && fields.duration_ms);
    const exited=new Promise(resolve=>peer.child.once("exit",resolve));
    const timer=setTimeout(()=>peer.child.kill("SIGKILL"),2000);
    peer.child.kill(signal);
    try {assert.equal(await exited,expected);} finally {clearTimeout(timer);}
  } finally {await peer.close();}
}
console.log("PASS real native MCP schema and SIGTERM/SIGINT shutdown; no GUI events emitted");
NODE
