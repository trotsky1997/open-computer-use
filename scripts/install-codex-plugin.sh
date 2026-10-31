#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
config_helper="${repo_root}/scripts/install-config-helper.mjs"
codex_home="${CODEX_HOME:-${HOME}/.codex}"
marketplace_name="open-computer-use-local"
plugin_name="open-computer-use"
plugin_source_root="${repo_root}/plugins/${plugin_name}"
plugin_manifest="${plugin_source_root}/.codex-plugin/plugin.json"
repl_source_root="${repo_root}/scripts/node-repl"
macos_build_script="${repo_root}/scripts/build-open-computer-use-app.sh"
linux_build_script="${repo_root}/scripts/build-open-computer-use-linux.sh"
windows_build_script="${repo_root}/scripts/build-open-computer-use-windows.sh"
configuration="debug"
rebuild="false"
browser_only="false"

usage() {
  echo "Usage: $0 [--browser-only] [--codex-home DIR] [--rebuild] [--configuration debug|release]"
  echo "--browser-only installs browser/JavaScript support with Node.js 22+ and npm dependencies; skips native builds and payloads."
}

move_path() {
  node -e 'require("node:fs").renameSync(process.argv[1], process.argv[2])' "$1" "$2"
}

node_arch() {
  node -p "process.arch" 2>/dev/null || true
}

go_arch_for_node_arch() {
  case "$1" in
    arm64) printf '%s\n' "arm64" ;;
    x64) printf '%s\n' "amd64" ;;
    *) return 1 ;;
  esac
}

resolve_app_bundle() {
  local -a candidates

  if [[ "${configuration}" == "release" ]]; then
    candidates=("Open Computer Use.app")
  else
    candidates=("Open Computer Use (Dev).app" "Open Computer Use.app")
  fi

  for bundle_name in "${candidates[@]}"; do
    for candidate in "${repo_root}/dist/${bundle_name}"; do
      if [[ -d "${candidate}" ]]; then
        printf '%s\n' "${candidate}"
        return 0
      fi
    done
  done

  return 1
}

resolve_native_binary() {
  local platform="$1"
  local arch="$2"
  local go_arch
  go_arch="$(go_arch_for_node_arch "${arch}" || true)"
  local -a candidates=()

  case "${platform}" in
    linux)
      if [[ -n "${go_arch}" ]]; then
        candidates+=("${repo_root}/dist/linux/${go_arch}/open-computer-use")
      fi
      ;;
    win32)
      if [[ -n "${go_arch}" ]]; then
        candidates+=("${repo_root}/dist/windows/${go_arch}/open-computer-use.exe")
      fi
      ;;
  esac

  for candidate in "${candidates[@]}"; do
    if [[ -x "${candidate}" ]]; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done

  return 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --browser-only)
      browser_only="true"
      shift
      ;;
    --codex-home)
      if [[ -z "${2:-}" || "${2}" == --* ]]; then
        echo "--codex-home requires a directory" >&2
        exit 1
      fi
      codex_home="$2"
      shift 2
      ;;
    --rebuild)
      rebuild="true"
      shift
      ;;
    --configuration)
      configuration="${2:-}"
      if [[ -z "${configuration}" ]]; then
        echo "--configuration requires a value" >&2
        exit 1
      fi
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

case "${configuration}" in debug|release) ;; *) echo "--configuration must be debug or release" >&2; exit 1 ;; esac
if [[ "${browser_only}" == "true" && "${rebuild}" == "true" ]]; then
  echo "--browser-only cannot be combined with --rebuild" >&2
  exit 1
fi
node -e 'if (Number(process.versions.node.split(".")[0]) < 22) { console.error("Plugin installation requires Node.js 22 or newer"); process.exit(1); }'
codex_home="$(node -e 'if (/[\r\n]/.test(process.argv[1])) throw Error("Codex home must not contain line breaks"); process.stdout.write(require("node:path").resolve(process.argv[1]))' "${codex_home}")"
config_path="${codex_home}/config.toml"
payload_path=""
if [[ "${browser_only}" != "true" ]]; then

