# Volume raymarch acceleration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`docs/superpowers/specs/2026-08-12-volume-raymarch-acceleration-design.md`](../specs/2026-08-12-volume-raymarch-acceleration-design.md) — read it first; this plan implements exactly its Stages 1–3, nothing beyond.

**Goal:** Replace the scalar-volume raymarch's fixed 128-step, no-skip, no-LOD march
(`scalarVolume/fragment.wesl`) with GPU-built pyramids consulted per step: a display mip
chain (box filter, self-referential) and a small max-value pyramid (TF-adaptive
empty-space skipping) built once at cube upload, plus a cone-footprint LOD that ties
sample density to what's actually on screen instead of camera distance. Then spend
whatever headroom results by raising the volume offscreen's resolution.

**Architecture:** A new GPU-lib primitive (`generateMipChain3d`, sibling of the existing
2D `generateMipChain`) fills 3D-texture mip chains via per-`(level, slice)` render passes
using `GPURenderPassColorAttachment.depthSlice`. `volumeFieldRenderer.ts`'s `uploadCube`
grows the volume texture's own mip chain (box filter) and adds a second, smaller
max-pyramid texture per field (own mips, max filter) bound at a new `group0Bgl` slot.
The per-field uniform grows 256→272 bytes carrying two new scalars the shader consults
for skip/LOD math; everything else is a `fragment.wesl` rewrite. Nothing is precomputed
CPU-side or persisted — pyramids are pure GPU derivations of the uploaded cube, rebuilt
every `upload()` call, matching the SCFD "presentation stays out of the binary" rule.

**Tech Stack:** WebGPU (WGSL via wesl-plugin `?static` imports), TypeScript renderer
code, Vitest for the one pure helper and the mocked-device uniform-packing tests, the
`npm run perf` headless harness for GPU timings, manual visual checkpoints via the dev
server for anything that touches march correctness.

## Global Constraints

- `type` aliases, never `interface`, for every new/modified TS shape.
- Comment budget: module header ≤ 10 lines, comment lines ≤ half the code lines —
  didactic (why/landmine/unit/derivation/cross-file contract), never what. See
  [`docs/superpowers/conventions/comments.md`](../conventions/comments.md).
- **Every task that edits a `.wesl` file: invoke the `wesl-shaders` skill before touching
  it.** Stated explicitly in each affected task below — subagents don't load project
  skills unprompted.
- No test may restate a constant, mirror the source formula, or assert a clamp boundary
  where both comparison operators agree — see
  [`docs/superpowers/conventions/testing.md`](../conventions/testing.md). The one
  legitimate new-test category here is WGSL/TS uniform byte-layout parity (an explicit
  keep-rule in that doc), used in Task 4.
- Stage order in this plan is dependency order, not just narrative order (per the spec's
  Design section): Task 1 gates every renderer edit; Tasks 2→3→4 build the primitives the
  shader tasks (5, 6) consult; Task 7 only makes sense once 5–6 have banked savings to
  spend. File overlap is heavy throughout (`volumeFieldRenderer.ts`, `FieldEntry.d.ts`,
  and `fragment.wesl` are each touched by 3–5 tasks) — this plan is a strictly linear
  dispatch, not a parallel DAG.

## Ground preparation

Per the spec's own Ground Preparation section: every touchpoint is growth at an existing
seam (new `gpu/lib` primitive beside its 2D sibling, a binding added to the renderer's
single shared BGL, a value edit in the render-target table, a new `perfScenarios.ts`
row) — no refactor-ground prep beyond the one item the spec names. **Prep = Task 1
only**: the `volume-inside` perf scenario, because the best existing pose (`local-group`,
1.4 ms) is barely above the harness's ~0.5 ms run-to-run noise floor, so Stages 1–3 would
otherwise ship with no before/after gate. Task 1 must land, and its baseline must be
recorded, before any task below it touches renderer or shader code.

## Task DAG

```
Task 1  volume-inside perf scenario + baseline (PREP — gates everything below)
Task 2  mipLevelCount3d + generateMipChain3d + uploadCube box-mip wiring
Task 3  Max pyramid resident per field (binding 5)
Task 4  Uniform bump 256→272 (voxelSizeLocal, pixelConeTan)
Task 5  Shader: TF-adaptive empty-space skipping        [visual checkpoint required]
Task 6  Shader: cone-footprint LOD + honest step sizing  [visual checkpoint required]
Task 7  Stage 3: raise 'volume' target resolution, measure, keep/revert
Task 8  Wrap-up: docs/RENDERER.md note
```

