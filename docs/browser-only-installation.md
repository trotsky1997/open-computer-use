# Browser-only source plugin installation

The source Codex plugin installer can install JavaScript/browser support without
building Swift/Go or locating a native runtime artifact:

```sh
npm ci
./scripts/install-codex-plugin.sh --browser-only
```

Run these commands from this checkout with Node.js 22+ and npm available. The
installer copies the adapter, Worker kernel, browser modules, extension assets
and declared runtime dependencies, including QuickJS/WASM, into the versioned
plugin cache. It does not fetch npm dependencies itself. Run npm ci first when
node_modules is absent. The installer does not download a browser or its system libraries.
No desktop permission or native build is needed to
start the installed JS MCP server. Browser automation still needs a browser
endpoint configured through OPEN_COMPUTER_USE_CDP_URL; the installed launcher
inherits that environment variable from its host.

Use an explicit target for another Codex home or a disposable installation:

```sh
./scripts/install-codex-plugin.sh --browser-only --codex-home /path/to/codex-home
./scripts/install-codex-plugin.sh --help
```

--codex-home takes precedence over CODEX_HOME and the default ~/.codex.
Target paths must not contain line breaks. The
installer uses the same local marketplace/plugin identity as normal mode. It
updates the managed config sections and replaces that version's cache; unrelated
config is preserved. A browser-only reinstall removes the prior native payload
from that managed version. Native app APIs remain unavailable unless a separate
native command can be discovered/configured. Browser inventory isolates native
startup errors so browser operations remain usable. Default installation retains
native payload lookup/build behavior. --browser-only and --rebuild conflict.

Complete assets/dependencies and patched config are prepared in temporary paths
before replacement. Configuration publication uses a same-directory rename;
existing config-file symlinks keep their target. Normal preparation/publication failure
restores the previous cache and keeps the original config. The previous cache is
removed after success. Invalid cache-directory version names are rejected.
Concurrent installers, power loss/SIGKILL recovery and live Codex reload during
replacement have not been verified; restart the host after installation.

## Verification

```sh
# Installation, failure retention, mode replacement and installed MCP startup:
node scripts/tests/browser-only-install-smoke.mjs

# Also exercise the installed payload against a new disposable browser profile:
node scripts/tests/browser-only-install-smoke.mjs /path/to/chrome
```

The assert-based controller uses only owned temporary source/cache/config/profile
paths. It blocks native build commands, tests missing dependencies and denied
config publication, checks config preservation/idempotence/symlinks and native
payload replacement, hides its source checkout, then initializes the installed
MCP and executes JavaScript. On macOS and arm64 Linux, source and Worker sessions plus the actual
installed launcher MCP passed browser inventory, native-error isolation, real
field input and installed QuickJS DOM evaluation against disposable Chrome.
A clean npm ci --ignore-scripts dependency tree also passed the macOS installed
browser flow. The Linux browser needed its missing libasound runtime library.
Native stdin pipe errors now close/reap the native peer and reject pending
requests instead of escaping into JavaScript execution. A targeted stream error
check and immediate-exit native fixture cover this boundary. Native Windows
and actual Codex app reload remain unverified. A separately published native-free
npm distribution and broader transport/platform coverage remain open.