platform="$(node -p "process.platform")"
arch="$(node_arch)"

case "${platform}" in
  darwin)
    payload_path="$(resolve_app_bundle || true)"
    app_binary="${payload_path:+${payload_path}/Contents/MacOS/OpenComputerUse}"
    if [[ "${rebuild}" == "true" || -z "${app_binary}" || ! -x "${app_binary}" ]]; then
      if [[ -x "${macos_build_script}" ]]; then
        "${macos_build_script}" "${configuration}"
        payload_path="$(resolve_app_bundle || true)"
        app_binary="${payload_path:+${payload_path}/Contents/MacOS/OpenComputerUse}"
      else
        echo "Missing runnable app bundle at ${app_binary} and no local build script is available." >&2
        exit 1
      fi
    fi
    if [[ -z "${payload_path}" || ! -x "${app_binary}" ]]; then
      echo "Missing runnable app binary at ${app_binary}" >&2
      exit 1
    fi
    ;;
  linux)
    payload_path="$(resolve_native_binary linux "${arch}" || true)"
    if [[ "${rebuild}" == "true" || -z "${payload_path}" || ! -x "${payload_path}" ]]; then
      go_arch="$(go_arch_for_node_arch "${arch}" || true)"
      if [[ -n "${go_arch}" && -x "${linux_build_script}" ]]; then
        "${linux_build_script}" --configuration "${configuration}" --arch "${go_arch}"
        payload_path="$(resolve_native_binary linux "${arch}" || true)"
      fi
    fi
    if [[ -z "${payload_path}" || ! -x "${payload_path}" ]]; then
      echo "Missing runnable Linux binary for ${platform}-${arch}." >&2
      exit 1
    fi
    ;;
  win32)
    payload_path="$(resolve_native_binary win32 "${arch}" || true)"
    if [[ "${rebuild}" == "true" || -z "${payload_path}" || ! -x "${payload_path}" ]]; then
      go_arch="$(go_arch_for_node_arch "${arch}" || true)"
      if [[ -n "${go_arch}" && -x "${windows_build_script}" ]]; then
        "${windows_build_script}" --configuration "${configuration}" --arch "${go_arch}"
        payload_path="$(resolve_native_binary win32 "${arch}" || true)"
      fi
    fi
    if [[ -z "${payload_path}" || ! -x "${payload_path}" ]]; then
      echo "Missing runnable Windows binary for ${platform}-${arch}." >&2
      exit 1
    fi
    ;;
  *)
    echo "Unsupported Codex plugin install platform: ${platform}-${arch}" >&2
    exit 1
    ;;
esac

if [[ -z "${payload_path}" ]]; then
  echo "Failed to resolve native runtime payload for ${platform}-${arch}" >&2
  exit 1
fi

if [[ ! -e "${payload_path}" ]]; then
  echo "Missing native runtime payload at ${payload_path}" >&2
  exit 1
fi

if [[ ! -d "${payload_path}" && ! -x "${payload_path}" ]]; then
  echo "Native runtime payload is not executable: ${payload_path}" >&2
  exit 1
fi

if [[ "${platform}" != "darwin" ]]; then
  if [[ ! -x "${payload_path}" ]]; then
    echo "Native runtime payload is not executable: ${payload_path}" >&2
    exit 1
  fi
fi

fi

if [[ ! -f "${repo_root}/.agents/plugins/marketplace.json" ]]; then
  echo "Missing ${repo_root}/.agents/plugins/marketplace.json" >&2
  exit 1
fi

if [[ ! -f "${plugin_manifest}" ]]; then
  echo "Missing ${plugin_manifest}" >&2
  exit 1
fi

# Source checkouts keep the adapter under scripts/node-repl, while staged npm
# packages place it directly in the plugin's scripts directory.
if [[ ! -f "${repl_source_root}/open-computer-use-repl.mjs" ]]; then
  repl_source_root="${plugin_source_root}/scripts"
