---
name: land-dependabot
description: Use when the user asks to land, merge, or batch the open dependabot PRs — triggers like "/land-dependabot", "land the dependabot PRs", "merge the dependency updates", "clear out dependabot", "batch the dependabot PRs". Covers why they can't be merged one-by-one and the npm cooldown gotcha.
---

# `/land-dependabot`: batch-land dependabot PRs

All dependabot PRs touch `package-lock.json`, so any two conflict pairwise.
**Never merge them one-by-one** — land them as one batch branch. Proven
2026-08-20 on PR #603 (five PRs, #586–#590).

## Procedure

1. **Enumerate.**

   ```bash
   gh pr list --author "app/dependabot" --state open --json number,title
   ```

2. **Isolate in a fresh worktree** off `origin/main` (leaves the main
   checkout's `node_modules` and running dev server untouched). Branch:
   `deps/dependabot-batch-YYYY-MM-DD`.

3. **Extract target versions per PR.**

   ```bash
   gh pr view <n>
   gh pr diff <n>   # full diff only — `gh pr diff <n> -- path` is invalid
   ```

   Distinguish **direct pins** (`package.json` changes) from
   **transitive/lockfile-only** bumps.

4. **Apply the bumps.**
   - Direct deps: hand-edit `package.json` to the target version, keeping the
     existing semver-range style (`^`, `~`, exact).
   - Transitive-only: `npm update <pkg>` — plain `npm install` won't move a
     transitive dep if the current lockfile version still satisfies the
     range.
   - Never hand-edit `package-lock.json`. Never
     `npm install <pkg>@<v> --no-save` (touches `node_modules`, not the
     lockfile).

5. **Cooldown gotcha.** `~/.npmrc` sets `min-release-age=3` (supply-chain
   guard). If dependabot's target was published <3 days ago, `npm install`
   hard-fails with `ETARGET`. Don't bypass or weaken the guard — find the
   newest version older than the cutoff instead:

   ```bash
   npm view <pkg> time --json
   ```

   Land that version; dependabot re-PRs the last hop later on its own.

6. **Verify, in order, all must pass before anything merges:**

   ```bash
   npm run typecheck   # catches type-level breaks from dev-dep bumps
   npm test             # large suite, ~10 min
   npm run build
   ```

   A dev-dep major bump can break types without breaking runtime — e.g.
   sharp 0.35 moved from namespace-merged types to named ESM exports and
   needed two import fixes. Such fixes belong in the batch PR; they're
   caused by the bump.

   On failure: bisect to the offending bump, revert just that package's
   version (both files), re-verify, land the green subset, and report the
   excluded PR + why in the PR body.

7. **Commit and open the PR.** Stage explicitly — `package.json` +
   `package-lock.json` + any type-fix files — never `git add -A`. Draft PR
   first, body lists per-package from→to and confirms all three verification
   commands passed. Then mark ready and squash-merge.

8. **Worktree merge gotcha.** `gh pr merge --squash --delete-branch` run
   from inside a worktree merges fine via the API but then fails local
   branch housekeeping (`'main' is already used by worktree…`). Confirm the
   merge landed:

   ```bash
   gh pr view <n> --json state,mergedAt
   ```

   then delete the remote branch by hand if needed:

   ```bash
   git push origin --delete <branch>
   ```

9. **Confirm auto-close.** Dependabot closes its source PRs within seconds
   of the batch merge:

   ```bash
   gh pr list --author "app/dependabot"
   ```

   Manually close any straggler with a comment pointing at the batch PR.

10. **Clean up the worktree.**

## Never

- Merge dependabot PRs individually — they conflict on `package-lock.json`.
- Hand-edit `package-lock.json`.
- Bypass or lower `min-release-age` in `~/.npmrc` to dodge the cooldown.
- `git add -A` when committing the batch.
