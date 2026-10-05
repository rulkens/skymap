# Ledger — 2026-09-19-layer-composition-05c-zoa-layer

Plan: docs/superpowers/plans/2026-09-19-layer-composition-05c-zoa-layer.md
Branch: worktree-layer-composition-05c-layer (base 1b4855fc0), plan commit 0936469c1
Protocol: lean SDD, serial, no perf gate.
Rulings 2026-09-19: ZoA tuning above Milky Way tuning OK; shell passed as one object (backlog item shrinks to its label em-height half).

## Dispatches
- D1 (Tasks 1-2): DONE e3f5be5cf, e9caa03ab (9017 tests green; zoneOfAvoidancePass.test args updated)
- D2 (Task 3): DONE caa0a2803 (agent stopped on startLoop fixture: FRAME_ORDER zoa target in ZoA-less composition; controller fix d4bea6d43 = checkFrameOrder skips target of render line with no present pass, mirrors expandFrameOrder draws filter)
- D3 (Task 4): DONE ac67e50b6 (inline; 9067 tests green); pushed
- Task 5 smoke: ASKED user (dev :5175)
- Final review: FIX (0 Critical, 1 Important, 9 Minor; no behaviour regression) → all applied in HEAD except drawPick shell assert (compiler covers). NEXT: user smoke → /feature-done
- Smoke: PASSED (user, 2026-09-19)
- Deletion audit: safe-now 8b70b4685; postBlit ruling (a) applied; checkFrameOrder + shell record kept
- /feature-done: READY → plan + ledger to plans/completed/ (spec stays: umbrella)
