---
name: link-data
description: Symlink the current worktree's `public/data/` to the main checkout's `public/data/`, so the worktree renders against the same real catalog data without rebuilding. Use when the user types `/link-data` or asks to "use real data here", "link the data", "stop falling back to synthetic", or sees `unsupported version: N — please regenerate the .bin via "npm run build-tiers"` warnings in the dev-server log. Idempotent: re-running on an already-linked worktree is a no-op.
---

# `/link-data` — Symlink Worktree `public/data/` to Main

## Why this skill exists

Every fresh worktree starts with no `public/data/` directory (it's gitignored
— see CLAUDE.md "The `.bin` files are intentionally not in git"). The
on-disk binary format also bumps every few weeks. Main's `public/data/` now
holds content-hashed filenames behind `manifest.json` (see docs/DATA.md
"Content hash + manifest") — a linked worktree resolves logical names the
same way, through main's manifest, since it's the same directory. .bin files
left over from older sessions trigger
`unsupported version: N — please regenerate the .bin via "npm run build-tiers"`
warnings in the browser console, and the engine falls back to the synthetic
procedural cloud (visible as ~100k dim dots, sometimes black squares if
synthetic.ts has its own bugs).

Rebuilding the bins in every worktree is wasteful — they're deterministic
outputs of `tools/catalog/buildAllBins.ts` against `data/raw/`, take several
minutes, and chew ~280 MB of disk per worktree. The main checkout's
`public/data/` is almost always current (the user runs `npm run build-tiers`
there before a sync-r2). So the cheapest path is to symlink the worktree's
`public/data` → main's, and let Vite serve the same bytes.

## What this skill does

1. **Detect environment** — confirm cwd is a linked worktree (`GIT_DIR !=
GIT_COMMON`), find the main checkout's root via `git rev-parse
--git-common-dir` (its parent is the main checkout).
2. **Detect main's data** — confirm `<main>/public/data/` exists, is a real
   directory (not itself a symlink), and contains at least one `.bin` or
   `.scfd` file. Bail with a clear error if main has no built bins.
3. **Inspect worktree's `public/data`** — branch on the four possible states:
   - **Missing** → just create the symlink.
   - **Directory with stale / unique bins** → check whether anything inside
     is newer than main's corresponding file or doesn't exist on main.
     `famous.bin` / `famous_meta.json` (local `build-famous` outputs) and
     `pgc_aliases.json` (staged into `public/data/` by `npm run predev` from
     the committed `data/` source) are known-stale and safe to drop — they're
     all reproducible and also present on main; anything else is unique. If
     the worktree has unique content,
     **ask the user** before clobbering (could be a deliberate per-worktree
     rebuild for testing a format change). Otherwise rename to
     `public/data.stale.<timestamp>/` as a one-step-back safety, then symlink.
   - **Symlink to main's `public/data`** → no-op, report "already linked".
   - **Symlink to elsewhere** → ask the user before replacing.
4. **Remove-then-link in one Bash call** — `ln -s <target> public/data`
   descends _into_ `public/data` when it already exists as a directory,
   creating a nested `public/data/data` link instead of replacing it — so
   the remove/rename, the `ln -sn`, and the `readlink` verification chain
   together in a single call (see the implementation sequence). Use the
   absolute path (rather than a relative `../../../../public/data`)
   so the symlink survives moving the worktree directory.
5. **Report** — one line: `Linked public/data → <main>/public/data (N files
visible)`.

## When NOT to use

- **On the main checkout itself.** `GIT_DIR == GIT_COMMON` means you're in
  the main repo; symlinking `public/data` to itself would loop. Detect and
  refuse with a clear message.
- **When the worktree has unique, unsaved bins.** If the user has just run
  `npm run build-tiers` in this worktree to test a format-bump or a new
  catalog parser, clobbering that work is data loss. Detection is heuristic
  (compare mtimes + presence — see step 3) and the action is `ask user`,
  never silent overwrite.
- **When `data/` is needed read-write.** Symlinks are transparent for
  _reads_ but writes go through to the target. If the user is iterating on
  the bin-building pipeline in this worktree and expects `public/data/` to
  be sandboxed, this skill is the wrong tool — they should `unlink
