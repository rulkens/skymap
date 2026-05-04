# Procedural Disk Impostor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render every galaxy with apparent size > 12 px as a 3D-oriented procedural galaxy impostor (bulge + disk profile) that takes over from the screen-aligned point billboard. No texture dependency, no fetch latency. Fully world-oriented so camera roll/orbit reveals real 3D shape — flying around an inclined galaxy genuinely opens it up to face-on.

**Architecture:** New sibling renderer (`proceduralDiskRenderer.ts` + `proceduralDisks.wgsl`) parallel to the existing texture-based `diskRenderer`. Shares the 3D-oriented vertex-stage geometry but the fragment stage runs a procedural Sérsic-like profile (Gaussian bulge + exponential disk, colour-index ramp modulated with bulge-redder / disk-bluer two-component shifts). The engine per-frame loop emits procedural-disk instances for galaxies above 8 px apparent size (transition band lower edge); inside 8–14 px both the point billboard and the procedural disk render with crossfading alphas; above 14 px only the procedural disk renders.

**Tech Stack:** WebGPU + WGSL, TypeScript, Vitest. No new runtime dependencies.

**Locked design decisions** (settled with the user before plan-write):

| Question | Decision |
|---|---|
| Activation threshold | `px > 12` with smooth crossfade across 8–14 px band |
| Brightness profile | Gaussian bulge + exponential disk (two-component) |
| Colour | Colour-index ramp drives base hue; bulge mixes warmer (`vec3(1.0, 0.6, 0.4)`); disk mixes cooler (`vec3(0.7, 0.85, 1.0)`) |
| Pipeline placement | New sibling renderer (option a) — parallel to `diskRenderer`, no shared code path |
| Interaction with point pass | Crossfade-only across 8–14 px — point alpha fades out, disk alpha fades in; below 8 px only point, above 14 px only disk |
| Camera-roll behaviour | Fully world-oriented — disk plane is real 3D; camera roll rotates disks with the world; orbiting changes apparent inclination |

---

## File Structure

**Create:**
- `src/services/gpu/proceduralDiskRenderer.ts` — render pipeline + draw method.
- `src/services/gpu/shaders/proceduralDisks.wgsl` — vertex (3D quad) + fragment (procedural profile).
- `src/utils/math/galaxyProfile.ts` — pure profile math (`bulgeBrightness`, `diskBrightness`, `combinedBrightness`). Tested in isolation.
- `src/@types/ProceduralDiskInstance.d.ts` — per-instance vertex-buffer record type.
- `tests/utils/math/galaxyProfile.test.ts`
- `tests/services/gpu/proceduralDiskRenderer.test.ts` (smoke test of pipeline construction; visual correctness verified manually).

**Modify:**
- `src/services/gpu/shaders/points.wgsl` — fragment-stage alpha fade-out across 8–14 px so the screen-aligned billboard crossfades into the procedural disk.
- `src/services/engine/thumbnailSubsystem.ts` — per-frame loop emits procedural-disk instances alongside the existing `quads` / `disks` arrays; the post-refactor per-frame quad/disk collection lives here, not in `engine.ts`.
- `src/services/engine/engine.ts` — constructs the new `ProceduralDiskRenderer` next to the existing `DiskRenderer` and hands it into `thumbnails.bindToRenderers(...)`; passes crossfade-band constants to the points pass via the existing per-frame uniform path.
- `src/services/engine/engine.ts` — pixel-size threshold lowered for ALL galaxies (not just famous + already-thumbnail-fetched) so the disk pass sees them. Currently the outer gate is `APPARENT_SIZE_THRESHOLD_PX = 24`; we add a second gate at 8 specific to the procedural-disk path.
- `src/services/gpu/pointRenderer.ts` — extend Uniforms struct with two new f32 fields (`pxFadeStart`, `pxFadeEnd`) used by the points fragment shader. Pad to 16 bytes.
- `README.md` — short subsection documenting the new pass.

**Why a sibling renderer instead of extending diskRenderer?** The existing diskRenderer's fragment stage is locked to texture sampling; conditionalising it on a per-instance "is procedural?" flag would slow every textured-disk fragment with a branch and uglify the shader. Two siblings is cleaner — same vertex stage (literally a copy with a comment pointing at the original), divergent fragment stages.

---

## Conventions

- Didactic comments throughout. Match the existing project style — multi-paragraph module headers explaining WHY (the pipeline trade-off, why bulge+disk over single Sérsic, why crossfade instead of hard switch, the camera-roll consequence of world-oriented impostors).
- `type` aliases not interfaces.
- Tests under `tests/` mirror the src tree.
- Run from `/Users/rulkens/Development/js/skymap`.
- Vitest. `npx vitest run <path>` for one file; `npm test` for the whole suite (currently 343 passing).

---

## Task 0: Pre-flight — confirm clean baseline

**Files:** none.

- [ ] **Step 1: Confirm working tree is clean (or only carries unrelated WIP)**

Run: `git -C /Users/rulkens/Development/js/skymap status`

Expected: any pending changes are clearly unrelated to disks/renderers. If anything in `src/services/gpu/` or `src/services/engine/engine.ts` is uncommitted, commit or stash before starting — those are the surfaces this plan will touch heavily.

- [ ] **Step 2: Confirm tests are green**

Run: `npm test`

Expected: 343/343 pass. If anything is red, fix before starting.

- [ ] **Step 3: Confirm the dev server is running and the renderer is functional**

Per `CLAUDE.md`, `npm run dev` is left running. Open the canvas in a browser; a galaxy field should be visible. This is the baseline you're going to compare against in Task 10.

---

## Task 1: Pure math helpers — galaxy profile functions

**Files:**

- Create: `src/utils/math/galaxyProfile.ts`
- Create: `tests/utils/math/galaxyProfile.test.ts`

The two-component brightness model — testable in isolation, then ported verbatim into the fragment shader in Task 5.

- [ ] **Step 1: Write failing tests**

Create `tests/utils/math/galaxyProfile.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  bulgeBrightness,
  diskBrightness,
  combinedBrightness,
} from '../../../src/utils/math/galaxyProfile';

describe('galaxyProfile', () => {
  describe('bulgeBrightness', () => {
    it('peaks at the centre (r=0)', () => {
      expect(bulgeBrightness(0)).toBeCloseTo(1.0, 6);
    });
    it('decays as Gaussian: half-power at r ≈ 0.5 with default scale', () => {
      // Default bulge scale = 0.4 (40% of disk radius).
      // exp(-(0.5)² / (2·0.4²)) = exp(-0.25/0.32) ≈ exp(-0.78) ≈ 0.46
      expect(bulgeBrightness(0.5)).toBeCloseTo(0.458, 2);
    });
    it('is essentially zero at the disk edge (r=1)', () => {
      expect(bulgeBrightness(1.0)).toBeLessThan(0.05);
    });
  });

  describe('diskBrightness', () => {
    it('peaks at the centre (r=0)', () => {
      expect(diskBrightness(0)).toBeCloseTo(1.0, 6);
    });
    it('exponential falloff: 1/e at r = scaleRadius (default 0.5)', () => {
      expect(diskBrightness(0.5)).toBeCloseTo(Math.exp(-1), 3);
    });
    it('is faint but non-zero at r=1', () => {
      // exp(-1/0.5) = exp(-2) ≈ 0.135
      expect(diskBrightness(1.0)).toBeCloseTo(0.135, 2);
    });
  });

  describe('combinedBrightness', () => {
    it('returns bulge·bulgeWeight + disk·diskWeight', () => {
      // At r=0 both peaks contribute their full weight.
      const c = combinedBrightness(0, 0.6, 0.4);
      expect(c).toBeCloseTo(1.0, 6); // weights sum to 1; both peak at 1
    });
    it('weights mix correctly at intermediate radius', () => {
      // r=0.5: bulge ≈ 0.458, disk = 1/e ≈ 0.368
      const c = combinedBrightness(0.5, 0.6, 0.4);
      expect(c).toBeCloseTo(0.458 * 0.6 + 0.368 * 0.4, 2);
    });
    it('is non-negative everywhere', () => {
      for (let r = 0; r <= 2; r += 0.1) {
        expect(combinedBrightness(r, 0.6, 0.4)).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx vitest run tests/utils/math/galaxyProfile.test.ts`

