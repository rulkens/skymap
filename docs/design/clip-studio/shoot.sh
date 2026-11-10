#!/usr/bin/env bash
# shoot.sh <mock-name> '<hash>' [--phone]  — one shot of src/dev/mocks/<mock-name>.tsx, serialised:
# a global lock lets only ONE headless browser render at a time (4 shared cores, SwiftShader).
# Prints the shot path on stdout. Waits for the lock, then up to 6 min for the shot.
set -u
name="$1"; hash="${2:-}"; shift 2 || true
lock=${TMPDIR:-/tmp}/skymap-shoot.lock
log=${TMPDIR:-/tmp}/skymap-shoot-$name.log
exec 9>"$lock"
flock 9
cd "$(git rev-parse --show-toplevel)"
: > "$log"
setsid npm run mock -- "$name" "$hash" --url http://localhost:5173 "$@" >"$log" 2>&1 &
pid=$!
for _ in $(seq 1 360); do
  shot=$(grep -m1 '\.jpg$' "$log" || true)
  [ -n "$shot" ] && break
  kill -0 "$pid" 2>/dev/null || break
  sleep 1
done
kill -- -"$pid" 2>/dev/null; sleep 1; kill -9 -- -"$pid" 2>/dev/null
if [ -n "${shot:-}" ]; then echo "$shot"; else echo "NO SHOT — see $log" >&2; tail -5 "$log" >&2; exit 1; fi
