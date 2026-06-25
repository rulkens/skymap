# Physical Cluster Lensing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drive each foreground cluster's gravitational lensing from its actual physical size (R500) instead of an artistic master angle, exposing one dimensionless `lensStrength` multiplier (0 = off, 1 = real physics, ~1000 = exaggerated) and a per-lens NFW scale radius.

**Architecture:** A new pure util `clusterLensDeflection(physicalRadiusMpc)` returns `{ alphaInfRad, rsMpc }` from a single closed-form constant `K` (so `α∞ = K·R500²`). `buildClusterLenses` swaps its `masterThetaRad` input for `lensStrength`, gates/sorts on physical α∞, and returns a per-lens `rsMpc`. The uniform grows from one `vec4` per lens to two (still 32 bytes); the lens uniform's first vec4 carries precomputed eye-relative geometry (`dirLens` + `dL`), eliminating the per-vertex `toLens` / `length` / `normalize` in `lensTerm` (a ~30M-invocations/frame saving), and the second carries `thetaERad` + `r_s`. The WESL struct gains a `LensData` member, and `lensing.wesl` reads each lens's precomputed geometry + `r_s` directly instead of a retired global header `scaleRadius`. Settings rename `lensStrengthDeg → lensStrength` and remove `lensScaleRadiusMpc`; the DebugPanel slider becomes log-scaled.

**Tech Stack:** TypeScript + Vitest, Redux Toolkit settings slice, React DebugPanel, WESL/WGSL via wesl-plugin, WebGPU uniform buffers.

## Global Constraints

These apply to every task; copy values verbatim.

- **One function per file** in `src/utils/` (filename = exported function name). **One type per file** in `src/@types/` (`type`, never `interface`). Deep relative imports, no barrels.
- **Vec3** from `src/@types/math/Vec3` — never raw tuples in src TS. (Test fixtures may use `as const` tuples cast to the type, mirroring the existing `buildClusterLenses.test.ts`.)
- **WESL comments:** NO backticks (wesl-plugin parse error) — use single quotes for identifier refs. Didactic, timeless comments (explain *why* + the alternative; no dates / PR refs / history notes).
- **Vitest** tests mirror the src tree under `tests/`. Typed `vi.fn<() => void>()`, never bare `vi.fn()`.
- **Reuse existing constants** `C_KM_S` (299792.458) and `H0_KM_S_MPC` (70) from `src/utils/math/constants.ts`. Derive `rho_crit = 3·H0²/(8π·G)` — do NOT hardcode a second Hubble value.
- **New constant** `G = 4.30091e-9` Mpc·(km/s)²·M☉⁻¹ — add it as a didactic export in `src/utils/math/constants.ts` (single source of truth).
- **Fiducials:** `c500 = 3.2`, so `rsMpc = physicalRadiusMpc / 3.2`. `rho_crit` works out to ≈ 1.360e11 M☉·Mpc⁻³ at H0 = 70.
- **Closed form:** `α∞ = K · R500²` with `K = (8π²/3)·500·G·ρ_crit / c²` (R500 in Mpc, α∞ in radians). `K ≈ 8.56e-5`; `α∞(1.4 Mpc) ≈ 1.68e-4 rad` (≈ 31–35″) — within the spec's tolerance band of ≈ 1.5e-4.
- **Log slider:** `LOG_MIN = -1` (0.1×), `LOG_MAX = 3` (1000×). Slider position `p ∈ [0, 1]`: `p = 0` ⟹ `lensStrength = 0` (hard off); `p ∈ (0, 1]` ⟹ `lensStrength = 10^(LOG_MIN + p·(LOG_MAX − LOG_MIN))`. The stored setting is the resolved `lensStrength`, not `p`.
- **Uniform layout:** two `vec4`s per lens, `MAX_LENSES = 16`, total `16 + 16·32 = 528` bytes. The header's old `scaleRadius` word (byte 12) is retired to padding (written zero). First vec4 (`geom`) = `xyz` unit eye→lens dir (`dirLens`) + `w` eye→lens distance `dL`; second vec4 (`params`) = `x` thetaERad, `y` r_s, `zw` = 0.
- **Per-lens geometry is precomputed CPU-side:** `dirLens` (unit) and `dL` are computed once per frame in `buildClusterLenses` from `worldPos − camPos` (the same vector it already forms for the in-front test) and baked into the uniform, so `lensTerm` does no per-vertex subtract / `length` / `normalize`. The world-space centre is NOT stored — nothing downstream reads it.
- **Lensing default** is `lensStrength` = 1.0 (physical).
- **Background implementers cannot run `npm`.** The controller (main thread) runs `npm test` / `npm run typecheck` / `npm run build`. `npm run build` is the WESL-link gate for the shader task (Task 5) — it must link after the struct + shader-read change land together.

---

## Task Order

1. New `clusterLensDeflection` pure util + `G` constant.
2. Type changes: `LensSpec` gains `rsMpc`; `LensingUniformsValue` drops `scaleRadiusMpc`.
3. `buildClusterLenses` physical rewrite.
4. `packLensingUniforms` two-vec4 / 528-byte layout.
5. WESL `LensingUniforms` + new `LensData` struct + `lensing.wesl` per-lens `r_s` read (build-link gate).
6. Settings slice / selectors / defaults rename + removal.
7. `renderFrame` wiring.
8. DebugPanel log-scaled strength slider + r_s slider removal.

---

### Task 1: `clusterLensDeflection` pure util + gravitational constant `G`

**Files:**
- Modify: `src/utils/math/constants.ts` (add `G` export)
- Create: `src/utils/lensing/clusterLensDeflection.ts`
- Test: `tests/utils/lensing/clusterLensDeflection.test.ts`

**Interfaces:**
- Consumes: `C_KM_S`, `H0_KM_S_MPC` from `src/utils/math/constants.ts`; new `G` from the same file.
- Produces:
  - `export const G = 4.30091e-9;` (Mpc·(km/s)²·M☉⁻¹) in `constants.ts`.
  - `clusterLensDeflection(physicalRadiusMpc: number): { alphaInfRad: number; rsMpc: number }`

**Behaviour contract:**
- `rho_crit = 3·H0_KM_S_MPC² / (8π·G)` (≈ 1.360e11).
- `K = (8·π²/3)·500·G·rho_crit / C_KM_S²` (≈ 8.56e-5).
- `alphaInfRad = K · physicalRadiusMpc²` (so `α∞ ∝ R500²`, monotonic increasing for R ≥ 0).
- `rsMpc = physicalRadiusMpc / 3.2` (c500 = 3.2, declared as a local `const C500 = 3.2`).
- `physicalRadiusMpc = 0` ⟹ both outputs 0.
- Negative input is not a valid R500; the function need not guard it (no test asserts it) — keep the closed form.

