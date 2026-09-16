# SDD ledger: 2026-09-16-terrain-rgb-height-tiles

Worktree: .claude/worktrees/terrain-rgb-webp-height-tiles · branch worktree-terrain-rgb-webp-height-tiles · draft PR #736
Plan: docs/superpowers/plans/2026-09-16-terrain-rgb-height-tiles.md (b6e7bca87)
Parallelism: this plan alone · Perf gate: NO (user 2026-09-16)

## Dispatches

- A: Task 1 · opus · BASE b6e7bca87 → a882c35a8 · DONE · 31 tool uses
  - deviation: heightCode∘codeHeightM not exact above code 0xA50001 (≈1049 km); kept MAX 0xffffff, idempotence tested instead
  - controller a6fc709d7: DecodedPixels → src/@types (inline type rule)
- A-review: Task 1 mid-branch review · opus · on b6e7bca87..a6fc709d7 · dispatched
- A-review: DONE — 0 bugs; fixed inline d02aaf02b (pixel-length guard, literal-offset header test); fourcc dup nit left
- B: Task 2 · sonnet · BASE a6fc709d7 → 7c52b3d27 · DONE · 87 tool uses
  - deviations: quantizeHeightGrid `!` fix; north-row test expectations wrapped through quantisation
- Task 3 (controller): v9 bake running from main cwd (scratchpad heightcomp/bake-v9.sh/.log); v8 manifest/index backed up as _.v8-backup._ in main's earth-tiles
- Final review · opus · on origin/main...d02aaf02b · DONE — 0 bugs; fix round inline 37be2643a (readback sized from bitmap, v9 example, SIZE_OFFSET, test trims); shared-canvas nit + fourcc dup declined
- Bake DONE 16 min (exit 0). verify-v9.py: 20,684/20,684 tiles, max post Δ 0.050 m, 0 bound violations, residual Δ ≤ 0.2 m (quantisation accumulates per level; plan guessed 0.1 — harmless), total 132.9 MB (v8 1.38 GB). index.txt cumulative (v7+v8+v9) = pre-existing behaviour.
- Chrome decode check (chromeDecodeCheck.mts, real Chrome via playwright): z7/z13/z19 IDENTICAL to sharp decode.
- User eye-check in BRAVE: spikes. Root cause: Brave Shields farbles canvas getImageData (in-tab sums ≠ Node; 264/313 spike posts). Chrome: works (user). Chrome sweeps 252 tiles identical (chromeDecodeSweep.mts).
  - Ruling (user): decode in the shader (rgba8unorm atlas + postHeightM helper), no compute pass, no Brave probe — plan Task 4 (5fbb145bf).
- D: Task 4 · opus · BASE 5fbb145bf → 7280e582a · DONE, pushed · 50 tool uses · naga-validated both shaders
  - deviations: WGSL constants local to lattice.wesl (no shared WGSL const file), parity regex accepts leading minus; wider r32float comment sweep; sampleType stays 'unfilterable-float'
- D-review · opus · DONE — 0 bugs; fix round inline a15f494ba (decoder comments, closeBitmap release, stale F1 comments, plan header + Task 3 note), pushed. Per-planet spec r32float lines left as history.
- User eye-check PASSED in Brave (Shields on) + Chrome. Plan boxes all ticked. PR #736 READY; CI running (main had not moved). Diff: code +423/−227, test +234/−166, doc +198/−5.
- USER GO (2026-09-16): merge when CI green, then feature-done + R2 sync + cleanup, AND prune R2 earth-tiles v8-and-older (only after v9 synced + CDN-verified).
- Landing recipe (decided): after squash-merge, ExitWorktree(keep) → ff main → trim MAIN earth-tiles/index.txt to v9 lines only (backup index.pre-prune.txt; else next sync re-uploads v7/v8) → `npm run sync-r2-secure` from main (plain bulk upload of v9 albedo+height, no server-side copy: cp -Rc didn't keep mtimes so rclone would re-upload anyway) → CDN verify manifest prefix v9 + sample tiles 200 → prune R2 `data/images/earth-tiles/v1..v8` via scratchpad heightcomp/r2.sh (`rclone purge r2:skymap-data/data/images/earth-tiles/vN`). R2 currently holds v1–v8 (no v9 yet).
- /feature-done: full suite 8524 green + typecheck clean (at a15f494ba+plan ticks). Deletion audit (opus): safe-now e540b286e; rulings (user): RGB-only decoder ef92e44ae, tool-only codec moved src→tools d1aa52ed6 (1163 targeted tests green); SHGT posts-field drop DECLINED. Plan + this ledger filed under completed/.
- NEXT: CI green → squash-merge → /feature-done (plan → completed/, archive ledger) → R2 sync on user's go.

## On D's report (queued sequence)

1. Check typecheck:fast + targeted tests; note the WGSL decode expression + sampleType change it reports.
2. Dispatch ONE review (opus, read-only) on 5fbb145bf..HEAD against plan Task 4 contract notes (round-not-truncate, integer code build, bilinear on decoded heights, rgba8unorm not -srgb, explicit layouts, no backticks in WGSL comments, uploadTexels fully deleted). One fix round inline, no re-review.
3. Push; ask user to hard-reload http://localhost:5173 in BRAVE (Shields on) and Chrome: no spikes, relief matches (Søndermarken, Everest, Grand Canyon, global), no WebGPU validation errors. Tick Task 4's controller box.
4. Then: PR #736 ready → `gh pr checks` (fetch/merge main first if main moved) → squash-merge ONLY on user's word → /feature-done (plan to completed/, archive this ledger as completed/<plan>.ledger.md) → R2 sync from main per DEPLOY.md v8→v9 order ONLY on user's go.

## State outside git

- Dev server: worktree `npm run dev` on :5173 (background shell of the pre-compaction session); public/data symlinked to main's.
- MAIN checkout public/data/images/earth-tiles: manifest.json + index.txt now name v9 (main's code shows flat terrain until merge); backups manifest.v8-backup.json / index.v8-backup.txt beside them; v9/albedo is an APFS clone of v8/albedo.
- Probe scripts here: chromeDecodeCheck.mts, chromeDecodeSweep.mts, nodeRef.mts. Scratchpad: heightcomp/ (exp.py, rgb.py, all.py, riff.mjs, bake-v9.sh/.log, verify-v9.py).
- Brave evidence: in-tab snippet gave 13/1538/1225 sum 32209970.6 (Node 32622898.7), 19/280352/50000 sum −374696.9 (Node 147340.3) → canvas farbling. User uses Brave day-to-day.
- Open (post-merge, user): delete local v8 trees; R2 prune of v8; z8–10 global EOX expansion plan (≈4.6 GB albedo + ≈2.2 GB heights, land w/o Antarctica, ~52 h fetch; EOX etiquette ask first).
- Dev server :5173 (worktree, data linked). NEXT: user eye-check → PR ready → CI → merge on user's word → R2 sync per DEPLOY v8→v9 order