Expected: FAIL with "Cannot find module '../../../src/utils/math/galaxyProfile'".

- [ ] **Step 3: Implement the module**

Create `src/utils/math/galaxyProfile.ts`:

```ts
/**
 * galaxyProfile — pure brightness functions for the procedural galaxy
 * impostor.
 *
 * The impostor's fragment stage shades a 3D-oriented quad with a
 * two-component brightness profile that approximates a real galaxy:
 *
 *   - A Gaussian bulge concentrated at the centre (mimics the de
 *     Vaucouleurs / Sérsic n≈4 light distribution of a stellar bulge,
 *     without the cost of a true Sérsic call which needs an iterative
 *     gamma function lookup).
 *
 *   - An exponential disk extending out to the impostor's edge (Sérsic
 *     n=1 — the canonical thin-disk profile for spiral galaxies).
 *
 * Both functions take a normalised radius `r` where r=0 is the galaxy
 * centre and r=1 is the apparent edge of the impostor's billboard quad.
 * Everything beyond r=1 should be treated as zero (we don't extrapolate
 * the tails — the renderer's quad-edge `discard` handles that cleanly).
 *
 * Why pure JS helpers + WGSL re-implementation instead of just WGSL?
 * Because the WGSL math is hard to test directly — there's no GPU-side
 * unit-test framework in this project.  Implementing the formulas as
 * pure TS and unit-testing them gives us a reference oracle: when the
 * shader's output looks wrong in-browser, we can compare visually
 * against what these helpers would produce on the CPU at the same r.
 */

const BULGE_SIGMA = 0.4;
const DISK_SCALE = 0.5;

/**
 * Gaussian bulge component, peaked at r=0 with σ = BULGE_SIGMA.
 *
 * `B(r) = exp(-r² / (2σ²))`.  Returns values in [0, 1].
 *
 * The 0.4 σ choice puts the bulge's half-power point at roughly r=0.47
 * — a visually believable inner-third "core" that fades cleanly into
 * the surrounding disk by r=0.7 or so.  Tighter values make the core
 * look like a hot dot; looser values fight the disk's exponential
 * falloff and make the galaxy look uniform.
 */
export function bulgeBrightness(r: number): number {
  return Math.exp(-(r * r) / (2 * BULGE_SIGMA * BULGE_SIGMA));
}

/**
 * Exponential disk component (Sérsic n=1), peaked at r=0 with scale
 * radius DISK_SCALE.
 *
 * `D(r) = exp(-r / scaleRadius)`.  Returns values in [0, 1] for r ∈ [0, ∞).
 *
 * The 0.5 scale-radius choice places the disk's 1/e point at half the
 * impostor radius, leaving a visible fainter outer halo that fades to
 * ~13.5 % at the quad edge (r=1).  Below the disk-rendering threshold
 * the contribution is negligible and the quad-edge discard kicks in.
 */
export function diskBrightness(r: number): number {
  return Math.exp(-r / DISK_SCALE);
}

/**
 * Combine the two components with caller-supplied weights.  Typical
 * weights for a Sb spiral would be `bulgeWeight=0.5, diskWeight=0.5`;
 * an Sa-type galaxy with a strong bulge might use `0.7 / 0.3`; an Sd
 * with no significant bulge would use `0.2 / 0.8` or even `0.0 / 1.0`.
 *
 * For the v1 of the impostor we use a single fixed `0.6 / 0.4` blend
 * everywhere — see Task 5's fragment shader.  Per-galaxy Hubble-type
 * dispatch is parked as future work (the type strings are sparse outside
 * Famous + a few catalog rows).
 *
 * Returns values in [0, bulgeWeight + diskWeight] (typically [0, 1] when
 * the weights sum to 1).
 */
export function combinedBrightness(
  r: number,
  bulgeWeight: number,
  diskWeight: number,
): number {
  return bulgeBrightness(r) * bulgeWeight + diskBrightness(r) * diskWeight;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npx vitest run tests/utils/math/galaxyProfile.test.ts`

Expected: 3 + 3 + 3 = 9 tests pass.

- [ ] **Step 5: Add to barrel + commit**

Append to `src/utils/math/index.ts`:

```ts
export * from './galaxyProfile';
```

Run typecheck:
```
npx tsc --noEmit
```

Expected: clean.

Commit:
```bash
git add src/utils/math/galaxyProfile.ts src/utils/math/index.ts tests/utils/math/galaxyProfile.test.ts
git commit -m "feat(math): galaxyProfile helpers (bulge + disk Sérsic-like brightness)"
```

---

## Task 2: Define the per-instance type + transition-band constants

**Files:**

- Create: `src/@types/ProceduralDiskInstance.d.ts`

The vertex-buffer record passed to the new renderer.  Mirrors the existing `DiskInstance` type but **without** the texture UV rect (no atlas sampling).

- [ ] **Step 1: Create the type definition**

Create `src/@types/ProceduralDiskInstance.d.ts`:

```ts
/**
 * ProceduralDiskInstance — one entry in the procedural-disk pass's
 * per-instance vertex buffer.  Mirrors the texture-based `DiskInstance`
 * (see `src/services/gpu/diskRenderer.ts`) but drops the atlas UV rect
 * — the procedural fragment shader doesn't sample any texture.
 *
 * Each instance describes one galaxy as a 3D-oriented quad in world
 * space:
 *
 *   - `(x, y, z)` is the galaxy's world-space centre in Mpc, identical
 *     to the position used by the points pass and the textured-disk pass.
 *   - `sizeWorldMpc` is the half-extent of the impostor quad in Mpc
 *     (one half-major-axis on the disk's plane).  The vertex shader
 *     scales the quad corners by this — it's the same value the
 *     existing diskRenderer uses, derived from `diameterKpc`.
 *   - `axisRatio` is `b/a` ∈ (0.05, 1].  The vertex shader uses it to
 *     foreshorten one of the in-plane axes so the projected disk
 *     appears at the catalogued inclination.
 *   - `positionAngleDeg` is the east-of-north position angle of the
 *     major axis in degrees, [0, 180).  Same convention the texture-
 *     based disk uses.
 *   - `colourIndex` is the per-row colour-index value (already
 *     normalised 0..2 by the engine — same scalar that drives the
 *     points-pass colour ramp).
 *   - `crossfadeAlpha` is the [0, 1] fade-in coefficient computed by
 *     the engine each frame from `apparentSizePx`: 0 below 8 px, 1
 *     above 14 px, smoothstep in between.  The fragment shader
 *     multiplies the final RGBA by this so the disk fades in as the
 *     point fades out.
 *
 * Layout: 8 floats = 32 bytes per instance.  Vertex buffer stride is
 * therefore 32 bytes; the renderer's pipeline descriptor declares
 * `stepMode: 'instance'` so each draw-call vertex sees the same record
 * for all six corner vertices.
 */
export type ProceduralDiskInstance = {
  x: number;
  y: number;
  z: number;
  sizeWorldMpc: number;
  axisRatio: number;
  positionAngleDeg: number;
  colourIndex: number;
  crossfadeAlpha: number;
};
```

