#!/usr/bin/env bash
# Prettier over only the files this branch touches: committed since the
# merge-base with origin/main, plus staged, unstaged and untracked. The
# repo-wide pass is `npm run format:all` and is an explicit act, since
# hundreds of pre-existing files still differ from the ruleset.
set -euo pipefail
base=$(git merge-base HEAD origin/main)
{
  git diff --name-only --diff-filter=ACMR "$base"
  git diff --name-only --diff-filter=ACMR HEAD
  git ls-files --others --exclude-standard
} | sort -u | while IFS= read -r f; do [ -f "$f" ] && [ ! -L "$f" ] && printf '%s\n' "$f"; done \
  | xargs -r npx prettier --write --ignore-unknown "$@"
