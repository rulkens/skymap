# Deletion audit — PR #678 tail (c4de2d39b..bfa77e980, 16 commits)

Stance: a less capable model wrote this diff; surplus is presumed until proved
load-bearing. Every candidate below was verified by grep over `src/ tools/ tests/
docs/` and, for comment budgets, by a per-file comment/code line count. Rows the
brief fenced (`meshAssets.generated.ts` fields, `BodyStore.meshBodies`,
`sunVisibleFraction` annular guard, mm radius rung, `buildMeshes` tests) and every
row of the earlier audit
(`deletion-audit-69eede86f..82fa5ab8a.md`, now at
`docs/superpowers/plans/completed/2026-09-10-mesh-bodies-02-feature.deletion-audit.md`)
were not re-litigated.

**Headline: this range is lean.** +1671 / −647 over 98 files, and it is mostly a
fix wave plus four extraction refactors the SDD ledger records as *user-directed*
(`progress.md:380,382,383`). There is no dead export, no unreachable branch, no
orphaned module, and no unused import (checked by hand on every file whose type
surface changed). What is left is **prose over budget** and **two restatement
tests**. Realistic net removable: **≈156 LOC**, of which ≈77 is safe-now and ≈55
of the rest is a *pre-existing* header this range merely inherited.

---

## SAFE-NOW (pure deletion, no behaviour change) — 3 items, ≈77 LOC

### S1. `tests/utils/orbit/apoapsisMpc.test.ts` — delete the whole file. **−29 (tests)**

A 29-line file testing a 1-line function, `a·(1+e)`.

- Case 2 (`e = 0` ⇒ result is `a`) is a pure formula restatement — `testing.md`'s
  named non-test.
- Case 1 (`a = 2, e = 0.967` ⇒ 3.934) restates the same expression with different
  numbers.

Already covered, at the only call site that matters:
`tests/utils/orbit/orbitReachByRegion.test.ts` feeds `a = 1e-10, e = 0.5` and
`a = 3e-9, e = 0.5` and asserts `1.5e-10` / `4.5e-9` — hand-computed apoapses that
fail on `a·(1−e)`, on `a·e`, on a bare `a`, and on a sign slip. Verified there is
no third consumer: `apoapsisMpc` is imported only by
`src/utils/orbit/orbitReachByRegion.ts`.

Keep `src/utils/orbit/apoapsisMpc.ts` itself — it exists because
`orbitReachByRegion` moved into `src/utils/orbit/`, where the one-symbol-per-file
rule forbids a second export.

### S2. `tests/utils/scene/hostSkyFraction.test.ts` — drop cases 1 and 3. **−8 (tests)**

Of three cases only the middle one can fail on a real bug:

| case | verdict |
| --- | --- |
| `hostSkyFraction(R, R) === 0.5` | the `dist > R ? R/dist : 1` clamp boundary — `testing.md` bans clamp-boundary tests |
| `…(R, R + 400km) ≈ 0.3307` | **keep** — this is the one that fails if the old Earth-shaped `0.4` constant is ever reintroduced, which is the whole reason the helper exists |
| `…(R, 1.5e11) ≈ 0` | the `s → 0 ⇒ f → 0` limit; no bug survives case 2 and fails this |

### S3. Comment budget — prose over the ≤10-line-header / ≤half-the-code rule. **−40 (src, prose only)**

Measured per file (blank lines excluded). Every row below is a file this range
**created or grew**; `hdr` is the module header's line count.