All eight tasks are strictly sequential (see Global Constraints — file overlap rules out
pipelining reviews across them; a task's review must close before the next task's
implementer is dispatched, per
[`docs/superpowers/conventions/sdd-execution.md`](../conventions/sdd-execution.md)).

---

## Task 1: `volume-inside` perf scenario + baseline

**Why:** The spec's Ground Preparation item. Without a pose that puts the camera inside
the MCPM cube facing dense filaments, Stages 1–3 have no signal above harness noise to
measure against.

**Files:**

- Modify: `tools/perf/perfScenarios.ts`

**Contract — the new row**, following the existing `PerfScenario` shape
(`perfScenarios.ts:42`) and the `clearFocus`-on-non-Earth-target pattern used by
`milky-way-outside`/`galactic-centre` (`perfScenarios.ts:85-123`):

```ts
{
  name: 'volume-inside',
  pose: { target: <Vec3>, distance: <number>, yaw: <number>, pitch: <number>, clearFocus: true },
},
```

- [ ] Start (or reuse) the dev server (`/dev` skill), read its `Local:` port.
- [ ] In the running app, fly the camera to sit _inside_ the MCPM cube's extent with
      dense filament structure filling the frame — not merely near it, since the whole
      point of this pose is to exercise the skip/LOD paths at the "camera inside the
      volume" regime the design doc calls out (this is also the regime where the fixed
      128-step march is currently most wasteful: `tMax - tMin` is small so per-step
      opacity is tiny, per the `fragment.wesl` module header's discussion of the
      inside/outside cases).
  - `deriveVolumeLiveness`/the MCPM slot load threshold gates when the field is even
    resident — confirm the layer is actually drawing (not just camera position) before
    trusting any number; the existing `local-group`/`full-survey` poses are the known-
    working reference for "MCPM is loaded here."
- [ ] Press `l` to log the pose one-liner (see `perfScenarios.ts`'s own module-header
      docstring, "Poses captured live via logState," for the exact mechanism); read off
      `target`, `distance`, `yaw`, `pitch`.
- [ ] Add the `volume-inside` row to `PERF_SCENARIOS`, `clearFocus: true` (a non-Earth
      target needs it, same reasoning as the three existing non-Earth rows).
- [ ] Run the baseline against the **current, unmodified** renderer:
      `npm run perf -- --url http://localhost:<port> --scenario volume-inside --frames 30`
      (flags per `.claude/skills/perf/SKILL.md`). Save the MERGED-median output to a
      scratchpad file — this number cannot be reconstructed once Task 2 starts editing
      the renderer.
- [ ] Record the baseline number in this plan's ledger (or the SDD progress ledger) as
      the reference every later task's before/after compares against.
- [ ] Commit alone (no renderer changes ride this commit).

**Test:** none — this is a data-only change to a fixture file; the harness run above is
the verification.

---

## Task 2: `mipLevelCount3d` + `generateMipChain3d`

**Why:** Both the volume's own display mip chain (this task) and the max pyramid (Task 3) need the same primitive: fill a 3D texture's mip levels 1..N-1 via render passes,
mirroring `gpu/lib/generateMipChain.ts` (2D) exactly except each level is filled
per-`(level, slice)` using `GPURenderPassColorAttachment.depthSlice` instead of one pass
per level.

**Files:**

- Create: `src/services/gpu/lib/generateMipChain3d.ts`
- Create: `src/services/gpu/shaders/lib/mipBlit3d.wesl`
- Modify: `src/services/gpu/renderers/volumeField/volumeFieldRenderer.ts` (`uploadCube`,
  `:216-230`)
- Test: `tests/services/gpu/lib/mipLevelCount3d.test.ts`

**Contract — public TS surface** (mirrors `mipLevelCount`/`generateMipChain` at
`generateMipChain.ts:56-58` and `:66`):

```ts
export function mipLevelCount3d(width: number, height: number, depth: number): number;
export function generateMipChain3d(
  device: GPUDevice,
  texture: GPUTexture,
  filter: 'box' | 'max',
): void;
```

