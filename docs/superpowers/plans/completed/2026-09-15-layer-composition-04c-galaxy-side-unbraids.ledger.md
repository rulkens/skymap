# SDD ledger — plan: docs/superpowers/plans/2026-09-15-layer-composition-04c-galaxy-side-unbraids.md

Spec: docs/superpowers/specs/2026-09-09-layer-composition-design.md §9(d) P7 (D10, D11, D12).
Worktree: .claude/worktrees/layer-composition-04c · branch worktree-layer-composition-04c · base a4e7fe9b1 · draft PR #722.
Protocol: lean (sdd-execution.md). User rulings at plan start (2026-09-15): parallelism = lean protocol (one worktree, grouped serial dispatches); NO perf gate.

Plan commits: 18f9694d6 (plan), c13f32728 (design-time radar → Rulings 8, 9 folded into the plan).
Pre-flight scan: clean — T1→T2→T3 produce/consume agree (rows tuple → entry.category/priority → pointRow); T4/T5 share only comment edits in pickUniformBytesOf.ts; T6 disjoint. No conflict table needed.

## Dispatches

- D1 (tasks 1–3): sonnet · c13f32728→d3bc36d7f (71f90d3a3 T1, b02deec58 T2, d3bc36d7f T3) · DONE, no report file · deviations: one narrowing cast per site kept (`entry.code as SourceType`, `entry.id as GalaxyCatalogId` — entry base type widens; a typed `id` would be a type cycle through the tuple), galaxyCatalogSelectionRow casts dropped in T1, expandCompanionRows is a two-pass fold (order-independent)
  Task 1: complete · Task 2: complete · Task 3: complete
- D2 (tasks 4–5, review: yes): opus · d3bc36d7f→ab9881a6c (e18f1512d T4, ab9881a6c T5) · DONE, no report file · deviations: io.wesl/renderer headers cut to budget ('auto'-layout landmine re-homed beside createPipelineLayout); parity test builds its own stub device
  Task 4: complete (e18f1512d, review clean) · Task 5: complete (ab9881a6c, review clean, 3 minors)
  Task 5: minor (deferred): milkyWayPickMinSizePx.ts:8-15 13 comment lines for one constant, second docblock restates header · :11 refactor narration ('used to give') → timeless · milkyWayPickRenderer.test.ts:112-140 pins the 96-byte upload but not the target buffer/created size
  Adjacent (pre-existing, reviewer): galaxyPointRenderer.ts:225 comment says 'Pack 176 bytes', UNIFORM_BYTES is 192 — candidate for the final fix round (one-word fix)
- D3 (task 6, review: yes): opus · ab9881a6c→a7ec070a5 · DONE, no report file · deviations: 24 ResolveDeps fixtures (brief said 11), composeSelectionRows overrides spread ...deps.catalogs, wireInput.test stub field renamed
  Task 6: implemented
  Adjacent (pre-existing, D3): src/@types/engine/data/GalaxyStore.d.ts:2 imports '../../data/GalaxyCatalog' which does not exist → type silently any under skipLibCheck. ASK USER.
  Ruling: task 6's tagged mid-branch review is folded into the final whole-branch review (same seat, given the task-6 brief + spec D10 explicitly) — a separate seat minutes before the final review adds no evidence — cost if wrong: a D10 defect found one review later, same fix round.
- FINAL REVIEW: fable · package review-a4e7fe9b1..a7ec070a5.diff · DONE → FIX-THEN-LAND (0 critical, 2 important, 7 minor; report final-review.md). Task 6: SPEC ✅ QUALITY approved.
  Task 6: complete (a7ec070a5, review clean)
  Ruling: final-review #2 — the one-line GalaxyStore.d.ts import fix rides this PR (Task 6 made `catalogs.get` degrade to `any` through it); the nine-sibling `.d.ts` sweep is an adjacent ask to the user, not this PR — cost if wrong: one line to revert.
  Ruling: final-review #8 — apply the cast-free shape (`GalaxyCatalogRowEntry = (typeof GALAXY_CATALOG_SOURCE_ROWS)[number][1]`, typed on pointRow / wireGalaxyCatalogSourceSlot, four casts + comment deleted) — same derivation idiom as GalaxyCatalogId, fewer lies in the type system — cost if wrong: one type file and two signatures to revert.
  Ruling: `galaxyPointRenderer.ts:225` "176 bytes" comment stays out of this PR (not in the branch) — adjacent ask to the user.
- FIX ROUND (final-review #1–#9): opus · a7ec070a5→ee00fc63e · DONE (23 files +69/−248; .d.ts headers ≤5 lines, three still marginally above the half-code ratio because the kept lines are landmines — accepted)
- ADJACENT (user: fix 1 and 2): controller inline · 3b97124da · 16 @types imports repointed (GalaxyCatalog ×12, Vec3, ScalarFieldFrameKind, StructureInfo, RenderScheduler) + 'Pack 176 bytes' → UNIFORM_BYTES; tsgo --skipLibCheck false: 0 src errors; typecheck:fast clean
  Landing: CI on 3b97124da pending; user spot-check pending (dev :5177); deletion-audit SKIPPED per user ruling 2026-09-14 (audit once at the feature's /feature-done = PR-D)

Task-list artifact: https://claude.ai/code/artifact/7335ae96-224b-4f7d-8e2d-2e50e78f0376 (v1 at start; republish at landing)
Ruling: plan Ruling 3 (no shortName; slot named `${id}-points`, famous → `famousGalaxy-points`) — CONFIRMED by user 2026-09-15 — cost if wrong: one field on nine entries + one slot-name line.
Attestation 2026-09-15 (user): structure rings ✅, Milky Way pick ✅, tier swap ✅, offline synthetic fallback NOT TESTED (user: fine).

- USER follow-up: tuple-indexed GalaxyCatalogId/RowEntry replaced by GalaxyCatalogRegistryEntry (Extract over SOURCE_REGISTRY), GalaxyCatalogSourceType derives from it too; a8b010d2d + 6583cf2bf; typecheck + 7 test files green.
- USER follow-up: milkyWayPickRenderer — header cited a non-existent test (now: the renderer test); byte-offset constants inlined then RESTORED per user (named constants stay, no magic values) · b93ca01d9 + 8068d2470; CI green.
  Landing 2026-09-15: user MERGE APPROVED at 8068d2470 (CI green, main unmoved at a4e7fe9b1). Sequence: plan → plans/completed/ + this ledger copied beside it (spec STAYS in specs/, shared with 04d) → squash-merge #722 → artifact republish → wt-close → memory. Deletion audit deferred to PR-D /feature-done.