- [ ] **Step 1: Add the `G` constant to `constants.ts`**

In `src/utils/math/constants.ts`, add an exported `G = 4.30091e-9` with a didactic docblock. Place it after `C_KM_S` / `H0_KM_S_MPC`. The comment must say: it is Newton's constant in astrophysical units (Mpc·(km/s)²·M☉⁻¹), chosen over SI (6.674e-11 m³·kg⁻¹·s⁻²) so cluster-mass / velocity-dispersion / critical-density formulae stay legible in the units the catalog already uses (Mpc, km/s, solar masses) — no metre↔Mpc or kg↔M☉ conversions threaded through every term.

- [ ] **Step 2: Write the failing test**

```ts
// tests/utils/lensing/clusterLensDeflection.test.ts
import { describe, it, expect } from 'vitest';
import { clusterLensDeflection } from '../../../src/utils/lensing/clusterLensDeflection';

describe('clusterLensDeflection', () => {
  it('matches the Coma sanity check at R500 = 1.4 Mpc', () => {
    // Coma R500 ≈ 1.4 Mpc → α∞ a few × 1e-4 rad (real cluster Einstein
    // radii are tens of arcsec). Band is generous: the fiducials (c500,
    // ρ_crit, H0) are approximations, so we assert the right ORDER of
    // magnitude, not a tight value.
    const { alphaInfRad } = clusterLensDeflection(1.4);
    expect(alphaInfRad).toBeGreaterThan(1.0e-4);
    expect(alphaInfRad).toBeLessThan(2.5e-4);
  });

  it('returns r_s = R500 / 3.2', () => {
    const { rsMpc } = clusterLensDeflection(1.4);
    expect(rsMpc).toBeCloseTo(1.4 / 3.2, 10);
  });

  it('is zero at R500 = 0', () => {
    const out = clusterLensDeflection(0);
    expect(out.alphaInfRad).toBe(0);
    expect(out.rsMpc).toBe(0);
  });

  it('scales α∞ as R500² (quadrupling at double radius)', () => {
    const a1 = clusterLensDeflection(1).alphaInfRad;
    const a2 = clusterLensDeflection(2).alphaInfRad;
    expect(a2 / a1).toBeCloseTo(4, 6);
  });

  it('is monotonic increasing in R500', () => {
    const a = clusterLensDeflection(0.5).alphaInfRad;
    const b = clusterLensDeflection(1.0).alphaInfRad;
    const c = clusterLensDeflection(2.0).alphaInfRad;
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });
});
```

- [ ] **Step 3: Run the test, verify it fails**

Run: `npm test -- clusterLensDeflection`
Expected: FAIL — `clusterLensDeflection` module not found / not a function.

- [ ] **Step 4: Implement `clusterLensDeflection`**

Create `src/utils/lensing/clusterLensDeflection.ts` exporting the single function per the Behaviour contract above. Import `C_KM_S`, `H0_KM_S_MPC`, `G` from `../math/constants`. Compute `rho_crit` and `K` as module-level consts (computed once, not per call). Didactic module header: derive the closed form `α∞ = K·R500²` from the SIS-truncated-at-R500 model (`M500 = (4/3)π·500·ρ_crit·R500³`, `σ_v² = G·M500/(2·R500)`, `α∞ = 4π·σ_v²/c²`), and note `r_s = R500/c500` is the same R500 over a fiducial concentration (c500 = 3.2 ≡ c200 ≈ 5), strength-independent.

- [ ] **Step 5: Run the test, verify it passes**

Run: `npm test -- clusterLensDeflection`
Expected: PASS (5 tests).

- [ ] **Step 6: Typecheck + commit**

Run: `npm run typecheck`
Expected: clean.
```bash
git add src/utils/math/constants.ts src/utils/lensing/clusterLensDeflection.ts tests/utils/lensing/clusterLensDeflection.test.ts
git commit -m "feat(lensing): add clusterLensDeflection physical R500→α∞,r_s util"
```

---

### Task 2: Type changes — `LensSpec.rsMpc`, drop `LensingUniformsValue.scaleRadiusMpc`

**Files:**
- Modify: `src/@types/rendering/LensSpec.d.ts`
- Modify: `src/@types/rendering/LensingUniformsValue.d.ts`

**Interfaces:**
- Produces:
  - `LensSpec = { readonly dirLens: Readonly<Vec3>; readonly dL: number; readonly thetaERad: number; readonly rsMpc: number }`
  - `LensingUniformsValue = { readonly enabled: boolean; readonly lenses: readonly LensSpec[]; readonly mode: LensMode }` (no `scaleRadiusMpc`).

This task has no standalone test — it is a type contract consumed by Tasks 3–7. Its acceptance gate is `npm run typecheck`, which will surface every site that still reads the removed field (`packLensingUniforms`, `renderFrame`). Those are fixed in their own tasks; here we only change the two type files and let the typecheck failures point the way (they are expected red until Tasks 3–4 + 7 land).

> **Note for the controller:** because this task intentionally leaves the tree non-compiling until Task 4 + Task 7, prefer landing Tasks 2→3→4→7 as a group before relying on a green `npm run typecheck`. The per-task commits still happen; the typecheck gate is satisfied at Task 7's end. (Tasks 1, 5, 6, 8 remain independently green.)

- [ ] **Step 1: Add `rsMpc` to `LensSpec`**

In `src/@types/rendering/LensSpec.d.ts` make `LensSpec = { readonly dirLens: Readonly<Vec3>; readonly dL: number; readonly thetaERad: number; readonly rsMpc: number }` (`Vec3` from `src/@types/math/Vec3`). DROP `center` entirely — no consumer remains. Update the docblock: a lens is now eye-relative (recomputed per frame) — a precomputed unit eye→lens direction (`dirLens`) + eye→lens distance (`dL`, Mpc), plus the per-cluster `thetaERad` (strength × physical α∞) and `rsMpc` (R500/c500); the shader applies only the per-source `D_ls/D_s` distance factor. Remove any wording implying a single global scale radius or a stored world-space centre.

- [ ] **Step 2: Drop `scaleRadiusMpc` from `LensingUniformsValue`**

In `src/@types/rendering/LensingUniformsValue.d.ts` delete the `scaleRadiusMpc` field and its doc line. Update the docblock: r_s is now PER-LENS (carried on each `LensSpec`), not a shared profile knob; the header's old scale-radius word is retired to padding. Keep `enabled`, `lenses`, `mode`. Fix the byte-size mention (272 → 528) and the "mode / scaleRadiusMpc become don't-cares" line to drop the `scaleRadiusMpc` reference.

- [ ] **Step 3: Commit**

(No isolated test; the contract is exercised by later tasks.)
```bash
git add src/@types/rendering/LensSpec.d.ts src/@types/rendering/LensingUniformsValue.d.ts
git commit -m "feat(lensing): per-lens rsMpc on LensSpec; drop global scaleRadiusMpc"
```

