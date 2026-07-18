# Zoom to Earth — Plan 04: conic orbit trails

**Spec:** `docs/superpowers/specs/2026-07-11-conic-orbit-trails.md` — this plan
executes it in full.
**Supersedes:** `docs/backlog/2026-07-10-conic-orbit-trails.md` — the spec + this
plan replace the backlog detail file; the controller deletes it (do NOT touch
`docs/BACKLOG.md` or `docs/backlog/` here).
**Sequencing:** executes **AFTER zoom-to-Earth plan 03**
(`2026-06-29-zoom-to-earth-03-lod-and-polish.md`), on the **same branch/PR**.
Plan 03's Tasks 1–2 (`foregroundFrustum` + its `FAR_MIN_MPC = 3e-11` far floor)
already landed on the plan-02 branch (PR #425) and this plan consumes that floor
unchanged — it is what keeps Jupiter's orbit inside the NEAR0 frustum.
**Plan style (OVERRIDES upstream writing-plans):**
`docs/superpowers/conventions/plan-style.md` — **contract code yes,
implementation code no.** Cite `path:line`, never paste function bodies. Test
names + assertions ARE the acceptance criteria.

## Goal

Replace the interim circle-SDF orbit rings (PR #425) with accurate Keplerian
orbit trails rendered by projecting each orbit's conic into pixel space and
evaluating it analytically per fragment (spec §2–§3). One `f64` inverse
homography `Ginv` per orbit per frame carries the whole projection; the fragment
works in pixel coordinates, so the deep-zoom `f32` cancellation that breaks the
current unit-orbit-space SDF never arises.

Structurally this is a **refactor with a data-model inversion**: the render
placement (`(hdr, NEAR0)` additive, `f64` compose seam) is identical to the ring
it replaces, so most tasks are terse and point at existing code; the one genuinely
new idea is the element table becoming the single source of truth for both body
positions and trails (spec §5).

## What this plan CONSUMES (treat as existing, verified against this worktree)

- **NEAR0 `f64` slab + adaptive frustum.** `deriveSlabs` builds the
  origin-relative `f64` `slab.vp` (`slabs.ts:70-95`, `Slab.d.ts:38`);
  `foregroundFrustum(cam.distance)` with `FAR_MIN_MPC = 3e-11` already encloses
  Jupiter's 5.2 AU orbit (`foregroundFrustum.ts:47-62`). `SlabView` exposes the
  `f64` `slab.vp`, the narrowed `vp`, `camPos`, and `viewportPx`
  (`SlabView.d.ts:23-32`).
- **The `(hdr, NEAR0)` frame step** (`frameProgram.ts:64`) — the same additive
  HDR group `starPointsLayer` + the current `orbitRingsLayer` ride. **No new
  program step.**
- **Compose-then-narrow siblings.** `composeBodyMvp` (`composeBodyMvp.ts:57-91`)
  and the outgoing `composeOrbitMvp` (`composeOrbitMvp.ts:59-102`) — the `f64`
  compose, origin-relative `Crel = C − renderOrigin`, single narrow at the upload
  boundary. `narrowMat4` (`narrowMat4.ts:29`).
- **Frames + scale.** `ECLIPTIC_BASIS` (`eclipticBasis.ts:38-42`), `SCALE_UNITS`
  (`src/data/scaleUnits.ts`), `RENDER_ORIGIN_MPC` (`src/data/renderOrigin.ts`).
- **`wgpu-matrix` `mat3d`** — `f64` 3×3 with `.multiply` / `.inverse`, a
  **12-element padded layout** (3 columns × vec4-aligned) matching WGSL
  `mat3x3<f32>` std140. `mat3d.identity()`/`create()` follow the wgpu-matrix
  zero-init landmine (assign every element that matters).

## Tech stack

TS, `wgpu-matrix` (`mat4d`/`mat3d`/`vec3d` f64 namespaces), WebGPU + WESL,
Vitest. No new deps.

## Global constraints (house rules — override defaults)

- **Contract code yes, implementation code no.** No function bodies; pin
  signatures + test names + byte tables only.
- **One symbol per file** in `src/utils/` and `src/@types/` — filename = exported
  symbol. Deep relative imports, no barrels.
- **`type` aliases, never `interface`.** `Vec2`/`Vec3`/`Mat3` aliases from
  `src/@types/math/`, never raw tuples.
- **Didactic, timeless comments** — explain _why_ and _what the alternative was_;
  no dates / PR refs / history in code comments.
- **WESL:** shader family keeps inter-stage varyings in `orbitTrail/io.wesl`
  imported by both stages; **NO backtick characters anywhere in WESL comments**
  (parse errors — single quotes). Meticulous WGSL: slow down, verify visually
  (`feedback_wgsl_meticulous`). `?static` on the TS import side, literal
  `package::` prefixes.
- **Tests mirror the src tree**; `import { describe, it, expect } from 'vitest'`.
  Judge every test by `testing.md`'s one question — no mirror tests (never build
  the expected value with the source's own formula), no constant restatements.
- **Suite stays green.** Each task ends with its named tests passing. The final
  task gates on `npm run typecheck` (both tsconfigs) + `npm test`.
- **VISUAL gates (NOT covered by automated tests — STOP and ask the user to
  confirm on the dev server; ALL require `?deepZoom` in the URL, else
  `clampDistance` floors the wheel at 0.05 Mpc and the foreground never grows):**
  see Tasks 5, 8, 9.

---

## Task 1 — `eccentricAnomalyFromMean` (Kepler solve)

**Files:** `src/utils/orbit/eccentricAnomalyFromMean.ts` (new),
`tests/utils/orbit/eccentricAnomalyFromMean.test.ts` (new).

**Signature (match exactly):**

```ts
export function eccentricAnomalyFromMean(meanAnomalyRad: number, eccentricity: number): number;
```

**Behaviour:** solve Kepler's equation `M = E − e·sin E` for `E` (Newton
iteration to a tight tolerance). Pure. Used CPU-side to place the body at its
seed position (Task 3) — NOT on the GPU (the fragment goes the forward, closed
direction `M = E − e·sin E`, spec §3.3).

- [x] Add `eccentricAnomalyFromMean.ts` — single function. Didactic docblock:
  WHY Newton (fast quadratic convergence for `e < 1`), WHY only the CPU needs the
  inverse (the fragment uses the trivial forward direction — spec §3.3).
- [x] Test `eccentricAnomalyFromMean returns M when e is 0` — `e = 0` ⇒ `E = M`
  for a couple of `M` values (hand-obvious, independent of the iteration).
- [x] Test `eccentricAnomalyFromMean satisfies Kepler's equation` — for a few
  `(M, e)` with `e ∈ {0.05, 0.5}`, assert `E − e·sin(E) − M` is within `1e-10`
  (an independent residual property, not a mirror of the solver).
- [x] Test `eccentricAnomalyFromMean round-trips a known E` — pick `E`, form
  `M = E − e·sin E` by hand, assert the solver returns `E` within `1e-10`.
- [x] `npm test -- eccentricAnomalyFromMean` → green. Commit.

## Task 2 — `keplerianEllipse` (elements → world `A`, `B`, `C`)

**Files:** `src/utils/orbit/keplerianEllipse.ts` (new),
`tests/utils/orbit/keplerianEllipse.test.ts` (new).

Implements spec §3.1: perifocal rotation `Rz(Ω)·Rx(i)·Rz(ω)` → ecliptic `P̂`,
`Q̂`; ecliptic→equatorial via `ECLIPTIC_BASIS`; then `A = a·P̂w`, `B = b·Q̂w`
(`b = a√(1−e²)`), centre-offset `C_off = −a·e·P̂w` (focus-relative).

**Signature (match exactly):**

```ts
export function keplerianEllipse(elements: OrbitalElements): {
  centerOffsetMpc: Vec3; // C_off: focus → ellipse centre, equatorial world
  semiMajorMpc: Vec3; // A = a·P̂w
  semiMinorMpc: Vec3; // B = b·Q̂w
};
```

**Behaviour:** pure; returns the three constant world vectors of the §3.1
affine-image-of-the-unit-circle ellipse, in the equatorial frame, **focus at the
origin** (the caller adds the parent's absolute world position — Task 7). Uses
`ECLIPTIC_BASIS` for the ecliptic→equatorial map.

- [x] Add `keplerianEllipse.ts`. Didactic docblock: the affine-image-of-circle
  fact (spec §3.1 — real orbit geometry is entirely in `A`, `B`, `C`, the curve
  is always the unit circle), and WHY focus-relative (the parent add is the
  caller's job so the same math serves heliocentric and geocentric orbits).
- [x] Test `keplerianEllipse of a circular equatorial orbit spans equal axes in
  the ecliptic` — `e = 0, i = 0, Ω = 0, ω = 0`: assert `|A| = |B| = a`,
  `A · B ≈ 0`, both `A`, `B` dotted with `ECLIPTIC_BASIS.normal ≈ 0` (in-plane),
  `centerOffsetMpc ≈ [0,0,0]`, and `A` along `+x` (the equinox, since `ω=Ω=0`).
- [x] Test `keplerianEllipse centre-offset is a·e along −A for an eccentric
  orbit` — `e = 0.5`: assert `|centerOffsetMpc| ≈ a·e` and it is antiparallel to
  `A` (dot < 0, `|cross| ≈ 0`).
- [x] Test `keplerianEllipse tilts the plane by the inclination` — `i = 90°`:
  assert the plane normal `A × B` is orthogonal to what a `0°` orbit gives (the
  inclination actually rotates the plane, not a no-op).
- [x] `npm test -- keplerianEllipse` → green. Commit.

## Task 3 — `keplerianPositionMpc` (elements → focus-relative position)

**Files:** `src/utils/orbit/keplerianPositionMpc.ts` (new),
`tests/utils/orbit/keplerianPositionMpc.test.ts` (new).

`X_off(M) = C_off + A·cos E + B·sin E` with `E = eccentricAnomalyFromMean(M, e)`
(Tasks 1–2). Focus-relative; the caller adds the parent position (Task 5/7).

**Signature (match exactly):**

```ts
export function keplerianPositionMpc(elements: OrbitalElements): Vec3;
```

- [x] Add `keplerianPositionMpc.ts` — composes `keplerianEllipse` +
  `eccentricAnomalyFromMean`. Didactic docblock: this is the ONE evaluation that
  makes the body sit on its own trail (spec §5) — both the body seed and the
  trail derive from the same `A`, `B`, `C`.
- [x] Test `keplerianPositionMpc at M=0 is periapsis` — `M = 0`: assert the
  returned vector's length equals `a(1 − e)` within tolerance (periapsis
  distance — hand-derived, not via the source).
- [x] Test `keplerianPositionMpc at M=π is apoapsis` — `M = π`: length equals
  `a(1 + e)`.
- [x] `npm test -- keplerianPositionMpc` → green. Commit.

## Task 4 — `ORBITAL_ELEMENTS` table + `OrbitalElements` type

**Files:** `src/@types/scene/OrbitalElements.d.ts` (new),
`src/data/bodies/orbitalElements.ts` (new),
`tests/data/bodies/orbitalElements.test.ts` (new).

The single source of truth (spec §5, §7). Type per the spec §5 sketch. Values:
the verified J2000 elements in spec §7 (Earth EMB, Jupiter — heliocentric,
`parentId: null`; Moon — `parentId: 'earth'`), authored via `SCALE_UNITS`
(au/km → Mpc) and `deg → rad`, with the `ω = ϖ − Ω`, `M = L − ϖ` arithmetic shown
in a comment at the seed site.

- [x] Add `OrbitalElements.d.ts` — one type, exactly the spec §5 shape (`type`,
  not `interface`; `Vec3` alias). _(Pre-satisfied by Task 2, which needed the
  type ahead of this task; no reshape required — all 9 fields present.)_
- [x] Add `orbitalElements.ts` — `ORBITAL_ELEMENTS: readonly OrbitalElements[]`
  (earth, jupiter, moon). Didactic docblock: this table is THE source of truth
  (bodies AND trails derive from it — spec §5), the frames (planets = ecliptic
  heliocentric, Moon = ecliptic geocentric), and the JPL provenance (spec §7
  URLs). No buried literals — every number is `<human value> * SCALE_UNITS.…` or
  `<deg> * DEG_TO_RAD`.
- [x] Test `ORBITAL_ELEMENTS has a valid structure` — the load-bearing
  invariants only (per `testing.md` — NOT a value restatement): every `id` is
  unique; every non-null `parentId` resolves to another entry's `id` OR to a
  seeded body id (the Moon's `'earth'`); `0 ≤ eccentricity < 1` for each;
  `semiMajorMpc > 0`.
- [x] `npm test -- orbitalElements` → green. Commit.

## Task 5 — Re-seed `sceneBodies` Earth / Jupiter / Moon from elements

**Files:** `src/data/bodies/sceneBodies.ts` (modify),
`tests/data/bodies/sceneBodies.test.ts` (modify if present).

Invert the dependency (spec §5): Earth/Jupiter/Moon `positionMpc` become
**derived** from `ORBITAL_ELEMENTS` via `keplerianPositionMpc` + parent, instead
of the placeholder literals (`sceneBodies.ts:70` Earth `[1 AU,0,0]`; `:159-163`
Moon along `yAxis`; `:170` Jupiter `[5.2 AU,0,0]`).

- Earth: `positionMpc = RENDER_ORIGIN_MPC + keplerianPositionMpc(EARTH_ELEMENTS)`.
- Jupiter: same, heliocentric.
- Moon: `positionMpc = SCENE_EARTH.positionMpc + keplerianPositionMpc(MOON_ELEMENTS)`
  (parent = Earth's now-derived position — spec §5 Moon gotcha).

The `EarthBody`/`PlanetBody` shapes are unchanged; only the numeric value of
`positionMpc` changes. All consumers read `positionMpc` dynamically
(`SCENE_BODIES` registry `sceneBodies.ts:184`, focus resolver, fly-to-Earth
framing) so they keep working against the new value.

**STOP-and-report check:** confirm no consumer depends on Earth being *literally*
`[1 AU, 0, 0]` (e.g. a test asserting that exact tuple, or a hard-coded camera
target). A literal-tuple assertion is a constant-restatement (`testing.md`) —
delete it, don't preserve the old value. If a NON-test consumer hard-codes the
axis, STOP and report rather than silently relocating it.

- [x] Re-point the three seeds to the derived positions; update the docblocks at
  `sceneBodies.ts:60-66` / `:143-154` (the "fixed placeholder" / "first-quarter
  geometry" prose is now stale — the positions are real J2000 mean positions
  derived from `ORBITAL_ELEMENTS`, single source of truth).
- [x] Delete any test asserting a literal placeholder position (constant
  restatement). Keep/extend a **structural** test: `sceneBodies derives the Moon
  relative to Earth` — assert `|Moon − Earth|` ≈ `MOON semiMajor`-scale (a
  lunar-distance order-of-magnitude band), proving the parent-relative derivation
  (not a value pin).
- [x] `npm test -- sceneBodies` → green.
- [x] **VISUAL GATE (needs `?deepZoom`) — CONFIRMED 2026-07-14:** the bodies sit
  at their true J2000 relative positions (Earth off the old `+x` axis); the descent
  still reaches Earth and the Sun/Earth/Moon/Jupiter (and the added planets) sit at
  believable relative places. Confirmed through the live dev-server iteration loop
  and the user's go-ahead to land the PR.

## Task 6 — `narrowMat3` + `composeOrbitConic` (the `f64` conic composer)

**Files:** `src/utils/math/narrowMat3.ts` (new) +
`tests/utils/math/narrowMat3.test.ts` (new);
`src/utils/camera/composeOrbitConic.ts` (new) +
`tests/utils/camera/composeOrbitConic.test.ts` (new).

`narrowMat3` is the 3×3 sibling of `narrowMat4` (`narrowMat4.ts:29`) — a
one-line `Float64Array → Float32Array` narrow of the 12-element padded `mat3d`
at the GPU-upload boundary.

`composeOrbitConic` implements spec §3.2: build `M` columns `[A;0]`, `[B;0]`,
`[Crel;1]`; `H = [ (VP·col).xyw ]`; viewport `V`; `G = V·H`; `Ginv = G⁻¹` — all
in `f64` (`mat3d`), narrowed once. Returns the inverse homography (pixel → plane)
the fragment needs (spec §3.3 — `Ginv` alone carries the stroke AND the trail).

**Signatures (match exactly):**

```ts
// narrowMat3.ts
export function narrowMat3(m: Float64Array): Float32Array;

// composeOrbitConic.ts
export function composeOrbitConic(
  slabVpF64: Float64Array, // view.slab.vp — the f64 seam, NEVER the narrowed view.vp
  centerMpc: Readonly<Vec3>, // C: absolute world (parent focus + centre-offset)
  semiMajorMpc: Readonly<Vec3>, // A
  semiMinorMpc: Readonly<Vec3>, // B
  viewportPx: Readonly<Vec2>, // SlabView.viewportPx (backing-store px)
  renderOriginMpc: Readonly<Vec3>,
): Float32Array; // Ginv as a 12-element padded mat3x3<f32> (column-major, std140)
```

- [x] Add `narrowMat3.ts` + test `narrowMat3 preserves the 12-element padded
  layout` — assert length 12 and element-wise equality to the source under f32
  rounding (this is the on-GPU-boundary contract, load-bearing like the
  `narrowMat4` narrow).
- [x] Add `composeOrbitConic.ts`. Didactic docblock: WHY compose the FULL `H` in
  `f64` before inverting (identical cancellation argument to
  `composeOrbitMvp.ts:15-27` — the large-`VP`-translation vs tiny-`Crel`
  cancellation is resolved at double precision), WHY only `x,y,w` clip rows
  (depthless additive — z is unused, spec §3.2), and WHY the return is `Ginv`
  alone (the fragment derives the conic value, the Sampson gradient, AND the
  back-projection from the single `q = Ginv·x` — spec §3.3). Note the `mat3d`
  zero-init landmine.
- [x] Test `composeOrbitConic back-projects the periapsis to plane (1,0)` — build
  a simple `f64` `VP` (e.g. `mat4d.perspective` ∘ `mat4d.lookAt`) + a viewport;
  forward-project the world point `C + A` to a pixel by the **standard pipeline**
  (clip = `VP·[Crel+A;1]`, NDC, viewport — computed independently of the util);
  feed the pixel to the returned `Ginv` as `q = Ginv·(px,py,1)`; assert
  `q.z > 0` and `(q.x/q.z, q.y/q.z) ≈ (1, 0)`. (Round-trip property — the forward
  projection is not the inverse under test, so this is not a mirror.)
- [x] Test `composeOrbitConic back-projects the E=90° point to plane (0,1)` — same
  construction with `C + B` → `(0, 1)`.
- [x] Test `composeOrbitConic places an off-ellipse point outside the unit
  circle` — forward-project `C + 2A` → back-project → `(s,t) ≈ (2,0)`,
  `s² + t² ≈ 4 > 1` (the conic's inside/outside sign is correct).
- [x] `npm test -- narrowMat3 composeOrbitConic` → green. Commit.

## Task 7 — `OrbitConic` type + `SCENE_ORBIT_CONICS` derived table

**Files:** `src/@types/scene/OrbitConic.d.ts` (new),
`src/data/bodies/sceneOrbitConics.ts` (new),
`tests/data/bodies/sceneOrbitConics.test.ts` (new).

The per-orbit absolute-world ellipse the layer consumes (spec §5–§6 shape).
Derived from `ORBITAL_ELEMENTS` (Task 4) + `keplerianEllipse` (Task 2) + parent
resolution: `centerMpc = parentWorld + keplerianEllipse(el).centerOffsetMpc`,
`semiMajorMpc`/`semiMinorMpc` from `keplerianEllipse`, `eccentricity` +
`meanAnomalyRad` + `color` copied from the elements. Parent world position:
`null` → `RENDER_ORIGIN_MPC`; `'earth'` → `SCENE_EARTH.positionMpc` (Task 5,
already derived).

- [x] Add `OrbitConic.d.ts` — one type, exactly the spec §5 sketch.
- [x] Add `sceneOrbitConics.ts` — `SCENE_ORBIT_CONICS: readonly OrbitConic[]`.
  Didactic docblock: derived-from-elements (single source of truth, spec §5), the
  parent-resolution rule (Sun origin vs Earth for the Moon), and that this REPLACES
  the outgoing `sceneOrbits.ts` (`SCENE_ORBITS` derived from body seeds — the
  inverted dependency).
- [x] Test `SCENE_ORBIT_CONICS places each body on its own ellipse` — for each
  conic, take the matching body's world position `X_body` (`SCENE_BODIES`), form
  plane coords by projecting onto the `A`,`B` basis — `s = (X_body − C)·A / |A|²`,
  `t = (X_body − C)·B / |B|²` (the solution of `X_body = C + s·A + t·B` since
  `A ⟂ B`) — and assert `s² + t² ≈ 1` within tolerance — the structural
  body-on-trail invariant
  (spec §5), an independent check (uses `keplerianPositionMpc`'s output via the
  body seed, verified against the ellipse basis, not a formula mirror).
- [x] Test `SCENE_ORBIT_CONICS resolves the Moon's centre to Earth` — assert the
  Moon conic's `centerMpc ≈ SCENE_EARTH.positionMpc` (parent resolution, spec §5).
- [x] `npm test -- sceneOrbitConics` → green. Commit.

## Task 8 — `orbitTrailRenderer` + WESL shader family

**Files:** `src/@types/rendering/OrbitTrailRenderer.d.ts` (new),
`src/services/gpu/renderers/orbitTrailRenderer.ts` (new),
`src/services/gpu/shaders/orbitTrail/io.wesl` + `vertex.wesl` + `fragment.wesl`
(new), `tests/services/gpu/renderers/orbitTrailRenderer.test.ts` (new — mirror
the ring renderer's existing test if one exists, headless pipeline/handle shape).

The instanced fullscreen-triangle renderer (spec §6). Twin of
`orbitRingRenderer.ts` on the instancing + pipeline-profile side (additive
one/one into the caller's `rgba16float` HDR target, no depth, `cullMode: 'none'`,
empty bind-group layout, one `writeBuffer` + one instanced draw). Reuse
`MAX_ORBITS` / `INSTANCE_FLOATS` = 20 / `INSTANCE_STRIDE` = 80 unchanged
(`orbitRingRenderer.ts:52-67`).

**Type (match exactly):**

```ts
// OrbitTrailRenderer.d.ts
export type OrbitTrailRenderer = Renderer & {
  draw(pass: GPURenderPassEncoder, instances: Float32Array, count: number): void;
};
```

**Factory (match exactly):**

```ts
export function createOrbitTrailRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
): OrbitTrailRenderer;
```

**Per-instance record — 20 floats / 80-byte stride (locations 1–5, byte
offsets):**

| loc | offset | format      | contents                                        |
| --- | ------ | ----------- | ----------------------------------------------- |
| 1   | 0      | float32x4   | `Ginv` column 0 (padded mat3x3 col; .xyz used)  |
| 2   | 16     | float32x4   | `Ginv` column 1                                 |
| 3   | 32     | float32x4   | `Ginv` column 2                                 |
| 4   | 48     | float32x4   | `color.rgb` in .xyz, `eccentricity` in .w       |
| 5   | 64     | float32x4   | `meanAnomalyRad` in .x, .yzw pad                |

Fullscreen-triangle geometry is generated in the vertex shader from
`@builtin(vertex_index)` — **no position VBO**; the pipeline's only vertex buffer
is the instance-step record above.

- [x] Add `orbitTrail/io.wesl` — `struct VSOut` with `@builtin(position) clip`
  and flat varyings: three `vec3<f32>` `Ginv` columns, `vec3<f32>` color, `f32`
  eccentricity, `f32` meanAnomaly. Didactic comment (single quotes, NO
  backticks): one authoritative inter-stage decl makes location drift impossible
  (mirror `orbitRing/io.wesl`), and every varying is `@interpolate(flat)` (all
  per-instance constants).
- [x] Add `orbitTrail/vertex.wesl` — emit the fullscreen triangle from
  `@builtin(vertex_index)`; pass the per-instance `Ginv` columns + color + e + M
  through flat. Didactic comment: WHY fullscreen (the projected conic lands
  anywhere on screen — spec §2 rejected bounding-quad), WHY per-instance
  attributes not a uniform (the writeBuffer-vs-submit house idiom).
- [x] Add `orbitTrail/fragment.wesl` — implement spec §3.3 EXACTLY:
  `q = Ginv · vec3(pos.xy, 1)`; `discard`/skip where `q.z <= 0` (behind camera);
  `f = q.x*q.x + q.y*q.y − q.z*q.z`; `d = transpose(Ginv) * vec3(q.x, q.y, −q.z)`
  (or the explicit column form); `sampson = abs(f) / (2 * length(d.xy))`;
  `stroke = 1 − smoothstep(0, STROKE_PX, sampson)`; `E = atan2(t, s)` with
  `s = q.x/q.z, t = q.y/q.z`; `M = E − e*sin(E)`;
  `delta = (M_body − M) wrapped to [0, 2π)`;
  `brightness = TRAIL_FLOOR + (1 − TRAIL_FLOOR)*exp(−TRAIL_DECAY*delta)`; output
  `vec4(color*brightness*stroke, 1)`. Consts `STROKE_PX ≈ 1.5`,
  `TRAIL_DECAY = 1.2`, `TRAIL_FLOOR = 0.15` (carried from
  `orbitRing/fragment.wesl:44-48`). Didactic comment: WHY Sampson (constant-width
  AA + general-conic robustness through the edge-on parabola/hyperbola
  degeneracy — spec §3.3), WHY forward Kepler `M = E − e sin E` needs no GPU
  solve, WHY the `f32` back-projection is harmless (feeds only slowly-varying
  brightness — spec §3.3). NO backticks anywhere.
- [x] Add `orbitTrailRenderer.ts` — pipeline + `draw` + `destroy` per the ring
  renderer's structure, fullscreen-triangle geometry, the instance layout above.
  Didactic module header mirroring `orbitRingRenderer.ts:1-42` but for the conic
  (spec §2 rationale — exact ellipse, no tessellation, pixel-space numerically
  benign).
- [x] Add `OrbitTrailRenderer.d.ts` — one type.
- [x] Test `orbitTrailRenderer.test.ts` — whatever headless shape the ring
  renderer's test used (handle shape: `label`, `draw`, `destroy`; `draw` clamps
  `count` to `MAX_ORBITS`; a zero-count `draw` is a no-op). If the ring renderer
  had no test, add only the `draw`-clamp/no-op behaviour (no pipeline
  restatement).
- [x] `npm test -- orbitTrailRenderer` → green.
- [x] **VISUAL GATE (needs `?deepZoom`) — deferred to Task 9** (the renderer is
  not wired until the layer swap). Commit the renderer + shaders.

## Task 9 — `orbitTrailsLayer`, wire it in, swap the handle

**Files:** `src/services/engine/frame/passes/orbitTrailsLayer.ts` (new) +
`tests/services/engine/frame/passes/orbitTrailsLayer.test.ts` (new — mirror
`orbitRingsLayer` test idioms if present);
`src/services/engine/frame/passes/index.ts` (modify — swap the import + registry
row + re-export); `src/services/engine/phases/initGpu.ts` (modify — swap the
handle construction at `:425`, import at `:70`);
`src/@types/engine/handles/EngineGpuHandles.d.ts` (modify — rename the slot).

The layer is the twin of `orbitRingsLayer.ts:42-81`: `(hdr, NEAR0)`, additive,
`enabled` gates on the renderer handle alone (`SCENE_ORBIT_CONICS` is a static
table). Per frame, per conic: `composeOrbitConic(view.slab.vp, conic.centerMpc,
conic.semiMajorMpc, conic.semiMinorMpc, view.viewportPx, RENDER_ORIGIN_MPC)`
→ `Ginv` (12 f32); pack the 20-float record (Ginv 12 + `color.rgb`+`e` +
`M_body`); one `renderer.draw(pass, staging, n)`. Reuse a module-level `staging`
`Float32Array(MAX_ORBITS * INSTANCE_FLOATS)` (hot-path zero-alloc, per
`orbitRingsLayer.ts:37-40`).

**The `f64` seam is a hard invariant** — compose from `view.slab.vp`, NEVER
`view.vp` (`orbitRingsLayer.ts:14-21`). Document it in the layer header.

- [x] Add `orbitTrailsLayer.ts` — the `ContentLayer` row, reading
  `SCENE_ORBIT_CONICS`, composing via `composeOrbitConic`. Didactic header
  mirroring `orbitRingsLayer.ts:1-28` (row shape, the `f64` seam, handle-only
  gate).
- [x] Swap `passes/index.ts`: replace the `orbitRingsLayer` import (`:151`),
  the registry entry (`:183`, in the `(hdr, NEAR0)` group after `starPointsLayer`),
  and the re-export (`:228`) with `orbitTrailsLayer`. Update the draw-order
  docblock (`:41-43`) to name the conic trails.
- [x] Swap `initGpu.ts`: `state.gpu.orbitTrailRenderer =
  createOrbitTrailRenderer(device, 'rgba16float')` (`:425`), import at `:70`.
- [x] Rename the `EngineGpuHandles` slot `orbitRingRenderer` →
  `orbitTrailRenderer` (find it in `EngineGpuHandles.d.ts`); update the layer's
  `enabled`/`draw` handle reads to the new name.
- [x] Test `orbitTrailsLayer.test.ts` — `slab === NEAR0`, `target === 'hdr'`,
  `blend === 'additive'`; `enabled` false when the handle is null, true when
  present; `draw` composes one record per conic and calls `renderer.draw` with
  `count === SCENE_ORBIT_CONICS.length` (spy renderer, mirror the ring-layer
  test).
- [x] `npm test -- orbitTrailsLayer` → green.
- [x] **VISUAL GATE (needs `?deepZoom`) — CONFIRMED 2026-07-14:** each orbit is a
  smooth **ellipse** (not a circle) with a constant-width stroke from galaxy scale
  down to Earth-surface (no steps, no jitter at deep zoom); the body sphere sits
  **on** its trail; the brightness tail trails **behind** the moving body; no
  phantom arc appears behind the camera as a plane goes edge-on. Confirmed through
  the live iteration loop that also fixed the near-edge-on flare (plane-space
  stroke metric), the grazing-angle horizon line (Newton-consistency reject), and
  added the apparent-size fade — plus the per-planet moon tilt.

## Task 10 — Delete the circle-SDF ring version (grep-gated)

**Files (delete):** `src/services/gpu/renderers/orbitRingRenderer.ts`,
`src/@types/rendering/OrbitRingRenderer.d.ts`,
`src/services/gpu/shaders/orbitRing/{io,vertex,fragment}.wesl`,
`src/services/engine/frame/passes/orbitRingsLayer.ts`,
`src/data/bodies/sceneOrbits.ts`, `src/@types/scene/SceneOrbit.d.ts`,
`src/utils/camera/composeOrbitMvp.ts`, and each file's mirror test.

- [x] Delete the files above.
- [x] **Grep gate — no references left** (the deletion is real, not orphaned):
  a repo search for `orbitRing`, `OrbitRingRenderer`, `SCENE_ORBITS`,
  `SceneOrbit`, `composeOrbitMvp`, and the `orbitRingRenderer` handle name
  returns ZERO hits outside this plan/spec. (The main thread runs the search —
  background subagents cannot; `feedback_bg_subagents_no_npm`.)
- [x] `npm run typecheck` → clean (proves nothing imported a deleted symbol).
- [x] `npm test` → green (the deleted mirror tests are gone; nothing else broke).
- [x] Commit.

## Task 11 — Entanglement-radar pass + full gate

**Files:** none new — a review pass over the plan-04 diff + the final gate.

Run the `entanglement-radar` skill over the feature diff per
`docs/superpowers/conventions/simplicity.md`. The design-time trigger applies:
any place this plan handles an "asymmetry"/"special-case"/"must-remember-to" is a
STOP-and-classify signal (essential vs accidental), not a note to write more
carefully.

**Known candidates to classify (name reader + writer of each; mismatch = mirror
to un-braid):**

- **Element table ↔ body seed ↔ trail (the core un-braid).** Confirm both the
  body position (`sceneBodies.ts`, Task 5) and the trail (`sceneOrbitConics.ts`,
  Task 7) DERIVE from the one `ORBITAL_ELEMENTS` table — there is no second copy
  of an orbit's geometry, so the body cannot drift off its trail. Expected:
  **essential + un-braided** (one source, two derivations). If any placeholder
  literal survives in `sceneBodies` for the three orbiting bodies, it is an
  accidental mirror — fold it.
- **Moon's parent position.** The Moon conic's centre and the Moon body's focus
  must both resolve to Earth's *derived* position, not two independent Earth
  references. Confirm one path (`SCENE_EARTH.positionMpc`, itself derived) feeds
  both.
- **Conic composer ↔ slab `vp` seam.** Confirm `orbitTrailsLayer` composes from
  `view.slab.vp` (the `f64` matrix), never `view.vp` — the same hard invariant
  the ring layer carried. A single reader of the `f64` seam; no narrowed-`vp`
  path into the composer.
- **`Ginv` is the single carried matrix.** Confirm the fragment derives the
  stroke, the Sampson gradient, AND the back-projection from one `q = Ginv·x`
  (spec §3.3) — no separately-uploaded conic-coefficient matrix that could drift
  from `Ginv`.
- **Stride/layout parity.** `INSTANCE_FLOATS`/`INSTANCE_STRIDE` (TS) ↔ the
  `orbitTrail/vertex.wesl` `@location` byte offsets — a single home for the 80-byte
  record, verified by the Task 8 offset table (invisible-until-iOS-drops-the-frame
  class, `testing.md` keep-rule).

- [x] Ran `entanglement-radar` over the feature diff. All five flagged candidates
  are **essential + un-braided** (verdicts in the PR body): (1) the element table
  is the single source — both `sceneBodies` (`keplerianPositionMpc`) and
  `sceneOrbitConics` (`keplerianEllipse`) derive from it, no surviving placeholder
  literal; (2) a moon's parent resolves through one `SCENE_BODIES` lookup, not two
  Earth references; (3) `orbitTrailsLayer` composes from `view.slab.vp` only,
  never `view.vp`; (4) the fragment carries one `Ginv`, deriving stroke + trail +
  back-projection from `q = Ginv·x`; (5) `INSTANCE_FLOATS`/`STRIDE`/`MAX_ORBITS`
  have one home in `orbitTrailRenderer`, imported by the layer. New surfaces from
  the post-plan planet/moon work are also clean: the optional `plane` field has one
  reader (`keplerianEllipse`), and the `satellite()` maker's fixed `Ω/ω/M = 0` is an
  ESSENTIAL asymmetry (moon angular phase is not tabulated), not an accidental
  mirror of the planet rows. Follow-up (`data/bodies/` reorg — duplicated
  `DEG_TO_RAD`, inline makers, scattered palette) captured in
  `docs/backlog/2026-07-14-data-bodies-cleanup.md`.
- [x] `npm run typecheck` (both src + tools tsconfigs) → clean.
- [x] `npm test` (full suite) → 3922 passed.
- [x] PR body records the user-confirmed visual properties (Tasks 5, 9), confirmed
  through the live dev-server iteration loop (flare fix, trail brightness, horizon
  reject, apparent-size fade, all-8-planets "looks great", per-planet moon tilt):
  body relocation acceptable; smooth exact ellipses at deep zoom; body-on-trail;
  trailing brightness; no behind-camera phantom arc.
- [x] Commit.

---

## Self-review (done before finalising this plan)

### Spec-coverage map

| Spec section                                   | Task(s)         |
| ---------------------------------------------- | --------------- |
| §3.1 elements → ellipse `A`,`B`,`C`            | T2 (+ T1 solve) |
| §3.1 body-on-ellipse (`keplerianPositionMpc`)  | T3              |
| §3.2 plane → pixel homography `Ginv`           | T6              |
| §3.3 fragment (Sampson + trail + w-clip)       | T8 (fragment)   |
| §4 render placement `(hdr, NEAR0)` additive    | T9              |
| §5 element table = single source of truth      | T4, T5, T7      |
| §5 body relocation consequence                 | T5 (visual gate)|
| §6 instanced fullscreen renderer               | T8              |
| §7 verified J2000 elements                     | T4 (+ table)    |
| §8 replaced surfaces (deletion, grep-gated)    | T10             |
| §9 testing (pure units + visual)               | T1–T3, T6–T9    |
| entanglement-radar (§5 un-braid + seams)       | T11             |

### Placeholder scan

None. Every task has concrete files, signatures/byte-tables, and test names.

### Contract conflicts / seams found

- **Instance stride reused verbatim.** The conic record is 20 floats / 80 bytes,
  identical to `orbitRingRenderer`'s (`orbitRingRenderer.ts:52-67`), so
  `MAX_ORBITS`/`INSTANCE_FLOATS`/`INSTANCE_STRIDE` carry over — only the record's
  *contents* change (MVP columns → `Ginv` columns + trail params).
- **No new frame-program step.** The trail rides the existing `(hdr, NEAR0)` step
  (`frameProgram.ts:64`), same as the ring — the swap is a registry-row + handle
  rename, not a program edit.
- **`foregroundFrustum` far floor is load-bearing here.** `FAR_MIN_MPC = 3e-11`
  (`foregroundFrustum.ts:53`) already encloses Jupiter's 5.2 AU orbit; the conic
  trails inherit that clip-safety unchanged (plan 03 T1/T2, landed on PR #425).
- **`mat3d` padded layout.** `wgpu-matrix` `mat3d` is 12 elements (3 vec4-aligned
  columns); `narrowMat3` and the `float32x4`×3 `Ginv` instance columns both
  respect that padding, matching WGSL `mat3x3<f32>` std140 — called out in T6/T8
  so the executor does not pack a tight 9-float matrix that would mis-align.
- **Dependency inversion is the one non-refactor change.** Everything else points
  at existing code; T4/T5/T7 introduce the element table and flip
  body→orbit into elements→(body, orbit). T11's radar gates that it is one source
  with two derivations, not a new mirror.
</content>