- [ ] **Step 2: Define the band constants in a co-located place**

The constants live where the engine emits instances — `src/services/engine/engine.ts`.  At module top, near the existing `APPARENT_SIZE_THRESHOLD_PX = 24`, add:

```ts
/**
 * Procedural-disk crossfade band, in apparent-pixels.
 *
 *   - Below `PROCEDURAL_DISK_FADE_START_PX` (8): only the screen-aligned
 *     point billboard renders.  Distant galaxies look like soft glows.
 *   - Inside the band [8, 14): both passes render simultaneously with
 *     complementary alphas (smoothstep crossfade).
 *   - Above `PROCEDURAL_DISK_FADE_END_PX` (14): only the procedural
 *     disk renders.  The point pass has fully faded out.
 *
 * Picking these specific values:
 *
 *   - The band's lower edge (8) is roughly where a screen-aligned point
 *     starts to look pixelated rather than a clean glow — bigger than
 *     that, the eye expects to see structure.
 *   - The band width (6 px) is wide enough that the crossfade is
 *     visually smooth at typical zoom rates and narrow enough that
 *     there's a clean "all disk" regime.
 *   - The upper edge (14) is well below the existing
 *     APPARENT_SIZE_THRESHOLD_PX = 24 (the threshold for the textured
 *     disk pass), so the procedural impostor takes over long before the
 *     textured one would have engaged — exactly the visibility gap
 *     this feature exists to fill.
 */
const PROCEDURAL_DISK_FADE_START_PX = 8;
const PROCEDURAL_DISK_FADE_END_PX = 14;
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`

Expected: clean.  Nothing imports the new type yet — this just confirms the declaration parses.

- [ ] **Step 4: Commit**

```bash
git add src/@types/ProceduralDiskInstance.d.ts src/services/engine/engine.ts
git commit -m "feat(types): ProceduralDiskInstance + crossfade band constants"
```

---

## Task 3: Procedural-disk vertex shader — 3D-oriented quad geometry

**Files:**

- Create: `src/services/gpu/shaders/proceduralDisks.wgsl`

The vertex stage is structurally identical to the existing `disks.wgsl` — same orientation math.  Differs only in: no atlas binding, no UV outputs, includes a varying for `colourIndex` and `crossfadeAlpha`.

- [ ] **Step 1: Read the existing diskRenderer vertex stage as reference**

Read `src/services/gpu/shaders/disks.wgsl` lines 1–180 (vertex stage + shared structs).  The geometry math (constructing the disk-plane basis from `axisRatio` and `positionAngleDeg`, then projecting corners through `viewProj`) is what we reuse verbatim.

- [ ] **Step 2: Write the new shader**

Create `src/services/gpu/shaders/proceduralDisks.wgsl`:

```wgsl
// proceduralDisks.wgsl — 3D-oriented procedural galaxy impostors.
//
// Sibling pass to `disks.wgsl` (texture-based disks) and `points.wgsl`
// (screen-aligned billboards).  Renders every galaxy whose apparent
// size exceeds 8 px (with a crossfade up to 14 px) as a 3D-oriented
// quad shaded with a two-component brightness profile (Gaussian bulge
// + exponential disk).  No texture sampling — the fragment stage
// generates the shape entirely from per-fragment math.
//
// The vertex stage is structurally identical to disks.wgsl: we
// construct an in-plane orthonormal basis from `axisRatio` (which
// encodes inclination via `cos(i) = axisRatio` for thin disks) and
// `positionAngleDeg` (east-of-north major-axis direction on the sky),
// then offset the corner vertices into world space.  See disks.wgsl
// for the full derivation; we trust that derivation here and re-use
// the math.

struct Uniforms {
  viewProj: mat4x4<f32>,
  viewport: vec2<f32>,
  _pad0: f32,
  _pad1: f32,
  camPosWorld: vec3<f32>,
  pxPerRad: f32,
};

struct InstanceIn {
  @location(0) posSize: vec4<f32>,         // x, y, z, sizeWorldMpc
  @location(1) orientation: vec4<f32>,     // axisRatio, positionAngleDeg, _, _
  @location(2) extras: vec4<f32>,          // colourIndex, crossfadeAlpha, _, _
};

struct VsOut {
  @builtin(position) clipPos: vec4<f32>,
  // Disk-local UV in [-1, 1]² — used by the fragment shader to compute
  // radial distance for the brightness profile.
  @location(0) uv: vec2<f32>,
  // Per-instance colour-index value (forwarded for the colour ramp).
  @location(1) @interpolate(flat) colourIndex: f32,
  // Per-instance crossfade alpha (0..1).
  @location(2) @interpolate(flat) crossfadeAlpha: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

const CORNERS = array<vec2<f32>, 6>(
  vec2<f32>(-1.0, -1.0),
  vec2<f32>( 1.0, -1.0),
  vec2<f32>( 1.0,  1.0),
  vec2<f32>(-1.0, -1.0),
  vec2<f32>( 1.0,  1.0),
  vec2<f32>(-1.0,  1.0),
);

@vertex
fn vs(@builtin(vertex_index) vid: u32, instance: InstanceIn) -> VsOut {
  let corner = CORNERS[vid];

  // ── Disk-plane basis construction ────────────────────────────────────
  //
  // The galaxy's *major axis* direction on the sky is given by PA (east
  // of north).  In skymap world coords (+Z = celestial north), the
  // local sky-tangent at the galaxy's position has +Y as celestial north
  // and -X as east (after we factor out the line-of-sight).  We build
  // the major-axis world direction by rotating the local sky-north
  // vector by PA toward east, projected into the sky-tangent plane.
  //
  // Then the minor axis is perpendicular to the major axis IN THE
  // GALAXY'S DISK PLANE — which is *not* the sky-tangent plane.  The
  // disk is tilted by inclination i = acos(axisRatio).  We compute the
  // disk normal as the line-of-sight direction rotated by (90° - i)
  // toward the perpendicular-to-major-axis sky direction.  The minor
  // axis then lies in the plane perpendicular to (major × normal).
  //
  // Implementation reuses the same algebra as disks.wgsl — see that
  // file for the full step-by-step derivation including the sign
  // conventions for sky-east vs world-X.
  let pos = instance.posSize.xyz;
  let halfWorld = instance.posSize.w;
  let axisRatio = instance.orientation.x;
  let paRad = instance.orientation.y * 3.14159265 / 180.0;

  // Line of sight (camera → galaxy).
  let los = normalize(pos - u.camPosWorld);

  // Local sky-north and sky-east at the galaxy.  We Gram-Schmidt
  // celestial-north (+Z world) against `los` to get the sky-north
  // tangent direction; sky-east is then los × sky-north.
  let CELESTIAL_NORTH = vec3<f32>(0.0, 0.0, 1.0);
  let northTangentRaw = CELESTIAL_NORTH - los * dot(CELESTIAL_NORTH, los);
  let northLen = length(northTangentRaw);
  // Pole degeneracy: if the line of sight is essentially along the
  // celestial pole, the sky-tangent has no defined "north".  Fall back
  // to using world +Y as the in-plane reference.  Picking +Y is
  // arbitrary but consistent (every pole-on viewing renders with the
  // same fallback orientation) and the loss of sky-PA fidelity at the
  // poles is invisible in practice.
  let northTangent = select(
    northTangentRaw / northLen,
    vec3<f32>(0.0, 1.0, 0.0),
    northLen < 1e-4,
  );
  let eastTangent = cross(los, northTangent);

  // Major axis on sky: rotate sky-north by PA toward sky-east.
  let majorSky = northTangent * cos(paRad) + eastTangent * sin(paRad);
  // Perpendicular-to-major in the sky-tangent plane.
  let perpMajorSky = cross(los, majorSky);

  // Disk normal: line-of-sight tilted by (90° - inclination) toward
  // perpMajorSky.  At axisRatio=1 (face-on) the normal is exactly los;
  // at axisRatio→0 (edge-on) the normal lies in the sky-tangent plane.
  let cosI = axisRatio;
  let sinI = sqrt(max(0.0, 1.0 - cosI * cosI));
  let diskNormal = normalize(los * cosI + perpMajorSky * sinI);

  // In-plane axes: major lies in the sky-tangent plane (face-on it's
  // along the sky major axis; edge-on it's the same direction since
  // both axes still lie in the sky plane).  Minor is the cross-product
  // major × normal — guaranteed in-plane.
  let majorAxis = majorSky;
  let minorAxis = normalize(cross(diskNormal, majorAxis));

  // Quad corners in world space: centre + corner.x · major + corner.y · minor,
  // each scaled by the half-extent.
  let worldOffset = corner.x * majorAxis * halfWorld + corner.y * minorAxis * halfWorld;
  let worldPos = pos + worldOffset;

  var out: VsOut;
  out.clipPos = u.viewProj * vec4<f32>(worldPos, 1.0);
  out.uv = corner;
  out.colourIndex = instance.extras.x;
  out.crossfadeAlpha = instance.extras.y;
  return out;
}
```

