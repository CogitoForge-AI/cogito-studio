#!/usr/bin/env bash
set -euo pipefail

REPO_OWNER="${REPO_OWNER:-Nexo-Agent}"
REPO_NAME="${REPO_NAME:-nexo}"
VERSION="${VERSION:-latest}"

readonly REPO_OWNER
readonly REPO_NAME
readonly VERSION

info() {
  printf '\033[1;34m[INFO]\033[0m %s\n' "$*"
}

warn() {
  printf '\033[1;33m[WARN]\033[0m %s\n' "$*"
}

error() {
  printf '\033[1;31m[ERROR]\033[0m %s\n' "$*" >&2
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    error "Missing required command: $1"
    exit 1
  fi
}

fetch_release_json() {
  local api_base="https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}"
  if [ "$VERSION" = "latest" ]; then
    curl -fsSL "${api_base}/releases?per_page=1"
  else
    curl -fsSL "${api_base}/releases/tags/${VERSION}"
  fi
}

pick_asset_url() {
  local json="$1"
  local asset_name="$2"

  if command -v python3 >/dev/null 2>&1; then
    JSON_INPUT="$json" python3 - "$asset_name" <<'PY'
import json
import os
import sys

asset_name = sys.argv[1]
payload = json.loads(os.environ["JSON_INPUT"])
release = payload[0] if isinstance(payload, list) else payload

for asset in release.get("assets", []):
    if asset.get("name") == asset_name:
        print(asset["browser_download_url"])
        sys.exit(0)

sys.exit(1)
PY
    return
  fi

  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$json" | jq -r --arg name "$asset_name" \
      'if type=="array" then .[0] else . end | .assets[] | select(.name==$name) | .browser_download_url' \
      | head -n 1
    return
  fi

  error "Need either python3 or jq to parse release metadata."
  exit 1
}

download_file() {
  local url="$1"
  local out="$2"
  info "Downloading: ${url}"
  curl -fL --retry 3 --retry-delay 1 -o "$out" "$url"
}

install_macos() {
  local release_json="$1"
  local arch="$2"
  local dmg_name=""

  case "$arch" in
    arm64|aarch64) dmg_name="Nexo_${RESOLVED_VERSION}_aarch64.dmg" ;;
    x86_64|amd64) dmg_name="Nexo_${RESOLVED_VERSION}_x64.dmg" ;;
    *)
      error "Unsupported macOS architecture: ${arch}"
      exit 1
      ;;
  esac

  local dmg_url
  dmg_url="$(pick_asset_url "$release_json" "$dmg_name" || true)"
  if [ -z "$dmg_url" ]; then
    error "Could not find asset '${dmg_name}' in release '${RESOLVED_VERSION}'."
    exit 1
  fi

  local tmp_dir dmg_path mount_point
  tmp_dir="$(mktemp -d)"
  dmg_path="${tmp_dir}/${dmg_name}"
  mount_point="${tmp_dir}/mount"
  mkdir -p "$mount_point"

  download_file "$dmg_url" "$dmg_path"

  info "Mounting DMG..."
  hdiutil attach "$dmg_path" -mountpoint "$mount_point" -nobrowse -quiet

  if [ ! -d "${mount_point}/Nexo.app" ]; then
    hdiutil detach "$mount_point" -quiet || true
    error "Nexo.app not found inside DMG."
    exit 1
  fi

  info "Installing Nexo.app to /Applications..."
  if [ -w "/Applications" ]; then
    cp -R "${mount_point}/Nexo.app" "/Applications/Nexo.app"
  else
    sudo cp -R "${mount_point}/Nexo.app" "/Applications/Nexo.app"
  fi

  hdiutil detach "$mount_point" -quiet || true
  rm -rf "$tmp_dir"
  info "Install complete. Open it from Applications: Nexo.app"
}

