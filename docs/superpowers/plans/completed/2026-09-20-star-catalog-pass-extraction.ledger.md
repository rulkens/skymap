# starCatalogPass extraction — ledger

Plan: `docs/superpowers/plans/2026-09-20-star-catalog-pass-extraction.md`
Worktree: `.claude/worktrees/star-catalog-pass-extraction`
Branch: `worktree-star-catalog-pass-extraction` (base `d992ee9cc` = plan commit)
PR: not opened yet

User rulings carried in:

- Cull-slack fix (`STAR_SIZE_REF_PX` drift) rides THIS PR, not a separate one.
- `renderers/starCatalog/` root holds only renderers (+ `starCatalogLayout.ts`).
- No generic `utils/` bag: pure helpers → `src/utils/star/`, cut machinery →
  `renderers/starCatalog/cut/`.
- `computeStarCut`'s `advanceFades` boolean is DEFERRED to the Layer PR.

## Dispatches

- [x] A — Task 1: dead code, constants, dedup, cull-slack fix — `a3a52ab0a`.
      Mutation-verified by the controller: with the old divisor the leaf margin is
      0.00218 vs the 0.00410 required, the predicted 1.88x shortfall. Agent also
      ratcheted the purity row 26→22 to keep the suite green; Task 4 deletes it.
- [x] B — Tasks 2+3: types to `@types/rendering/` `de3415485`, moves `5fad97081`.
      Stragglers `move-files` missed (fixed by hand): `tools/perf/starCutCpuBench.mts`
      (outside its src+tests scope) and two source links in `docs/science.md`.
      Found en route: six tuning constants rode into `src/utils/star/`, which is
      one-symbol-per-file. Added to Task 4 rather than fixed in scope.
- [x] C — Task 4: constants `ad6da34a0`, extraction `fa80c6b52`. 1061 → 67 lines,
      purity row deleted. Landmine found: making `buildStarCutFrustum` pure moved
      `ctx.canvasSize.height` into an eagerly-evaluated call argument where the
      original early-returned first; gated inside the NEAR0 conditional.
- [x] D — Task 5: comment budget `b9f7a0dd5`. +372/−935, no test touched.
      Controller-verified comments-only (sole non-comment hunk is prettier
      rejoining two `&&` operands). Deferred fix from the old `REVIEW THIS` block
      is now `docs/backlog/2026-09-20-star-cut-frustum-newcomer-seeding.md`.
- [x] Final whole-branch review (opus): **no unclaimed behaviour change** — every
      extracted function read side by side against `main`. 10 findings, all applied
      in `3da27d8ca`, `4785c0407`, `a419f3004`.
- [x] Perf A/B (`star-field`, paired across two dev servers, 30/30/120 frames):
      `star-catalog` floor-subtracted mean 1.53 ms on `main` vs 1.63 ms on branch,
      against a ~0.5 ms noise floor, sign flipping between runs. No regression.
- [x] User smoke attested 2026-09-20.
- [x] Deletion audit (opus, legacy framing): safe-now −17 LOC applied in `a8723a6cf`,
      which also fixed the CPU bench's divisor (it read 2.6 — neither 4.7 nor 2.5).
      Needs-ruling bin reported to the user; see the PR thread.
- [x] User ruling: comment pass stands as-is. The four MOVED files
      (`walkStarOctreeCut`, `starOctreeIndex`, `starExposureRamp`,
      `starNodeOriginRelCamMpc`) had comments cut 952 → 514 lines with their code
      unchanged, which `comments.md` calls a sweep; user chose to keep the cuts.

## Log

- 2026-09-20 plan written + committed `d992ee9cc`; worktree created, data symlinked.