| file | hdr | cmt/code | over | what to cut | ≈ |
| --- | --- | --- | --- | --- | --- |
| `src/services/engine/frame/near0OverlayClip.ts` | 11 | 13/8 | +9 | the header is a near-verbatim restatement of the `docs/RENDERER.md` bullet **this same range added** (the 31 m ⇒ `w≈1e-21`, 1e-20 floor ≈309 m, NDC-invariant rescale, label-em + ring-pin consumers). `comments.md`: past budget it "belongs in the spec/plan — link it rather than inlining it". Keep ~4 lines + a RENDERER.md pointer | −7 |
| `src/utils/scene/hostSkyFraction.ts` | 8 | 10/4 | +8 | keep the solid-angle identity and the NaN-clamp *why*; drop "Half the sky from the surface, ≈0.331 …, → 0 far out" — three numbers the test now owns | −4 |
| `src/data/mesh/meshBodyUniformLayout.ts` | 7 | 8/2 | +7 | 8 comment lines for 2 constants; the "176 bytes" doc restates `44 * 4` | −4 |
| `src/utils/camera/pinInsideNearPlane.ts` | 8 | 10/8 | +6 | the "threshold is the near plane in THAT vp's clip units, which for the NEAR0 overlays are metres" sentence is the **third** copy of the `near0OverlayClip` fact | −3 |
| `src/data/mesh/meshVertexSlots.ts` | 10 | 10/11 | +5 | the "which is also what every other body renderer — earth, texturedBody, cloudShell — binds" survey | −4 |
| `src/services/engine/frame/passes/near0SelectionRingPass.ts` (draw body) | — | — | — | the 6-line rescale comment at the `rebasedVp` line restates `near0OverlayClip` a fourth time; keep only the shared-with-COSMO clause, which is the *local* why | −4 |
| `src/utils/orbit/apoapsisMpc.ts` | 6 | 6/4 | +4 | the "summed along a focus chain it bounds every orbit point" clause is `orbitReachByRegion`'s job to say | −2 |
| `src/data/bodies/trailElements.ts` | 6 | 6/7 | +3 | the mesh-body ruling note now also sits in `orbitTrailConstants.ts` and the spec | −2 |
| `src/utils/orbit/orbitReachByRegion.ts` | 13 | 14/23 | +3 | header 13 > 10 | −2 |
| `src/data/bodies/orbitTrailConstants.ts` | 8 | 12/4 | +10 (5 pre-existing) | the CULL_PX/FULL_PX block is a 6-line move-in for 2 constants | −3 |
| `src/utils/scene/subjectOccludedByBodies.ts` | 13 | 18/32 | +2 | header 13 > 10 | −2 |
| `src/@types/scene/HostFrameSphere.d.ts` | 4 | 4/5 | +2 | 4-line header on a 2-field type | −1 |
| `src/@types/rendering/MeshResources.d.ts` | 5 | 5/8 | +1 | — | −1 |
| `src/services/engine/frame/drawableMeshBodies.ts` | 10 | 10/19 | +1 | — | −1 |

No behaviour, no tests, no risk. The recurring theme is one fact —
NEAR0's clip rescale — written out in full in **four** places
(`RENDERER.md`, `near0OverlayClip.ts`, `pinInsideNearPlane.ts`,
`near0SelectionRingPass.ts`) plus two type docblocks
(`Label2DProjection.d.ts`, `gpuHandleRegistry.ts`). One canonical home, five
pointers.

**SAFE-NOW total: ≈77 LOC (tests 37, src prose 40).**

---

## NEEDS-RULING — 4 items

### R1. `composeMeshMvp` re-copies `composeBodyMvp`'s 18-line Mat3→Mat4 hand-embed, verbatim. **≈ −24 net.** Recommend: DO IT.

`src/utils/camera/composeMeshMvp.ts:20-38` is a character-for-character copy of
`src/utils/camera/composeBodyMvp.ts:113-138` — the same 16-element `Float64Array`
literal and the same landmine comment, which openly says so ("Same trap
`composeBodyMvp` documents"). There is no shared helper; grep for `fromMat3` /
`mat4FromMat3` across `src/` returns nothing.

Extract `mat4dFromMat3(m: Readonly<Mat3>): Float64Array` to `src/utils/math/`:
−20 at `composeMeshMvp`, −26 at `composeBodyMvp`, +22 for the file and a focused
test ⇒ **≈ −24**, and the "wgpu-matrix's mat3 is a 12-float PADDED layout / a
transpose mirrors the body with no compiler check" trap stops living in two
places that must be fixed together.

Ruling needed because `composeBodyMvp` is *outside* this range — taking the win
means editing a pre-existing file (its round-trip test covers that half). The
ledger's recorded ruling ("composeMeshMvp went to utils/camera — accepted",
`progress.md:386`) settled the helper's *location*, not the duplication, so this
is not fenced.