`mipLevelCount3d` = `floor(log2(max(width, height, depth))) + 1` — the 3-argument
generalisation of `mipLevelCount`. `generateMipChain3d` is a no-op for a single-level
texture (mirror the `mipLevelCount <= 1` early-return at `generateMipChain.ts:69`); the
caller (`uploadCube`) is responsible for creating the texture with `mipLevelCount:
mipLevelCount3d(...)` and `GPUTextureUsage.RENDER_ATTACHMENT` set, exactly as
`generateMipChain.ts`'s module header documents as the caller's contract.

**Design note — box vs. max, and internal factoring.** `mipBlit3d.wesl` needs two
`@fragment` entry points sharing one `@vertex` big-triangle (mirror
`shaders/lib/mipBlit.wesl`'s one-file-both-stages layout): `fs_box` does one trilinear
`textureSampleLevel` tap at the parent-space z position between the two contributing
slices (the exact 2×2×2 box filter for the display chain; untouched by the amendment
below — the display chain stays raw values). `fs_max` does explicit `textureLoad` taps
across the 2×2×2 parent footprint, **normalises each tap to deviation space before
reducing** (`dev = abs(sample - u.center) / u.halfRange`), and takes the `max()` of those
— correctness over the max-value pyramid depends on this being a true max in the units
the skip test actually compares against (see Task 3 for why raw-value max isn't safe for
a divergent palette). Because each destination slice needs to know _which_ parent z
position(s) it reduces — information a fullscreen triangle's UV alone can't carry — the
shader needs a small per-draw uniform:

```wgsl
struct MipBlit3dUniforms {
  boxZ: f32,       // fs_box: continuous parent-space z in [0, parentDepth) for one trilinear tap
  srcZLow: u32,    // fs_max: lower parent z slice index this dest slice reduces
  srcZHigh: u32,   // fs_max: upper parent z slice index (== srcZLow at an odd-depth edge)
  center: f32,     // fs_max: deviation center for THIS reduction (0 = identity, see below)
  halfRange: f32,  // fs_max: deviation halfRange for THIS reduction (1 = identity, see below)
};
```

20 bytes, no padding — WGSL's uniform-address-space alignment only forces a 16-byte
multiple on structs containing a `vec3`/`vec4`/`mat4x4` member (this file's own
`VolumeUniforms` is the example: its `mat4x4` fields are why 256/272 land on 16-byte
boundaries). An all-scalar struct's alignment is just its largest member's own alignment
— 4 bytes for `f32`/`u32` — so 5 × 4 bytes = 20 is already valid with nothing left to pad;
the previous 16-byte, 4-field version had one pure-padding `u32` that `center`/`halfRange`
now replace outright. Bound at `@group(0) @binding(2)`, alongside `srcTex: texture_3d<f32>`
at binding 0 and its sampler at binding 1.

**The elegance this buys:** `center`/`halfRange` make `fs_max` a single entry point for
_every_ max-reduction pass, first and subsequent alike. The very first reduction (raw
volume values → deviation space, Task 3's job) passes the field's real
`contrastCenter`/`halfRange`. Every reduction after that — the rest of Task 3's chained
downsamples, and every level `generateMipChain3d` fills for a `'max'`-filter texture —
is a max-of-already-deviation-space-values pass, so it passes `center = 0, halfRange = 1`:
`dev = abs(x - 0) / 1 = x`, the identity, because the input is already non-negative
deviation. No second shader variant, no mode flag — the uniform alone selects "transform
first" vs. "already transformed."

`generateMipChain3d`'s internal loop is naturally expressed in terms of a single-level
"downsample this (texture, mipLevel) pair into that (texture, mipLevel) pair" step, always
called with identity `center`/`halfRange` for `'max'` (it never sees raw values — its
input is always a texture's own level 0, which for the max pyramid is already
deviation-space by the time this loop runs). **Task 3 needs the identical mechanism
against two different textures**, with the real `center`/`halfRange` on its first call
only, so factor that step out as its own function in this file rather than re-deriving it
— export it if that's the cleaner shape, keep it private and re-export only what Task 3
needs otherwise. Either is fine; don't duplicate the pass-building code.

**`uploadCube` changes** (`volumeFieldRenderer.ts:216-230`): texture creation gains
`mipLevelCount: mipLevelCount3d(cube.dims[0], cube.dims[1], cube.dims[2])` and
`GPUTextureUsage.RENDER_ATTACHMENT` in `usage`; after the existing `writeTexture` call,
add `generateMipChain3d(device, tex, 'box')`.

- [ ] Invoke the `wesl-shaders` skill before creating `mipBlit3d.wesl`.
- [ ] Write `mipLevelCount3d` + the test `mipLevelCount3d returns 9 for 178×300×182`
      (hand-computed: `floor(log2(300)) + 1 = floor(8.229...) + 1 = 9`), plus one
      asymmetric small case computed by hand, not by calling `Math.log2` in the test
      (that would be a mirror — see `testing.md`).
- [ ] Write `mipBlit3d.wesl` (`fs_box` + `fs_max` + shared `vs`) and `generateMipChain3d`.
- [ ] Wire `uploadCube`.
- [ ] `npm test -- mipLevelCount3d` → 3 tests pass.
- [ ] `npm run typecheck` → green.
- [ ] Visual sanity: dev server, confirm the MCPM cube still renders (mip level 0 is
      unchanged; this task doesn't yet sample anything but level 0, so there should be
      **zero visible difference** — any change here is a bug, not a look shift).
- [ ] Commit.

---

## Task 3: Max pyramid resident per field

**Why:** The skip shader (Task 5) needs a small, cheap-to-sample structure that proves a
region is empty _before_ paying for a full-res sample. Built once per `upload()`, same
lifetime as the volume texture itself.

**Files:**

- Modify: `src/@types/rendering/FieldEntry.d.ts` (`:24-76`)
- Modify: `src/services/gpu/renderers/volumeField/volumeFieldRenderer.ts` (`group0Bgl`
  `:139-160`, `uploadCube`/`upload` `:216-330`, `unload`/`destroy` `:332-345`, `:454-464`)
- Uses: `generateMipChain3d` (Task 2)

**Contract — new binding.** `group0Bgl` gains entry index 5, a `textureLoad`-only 3D
texture (no companion sampler — `textureLoad` takes explicit integer coords, not a
sampler):

```ts
{ binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float', viewDimension: '3d' } },
```

`FieldEntry` gains `maxPyramidTexture: GPUTexture`, destroyed alongside the other
per-field GPU resources in both `unload` and `destroy`.

**Design note — building level 0.** The pyramid's own base is `ceil(dims/8)` per axis
(spec: "base = volume dims / 8"), NOT the volume's own mip level 3 — the display chain
(Task 2) is box-filtered, which can average a thin bright filament below the skip
threshold and cause an _unsafe_ over-skip; the max pyramid must be reduced from the raw
cube independently. Build it as **three chained 2× max-reductions** through the
single-level downsample step Task 2 factored out (volume level 0 → scratch A at dims/2 →
scratch B at dims/4 → `maxPyramidTexture` level 0 at dims/8), not one 8×8×8-tap pass —
reuse the existing 2× primitive rather than inventing a second reduction shader. **Only
the first of the three passes** (volume level 0 → scratch A) supplies the field's real
`contrastCenter` (already on `FieldEntry`) and `halfRange = max(contrastCenter, 1 -
contrastCenter)` — the same formula `applyContrastWindow` uses at `fragment.wesl:168` —
as the `MipBlit3dUniforms` `center`/`halfRange`; the remaining two chained passes use the
identity (`center = 0, halfRange = 1`), per Task 2's design note. The two scratch textures
are upload-time-only (destroy after use; this runs once per `upload()` call, not per
frame). Once level 0 is filled, `generateMipChain3d(device, maxPyramidTexture, 'max')`
fills the rest of its own chain self-referentially (identity params throughout, same as
Task 2's volume-texture call).

**Design note — why deviation space, not raw values.** The pyramid stores normalised
deviation, `dev = abs(value - contrastCenter) / halfRange` — naturally bounded to `[0, 1]`
given the cube's own `[0, 1]`-normalised value range, same as `applyContrastWindow`'s own
`dev` — not the raw voxel value. This is deliberate and is what makes the pyramid
correct for **both** palette families: `dev` is exactly the quantity
`applyContrastWindow`'s deadband thresholds against (`fragment.wesl:169`), so the
pyramid's stored units already match the skip test's units with no back-conversion needed
(Task 5). And because `dev` is non-negative by construction, `max()` composes correctly
through the whole reduction chain — there's no way for a large positive deviation on one
side of the center to cancel or hide a large negative one on the other, the way
`max(rawValue)` would for a divergent palette (`contrastCenter = 0.5` — shipped today by
`src/data/sources/cf4-density.ts` and three DEV debug fixtures, all reachable from
settings, not merely hypothetical).

- [ ] Add `maxPyramidTexture` to `FieldEntry`.
- [ ] Add binding 5 to `group0Bgl`.
- [ ] Build the max pyramid in `upload()` per the design note above; add its bind-group
      entry; destroy it in `unload()`/`destroy()`.
- [ ] `npm test -- volumeFieldRenderer` → existing suite still green (mock device's
      `createTexture`/`createBindGroup` calls must accommodate the new texture/binding —
      update the mock's call-count assumptions if any test asserts exact counts).
- [ ] `npm run typecheck` → green.
- [ ] Commit. (No shader consumes binding 5 yet — nothing to visually check until Task
      5.)

---

## Task 4: Uniform bump 256 → 272

**Why:** The skip (Task 5) and cone-LOD (Task 6) shader math both need two per-frame/
per-cube scalars that don't exist in the uniform today. Plumbed ahead of use, per the
`UNIFORM_BYTES` comment's own note that "the next per-field uniform will have to bump
UNIFORM_BYTES to the next 16-byte boundary (272)" (`volumeFieldRenderer.ts:70-71`).

**Files:**

- Modify: `src/services/gpu/renderers/volumeField/volumeFieldRenderer.ts` (`UNIFORM_BYTES`
  `:72`, `upload` `:279-330`, `draw` `:365-451`)
- Modify: `src/@types/rendering/FieldEntry.d.ts`
- Modify: `src/@types/rendering/VolumeFieldRenderer.d.ts` (`draw` signature, `:56-63`)
- Modify: `src/services/engine/frame/passes/scalarVolumeLayer.ts` (`:48-72`)
- Modify: `src/services/gpu/shaders/scalarVolume/fragment.wesl` (`VolumeUniforms`,
  `:32-98`)
- Modify: `tests/services/gpu/renderers/volumeField/volumeFieldRenderer.test.ts`

**Contract — byte layout extension** (extends the table at `volumeFieldRenderer.ts:369-390`
verbatim; only the new rows are shown):

```
252..255  frame            (existing, unchanged)
256..259  voxelSizeLocal   (f32; per-cube static, FieldEntry — 1 / max(dims))
260..263  pixelConeTan     (f32; per-frame, new draw() parameter)
264..267  _pad2
268..271  _pad3
```

`UNIFORM_BYTES` becomes `272` (17 × 16, mat4-alignment-clean, same reasoning as the
existing 256 comment).

**`voxelSizeLocal`**: `FieldEntry` gains `voxelSizeLocal: number`, computed once in
`upload()` from `cube.dims` as `1 / Math.max(cube.dims[0], cube.dims[1], cube.dims[2])` —
the edge length of one voxel in the cube's local `[0,1]³` space, same per-cube-static
treatment as `contrastCenter`/`envelopeInner`/`envelopeOuter`.

**`pixelConeTan`**: NOT per-cube — it's a per-frame scalar derived from the volume
target's own viewport height and the camera's vertical FOV, mirroring the
`drawPxPerRad = canvasSize.height / (2 * tan(fovYRad/2))` idiom at `frameContext.ts:177`
(same shape, but against the **downscaled** volume-target height, not the canvas height —
`scalarVolumeLayer.ts` already computes that `vh` locally at `:63`). `VolumeFieldRenderer.
draw()`'s signature gains a `pixelConeTan: number` parameter (frame-global, computed once
by the caller, not re-derived per field — same rationale as the existing `viewportPx`
parameter):

```ts
draw(
  pass: GPURenderPassEncoder,
  viewProj: Mat4,
  viewportPx: Vec2,
  cameraPosWorld: Readonly<Vec3>,
  pixelConeTan: number,
  settingsOf: (id: VolumeFieldId) => VolumeFieldSettings | undefined,
  fadeOpacityOf: (id: VolumeFieldId) => number,
): void;
```

`scalarVolumeLayer.ts`'s `draw()` computes `pixelConeTan` from `ctx.fovYRad` and its
local `vh` and passes it through.

**`fragment.wesl`**: `VolumeUniforms` struct gains `voxelSizeLocal: f32` and
`pixelConeTan: f32` fields after `frame`, with doc comments stating their units/space
(local-space distance; tangent, not angle) — no shader logic change yet, Tasks 5–6 are
the consumers.

- [ ] Invoke the `wesl-shaders` skill before editing `fragment.wesl`.
- [ ] Bump `UNIFORM_BYTES`, add `voxelSizeLocal` to `FieldEntry` + its computation in
      `upload()`, update `draw()`'s signature and its scratch-write block + the byte
      comment.
- [ ] Update `scalarVolumeLayer.ts` to compute and pass `pixelConeTan`.
- [ ] Add the two fields to the WGSL struct.
- [ ] Update every `r.draw(...)` call site in
      `tests/services/gpu/renderers/volumeField/volumeFieldRenderer.test.ts` (≈8 call
      sites) for the new positional parameter — an arbitrary placeholder value (e.g.
      `0.001`) is fine except where a new test asserts on it.
- [ ] Widen the test file's `uniformScratch` helper's length filter from `64` to `68`
      (`UNIFORM_BYTES / 4`).
- [ ] Add the parity test `draw writes voxelSizeLocal and pixelConeTan into the uniform
  scratch at offsets 64/65`, asserting the fixture cube's hand-computed
      `voxelSizeLocal` (e.g. `dims: [4,4,4]` → `0.25`) and the `pixelConeTan` value
      passed into `draw()` — a legitimate WGSL/TS byte-layout keep-rule test per
      `testing.md`, not a mirror (the expected values are computed independently of the
      renderer's own arithmetic).
- [ ] `npm test -- volumeFieldRenderer` → green, including the new test.
- [ ] `npm run typecheck` → green (catches any stale `draw()` call site outside the test
      file, e.g. other layers or tools that construct calls against this renderer).
- [ ] Commit.

---

## Task 5: Shader — TF-adaptive empty-space skipping

**Why:** The feature proper, part 1. Consult the max pyramid (Task 3) before paying for
a full-res sample; skip whole cells that can't contribute given the live contrast/trim
uniforms.

**Files:**

- Modify: `src/services/gpu/shaders/scalarVolume/fragment.wesl` (march loop,
  `:279-381`)

**Design note — cutoff derivation.** Mirror `applyContrastWindow`'s deadband math
(`fragment.wesl:167-183`) to get the cutoff computed once outside the march loop, not per
step: `contrastDeadband = clamp(1 - 1/max(contrast, 1e-3), 0, 0.9)`, `trimDeadband =
clamp(trim, 0, 0.95)`, `deadband = max(contrastDeadband, trimDeadband)`, cutoff =
`deadband - 0.05` (the smoothstep floor at `:181`, same value the brief specifies). The
max pyramid (Task 3) already stores this quantity's units — normalised deviation, not raw
value — so the skip test is the direct comparison `pyramidDev < deadband - 0.05`, no
conversion back to raw sample-value space and no palette-family caveat: the pyramid is
correct for both `contrastCenter = 0` (MCPM) and `contrastCenter = 0.5` (CF-4) fields by
construction (Task 3). Because the cutoff is derived from the same live uniforms every
frame, slider changes retune skipping instantly — the pyramid stores data (deviation
values), never policy.

**Design note — skip mechanics.** MERF-style coarse-to-fine: at each step, `textureLoad`
the max pyramid at a coarse level for the ray's current cell; if the cell's value proves
it's below cutoff, advance `t` to that **cell's exit point along the ray** — a slab
test against the cell's local-space bounds, the same technique `intersectUnitAabb`
(`:210-219`) uses against the whole unit cube, just bounded to one pyramid cell's extent
— never by a fixed step size (advancing by a fixed amount either under-skips a huge empty
region or overshoots past a cell boundary into unverified territory). If the coarse cell
is not provably empty, refine to a finer pyramid level (or fall through to a normal
full-res sample) before concluding it must be shaded.

**Mandatory order — visual before numbers.** Per the spec's Testing section and standing
project feedback (a skip-everything bug reads as a fake perf win): get a _working_ skip
build compiling and looking visually right on the dev server _before_ reaching for the
harness. Do not treat a first-pass perf improvement as evidence the skip logic is
correct.

- [ ] Invoke the `wesl-shaders` skill before editing this file.
- [ ] Implement the cutoff derivation + coarse-to-fine skip loop per the design notes
      above.
- [ ] **Visual checkpoint (first working build, not the polished one):** dev server,
      MCPM cube, eyeball against a pre-change screenshot at `volume-inside` and at least
      one other pose (`local-group`). No visible holes, no missing filaments, no
      change in overall look at default settings — if the look changed, that's either a
      bug (over-skip) or something to flag, not silently accept.
  - Sanity-check the contrast/trim sliders still retune the visible result live with no
    rebuild (this is the design's whole "policy vs. data" claim — if it doesn't hold,
    the cutoff derivation is wired to the wrong uniform or a build-time constant crept
    in).
- [ ] **Then** measure: `npm run perf -- --url http://localhost:<port> --scenario
  volume-inside --frames 30` and `--scenario local-group`, compare MERGED medians
      against Task 1's baseline.
- [ ] `npm run typecheck` → green (no TS surface changed by this task, but confirms
      nothing broke upstream).
- [ ] Commit, with the before/after numbers in the commit body.

---

## Task 6: Shader — cone-footprint LOD + honest step sizing

**Why:** The feature proper, part 2–3. Replace `stepLength = (tMax-tMin)/STEP_COUNT`
(sample density ∝ camera distance, the aliasing/shimmer source) with sample density ∝
what's actually on screen.

**Files:**

- Modify: `src/services/gpu/shaders/scalarVolume/fragment.wesl` (march loop,
  `:249-381`)

**Contract — the formulas** (verified/given by the spec, reproduced exactly, not
re-derived):

```
coneDiameter = 2 · t · pixelConeTan
lod          = clamp(log2(coneDiameter / voxelSizeLocal), 0, textureNumLevels(volume) - 1)
```

Sample the volume with `textureSampleLevel(volume, volumeSampler, p, lod)` (replacing the
current hardcoded `0.0` at `:292`) — no uniform-control-flow concern here since the LOD is
computed, not derived from implicit derivatives, same reasoning the existing code already
documents for why `textureSampleLevel` is mandatory (`:284-291`).

**Design note — step sizing.** Replace the fixed `stepLength` with one proportional to
the LOD'd voxel size (`voxelSizeLocal * 2^lod`, scaled by a quality constant tuned during
the visual pass — name and value are this task's implementer's call, there's no
pre-existing convention to cite). `STEP_COUNT` (`:116`) stops being the divisor that
defines sample density and becomes a safety cap on loop iterations only (the early-out at
`accum.a > SATURATION_THRESHOLD`, `:379`, already exists and stays).

**Mandatory order — visual before numbers**, same discipline as Task 5: this directly
changes what stationary-shimmer looks like (the design's explicit goal — "kills the
distant-view supersampling aliasing... attacking the stationary-shimmer complaint at its
cause"), so confirm the look actually improved (or at minimum didn't regress) before
trusting a perf number.

- [ ] Invoke the `wesl-shaders` skill before editing this file.
- [ ] Implement cone-LOD sampling + LOD-proportional step sizing.
- [ ] **Visual checkpoint:** dev server, `volume-inside` and `local-group` — confirm
      reduced shimmer/aliasing on a slow orbit or stationary hold, no new popping between
      LOD levels, near-camera detail unchanged (LOD 0 at the camera should look identical
      to Task 5's build).
- [ ] **Then** measure: same scenarios/flags as Task 5, compare against both Task 1's
      original baseline and Task 5's numbers.
- [ ] `npm run typecheck` → green.
- [ ] Commit, with before/after numbers in the commit body.

---

## Task 7: Stage 3 — spend the savings

**Why:** The design's explicit payoff: once the march is cheap and adaptive, raise
resolution rather than bank the savings unused.

**Files:**

- Modify: `src/services/gpu/renderTargets.ts` (`'volume'` row, `~:197`)

**Change:** `{ id: 'volume', format: 'rgba16float', depth: null, scale: 3 }` → `scale: 2`.

**Decision rule** (stated up front, per the spec — "not planned in detail in advance; the
measurement decides"): run `npm run perf -- --url http://localhost:<port> --scenario
volume-inside --frames 30`, repeat for `local-group` and `full-survey`. **Keep `scale: 2`
iff the TOTAL MERGED regression across all three poses is under 1 ms at every pose**
(summed against the post-Task-6 numbers, not the Task-1 original baseline — this stage
measures the cost of the resolution raise specifically). If any pose regresses ≥ 1 ms,
revert to `scale: 3` and record the numbers that ruled it out — a deliberate no-op is a
valid outcome here, not a failed task.

- [ ] Flip the scale, run the three-scenario harness pass.
- [ ] Apply the decision rule; keep or revert accordingly.
- [ ] `npm run typecheck` → green.
- [ ] Commit either way, with the numbers and the keep/revert decision in the commit
      body.

---

## Task 8: Wrap-up — `docs/RENDERER.md` note

**Why:** `RENDERER.md`'s "Renderer quick map" currently has no entry for the scalar-volume
renderer at all (checked: absent from `docs/RENDERER.md:5-13`) — add one now that the
pyramid/skip/LOD shape exists, so the next person touching this renderer starts from the
map instead of re-discovering the shape from the diff.

**Files:**

- Modify: `docs/RENDERER.md` (new bullet in "Renderer quick map," `:5-13`)

**Content, matching the section's existing one-bullet-per-renderer density**: name
`volumeFieldRenderer.ts` + `shaders/scalarVolume/*.wesl`; state the two GPU-built
pyramids per field (display mip chain, box filter, self-referential; max-value pyramid,
own dims/8 base, used for TF-adaptive empty-space skipping) and that both are built at
`upload()` time via the shared `gpu/lib/generateMipChain3d` primitive — never persisted,
never CPU-computed; note the cone-footprint LOD ties sample density to on-screen
footprint via `pixelConeTan`. Point at this plan + the spec for the full design rather
than restating either.

- [ ] Write the bullet.
- [ ] `npx prettier --write docs/RENDERER.md` if the line wrapping needs it (match the
      file's existing single-long-line-per-bullet style — don't hand-wrap against it).
- [ ] Commit.

Spec and this plan stay on disk (not moved to `*/completed/`) — that happens at
`/feature-done` time, out of scope for this task.

---

## Definition of Done

- **Deliverable inventory:** `generateMipChain3d.ts` (+ `mipLevelCount3d`) and
  `mipBlit3d.wesl` exist under `gpu/lib`/`gpu/shaders/lib`. `FieldEntry` carries
  `maxPyramidTexture` and `voxelSizeLocal`. `group0Bgl` has 6 bindings (0–5).
  `VolumeUniforms`/`UNIFORM_BYTES` are 272 bytes, carrying `voxelSizeLocal` and
  `pixelConeTan`. `fragment.wesl`'s march loop performs TF-adaptive coarse-to-fine
  empty-space skipping and cone-footprint LOD sampling with LOD-proportional step
  sizing; `STEP_COUNT` is a safety cap, not the density divisor. The max pyramid stores
  normalised deviation (not raw value), so **skip logic is palette-family-correct
  (sequential and divergent)** — no MCPM-only caveat. `perfScenarios.ts` has a
  `volume-inside` row. `docs/RENDERER.md` has a scalar-volume bullet.
- **Named observable behaviours for the manual smoke pass:** MCPM cube visually
  unchanged (or improved — less shimmer/aliasing) at `volume-inside`, `local-group`, and
  `full-survey`; contrast/trim sliders retune the skip cutoff live with no rebuild;
  camera dolly from outside to inside the cube shows no popping at the LOD/skip
  transition; no visible holes or missing filament structure at any checked pose;
  **enabling the CF-4 field (`contrastCenter = 0.5`) shows no holes vs. a pre-change
  build** — the divergent-palette case the deviation-space pyramid exists to cover.
- **The deferral boundary:** wire-level gzip/edge-caching (spec's Stage 0, its own PR
  #554) is out of scope. Multi-cube single-march, brick-pool/out-of-core streaming, and
  Gaussian/Gabor representation changes are out of scope (spec Non-goals). Temporal
  reprojection was rejected outright, not deferred.
