---
name: wt-close
description: Use after a worktree's PR merges — close out the worktree session end-to-end: stop its dev server, remove only the worktrees this effort created, return to main, and fast-forward it. Triggers like "/wt-close", "cleanup the worktree", "close this worktree and get latest main".
---

# `/wt-close` — post-merge worktree close-out

The counterpart to `/wt`. `/wt` opens an isolated workspace; this skill retires
it once its PR has squash-merged, without touching anything that belongs to
another session. Everything here was learned the hard way in real close-outs;
the ordering and the guards are the skill.

## Preconditions

- The worktree's PR is **MERGED** (`gh pr view <n> --json state`). If it isn't,
  stop and say so — this skill never discards unmerged work. (A squash-merge
  means the branch's commits are NOT ancestors of main by SHA; PR state, not
  `git branch --merged`, is the truth.)
- You are in the worktree session that `EnterWorktree` created (the `/wt`
  flow). If the worktree was created manually, `ExitWorktree` won't touch it —
  fall back to `tools/dev/skymap-wt-clean.sh` from main instead.

## Steps

1. **Stop the dev server first.** If this session started it as a background
   task, `TaskStop` it. Otherwise check who owns the port (`lsof -nP
   -iTCP:<port> -sTCP:LISTEN`) before killing anything — another worktree's
   server may share the machine. The "dev server stays running" convention ends
   when the worktree does.

2. **Inventory worktrees and attribute them.** `git worktree list`. The stale
   `agent-*` entries usually belong to OTHER sessions. Attribute before
   removing: write this branch's SHAs to a file (`git log --format=%H
   <base>..<head> > <scratchpad>/branch-shas.txt`) and grep each candidate
   worktree's HEAD against it. Only a worktree whose HEAD sits on this branch's
   history was spawned by this effort — remove those with `git worktree remove`
   (+ delete their `worktree-agent-*` branch). Everything else is another
   session's: report it, leave it, and point the user at
   `tools/dev/skymap-wt-clean.sh` for an interactive purge. A `locked` entry is
   an active session — never touch it.

3. **Verify the worktree is clean.** `git status --short` must be empty
   (the gitignored `.superpowers/sdd/` workspace and the `public/data` symlink
   don't show and ride the deletion — the ledger must already be archived in
   `docs/superpowers/plans/completed/`, which `/feature-done` did).

4. **Exit and remove.** `ExitWorktree` with `action: "remove"`. It will refuse
   with "N commits would be discarded" — after a squash-merge that is
   EXPECTED (the work lives in the squash commit); re-invoke with
   `discard_changes: true`. If the refusal instead lists uncommitted files,
   stop: something wasn't landed.

5. **Fast-forward main, preserving strangers' work.** On main, `git pull
   --ff-only`. If it aborts on a dirty file (other sessions leave uncommitted
   edits on main), NEVER bare-stash: `git stash push -m "<unique-tag>"
   <file>`, capture the SHA immediately (`git stash list --format='%H %gs'`),
   pull, `git stash apply <sha>` (not pop), then re-find the entry by tag and
   `git stash drop stash@{n}`. The stash stack is shared across all worktrees
   and sessions — the tag+SHA dance is what makes this collision-safe.

6. **Report** in one block: merged PR + squash SHA, worktrees removed vs.
   left (with owners where known), dev-server stopped, main's new HEAD, and
   any preserved dirty files from step 5.

Afterwards, update the project's memory file (effort → SHIPPED, worktree gone)
if one exists.

## Anti-patterns

- **Don't purge unattributed worktrees.** "Stale-looking" is not attribution;
  other sessions' in-flight worktrees look identical. The SHA-containment
  check in step 2 is the only safe test from inside one session.
- **Don't skip straight to `discard_changes: true`.** Read the refusal first —
  it's the last line of defense between "squash-merged commits" and "actually
  unlanded work".
- **Don't `git stash` / `git stash pop` bare** (shared stack; you can pop
  another session's entry). Step 5's procedure is mandatory.
- **Don't assume closing the tmux window removed the worktree** — it never
  does (see `skymap-tmux.sh` notes in CLAUDE.md).
- **Don't `cp` over existing files while cleaning up** — the shell aliases
  `cp -i`, which hangs a non-interactive call on the overwrite prompt; use
  `/bin/cp -f` when a copy is genuinely needed.

## Related

- `/wt` — creates + enters the worktree this skill retires.
- `/feature-done` — runs BEFORE this: DoD gate, ledger archive, completion
  moves. `/wt-close` assumes it already passed.
- `tools/dev/skymap-wt-clean.sh` — interactive multi-worktree purge across
  ALL efforts; the right tool when the user wants a global sweep rather than
  one effort's close-out.
