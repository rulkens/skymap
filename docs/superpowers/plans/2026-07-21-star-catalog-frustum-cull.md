# Star-catalog node-level frustum cull

## Goal

Cut the survey (Gaia bin) star pass's dominant GPU cost by skipping octree nodes
that fall entirely outside the view frustum. At the star-field pose only 24.7% of
the 1.46M walked instances are on-screen, yet the omnidirectional octree walk
(`walkStarOctreeCut`) submits all of them — there is no frustum test anywhere
between the walk and the GPU. A CPU-side node-level cull in the renderer's
existing per-node pack loop is projected to drop `hdr·NEAR0` from ~9.6 ms merged
to ~3.3 ms and TOTAL from ~12.8–14.3 ms to ~6.5–7 ms (120 fps target ≤ 8.3 ms).

## Architecture

The cull lives in the two star renderers' existing per-node pack loops
(`starCatalogRenderer.draw`, `starCatalogPickRenderer.draw`): a node whose
bounding sphere is fully outside any frustum plane is simply not packed — it
never enters `nodeParams`/`prefix`, never counts toward `totalInstances`, and the
bind group is sized to the survivor count (draw skipped entirely if zero survive).
Two new pure leaf utils do the geometry (Gribb–Hartmann plane extraction, sphere
vs frustum). The `starCatalogLayer` extracts the six planes ONCE per frame from
the exact rebased view-projection the GPU clips against, so culling is visually
lossless. Fades and the octree walk are untouched — culling gates only draw
submission, never cut membership, so panning never fade-pops.

For agentic workers: REQUIRED SUB-SKILL superpowers:subagent-driven-development.
Each task is TDD (failing test first) and ends with a scoped commit.

## Ground preparation

None needed — the cull slots into each renderer's existing per-node pack loop
(`starCatalogRenderer.ts:419-442`, `starCatalogPickRenderer.ts:249-270`) plus two
new leaf utils in the established `src/utils/camera/` home. No existing structure
must grow or move; the two `StarCatalog*DrawArgs` types gain two fields each, the
additive change every other draw-arg extension in this subsystem already used.

## Contract facts (verified against source)

- The rebased vp both layers already compute is
  `narrowMat4(rebaseViewProj(view.slab.vp, view.camPos))` — a **column-major**
  length-16 `Float32Array` (`rebaseViewProj.ts`, `narrowMat4.ts:29-31`). Plane
  extraction must read COLUMNS of that layout (row `r` of the math matrix is
  elements `[r, r+4, r+8, r+12]`).
- The camera is the rebase origin, so every node position is already
  camera-relative and the camera sits at the world origin — a node's distance is
  just `length(center)`.
- Node box: `originRelCamMpc[3i..3i+2]` is the box MIN corner; records span
  `[origin, origin+edge)` per axis (`vertex.wesl:294-302`, offsets in `[0,1)`). So
  the bounding-sphere center is `origin + edge/2` per axis and the base
  half-diagonal radius is `edge·√3/2`.
- Leaf dots are fixed-px (`vertex.wesl:336-347`: extent 0 ⇒ `rPxRaw =
  STAR_GLOW_MIN_PX·sizeScale`, `sizeScale = sizePx / STAR_SIZE_REF_PX`), so their
  world spill grows with distance → an ANGULAR margin. Aggregate glows fill the
  box footprint × `sizeScale·glowOverlap` → a multiplicative WORLD margin.
- Constants: `STAR_GLOW_MIN_PX = 1.5`, `STAR_GLOW_MAX_PX = 384`,
  `STAR_SIZE_REF_PX = 2.5` (`lib/starPhotometry.wesl:36-58`;
  `STAR_SIZE_REF_PX` has TS twin `DEFAULT_STAR_SIZE_PX = 2.5` at
  `data/defaults.ts:76`). `DEFAULT_FOV_Y_RAD = 60°` (`cameraFraming.ts:36`).
- Renderer draw already early-returns when `drawCount === 0`
  (`starCatalogRenderer.ts:395`, `starCatalogPickRenderer.ts:233`); the new
  skip-if-zero-survivors guard sits before the params writeBuffer /
  bind-group / `pass.draw` block (`starCatalogRenderer.ts:444-474`,
  `starCatalogPickRenderer.ts:272-303`).
- Test harness: `mockDevice` + `mockPass` (spied `createBuffer` / `queue.writeBuffer`
  / `pass.draw`) — copy the shape from
  `tests/services/gpu/renderers/bodies/starPointRenderer.test.ts:21-46`.

