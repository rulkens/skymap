#!/usr/bin/env bash
# Convenience wrapper: `./tmux.sh` from the repo root opens (or
# reattaches) the skymap tmux session. See tools/dev/skymap-tmux.sh
# for the actual layout logic.
exec "$(dirname "$0")/tools/dev/skymap-tmux.sh" "$@"
