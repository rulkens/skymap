# NFW gravitational-lensing image-finding via a precomputed 2D LUT — Plan (Part 1)

**Spec:** [`specs/2026-06-24-nfw-lensing-lut-image-finding-design.md`](../specs/2026-06-24-nfw-lensing-lut-image-finding-design.md)
**Branch:** `feat/gravitational-lensing`
**Part 2:** [`2026-06-24-nfw-lensing-lut-part2.md`](./2026-06-24-nfw-lensing-lut-part2.md) (Phases 4–6)

This file carries Phases 0–3 (constraints + CPU generator + `lensedPosition`
extraction + GPU LUT texture resource). Part 2 carries the wiring, the
disk/quad coverage behaviour change, and the final entanglement-radar pass.

---

## What this builds

The points + pick pipelines render the correct NFW multi-image structure
(primary + counter image) with physically-accurate magnification by sampling a
precomputed 2D inverse-lens-equation LUT in the vertex stage — replacing today's
NFW-primary-only stopgap (`points/vertex.wesl:173-189`). SIS keeps its existing
analytic branch. The volume raymarch's LUT wiring is a later phase and out of
scope here (noted only as a deferred hook on the standalone `lensingUniforms`
BGL).

## ⚠️ The spec's "Implementation sketch (files)" section is STALE

The spec (lines 222–242) names `focusUniforms.ts` / `createFocusUniformBuffer.ts`
as the BGL + bind-group homes. That predates a rename refactor and is **wrong**.
This plan uses the CURRENT surfaces; where the spec disagrees, **this plan wins**:

| Spec says (stale) | Current surface (use this) |
| --- | --- |
| `bindGroupLayouts/focusUniforms.ts` | `bindGroupLayouts/sceneUniforms.ts` → `createSceneUniformsBgl`, type `SceneUniformsBgl` |
| `createFocusUniformBuffer.ts` builds the bind group | `resources/createSceneBindGroup.ts` builds the group; `createFocusUniformBuffer.ts` owns ONLY the focus buffer |
| LUT entries added to `focusUniforms` BGL | LUT entries added to `createSceneUniformsBgl` (`@binding(2)` texture, `@binding(3)` sampler) AND bound in `createSceneBindGroup` (new `lensLutTexture` / `lensLutSampler` params) |

The `@group(3)` scene group is VERTEX-only and already hosts focus (`@binding(0)`)
+ the lensing buffer (`@binding(1)`). See `sceneUniforms.ts:1-29` and
`createSceneBindGroup.ts:1-18` for the current co-tenancy rationale.

---

## Locked design decisions (resolved from the spec's open items)

- **Filtering:** `rgba16float` LUT + a `linear` sampler (spec option (a)). Half
  precision is plenty for the clamped deflections/magnifications and avoids the
  non-universal `float32-filterable` device feature. Fallbacks (b) request
  `float32-filterable` / (c) hand-bilinear `textureLoad` are NOT taken unless
  16-bit precision proves visibly insufficient at a caustic.
- **SIS stays analytic.** The LUT is NFW-only; SIS keeps its closed-form counter
  (`points/vertex.wesl:173-188`) untouched. (Spec open-question 3 default.)
- **Two quads per source**, NFW's third (radial) image dropped, **single-lens
  dominant** LUT resolution. The multi-lens summed primary is unchanged.
- **LUT uploaded once at startup** — dimensionless/universal; never re-uploaded
  on camera move, zoom, or `strength`/`r_s` change (those enter only via the
  per-source `(y, s)` computation).

---

## Global Constraints (binding — these override defaults)

- **One function per file** in `src/utils/` and `tools/utils/`; filename = the
  exported function's name. No multi-export helper grab-bags.
- **One type per file** in `src/@types/`; filename = the exported type's name.
- **`type` aliases, never `interface`** for all TS shapes.
- **`Vec2` / `Vec3` aliases** (`src/@types/math/`), never raw `[number, number]`
  / `[number, number, number]` tuples in skymap TS.
- **No backticks in WESL comments** — the wesl-plugin parse errors on them. Use
  single quotes to reference identifiers in `.wesl` comments.
- **Didactic comments**: explain *why* and *what the alternative was*, matching
  the multi-paragraph module-header style already in `lib/lensing.wesl` and
  `points/vertex.wesl`. No history notes (dates / PR refs); describe current
  state.
- **Be meticulous with WESL** — slow down on shader edits; the `vs` byte layout
  and `@group/@binding` numbers must agree across `vertex.wesl`,
  `createSceneUniformsBgl`, and `createSceneBindGroup` exactly. Use the
  `wesl-shaders` skill when editing `.wesl`.
