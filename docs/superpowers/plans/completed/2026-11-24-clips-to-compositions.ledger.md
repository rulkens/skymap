# SDD ledger — plan: docs/superpowers/plans/2026-11-24-clips-to-compositions.md

Worktree: .claude/worktrees/body-content-d-galaxies-only (shared with PR D), branch `clips-to-compositions`, base 42d7dfbb1 (main). Dev server :5176 (task bnhl1n0ti).
Owner 2026-11-24: "ok as prep pr" — clip registry moves to compositions before PR D. Shape per ADR 0013 + tours precedent (#1160); no Layer contract growth.
Ruling: prep branch lives in the D worktree — a second worktree cannot be made from this isolated session and the measuring kit would have to be copied — cost if wrong: the worktree folder name does not match the branch. After merge: `git switch worktree-body-content-d-galaxies-only`, ff to main, continue D (its ledger: ../2026-11-24-body-content-out-of-core-d-galaxies-only/progress.md).
Never commit: tools/reference-engine/, src/compositions/galaxiesOnly.ts, .payoff-dist*, the two patched frame files. After the move, update the kit's stub path in tools/reference-engine/vite.payoff.config.ts:13 (clipRegistry → compositions/appClips.ts).
No spec (ADR is the authority); rulings in the plan's "Rulings made at plan time".
Perf baseline: scratchpad clips-perf-before.txt (task bfgwxiluw, 3 scenarios, 30 frames).

Dispatch 1: Tasks 1-3 (opus, one implementer, three commits) → (running)
Dispatch 1 result: DONE. Task 1: complete (commit c65d0b430). Task 2: complete (c8fc8e7c6; no type cycle; APP_CLIP_FACTORIES uses satisfies). Task 3: complete (8d5cf5adb). typecheck 0 errors, build green, npm test 2055 pass / 1 fail = tests/services/engine/frame/checkFrameOrder.test.ts (the local frame patch, not branch code). Extra edits beyond the plan: .claude/skills/{mockup,tour}/SKILL.md repointed, docs/BACKLOG.md:62 J4→J5. Adjacent finding (unruled, ask owner): tour skill step 2 names an expected-keys list that does not exist.
Perf before (merged ms): earth-surface 15.0, solar-system 10.2, full-survey 18.3. After: task bwgsmxobo → scratchpad clips-perf-after.txt.
Dispatch 2: whole-branch review (fable), range 42d7dfbb1..HEAD → (running)
NEXT: fix round (sonnet) if findings; /feature-done (plan → completed/, ledger archive); push; PR; CI; merge ask + tour-skill ask in ONE dash ask. Kit stub (tools/reference-engine/vite.payoff.config.ts:13 + stubs/clipRegistry.ts exports) still to repoint to src/compositions/appClips.ts with APP_CLIP_FACTORIES/APP_CLIP_REGISTRY.
Perf after (merged ms): earth-surface 14.6, solar-system 10.1, full-survey 18.1 → no regression (before 15.0 / 10.2 / 18.3). Gate passed.
Dispatch 2 result: review CLEAN (no Critical/Important). 3 Minor doc nits: tour skill RED step names a nonexistent expected-keys list; README core readers 25 → 24; tools/record/README says six standalone clips, there are ten. Ruling: fix all three in this branch (lines this branch rewrote or one-line truths) — cost if wrong: 3 doc lines.
Smoke: shots of #clip=earthFlyout and #tour=grandTour both boot and render (scratchpad clips-smoke-*.png); tour shows its transport controls.
Dispatch 3: fix round (sonnet), one docs commit → (running). THEN: tick DoD, feature-done moves (plan → completed/, ledger → .ledger.md), push -u, gh pr create, watch CI, merge ask in dash.
Dispatch 3 result: fix commit e79077ac7 (3 docs). Ruling: README readers stays 25 — the tours row (17) counts TourId.d.ts by the same recipe, so the clip row counts ClipId.d.ts too; reverted the fix agent 24 in the completion commit.
checkFrameOrder.test passes (22/22) with the local patch reversed; patch re-applied. Suite therefore green for branch code.
Feature-done: all plan boxes ticked; deletion-audit not run separately (pure move, net deletion, whole-branch review covered leftovers). Plan → plans/completed/, this ledger archived beside it.