(Fragment stage written in Task 5.)

- [ ] **Step 3: Typecheck (no-op for WGSL)**

The shader is loaded as a string at runtime; there's no compile-time check yet.  Skip; we'll validate when the renderer is wired up in Task 6.

- [ ] **Step 4: Commit (vertex-only stub — fragment fills in later)**

Don't commit yet — we'll write the fragment stage next and commit them together as one logical unit.

---

## Task 4: (skipped — folded into Task 3 vertex/fragment combined commit)

> Originally separate; folded so we don't ship a half-shader to git.

---

## Task 5: Procedural-disk fragment shader — bulge + disk profile, colour modulation

**Files:**

- Modify: `src/services/gpu/shaders/proceduralDisks.wgsl` (append `@fragment fn fs`).

The procedural shading.  Reads `in.uv` (disk-local in [-1,1]²), computes radial distance, applies the two-component profile, modulates by colour index, multiplies by crossfade alpha, returns RGBA.

- [ ] **Step 1: Append the fragment stage**

Append to `src/services/gpu/shaders/proceduralDisks.wgsl` (after the vertex stage):

```wgsl
// ── Fragment stage ─────────────────────────────────────────────────────
//
// Reads the disk-local uv (in [-1,1]² where r=1 is the impostor's
// apparent edge) and shades a two-component galaxy profile:
//
//   - Gaussian bulge (σ = 0.4): warm-tinted (R-shifted) inner core.
//   - Exponential disk (scale = 0.5): cool-tinted (B-shifted) halo.
//
// Both components share the colour-index ramp's hue (so SDSS u-g, GLADE
// B-J etc. continue to colour the galaxy), but the bulge mixes ~30%
// toward (1, 0.6, 0.4) [warm yellow-red, simulating older redder bulge
// stars] and the disk mixes ~30% toward (0.7, 0.85, 1.0) [cooler blue-
// white, simulating younger disk stars].  The mix amounts are fixed
// in v1; later iterations could drive them from per-row stellar-
// population proxies.
//
// Final alpha is the combined brightness × crossfadeAlpha so the
// impostor fades in cleanly across the 8-14 px transition band.

const BULGE_SIGMA = 0.4;
const DISK_SCALE = 0.5;
const BULGE_WEIGHT = 0.6;
const DISK_WEIGHT = 0.4;
const BULGE_TINT = vec3<f32>(1.0, 0.6, 0.4);   // warm shift
const DISK_TINT  = vec3<f32>(0.7, 0.85, 1.0);  // cool shift
const TINT_MIX   = 0.3;

// Same colour ramp the points pass uses — re-implementing here keeps
// the two passes visually consistent.  See points.wgsl for the
// derivation; copying instead of factoring out because WGSL lacks an
// import mechanism short of a proper preprocessor.
fn colourRamp(t: f32) -> vec3<f32> {
  // t ∈ [0, 2]: 0 = bluest, 1 = midpoint, 2 = reddest.
  let s = clamp(t * 0.5, 0.0, 1.0); // remap to [0, 1]
  let blue   = vec3<f32>(0.55, 0.75, 1.00);
  let yellow = vec3<f32>(1.00, 0.95, 0.75);
  let red    = vec3<f32>(1.00, 0.55, 0.40);
  // Two-stage piecewise linear: blue → yellow → red.
  if (s < 0.5) {
    return mix(blue, yellow, s * 2.0);
  }
  return mix(yellow, red, (s - 0.5) * 2.0);
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4<f32> {
  let r = length(in.uv);
  if (r > 1.0) { discard; }

  let bulge = exp(-(r * r) / (2.0 * BULGE_SIGMA * BULGE_SIGMA));
  let disk  = exp(-r / DISK_SCALE);
  let intensity = bulge * BULGE_WEIGHT + disk * DISK_WEIGHT;

  // Colour: ramp base hue, then bias by which component dominates here.
  let base = colourRamp(in.colourIndex);
  // Each component contributes a fraction of the tint shift in
  // proportion to its share of the total brightness.
  let bulgeShare = bulge * BULGE_WEIGHT / max(intensity, 1e-4);
  let diskShare  = disk  * DISK_WEIGHT  / max(intensity, 1e-4);
  let tintedRgb =
      mix(base, base * BULGE_TINT, bulgeShare * TINT_MIX) +
      (mix(base, base * DISK_TINT,  diskShare * TINT_MIX) - base);
  // The above keeps `base` as the anchor and adds two independent
  // tint perturbations.  Equivalent (and cheaper) form:
  let tinted = base
    * mix(vec3<f32>(1.0), BULGE_TINT, bulgeShare * TINT_MIX)
    * mix(vec3<f32>(1.0), DISK_TINT,  diskShare * TINT_MIX);

  let alpha = intensity * in.crossfadeAlpha;
  // Premultiplied alpha — matches the project's blend mode (see
  // device.ts `alphaMode: 'premultiplied'`).
  return vec4<f32>(tinted * alpha, alpha);
}
```

> NB: the long `tintedRgb` form above is for explanation; we ship the
> shorter `tinted` form.  Delete the `let tintedRgb = …` block before
> committing — it's there only to make the math obvious to a reader.

- [ ] **Step 2: Commit (vertex + fragment together)**

```bash
git add src/services/gpu/shaders/proceduralDisks.wgsl
git commit -m "feat(gpu): proceduralDisks.wgsl — 3D-oriented bulge+disk impostor"
```

---

## Task 6: ProceduralDiskRenderer class — pipeline + draw

**Files:**

- Create: `src/services/gpu/proceduralDiskRenderer.ts`
- Create: `tests/services/gpu/proceduralDiskRenderer.test.ts` (smoke test only)

Wraps the shader in a render pipeline.  Closely mirrors `diskRenderer.ts` minus the texture-binding plumbing; the shader's `Uniforms` struct matches what the engine already passes to the disks pass, so we can reuse the same buffer.

- [ ] **Step 1: Read diskRenderer.ts as reference**

Open `src/services/gpu/diskRenderer.ts`.  Note:

- The class takes `{ device, context, format, canvas }` in its constructor.
- It builds a uniform buffer + bind group layout + pipeline once.
- `draw(passEncoder, viewProj, viewport, camPos, instances)` writes uniforms, packs the per-instance vertex buffer, and issues `setVertexBuffer` + `draw(6, instances.length)`.
- It uses `'src-alpha-saturated'`-style additive blending (see the colorTargets descriptor — copy that for our pipeline).