## Cull-radius contract (both renderers, per node `i`)

```
center = (ox + e/2, oy + e/2, oz + e/2)          // e = cellScaleMpc[i]
baseRadius = e * 0.8660254                        // e·√3/2
sizeScale  = sizePx / STAR_SIZE_REF_PX
// leaf (isAggregate[i] == 0): fixed-px dot → angular slack
cullRadius = baseRadius + length(center) * glowMarginAngleRad
// aggregate (isAggregate[i] != 0): box-footprint glow → world slack
cullRadius = baseRadius * max(1, sizeScale * glowOverlap)
cull node  ⇔  sphereOutsideFrustum(planes, center.x, center.y, center.z, cullRadius)
```

Conservative is safe: a false "inside" verdict merely draws an off-screen node
(harmless); a false "outside" would drop a visible node (never allowed — the test
must be `> plane.d` with the sphere ENTIRELY beyond a plane).

---

### Task 1: `frustumPlanesFromViewProj` util

**Files:** `src/utils/camera/frustumPlanesFromViewProj.ts` (new),
`tests/utils/camera/frustumPlanesFromViewProj.test.ts` (new)

**Signature:** `frustumPlanesFromViewProj(vp: Float32Array, out?: Float32Array): Float32Array`
**Behaviour:** Gribb–Hartmann extraction of the 6 clip planes from a
**column-major** mat4 (left, right, bottom, top, near, far), each packed as
`(nx, ny, nz, d)` and NORMALIZED (unit normal, `d` scaled with it) — 24 floats.
Writes into `out` when supplied (allocation-free per-frame reuse) and returns it;
allocates a fresh `Float32Array(24)` otherwise. Didactic module header (why
column-major row extraction, why normalize, the `w ± row` sign convention).

- [ ] Test `extracts six planes from an identity vp` — hand-derive that with
      `vp = identity` the six planes are the unit cube faces (e.g. left plane
      normal `(1,0,0)` d `1`, right `(-1,0,0)` d `1`), asserting a couple of
      components to a tolerance (NOT all 24 — pick the load-bearing ones).
- [ ] Test `normals are unit length` — for a real perspective vp (build with
      wgpu-matrix `mat4.perspective` × a look-at view, dst arg last per project
      convention), assert `hypot(nx,ny,nz) ≈ 1` for all six planes.
- [ ] Test `a point known in front has positive signed distance to the near plane`
      — hand-place a point clearly inside a known perspective frustum and assert
      `nx·x+ny·y+nz·z+d > 0` for every plane (inside ⇒ positive on all six).
- [ ] Test `writes into the out array and returns it` — pass a pre-made
      `Float32Array(24)`, assert the returned reference IS that array (the
      allocation-free contract), not a value-equality mirror.
- [ ] `npm test -- frustumPlanesFromViewProj` → green.
- [ ] Commit: `src/utils/camera/frustumPlanesFromViewProj.ts`,
      `tests/utils/camera/frustumPlanesFromViewProj.test.ts`.

### Task 2: `sphereOutsideFrustum` util

**Files:** `src/utils/camera/sphereOutsideFrustum.ts` (new),
`tests/utils/camera/sphereOutsideFrustum.test.ts` (new)

**Signature:** `sphereOutsideFrustum(planes: Float32Array, x: number, y: number, z: number, radius: number): boolean`
**Behaviour:** true iff the sphere is fully outside AT LEAST ONE of the 6 planes
(`signedDistance < -radius` for some plane) — the conservative cull test. False
negatives are forbidden (never drop a visible node); false positives (keep an
off-screen node) are harmless. Allocation-free. Didactic header stating that
asymmetry.

Build the `planes` fixtures for these tests with `frustumPlanesFromViewProj` from
a **real perspective vp** (Task 1 is already trusted) — assert against
hand-reasoned in/out verdicts, never against a recomputed distance (no mirror).

- [ ] Test `sphere fully inside is not outside` — small sphere at a point centred
      in the frustum → `false`.
- [ ] Test `sphere behind the near plane is outside` — centre behind the camera →
      `true`.
- [ ] Test `sphere far to the left / right / above / below is outside` — four
      cases, one per lateral plane → `true`.
- [ ] Test `sphere straddling a plane is not outside` — centre just outside a
      plane but `radius` large enough to cross it → `false` (the conservative
      keep).
- [ ] Test `camera-at-origin: a sphere at the origin is never outside` — the
      rebased frame puts the camera AT the origin, so a node there is always kept
      regardless of orientation → `false`.