- **Never plant deliberate errors/traps** in the plan or the code. Everything
  must be straightforwardly correct.
- TDD: every code task is test-first — write the failing test, watch it fail,
  write the minimal implementation, watch it pass, then commit. Tick the
  task's `- [ ]` to `- [x]` as you complete it.

---

## Phase 0 — Stale-comment cleanup (no behaviour change)

A behaviour-neutral hygiene task that clears a stale `@group(4)` reference so the
later phases don't inherit a misleading comment. Sequenced first because it's
trivial and unblocks nothing.

### Task 0.1 — Fix the stale `@group(4)` comment in `lensingUniforms.wesl`

**Files:** `src/services/gpu/shaders/lib/lensingUniforms.wesl` (modify, comments
only).

`lensingUniforms.wesl:14-15` still says the points vertex stage *parks lensing at
`@group(4)`* ("its lower slots hold Uniforms / Fade / Source / Focus"). That is
stale: lensing now co-hosts the `@group(3)` scene group at `@binding(1)` (see
`points/vertex.wesl:74-93` + `sceneUniforms.ts`). The standalone BGL in this file
is reserved for the volume raymarch's own free group, VERTEX|FRAGMENT.

- [ ] Rewrite the `@group/@binding` paragraph (`lensingUniforms.wesl:13-15`) to
  describe current state: the points + pick pipelines read this buffer via the
  `@group(3)` scene group at `@binding(1)` (VERTEX), and the standalone bind
  group exists for a free-group consumer (the volume raymarch, VERTEX|FRAGMENT).
  Comments only — the `struct LensingUniforms` body and byte layout do not change.
- [ ] `npm run build` — WESL still links; no struct/offset change.
- [ ] Commit.

---

## Phase 1 — Pure CPU LUT generator (fully TDD, no GPU)

The expensive inversion of `y = x − s·nfwShape(x)` is precomputed on the CPU once
at startup. This phase is the dimensionless table generator and its tests — no
WebGPU, no shader, no wiring.

### Task 1.1 — `buildNfwLensLut` generator + contract

**Files:**
- `src/utils/lensing/buildNfwLensLut.ts` (new — one function per file).
- `src/@types/lensing/NfwLensLut.d.ts` (new — one type per file; the generator's
  return shape).
- `tests/utils/lensing/buildNfwLensLut.test.ts` (new).

**Return-shape contract** (`src/@types/lensing/NfwLensLut.d.ts`):

```ts
export type NfwLensLut = {
  /** Grid resolution along the source-position (y) axis = texture width. */
  readonly width: number;
  /** Grid resolution along the reduced-strength (s) axis = texture height. */
  readonly height: number;
  /** Max source position (dimensionless) the y-axis spans, [0, yMax]. */
  readonly yMax: number;
  /** Max reduced strength the s-axis spans; the s-axis is LOG-scaled, [0, sMax]. */
  readonly sMax: number;
  /**
   * width*height*4 f32 values, row-major (y fastest), 4 channels per cell:
   *   [xPrimary, muPrimary, xCounter, muCounter]
   * xCounter == 0 AND muCounter == 0 ⇒ no secondary image in this cell.
   * f32 source array — the GPU resource (Phase 3) packs these to f16 on upload.
   */
  readonly data: Float32Array;
};
```

**Generator signature** (`src/utils/lensing/buildNfwLensLut.ts`):

```ts
export function buildNfwLensLut(
  width: number,
  height: number,
  yMax: number,
  sMax: number,
): NfwLensLut;
```

