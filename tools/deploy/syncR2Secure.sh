#!/usr/bin/env bash
#
# Wrap `npm run sync-r2` with a credential-loading step that pulls
# CLOUDFLARE_API_TOKEN + CLOUDFLARE_ZONE_ID from the OS-native secrets
# store, so neither value lives in a dotfile or shell history.  The
# same token (scopes: Workers R2 Storage:Edit + Zone:Cache Purge)
# drives both wrangler's R2 uploads AND the post-sync CDN cache purge
# — wrangler reads CLOUDFLARE_API_TOKEN from env automatically, and
# tools/deploy/syncR2.ts reads it for the purge call.
#
# Backends, tried in order:
#   1. macOS Keychain — `security find-generic-password`.
#   2. Linux libsecret — `secret-tool lookup` (gnome-keyring / kwallet).
#   3. Pre-set env vars — useful for CI or platforms without a
#      supported secrets backend.
#
# If no backend matches and the env vars aren't pre-set, the upload
# still runs — sync-r2's own fallback message tells the user how to
# purge manually via the Cloudflare dashboard.  Treating purge as
# best-effort across all platforms keeps a Linux contributor without
# libsecret from being blocked by missing tooling they don't need.
#
# First-time setup:
#
#   # macOS
#   security add-generic-password -a "$USER" -s skymap-cloudflare-api-token -w 'TOKEN'
#   security add-generic-password -a "$USER" -s skymap-cloudflare-zone-id  -w 'ZONE_ID'
#
#   # Linux (libsecret-tools)
#   echo -n 'TOKEN'   | secret-tool store --label='Skymap CF API token' service skymap account cloudflare-api-token
#   echo -n 'ZONE_ID' | secret-tool store --label='Skymap CF zone id'   service skymap account cloudflare-zone-id

set -euo pipefail

KEYCHAIN_TOKEN_NAME="skymap-cloudflare-api-token"
KEYCHAIN_ZONE_NAME="skymap-cloudflare-zone-id"
SECRET_TOOL_SERVICE="skymap"
SECRET_TOOL_TOKEN_ACCOUNT="cloudflare-api-token"
SECRET_TOOL_ZONE_ACCOUNT="cloudflare-zone-id"

load_macos_keychain() {
  [[ "$OSTYPE" == darwin* ]] || return 1
  command -v security >/dev/null 2>&1 || return 1
  local t z
  t=$(security find-generic-password -a "$USER" -s "$KEYCHAIN_TOKEN_NAME" -w 2>/dev/null) || return 1
  z=$(security find-generic-password -a "$USER" -s "$KEYCHAIN_ZONE_NAME" -w 2>/dev/null) || return 1
  export CLOUDFLARE_API_TOKEN="$t"
  export CLOUDFLARE_ZONE_ID="$z"
}

load_libsecret() {
  command -v secret-tool >/dev/null 2>&1 || return 1
  local t z
  t=$(secret-tool lookup service "$SECRET_TOOL_SERVICE" account "$SECRET_TOOL_TOKEN_ACCOUNT" 2>/dev/null) || return 1
  z=$(secret-tool lookup service "$SECRET_TOOL_SERVICE" account "$SECRET_TOOL_ZONE_ACCOUNT" 2>/dev/null) || return 1
  [ -n "$t" ] && [ -n "$z" ] || return 1
  export CLOUDFLARE_API_TOKEN="$t"
  export CLOUDFLARE_ZONE_ID="$z"
}

use_preset_env() {
  [ -n "${CLOUDFLARE_API_TOKEN:-}" ] && [ -n "${CLOUDFLARE_ZONE_ID:-}" ]
}

backend=""
if load_macos_keychain; then
  backend="macOS Keychain"
elif load_libsecret; then
  backend="libsecret"
elif use_preset_env; then
  backend="pre-set env"
fi

if [ -n "$backend" ]; then
  echo "▶ loaded CF credentials from $backend"
else
  echo "⚠ no secrets backend matched; sync-r2 will skip the purge step." >&2
  echo "  See tools/deploy/syncR2Secure.sh for first-time setup, or pre-export CLOUDFLARE_API_TOKEN + CLOUDFLARE_ZONE_ID." >&2
fi

exec npm run sync-r2