- [ ] `npm test -- sphereOutsideFrustum` → green.
- [ ] Commit: `src/utils/camera/sphereOutsideFrustum.ts`,
      `tests/utils/camera/sphereOutsideFrustum.test.ts`.

### Task 3: visual renderer node cull

**Files:** `src/@types/rendering/StarCatalogRenderer.d.ts` (modify, type at 54-167),
`src/services/gpu/renderers/starCatalog/starCatalogRenderer.ts` (modify, pack loop
419-442, skip-guard before 444),
`tests/services/gpu/renderers/starCatalog/starCatalogRenderer.frustumCull.test.ts` (new)

**Type additions** to `StarCatalogDrawArgs` (append after `aggregateIntensityCap`,
line 166), both `readonly`, with docblocks matching the file's didactic style:
- `frustumPlanes: Float32Array | null` — the 6 packed planes (Task 1 output);
  `null` disables culling (preserves existing callers / tests with no view).
- `glowMarginAngleRad: number` — angular slack per unit distance for a leaf dot's
  fixed-px screen spill (derived by the layer, Task 5).

**Cull wiring** in `draw` (`starCatalogRenderer.ts:419-442`): keep a separate
output cursor (survivors packed CONTIGUOUSLY, cursor ≠ loop index `i`). For each
node, when `frustumPlanes !== null`, apply the Cull-radius contract above
(`sizePx`/`glowOverlap` are already destructured draw args; `isAggregate[i]`
discriminates leaf vs aggregate); a culled node is skipped (not packed, not
prefix-summed, not counted). `ensureScratch`/`ensureDrawBuffers`, the params +
prefix `writeBuffer` lengths, and the bind-group `size:` (445-465) all use the
SURVIVOR count. Before the writeBuffer/bind/`pass.draw` block (444-474): if zero
nodes survive, return without any GPU work. The cull decision stays
allocation-free (no per-node object/array).

- [ ] Test `culls a node whose sphere is fully outside the frustum` — mockDevice +
      mockPass; upload a tiny 2-node catalog (one node placed in front of the
      camera, one far behind); draw with real `frustumPlanes`; assert `pass.draw`
      is called ONCE with instance count = the in-front node's `recordCount`
      (the behind node's records excluded).
- [ ] Test `null frustumPlanes draws every node` — same catalog, `frustumPlanes:
      null`; assert `pass.draw` instance count = sum of both nodes' record counts
      (backward-compat).
- [ ] Test `skips the draw entirely when all nodes are culled` — planes excluding
      every node; assert `pass.draw` is NEVER called (and no params writeBuffer).
- [ ] `npm test -- starCatalogRenderer.frustumCull` → green.
- [ ] Commit: the three files above.

### Task 4: pick renderer node cull

**Files:** `src/@types/rendering/StarCatalogPickRenderer.d.ts` (modify, type at 51-78),
`src/services/gpu/renderers/starCatalog/starCatalogPickRenderer.ts` (modify, pack
loop 249-270, skip-guard before 272),
`tests/services/gpu/renderers/starCatalog/starCatalogPickRenderer.frustumCull.test.ts` (new)

**Type additions** to `StarCatalogPickDrawArgs` (append after `sizePx`, line 77):
the same `frustumPlanes: Float32Array | null` and `glowMarginAngleRad: number`.
The pick path is leaf-only (`isAggregate` packed 0 for every node), so every node
uses the LEAF branch of the Cull-radius contract; `glowOverlap` is not a pick draw
arg and is not needed (leaf overlap is 1). Culling is always safe here — picks are
on-screen by definition.

**Cull wiring** mirrors Task 3 in `starCatalogPickRenderer.ts:249-270`: survivor
cursor, survivor-sized buffers/bind group/writeBuffer, skip the draw if zero
survive.

- [ ] Test `culls a leaf node outside the frustum` — mockDevice + mockPass; two
      leaf draws (one in front, one behind); assert `pass.draw` instance count =
      the in-front node's records only.
- [ ] Test `null frustumPlanes picks every node` — assert full instance count.
- [ ] Test `skips the pick draw when all nodes are culled` — assert `pass.draw`
      never called.
- [ ] `npm test -- starCatalogPickRenderer.frustumCull` → green.
- [ ] Commit: the three files above.

### Task 5: layer wiring (extract planes + derive margin, once per frame)

**Files:** `src/services/engine/frame/passes/starCatalogLayer.ts` (modify,
`drawStream` 697-727 and `drawPick` 778-798),
`tests/services/engine/frame/starCatalogLayer.frustumCull.test.ts` (new)

**Wiring:**
- Import `frustumPlanesFromViewProj` and add a module-level scratch
  `const frustumScratch = new Float32Array(24)` reused by both `drawStream` and
  `drawPick` (main-thread, non-reentrant — the same discipline the rebased-vp
  computation already relies on).
- In `drawStream` (after the `rebasedVp` at 704) and `drawPick` (after 784):
  extract the planes ONCE into `frustumScratch` from that SAME `rebasedVp`
  (`frustumPlanesFromViewProj(rebasedVp, frustumScratch)`), and derive
  `glowMarginAngleRad` once, then pass both through to every `renderer.draw` /
  `pickRenderer.draw` call in the per-source loop (708-725, 786-796). Do NOT touch
  `computeStarCut`/fade bookkeeping.
- **Margin derivation** (contract): `radiansPerPx = DEFAULT_FOV_Y_RAD /
  view.viewportPx[1]`; `leafPxRadius = STAR_GLOW_MIN_PX * (prep.sizePx /
  STAR_SIZE_REF_PX)`; `glowMarginAngleRad = leafPxRadius * radiansPerPx`.
  Conservative round-up is fine (this is slack, not photometry — the
  `STAR_GLOW_MAX_PX` cap may be ignored). Import `DEFAULT_FOV_Y_RAD` from
  `services/engine/camera/cameraFraming`; source `STAR_SIZE_REF_PX` from
  `DEFAULT_STAR_SIZE_PX` (`data/defaults.ts`); `STAR_GLOW_MIN_PX` has no TS home —
  add a local `const` with a "keep in sync with lib/starPhotometry.wesl
  STAR_GLOW_MIN_PX" comment (the WESL/TS twin discipline used across this
  subsystem).
