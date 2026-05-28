#!/usr/bin/env bash
# Interactive cleanup of git worktrees whose branches have already
# merged into origin/main.
#
# For each worktree under .claude/worktrees/:
#   - skip if it has uncommitted changes
#   - if its branch tip is an ancestor of origin/main, prompt to remove
#   - otherwise leave it alone
#
# Closing a tmux window does NOT remove its worktree — worktrees
# persist on disk until `git worktree remove`. This script is the
# weekly hygiene pass.
#
# Usage:
#   ./tools/dev/skymap-wt-clean.sh

set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO"

echo "Current worktrees:"
git worktree list
echo

git fetch origin main --quiet || true

git worktree list --porcelain | awk '/^worktree/{print $2}' | while read -r wt; do
  [ "$wt" = "$REPO" ] && continue

  branch=$(git -C "$wt" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
  if [ -z "$branch" ] || [ "$branch" = "HEAD" ]; then
    echo "DETACHED: $wt — skipping (no branch)"
    continue
  fi

  if ! git -C "$wt" diff --quiet || ! git -C "$wt" diff --cached --quiet; then
    echo "DIRTY:    $wt ($branch) — uncommitted changes, skipping"
    continue
  fi

  if git merge-base --is-ancestor "$branch" origin/main 2>/dev/null; then
    printf "MERGED:   %s (%s) — remove? [y/N] " "$wt" "$branch"
    read -r ans </dev/tty
    if [ "$ans" = "y" ] || [ "$ans" = "Y" ]; then
      git worktree remove "$wt"
      git branch -D "$branch" 2>/dev/null || true
      echo "  removed."
    fi
  else
    echo "UNMERGED: $wt ($branch) — keeping"
  fi
done

echo
echo "Done. Run \`git worktree prune\` if any administrative refs are stale."
