#!/usr/bin/env bash
# Start (or reattach to) a tmux session for skymap development.
#
# Layout:
#   - window "main"   rooted at the repo root
#   - one window per existing worktree under .claude/worktrees/
#   - window "shell"  for ad-hoc git/npm commands
#
# Does NOT auto-start `claude` in any window — you pick which windows
# get a Claude session and which stay as plain shells. Re-running this
# script while the session exists just reattaches; it does not add
# windows for worktrees created after the initial launch (close and
# relaunch, or `tmux new-window -c <path>` by hand).
#
# Usage:
#   ./tools/dev/skymap-tmux.sh
#
# Detach with Ctrl-b d; reattach with `tmux attach -t skymap` or by
# re-running this script.

set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
SESSION=skymap

if ! command -v tmux >/dev/null 2>&1; then
  echo "tmux not installed — \`brew install tmux\` first." >&2
  exit 1
fi

if tmux has-session -t "$SESSION" 2>/dev/null; then
  exec tmux attach -t "$SESSION"
fi

tmux new-session -d -s "$SESSION" -c "$REPO" -n main

if [ -d "$REPO/.claude/worktrees" ]; then
  for wt in "$REPO"/.claude/worktrees/*/; do
    [ -d "$wt" ] || continue
    name=$(basename "$wt")
    tmux new-window -t "$SESSION" -n "$name" -c "$wt"
  done
fi

tmux new-window -t "$SESSION" -n shell -c "$REPO"
tmux select-window -t "$SESSION:main"

exec tmux attach -t "$SESSION"
