# SDD ledger — plan: docs/superpowers/plans/2026-08-19-generated-staleness.md

Branch: refactor/generated-staleness (draft PR #579). Base at execution start: 70fc7c92e.
No separate spec — decisions.md is the authority (plan header says so; rung-2 precedent).

## Pre-flight conflict scan (2026-08-19)

Task-pair rows (shared files/interfaces):

| pair | shared surface | produce vs consume | finding |
| --- | --- | --- | --- |
| T1→T2 | MilkyWayCloud.reconcile | T1 mints `reconcile(wantedCount: number): void` per the contract block; T2 calls exactly that signature via `state.gpu.milkyWayCloud?.reconcile(...)` | consistent — contract block matches both task texts |
| T1/T3 | src/@types/galaxy/MilkyWayCloud.ts | T1 adds the method + docblock; T3 later shortens the :17-22 header comment | no conflict (T3 sequenced after T2), but T3's cited line numbers will shift after T1 — T3 dispatch must locate by content |
| T2/T3 | the "runFrame mismatch check" phrasing | T2 deletes the branch; T3 repoints prose that names it | consistent, order enforced by plan (3 after 2) |
| T5/T6 | decision #13 wording | T6's :248 cell "must now match decision #13", which T5 writes | plan says T3–T6 any order — see Ruling 1 |
| T2/T7 | runFrame.test.ts parity gate | T2 modifies stub only; T7 re-runs full gate | consistent |

Per-task self-consistency:

| task | check | finding |
| --- | --- | --- |
| T1 | 3 tests vs contract vs cited factory pattern (milkyWayCloud.test.ts:1-40, :156-178) | agrees; tests assert observables (destroy + new submit + starCount), none vacuous |
| T2 | replacement line vs runFrame.ts:209-243 as read in this session | branch bounds verified in-session; position (after renderTargets.reconcile, before camera produce) matches the file |
| T3 | four cross-refs listed explicitly incl. the grep-invisible false EngineGpuHandles claim | self-consistent; comment-only |
| T4 | header pointer, no test | consistent with testing.md (comments untestable) |
| T5 | decision #13 content list vs plan's D1-D5 | consistent |
| T6 | three map lines; warns about in-flight mermaid edit | mermaid edit was committed with the plan (70fc7c92e), so "check first" resolves to: already landed, rebase concern moot |
| T7 | gate + user-eyes smoke | smoke cannot self-certify — end-of-run user checkpoint, per plan text |

Ruling 1: T6 executes AFTER T5 (batched into one dispatch, T5 first) — T6's table cell must quote/match decision #13, which T5 authors; the plan's "any order" clause is internally inconsistent with T6's own text. Cost if wrong: none material (docs-only, same PR).
Ruling 2: batch T3+T4 into one dispatch (comment-only repoints, same shape), and T5+T6 into one dispatch (decisions record + map alignment) — per the skill's batch-small-same-shape rule. Review each batch as one unit. Cost if wrong: a muddier review surface on comment edits.

## Progress

- BASE for Task 1: 70fc7c92e. Briefs task-1..task-6 extracted in this directory.
- Task 1: complete (commit d554a317f). Review: spec ✅, quality approved, no findings; reviewer independently re-ran tests (17 pass) + typecheck. Noted-not-a-defect: reconcile docblock +9 comment lines — deliberate T1→T2→T3 sequence nets the budget down (reviewer cross-checked T3 brief).
- Task 2: complete (commit f528bc3be). Review: spec ✅, quality approved, zero findings; reviewer re-ran runFrame 16/16. Assertions byte-identical; comment budget down 25→3 lines; tier single-writer intact.
- BASE for T3+T4 batch: f528bc3be. Batch implementer DONE (commit d979e43e1; all 4 T3 refs repointed + T4 D4 pointer added; typecheck clean, 33/33 spot tests; agent a11e51b8d165576b1). Ruling 3: batch nets FLAT (18/18) — accepted; the plan's comment-budget clause is branch-wide and Task 2 took the branch ~22 lines net-negative. Cost if wrong: trivially fixable in T7. Review: spec ✅ both tasks, quality approved; every repointed claim fact-checked against live code (reconcile sole call site runFrame.ts:213). Two nits parked, both PRE-EXISTING oversized headers (createReseedLatch ~21 lines, MilkyWayCloud ~24, watchTierSaga) — batch shrinks not grows them; no action this rung. Tasks 3+4: complete.
- BASE for T5+T6 batch: d979e43e1. Batch implementer DONE_WITH_CONCERNS (commit f7de817f3; decision #13 five-clause membership test + 7 per-site rulings + rung-4 re-open condition + D4/D5; #9 amended in place; map aligned verbatim; prettier + tsc clean; agent a1d0e3ce1c5aab1c2). Ruling 4: two extra map lines beyond the brief's three (§3 ~8× loose spot, §7 W4 mermaid label) ACCEPTED — they asserted counts #13 falsifies; same-page self-consistency trumps strict brief scope. Colour moves (GEN 🔴→🟠, W4 good→out) accepted with it. Cost if wrong: revert two doc lines.
- PARKED (for final review's fix round, not this batch): (a) map §2 still claims mw-aggregate divisor rebuild is a bespoke runFrame branch — false since rung 2; (b) map header snapshot date still 2026-08-17. Both out-of-family for rung 3; fix in final-review fix dispatch or a rung-2-style follow-up.
- T5+T6 review: spec ✅ both, quality approved with ONE should-fix — the "6 already resource-owned + 1 relocated" tally miscounts site 4 (reevaluateDemand stale-tier evict), which #13 itself defers to rung 4 (fails clauses 3+4); correct tally 5 settled + 1 relocated + 1 deferred-to-rung-4, wrong in 3 spots (map Loose-spots row, map §6 assessment row, decisions.md #9 amendment). Nit (no action): #13 ~80 lines, longest decision, all brief-mandated. Reviewer spot-checked #13 claims vs code — all accurate.
- Fix round 1 (T5+T6): DONE (commit a28848e77, follow-up not amend; all 3 spots → "5 resource-owned + 1 relocated + 1 deferred to rung 4"; assessment row "settled except site 4 → rung 4"; prettier + tsc clean). Scoped re-review: ADDRESSED, no new findings (grep-verified no stray "6" tally; #13 rulings untouched). Tasks 5+6: complete (f7de817f3 + a28848e77).
- T7 (controller gate): GREEN — npm run typecheck clean, galaxy-renderer tsconfig clean, full npm test 1045 files / 7021 tests passed (50s). USER-EYES smoke PENDING (asked; slider re-densify / tier switch regenerates once / idle regenerates nothing — dev server port 5174).
- Final whole-branch review (opus): needs-fixes MINOR — code delta verified correct + behaviour-neutral (strict !==, sole call site, `?.` short-circuit preserves old guard semantics; net comments −12; no registry; assertions byte-identical). 5 should-fix, ALL comment/doc: (1) makeRunTierTransition.test.ts:94-98 fifth "mismatch check" cross-ref; (2) map §2:96 bespoke-branch claim [parked a — ruled FIX HERE]; (3) map :141 dead runFrame.ts:275-281 evidence range; (4) map :3 snapshot date [parked b — ruled FIX HERE]; (5) decisions.md:254-259 Ground-prep P1/P2 still promise walker + deleted-branches — mark superseded by #13. Nits: (6) engine-composition-map/subsystem-sweep/W1-label sweep DEFERRED to rung 4; (7) runFrame.test.ts:765-772 header prose — include in fix (cheap, same class); (8) site-3 tally precision ACCEPTED as-is (#13 per-site text records the handoff; no reader misled).
- Ruling 5: findings 1-5 + 7 in ONE fix dispatch (sonnet, comment/doc only); 6 deferred (ledgered for rung 4); 8 accepted. Fix DONE (commit 5c64d6db7; tsc clean, targeted vitest 24/24, prettier clean, comment/doc-only). Scoped re-review: ADDRESSED ×6, no new findings; comment/doc-only confirmed by diff filter; "mismatch check" class closed repo-wide. BRANCH COMPLETE at 5c64d6db7, pushed to origin (PR #579 draft, 6 commits). Ruling 6: workspace NOT deleted despite skill's clean-final-review step — sdd-execution.md has /feature-done archive the ledger to plans/completed/, which needs this file alive; delete after /feature-done. REMAINING: user-eyes smoke (slider re-densify / tier once / idle nothing, port 5174) → then /feature-done on the branch → PR ready+merge ONLY on user's word (gh api PUT squash, announced).
- DEFERRED to rung 4 (from final review finding 6): engine-composition-map.md:340,351-354,424 + subsystem-sweep.md:16,28 still describe the deleted MW mismatch branches; current-contracts-map.md:226 W1 mermaid label still says "+ divisor rebuild branch".
- Queued sequence (binding): T1 review → T2 (sonnet, new BASE first) → batch T3+T4 one dispatch (sonnet, comment-only; locate by content not line numbers — T1 shifts MilkyWayCloud.ts lines) → batch T5+T6 one dispatch (opus, T5 before T6 per Ruling 1) → T7 controller gate (typecheck both tsconfigs + full npm test) + USER-EYES smoke (slider re-densify / tier switch regenerates once / idle regenerates nothing) → final whole-branch review (opus, review-package 70fc7c92e..HEAD, point at deferred/parked ledger lines) → report to user.
- Merge policy: PR #579 (draft) merges ONLY on the user's explicit word, via gh api PUT squash, announced. "go" covered execution, not the merge.
- Session artifacts: board https://claude.ai/code/artifact/4027c9f0-17bf-42e4-a686-7aa096283852 (republish same scratchpad file engine-ladder-board.html); staleness inventory scratchpad/rung3-staleness-inventory.md.
- Earlier this session (pre-execution): compositor dead-args fix merged as be946afe1 (PR #578); rung-3 plan committed 70fc7c92e after adversarial review reshaped registry → resource-owned reconcile.
