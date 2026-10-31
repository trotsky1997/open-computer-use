# Browser-only npm package

Build a local JavaScript/browser npm tarball with Node.js 22+ and npm:

```sh
npm ci
node scripts/npm/build-packages.mjs --browser-only --package open-computer-use
npm pack ./dist/npm-browser/open-computer-use
npm install --global ./open-computer-use-1.1.2.tgz
```

Use the filename emitted by npm pack when the version changes. Building this
flavor skips Swift/Go builds, native bundle verification and native payload
copying. The default staging directory is dist/npm-browser; the full flavor
continues to use dist/npm. --out-dir selects another staging directory. The
builder replaces the selected output directory, so use a dedicated destination.
These commands build/install locally; registry publication is separate.

The tarball declares its runtime dependencies; npm installs Playwright Core and
QuickJS/WASM. It contains neither a browser nor native desktop runtimes.
Configure OPEN_COMPUTER_USE_CDP_URL with your browser's CDP endpoint, or set
OPEN_COMPUTER_USE_BROWSER_EXECUTABLE to an absolute trusted Chromium executable
for [managed startup](managed-browser.md). OPEN_COMPUTER_USE_BROWSER_MODE=headful
adds native window presentation; headless remains the default. No desktop permission is required for JavaScript startup.

```sh
ocu capabilities --json
ocu js 'nodeRepl.write(6 * 7)'
ocu repl
ocu mcp
# Explicit JavaScript MCP entry, also available in full packages:
ocu js-mcp
# POSIX: automatically selects browser-only installation:
ocu install-codex-plugin --codex-home /path/to/codex-home
```

mcp and js-mcp expose js/js_reset in this flavor. Full packages retain their
native mcp entry and expose JavaScript through js-mcp. Native-only commands fail
with an explicit error. The browser package launcher does not discover a separate
native executable. Its manifest identifies openComputerUseRuntime as browser-only.

Both flavors use the same package name, command aliases and plugin identity.
Installing one replaces the other at the selected npm prefix/plugin version.
Restart clients after replacement. Plugin installation still uses a POSIX shell;
native Windows installation and actual Codex app reload remain unverified.
See [source plugin installation](browser-only-installation.md) for config/cache
staging and failure retention details.

## Verification

```sh
node scripts/tests/browser-package-smoke.mjs
# Add actual browser flows in a disposable profile:
node scripts/tests/browser-package-smoke.mjs /path/to/chrome
# Optionally retain the tested tarball:
node scripts/tests/browser-package-smoke.mjs /path/to/chrome /path/to/result.tgz
```

The controller blocks native build tools, builds/packs with explicit and default
staging directories, and installs the tarball into temporary local and global
prefixes. It checks metadata, aliases, CLI/REPL/reset, both MCP entries, installed
plugin startup and the full package's
explicit JS MCP entry. With a browser executable it also verifies real input and
QuickJS DOM evaluation through both session classes, installed CLI and MCP for
both npm layouts after hiding source/staging directories. All profile/config
paths are owned temporary fixtures.

macOS (Node 26) and arm64 Linux (Node 24) passed these installed-browser flows.
151 Node checks passed on macOS; Linux passed 150 with one macOS-only skip.
Node 22 is the declared minimum and was not exercised in this round. No registry
publication, Windows runtime test or live client reload was performed.
