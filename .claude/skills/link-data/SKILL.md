---
name: link-data
description: Symlink the current worktree's `public/data/` to the main checkout's `public/data/`, so the worktree renders against the same real catalog data without rebuilding. Use when the user types `/link-data` or asks to "use real data here", "link the data", "stop falling back to synthetic", or sees `unsupported version: N — please regenerate the .bin via "npm run build-tiers"` warnings in the dev-server log. Idempotent: re-running on an already-linked worktree is a no-op.
---

# `/link-data` — Symlink Worktree `public/data/` to Main

## Why this skill exists

Every fresh worktree starts with no `public/data/` directory (it's gitignored
— see CLAUDE.md "The `.bin` files are intentionally not in git"). The
on-disk binary format also bumps every few weeks (currently v6); .bin files
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
4. **Remove-then-link, atomically** — the detect and swap MUST happen in a
   single script run. `ln -s <target> public/data` descends *into*
   `public/data` when it already exists as a directory, creating a nested
   `public/data/data` link instead of replacing it — so always remove or
   rename the existing path first, in the same pass, then
   `ln -sn <absolute main path> public/data` and verify `readlink` points at
   main. Use the absolute path (rather than a relative `../../../../public/data`)
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
  *reads* but writes go through to the target. If the user is iterating on
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
  The judgement is only about *which* of the three cases applies — visual
  work (link), doc/planning (skip), deliberate pipeline rebuild (skip, it
  wants its own directory). Note that this skill still asks before
  **clobbering** an existing `public/data/` with unique content — that guard
  is about data loss and stays.
- **Don't** kill the dev server before symlinking. Vite watches the
  filesystem and will pick up the new contents at the next HTTP request
  (the browser may need a hard refresh, but the server doesn't).

## Implementation sketch

```bash
# Step 1 — detect worktree
GIT_DIR=$(cd "$(git rev-parse --git-dir)" && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" && pwd -P)
if [ "$GIT_DIR" = "$GIT_COMMON" ]; then
  echo "ERROR: /link-data only runs inside a worktree (you're on the main checkout)."
  exit 1
fi

# Step 2 — find main checkout root
MAIN_ROOT=$(dirname "$GIT_COMMON")

# Step 3 — verify main has built data
if [ ! -d "$MAIN_ROOT/public/data" ] || [ -L "$MAIN_ROOT/public/data" ]; then
  echo "ERROR: $MAIN_ROOT/public/data does not exist or is itself a symlink."
  exit 1
fi
if ! ls "$MAIN_ROOT/public/data"/*.bin >/dev/null 2>&1; then
  echo "ERROR: $MAIN_ROOT/public/data has no .bin files. Run 'npm run build-tiers' in main first."
  exit 1
fi

# Step 4 — inspect worktree's current state AND swap, in ONE atomic pass.
#
# CRITICAL: do detection and the swap in a single script run. Splitting
# them across two Bash calls is what caused the nested-symlink bug — the
# second call ran `ln -s` while `public/data` still existed as a real
# directory, so `ln` created `public/data/data` *inside* it instead of
# replacing it. `ln -s TARGET NAME` silently descends into NAME when NAME
# is an existing directory. Never call `ln -s` against a path that might
# already exist; always remove/rename it first, in the same script.
if [ -L public/data ]; then
  TARGET=$(readlink public/data)
  if [ "$TARGET" = "$MAIN_ROOT/public/data" ]; then
    echo "Already linked: public/data → $MAIN_ROOT/public/data"
    exit 0
  fi
  # symlink points elsewhere — ASK the user before replacing, then:
  rm -f public/data
elif [ -d public/data ]; then
  # A real directory. Decide unique-vs-stale:
  #   - famous.bin / famous_meta.json (build-famous outputs) and
  #     pgc_aliases.json (predev-staged from data/) are NOT unique —
  #     they exist on main and are safe to drop.
  #   - Anything else (a freshly built *.bin / *.scfd that is newer than
  #     or absent from main) is UNIQUE — ASK the user before clobbering.
  UNIQUE=$(find public/data -maxdepth 1 -type f \
    ! -name famous.bin ! -name famous_meta.json ! -name pgc_aliases.json \
    -print -quit 2>/dev/null)
  if [ -n "$UNIQUE" ]; then
    echo "ERROR: public/data has unique content (e.g. $UNIQUE). Ask the user before replacing."
    exit 1
  fi
  # only known-stale committed files — rename as a one-step-back safety
  mv public/data "public/data.stale.$(date +%s)"
fi

# Step 5 — create the link. `-n` is belt-and-suspenders: it stops `ln`
# from descending if `public/data` somehow still resolves to a directory.
# By here the path is guaranteed gone, so a plain symlink is created.
ln -sn "$MAIN_ROOT/public/data" public/data
# Verify we got a symlink to main, NOT a nested public/data/data.
if [ "$(readlink public/data)" != "$MAIN_ROOT/public/data" ]; then
  echo "ERROR: link verification failed — public/data is not a symlink to main."
  rm -f public/data/data 2>/dev/null
  exit 1
fi

# Step 6 — silence git-status noise (see "Git noise housekeeping" below).
# No files under public/data are tracked, so this is a defensive guard that
# normally finds nothing.
TRACKED=$(git ls-files public/data/ 2>/dev/null)
if [ -n "$TRACKED" ]; then
  echo "$TRACKED" | xargs git update-index --skip-worktree
fi

# Add the symlink itself to the worktree's exclude file so `??` doesn't
# show.  Use the per-worktree exclude path if the git version supports
# it (2.36+); fall back to the shared one otherwise (effect is the
# same — the shared `.gitignore` already covers the real dir on main).
WORKTREE_EXCLUDE="$GIT_DIR/info/exclude"
mkdir -p "$(dirname "$WORKTREE_EXCLUDE")"
grep -qxF "/public/data" "$WORKTREE_EXCLUDE" 2>/dev/null \
  || echo "/public/data" >> "$WORKTREE_EXCLUDE"

# Step 7 — report
N=$(ls public/data/ | wc -l | tr -d ' ')
echo "Linked public/data → $MAIN_ROOT/public/data ($N files visible)"
```

The above is a sketch — the controller should adapt it (e.g., the
ask-user branches need actual user prompts, not exit codes).

## Git noise housekeeping

`/public/data/` (trailing slash) in `.gitignore` matches the directory
but NOT a symlink at the same path, so a fresh symlink shows as `??
public/data` in `git status`. Nothing under `public/data/` is tracked, so
`rm -rf public/data` produces no spurious `D` deletions — the `??` symlink
line is the only cosmetic noise. Vite serves real bytes through the symlink
regardless.

The skill silences it:

- **`git update-index --skip-worktree`** — a defensive guard that finds no
  tracked files under `public/data/` in a current worktree; harmless and
  reversible with `--no-skip-worktree`.
- **A `/public/data` line in `$GIT_DIR/info/exclude`** silences the
  symlink itself. For git 2.36+, `$GIT_DIR` for a linked worktree is
  the per-worktree `<main>/.git/worktrees/<name>/`, so this exclusion
  is per-worktree. For older git, `git rev-parse --git-path info/exclude`
  returns the shared exclude file — the entry there is harmless because
  the main checkout's real `public/data/` directory is already gitignored
  via the trailing-slash rule.

After both, `git status` in the worktree is clean.

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