fi
for repl_file in open-computer-use-repl.mjs open-computer-use-kernel.mjs ocu-config.mjs browser-cdp.mjs browser-playwright.mjs browser-downloads.mjs browser-clipboard.mjs browser-viewport.mjs browser-drop.mjs browser-input.mjs browser-tabs.mjs browser-process.mjs browser-debugger.mjs browser-assets.mjs browser-webmcp.mjs browser-content.mjs browser-chrome.mjs browser-evaluate.mjs browser-evaluate-dom.mjs browser-evaluate-worker.mjs runtime-dependencies.mjs; do
  if [[ ! -f "${repl_source_root}/${repl_file}" ]]; then
    echo "Missing JS REPL runtime at ${repl_source_root}/${repl_file}" >&2
    exit 1
  fi
done

for bridge_file in manifest.json bridge.html bridge.js background.mjs management.mjs policy.mjs history.mjs options.html options.js; do
  if [[ ! -f "${repl_source_root}/chrome-browser-extension/${bridge_file}" ]]; then
    echo "Missing Chrome browser bridge asset: ${bridge_file}" >&2
    exit 1
  fi
done

plugin_version="$(node "${config_helper}" codex-plugin-version "${plugin_manifest}")"

case "${plugin_version}" in
  ""|.|..|*[!A-Za-z0-9._+-]*)
    echo "Plugin version must be a safe cache directory name" >&2
    exit 1
    ;;
esac