- [ ] **Step 2: Write the renderer class**

Create `src/services/gpu/proceduralDiskRenderer.ts`:

```ts
/**
 * proceduralDiskRenderer — 3D-oriented procedural galaxy impostors.
 *
 * Sibling to diskRenderer (texture-based) and quadRenderer (screen-
 * aligned + texture-based).  Activates for galaxies in the apparent-
 * size band 8..∞ px, with a crossfade against the points pass across
 * 8..14 px.  See `docs/superpowers/plans/2026-05-04-procedural-disk-
 * impostor.md` for the full design rationale.
 *
 * The shader (proceduralDisks.wgsl) is documented in detail; this file
 * is just the JS-side pipeline wiring.
 */

import wgsl from './shaders/proceduralDisks.wgsl?raw';
import type { ProceduralDiskInstance } from '../../@types/ProceduralDiskInstance';

const STRIDE_FLOATS = 12; // 3 vec4<f32> per instance
const STRIDE_BYTES  = STRIDE_FLOATS * 4;

type Init = {
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  canvas: HTMLCanvasElement;
};

export class ProceduralDiskRenderer {
  private device: GPUDevice;
  private pipeline: GPURenderPipeline;
  private bindGroupLayout: GPUBindGroupLayout;
  private uniformBuffer: GPUBuffer;
  private bindGroup: GPUBindGroup;
  private vertexBuffer: GPUBuffer | null = null;
  private vertexBufferCapacity = 0; // in instances

  constructor(init: Init) {
    const { device, format } = init;
    this.device = device;

    const module = device.createShaderModule({ code: wgsl });

    this.bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
      ],
    });

    // Uniform layout matches diskRenderer / quadRenderer (mat4 + vec2 +
    // 2 padding f32 + vec3 + f32) — 96 bytes.
    this.uniformBuffer = device.createBuffer({
      size: 96,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroup = device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    });

    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [this.bindGroupLayout],
    });

    this.pipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [
          {
            arrayStride: STRIDE_BYTES,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 0, offset: 0,  format: 'float32x4' }, // posSize
              { shaderLocation: 1, offset: 16, format: 'float32x4' }, // orientation
              { shaderLocation: 2, offset: 32, format: 'float32x4' }, // extras
            ],
          },
        ],
      },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [
          {
            format,
            // Premultiplied additive — same as the textured-disk path
            // so the two pipelines compose cleanly when both are drawing
            // (e.g. inside the 8-14 px crossfade band where points fade
            // out, here, but the textured-disk pass would only fire
            // above 24 px).
            blend: {
              color: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
              alpha: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-list' },
    });
  }

  /**
   * Issue one draw call for the given list of instances.  Packs the
   * instance data into the GPU vertex buffer (re-allocating if it grew),
   * writes the uniform buffer, and emits `draw(6, instances.length)`.
   */
  draw(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewport: [number, number],
    camPosWorld: [number, number, number],
    pxPerRad: number,
    instances: ReadonlyArray<ProceduralDiskInstance>,
  ): void {
    if (instances.length === 0) return;

    // Grow vertex buffer if needed.
    if (this.vertexBuffer === null || this.vertexBufferCapacity < instances.length) {
      this.vertexBuffer?.destroy();
      const cap = Math.max(instances.length, 64);
      this.vertexBuffer = this.device.createBuffer({
        size: cap * STRIDE_BYTES,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
      this.vertexBufferCapacity = cap;
    }

    // Pack instances.  Same memory layout as diskRenderer (3 vec4<f32>),
    // minus the UV rect — those four floats become (colourIndex,
    // crossfadeAlpha, _, _) instead.
    const packed = new Float32Array(instances.length * STRIDE_FLOATS);
    for (let i = 0; i < instances.length; i++) {
      const o = i * STRIDE_FLOATS;
      const ins = instances[i]!;
      packed[o + 0] = ins.x;
      packed[o + 1] = ins.y;
      packed[o + 2] = ins.z;
      packed[o + 3] = ins.sizeWorldMpc;
      packed[o + 4] = ins.axisRatio;
      packed[o + 5] = ins.positionAngleDeg;
      packed[o + 6] = 0;
      packed[o + 7] = 0;
      packed[o + 8] = ins.colourIndex;
      packed[o + 9] = ins.crossfadeAlpha;
      packed[o + 10] = 0;
      packed[o + 11] = 0;
    }
    this.device.queue.writeBuffer(this.vertexBuffer!, 0, packed);

    // Pack uniforms (mat4 + vec2 + 2*f32 + vec3 + f32 = 96 bytes).
    const uniforms = new ArrayBuffer(96);
    const u32f = new Float32Array(uniforms);
    u32f.set(viewProj, 0);            // 0..63
    u32f[16] = viewport[0];           // 64..67
    u32f[17] = viewport[1];           // 68..71
    // 72..79 padding
    u32f[20] = camPosWorld[0];        // 80..83
    u32f[21] = camPosWorld[1];        // 84..87
    u32f[22] = camPosWorld[2];        // 88..91
    u32f[23] = pxPerRad;              // 92..95
    this.device.queue.writeBuffer(this.uniformBuffer, 0, uniforms);

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.setVertexBuffer(0, this.vertexBuffer!);
    pass.draw(6, instances.length);
  }

  destroy(): void {
    this.uniformBuffer.destroy();
    this.vertexBuffer?.destroy();
    this.vertexBuffer = null;
  }
}
```

- [ ] **Step 3: Smoke test (renderer constructs without error)**

Create `tests/services/gpu/proceduralDiskRenderer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ProceduralDiskRenderer } from '../../../src/services/gpu/proceduralDiskRenderer';

describe('ProceduralDiskRenderer', () => {
  it('exports the class as a value', () => {
    // Full instantiation requires a GPUDevice which we can't easily
    // mock without pulling a WebGPU-shim dependency.  Visual correctness
    // is verified manually in Task 11.  This test exists so the file
    // gets type-checked + ensures the export shape doesn't drift.
    expect(typeof ProceduralDiskRenderer).toBe('function');
    expect(ProceduralDiskRenderer.prototype.draw).toBeTypeOf('function');
    expect(ProceduralDiskRenderer.prototype.destroy).toBeTypeOf('function');
  });
});
```

- [ ] **Step 4: Run typecheck + tests**

Run:
```
npx tsc --noEmit
npx vitest run tests/services/gpu/proceduralDiskRenderer.test.ts
```

Expected: typecheck clean; 1 test passes.

- [ ] **Step 5: Commit**

```bash
git add src/services/gpu/proceduralDiskRenderer.ts tests/services/gpu/proceduralDiskRenderer.test.ts
git commit -m "feat(gpu): ProceduralDiskRenderer pipeline + draw method"
```

---

## Task 7: Engine integration — emit instances + crossfade alphas

**Files:**

- Modify: `src/services/engine/engine.ts` (construct the renderer; bind it into the thumbnail subsystem)
- Modify: `src/services/engine/thumbnailSubsystem.ts` (per-frame instance emission, sort, draw)

### Architectural note (post-refactor)

After the engine refactor (Phases 1–5), the per-frame quad/disk collection
loop no longer lives in `engine.ts` — it moved into
`thumbnailSubsystem.runFrame()`.  That's where the existing `quads` and
`disks` arrays are populated, sorted by camera distance, and passed to
the per-renderer `draw()` calls.  The procedural-disk integration must
slot in alongside those, NOT in `engine.ts`'s own per-frame body.

