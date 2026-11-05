# starCatalogPass extraction — ledger

Plan: `docs/superpowers/plans/2026-09-20-star-catalog-pass-extraction.md`
Worktree: `.claude/worktrees/star-catalog-pass-extraction`
Branch: `worktree-star-catalog-pass-extraction` (base `d992ee9cc` = plan commit)
PR: #771 — READY for review, CI green as of `301d0a8ae`, re-running on `654ae1c14`

## NEXT ACTIONS (verbatim, in order)

1. Confirm CI green on `654ae1c14`.
2. MERGE ONLY ON THE USER'S EXPLICIT WORD, via
   `gh api -X PUT repos/rulkens/skymap/pulls/771/merge -f merge_method=squash`.
   Never `gh pr merge` from a worktree.
3. Close-out: stop dev servers on :5178 (branch) and :5179 (baseline), then
   `git worktree remove .claude/worktrees/perf-baseline-main` (detached at
   `dcfff1ed9`, created only for the perf A/B; its `node_modules` and
   `public/data` are symlinks into main), then `/wt-close` for this worktree.
4. Update memory: `project_layer_composition.md` — extraction SHIPPED, NEXT is
   step (3) Layer structure cleanup.

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

## Post-audit polish (all AFTER the user's smoke test; none changes rendering)

Driven by user review of the landed code. PR left ready-for-review throughout.

- `e8022e28b` — `starSourceDrawOpacity`: one home for the per-source draw
  decision, which `starCatalogVisible` and `computeStarCut` each carried a copy
  of. The type narrowing stays duplicated on purpose — the compiler enforces it.
  Agreement test added first (kept, now pinning structural overlap).
- `301d0a8ae` — `starCutOncePerCtx`: the shared per-ctx memo becomes a named
  module instead of an unnamed WeakMap inside a file named for one of its two
  consumers. Two symbols in one file → three files, one symbol each.
- `04e242786` — `prepareStarCut` → `readStarCut`, `advanceStarFades` →
  `advanceStarCut`. USER RULING: full symmetry (same noun, verb carries the
  read/write distinction), and `advanceStarCut`'s doc must say what it advances
  (the per-node LOD fade ramps), which the old name carried.
- `4cb2747fe` — `DEFAULT_REFINE_THRESHOLD` → `DEFAULT_STAR_REFINE_THRESHOLD`
  (its five siblings in `defaults.ts` all carry `STAR`), comment trimmed 27 → 11
  lines; it claimed co-tuning with `DEFAULT_STAR_GLOW_OVERLAP` "(1.0 → 4.0)"
  where that constant is 3.0.
- `654ae1c14` — stage 1 of the star-defaults move: `walkStarOctreeCut`'s
  `refineThreshold` is now REQUIRED (only tests used the default; a pure util
  was importing a UI default). Stage 2 — moving all eight `DEFAULT_STAR_*` to
  `src/layers/starCatalog/settings/defaults.ts` — is DEFERRED to the Layer PR
  and recorded in `docs/backlog/2026-08-20-star-catalog-layer-god-layer-split.md`.

## Deletion-audit findings the user has NOT ruled on

Reported; no decision taken. Not blockers.

- `drawStarPick` duplicates `drawStarStream`'s 3-line preamble; folding it back
  into the pass re-adds symbols the purity ratchet cleared.
- `StarNodeDraw` is test-only surface after the unused import was dropped.
- `readStarCut.test.ts` covers three modules, so the `tests/` mirror is not exact;
  offered a split, user did not take it.
- One assertion in `readStarCut.test.ts` (settings fields copied through,
  `brightness > 0`) is compiler-checked shape — a deletion candidate per `testing.md`.
- Seam unification: `starNodeOriginRelCamMpc` and `emitNode`'s inline math are two
  spellings of one formula. User declined a backlog item; rationale for keeping
  both is in `computeStarCut`'s header (allocation-free hot loop, bit-identical).

- [x] User ruling: comment pass stands as-is. The four MOVED files
      (`walkStarOctreeCut`, `starOctreeIndex`, `starExposureRamp`,
      `starNodeOriginRelCamMpc`) had comments cut 952 → 514 lines with their code
      unchanged, which `comments.md` calls a sweep; user chose to keep the cuts.

## Log

- 2026-09-20 plan written + committed `d992ee9cc`; worktree created, data symlinked.