plugin_cache_root="${codex_home}/plugins/cache/${marketplace_name}/${plugin_name}"
plugin_final_root="${plugin_cache_root}/${plugin_version}"
mkdir -p "${codex_home}" "${plugin_cache_root}"
plugin_install_root="$(mktemp -d "${plugin_cache_root}/.staging.XXXXXX")"
plugin_backup_root=""
config_stage=""
published="false"
committed="false"
cleanup() {
  local status=$?
  trap - EXIT
  if [[ "${committed}" != "true" ]]; then
    if [[ "${published}" == "true" ]]; then rm -rf "${plugin_final_root}"; fi
    if [[ -n "${plugin_backup_root}" && ( -e "${plugin_backup_root}" || -L "${plugin_backup_root}" ) ]]; then
      move_path "${plugin_backup_root}" "${plugin_final_root}" || echo "Previous plugin remains at ${plugin_backup_root}" >&2
    fi
  elif [[ -n "${plugin_backup_root}" ]]; then
    rm -rf "${plugin_backup_root}" || echo "Previous cache retained at ${plugin_backup_root}" >&2
  fi
  if [[ -n "${plugin_install_root}" ]]; then rm -rf "${plugin_install_root}" || echo "Staged plugin retained at ${plugin_install_root}" >&2; fi
  if [[ -n "${config_stage}" ]]; then rm -f "${config_stage}" || echo "Staged config retained at ${config_stage}" >&2; fi
  exit "${status}"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

cp -R "${plugin_source_root}/." "${plugin_install_root}/"
if [[ -n "${payload_path}" ]]; then
  node "${config_helper}" copy-into-dir "${plugin_install_root}" "${payload_path}"
fi
cp "${repl_source_root}/open-computer-use-repl.mjs" "${plugin_install_root}/scripts/open-computer-use-repl.mjs"
cp "${repl_source_root}/open-computer-use-kernel.mjs" "${plugin_install_root}/scripts/open-computer-use-kernel.mjs"
mkdir -p "${plugin_install_root}/node_modules"
node "${repl_source_root}/runtime-dependencies.mjs" "${repo_root}" "${plugin_install_root}"
cp "${repl_source_root}/browser-input.mjs" "${plugin_install_root}/scripts/browser-input.mjs"
cp "${repl_source_root}/browser-process.mjs" "${plugin_install_root}/scripts/browser-process.mjs"
cp "${repl_source_root}/browser-tabs.mjs" "${plugin_install_root}/scripts/browser-tabs.mjs"
mkdir -p "${plugin_install_root}/scripts/chrome-browser-extension"
for bridge_file in manifest.json bridge.html bridge.js background.mjs management.mjs policy.mjs history.mjs options.html options.js; do
  cp "${repl_source_root}/chrome-browser-extension/${bridge_file}" "${plugin_install_root}/scripts/chrome-browser-extension/${bridge_file}"
done
cp "${repl_source_root}/browser-chrome.mjs" "${plugin_install_root}/scripts/browser-chrome.mjs"
for evaluate_module in browser-evaluate.mjs browser-evaluate-dom.mjs browser-evaluate-worker.mjs runtime-dependencies.mjs; do
  cp "${repl_source_root}/${evaluate_module}" "${plugin_install_root}/scripts/${evaluate_module}"
done
cp "${repl_source_root}/browser-webmcp.mjs" "${plugin_install_root}/scripts/browser-webmcp.mjs"
cp "${repl_source_root}/browser-content.mjs" "${plugin_install_root}/scripts/browser-content.mjs"
cp "${repl_source_root}/browser-assets.mjs" "${plugin_install_root}/scripts/browser-assets.mjs"
cp "${repl_source_root}/browser-debugger.mjs" "${plugin_install_root}/scripts/browser-debugger.mjs"
cp "${repl_source_root}/browser-drop.mjs" "${plugin_install_root}/scripts/browser-drop.mjs"
cp "${repl_source_root}/browser-viewport.mjs" "${plugin_install_root}/scripts/browser-viewport.mjs"
cp "${repl_source_root}/browser-clipboard.mjs" "${plugin_install_root}/scripts/browser-clipboard.mjs"
cp "${repl_source_root}/browser-downloads.mjs" "${plugin_install_root}/scripts/browser-downloads.mjs"
cp "${repl_source_root}/browser-playwright.mjs" "${plugin_install_root}/scripts/browser-playwright.mjs"
cp "${repl_source_root}/browser-cdp.mjs" "${plugin_install_root}/scripts/browser-cdp.mjs"
cp "${repl_source_root}/ocu-config.mjs" "${plugin_install_root}/scripts/ocu-config.mjs"

config_target="$(node -e 'const fs=require("node:fs"); const p=process.argv[1]; if(fs.existsSync(p) && !fs.statSync(p).isFile()) throw Error("Codex config must be a regular file"); const target=fs.existsSync(p)?fs.realpathSync(p):p; if (/[\r\n]/.test(target)) throw Error("Codex config path must not contain line breaks"); process.stdout.write(target);' "${config_path}")"
config_stage="$(mktemp "${config_target}.staging.XXXXXX")"
if [[ -f "${config_target}" ]]; then cp -p "${config_target}" "${config_stage}"; fi
node "${config_helper}" codex-plugin-config "${config_stage}" "${repo_root}" "${marketplace_name}" "${plugin_name}"
if [[ -e "${plugin_final_root}" || -L "${plugin_final_root}" ]]; then
  plugin_backup_root="$(mktemp -d "${plugin_cache_root}/.previous.XXXXXX")"
  rmdir "${plugin_backup_root}"
  move_path "${plugin_final_root}" "${plugin_backup_root}"
fi
# shortcut: cache/config uses two renames; add locking/recovery when concurrent or interrupted installs must recover automatically.
move_path "${plugin_install_root}" "${plugin_final_root}"
plugin_install_root=""
published="true"
move_path "${config_stage}" "${config_target}"
config_stage=""
committed="true"

echo "Installed ${plugin_name}@${marketplace_name}"
echo "Marketplace source: ${repo_root}"
echo "Plugin cache: ${plugin_final_root}"
if [[ "${browser_only}" == "true" ]]; then echo "Mode: browser/JavaScript only (no native payload)"; fi
echo "Updated Codex config: ${config_path}"
echo "Restart Codex to load the plugin marketplace."
