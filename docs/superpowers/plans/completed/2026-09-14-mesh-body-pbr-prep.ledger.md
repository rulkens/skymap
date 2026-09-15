# SDD ledger — plan: docs/superpowers/plans/2026-09-14-mesh-body-pbr-prep.md

Branch worktree-mesh-body-pbr, draft PR #708. Plan commit 2b6f56591 (BASE for tasks 1–3).
Spec: docs/superpowers/specs/2026-09-12-mesh-body-pbr-design.md.

## User rulings (2026-09-14)
- Accepted all five plan-time rulings: P2 without bindProbe/setEnvBrdfLut; ONE probe capture row; six faces + prefilter per frame, one command buffer per face; probe roster = sky blit + host only; P4 keeps Metallic 0 / Roughness 0.7.
- Parallelism: max-safe — tasks 1, 2, 3 in parallel isolation worktrees, cherry-picked onto this branch in task order; task 4 after (user-gated: Blender).
- PERF GATES SKIPPED for this effort (user, 2026-09-14) — applies to the feature plan's task 11 too.
- Implementers skip USER-RUN visual steps; the visual gate is batched after tasks 1–3 land (dev server in this worktree).

## Pre-flight conflict scan
| pair | shared surface | finding |
|---|---|---|
| T1 × T2 | meshBody/fragment.wesl | T1 edits the sampler binding line only; T2 edits the pbrDirect call (~:50) + header sentence. Disjoint hunks; cherry-pick order T1 → T2. |
| T1 × T3 | none | — |
| T2 × T3 | none | — |
| T3 × T4 | meshAssets.generated.ts | T3 hand-writes it; T4's build-meshes truths it up. Sequential by design. |
| each task self-consistency | tests vs code | T1 test names match the layout split; T3 round-trip test pins its own hand edit; T2 has no unit test (WGSL type errors surface only in the browser) — accepted, visual gate covers it. |
Clean; no rulings needed beyond the above.

## Progress
- Task 1 (P2): implementer DONE on worktree-agent-ab3d0eb64040c89b8 30d0c5cb8; cherry-picked as de5db431a; review dispatched (package review-a2b2c6ca2..de5db431a.diff). Visual gate pending (batched).
- Task 2 (P3): implementer DONE on worktree-agent-a9e000484f8a9347f 26bf88704; cherry-picked as 2e7df3891; review dispatched (package review-de5db431a..2e7df3891.diff). Agent worktree + branch removed. Visual gate pending (batched).
- Task 1 (P2): complete — review APPROVED A+B, 0 blocking, 4 minor (d.ts header 12 lines; history-flavoured comment meshBodyRenderer.ts:45-48; mirror assertion test:99-102; unused setVertexBuffer stub test:44-46) → deferred to the whole-branch fix wave. Review: scratchpad/task-1-review.md.
- Task 3 (P5): implementer DONE on worktree-agent-a83215466497f3b0c 02f73f9fd; cherry-picked as 9247dd4bb; review dispatched (package review-2e7df3891..9247dd4bb.diff). Agent worktree + branch removed. Implementer concerns: meshFetcher has no test (typecheck-only); one `as Record<MeshTextureField, ImageBitmap>` cast; normalMapSubstituted left in completed/ archives + spec.
- Task 2 (P3): complete — review APPROVED A+B (hand-typechecked WGSL), 0 blocking, 5 minor (pbr.wesl:17-18 surplus half-clause; earthSurfaceParams.ts:29 prose for the feature; 3 pre-existing) → fix wave. Review: scratchpad/task-2-review.md.
- VISUAL GATE (T1–T3) PASSED — user attested 2026-09-14 on :5179 (rover, Voyager, Earth glint, console clean).
- Task 4 (P4): baseline bakes run by the controller (Blender at /Applications) with the unmodified script → .superpowers/pbr-p4-baseline.sha256; all 8 hashes IDENTICAL to the main checkout outputs from #693 (determinism confirmed). Implementer dispatched for the script refactor (isolation worktree).
- Task 3 (P5): complete — review APPROVED A+B, 0 blocking, 11 minor (meshTextureSlots.ts header over budget 8/11; MeshTextureField.d.ts 5/1; buildMeshes.ts:417-418 literal suffixes in a comment; :500-504 find(...)! re-derives albedo path; quote helper exported from meshAssetRowFields.ts → tools/utils) → fix wave. Open for user: `substituted` has no src/ reader (provenance-only, spec T1 accepted that cost). Review: scratchpad/task-3-review.md.
- Task 4 (P4): implementer DONE_WITH_CONCERNS on worktree-agent-ac5f75caa4537b916 f33527e5c (base 059623802 — origin/main moved); cherry-picked as ab11a9455; agent worktree + branch removed. Concern: new `image.colorspace_settings.name = colourspace` line is the first suspect if a PNG hash differs. Gate rerun (4 bakes + shasum -c) running in background; review dispatched (package review-9247dd4bb..ab11a9455.diff).
- Task 4 (P4) GATE PASSED: refactored-script rerun → shasum -c 8/8 OK; build-meshes (scratch outDir, .superpowers/runBuildMeshesScratch.ts) → git tree clean (T3 hand edit exact), 24/24 public outputs hash-identical to main public/data/meshes. Awaiting review.
- Full suite on ab11a9455: typecheck clean; 3 failures in initGpu.hdrCapabilityWiring (mock device lacked createBindGroup, T1 now mints the global group at factory time) → fixed by the controller (test-only), suite otherwise 9259 passed.
- Task 4 (P4): complete — review APPROVED A+B, 0 blocking, 8 minor (colorspace_settings line is the one residual: inert on stock OCIO) → fix wave. Review: scratchpad/task-4-review.md.
- ALL 4 TASKS COMPLETE. Next: fix wave (one implementer, shared tree) → final whole-branch review (fable) ∥ deletion audit (opus) → /feature-done prep plan → feature plan SDD.
- USER RULING: no deletion audit on the prep plan (audit once at the feature /feature-done). Next after fix wave: final whole-branch review only → /feature-done prep → feature SDD.
- Fix wave landed 5f26734c5 (10 applied / 15 skipped, report scratchpad/prep-fixwave-report.md). Final whole-branch review dispatched (fable). Voyager prebake rerun for the post-fix-wave python log change → shasum check.
- Final review (fable): CHANGES REQUIRED — B1 five READMEs still said normalMapSubstituted → fixed by controller with M1 quote header (commit above); M3 = P4 verified-run note rides the squash message; M5 spec prettier-dirty pre-existing (left). Remaining minors are notes. Next: /feature-done prep.