### R2. `near0SelectionRingPass.ts`'s 69-line module header. **≈ −55 prose.** Recommend: separate comment-audit commit, NOT this PR.

113 comment lines against 63 code lines, header 69 — seven times the budget.
Measured at the base commit `c4de2d39b` as **hdr 69 / cmt 113 / code 63**, so this
is *pre-existing debt this range inherited*, not its own (the range's net effect
on the file's comment count is +1). I flag it only because the very convention
bullet it violates lands in `CLAUDE.md` in this range, and `/feature-done` will
look at the branch.

The four `##` sections (slab partition + writeBuffer race, f64 rebase seam,
CPU-side ringRadiusPx, live-body centre) are genuine landmine material. Ruling
needed on where they go: the completed spec, `docs/RENDERER.md`, or stay.
Recommendation: **park it** — a 55-line prose move on a pass file the user is
about to eye-check is the wrong risk/reward for this PR; backlog it.

### R3. The occluder-sphere shape is restated four times. **Net +9 LOC to fix.** Recommend: SKIP as a deletion; backlog if the drift matters.

`{ readonly positionMpc: Readonly<Vec3>; readonly radiusM: number }` appears as an
identical `type Occluder` alias in `src/utils/scene/subjectOccludedByBodies.ts:18`
(new here) **and** `src/utils/scene/selectOccluderSpheresKm.ts:17` (pre-existing),
and twice inline in `src/services/engine/frame/sceneOccluderBodies.ts:28,39` (new
here). A shared `@types/scene/OccluderSphere.d.ts` removes three restatements but
costs a ~9-line file — an entanglement win, not a leanness win. Reported honestly
as such rather than padded into the removable total.

### R4. `sceneOccluderBodies` runs up to 3× per frame, un-memoised. **0 LOC.** Recommend: leave; measure before touching.

New consumers this range: `produceSceneBodyCaptions` (every caption, every frame),
`near0SelectionRingPass.draw`, and `sceneOccluderSpheres` — each calls it fresh
and each allocates a new array of ~10–20 objects, while its own two inputs
(`sceneBodyPartition`, `positionedVisibleStars`) are per-`ctx` memoised. The fix
is an *addition* (a `WeakMap<ReadyFrameContext, …>`, ~4 lines), so it is not an
audit finding; noted because the leanness seat should say when a diff added a
per-frame cost, not only when it added lines. Per the `perf` skill: measure first.

---

## KEEP-considered (looked at, stays)

- **The `meshBodyRenderer` split into four files** (`MeshResources.d.ts` 13,
  `meshVertexSlots.ts` 23, `meshTextureSlots.ts` 17, `meshBodyUniformLayout.ts`
  12 = 65 new lines to delete ~45 from the renderer; net **+20 LOC and +4 files**,
  and `MeshResources` has exactly one consumer). This was the range's most
  bolt-on-looking commit, and the pass-file-purity convention it invokes names
  only `src/services/engine/frame/passes/`. **Fenced**: `progress.md:383` records
  it as an explicit user instruction to the format-v2 agent. Not re-litigated.
- **`drawableMeshBodies.ts`, `pinInsideNearPlane.ts`, `nearestSphereFaceM.ts` +
  `HostFrameSphere`** — extractions mandated by the user's binding pass-file-purity
  ruling (`progress.md:380,382`). The files' existence is not a finding; only
  their prose is (S3).
- **`apoapsisMpc.ts`** (the module, not its test) — the one-symbol-per-file rule
  for `src/utils/` forces it out of `orbitReachByRegion.ts`.
- **`passFilePurity.test.ts`** (92 lines) — the ratchet *is* the deliverable; its
  `glintBandClass` / `labelPickQuads` / `sceneBodyPickId` rows are recorded
  follow-up moves, not debt this audit should close.
- **`frameContext.meshBodyHost.test.ts`** — 90 lines for one boolean assertion,
  but it is the only pin on the host re-admit path, and the bulk is
  `deriveFrameContext`'s fixture surface, not the test.
- **`nearestSphereFaceM.test.ts`** — `Infinity` for the empty set is the exact
  correctness hinge of `Math.min(hostNear, nearestSphereFaceM(eye, attached ?? []))`;
  the negative-inside case is why `MIN_NEAR_M` floors it. Both load-bearing.
- **`pinInsideNearPlane.test.ts`** — all four cases kept: the behind-the-eye case
  is the negative-ratio fold landmine, the untouched-path case discriminates a
  comparison flip, and the off-axis case is the depth-vs-length distinction the
  helper exists for.
- **`subjectOccludedByBodies.test.ts`** — five distinct failure stories (closed
  segment past the subject, body behind the eye, off-axis miss, self-containment).
  None is a mirror.
- **`sceneOccluderSpheres.test.ts`** mesh case including its `toBe(false)` control
  — the control is what proves `data.bodies.meshBodies` decides the outcome
  rather than the whale being picked up elsewhere.
- **`meshBinaryFormat.test.ts` hand-built `DataView` fixture vs
  `writeMeshBinary.test.ts` round-trip** — prior audit trap #2; still holds under
  v2 (the round-trip alone passes if both sides share a wrong layout).
- **`labelRenderer`'s `LABEL_DATA_BYTES` 64 → 80** — 12 bytes of padding per label
  is WGSL struct alignment (68 rounds up on the vec4 align), not slack.
- **`MESH_BODY_UNIFORM_BYTES`** — derived from `_FLOATS`, but read at two sites in
  `meshBodyRenderer` (`minBindingSize` and the buffer size); inlining `* 4` twice
  is worse than the named constant.
- **`state.data.bodies.meshBodies`** — `frameContext.ts` becomes its **second**
  consumer here (the host re-admit gate). Flagged so the prior audit's #7
  ("delete the store arm, `sceneBodyPartition` imports the table directly") is
  re-priced before it is ruled: it now costs two call-site edits, not one.
- **The splash credit drop** (`0a5..`, −31 lines) — verified the CC BY 4.0
  attribution survives outside the bundle in `ATTRIBUTIONS.md:481`,
  `README.md:87`, `data/raw/meshes/whale/README.md:32` and
  `data/raw/meshes/petunias/README.md:54`. No licence exposure.
- **Format v2's half-delivered payoff** (doc accuracy, 0 LOC): `decodeMesh` takes a
  genuine zero-copy `Uint32Array` view for the index block but still element-copies
  the vertex block into four SoA arrays through an intermediate `Float32Array`
  view — which is correct (the renderer binds one buffer per attribute), but the
  module header and the spec both say "decode as typed-array views over the file
  buffer rather than per-element `DataView` reads" as if it applied to both blocks.
  Reword if S3 is taken; nothing to delete.
- **No dead code found**: every new export has ≥1 non-test consumer (`pickTarget`,
  `occludeWeight` ×2, `NEAR0_OVERLAY_CLIP_SCALE`, `near0OverlayVpF32`,
  `HostFrameSphere`, `MeshResources`, `MESH_VERTEX_SLOTS`, `MESH_TEXTURE_SLOTS`,
  `TRAIL_ELEMENTS`, `ORBIT_REACH_BY_REGION`, `captionRevealM`, `revealBand`,
  `drawableMeshBodies`, `sceneOccluderBodies`, `hostSkyFraction`,
  `subjectOccludedByBodies`, `composeMeshMvp` — all verified by grep). No import
  went stale across the `HostFrameSphere` / `Vec3` swaps in `slabs.ts`,
  `frameContext.ts` or `near0SelectionRingPass.ts`; `BodyInfo.description`'s
  removal left no orphan reader in `src/`.

---

## Ranked (LOC × confidence)

1. **S3** comment-budget trims — ≈40, prose only, no risk
2. **S1** `apoapsisMpc.test.ts` — 29, covered by `orbitReachByRegion.test.ts`
3. **R1** shared `mat4dFromMat3` — ≈24 net, high confidence, second-site ruling
4. **S2** `hostSkyFraction.test.ts` clamp/limit cases — 8
5. **R2** `near0SelectionRingPass` header — ≈55 but pre-existing; recommend park

**Net removable: ≈156 LOC — safe-now ≈77 (tests 37 / src prose 40), needs-ruling
≈79 (of which ≈55 is inherited, not this range's).**
