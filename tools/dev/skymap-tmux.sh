#!/usr/bin/env bash
# Start (or reattach to) tmux sessions for skymap development.
#
# Layout:
#   - session "skymap"            rooted at the repo root (windows: main, shell)
#   - session "wt-<name>"         per worktree under .claude/worktrees/
#                                 (windows: claude, shell — both at the worktree)
#
# Why sessions-per-worktree instead of windows-per-worktree: each
# worktree gets its own isolated window list, so you can split panes
# inside it (editor + dev server + git) without crowding a single
# top-level bar. Switch between sessions with Ctrl-b s (or Ctrl-b S
# for the session-only picker bound in ~/.tmux.conf).
#
# Does NOT auto-start `claude` in any window — you pick which windows
# get a Claude session and which stay as plain shells. Existing sessions
# are left untouched so in-flight work isn't disturbed.
#
# Two responsibilities, both idempotent:
#   1. PRUNE  — kill wt-* sessions whose worktree directory is gone
#               (git has no worktree-remove hook).
#   2. ENSURE — make sure each existing worktree has a session, via
#               skymap-wt-ensure.sh. The same helper is invoked from
#               .git/hooks/post-checkout, so new worktrees pop up
#               immediately on `git worktree add` / EnterWorktree —
#               you only need to re-run this script for prune.
#
# Usage:
#   ./tools/dev/skymap-tmux.sh        (from outside tmux: attaches the hub)
#   ./tools/dev/skymap-tmux.sh        (from inside tmux : runs prune + ensure only)
#
# Detach with Ctrl-b d; reattach with `tmux attach -t skymap` or by
# re-running this script. Jump straight to a worktree with
# `tmux attach -t wt-<name>`.

set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
HUB=skymap

if ! command -v tmux >/dev/null 2>&1; then
  echo "tmux not installed — \`brew install tmux\` first." >&2
  exit 1
fi

# Hub session for the main checkout.
if ! tmux has-session -t "$HUB" 2>/dev/null; then
  tmux new-session -d -s "$HUB" -c "$REPO" -n main
  tmux new-window -t "$HUB" -n shell -c "$REPO"
  tmux select-window -t "$HUB:main"
fi

# Prune wt-* sessions whose worktree directory no longer exists. Git has
# no `worktree-remove` hook, so sessions for worktrees removed by
# `git worktree remove` / ExitWorktree linger until something cleans them
# up; this is that something. We do it before the ensure-loop below so
# the user sees a tidy session list immediately on attach.
while IFS= read -r session; do
  case "$session" in wt-*) ;; *) continue ;; esac
  wt_path="$REPO/.claude/worktrees/${session#wt-}"
  [ -d "$wt_path" ] || tmux kill-session -t "$session" 2>/dev/null || true
done < <(tmux list-sessions -F '#S' 2>/dev/null || true)

# One session per worktree. The "wt-" prefix groups them together in
# the session picker and avoids clashing with ad-hoc session names.
# Delegates the per-worktree work to skymap-wt-ensure.sh so the same
# logic also serves the post-checkout hook.
if [ -d "$REPO/.claude/worktrees" ]; then
  for wt in "$REPO"/.claude/worktrees/*/; do
    [ -d "$wt" ] || continue
    "$REPO/tools/dev/skymap-wt-ensure.sh" "${wt%/}"
  done
fi

# Only attach if we're not already inside a tmux client. The script is
# also invoked from inside tmux (manually or from a binding) just to
# run the prune + ensure passes, in which case `tmux attach` would fail
# with "open terminal failed: not a terminal".
[ -n "${TMUX:-}" ] && exit 0
exec tmux attach -t "$HUB"
