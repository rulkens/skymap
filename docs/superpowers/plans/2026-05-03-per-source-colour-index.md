# Per-Source Colour Index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give 2MRS and GLADE galaxies real galaxy-type colour variation by computing per-source colour indices from each survey's *own* photometry (`B−J` for GLADE, `J−K` for 2MRS) instead of forcing every row through SDSS-style `u−g` (which non-SDSS surveys don't measure). Currently every non-SDSS galaxy renders with the same fixed sentinel colour because `u−g` is `NaN`; after this plan, 2MRS shows the narrow J/K colour spread and GLADE shows the wide B/J spread, so spirals/ellipticals are distinguishable in both.

**Architecture:** Colour-index choice and remapping is a *load-time* concern, not a render-time concern. We do the per-source pick (which bands), normalise to a common 0..2 scale (so the existing WGSL ramp doesn't need per-source branches), and pre-bake the result into the per-instance vertex attribute that `colorIndex` reads. The K-correction coefficient — which ALSO varies by colour pair — moves from a hard-coded shader constant to a NEW per-vertex attribute, appended after the existing 6-slot layout (position×3, magnitude, colorIndex, globalInstanceIdx). After this plan, the per-instance vertex stride goes from 24 bytes (6 slots) to 28 bytes (7 slots), with kPerZ at byte offset 24 / shaderLocation 4. The visual fragment is unchanged. The InfoCard's qualitative galaxy-type classifier (currently `galaxyTypeFromColor(u−r)`) gains per-source variants so "Red, quiescent" is judged against the actual colour pair rather than against SDSS thresholds.

**Tech Stack:** TypeScript 6, WebGPU + WGSL, Vitest 4. Project conventions: `type` not `interface`, didactic comments, single quotes, 100-char lines, trailing commas.

---

## File Structure

**New pure helpers (one function per file, mirrors `src/utils/math/` style):**

- `src/data/colourIndex.ts` — central per-source table mapping `Source → ColourIndexSpec`. One spec per source defines: which two `magX` slots to subtract, the natural `[min, max]` range of that colour for galaxies (used to normalise to the shader's 0..2 ramp), the K-correction coefficient (per unit redshift), and the human-readable colour-pair label. Plus a helper `pickColourIndex(source, magU, magG, magR, magI, magZ): { colourIndex, kPerZ } | null` that returns the normalised value + per-row K coefficient, or `null` if the row is missing one of the constituent bands.
- `src/utils/math/galaxyTypeFromBminusJ.ts` — qualitative "Red, quiescent" / "Blue, star-forming" classifier for GLADE galaxies, using B−J thresholds. Returns the same `GalaxyTypeInfo` shape as the existing `galaxyTypeFromColor`.
- `src/utils/math/galaxyTypeFromJminusK.ts` — qualitative classifier for 2MRS using J−K. Narrower thresholds (J−K spans ~0.7–1.1 across galaxy types) but still a real signal.
- `src/utils/math/galaxyType.ts` — single `galaxyType(source, mags)` entry-point that dispatches to the right per-source classifier. Keeps `pointInfoBuilder.ts` from acquiring a switch.

**Renderer changes (CURRENT vertex layout: 6 slots / 24 bytes — position×3 f32, magnitude f32, colorIndex f32, globalInstanceIdx u32):**

- `src/gpu/pointRenderer.ts` — extend the per-instance vertex buffer from 6 slots (24 bytes) to 7 slots (28 bytes) by appending a `kPerZ` f32 slot at byte offset 24 / shaderLocation 4. `upload()` calls `pickColourIndex(...)` per row, writes the normalised value into the existing `colorIndex` slot (replaces the old `u - g` write), and writes the source's K coefficient into the new slot. `SLOTS_PER_POINT` 6→7 and `POINT_STRIDE` 24→28; the pipeline descriptor adds the 5th attribute. The `NO_COLOUR_SENTINEL` (999) path stays — it now triggers when `pickColourIndex` returns null, with `kPerZ = 0` so the shader's existing sentinel branch behaves identically.
- `src/gpu/pickRenderer.ts` — pipeline's vertex layout updates to match (`arrayStride: 28`, fifth attribute at offset 24 format `float32`). `fsPick` does not read the new attribute, but the pick pipeline must agree with the visual one on the buffer layout or WebGPU validation rejects it.
- `src/gpu/shaders/points.wgsl` — `PerVertex.kPerZ: f32` at `@location(4)` (location 3 is already `globalInstanceIdx`). The existing `K_UG_PER_Z = 3.0` constant is replaced with `p.kPerZ`. The `out.tint = ramp(restColorIndex)` line is unchanged because the JS-side normalisation puts every source's colour into 0..2 already.
- `src/data/pointCloudFormat.ts` — no schema change (the `.bin` file format is unchanged; the per-instance interleaved buffer is rebuilt on upload from the existing five-band photometry).

**Engine integration:**

- `src/services/engine/pointInfoBuilder.ts` — replace `galaxyTypeFromColor(magU - magR)` with `galaxyType(source, { magU, magG, magR, magI, magZ })` so 2MRS rows go through `galaxyTypeFromJminusK` and GLADE through `galaxyTypeFromBminusJ`.
- `src/@types/PointInfo.d.ts` — `galaxyType` field shape is unchanged (still `GalaxyTypeInfo`), only its derivation differs.

**UI:**

- `src/components/InfoCard/FullCard.tsx` — no changes. The colour-row already iterates `info.colours` (added in the band-labels work) so `B−J` etc. already render.

**Tests:**

- `tests/data/colourIndex.test.ts` — pickColourIndex returns the right band difference and kPerZ for each source; returns `null` when constituent bands are NaN.
- `tests/utils/math/galaxyTypeFromBminusJ.test.ts` — known thresholds.
- `tests/utils/math/galaxyTypeFromJminusK.test.ts` — known thresholds.
- `tests/utils/math/galaxyType.test.ts` — dispatch table; SDSS still uses u−r path.

**Untouched:**

- `tools/parsers/*` — the `.bin` file format and per-row five-band slot layout already stays intact; the parsers just dump whatever bands they have. This plan changes only how those slots are *interpreted* at upload time.

---

## Per-Source Colour Specs (the table)

This is the table all the code revolves around. Each row gives the colour pair, its natural range across galaxy types, and the K-correction coefficient.

| Source     | Bands  | Slot diff      | Natural range | k_per_z | Why this k                                                                  |
| ---------- | ------ | -------------- | ------------- | ------- | --------------------------------------------------------------------------- |
| SDSS       | u−g    | `magU − magG`  | 0.5 .. 2.0    | 3.0     | matches existing shader behaviour; calibrated against SDSS spec sample      |
| 2MRS       | J−K    | `magG − magI`  | 0.7 .. 1.1    | 0.0     | NIR colours are nearly redshift-invariant at z<0.1 (where 2MRS lives)       |
| GLADE      | B−J    | `magG − magR`  | 0.5 .. 3.5    | 1.0     | Optical-NIR pair has moderate z dependence; B redshifts out of band slowly  |
| Synthetic  | u−g    | `magU − magG`  | 0.5 .. 2.0    | 3.0     | Synthetic cloud is generated to mimic SDSS, so reuse SDSS spec              |

**Normalisation rule:** the value the shader sees is `(raw − rangeMin) / (rangeMax − rangeMin) * 2.0`, clamped to [0, 2]. This puts every source's colour distribution in the 0..2 range the existing `ramp(t)` function expects (blue → white → red across that range).

**Sentinel preservation:** if any constituent band is NaN, write the existing 999 sentinel to `colorIndex` and `kPerZ = 0`. The shader's `colorIndex > 100.0` branch (added in earlier work) renders the fallback orange-white tint with no K-correction. Behaviour for missing-band rows is unchanged.

---

## Task 1: ColourIndexSpec table + pickColourIndex

**Files:**

- Create: `src/data/colourIndex.ts`
- Create: `tests/data/colourIndex.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/data/colourIndex.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { pickColourIndex } from '../../src/data/colourIndex';
import { Source } from '../../src/data/sources';

describe('pickColourIndex', () => {
  it('SDSS uses u−g and SDSS K coefficient', () => {
    // u=18.5, g=17.5 → u−g = 1.0 → normalised to (1.0-0.5)/(2.0-0.5)*2 = 0.667
    const result = pickColourIndex(Source.SDSS, 18.5, 17.5, NaN, NaN, NaN);
    expect(result).not.toBeNull();
    expect(result!.colourIndex).toBeCloseTo(0.667, 2);
    expect(result!.kPerZ).toBe(3.0);
  });

  it('2MRS uses J−K (slot G − slot I) with zero K coefficient', () => {
    // J=8.5, K=7.6 → J−K = 0.9 → (0.9-0.7)/(1.1-0.7)*2 = 1.0
    const result = pickColourIndex(Source.TwoMRS, NaN, 8.5, NaN, 7.6, NaN);
    expect(result).not.toBeNull();
    expect(result!.colourIndex).toBeCloseTo(1.0, 2);
    expect(result!.kPerZ).toBe(0.0);
  });

  it('GLADE uses B−J (slot G − slot R) with modest K coefficient', () => {
    // B=14.0, J=12.0 → B−J = 2.0 → (2.0-0.5)/(3.5-0.5)*2 = 1.0
    const result = pickColourIndex(Source.Glade, NaN, 14.0, 12.0, NaN, NaN);
    expect(result).not.toBeNull();
    expect(result!.colourIndex).toBeCloseTo(1.0, 2);
    expect(result!.kPerZ).toBe(1.0);
  });

  it('clamps out-of-range colours to [0, 2]', () => {
    // Extreme blue SDSS galaxy: u−g = 0.0 (well below natural min of 0.5)
    const result = pickColourIndex(Source.SDSS, 17.0, 17.0, NaN, NaN, NaN);
    expect(result!.colourIndex).toBe(0);
  });

  it('returns null when a constituent band is NaN', () => {
    // GLADE without B-band
    expect(pickColourIndex(Source.Glade, NaN, NaN, 12.0, NaN, NaN)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/data/colourIndex.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/data/colourIndex.ts`:

```ts
/**
 * Per-source colour-index specs.
 *
 * Each survey carries different photometric bands in its five `magU/G/R/I/Z`
 * slots. Forcing every survey through SDSS-style u−g would clamp non-SDSS
 * colours to the unknown-colour sentinel (since they don't measure u-band)
 * and lose all galaxy-type information. Instead, this module picks the most
 * informative colour pair available *for each source* and normalises it onto
 * the 0..2 range the WGSL ramp expects.
 *
 * See the per-source table in docs/superpowers/plans for the band choices
 * and the rationale behind the K-correction coefficients.
 */

import { Source } from './sources';

/** Description of which colour-pair to use for one source. */
export type ColourIndexSpec = {
  /** Which two five-band slots feed the colour difference. */
  slotA: 'u' | 'g' | 'r' | 'i' | 'z';
  slotB: 'u' | 'g' | 'r' | 'i' | 'z';
  /** Natural range of (magA − magB) across galaxy types for this colour pair. */
  rangeMin: number;
  rangeMax: number;
  /** K-correction coefficient applied per unit redshift in the shader. */
  kPerZ: number;
};

const SPEC: Record<Source, ColourIndexSpec> = {
  [Source.SDSS]: { slotA: 'u', slotB: 'g', rangeMin: 0.5, rangeMax: 2.0, kPerZ: 3.0 },
  [Source.TwoMRS]: { slotA: 'g', slotB: 'i', rangeMin: 0.7, rangeMax: 1.1, kPerZ: 0.0 },
  [Source.Glade]: { slotA: 'g', slotB: 'r', rangeMin: 0.5, rangeMax: 3.5, kPerZ: 1.0 },
  [Source.Synthetic]: { slotA: 'u', slotB: 'g', rangeMin: 0.5, rangeMax: 2.0, kPerZ: 3.0 },
};

/**
 * Look up which slot maps to which mag value, then compute the source-
 * appropriate colour index and K coefficient. Returns null when either
 * constituent band is NaN (so the caller knows to use the sentinel path).
 */
export function pickColourIndex(
  source: Source,
  magU: number,
  magG: number,
  magR: number,
  magI: number,
  magZ: number,
): { colourIndex: number; kPerZ: number } | null {
  const spec = SPEC[source];
  const slotMap = { u: magU, g: magG, r: magR, i: magI, z: magZ };
  const a = slotMap[spec.slotA];
  const b = slotMap[spec.slotB];
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;

  // Normalise to 0..2 to match the shader's existing ramp() input range.
  // Clamp at both ends so outlier galaxies don't fall off the ramp colour.
  const raw = a - b;
  const normalised = ((raw - spec.rangeMin) / (spec.rangeMax - spec.rangeMin)) * 2.0;
  const colourIndex = Math.max(0, Math.min(2, normalised));
  return { colourIndex, kPerZ: spec.kPerZ };
}

/** Public read of the spec table — used by `galaxyType.ts` and tests. */
export function colourIndexSpec(source: Source): ColourIndexSpec {
  return SPEC[source];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/data/colourIndex.test.ts`
Expected: PASS — all 5 cases.

- [ ] **Step 5: Commit**

```bash
git add src/data/colourIndex.ts tests/data/colourIndex.test.ts
git commit -m "feat: add per-source colour-index spec and pickColourIndex helper"
```

---

## Task 2: Per-source galaxy-type classifiers

**Files:**

- Create: `src/utils/math/galaxyTypeFromBminusJ.ts`
- Create: `src/utils/math/galaxyTypeFromJminusK.ts`
- Create: `src/utils/math/galaxyType.ts`
- Create: `tests/utils/math/galaxyTypeFromBminusJ.test.ts`
- Create: `tests/utils/math/galaxyTypeFromJminusK.test.ts`
- Create: `tests/utils/math/galaxyType.test.ts`
- Modify: `src/utils/math/index.ts` (add re-exports)

- [ ] **Step 1: Write the failing tests**

Create `tests/utils/math/galaxyTypeFromBminusJ.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { galaxyTypeFromBminusJ } from '../../../src/utils/math/galaxyTypeFromBminusJ';

describe('galaxyTypeFromBminusJ', () => {
  it('B−J < 1.5 is blue (star-forming)', () => {
    expect(galaxyTypeFromBminusJ(0.8).category).toBe('blue');
  });
  it('1.5 ≤ B−J < 2.5 is intermediate (green valley)', () => {
    expect(galaxyTypeFromBminusJ(2.0).category).toBe('green');
  });
  it('B−J ≥ 2.5 is red (quiescent)', () => {
    expect(galaxyTypeFromBminusJ(3.0).category).toBe('red');
  });
});
```

Create `tests/utils/math/galaxyTypeFromJminusK.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { galaxyTypeFromJminusK } from '../../../src/utils/math/galaxyTypeFromJminusK';

describe('galaxyTypeFromJminusK', () => {
  it('J−K < 0.85 is blue', () => {
    expect(galaxyTypeFromJminusK(0.75).category).toBe('blue');
  });
  it('0.85 ≤ J−K < 1.0 is green', () => {
    expect(galaxyTypeFromJminusK(0.92).category).toBe('green');
  });
  it('J−K ≥ 1.0 is red', () => {
    expect(galaxyTypeFromJminusK(1.05).category).toBe('red');
  });
});
```

Create `tests/utils/math/galaxyType.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { galaxyType } from '../../../src/utils/math/galaxyType';
import { Source } from '../../../src/data/sources';

describe('galaxyType', () => {
  it('SDSS dispatches to u−r classifier', () => {
    // u=18, g=17.5, r=17 → u−r=1.0 → blue
    expect(galaxyType(Source.SDSS, { magU: 18, magG: 17.5, magR: 17, magI: 16.8, magZ: 16.6 }).category)
      .toBe('blue');
  });
  it('GLADE dispatches to B−J classifier', () => {
    expect(galaxyType(Source.Glade, { magU: NaN, magG: 14, magR: 11, magI: 10.5, magZ: 10 }).category)
      .toBe('red'); // B−J = 3.0
  });
  it('2MRS dispatches to J−K classifier', () => {
    expect(galaxyType(Source.TwoMRS, { magU: NaN, magG: 8.5, magR: 8.0, magI: 7.4, magZ: NaN }).category)
      .toBe('red'); // J−K = 1.1
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/utils/math/galaxyType*.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the three new files**

Create `src/utils/math/galaxyTypeFromBminusJ.ts`:

```ts
/**
 * Coarse galaxy classification from B−J colour index.
 *
 * Thresholds are calibrated against the GLADE+ catalogue's B (HyperLEDA) and
 * J (2MASS XSC) magnitudes: late-type spirals cluster around B−J = 1.0,
 * green-valley galaxies near 2.0, and ellipticals/red sequence ≥ 2.5.
 *
 * Returns the same `GalaxyTypeInfo` shape as the existing u−r-based
 * classifier so the InfoCard treats every source uniformly.
 */

import type { GalaxyTypeInfo } from '../../@types';

export function galaxyTypeFromBminusJ(bj: number): GalaxyTypeInfo {
  if (bj < 1.5) return { category: 'blue', description: 'Blue, star-forming galaxy' };
  if (bj < 2.5) return { category: 'green', description: 'Intermediate-colour galaxy' };
  return { category: 'red', description: 'Red, quiescent galaxy' };
}
```

Create `src/utils/math/galaxyTypeFromJminusK.ts`:

```ts
/**
 * Coarse galaxy classification from J−K colour index.
 *
 * NIR colours have a much narrower range than optical (~0.7–1.1 across all
 * galaxy types) because the NIR is dominated by old stellar populations even
 * in star-forming galaxies. Thresholds are tighter accordingly: blue/green
 * separation at 0.85, green/red at 1.0.
 *
 * The qualitative description is intentionally vaguer than the optical
 * classifiers because J−K is a weaker discriminator — calling a J−K = 1.05
 * galaxy "passive" with the same confidence as a u−r = 2.5 SDSS galaxy
 * would overstate the certainty.
 */

import type { GalaxyTypeInfo } from '../../@types';

export function galaxyTypeFromJminusK(jk: number): GalaxyTypeInfo {
  if (jk < 0.85) return { category: 'blue', description: 'Bluer-than-average galaxy' };
  if (jk < 1.0) return { category: 'green', description: 'Typical galaxy colour' };
  return { category: 'red', description: 'Redder-than-average galaxy' };
}
```

Create `src/utils/math/galaxyType.ts`:

```ts
/**
 * Source-aware galaxy-type dispatcher.
 *
 * Each survey carries different photometric bands; using the same colour
 * thresholds for every source would mis-classify non-SDSS rows. This
 * function picks the right classifier based on the source enum, so the
 * InfoCard's "Red, quiescent" / "Blue, star-forming" tag actually reflects
 * the data the survey provides.
 */

import { Source } from '../../data/sources';
import type { GalaxyTypeInfo } from '../../@types';
import { galaxyTypeFromColor } from './galaxyTypeFromColor';
import { galaxyTypeFromBminusJ } from './galaxyTypeFromBminusJ';
import { galaxyTypeFromJminusK } from './galaxyTypeFromJminusK';

/** Subset of mag fields needed for galaxy classification. */
export type GalaxyTypeMags = {
  magU: number;
  magG: number;
  magR: number;
  magI: number;
  magZ: number;
};

const UNKNOWN: GalaxyTypeInfo = { category: 'green', description: 'Unknown galaxy type' };

export function galaxyType(source: Source, mags: GalaxyTypeMags): GalaxyTypeInfo {
  switch (source) {
    case Source.SDSS:
    case Source.Synthetic: {
      // SDSS u−r is the canonical red-sequence/blue-cloud discriminator.
      const ur = mags.magU - mags.magR;
      return Number.isFinite(ur) ? galaxyTypeFromColor(ur) : UNKNOWN;
    }
    case Source.Glade: {
      // GLADE: B in g-slot, J in r-slot.
      const bj = mags.magG - mags.magR;
      return Number.isFinite(bj) ? galaxyTypeFromBminusJ(bj) : UNKNOWN;
    }
    case Source.TwoMRS: {
      // 2MRS: J in g-slot, K in i-slot.
      const jk = mags.magG - mags.magI;
      return Number.isFinite(jk) ? galaxyTypeFromJminusK(jk) : UNKNOWN;
    }
  }
}
```

Add to `src/utils/math/index.ts`:

```ts
export * from './galaxyTypeFromBminusJ';
export * from './galaxyTypeFromJminusK';
export * from './galaxyType';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/utils/math/galaxyType*.test.ts`
Expected: PASS — all 9 cases.

- [ ] **Step 5: Commit**

```bash
git add src/utils/math/galaxyTypeFromBminusJ.ts src/utils/math/galaxyTypeFromJminusK.ts src/utils/math/galaxyType.ts src/utils/math/index.ts tests/utils/math/galaxyType*.test.ts
git commit -m "feat: add per-source galaxy-type classifiers (B−J, J−K)"
```

---

## Task 3: Wire pickColourIndex into pointRenderer.upload

**Files:**

- Modify: `src/gpu/pointRenderer.ts`

**Context:** The current vertex layout is 6 slots / 24 bytes:
- offset 0: position vec3<f32>
- offset 12: magnitude f32
- offset 16: colorIndex f32 (currently raw `u - g` or 999 sentinel)
- offset 20: globalInstanceIdx u32 (added in the picker fix)

This task appends a 7th slot for `kPerZ` (f32) at offset 24, growing the
stride to 28 bytes.

- [ ] **Step 1: Update the layout constants and pipeline descriptor**

In `src/gpu/pointRenderer.ts`, change `SLOTS_PER_POINT` from 6 to 7 (the
constant lives near the top of the file alongside `POINT_STRIDE`). The
`POINT_STRIDE = SLOTS_PER_POINT * 4` derivation already cascades the
24→28 byte change.

In the constructor's `vertex.buffers[0]` descriptor, append a fifth
attribute at offset 24, shaderLocation 4 (do NOT collide with the existing
shaderLocation 3 = globalInstanceIdx):

```ts
attributes: [
  { shaderLocation: 0, offset: 0, format: 'float32x3' },  // position
  { shaderLocation: 1, offset: 12, format: 'float32' },   // magnitude
  { shaderLocation: 2, offset: 16, format: 'float32' },   // colorIndex (normalised after this task)
  { shaderLocation: 3, offset: 20, format: 'uint32' },    // globalInstanceIdx (existing)
  { shaderLocation: 4, offset: 24, format: 'float32' },   // kPerZ — new
],
```

- [ ] **Step 2: Update upload() to call pickColourIndex**

Inside `upload()`, the loop body currently writes 6 slots per instance
using the `interleaved` (Float32Array) and `interleavedU32` (Uint32Array)
views over the same ArrayBuffer. Add the kPerZ write at slot 6 and
replace the raw `u - g` colorIndex write with `pickColourIndex`'s
normalised value:

```ts
import { pickColourIndex } from '../data/colourIndex';

// ... (inside the upload loop, replacing the existing slot 4 / 5 writes)

const NO_COLOUR_SENTINEL = 999;
const colour = pickColourIndex(
  source,
  cloud.magU[i]!,
  cloud.magG[i]!,
  cloud.magR[i]!,
  cloud.magI[i]!,
  cloud.magZ[i]!,
);

interleaved[o + 3] = Number.isFinite(g) ? g + magOffset : SDSS_TARGET_MEAN_MAG;
interleaved[o + 4] = colour ? colour.colourIndex : NO_COLOUR_SENTINEL;
// slot 5 stays as `interleavedU32[o + 5] = priorCount + i;` (globalInstanceIdx, unchanged)
interleaved[o + 6] = colour ? colour.kPerZ : 0;
```

The existing `u - g` and NaN-substitution logic for `colorIndex` is no
longer needed — `pickColourIndex` returns `null` when the row's bands
are missing, which is exactly the sentinel path's trigger condition.

- [ ] **Step 3: Verify type-check + visual reload**

Run: `npx tsc --noEmit`
Expected: clean.

Reload the browser. SDSS galaxies should look identical (same u−g math
as before, just with normalisation applied — the natural range matches
the existing 0..2 ramp). 2MRS and GLADE should still render with the
sentinel orange-white tint at this point because the shader hasn't yet
been told to use `p.kPerZ`. That happens in Task 5.

- [ ] **Step 4: Commit**

```bash
git add src/gpu/pointRenderer.ts
git commit -m "feat: bake per-source normalised colour index + K coefficient into vertex buffer"
```

---

## Task 4: Update pickRenderer's vertex layout to match

**Files:**

- Modify: `src/gpu/pickRenderer.ts`

The pick pipeline must declare the same vertex layout as the visual one or WebGPU rejects the pipeline at draw time.

- [ ] **Step 1: Update the pick pipeline's arrayStride and append the kPerZ attribute**

In `src/gpu/pickRenderer.ts`, find the `vertex.buffers[0]` block. The current arrayStride is 24 with 4 attributes (position, magnitude, colorIndex, globalInstanceIdx as u32). Bump arrayStride to 28 and append the fifth attribute at offset 24:

```ts
buffers: [
  {
    arrayStride: 28,
    stepMode: 'instance',
    attributes: [
      { shaderLocation: 0, offset: 0, format: 'float32x3' }, // position
      { shaderLocation: 1, offset: 12, format: 'float32' }, // magnitude
      { shaderLocation: 2, offset: 16, format: 'float32' }, // colorIndex
      { shaderLocation: 3, offset: 20, format: 'uint32' },  // globalInstanceIdx
      { shaderLocation: 4, offset: 24, format: 'float32' }, // kPerZ — new
    ],
  },
],
```

- [ ] **Step 2: Verify the dev server still loads without WebGPU validation errors**

Open the browser console; reload `localhost:5173`. Check there are no "vertex buffer layout mismatch" or pipeline validation errors. Hover over a galaxy and confirm the InfoCard still appears (picking still works).

- [ ] **Step 3: Commit**

```bash
git add src/gpu/pickRenderer.ts
git commit -m "feat: align pickRenderer vertex layout with new kPerZ attribute"
```

---

## Task 5: Use the per-vertex K coefficient in the shader

**Files:**

- Modify: `src/gpu/shaders/points.wgsl`

- [ ] **Step 1: Add kPerZ to the PerVertex struct and use it in the K-correction**

In `src/gpu/shaders/points.wgsl`:

Add `@location(4) kPerZ: f32` to the `PerVertex` struct definition (location 3 is already `globalInstanceIdx: u32`):

```wgsl
struct PerVertex {
  @location(0) position: vec3<f32>,
  @location(1) magnitude: f32,
  @location(2) colorIndex: f32,
  @location(3) globalInstanceIdx: u32,  // existing
  @location(4) kPerZ: f32,               // new
};
```

Replace the hard-coded `K_UG_PER_Z` constant block:

```wgsl
let HUBBLE_DISTANCE_MPC = 4282.749;
let K_UG_PER_Z = 3.0;
let zRedshift = length(p.position) / HUBBLE_DISTANCE_MPC;

let isUnknownColour = p.colorIndex > 100.0;
let restColorIndex = select(p.colorIndex - K_UG_PER_Z * zRedshift, 1.05, isUnknownColour);
```

with:

```wgsl
// HUBBLE_DISTANCE_MPC stays — it inverts the Hubble-law mapping used at upload.
// K coefficient now varies per row (per source): SDSS uses ~3.0 for u−g, GLADE
// uses ~1.0 for B−J, 2MRS uses 0.0 (NIR is nearly redshift-invariant).
let HUBBLE_DISTANCE_MPC = 4282.749;
let zRedshift = length(p.position) / HUBBLE_DISTANCE_MPC;

let isUnknownColour = p.colorIndex > 100.0;
let restColorIndex = select(p.colorIndex - p.kPerZ * zRedshift, 1.05, isUnknownColour);
```

- [ ] **Step 2: Visually verify in the browser**

With the dev server running, reload `localhost:5173`. Toggle through SDSS / 2MRS / GLADE and confirm:
- SDSS galaxies look unchanged (colour distribution should match what you saw before).
- GLADE shows real spread: a mix of red ellipticals and blue spirals, not all one colour.
- 2MRS shows a narrower spread (still mostly white-ish) but with visible reds and blues at the extremes.
- No galaxies render as solid sky-blue (the old `u−g = NaN` artifact).

- [ ] **Step 3: Commit**

```bash
git add src/gpu/shaders/points.wgsl
git commit -m "feat: use per-row kPerZ for K-correction so non-SDSS surveys keep visible colour"
```

---

## Task 6: Use galaxyType in pointInfoBuilder

**Files:**

- Modify: `src/services/engine/pointInfoBuilder.ts`

- [ ] **Step 1: Replace the SDSS-specific u−r classifier call with the dispatcher**

In `src/services/engine/pointInfoBuilder.ts`, replace:

```ts
import { galaxyTypeFromColor } from '../../utils/math';
// ...
const uMinusR = magU - magR;
// ...
galaxyType: galaxyTypeFromColor(uMinusR),
```

with:

```ts
import { galaxyType } from '../../utils/math';
// ...
galaxyType: galaxyType(source, { magU, magG, magR, magI, magZ }),
```

(Drop the now-unused `uMinusR` local if it's not referenced elsewhere.)

- [ ] **Step 2: Type-check + reload**

Run: `npx tsc --noEmit`
Expected: clean.

Reload the browser. Hover over a GLADE galaxy with B−J ≈ 3 and confirm the InfoCard's galaxy-type description reads "Red, quiescent galaxy" rather than the previous "Unknown" or "Blue" mis-classification.

- [ ] **Step 3: Commit**

```bash
git add src/services/engine/pointInfoBuilder.ts
git commit -m "feat: dispatch galaxy-type description by source so non-SDSS rows aren't u−r-judged"
```

---

## Task 7: README update

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Add a short paragraph under the "Multi-survey support" section**

Add a sentence noting that 2MRS and GLADE now render with their own colour indices (`J−K` and `B−J` respectively) and per-source K-correction coefficients, so galaxy-type variation is visible in all three surveys.

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: note per-source colour indices for 2MRS/GLADE"
```

---

## Out of scope (intentionally)

- **External data fetches.** This plan stays within the photometry already in our `.bin` files. WISE / HyperLEDA / 6dFGS cross-matches would expand colour information further but cost a separate ETL pipeline.
- **AGN/quasar detection.** WISE W1−W2 is the standard AGN discriminator; without WISE photometry we can't tag AGNs reliably here. Ellipticals/spirals/AGNs all collapse onto a single "red sequence" axis with our current data.
- **Spectral energy distribution fits.** A real K-correction comes from SED template fits per object. The linear-in-z approximation in this plan is a visualisation shortcut, not a science-grade calibration. If the user later wants accurate K-corrections for analysis, that's a separate plan.
- **Tweak of the WGSL ramp colours.** The blue → white → red ramp stays. Recolouring the ramp would change every survey at once and is independent of this plan.

---

## Self-Review Checklist

- [x] Every spec requirement maps to a numbered task: ColourIndexSpec table → Task 1; per-source classifiers → Task 2; renderer wiring → Tasks 3+4; shader → Task 5; UI dispatcher → Task 6.
- [x] No placeholder text in code blocks; every step has actual code or commands.
- [x] Method signatures consistent across tasks: `pickColourIndex(source, magU, magG, magR, magI, magZ)` matches its definition and its call site in Task 3.
- [x] Type names consistent: `ColourIndexSpec`, `GalaxyTypeMags`, `GalaxyTypeInfo` all referenced uniformly.
- [x] Each task ends with a commit step.
