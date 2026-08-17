---
name: wt
description: Create a fresh git worktree from a short description and drop the session straight into it. Use when the user types `/wt <description>` or asks to "start a worktree for X", "spin up a worktree", "work on X in a worktree", or "branch off into a worktree". Derives a kebab-case name from the description and calls the native EnterWorktree tool (fresh from origin/main).
---

`/wt <description>` is a thin ergonomic wrapper over the harness's native
`EnterWorktree` tool. It turns a free-text description into a tidy worktree
name so the user can type `/wt improve cluster coverage` and land in an
isolated workspace without hand-naming anything.

The skill creates + enters the worktree, then links real catalog data **when the
task needs it** — that call is the assistant's to make, not a question for the
user. It never starts the dev server (that stays opt-in via `/dev`). Linking
matters because a fresh worktree has **no** `public/data/` at all — every
catalog file there is a gitignored build output or a `data/`-staged copy — so
without it the renderer falls back to the synthetic procedural cloud.

## Steps

1. **Read the description** from the slash-command arguments (everything after
   `/wt`). If it's empty, ask the user what the worktree is for rather than
   inventing a name.

2. **Derive a kebab-case name** from the description:
   - lowercase everything
   - keep only letters, digits, and dashes; replace any run of other
     characters (spaces, punctuation) with a single `-`
   - trim leading/trailing dashes
   - keep it short — roughly the first 3-4 meaningful words, max ~40 chars.
     Drop filler words ("the", "a", "for", "to") when trimming for length.

   Examples:
   - `/wt improve cluster coverage` → `improve-cluster-coverage`
   - `/wt fix the InfoCard hover bug` → `fix-infocard-hover-bug`
   - `/wt experiment with MSDF kerning` → `experiment-msdf-kerning`

3. **Call `EnterWorktree`** with `name` set to the derived kebab string. The
   harness branches fresh from `origin/main` (the default `worktree.baseRef`),
   creates the worktree under `.claude/worktrees/`, and switches the session
   into it. The harness prefixes the branch with `worktree-` automatically —
   pass only the clean kebab name, not a `worktree-` prefix.

4. **Report** the new worktree path and branch that `EnterWorktree` returns,
   in one line, so the user knows where they are.

5. **Decide whether to link real data, and act.** Judge it from the
   description; don't ask. Run `/link-data` (it symlinks this worktree's
   `public/data/` → main's) whenever the task could plausibly involve looking
   at the render — renderer/shader work, a visual bug, anything with a UI
   check, anything filmed with the recorder. Linking is cheap, reversible, and
   costs no disk, so when it's a close call, link. Then say so in the same line
   that reports the path — one clause, not a question.

   Two cases where linking is wrong, both recognisable from the description:
   **doc/planning/spec-only** work, and a **deliberate pipeline rebuild** that
   wants its own `public/data/` to write into (`build-tiers`, a bin-format
   bump, a new parser). Say which one you inferred, so a wrong read is cheap
   for the user to correct.

## Guardrails

- **Already in a worktree?** `EnterWorktree` refuses to nest. If the session is
  already inside a worktree, don't silently fail — tell the user they're in
  `<current worktree>` and ask whether to `ExitWorktree` (keep or remove) first,
  then re-run `/wt`.
- **Name collision.** If a worktree with the derived name already exists,
  `EnterWorktree` will error. Append a short disambiguating suffix (e.g.
  `-2`) and retry, or ask the user for a different description.
- **Don't commit unrelated work into the new branch.** The worktree is for the
  task the description names; if the user later wants something off-topic
  committed, that's a separate `/wt`.
