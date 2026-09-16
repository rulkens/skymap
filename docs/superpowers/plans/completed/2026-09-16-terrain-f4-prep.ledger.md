# F4 prep — SDD ledger

Plan: docs/superpowers/plans/completed/2026-09-16-terrain-f4-prep.md · branch worktree-mars-terrain · PR #738
Start answers (2026-09-16): serial, no parallelism; no perf gate (no task changes per-frame cost). T4–T7 wait for the WebP rewrite (#736) to merge; merge main before dispatching them.

| dispatch | tasks | model | BASE→HEAD | status | turns |
| -------- | ----- | ----- | --------- | ------ | ----- |
| D1 | T1–T3 | sonnet | 144b2669a→cc4879d2e | done; typecheck:fast + 270 targeted tests green; deviations: RENDERER.md stale refs fixed, group-order test skipped per plan | 1 |
| ctl | — | opus | cc4879d2e→+1 | removed plan task numbers from 3 code comments | — |

| ctl | — | opus | →f37ad9d9b | #736 merged; main merged clean, typecheck:fast green; plan T4/T5 refs refreshed (v9) | — |
| D2 | T4–T5 | sonnet | f37ad9d9b→246db9844 | done; typecheck:fast + buildSurfaceTiles/merge + tools sweep green; deviation: pre/post --dev bake diff SKIPPED (no BMNG raw in wt) → run from main before landing | 1 |
| D3 | T6 | opus | 246db9844→1a4e4d20a | done (2 commits: aca3a1654 rename-only doesn't build, squash fixes); 2240 targeted tests green; naga-validated both entries via throwaway test (no committed WGSL validation path); `shading` single draw arg; parity test reads surfaceLighting.wesl. Eye-check PASSED by user (orbit, terminator+night, cloud shadow, Søndermarken z19) — tick the box after D4 | 1 |
| D4 | T7 | sonnet | 1a4e4d20a→517039f0d | done BUT pushed broken (wesl package:: edits left unstaged); ctl fixed 582546b1a | 1 |
| ctl | — | opus | →5f8167d5b | merged main (#737) 2e1c3b981; user ruled levelFittingWidth base-width param (T8) + full utils/scene split (T9) ride this PR; plan amended | — |
| D5 | T8–T9 | sonnet | 5f8167d5b→7279dff68 | done; tsc + 1926 targeted tests green; 57-file move, 7 hand-fixed stragglers | 1 |
| D6 | T10 | sonnet | 917371f3e→ec8cf2bd6 | done; 2052 targeted tests green; debug.overlays never persisted → no migration | 1 |
| R | final review | opus | 883e90a36...ec8cf2bd6 | 1st stalled (watchdog); rerun split in 2 → GPU slice clean (3 nits), tools slice 0 blockers / 2 should-fix / 7 nits | 2 |
| F | fix round | sonnet | ec8cf2bd6→bf4e3a86f | done, all 11 (prop renamed by hand; added height-only-keeps-albedo-provenance test); 1747 tests green. Skipped by ctl: stale lastCut on null pose | 1 |
| ctl | — | opus | →6b7e771bd | dropped unused HeightSource import. Waiting on CI | — |

Landing (2026-09-17): CI green; user visual pass + code review OK; --dev bake check SKIPPED by user (bake writes only to live public/data).

Next: D5 → final whole-branch review (opus) → one fix round → CI → /feature-done later (prep: no deletion audit).

Open: dev-bake equivalence + albedo-only merge smoke need raw data (main checkout). Extra null-prior merge test — judge at final review.

Next: D3 (T6 opus, review) → D4 (T7) → final whole-branch review.