`engine.ts` still owns renderer **construction** (it's where the GPU
device lives) and calls `thumbnails.bindToRenderers(quadRenderer,
diskRenderer)` to hand the renderers into the subsystem.  We extend
`bindToRenderers` to accept the new renderer the same way.

The existing pattern in `engine.ts` (around line 572-586):

```ts
const diskRenderer = new DiskRenderer({ device, context, format, canvas });
// ...
thumbnails.bindToRenderers(quadRenderer, diskRenderer);
```

becomes:

```ts
const diskRenderer = new DiskRenderer({ device, context, format, canvas });
const proceduralDiskRenderer = new ProceduralDiskRenderer({ device, context, format, canvas });
// ...
thumbnails.bindToRenderers(quadRenderer, diskRenderer, proceduralDiskRenderer);
```

- [ ] **Step 1: Construct the renderer in engine.ts next to diskRenderer**

Find the existing diskRenderer construction in `engine.ts` (around line 572) and add immediately below:

```ts
import { ProceduralDiskRenderer } from '../gpu/proceduralDiskRenderer';
// ...
const diskRenderer = new DiskRenderer({ device, context, format, canvas });
const proceduralDiskRenderer = new ProceduralDiskRenderer({ device, context, format, canvas });
```

Update the `thumbnails.bindToRenderers(...)` call (around line 586) to pass the new renderer:

```ts
thumbnails.bindToRenderers(quadRenderer, diskRenderer, proceduralDiskRenderer);
```

- [ ] **Step 2: Extend `bindToRenderers` in thumbnailSubsystem.ts**

Update the type signature on the `ThumbnailSubsystem` interface (around line 205) and the implementation (around line 294):

```ts
bindToRenderers(
  quadRenderer: QuadRenderer,
  diskRenderer: DiskRenderer,
  proceduralDiskRenderer: ProceduralDiskRenderer,
): void;
```

Stash the new renderer in the same closure pattern the existing renderers use (a module-private `let` set inside `bindToRenderers` and read inside `runFrame`).  Add the import for `ProceduralDiskRenderer` from `../gpu/proceduralDiskRenderer` at the top of the file.

- [ ] **Step 3: Add the `proceduralDisks` instance bucket inside `runFrame`**

In `thumbnailSubsystem.ts`'s `runFrame()` function (around line 349-353), alongside the existing `quads` and `disks` arrays, declare a third bucket:

```ts
import type { ProceduralDiskInstance } from '../../@types/ProceduralDiskInstance';
// ...
const quads: QuadInstance[] = [];
const disks: DiskInstance[] = [];
const proceduralDisks: ProceduralDiskInstance[] = [];
```

- [ ] **Step 4: Lower the outer apparent-size gate**

The per-cloud loop currently bails out at `px < APPARENT_SIZE_THRESHOLD_PX` (24).  We need to enter the loop body for any galaxy above 8 px so we can emit a procedural-disk instance even when the textured-disk path won't fire.  Find the early-`continue` on apparent size inside `runFrame` and change:

```ts
// Old (the existing px gate inside the per-cloud loop):
if (cloudSource !== Source.Famous && px < APPARENT_SIZE_THRESHOLD_PX) continue;

// New:
const minPxForLoopEntry = Math.min(
  APPARENT_SIZE_THRESHOLD_PX,
  PROCEDURAL_DISK_FADE_START_PX,
);
if (cloudSource !== Source.Famous && px < minPxForLoopEntry) continue;
```

The bitmap-fetch enqueue block — and the `quads.push(...)` / `disks.push(...)` calls that depend on a real bitmap — should STILL gate on `APPARENT_SIZE_THRESHOLD_PX = 24`, otherwise we'd swamp the priority queue with fetch requests for every barely-visible galaxy.  Wrap the bitmap-and-quad/disk-push section in:

```ts
if (px >= APPARENT_SIZE_THRESHOLD_PX) {
  // existing bitmap-enqueue + quads.push / disks.push code here
}
```

- [ ] **Step 5: Emit a procedural-disk instance whenever px > PROCEDURAL_DISK_FADE_START_PX**

After the bitmap-and-quad/disk branch above, add the procedural-disk emission:

```ts
// Procedural impostor: every galaxy in the band emits a procedural-disk
// instance, regardless of texture availability.  The crossfade alpha
// gives a smooth handoff from the points pass below 14 px.
if (px > PROCEDURAL_DISK_FADE_START_PX && Number.isFinite(ar) && Number.isFinite(pa)) {
  const t = Math.min(1, Math.max(0,
    (px - PROCEDURAL_DISK_FADE_START_PX) /
    (PROCEDURAL_DISK_FADE_END_PX - PROCEDURAL_DISK_FADE_START_PX),
  ));
  // Smoothstep — same shape as WGSL's smoothstep so the point-pass
  // fade-out (which uses smoothstep on the same px values) and this
  // fade-in stay perfectly complementary.
  const crossfadeAlpha = t * t * (3 - 2 * t);
  proceduralDisks.push({
    x, y, z,
    sizeWorldMpc,
    axisRatio: ar,
    positionAngleDeg: pa,
    colourIndex: cloud.colourIndex[i] ?? 1.0,
    crossfadeAlpha,
  });
}
```

- [ ] **Step 6: Sort + issue the draw call alongside disks/quads**

The existing back-to-front sort and the two `.draw()` calls live around lines 586-607 of `thumbnailSubsystem.ts`.  Add the third pass alongside them:

```ts
quads.sort(cmpFar);
disks.sort(cmpFar);
proceduralDisks.sort(cmpFar);

if (quads.length > 0) {
  quadRenderer.draw(/* ...existing args... */);
}
if (disks.length > 0) {
  diskRenderer.draw(/* ...existing args... */);
}
if (proceduralDisks.length > 0) {
  proceduralDiskRenderer.draw(
    pass,
    viewProj,
    [canvasSize.width, canvasSize.height],
    camPos,
    pxPerRad,
    proceduralDisks,
  );
}
```