install_linux() {
  local release_json="$1"
  local arch="$2"

  if [ "$arch" != "x86_64" ] && [ "$arch" != "amd64" ]; then
    error "Linux installer currently supports x86_64/amd64 only."
    exit 1
  fi

  local tmp_dir
  tmp_dir="$(mktemp -d)"

  if command -v apt-get >/dev/null 2>&1 && command -v dpkg >/dev/null 2>&1; then
    local deb_name deb_url deb_path
    deb_name="Nexo_${RESOLVED_VERSION}_amd64.deb"
    deb_url="$(pick_asset_url "$release_json" "$deb_name" || true)"
    if [ -n "$deb_url" ]; then
      deb_path="${tmp_dir}/${deb_name}"
      download_file "$deb_url" "$deb_path"
      info "Installing .deb package..."
      sudo dpkg -i "$deb_path" || sudo apt-get install -f -y
      rm -rf "$tmp_dir"
      info "Install complete. Run: nexo"
      return
    fi
  fi

  if command -v dnf >/dev/null 2>&1 || command -v yum >/dev/null 2>&1 || command -v rpm >/dev/null 2>&1; then
    local rpm_name rpm_url rpm_path
    rpm_name="Nexo-${RESOLVED_VERSION}-1.x86_64.rpm"
    rpm_url="$(pick_asset_url "$release_json" "$rpm_name" || true)"
    if [ -n "$rpm_url" ]; then
      rpm_path="${tmp_dir}/${rpm_name}"
      download_file "$rpm_url" "$rpm_path"
      info "Installing .rpm package..."
      if command -v dnf >/dev/null 2>&1; then
        sudo dnf install -y "$rpm_path"
      elif command -v yum >/dev/null 2>&1; then
        sudo yum install -y "$rpm_path"
      else
        sudo rpm -i "$rpm_path"
      fi
      rm -rf "$tmp_dir"
      info "Install complete. Run: nexo"
      return
    fi
  fi

  local appimage_name appimage_url appimage_path install_dir
  appimage_name="Nexo_${RESOLVED_VERSION}_amd64.AppImage"
  appimage_url="$(pick_asset_url "$release_json" "$appimage_name" || true)"
  if [ -z "$appimage_url" ]; then
    rm -rf "$tmp_dir"
    error "Could not find installable Linux asset in release '${RESOLVED_VERSION}'."
    exit 1
  fi

  install_dir="${HOME}/.local/bin"
  mkdir -p "$install_dir"
  appimage_path="${install_dir}/nexo.AppImage"
  download_file "$appimage_url" "$appimage_path"
  chmod +x "$appimage_path"
  rm -rf "$tmp_dir"

  if ! printf '%s' ":$PATH:" | grep -q ":${install_dir}:"; then
    warn "${install_dir} is not in PATH. Add this to your shell profile:"
    warn "export PATH=\"${install_dir}:\$PATH\""
  fi

  info "Install complete. Run: ${appimage_path}"
}

main() {
  require_command curl
  require_command uname

  local os arch release_json
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"

  info "Detected platform: os=${os}, arch=${arch}"
  info "Resolving release metadata from ${REPO_OWNER}/${REPO_NAME}..."
  release_json="$(fetch_release_json)"

  if command -v python3 >/dev/null 2>&1; then
    RESOLVED_VERSION="$(JSON_INPUT="$release_json" python3 - <<'PY'
import json
import os
payload = json.loads(os.environ["JSON_INPUT"])
release = payload[0] if isinstance(payload, list) else payload
print(release.get("tag_name", "unknown"))
PY
)"
  elif command -v jq >/dev/null 2>&1; then
    RESOLVED_VERSION="$(printf '%s' "$release_json" | jq -r 'if type=="array" then .[0].tag_name else .tag_name end')"
  else
    error "Need either python3 or jq installed."
    exit 1
  fi

  info "Using release: ${RESOLVED_VERSION}"

  case "$os" in
    darwin) install_macos "$release_json" "$arch" ;;
    linux) install_linux "$release_json" "$arch" ;;
    *)
      error "Unsupported OS: ${os}. This installer currently supports macOS and Linux only."
      exit 1
      ;;
  esac
}

main "$@"
