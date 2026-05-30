#!/usr/bin/env bash
# Ensure a tmux session exists for a single worktree path.
#
# Args:
#   $1 = worktree path (must be an existing directory)
#
# The session is named wt-<basename(path)> with a single `claude`
# window rooted at the worktree. A shell pane is summoned on demand
# via Alt-` (see ~/.tmux.conf `bind -n M-\``) rather than pre-created
# as a separate window — the worktree opens full-screen for Claude
# and stays uncluttered.
#
# Idempotent — no-op if the session already exists, or if no tmux
# server is running (we never start a server from a git hook).
#
# Used by:
#   - tools/dev/skymap-tmux.sh   — initial scan when the hub attaches
#   - .git/hooks/post-checkout   — auto-spawn on `git worktree add` /
#                                  EnterWorktree

set -euo pipefail

wt="${1:-}"
[ -z "$wt" ] && { echo "usage: $0 <worktree-path>" >&2; exit 2; }
[ -d "$wt" ] || { echo "skymap-wt-ensure: not a directory: $wt" >&2; exit 2; }

command -v tmux >/dev/null 2>&1 || exit 0

# A running tmux server is required. Listing sessions returns non-zero
# with no server, in which case we silently bail — spawning a server
# from a hook would be surprising and would block the git operation
# while sockets initialise.
tmux list-sessions >/dev/null 2>&1 || exit 0

session="wt-$(basename "$wt")"
tmux has-session -t="$session" 2>/dev/null && exit 0

tmux new-session -d -s "$session" -c "$wt" -n claude