- **Pick-path margin**: the pick pass floors every leaf billboard to a 3.5 px
  clickable footprint (`STAR_PICK_MIN_RADIUS_PX`, `vertex.wesl:230`), so
  `drawPick` derives its margin from `max(leafPxRadius, 3.5)` — the visual
  1.5 px slack would let the cull drop a node whose inflated pick footprint
  still touches the screen edge (unclickable edge star). Same local-const
  keep-in-sync discipline as `STAR_GLOW_MIN_PX`.

**Test** (inject a fake renderer object capturing the draw args; build a minimal
`SlabView` + `PreparedStarCut` with one source that has ≥1 leaf node, and a mock
pass): the load-bearing wiring regression is "planes/margin not plumbed."
- [ ] Test `drawStream forwards extracted frustum planes and a positive margin` —
      assert the captured `frustumPlanes` is non-null with `.length === 24` and
      `glowMarginAngleRad > 0`. (Structural/positivity, NOT a recomputed-plane
      mirror and NOT the exact margin value — margin retuning must not break it.)
- [ ] Test `drawPick forwards the same planes and margin` — same assertion via a
      fake pick renderer.
- [ ] `npm test -- starCatalogLayer.frustumCull` → green.
- [ ] Commit: the two files above.

### Task 6: perf + visual verification

**Files:** none (measurement + user visual pass only).

The dev server stays running (HMR) — do not kill it; in a worktree pass
`--url http://localhost:<port>` from your server's `Local:` line.

- [ ] Run `npm run perf -- --scenario star-field --frames 30` and
      `npm run perf -- --scenario milky-way --frames 30`; quote **MERGED** totals
      ONLY (per-layer numbers carry pass-overhead — see `tools/perf/README.md`).
- [ ] Compare against baseline: `hdr·NEAR0` was 10.3 / 9.6 ms → expect ~3–4 ms;
      TOTAL ~12.8–14.3 ms → expect ≤ ~7 ms. Report the deltas.
- [ ] Ask the USER to visually verify: pan/orbit at star-field zoom watching the
      SCREEN EDGES for glow pop-in (the margin tuning point), and hover-pick a
      star near a viewport edge (pick cull must not drop an on-screen star).
- [ ] Report results; if edge pop-in appears, the margin (Task 5) is the single
      tuning knob — widen `glowMarginAngleRad`.

---

## Out of scope

- **Aggregate-offscreen resolution drop** (half→third res, ~0.9 ms projected) — a
  separate reserve lever, deliberately excluded from this plan.
- **Leaf-capacity / octree-builder retuning** — orthogonal; not touched here.
- **GPU/compute cull, a walk change, or a fade change** — the cull is CPU-side in
  the existing per-node pack loop only; the walk stays omnidirectional and fades
  keep advancing on cut membership (so panning never fade-pops).