(The exact draw-call arg list depends on `ProceduralDiskRenderer.draw`'s signature defined in Task 6 — match it.)

- [ ] **Step 7: Typecheck + tests**

Run:
```
npm run typecheck
npm test -- --run
```

Expected: typecheck clean; all tests pass.

- [ ] **Step 8: Manual visual verification**

The dev server has HMR, so a save should suffice — but a hard reload is safer for shader changes.  Find a galaxy that's a small dot (~10 px) and zoom in.  As it grows past 8 px the procedural disk should fade in; past 14 px the point billboard should be invisible.  Most spirals should look 3D-tilted.

If everything's broken (black screen, error in devtools console), most likely cause: WGSL compile error.  Check the dev tools console for the WebGPU validation message and grep for the offending line.

- [ ] **Step 9: Commit**

```bash
git add src/services/engine/engine.ts src/services/engine/thumbnailSubsystem.ts
git commit -m "feat(engine): emit procedural-disk instances in 8-14 px crossfade band"
```

---

## Task 8: Points-pass alpha fade-out across the crossfade band

**Files:**

- Modify: `src/services/gpu/shaders/points.wgsl` (Uniforms + fragment shader)
- Modify: `src/services/gpu/pointRenderer.ts` (write the new uniform fields)
- Modify: `src/services/engine/engine.ts` (pass the constants into the renderer)

So the point billboard fades out from 8 → 14 px, complementary to the disk's fade-in.

- [ ] **Step 1: Extend the points uniform struct**

In `src/services/gpu/shaders/points.wgsl`, find the existing `struct Uniforms` and add at the end (before the closing brace).  The struct currently ends with the Schechter / Malmquist block whose final field is `_pad5: u32` at byte offset 156, total size 160.  Append the new fade-band fields right after:

```wgsl
  // Procedural-disk crossfade band, in apparent-pixels.  When a
  // galaxy's apparent size exceeds `pxFadeStart`, we begin fading the
  // point billboard out (smoothstep), so the procedural-disk pass
  // (which fades in over the same band) takes over with no visible
  // double-rendering.  Above `pxFadeEnd` the point's alpha is zero —
  // a degenerate clip-space output would be cheaper but the alpha-zero
  // path keeps the existing pipeline composable with future passes
  // that might still want to read selection/pick data for fully-faded
  // points.  See proceduralDiskRenderer.ts for the matching logic.
  pxFadeStart: f32,
  pxFadeEnd: f32,
  // Two padding f32 to keep the struct 16-byte aligned.
  _padFade0: f32,
  _padFade1: f32,
```

The struct grows from 160 → 176 bytes (4 × f32 = 16 bytes appended at offsets 160..176).  Update the struct alignment comment at the top of the WGSL file accordingly, and grow `UNIFORM_BYTES` in `pointRenderer.ts` (currently `160`) to `176`.

- [ ] **Step 2: Wire the new fields into the JS-side uniform packing**

In `pointRenderer.ts`, find the existing uniform packing (`const UNIFORM_BYTES = 160`).  Bump it:

```ts
const UNIFORM_BYTES = 176;
// ...
// In draw(): pack the two new fields immediately after the existing
// 160-byte block.  Offsets 160..163 → f32[40], 164..167 → f32[41].
// f32[42] / f32[43] are padding and stay zero.
f32[40] = pxFadeStart;
f32[41] = pxFadeEnd;
```

**Verify before writing**: re-derive the f32-index from the byte offset using the actual current uniform layout in `pointRenderer.ts` — the layout has shifted across feature work and the source is the source of truth.  The byte offsets 160 / 164 are correct for the post-Malmquist 160-byte layout; if anything has changed in between, recompute.

Add the two parameters to `draw()`'s signature:

```ts
draw(
  pass: GPURenderPassEncoder,
  // ... existing params ...
  pxFadeStart: number,
  pxFadeEnd: number,
): void {
```

- [ ] **Step 3: Pass the constants from engine.ts**

In the engine's points-renderer.draw call, pass `PROCEDURAL_DISK_FADE_START_PX` and `PROCEDURAL_DISK_FADE_END_PX`.

- [ ] **Step 4: Apply the fade-out in the fragment shader**

In points.wgsl's `fs` (the visual fragment, not `fsPick`), the alpha computation now flows through several stages — the original `let alpha = exp(-r2 * 4.0)` followed by `alpha = alpha * schechterAlpha_`, `alpha = alpha * angWeight`, and `alpha = alpha * in.depthFade`, before the final `return vec4<f32>(rgb * alpha, alpha)`.  We multiply one more factor in at the end:

```wgsl
// Fade out as the procedural-disk pass takes over.  Smoothstep over
// the band [pxFadeStart, pxFadeEnd] — complementary to the disk's
// fade-in.  Per-vertex flat-interpolated sizePx (added to VSOut in
// Step 5 below) carries the value we need; the value is already
// computed in the vertex stage as
//   `let sizePx = max(u.pointSizePx, apparentPxRadius);`
// at points.wgsl ~line 782, so Step 5 is just forwarding it through
// VSOut, NOT a new computation.
let fadeT = clamp(
  (in.sizePx - u.pxFadeStart) / (u.pxFadeEnd - u.pxFadeStart),
  0.0, 1.0,
);
let pointAlphaMult = 1.0 - fadeT * fadeT * (3.0 - 2.0 * fadeT);
alpha = alpha * pointAlphaMult;
```

Apply this immediately before the existing `return vec4<f32>(rgb * alpha, alpha);` at the end of the normal-disk path.  The fade chains in after the Schechter / angular / depth-fade multiplications, which is the correct ordering — depth fade and Schechter modulate the point's intrinsic brightness; the procedural-disk crossfade modulates whether we're rendering the point pass at all in this px band.

- [ ] **Step 5: Forward `sizePx` from the vertex shader**

`sizePx` is **already computed** in the vertex stage at points.wgsl ~line 782 (`let sizePx = max(u.pointSizePx, apparentPxRadius);`).  We just need to forward it through VSOut.

VSOut location numbering note: locations 0–12 + 15 are currently in use after recent changes (the per-vertex bake of paCs/paSn/depthFade put paSn at @location(15) for ABI continuity).  Use **`@location(13)`** for `sizePx` — that's the next free slot.

```wgsl
struct VSOut {
  // ... existing fields ...
  // Apparent on-screen radius in pixels for this billboard.  Forwarded
  // (not recomputed) from the vertex stage so the fragment can apply
  // the procedural-disk crossfade.  Flat-interpolated for the same
  // per-instance constancy as the other flat scalars.
  @location(13) @interpolate(flat) sizePx: f32,
};

// In vs, after the existing `let sizePx = ...` computation:
out.sizePx = sizePx;
```

Also assign `earlyOut.sizePx = 0.0;` along the volume-limit / decimation early-out paths in `vs` (WGSL requires every VSOut field be initialised on every return path).

- [ ] **Step 6: Typecheck + run dev**

```
npx tsc --noEmit
npm test
```

Reload the dev server and verify the crossfade is smooth — no double-bright "donut" effect at the band edges, no flicker.

- [ ] **Step 7: Commit**

```bash
git add src/services/gpu/shaders/points.wgsl src/services/gpu/pointRenderer.ts src/services/engine/engine.ts
git commit -m "feat(points): smoothstep alpha fade-out across procedural-disk band"
```

---

## Task 9: Sanity tests — engine emission logic

**Files:**

- Create: `tests/services/engine/proceduralDiskEmission.test.ts`

A focused unit test: given a fixture cloud + fake camera, the per-frame loop emits the expected list of `ProceduralDiskInstance` objects.  The trick: the per-frame loop in `thumbnailSubsystem.ts` is deeply embedded in the subsystem factory and not directly testable.  We don't unit-test the whole subsystem; we extract the per-galaxy emission logic into a pure helper that lives at module scope and call it both from the runtime path and the test.

- [ ] **Step 1: Extract the emission logic to a pure helper**

In `src/services/engine/thumbnailSubsystem.ts` (the same file the runtime call lives in — keeps the helper next to its only caller; promote to a util later if it grows another consumer), lift the per-galaxy procedural-disk push out of the loop into a top-of-module pure function:

```ts
export function maybeEmitProceduralDisk(
  px: number,
  ar: number,
  pa: number,
  x: number, y: number, z: number,
  sizeWorldMpc: number,
  colourIndex: number,
  fadeStartPx: number,
  fadeEndPx: number,
): ProceduralDiskInstance | null {
  if (px <= fadeStartPx) return null;
  if (!Number.isFinite(ar) || !Number.isFinite(pa)) return null;
  const t = Math.min(1, Math.max(0, (px - fadeStartPx) / (fadeEndPx - fadeStartPx)));
  const crossfadeAlpha = t * t * (3 - 2 * t);
  return { x, y, z, sizeWorldMpc, axisRatio: ar, positionAngleDeg: pa, colourIndex, crossfadeAlpha };
}
```

Replace the inline block in the per-frame loop with a call to this helper.

- [ ] **Step 2: Unit-test the helper**

Create `tests/services/engine/proceduralDiskEmission.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { maybeEmitProceduralDisk } from '../../../src/services/engine/engine';

describe('maybeEmitProceduralDisk', () => {
  const base = {
    x: 1, y: 2, z: 3,
    sizeWorldMpc: 0.03,
    colourIndex: 1.0,
    fadeStartPx: 8,
    fadeEndPx: 14,
  };

  it('returns null below the fade start', () => {
    const r = maybeEmitProceduralDisk(7, 0.7, 30, base.x, base.y, base.z, base.sizeWorldMpc, base.colourIndex, base.fadeStartPx, base.fadeEndPx);
    expect(r).toBeNull();
  });

  it('returns null when axisRatio is NaN', () => {
    const r = maybeEmitProceduralDisk(10, NaN, 30, base.x, base.y, base.z, base.sizeWorldMpc, base.colourIndex, base.fadeStartPx, base.fadeEndPx);
    expect(r).toBeNull();
  });

  it('returns an instance with crossfadeAlpha = 0 exactly at fadeStart edge', () => {
    const r = maybeEmitProceduralDisk(8.0001, 0.7, 30, base.x, base.y, base.z, base.sizeWorldMpc, base.colourIndex, base.fadeStartPx, base.fadeEndPx);
    expect(r).not.toBeNull();
    expect(r!.crossfadeAlpha).toBeCloseTo(0, 3);
  });

  it('returns an instance with crossfadeAlpha = 1 at and beyond fadeEnd', () => {
    const r1 = maybeEmitProceduralDisk(14, 0.7, 30, base.x, base.y, base.z, base.sizeWorldMpc, base.colourIndex, base.fadeStartPx, base.fadeEndPx);
    expect(r1!.crossfadeAlpha).toBeCloseTo(1, 6);

    const r2 = maybeEmitProceduralDisk(50, 0.7, 30, base.x, base.y, base.z, base.sizeWorldMpc, base.colourIndex, base.fadeStartPx, base.fadeEndPx);
    expect(r2!.crossfadeAlpha).toBeCloseTo(1, 6);
  });

  it('smoothstep crossfade at midpoint', () => {
    const r = maybeEmitProceduralDisk(11, 0.7, 30, base.x, base.y, base.z, base.sizeWorldMpc, base.colourIndex, base.fadeStartPx, base.fadeEndPx);
    // (11 - 8) / (14 - 8) = 0.5 → smoothstep(0.5) = 0.5
    expect(r!.crossfadeAlpha).toBeCloseTo(0.5, 6);
  });
});
```

- [ ] **Step 3: Run the new tests**

```
npx vitest run tests/services/engine/proceduralDiskEmission.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/services/engine/engine.ts tests/services/engine/proceduralDiskEmission.test.ts
git commit -m "test(engine): unit-test the procedural-disk emission helper"
```

---

## Task 10: Visual verification + tuning sweep

**Files:** none — manual smoke test only.

- [ ] **Step 1: Hard reload dev server + walk through each survey**

Verify visually:

1. **SDSS pencil-beam.** Find an SDSS-only deep field.  Galaxies at moderate zoom should now appear as 3D-tilted disks rather than fuzzy dots.
2. **GLADE local volume.** Browse the nearby GLADE galaxies (z < 0.05).  Spirals should show distinct bulge + disk components; ellipticals (high axisRatio = ~0.6+) should look more uniformly bright.
3. **2MRS bright catalog.** 2MRS rows have real shape data.  Compare a few to their actual on-sky inclination.
4. **Famous catalog.** Famous galaxies above 12 px should now also use the procedural disk.  Below the textured-disk threshold (24 px) we now have a visible 3D shape — was previously a flat point.
5. **Crossfade band.** Slowly zoom in on a nearby galaxy.  Across 8-14 px the point should fade out and the disk should fade in with no visible double-rendering or flicker.
6. **Edge-on galaxies.** Find an axisRatio < 0.3 case (Sombrero is a prominent famous example at 0.58, edge-on spirals like NGC 4565 are < 0.2).  At face-on viewing the disk should look like a thin streak; orbiting around it (using the camera) should reveal the disk plane gradually opening up.
7. **Pole-degeneracy.** Look near the celestial poles (Dec=±90°).  No disk should look broken — the shader's pole-fallback uses world +Y as the in-plane reference.

- [ ] **Step 2: Tune knobs if needed**

If the bulge looks too tight or the disk too dim, adjust the constants at the top of `proceduralDisks.wgsl`:

- `BULGE_SIGMA = 0.4`: smaller = tighter core, larger = softer.
- `DISK_SCALE = 0.5`: smaller = more concentrated disk, larger = flatter halo.
- `BULGE_WEIGHT / DISK_WEIGHT`: shift relative brightness.
- `TINT_MIX = 0.3`: how strongly the bulge/disk colours diverge from the colour-index ramp.

Change in the shader, hard-reload, eyeball, repeat.

- [ ] **Step 3: Commit any tuning**

```bash
git add src/services/gpu/shaders/proceduralDisks.wgsl
git commit -m "tune(gpu): procedural-disk profile constants for v1 ship"
```

---

## Task 11: README + docs

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Add a subsection under the renderer overview**

In `README.md`, find the "Galaxy thumbnails" section (or whichever covers the renderer passes).  Add immediately after:

```markdown
### Procedural galaxy impostors

Galaxies whose apparent size exceeds 12 px (with a smooth crossfade
across 8–14 px) render as 3D-oriented procedural disks rather than
screen-aligned point billboards.  The new pass takes the catalogued
inclination (from `axisRatio`) and on-sky position angle (from
`positionAngleDeg`) and emits a real 3D quad in world space, shaded
with a Gaussian bulge + exponential disk profile and modulated by the
existing colour-index ramp (with the bulge biased warmer and the disk
biased cooler).  No texture fetch is required — every galaxy gets a
3D shape at moderate zoom, regardless of whether its DESI/Wikipedia
thumbnail has loaded yet.

Camera roll and orbit reveal real 3D structure: flying around an
inclined galaxy gradually opens its disk to face-on, then back to edge-
on.  The textured-disk pass (existing) still takes precedence above
24 px once a real bitmap arrives — visually the procedural impostor
hands off cleanly when the curated thumbnail finishes loading.

Implementation: `src/services/gpu/proceduralDiskRenderer.ts` +
`src/services/gpu/shaders/proceduralDisks.wgsl`.  Plan: see
`docs/superpowers/plans/2026-05-04-procedural-disk-impostor.md`.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs(readme): document the procedural-disk impostor pass"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task(s) |
|---|---|
| Activation threshold px > 12 with smooth crossfade 8-14 | 2, 7, 8 |
| Two-component bulge + disk brightness profile | 1, 5 |
| Colour-index ramp + bulge-redder + disk-bluer modulation | 5 |
| Sibling renderer (no shared code with diskRenderer) | 6 |
| Crossfade-only interaction with point pass | 7, 8 |
| Fully world-oriented (real 3D plane via axisRatio + PA) | 3 |
| Renders without texture dependency | 3, 5, 6, 7 |
| Tests cover profile math + emission logic | 1, 9 |
| Visual verification | 10 |
| Documented in README | 11 |

**Placeholder scan:** No "TBD" / "TODO" / "implement later" / "similar to Task N".  Each step has actual code.

**Type consistency:**
- `ProceduralDiskInstance` (defined Task 2) → consumed by Tasks 6, 7, 9.
- `PROCEDURAL_DISK_FADE_START_PX` / `PROCEDURAL_DISK_FADE_END_PX` (defined Task 2) → consumed by Tasks 7, 8.
- `maybeEmitProceduralDisk` signature (defined Task 9) → consumed by the engine call site refactored in Task 9.
- `BULGE_SIGMA / DISK_SCALE / BULGE_WEIGHT / DISK_WEIGHT` constants are duplicated between `galaxyProfile.ts` (Task 1) and `proceduralDisks.wgsl` (Task 5) — intentional (no shared shader/JS module mechanism).  If they ever diverge in the future, update both.

All names match.  The plan is coherent.

---
