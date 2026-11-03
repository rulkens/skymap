#!/usr/bin/env bash
# Uploads a website media file to R2 (docs/DEPLOY.md, "Site media"): the hero film
# or the press kit, the site objects outside syncR2.ts. The S3 credentials come from the macOS Keychain,
# the same three entries syncR2Secure.sh reads, and reach rclone only as
# RCLONE_CONFIG_R2_* variables (tools/deploy/r2/rcloneEnv.ts), never a config file.
set -euo pipefail

FILE="${1:-public/data/site/earth-to-universe-v1.mp4}"
NAME="$(basename "$FILE")"

# The film's name is versioned, so it is immutable; the press kit keeps one name and is overwritten, so an hour.
case "$NAME" in
  *.zip) TYPE="application/zip"; CACHE="public, max-age=3600" ;;
  *.mp4) TYPE="video/mp4"; CACHE="public, max-age=31536000, immutable" ;;
  *) echo "no content type for $NAME" >&2; exit 1 ;;
esac

key() { security find-generic-password -a "$USER" -s "$1" -w 2>/dev/null; }
ACCOUNT_ID="$(key skymap-r2-account-id)" || { echo "keychain: skymap-r2-account-id missing" >&2; exit 1; }
ACCESS_KEY_ID="$(key skymap-r2-access-key-id)" || { echo "keychain: skymap-r2-access-key-id missing" >&2; exit 1; }
SECRET="$(key skymap-r2-secret-access-key)" || { echo "keychain: skymap-r2-secret-access-key missing" >&2; exit 1; }

RCLONE_CONFIG_R2_TYPE=s3 \
RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
RCLONE_CONFIG_R2_ACCESS_KEY_ID="$ACCESS_KEY_ID" \
RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$SECRET" \
RCLONE_CONFIG_R2_ENDPOINT="https://${ACCOUNT_ID}.r2.cloudflarestorage.com" \
RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true \
rclone copyto "$FILE" "r2:skymap-data/data/site/$NAME" \
  --header-upload "Content-Type: $TYPE" \
  --header-upload "Cache-Control: $CACHE" \
  --progress

curl -sI "https://skymap-data.rulkens.com/data/site/$NAME" | grep -iE '^(HTTP|content-type|content-length|cache-control)'