**Channel layout** (per cell, matching the spec's table at spec lines 102–113):

| channel | meaning | "none" sentinel |
| --- | --- | --- |
| 0 `xPrimary` | signed dimensionless outer-image position (always present) | — |
| 1 `muPrimary` | clamped magnification of the primary | — |
| 2 `xCounter` | signed position of the brightest secondary image | `0` ⇒ none |
| 3 `muCounter` | clamped magnification of the counter | `0` ⇒ none |

**Generation algorithm** (per the spec, spec lines 115–120 — describe in the
impl, don't paste a body here): for each grid cell `(y, s)`, densely sample
`y(x) = x − s·nfwShape(x)` over a signed `x` range, bracket sign changes of
`y(x) − y`, refine each bracket by bisection, compute `μ(x,s) = 1/|(y/x)·(dy/dx)|`
with `dy/dx = 1 − s·nfwShape'(x)` (`nfwShape'` by central difference), clamp `μ`
to `MU_MAX`, then pick the outer root as primary and the brightest opposite-side
root as counter. NFW's third image (if a third root exists) is dropped to fit the
two-channel budget — count drops and `console.warn` once per build so the
truncation is visible, not silent (spec line 120).

- The `s`-axis is **log-scaled** (spec lines 126–130): cell row `j` maps to
  `s = sMax · ((exp(LOG_K · j/(height-1)) − 1) / (exp(LOG_K) − 1))` (or an
  equivalent monotone log map). Phase 2/Part-2 shader must use the **inverse** of
  whatever map this task pins — so the map + its inverse live as a documented
  pair (an `sToRow` / `rowToS` shape, or a single documented formula referenced
  from both the generator and the shader comment). Name the constant `LOG_K` and
  pin its value here so the shader's inverse can quote it.
- `nfwShape(x)` is the **same** peak-normalised Wright & Brainerd shape as the
  WESL `nfwShape` (`lib/lensing.wesl:148-162`). Port it to TS in this file (it is
  a handful of transcendentals); `NFW_SHAPE_PEAK = 0.3122` must match
  `lib/lensing.wesl:146`. Do NOT introduce a second peak constant — pin the same
  value with a comment pointing at the WESL source of truth.

**Tests** (assertions are the acceptance criteria):

- [ ] `buildNfwLensLut packs width*height*4 f32 values` — asserts
  `lut.data.length === width * height * 4` for a small `(8, 4, …)` grid.
- [ ] `s→0 leaves the primary at x≈y with μ≈1` — at the smallest `s` row, for a
  mid-range `y`, asserts `xPrimary ≈ y` (tolerance ~`yMax/width`) and
  `muPrimary ≈ 1` (tol ~1e-2), and `xCounter === 0` (no secondary).
- [ ] `s→0 produces no counter image` — across the smallest-`s` row, asserts
  every cell has `xCounter === 0 && muCounter === 0`.
- [ ] `super-critical s yields two opposite-side images for small y` — for a
  large `s` and a small `y` inside the caustic, asserts `xPrimary > 0` and
  `xCounter < 0` (opposite sides of the lens centre) and `muCounter !== 0`.
- [ ] `magnifications are clamped to MU_MAX` — asserts no `|mu*|` in `data`
  exceeds `MU_MAX` even for a near-caustic cell.
- [ ] `dropped third image is counted, not silent` — for a grid/`s` range known
  to produce a three-root cell, asserts the build warns (spy on `console.warn`)
  rather than silently keeping only two. (If no `(width,height,yMax,sMax)` in the
  test's reach produces three roots, assert the warn path is reachable via a
  crafted small grid; do not fabricate a passing assertion against a path that
  can't fire — escalate instead.)
- [ ] `npm test -- buildNfwLensLut` → all pass.
- [ ] `npm run typecheck` → clean.
- [ ] Commit.

> **Calibration note (spec open-questions 1 & 2):** `yMax`, `sMax`, the `LOG_K`
> base, and the `(width, height)` default (`256 × 64` per spec line 132) are the
> one genuinely empirical part. This task pins *a* defensible default and proves
> the limits; the visual tuning of `sMax` vs runtime `strength·distFactor·D_l/r_s`
> range and caustic sharpness happens against the live renderer in Part 2's smoke
> task. Do not block this task on perfect calibration — pin a starting value with
> a comment and move on.

---

## Phase 2 — `lensedPosition` extraction (behaviour-NEUTRAL refactor)

The per-quad deflected-position assembly (the summation loop + dominant-pick + SIS
counter placement) lives inline in `points/vertex.wesl:114-190`. The braid: the
deflection *model* is welded to the points pipeline, so the impostor-disk and
textured-thumbnail shaders can't reuse it. Un-braid it into a shared
`lib/lensing.wesl` function so any galaxy-rendering shader lenses with a one-line
call — this is the single seam the LUT slots into in Part 2 (one place, not three).

**Sequenced before the LUT** so the LUT changes the counter math in exactly one
extracted function, and so this task can prove byte-identical point rendering
before any behaviour changes.

### Task 2.1 — Extract `lensedPosition(...)` into `lib/lensing.wesl`

**Files:**
- `src/services/gpu/shaders/lib/lensing.wesl` (modify — add the function).
- `src/services/gpu/shaders/points/vertex.wesl` (modify — replace the inline
  block at lines ~114-190 with a call).
- `tests/...` — see the test strategy below.

**New WESL function contract** (in `lib/lensing.wesl`, alongside `lensTerm` /
`nfwShape`):

```wesl
// Returns the lensed world position for one image (primary or counter) of a
// source, plus its magnification and a validity flag. Encapsulates the
// summed-primary + dominant-lens-counter policy that 'vs' ran inline.
struct LensedImage {
  valid: u32,        // 0u => cull this quad (no such image)
  position: vec3<f32>, // lensed world position (== source position when unlensed)
  mu: f32,           // magnification to fold into intensity (1.0 when unlensed)
}

fn lensedPosition(
  sourceWorld: vec3<f32>,   // p.position
  eye: vec3<f32>,           // u.camPosWorld
  lensing: LensingUniforms, // enabled / count / mode / scaleRadius / lenses
  imageKind: u32,           // 0 = primary, 1 = counter
  muMax: f32,               // the LENS_MU_MAX clamp (kept caller-side as a const)
) -> LensedImage
```

**Behaviour to preserve EXACTLY** (lift from `points/vertex.wesl:126-190`, do not
re-derive): the `lensing.enabled == 1u && dS > 1e-4` gate; the `for` loop calling
`lensTerm`; the summed `primaryOffset`; the dominant-lens pick by largest `δ/β`;
primary `imageKind==0` → `normalize(toSrc + primaryOffset·dS)`; counter
`imageKind==1 && hasDominant && lensing.mode == 0u` → SIS `θ = δ − β` placement +
`μ = δ/β − 1` clamp; and the cull (`valid == 0u`) for a disabled lens / absent
counter / NFW counter. The `imageKind == 1` default-cull when the lens is off
(`points/vertex.wesl:166`) is part of the contract.

**After the extraction**, `points/vertex.wesl`'s `vs` computes
`imageKind = select(0u, 1u, vi >= 6u)`, calls `lensedPosition(...)` once, and
reads `.position` / `.mu` / `.valid` into the existing `lensedPos` / `lensMu` /
`lensValid` locals. Net: the ~75-line inline block collapses to a handful of
lines. `LENS_MU_MAX` stays a `vs`-side const (`points/vertex.wesl:99`) passed in.

**Before/after sketch** (the changing lines in `vs` only — not the whole shader):

```
// before (points/vertex.wesl, ~163-190): ~28 lines of inline assembly
var lensedPos = p.position;
var lensValid = select(1u, 0u, imageKind == 1u);
if (lensing.enabled == 1u && dS > 1e-4) { ... primary / SIS-counter ... }

// after:
let img = lensedPosition(p.position, u.camPosWorld, lensing, imageKind, LENS_MU_MAX);
var lensedPos = img.position;
var lensValid = img.valid;
// lensMu folds img.mu (replacing the inline max()/min() accumulation)
```

> Note: the primary-brightness accumulation (`lensMu = max(lensMu, …)` at
> `points/vertex.wesl:149`) moves INTO `lensedPosition` for `imageKind==0`, and
> the counter's `lensMu = δ/β − 1` (line 186) for `imageKind==1`. Return `mu`
> already folded so `vs` just multiplies it in. Preserve the exact clamp order.

**Test strategy (proving behaviour-neutrality):** this is a GPU shader, so the
proof is a golden-WGSL + behaviour check, not a unit test of WESL directly:

- [ ] **Linked-WGSL golden check.** Add/extend a test that imports
  `points/vertex.wesl?static` (or links it via the existing wesl test harness —
  see how other shader tests resolve `?static`) and asserts the linked module
  still **compiles** and contains the expected lensing symbols. The test name:
  `points vertex links and references lensedPosition`. If the repo has no
  `?static` test harness for `vertex.wesl`, instead assert via the renderer
  smoke path below and SAY SO in the task — do not invent a harness that doesn't
  exist; escalate if neither route is available.
- [ ] **Renderer behaviour parity.** Extend the existing point-renderer test
  coverage so a SIS-mode draw still issues `draw(12, N)` and an NFW-mode draw
  still issues `draw(6, N)` (the vertex-count gate at `pointRenderer.ts:767` is
  UNCHANGED in this phase — NFW is still 6 here; the 12-for-NFW change lands in
  Part 2). Test name: `SIS draw stays 12 vertices, NFW stays 6 after extraction`.
- [ ] `npm run build` — WESL links (this is the real compile gate for the
  extraction).
- [ ] `npm test` — full suite green (no behaviour changed).
- [ ] `npm run typecheck` — clean.
- [ ] Commit.

**Independently testable deliverable:** the points pass renders identically; the
deflection model now lives behind a single shared `lensedPosition` call.

---

## Phase 3 — GPU LUT texture resource

Upload the dimensionless `NfwLensLut` into a GPU texture once at startup, packed
to `rgba16float`, with a clamped linear sampler. No wiring into the scene group
yet — that's Part 2 Phase 4. This phase just produces the texture + sampler
objects and proves the upload shape.

### Task 3.1 — `createNfwLensLutTexture(device, lut)` resource

**Files:**
- `src/services/gpu/resources/createNfwLensLutTexture.ts` (new — one function).
- `src/@types/rendering/NfwLensLutTexture.d.ts` (new — one type; the returned
  handle shape).
- `tests/services/gpu/resources/createNfwLensLutTexture.test.ts` (new — runs
  against the existing fake-GPU-device test harness; find how
  `textureAtlas` / `volumeFieldRenderer` tests fake `device.createTexture` /
  `queue.writeTexture` and reuse that).

**Handle-shape contract** (`src/@types/rendering/NfwLensLutTexture.d.ts`):

```ts
export type NfwLensLutTexture = {
  /** The N×M rgba16float LUT texture (N = lut.width, M = lut.height). */
  readonly texture: GPUTexture;
  /** Its default view — bound at @group(3) @binding(2). */
  readonly view: GPUTextureView;
  /** Clamp-to-edge, linear-filtering sampler — bound at @group(3) @binding(3). */
  readonly sampler: GPUSampler;
  /** Release the texture. Idempotent. */
  destroy(): void;
};
```

**Factory signature** (`src/services/gpu/resources/createNfwLensLutTexture.ts`):

```ts
export function createNfwLensLutTexture(
  device: GPUDevice,
  lut: NfwLensLut,
): NfwLensLutTexture;
```

**Upload contract:**

- Texture: `format: 'rgba16float'`, `size: [lut.width, lut.height, 1]`,
  `usage: TEXTURE_BINDING | COPY_DST`, dimension `'2d'`. **Never** `texture_1d`
  even though M can be small — iOS/WebKit rejects 1D sampling and drops the whole
  frame (CLAUDE.md; spec lines 132–135).
- Sampler: `magFilter: 'linear'`, `minFilter: 'linear'`,
  `addressModeU/V: 'clamp-to-edge'`. Clamped because off-axis `(y,s)` beyond the
  table edge must saturate to the edge cell (primary `x→y`, `μ→1`), not wrap.
- Pack: convert each of `lut.data`'s f32 values to f16 via the existing
  `src/utils/math/floatToF16.ts` (cite it; do NOT re-implement f32→f16), write a
  `Uint16Array` with `bytesPerRow = lut.width * 4 channels * 2 bytes`. See
  `volumeFieldRenderer.ts:215-260` for the `createTexture` + `writeTexture`
  pattern this repo already uses.

**Why `rgba16float` + linear and not `rgba32float`** (didactic comment in the
file): a `linear` sampler on `rgba32float` needs the non-universal
`float32-filterable` device feature (WebKit strict); 16-bit half precision is
plenty for the `MU_MAX`-clamped deflections/magnifications, so we pack to f16 and
sample linearly with no device-feature dependency. (Spec lines 137–145, option a.)

**Tests:**

- [ ] `createNfwLensLutTexture allocates an N×M rgba16float texture` — asserts the
  faked `createTexture` was called with `format: 'rgba16float'` and
  `size` matching `[lut.width, lut.height, 1]`.
- [ ] `createNfwLensLutTexture writes width*height*4 f16 values` — asserts
  `writeTexture` got a `Uint16Array` of length `lut.width*lut.height*4` and the
  right `bytesPerRow`.
- [ ] `the sampler is clamp-to-edge linear` — asserts the faked `createSampler`
  args are `linear` + `clamp-to-edge` on both axes.
- [ ] `destroy releases the texture and is idempotent` — asserts a second
  `destroy()` does not throw.
- [ ] `npm test -- createNfwLensLutTexture` → all pass.
- [ ] `npm run typecheck` → clean.
- [ ] Commit.

**Independently testable deliverable:** a `NfwLensLutTexture` handle exists and
uploads correctly — not yet bound to any pipeline.

---

## Hand-off to Part 2

Phases 4–6 (scene-group wiring + vertex-stage LUT sampling + the 12-vs-6 vertex
gate change, disk/quad coverage behaviour change + smoke test, and the final
entanglement-radar pass) continue in
[`2026-06-24-nfw-lensing-lut-part2.md`](./2026-06-24-nfw-lensing-lut-part2.md).

After all of Part 1 + Part 2 ships, run `/feature-done` to gate on the Definition
of Done (in Part 2) and relocate both plan files + the spec to `completed/`.
