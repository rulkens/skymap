---
name: ship
description: Merge the current worktree's PR once CI is green, then close the worktree. Use when the user types `/ship` (optionally `/ship <PR number>`) or says "merge when CI finishes, then wt-close". Typing it IS the merge word for that one PR.
---

# `/ship` — merge on green, then `/wt-close`

The owner's shorthand for small PRs. It is an explicit merge instruction for ONE PR: the
current branch's, or the number given. It never carries over to another PR, and it never
merges red.

## Steps

1. **Resolve the PR**: the argument, else `gh pr view --json number,state,headRefName,isDraft`
   on the current branch. Stop and ask if there is none, it's already closed, or it's a draft.
2. **Push anything unpushed**: `git status --short` must be clean, with no commits ahead of
   the remote. Uncommitted work means the PR isn't what the owner approved: stop and ask.
3. **Wait for CI** with a `Monitor` poll over `gh pr checks <n> --json name,bucket`. Emit
   every terminal bucket and exit when none are pending. Never `--auto`.
4. **Red or cancelled → stop.** Report the failing check with its log tail. Don't merge,
   don't retry blindly; a fix is a new round with the owner.
5. **Green → squash-merge from the worktree via the API**, never `gh pr merge`, whose
   post-merge checkout hits the primary checkout:
   `gh api -X PUT repos/rulkens/skymap/pulls/<n>/merge -f merge_method=squash`, then
   `git push origin --delete <headRefName>`. Note the squash SHA from the response.
6. **Run `/wt-close`**, following that skill's steps.
7. **Report in one block**: the PR merged with its squash SHA, then wt-close's summary.

## Not this skill

- Big features: those go through `/feature-done` first, then an explicit merge ask.
- "merge in main" means main INTO the branch, not this skill.
