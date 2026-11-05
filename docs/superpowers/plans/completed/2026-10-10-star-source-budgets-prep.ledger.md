# SDD ledger — plan: docs/superpowers/plans/2026-10-10-star-source-budgets-prep.md
Branch prep-star-budgets, worktree /Users/rulkens/Development/js/skymap/.claude/worktrees/prep-star-budgets, base 85b90bf80 (origin/main). Parallel with the two sibling preps. Perf gate: none (plans say no perf run). Feature spec lives on branch regalade-octree (PR #868); this prep PR ships only its plan.
Ruling: the spec file is not copied into prep PRs — it ships with the feature — so prep reviewers read it from PR #868 — cost if wrong: a reviewer without the spec; mitigated by citing spec §8.3 text in briefs.
Dispatch 1: all tasks, opus, BASE 1f2856fe7, started 2026-10-11
Dispatch 1 done: HEAD 9170b4eb2, ~25 turns, DONE_WITH_CONCERNS (frame.test.ts stub gained catalogs; property renames by hand; starCutInputs.test.ts carries the Task 2 rename)
Review 1 (opus): approve; 3 minors — #2 (doubled word) fixed inline by controller; #1 (`slots` mention in StarSourceBudgets doc) left: the feature rewrites it when `slots` lands; #3 (grill Q9 pointer) pre-existing, left.
Ruling: reviewer declined to trace whether a released-but-still-drawn catalog can exist; the skip at starCutInputs.ts:65 stands on the plan's premise (renderer holds a catalog only after its slot commits) — cost if wrong: a source dropped from the cut for a frame at tier switch, visible as a flicker.
Landing: pushed, draft PR opened, CI watched.
