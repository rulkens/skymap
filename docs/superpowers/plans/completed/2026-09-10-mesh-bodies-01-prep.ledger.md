# SDD ledger — plan: docs/superpowers/plans/2026-09-10-mesh-bodies-01-prep.md

Execution branch: mesh-bodies-prep (worktree .claude/worktrees/mesh-bodies-prep, off origin/main 89d716438; plan commit ebf107722).
Parallelism 3 (user ruling): Task 1 in worktree mesh-bodies-prep-t1 (branch mesh-bodies-prep-t1), Task 2 in mesh-bodies-prep-t2; commits cherry-picked onto mesh-bodies-prep in task order.
Spec: docs/superpowers/specs/2026-09-10-mesh-bodies-design.md (in feature worktree whale-petunias-mesh-bodies, commit 546be40f8; not on this branch).

## Pre-flight scan

| pair | produces / consumes | finding |
| 1 × 2 | disjoint file sets (bodies/rotation\* + orientationForBody + deriveBodyStates comment vs bodyPickRows + sceneBodyPickId + resolvePickTable) | clean — parallel-safe |
| 1 self | vi.mock supplies rotationRowById before Step 3 creates it; red-first holds either way | consistent |
| 2 self | round-trip test relies on resolvePick decoding 'sirius'/'s2' to {type:'body'} — depends on unpack arms the plan cites but the scan cannot verify | left to task review |
Task list: harness has no todo tool in this session; this ledger is the task list. Tasks: 1 (P1), 2 (P2).

## Execution

Draft PR #677 opened (mesh-bodies-prep). BASE for both tasks: ebf107722.
Task 1: dispatched (sonnet) in wt mesh-bodies-prep-t1.
Task 2: dispatched (sonnet) in wt mesh-bodies-prep-t2.
Task 1: implementer DONE_WITH_CONCERNS (t1 commit 39181c0b4 → cherry-picked 343c171aa on mesh-bodies-prep); concerns = prettier whole-table reflow skipped (hand-applied edits), fixture pole dec 90 made the brief's x-component assertion a false negative → full-vector distance used. Review dispatched (sonnet), package review-ebf107722..343c171aa.diff.
Task 1: minor (deferred): orientationForBody.ts comment:code ratio ~≥0.5 on an 11-logic-line file (header within 10; content is derivation + landmine) — final review triages.
Task 1: complete (commits ebf107722..343c171aa, review clean)
Task 2: implementer DONE_WITH_CONCERNS (t2 commit 2f979797b → cherry-picked d23cc0a2d); concerns = stale PICK_SEEDS_BY_BODY_ID mentions in comments (starPickId.ts:8, starPickId.test.ts:29, sceneSStars.test.ts:35) left per "starPickId untouched"; scan order now registry-code order (safe via disjointness test). Review dispatched (sonnet), package review-343c171aa..d23cc0a2d.diff.
Task 2: minor (deferred): stale `PICK_SEEDS_BY_BODY_ID` mentions in comments — starPickId.ts:8, starPickId.test.ts:29, sceneSStars.test.ts:35 (files outside task list). Ruling: comment-only fix in the final fix wave; "starPickId.ts unchanged" in the DoD means code/behaviour, a comment naming a deleted symbol is a defect — cost if wrong: a 1-line comment diff in a file the DoD lists as untouched.
Task 2: minor (deferred): DoD manual smoke (disc pick, caption pick, planet turns) not run — user does it at PR gate (dev server needed).
Task 2: complete (commits 343c171aa..d23cc0a2d, review clean)
Final review: dispatched (opus), package 89d716438..d23cc0a2d.
Final review (opus): behavioural no-op verified id-by-id; With fixes. Findings: #1 Important starPickId.ts:8 stale PICK_SEEDS_BY_BODY_ID; #2 same in starPickId.test.ts:29, sceneSStars.test.ts:35; #3 live backlog details near-field-stars…:28 (PICK_SEEDS_BY_BODY_ID.sun), planet-rendering-follow-ups:11 (rotationById); #4 orientationForBody header 2 surplus lines; #5 identity-copy comment above wrong stmt; #6 vi.mock spread actual; #7 BODY_ENTRIES → PACKABLE_BODY_ENTRIES; #8 tick plan checkboxes; #9 lost doc notes — Ruling: leave (pinned by tests) — cost if wrong: one reader re-derives the S-star routing hazard.
Ruling: comment-only edit to starPickId.ts allowed despite DoD "unchanged" (intent = behaviour/pack path) — cost if wrong: 1-line diff in a DoD-listed file; PR body flags it.
Fix wave: ONE dispatch (sonnet) for #1-#8, FIX_BASE d23cc0a2d.
Final fix wave: DONE 09be1f119 (#1-#8), 90 files/578 tests green, tsc clean. Scoped re-review dispatched (sonnet), package review-d23cc0a2d..09be1f119.diff.
Re-review: all 8 ADDRESSED, no new breakage; residual note: orientationForBody.ts ratio ~0.82 (9 comment / 11 code), improved from 1.0 — Ruling: leave (header 7 ≤ 10; content = derivation + landmine) — cost if wrong: two comment lines a later editor trims.
Branch pushed 09be1f119; PR #677 marked ready. OPEN: user manual smoke (DoD) → /feature-done (archive this ledger to docs/superpowers/plans/completed/2026-09-10-mesh-bodies-01-prep.ledger.md, move plan) → user squash-merges → feature branch rebases onto main.
/feature-done: suite 8185 green, typecheck clean, 15/15 boxes, no TODOs, parity OK, smoke ATTESTED by user (disc/caption/turn). Deletion audit (opus): no removable executable code; safe-now applied 8a070a9ab (src −59 comment lines, tests −24 restatement tests, +2 trap guards). NEEDS-RULING left to user: R1 radii restatement tests + findPlanet helper (−12); R2 starPickId S-star branch now a byte-identical second route (0 LOC, feeds backlog); R3 stale name in dated research doc; R4 seedIndexOfBody.ts 35-comment/3-code header (out of diff, −17).
Plan → completed; ledger archived. READY.
