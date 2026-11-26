# SDD ledger — plan: docs/superpowers/plans/2026-11-25-terrain-horizon-shadows-prep.md

Spec: docs/superpowers/specs/completed/2026-11-25-terrain-horizon-shadows-design.md
Branch: feat/terrain-horizon-shadows-prep (base 9e7b682c2)

Pre-flight: parallelism = prep only, serial; perf gate = skipped (shots-unchanged is the gate). Owner, 2026-11-25.
Dispatch 1: Task 1 — opus — base 4f5715860 — running
Note: controller commit aeb2a3d9f (backlog: mesh bodies in terrain shadow) landed during Dispatch 1; docs only, outside Task 1's diff.
Task 1: complete (commits 4f5715860..46c39fbb4) — opus — deviations: extra stream test, frame.test stub, index 404/malformed → 'missing'
Ruling: no Co-Authored-By trailers from here on; strip earlier ones in the squash message — owner's git memory rule overrides the harness reminder — cost if wrong: one attribution line
Review Task 1 (opus): spec ✅, 0 critical/important, 5 minor. Fix round → Task 1 implementer: comment, malformed index → 'failed', isInFlight excludes empty.
Ruling: malformed level index reads 'failed', 404 reads 'missing' — a corrupt deploy must never pass as "nothing baked" once horizon gives missing its own meaning — cost if wrong: a corrupt index retries never instead of never-fetching
Ruling: carry "empty only valid for standalone products" into Task 2 as a lane-row invariant — reviewer's latent trap: empty on albedo/height stalls refinement — cost if wrong: one assertion
Task 1 fix round: 3652a1249 (review fixes) — opus. Task 1 closed.
Dispatch 2: Tasks 2+3 — sonnet — base 3652a1249 — running
Task 2: complete (3652a1249..fba6bb06b) — sonnet. Task 3: complete (fba6bb06b..7b7ac061f) — sonnet. Neutrality verified by controller: all 6 pairs maxdiff ≤ 1.
Ruling (implementer, accepted): gates-cut lane 'empty' → failed + one warn; StandaloneProduct derived from rows via `satisfies`; flattenAtlasRect + ResidentLookupResult extracted.
Dispatch 3: Task 4 — opus — base 7b7ac061f — running
Task 4: complete (7b7ac061f..b02175f24) — opus — neutrality ≤1 step on all 6.
Ruling: fold Task 4's review: yes into the whole-branch review (given Task 4's contract + spec §6 explicitly) — it is the last task, so a separate mid review would re-read the same diff minutes earlier — cost if wrong: none; same reviewer seat, same inputs
Whole-branch review (opus): all 4 tasks spec ✅; 0 critical, 2 important (I1 binding numbers unpinned, I2 duplicate ResidentLookupResult), 7 minor. Fix round → Tasks 2+3 implementer (sonnet).
Ruling: delete fetchForLane + warnedEmpty (gates-cut empty guard) — guards a case neither bake can produce; only mutable lane field; reverses my own earlier ruling — cost if wrong: a zero-byte albedo/height tile stalls refinement under it until noticed
Ruling: keep isInFlight's empty check — keeps the residency contract true for any future reader — cost if wrong: one line
Deletion audit (opus): ~35 test LOC safe-now applied in 0c9b4aa66; 5 rulings asked (ask 2y5F). Full suite 35784 pass, typecheck 0.
Owner rulings (ask 2y5F): keep isInFlight empty guard; move reserved-slots test to textureAtlas.test, shorter; leave renderer bind map; keep TileRead's four kinds; leave surfaceTilesPass night stand-in.
Dispatch 4: reserved-slots test move + completion moves — sonnet — base 0c9b4aa66 — running
Dispatch 4: complete — reserved-slots test moved (545332127); completion moves.