public/data && mkdir public/data && npm run build-tiers` instead. The
  `project_worktree_data_isolation` memory documents this trade-off.

## Why a symlink, not a bind-mount or hardlink

- **Bind-mount** would require sudo and OS-specific syntax. Symlinks work
  everywhere.
- **Hardlink** can't span filesystems and can't link directories on macOS
  (rejected by `ln`). Symlink is the only portable option for "share this
  whole directory across two clones."
- **Copy** would defeat the purpose — wastes 280 MB and goes stale the
  moment main is rebuilt.

## Anti-patterns

- **Don't** symlink individual files inside `public/data/` — main may add
  or remove files (new tier, new catalog, new volume), and a per-file
  symlink farm gets stale silently. Whole-directory symlink tracks main
  exactly as it changes.
- **Don't** symlink `data/raw/` instead of `public/data/`. `data/raw/` is
  the input to the bin-building pipeline; `public/data/` is the output.
  This skill is about reusing the output. The raw catalog files live in
  the main checkout via the raw-data registry already
  (`feedback_raw_data_registry`).
- **Don't** ask the user whether to link on worktree creation. `/wt` decides
  from the task description and links when the work could touch the render
  (see its step 5); a fresh worktree has no `public/data/` at all, so the
  default for anything visual is to link. Announce it, don't prompt for it.
  The judgement is only about _which_ of the three cases applies — visual
  work (link), doc/planning (skip), deliberate pipeline rebuild (skip, it
  wants its own directory). Note that this skill still asks before
  **clobbering** an existing `public/data/` with unique content — that guard
  is about data loss and stays.
- **Don't** kill the dev server before symlinking. Vite watches the
  filesystem and will pick up the new contents at the next HTTP request
  (the browser may need a hard refresh, but the server doesn't).

## Implementation sequence

The session running this skill is usually **worktree-isolated**: the harness
statically verifies each Bash call stays inside the worktree before running
it. A monolithic script — `cd` inside command substitutions, `if/else`
branching, `mv` targets built from `$(date +%s)`, paths held in shell
variables — cannot be statically verified and gets refused wholesale,
regardless of what it would actually do. So: **bash is the executor, not
the decision-maker.** Each call is a short chain of commands with literal
absolute paths; the assistant reads the output and chooses the next command.

1. **Probe the repo layout** (read-only):

   ```bash
   git rev-parse --git-dir; git rev-parse --git-common-dir
   ```

   If the two outputs are equal, you're on the main checkout — refuse with
   a clear message. Otherwise derive `<MAIN>` = parent directory of the
   common dir, and `<WT_GIT_DIR>` = the first output. Substitute both as
   **literal strings** into every command below — never as shell variables.

2. **Probe main's data and the worktree's current state** (read-only):

   ```bash
   ls /abs/main/public/data/*.bin >/dev/null 2>&1 && echo "main has bins"; readlink public/data; ls public/data 2>/dev/null
   ```

   Branch on the output — in the controller, not in bash:

   - No bins on main → bail: "run `npm run build-tiers` in main first".
     (Also bail if `<MAIN>/public/data` is itself a symlink.)
   - `readlink` prints `<MAIN>/public/data` → report "already linked", stop.
   - `readlink` prints something else → **ask the user** before replacing.
   - Real directory whose contents go beyond `famous.bin` /
     `famous_meta.json` / `pgc_aliases.json` (all reproducible and present
     on main) → unique content, **ask the user** before clobbering.
   - Missing, or only those known-stale files → proceed.

3. **Swap** — remove/rename, link, and verify in ONE call, so nothing can
   run between detect and swap. The trap this guards: `ln -s TARGET NAME`
   silently descends into NAME when NAME is an existing directory, creating
   a nested `public/data/data` instead of replacing it. Pick the variant
   matching the state found in step 2; write the timestamp yourself:

   ```bash
   # fresh worktree (public/data missing):
   ln -sn /abs/main/public/data public/data && readlink public/data
   # directory with only known-stale files (one-step-back safety):
   mv public/data public/data.stale.<literal-timestamp> && ln -sn /abs/main/public/data public/data && readlink public/data
   # wrong symlink (only after the user approved):
   rm -f public/data && ln -sn /abs/main/public/data public/data && readlink public/data
   ```

   If the final `readlink` doesn't print `<MAIN>/public/data`, stop and
   report — don't retry blindly.

4. **Silence git noise** — the symlink shows as `?? public/data` because
   `.gitignore`'s `/public/data/` rule matches only a directory. A fresh
   worktree's git dir has no `info/`, so create it first:

   ```bash
   mkdir -p /abs/main/.git/worktrees/<name>/info
   grep -qxF "/public/data" /abs/main/.git/worktrees/<name>/info/exclude 2>/dev/null || echo "/public/data" >> /abs/main/.git/worktrees/<name>/info/exclude
   ```

   (These paths sit outside the worktree directory but are the worktree's
   own git metadata; the isolation guard accepts them when they're spelled
   out literally.)

5. **Report** — count via `ls public/data | wc -l`, then one line:
   `Linked public/data → <MAIN>/public/data (N files visible)`.

## Git noise housekeeping

`/public/data/` (trailing slash) in `.gitignore` matches the directory
but NOT a symlink at the same path, so a fresh symlink shows as `??
public/data` in `git status`. Nothing under `public/data/` is tracked, so
`rm -rf public/data` produces no spurious `D` deletions — the `??` symlink
line is the only cosmetic noise. Vite serves real bytes through the symlink
regardless.

The skill silences it with **a `/public/data` line in the worktree's own
`info/exclude`** (`<main>/.git/worktrees/<name>/info/exclude` — the
per-worktree git dir from step 1, so the exclusion doesn't leak to other
worktrees). After that, `git status` in the worktree is clean. Nothing
under `public/data/` is tracked, so no `git update-index --skip-worktree`
sweep is needed — it would never find a file to flag.

## What changes when main rebuilds

After running this skill, every time the main checkout rebuilds (e.g.
`npm run build-tiers` to bump the bin format, or `npm run build-mcpm`
to refresh a volume), the worktree sees the updated bytes immediately
on the next Vite request — no re-link needed. That's the entire point
of the symlink.

The only re-link case is if main's `public/data/` is itself renamed,
moved, or replaced with a symlink (unusual). In that case re-run
`/link-data` — it's idempotent and will repoint the symlink.

## Related skills

- `/dev` — start the Vite server. Pair with `/link-data` on a fresh
  worktree: link the data, then `/dev`, then refresh the browser.
- `/feature-done` — when wrapping up a worktree, the symlink is fine to
  leave in place; the worktree's `git status` won't notice it because
  `public/data/*` is gitignored.

## See also

- CLAUDE.md "Deploy workflow" section explains why `.bin` files live in
  `public/data/` (browser-fetched at runtime) and on R2 (production).
- `project_worktree_data_isolation` memory — the convention that
  worktrees own their data is intentional; this skill is the opt-in
  override when isolation isn't needed.