---

### Task 3: `buildClusterLenses` physical rewrite

**Files:**
- Modify: `src/utils/lensing/buildClusterLenses.ts`
- Test: `tests/utils/lensing/buildClusterLenses.test.ts` (rewrite)

**Interfaces:**
- Consumes: `clusterLensDeflection` (Task 1); `LensSpec` with `rsMpc` (Task 2); `StructureInfo`.
- Produces:
  ```ts
  buildClusterLenses(
    structures: readonly StructureInfo[],
    camPos: Readonly<Vec3>,
    target: Readonly<Vec3>,
    lensStrength: number,
    maxLenses: number,
  ): LensSpec[]
  ```

**Behaviour contract:**
- Early-out returns `[]` when `lensStrength <= 0` OR `maxLenses <= 0` (the gate changes from `masterThetaRad <= 0` to `lensStrength <= 0`).
- A cluster lenses iff `category === 'cluster'` AND in front of the camera (`dot(cam→cluster, cam→target) > 0`) AND `physicalRadiusMpc > 0`. `significance` no longer gates or weights — it is dropped from candidate selection entirely.
- Precompute eye-relative geometry per surviving lens: `toLens = worldPos − camPos`, `dL = length(toLens)`, skip if `dL <= 0` (degenerate — can't normalize), `dirLens = toLens / dL`. REUSE the `toLens` vector already formed for the in-front dot test — do NOT compute it twice.
- Per surviving lens: `thetaERad = lensStrength · alphaInfRad` and `rsMpc`, both from `clusterLensDeflection(physicalRadiusMpc)`. Map to `{ dirLens, dL, thetaERad, rsMpc }`.
- Sort by physical α∞ descending (equivalently by `physicalRadiusMpc`, since α∞ ∝ R500²) and keep the top `maxLenses`. The most strongly-lensing clusters survive the cap.
- Featured anchors (Coma, Virgo) are now first-class lenses — included whenever they carry `physicalRadiusMpc > 0`, regardless of `significance`.

- [ ] **Step 1: Rewrite the failing test**

Replace `tests/utils/lensing/buildClusterLenses.test.ts` entirely with:

```ts
import { describe, it, expect } from 'vitest';
import { buildClusterLenses } from '../../../src/utils/lensing/buildClusterLenses';
import { clusterLensDeflection } from '../../../src/utils/lensing/clusterLensDeflection';
import type { StructureInfo } from '../../../src/@types/data/structure/StructureInfo';

// Camera at the origin looking down +Z. "In front" means worldPos.z > 0.
const CAM = [0, 0, 0] as const;
const TARGET = [0, 0, 1] as const;

function cluster(
  id: string,
  worldPos: [number, number, number],
  physicalRadiusMpc: number,
  significance?: number,
): StructureInfo {
  return {
    type: 'structure',
    category: 'cluster',
    id,
    name: id,
    worldPos,
    featured: false,
    physicalRadiusMpc,
    significance,
  } as StructureInfo;
}

function supercluster(id: string, worldPos: [number, number, number]): StructureInfo {
  return {
    type: 'structure',
    category: 'supercluster',
    id,
    name: id,
    worldPos,
    featured: false,
    physicalRadiusMpc: 1,
    significance: 1,
  } as StructureInfo;
}

describe('buildClusterLenses', () => {
  it('returns no lenses when the strength is zero', () => {
    const out = buildClusterLenses([cluster('a', [0, 0, 10], 1.4, 1)], CAM, TARGET, 0, 16);
    expect(out).toEqual([]);
  });

  it('returns no lenses when maxLenses is zero', () => {
    const out = buildClusterLenses([cluster('a', [0, 0, 10], 1.4, 1)], CAM, TARGET, 1, 0);
    expect(out).toEqual([]);
  });

  it('drops clusters behind the camera', () => {
    const out = buildClusterLenses([cluster('behind', [0, 0, -10], 1.4, 1)], CAM, TARGET, 1, 16);
    expect(out).toEqual([]);
  });

  it('only lenses clusters, not superclusters', () => {
    const out = buildClusterLenses([supercluster('sc', [0, 0, 10])], CAM, TARGET, 1, 16);
    expect(out).toEqual([]);
  });

  it('drops clusters with non-positive physical radius', () => {
    const out = buildClusterLenses([cluster('flat', [0, 0, 10], 0, 1)], CAM, TARGET, 1, 16);
    expect(out).toEqual([]);
  });

  it('derives thetaERad = strength × physical α∞ and per-lens r_s from R500', () => {
    const r500 = 1.4;
    const strength = 1;
    const out = buildClusterLenses([cluster('a', [0, 0, 10], r500, 0.5)], CAM, TARGET, strength, 16);
    const { alphaInfRad, rsMpc } = clusterLensDeflection(r500);
    expect(out).toHaveLength(1);
    // Camera at the origin, cluster on +Z at distance 10 ⇒ unit dir ≈ [0,0,1], dL ≈ 10.
    expect(out[0]!.dirLens[0]).toBeCloseTo(0, 12);
    expect(out[0]!.dirLens[1]).toBeCloseTo(0, 12);
    expect(out[0]!.dirLens[2]).toBeCloseTo(1, 12);
    expect(out[0]!.dL).toBeCloseTo(10, 12);
    expect(out[0]!.thetaERad).toBeCloseTo(strength * alphaInfRad, 12);
    expect(out[0]!.rsMpc).toBeCloseTo(rsMpc, 12);
  });

  it('scales thetaERad linearly with strength', () => {
    const r500 = 1.4;
    const a = buildClusterLenses([cluster('a', [0, 0, 10], r500, 1)], CAM, TARGET, 1, 16);
    const b = buildClusterLenses([cluster('a', [0, 0, 10], r500, 1)], CAM, TARGET, 10, 16);
    expect(b[0]!.thetaERad).toBeCloseTo(10 * a[0]!.thetaERad, 12);
  });

  it('sorts and caps by physical α∞ (R500) descending, ignoring significance', () => {
    // significance is deliberately INVERTED vs R500 to prove it no longer
    // drives the ordering — the biggest R500 must win the cap.
    const structures = [
      cluster('small', [0, 0, 10], 0.8, 0.9),
      cluster('big', [0, 0, 20], 2.0, 0.1),
      cluster('mid', [0, 0, 30], 1.4, 0.5),
    ];
    const out = buildClusterLenses(structures, CAM, TARGET, 1, 2);
    // Ordered by R500 desc (big, mid); each cluster sits on +Z so dL = its z.
    expect(out.map((l) => l.dL)).toEqual([20, 30]); // big, mid — small dropped
  });

  it('includes a featured anchor that carries no significance', () => {
    const out = buildClusterLenses([cluster('coma', [0, 0, 10], 1.4)], CAM, TARGET, 1, 16);
    expect(out).toHaveLength(1);
    expect(out[0]!.rsMpc).toBeCloseTo(1.4 / 3.2, 10);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npm test -- buildClusterLenses`
Expected: FAIL — current signature still takes `masterThetaRad`, gates on `significance`, returns no `rsMpc`.

- [ ] **Step 3: Rewrite `buildClusterLenses`**

Implement per the Behaviour contract. Rename the 4th param `masterThetaRad → lensStrength`. Drop the `significance` candidate field; for each in-front cluster with `physicalRadiusMpc > 0`, reuse the `toLens = worldPos − camPos` vector from the in-front dot test, compute `dL = length(toLens)`, skip if `dL <= 0`, and `dirLens = toLens / dL`; collect `{ dirLens, dL, physicalRadiusMpc }`. Sort by `physicalRadiusMpc` descending (monotone in α∞), cap, then map each to a `LensSpec` via `clusterLensDeflection(physicalRadiusMpc)` → `{ dirLens, dL, thetaERad: lensStrength * alphaInfRad, rsMpc }`. Rewrite the module docblock: lensing now driven by R500 (every cluster lenses; significance is a display-only weight); sort/cap by physical α∞; `lensStrength` is the dimensionless multiplier (0 = off, 1 = physical, ~1000 = exaggerated). Note the geometry is eye-relative per frame — `dirLens` + `dL` are precomputed here so the shader does no per-vertex subtract / `length` / `normalize`.

- [ ] **Step 4: Run the test, verify it passes**

Run: `npm test -- buildClusterLenses`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/lensing/buildClusterLenses.ts tests/utils/lensing/buildClusterLenses.test.ts
git commit -m "feat(lensing): drive buildClusterLenses from physical R500 + lensStrength"
```

---

### Task 4: `packLensingUniforms` two-vec4 / 528-byte layout

**Files:**
- Modify: `src/utils/gpu/packLensingUniforms.ts`
- Test: `tests/utils/gpu/packLensingUniforms.test.ts` (rewrite)

**Interfaces:**
- Consumes: `LensingUniformsValue` (no `scaleRadiusMpc`, Task 2); `LensSpec` with `rsMpc` (Task 2).
- Produces (unchanged names, new values/layout):
  - `MAX_LENSES = 16`
  - `LENSING_UNIFORM_BYTES = 16 + MAX_LENSES * 32` (= 528)
  - `packLensingUniforms(value: LensingUniformsValue): ArrayBuffer`

**Byte layout (528 bytes):**

| offset | field | type | notes |
| --- | --- | --- | --- |
| 0 | enabled | u32 | 0 / 1 |
| 4 | count | u32 | ≤ MAX_LENSES |
| 8 | mode | u32 | 0 = SIS, 1 = NFW |
| 12 | _pad0 | u32 | retired `scaleRadius` word — written ZERO |
| 16 | lenses | `array<LensData, 16>` | 32 bytes each |

Per lens `i` (lens base byte = `16 + i*32`; float index base = `4 + i*8`):

| sub-offset | field | float index | value |
| --- | --- | --- | --- |
| +0 | geom.x (dirLens.x) | base+0 | `dirLens[0]` |
| +4 | geom.y (dirLens.y) | base+1 | `dirLens[1]` |
| +8 | geom.z (dirLens.z) | base+2 | `dirLens[2]` |
| +12 | geom.w (dL) | base+3 | `dL` |
| +16 | params.x (thetaERad) | base+4 | `thetaERad` |
| +20 | params.y (r_s) | base+5 | `rsMpc` |
| +24..+31 | reserved | base+6..base+7 | 0 |

- [ ] **Step 1: Rewrite the failing test**

Replace `tests/utils/gpu/packLensingUniforms.test.ts` entirely with:

```ts
/**
 * packLensingUniforms — byte-layout guard tests for the two-vec4 (528-byte)
 * lens stride. Every written offset is asserted against a known fixture so a
 * layout drift fails loudly here rather than silently producing a bad frame.
 */

import { describe, it, expect } from 'vitest';
import {
  packLensingUniforms,
  LENSING_UNIFORM_BYTES,
  MAX_LENSES,
} from '../../../src/utils/gpu/packLensingUniforms';
import type { LensingUniformsValue } from '../../../src/@types/rendering/LensingUniformsValue';

const VALUE: LensingUniformsValue = {
  enabled: true,
  lenses: [
    { dirLens: [1, 0, 0], dL: 10, thetaERad: 0.05, rsMpc: 0.4 },
    { dirLens: [0, 1, 0], dL: 20, thetaERad: 0.08, rsMpc: 0.6 },
  ],
  mode: 'nfw',
};

describe('packLensingUniforms — byteLength', () => {
  it('returns a buffer of exactly LENSING_UNIFORM_BYTES (528 at MAX_LENSES=16)', () => {
    const buf = packLensingUniforms(VALUE);
    expect(buf.byteLength).toBe(LENSING_UNIFORM_BYTES);
    expect(buf.byteLength).toBe(528);
  });
});

describe('packLensingUniforms — header (bytes 0..15)', () => {
  it('writes enabled as 1 at byte 0 (u32 index 0)', () => {
    const u32 = new Uint32Array(packLensingUniforms(VALUE));
    expect(u32[0]).toBe(1);
  });

  it('writes enabled as 0 when disabled', () => {
    const u32 = new Uint32Array(packLensingUniforms({ ...VALUE, enabled: false }));
    expect(u32[0]).toBe(0);
  });

  it('writes count at byte 4 (u32 index 1)', () => {
    const u32 = new Uint32Array(packLensingUniforms(VALUE));
    expect(u32[1]).toBe(2);
  });

  it('writes mode at byte 8 (u32 index 2) — 1 for NFW', () => {
    const u32 = new Uint32Array(packLensingUniforms(VALUE));
    expect(u32[2]).toBe(1);
  });

  it('writes mode as 0 for SIS', () => {
    const u32 = new Uint32Array(packLensingUniforms({ ...VALUE, mode: 'sis' }));
    expect(u32[2]).toBe(0);
  });

  it('leaves the retired scaleRadius word (byte 12, float index 3) zero', () => {
    const f32 = new Float32Array(packLensingUniforms(VALUE));
    expect(f32[3]).toBe(0);
  });
});

describe('packLensingUniforms — lens array (two vec4 per lens, bytes 16..)', () => {
  it('packs lens[0] geom (dirLens+dL) at float indices 4..7 and params (thetaE,r_s) at 8..9', () => {
    const f32 = new Float32Array(packLensingUniforms(VALUE));
    expect(f32[4]).toBe(1); // dirLens.x
    expect(f32[5]).toBe(0); // dirLens.y
    expect(f32[6]).toBe(0); // dirLens.z
    expect(f32[7]).toBe(10); // dL
    expect(f32[8]).toBeCloseTo(0.05); // thetaERad
    expect(f32[9]).toBeCloseTo(0.4); // r_s
    expect(f32[10]).toBe(0); // reserved
    expect(f32[11]).toBe(0);
  });

  it('packs lens[1] geom (dirLens+dL) at float indices 12..15 and params (thetaE,r_s) at 16..17', () => {
    const f32 = new Float32Array(packLensingUniforms(VALUE));
    expect(f32[12]).toBe(0); // dirLens.x
    expect(f32[13]).toBe(1); // dirLens.y
    expect(f32[14]).toBe(0); // dirLens.z
    expect(f32[15]).toBe(20); // dL
    expect(f32[16]).toBeCloseTo(0.08); // thetaERad
    expect(f32[17]).toBeCloseTo(0.6); // r_s
  });

  it('leaves unused lens slots (float index 20+) zero', () => {
    const f32 = new Float32Array(packLensingUniforms(VALUE));
    for (let i = 20; i < LENSING_UNIFORM_BYTES / 4; i++) {
      expect(f32[i]).toBe(0);
    }
  });
});

describe('packLensingUniforms — count cap', () => {
  it('caps count at MAX_LENSES even when handed more lenses', () => {
    const many = Array.from({ length: MAX_LENSES + 4 }, () => ({
      dirLens: [1, 0, 0] as const,
      dL: 10,
      thetaERad: 0.01,
      rsMpc: 0.5,
    }));
    const u32 = new Uint32Array(packLensingUniforms({ ...VALUE, lenses: many }));
    expect(u32[1]).toBe(MAX_LENSES);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npm test -- packLensingUniforms`
Expected: FAIL — current packer is 272 bytes, one vec4 per lens, still reads `scaleRadiusMpc`.

- [ ] **Step 3: Rewrite `packLensingUniforms`**

Set `LENSING_UNIFORM_BYTES = 16 + MAX_LENSES * 32`. Header: write `enabled`, `count`, `mode`; do NOT write byte 12 (leave the retired `scaleRadius` word zero — it stays as `_pad0`). Per lens, float index base `4 + i*8`: write `dirLens.xyz` + `dL` into the first vec4 (`geom`), `thetaERad` into `base+4` and `rsMpc` into `base+5` (the second vec4, `params`), leave `base+6..+7` zero. Update the module docblock + the `LENSING_UNIFORM_BYTES` doc to the 528-byte two-vec4 layout (paste the byte table above), retire the `scaleRadius` header word to `_pad0`, and keep the "MAX_LENSES must match `lib/lensingUniforms.wesl`" drift note pointing at the `LensData` array length.

- [ ] **Step 4: Run the test, verify it passes**

Run: `npm test -- packLensingUniforms`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/gpu/packLensingUniforms.ts tests/utils/gpu/packLensingUniforms.test.ts
git commit -m "feat(lensing): two-vec4 528-byte lens stride; per-lens r_s, retire header scaleRadius"
```

---

### Task 5: WESL `LensingUniforms` + `LensData` struct + per-lens `r_s` read (build-link gate)

**Files:**
- Modify: `src/services/gpu/shaders/lib/lensingUniforms.wesl`
- Modify: `src/services/gpu/shaders/lib/lensing.wesl`

**Interfaces:**
- Consumes: the 528-byte CPU layout from Task 4 (the WESL struct must match it byte-for-byte).
- Produces (WGSL, consumed by `points/vertex.wesl` and `pickRenderer`):
  ```wgsl
  struct LensData {
    geom:   vec4<f32>,   // xyz = unit eye->lens dir, w = dL (eye->lens distance, Mpc)
    params: vec4<f32>,   // x = thetaERad, y = r_s Mpc, zw = 0 (reserved)
  }
  struct LensingUniforms {
    enabled: u32,
    count:   u32,
    mode:    u32,
    _pad0:   u32,              // was the global scaleRadius (retired)
    lenses:  array<LensData, 16>,
  }
  ```

**Why these two files change together:** the `array<LensData, 16>` struct and the per-lens reads in `lensing.wesl` must land in the same commit, or `npm run build` fails to link (a `LensData` reference with no struct, or a `lensing.scaleRadius` read with no field). The build-link gate (`npm run build`) is the acceptance test for this task — there is no Vitest unit test for `.wesl` linking beyond the existing parity test.

**The lens MATH is identical.** The only change to `lensTerm` is its INPUTS: instead of receiving a world-space lens centre + the eye position and recomputing eye-relative geometry per vertex, it receives the precomputed eye-relative `dirLens` + `dL` straight from the uniform. The deflection math, envelopes, tangent, `nfwShape`, distance factor, strength envelope — ALL unchanged.

**Precise `lensing.wesl` edits:**

1. `lensTerm`'s SIGNATURE changes. Currently:
   ```wgsl
   fn lensTerm(eye: vec3<f32>, lens: vec4<f32>, dirSrc: vec3<f32>, dS: f32, mode: u32, scaleRadiusMpc: f32) -> ...
   ```
   becomes:
   ```wgsl
   fn lensTerm(dirLens: vec3<f32>, dL: f32, thetaE: f32, dirSrc: vec3<f32>, dS: f32, mode: u32, scaleRadiusMpc: f32) -> ...
   ```
   In the body, DELETE the four lines that derived geometry from the world centre + eye:
   ```wgsl
   let thetaE = lens.w;
   let toLens = lens.xyz - eye;
   let dL = length(toLens);
   let dirLens = toLens / dL;
   ```
   These are now inputs. KEEP everything from the `if (thetaE <= 0.0) { return term; }` guard and the `if (dS <= dL || dL < 1e-4 || dS < 1e-4)` guard onward BYTE-IDENTICAL — reorder the `thetaE <= 0.0` guard to come first (there's no more `toLens` to compute before it). Nothing else in the body moves.
2. In `lensedPosition`, the call site (line ~402) currently passes the global:
   ```wgsl
   let term = lensTerm(eye, lensing.lenses[i], dirSrc, dS, lensing.mode, lensing.scaleRadius);
   ```
   becomes (note `lensing.lenses[i]` is now a `LensData`):
   ```wgsl
   let ld = lensing.lenses[i];
   let term = lensTerm(ld.geom.xyz, ld.geom.w, ld.params.x, dirSrc, dS, lensing.mode, ld.params.y);
   ```
   `lensedPosition` still receives `eye` and uses it for `toSrc` / `dS` — UNCHANGED. `lensTerm` no longer takes `eye`.
3. The dominant-lens NFW LUT branch reads the global r_s at line ~440:
   ```wgsl
   let r_s = max(lensing.scaleRadius, 1e-4);
   ```
   This must become the DOMINANT lens's r_s. Track it alongside the other `best*` accumulators: add `var bestRs = 1e-4;` next to `var bestDL = 0.0;` (line ~397), set `bestRs = ld.params.y;` inside the `if (ratio > bestRatio)` block (next to `bestDL = term.dL;`, line ~417), and change line ~440 to:
   ```wgsl
   let r_s = max(bestRs, 1e-4);
   ```
4. There are NO other reads of `lensing.scaleRadius`. After these edits, `lensing.scaleRadius` appears nowhere (the field no longer exists on the struct). The LUT axis math, counter-image math, magnification, `nfwShape`, and the two SIS envelopes are UNTOUCHED — only `lensTerm`'s inputs (world centre + eye → precomputed `dirLens` + `dL`) and the SOURCE of `r_s` (global header word → per-lens value) moved.

- [ ] **Step 1: Update `lib/lensingUniforms.wesl`**

Replace the `LensingUniforms` struct with the `LensData` + `LensingUniforms` pair above (528-byte layout): `geom` carries the precomputed unit eye→lens dir + `dL` (eye→lens distance), `params` carries `thetaERad` + r_s. Rewrite the comment header: per-lens geometry is precomputed CPU-side each frame (so the shader does no per-vertex subtract / 'length' / 'normalize'), r_s is now PER-LENS (params.y), the old global 'scaleRadius' header word is retired to '_pad0'; byte layout is 528 (4-scalar header + an 'array' of 16 'LensData' at byte 16, each 'LensData' two 'vec4<f32>'s = 32 bytes). Keep the single-drift-point note (the 'array' length MUST match 'MAX_LENSES' in 'packLensingUniforms.ts'). No backticks — single quotes for identifier callouts.

- [ ] **Step 2: Update `lib/lensing.wesl` per-lens r_s reads**

Apply edits 1–3 above: change `lensTerm`'s signature to take precomputed `dirLens` + `dL` + `thetaE` (deleting the four geometry-derivation lines from its body, reordering the `thetaE <= 0.0` guard first); the call site binds `let ld = lensing.lenses[i];` and passes `ld.geom.xyz`, `ld.geom.w`, `ld.params.x`, …, `ld.params.y`; add `bestRs` tracking (`bestRs = ld.params.y;`); the LUT `r_s` reads `bestRs`. Update the `lensedPosition` docblock's `lensing` param description (it currently says "enabled / count / mode / scaleRadius + the lens array") to reflect the per-lens precomputed geometry + r_s and the retired header word. Update the "## Prototype scope" comment paragraph: θ_E per cluster is now `lensStrength × physical α∞(R500)` (driven by the cluster's actual R500), and r_s = R500/c500 per cluster — drop the "UI master angle scaled by significance" wording; note the per-lens eye-relative geometry is precomputed CPU-side. No backticks. The build-link gate (`npm run build`) plus the DoD visual confirmation are the safety net — there is no WESL unit test.

- [ ] **Step 3: Build-link gate (controller runs)**

Run: `npm run build`
Expected: tsc clean + vite build links the WESL with no "module not found" / "unexpected token" / `Invalid ShaderModule` errors. If it fails, run through the wesl-shaders skill checklist (backticks in comments? import placement? `package::` prefix?).

- [ ] **Step 4: Parity test stays green**

Run: `npm test -- nfwLutConstants`
Expected: PASS (the LUT axis consts `LENS_LUT_Y_MAX` / `LENS_LUT_S_MAX` / `LENS_LUT_LOG_K` are untouched).

- [ ] **Step 5: Commit**

```bash
git add src/services/gpu/shaders/lib/lensingUniforms.wesl src/services/gpu/shaders/lib/lensing.wesl
git commit -m "feat(lensing): LensData two-vec4 struct; read per-lens r_s in lensing.wesl"
```

---

### Task 6: Settings — rename `lensStrengthDeg → lensStrength`, remove `lensScaleRadiusMpc`

**Files:**
- Modify: `src/data/defaults.ts`
- Modify: `src/@types/settings/EngineSettingsState.d.ts`
- Modify: `src/state/settings/initialState.ts`
- Modify: `src/state/settings/settingsSlice.ts`
- Modify: `src/state/settings/selectors.ts`
- Test: existing settings tests (controller runs full suite + typecheck)

**Interfaces:**
- Produces (settings surface):
  - `DEFAULT_LENS_STRENGTH = 1.0` (replaces `DEFAULT_LENS_STRENGTH_DEG`); `DEFAULT_LENS_SCALE_RADIUS_MPC` deleted.
  - `EngineSettingsState['debug']` carries `lensStrength: number` (replacing `lensStrengthDeg`); `lensScaleRadiusMpc` removed.
  - Slice action `setLensStrength` (replaces `setLensStrengthDeg`); `setLensScaleRadiusMpc` removed.
  - Selector `selectLensStrength` (replaces `selectLensStrengthDeg`); `selectLensScaleRadiusMpc` removed.

**Note:** `debug` is NOT in `SettingsSnapshot` (see `src/@types/engine/settings/SettingsSnapshot.d.ts`), so the tour snapshot / merge path needs no change.

- [ ] **Step 1: `src/data/defaults.ts`**

Replace `DEFAULT_LENS_STRENGTH_DEG = 3.0` with `DEFAULT_LENS_STRENGTH = 1.0` and rewrite its docblock: dimensionless multiplier, 0 = no lensing, 1 = the real physical effect (per-cluster R500-derived α∞), slider runs to ~1000× for exaggeration. Delete `DEFAULT_LENS_SCALE_RADIUS_MPC` and its docblock (r_s is now per-cluster, R500/c500, not a global default).

- [ ] **Step 2: `src/@types/settings/EngineSettingsState.d.ts`**

In the `debug` cluster, rename `lensStrengthDeg: number` → `lensStrength: number` and rewrite its doc: dimensionless strength multiplier (0 off, 1 physical, slider to ~1000); the per-source `D_ls/D_s` still applies in-shader. Delete the `lensScaleRadiusMpc` field + its doc (r_s is per-cluster now). Leave `lensMode` and `lensingEnabled` unchanged.

- [ ] **Step 3: `src/state/settings/initialState.ts`**

Update the imports from `data/defaults`: drop `DEFAULT_LENS_STRENGTH_DEG` + `DEFAULT_LENS_SCALE_RADIUS_MPC`, add `DEFAULT_LENS_STRENGTH`. In the `debug:` literal, replace `lensStrengthDeg: DEFAULT_LENS_STRENGTH_DEG` with `lensStrength: DEFAULT_LENS_STRENGTH` and delete the `lensScaleRadiusMpc:` line.

- [ ] **Step 4: `src/state/settings/settingsSlice.ts`**

Rename reducer `setLensStrengthDeg` → `setLensStrength` (writes `settings.debug.lensStrength = action.payload`). Delete the `setLensScaleRadiusMpc` reducer. Update the `export const { … }` destructure list accordingly (rename `setLensStrengthDeg`, drop `setLensScaleRadiusMpc`).

- [ ] **Step 5: `src/state/settings/selectors.ts`**

Rename `selectLensStrengthDeg` → `selectLensStrength` (reads `selectSettings(state).debug.lensStrength`). Delete `selectLensScaleRadiusMpc`.

- [ ] **Step 6: Typecheck reveals consumers**

Run: `npm run typecheck`
Expected: errors ONLY in `renderFrame.ts` (Task 7), `DebugPanel.tsx` / `DebugPanelContainer.tsx` / `LensingTuningSection.tsx` (Task 8) — the dangling `lensStrengthDeg` / `lensScaleRadiusMpc` references those tasks remove. No other site should reference the renamed/removed symbols. If any unexpected site appears, fix it here (it is a settings consumer the plan didn't anticipate).

- [ ] **Step 7: Commit**

```bash
git add src/data/defaults.ts src/@types/settings/EngineSettingsState.d.ts src/state/settings/initialState.ts src/state/settings/settingsSlice.ts src/state/settings/selectors.ts
git commit -m "feat(lensing): rename lensStrengthDeg→lensStrength; remove lensScaleRadiusMpc setting"
```

---

### Task 7: `renderFrame` wiring

**Files:**
- Modify: `src/services/engine/frame/renderFrame.ts:143-159`

**Interfaces:**
- Consumes: `buildClusterLenses(structures, camPos, target, lensStrength, maxLenses)` (Task 3); `LensingUniformsValue` without `scaleRadiusMpc` (Task 2); settings `lensStrength` (Task 6).

**Before (lines ~143-159):**
```ts
const lensEnabled = state.settings.debug.lensingEnabled;
const masterThetaRad = (state.settings.debug.lensStrengthDeg * Math.PI) / 180;
const lenses = lensEnabled
  ? buildClusterLenses(
      state.data.structures.all(),
      ctx.drawCamPos,
      ctx.cam.target,
      masterThetaRad,
      MAX_LENSES,
    )
  : [];
state.gpu.lensingUniform?.write({
  enabled: lensEnabled,
  lenses,
  mode: state.settings.debug.lensMode,
  scaleRadiusMpc: state.settings.debug.lensScaleRadiusMpc,
});
```

**After:**
```ts
const lensEnabled = state.settings.debug.lensingEnabled;
const lenses = lensEnabled
  ? buildClusterLenses(
      state.data.structures.all(),
      ctx.drawCamPos,
      ctx.cam.target,
      state.settings.debug.lensStrength,
      MAX_LENSES,
    )
  : [];
state.gpu.lensingUniform?.write({
  enabled: lensEnabled,
  lenses,
  mode: state.settings.debug.lensMode,
});
```

- [ ] **Step 1: Apply the edit**

Drop the `masterThetaRad` degree→radian computation; pass `state.settings.debug.lensStrength` directly as the 4th arg. Remove `scaleRadiusMpc` from the `.write({...})` value. Update the surrounding comment (lines ~138-142) to say the lens strength is the dimensionless multiplier and r_s is now per-cluster (carried on each lens), no longer a global write — drop the "Einstein radii" / degree wording where it implies a single global angle. `buildClusterLenses` now also precomputes each lens's eye-relative geometry (`dirLens` + `dL`) internally from the `camPos` / `target` it already receives, so renderFrame's call site is unchanged.

- [ ] **Step 2: Typecheck (controller)**

Run: `npm run typecheck`
Expected: `renderFrame.ts` now clean; remaining errors only in the DebugPanel trio (Task 8).

- [ ] **Step 3: Commit**

```bash
git add src/services/engine/frame/renderFrame.ts
git commit -m "feat(lensing): pass lensStrength to buildClusterLenses; drop global r_s write"
```

---

### Task 8: DebugPanel log-scaled strength slider + r_s slider removal

**Files:**
- Create: `src/utils/lensing/lensStrengthFromSlider.ts`
- Create: `src/utils/lensing/lensSliderFromStrength.ts`
- Modify: `src/components/DebugPanel/LensingTuningSection.tsx`
- Modify: `src/components/DebugPanel/DebugPanel.tsx`
- Modify: `src/components/containers/DebugPanelContainer.tsx`
- Test: `tests/utils/lensing/lensStrengthFromSlider.test.ts`

**Interfaces:**
- Produces:
  - `lensStrengthFromSlider(p: number): number` — slider position `p ∈ [0, 1]` → resolved `lensStrength`. `p ≤ 0` ⟹ `0` (hard off); `p ∈ (0, 1]` ⟹ `10^(LOG_MIN + p·(LOG_MAX − LOG_MIN))` with `LOG_MIN = -1`, `LOG_MAX = 3`.
  - `lensSliderFromStrength(strength: number): number` — inverse, for seeding the slider from the stored multiplier. `strength ≤ 0` ⟹ `0`; otherwise `(log10(strength) − LOG_MIN) / (LOG_MAX − LOG_MIN)`, clamped to `[0, 1]`.
  - `LensingTuningSection` prop rename: `strengthDeg → lensStrength`, `onStrengthDegChange → onLensStrengthChange`; remove `scaleRadiusMpc` + `onScaleRadiusMpcChange`.

The `LOG_MIN`/`LOG_MAX` constants live as module-level consts inside `lensStrengthFromSlider.ts`; `lensSliderFromStrength.ts` imports them from there (single source of truth) OR re-declares with a comment pointing at the forward map — prefer importing to avoid drift. (One-function-per-file still holds: the consts are not the file's exported symbol.)

- [ ] **Step 1: Write the failing mapper test**

```ts
// tests/utils/lensing/lensStrengthFromSlider.test.ts
import { describe, it, expect } from 'vitest';
import { lensStrengthFromSlider } from '../../../src/utils/lensing/lensStrengthFromSlider';
import { lensSliderFromStrength } from '../../../src/utils/lensing/lensSliderFromStrength';

describe('lensStrengthFromSlider', () => {
  it('maps p = 0 to a hard-off strength of 0', () => {
    expect(lensStrengthFromSlider(0)).toBe(0);
  });

  it('clamps negative p to 0', () => {
    expect(lensStrengthFromSlider(-0.3)).toBe(0);
  });

  it('maps p = 1 to 1000× (LOG_MAX = 3)', () => {
    expect(lensStrengthFromSlider(1)).toBeCloseTo(1000, 3);
  });

  it('maps the low end p just above 0 toward 0.1× (LOG_MIN = -1)', () => {
    // The smallest non-zero slider value resolves near 10^-1.
    expect(lensStrengthFromSlider(1e-9)).toBeCloseTo(0.1, 6);
  });

  it('puts the physical 1.0× at p = 0.25 (log-midpoint of [-1, 3])', () => {
    // 10^(-1 + 0.25·4) = 10^0 = 1.
    expect(lensStrengthFromSlider(0.25)).toBeCloseTo(1.0, 6);
  });
});

describe('lensSliderFromStrength', () => {
  it('inverts lensStrengthFromSlider for in-range strengths', () => {
    for (const p of [0.1, 0.25, 0.5, 0.75, 1]) {
      expect(lensSliderFromStrength(lensStrengthFromSlider(p))).toBeCloseTo(p, 6);
    }
  });

  it('maps strength 0 back to slider 0', () => {
    expect(lensSliderFromStrength(0)).toBe(0);
  });

  it('maps the physical 1.0× back to p = 0.25', () => {
    expect(lensSliderFromStrength(1)).toBeCloseTo(0.25, 6);
  });

  it('clamps an above-range strength to slider 1', () => {
    expect(lensSliderFromStrength(1e6)).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npm test -- lensStrengthFromSlider`
Expected: FAIL — both modules missing.

- [ ] **Step 3: Implement the two mappers**

Create `src/utils/lensing/lensStrengthFromSlider.ts` with module consts `LOG_MIN = -1`, `LOG_MAX = 3` and the forward map per the Interfaces contract. Create `src/utils/lensing/lensSliderFromStrength.ts` importing `LOG_MIN` / `LOG_MAX` from the forward file (export them there) and computing the clamped inverse. Didactic header on the forward file: linear-in-log-space so 1× sits mid-range and both the subtle (~0.1) and huge (~1000) ends are reachable; `p = 0` is a sentinel hard-off (not `10^-∞`), which is why the function special-cases it rather than letting the formula run.

- [ ] **Step 4: Run the test, verify it passes**

Run: `npm test -- lensStrengthFromSlider`
Expected: PASS.

- [ ] **Step 5: Rewire `LensingTuningSection.tsx`**

Rename props `strengthDeg → lensStrength`, `onStrengthDegChange → onLensStrengthChange`; remove `scaleRadiusMpc` + `onScaleRadiusMpcChange` and the entire NFW-only "Scale radius" `Slider` block. Replace the "Peak deflection" slider with a log-scaled "Strength" slider: the slider's `value` is `lensSliderFromStrength(lensStrength)` over `min={0} max={1} step={0.001}`, and `onChange` calls `onLensStrengthChange(lensStrengthFromSlider(p))`. The readout shows the multiplier: `off` when `lensStrength <= 0`, else a formatted `'{n}×'` (e.g. `1.0×`, `42×` — small values one decimal, large values rounded). Import the two mappers. Update the module docblock: the strength knob is now a log-scaled dimensionless multiplier (0 = off, 1 = physical, ~1000 = exaggerated); r_s is per-cluster (R500/c500) and no longer a UI knob, so the section drops the scale-radius slider.

- [ ] **Step 6: Rewire `DebugPanel.tsx`**

In `DebugPanelProps`: rename `lensStrengthDeg → lensStrength`, `onLensStrengthDegChange → onLensStrengthChange`; remove `lensScaleRadiusMpc` + `onLensScaleRadiusMpcChange`. Update the destructure + the `<LensingTuningSection .../>` props (drop `scaleRadiusMpc` / `onScaleRadiusMpcChange`, pass `lensStrength` / `onLensStrengthChange`). Update the prop docblock that mentions "the exaggerated peak deflection in degrees, and the NFW scale radius" → dimensionless strength multiplier; drop the r_s mention.

- [ ] **Step 7: Rewire `DebugPanelContainer.tsx`**

Swap selector import `selectLensStrengthDeg → selectLensStrength`, drop `selectLensScaleRadiusMpc`. Swap action import `setLensStrengthDeg → setLensStrength`, drop `setLensScaleRadiusMpc`. Replace the `lensStrengthDeg` selector read with `lensStrength`; drop the `lensScaleRadiusMpc` read. Replace `onLensStrengthDegChange` with `onLensStrengthChange` (dispatches `setLensStrength`); delete `onLensScaleRadiusMpcChange`. Update the `<DebugPanel .../>` props accordingly.

- [ ] **Step 8: Full suite + typecheck (controller)**

Run: `npm test`
Expected: PASS (entire suite green).
Run: `npm run typecheck`
Expected: clean — no dangling `lensStrengthDeg` / `lensScaleRadiusMpc` references anywhere.
Run: `npm run build`
Expected: links.

- [ ] **Step 9: Commit**

```bash
git add src/utils/lensing/lensStrengthFromSlider.ts src/utils/lensing/lensSliderFromStrength.ts tests/utils/lensing/lensStrengthFromSlider.test.ts src/components/DebugPanel/LensingTuningSection.tsx src/components/DebugPanel/DebugPanel.tsx src/components/containers/DebugPanelContainer.tsx
git commit -m "feat(lensing): log-scaled strength slider; remove r_s slider"
```

---

## Definition of Done

- [ ] All 8 tasks complete; full Vitest suite green; `npm run typecheck` clean; `npm run build` links the WESL.
- [ ] Coma sanity test passes (`clusterLensDeflection(1.4)` α∞ in the asserted band, ≈ 31″).
- [ ] Strength `0` is hard-off (slider `p = 0` → no lenses); `1` is the physical effect; slider reaches ~1000×.
- [ ] Per-cluster r_s renders — NFW ring size varies between clusters of different R500 (no longer a single global scale radius).
- [ ] Per-vertex lens geometry is precomputed CPU-side — `lensTerm` does no per-vertex `toLens` / `length` / `normalize` (verify the four deleted lines are gone and the shader reads `ld.geom`).
- [ ] `lensScaleRadiusMpc` and `lensStrengthDeg` are fully removed — no dangling references in src or tests (`npm run typecheck` proves it; a `git grep lensStrengthDeg` / `git grep lensScaleRadiusMpc` / `git grep masterThetaRad` returns nothing).
- [ ] **Visual confirmation (manual gate):** with lensing enabled and an NFW profile, NFW rings appear on featured clusters (Coma, Virgo) and visibly scale with the strength slider; rings on clusters of different R500 differ in size. Ask the user to confirm against the running dev server.

## Out of scope (deferred — do NOT implement)

- Per-cluster concentration `c500` from a mass–concentration relation (fixed fiducial 3.2 this pass).
- Redshift-dependent `ρ_crit(z)` (uses `ρ_crit,0`; lensing clusters are all low-z).
- Supercluster / group lensing (only `category === 'cluster'` lenses).
- The NFW image-finding LUT, counter-image math, magnification, pick pass, 12-vertex gate, `@group(3)` scene-group wiring, the SIS/NFW mode toggle, and the in-front-of-camera test all stay UNTOUCHED.
