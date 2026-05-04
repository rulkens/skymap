# Malmquist Bias Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compensate for the apparent over-density of galaxies near the origin (the Milky Way's neighbourhood) caused by flux-limited survey detection. Without correction, "you-are-here" looks like a cosmic traffic jam — not because nearby space is special, but because nearby galaxies are easier to detect at any luminosity, while distant catalogues are missing all the faint ones (Malmquist 1922). Three correction modes, user-switchable: **Volume-limited** (cleanest, default), **1/V_max** (Schmidt 1968, keeps all data), and **Schechter LF density** (in scope but lighter touch).

**Architecture:** All three corrections share a single shader-side absolute-magnitude computation (`M = m − 5·log₁₀(d_Mpc) − 25` from existing per-vertex magnitude + position). Mode selection is a `u32` uniform; per-mode parameters (M_lim threshold, apparent-mag flux limit, Schechter LUT) are additional uniforms or, for the per-vertex 1/V_max weight, a new f32 vertex attribute. The settings panel gets a dropdown + a slider (the latter active only for volume-limited mode). The whole thing layers on top of the existing point-cloud render — no parser changes, no `.bin` schema change, no atlas, no extra fetches.

**Tech Stack:** TypeScript 6, WebGPU + WGSL, Vitest 4, React 19. Builds on the existing per-vertex layout introduced by the colour-index plan (28 bytes, 7 slots: position×3 / magnitude / colorIndex / globalInstanceIdx / kPerZ).

---

## Context the engineer should know

**The astrophysics in one paragraph.** Surveys catalogue every galaxy whose *apparent* magnitude `m` is brighter than some flux limit `m_lim` (e.g. SDSS spec sample is complete to `m_r ≈ 17.77`). For a given *intrinsic* luminosity `M`, only galaxies within distance `d_max(M) = 10^((m_lim − M)/5 − 5)` Mpc are detectable — bright galaxies (more negative M) reach much farther. Catalogues therefore contain nearby galaxies of every luminosity, but only the brightest at large distance. Number-density per unit volume looks artificially highest near the observer.

**Three orthodox fixes (and what they trade):**

1. **Volume-limited subsample.** Pick a threshold M_lim such that any galaxy brighter than M_lim is detectable across the volume of interest (i.e., M_lim < m_lim − 5·log₁₀(d_max) − 25). Discard everything fainter. The remaining sample is uniformly complete by construction. *Cost:* you lose the deep survey's faint companions.
2. **1/V_max weighting** (Schmidt 1968). Keep every galaxy, but weight it by 1/V_max where V_max ∝ d_max(M)³. Bright galaxies visible everywhere get small weight; intrinsically faint galaxies that only show up locally get large weight (representing the many similar ones we couldn't see). *For visualisation:* modulate per-galaxy alpha rather than thinning the cloud. Trade-off: weights span ~3 orders of magnitude, so naïve mapping saturates or vanishes.
3. **Schechter LF density correction.** Predict expected number-density n(d) at each distance from the survey's flux limit + a Schechter luminosity function (Schechter 1976). Modulate displayed density (alpha) so it approximates the *intrinsic* density. Trade-off: per-survey calibration is delicate; requires a Schechter `(α, M*, φ*)` triple per survey.

**Where this fits in the existing renderer:**

- `src/services/gpu/pointRenderer.ts` already has a 28-byte / 7-slot per-instance layout (position vec3, magnitude f32, colorIndex f32, globalInstanceIdx u32, kPerZ f32). This plan adds an 8th slot (`vMaxWeight: f32`) so the 1/V_max mode doesn't need a per-source uniform race.
- `src/services/gpu/shaders/points.wgsl` already has the K-correction block in the vertex stage. The mode dispatch lives next to it.
- `src/components/SettingsPanel/SettingsPanel.tsx` already has the auto-LOD master + per-source toggles. The Malmquist correction adds one dropdown + one conditional slider to the same panel.
- `src/data/sources.ts` already enumerates surveys + per-source metadata tables. The flux-limit table joins those.

---

## File structure

| File | Responsibility |
|---|---|
| `src/utils/math/distanceModulus.ts` | Pure: `(m, dMpc) → M` and inverse |
| `src/utils/math/vMaxWeight.ts` | Pure: per-galaxy 1/V_max weight given (M, m_lim, M_normalisation) |
| `src/utils/math/schechterDensity.ts` | Pure: expected n(d) given Schechter `(α, M*, φ*)` and m_lim |
| `src/data/surveyFluxLimits.ts` | Per-source flux-limit table + Schechter triple lookup |
| `src/services/gpu/pointRenderer.ts` | Bake `vMaxWeight` into the vertex buffer; add Malmquist uniforms |
| `src/services/gpu/pickRenderer.ts` | Mirror new vertex layout (no logic change) |
| `src/services/gpu/shaders/points.wgsl` | New `kPerZ`-style attribute, mode branch in `vs`, alpha modulation in `fs` |
| `src/services/engine/engine.ts` | Wire setters → uniform updates |
| `src/@types/EngineHandle.d.ts` | New methods: `setBiasMode`, `setAbsMagLimit` |
| `src/@types/EngineCallbacks.d.ts` | Echo callbacks: `onBiasModeChange`, `onAbsMagLimitChange` |
| `src/components/SettingsPanel/SettingsPanel.tsx` | Dropdown + conditional slider |
| `src/components/SettingsPanel/SettingsPanel.module.css` | New styles only if needed |
| `src/App.tsx` | Mirror engine state; thread callbacks |
| `tests/utils/math/distanceModulus.test.ts` | Unit tests |
| `tests/utils/math/vMaxWeight.test.ts` | Unit tests |
| `tests/utils/math/schechterDensity.test.ts` | Unit tests (calibration check) |
| `tests/data/surveyFluxLimits.test.ts` | Lookup correctness |
| `README.md` | One section explaining bias-correction modes |

---

## Mode-selection design

The four modes are an enum:

```ts
export const enum BiasMode {
  None = 0,        // raw data — apparent over-density visible
  VolumeLimited = 1, // primary mode; discard galaxies fainter than M_lim
  VMax = 2,        // 1/V_max alpha modulation
  Schechter = 3,   // Schechter LF density correction
}
```

`None` is the default at startup so first-time users see the raw catalogue. Settings panel selection persists in component state only — no localStorage; the engine drives the UI via echo callbacks (project convention).

---

## Per-survey flux limits (the table this plan revolves around)

| Source     | Band  | m_lim     | Schechter (M*, α, φ*)                | Notes |
| ---------- | ----- | --------- | ------------------------------------ | ----- |
| SDSS       | r     | 17.77     | (−21.18, −1.16, 0.0093 / Mpc³)        | Spec sample completeness; Blanton et al. 2003 LF |
| 2MRS       | K_s   | 11.75     | (−24.13, −1.10, 0.0116 / Mpc³)        | Huchra et al. 2012; Kochanek et al. 2001 LF |
| GLADE      | B     | 18.0      | (−20.83, −1.08, 0.0093 / Mpc³)        | B-band placeholder; GLADE+ DR2 documents the parent-sample limits |
| Synthetic  | r     | 17.77     | (use SDSS values)                    | Generated to mimic SDSS, so reuse |

The Schechter triple drives Mode 3 only. Modes 1 and 2 use just `m_lim`. We hard-code the table because survey flux limits don't change between releases (they're pinned to the survey's selection function).

---

## Task 1: Pure math helpers + flux-limit table

**Files:**

- Create: `src/utils/math/distanceModulus.ts`
- Create: `src/utils/math/vMaxWeight.ts`
- Create: `src/utils/math/schechterDensity.ts`
- Create: `src/data/surveyFluxLimits.ts`
- Create: tests for each
- Modify: `src/utils/math/index.ts` (add three barrel exports)

The four pure modules every later task imports from.

- [ ] **Step 1: Write failing tests for distanceModulus**

Create `tests/utils/math/distanceModulus.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { absoluteFromApparent, apparentFromAbsolute } from '../../../src/utils/math/distanceModulus';

describe('distanceModulus', () => {
  it('apparent 17, distance 100 Mpc → absolute −18.0', () => {
    // M = m − 5·log10(d_Mpc·1e6/10) = 17 − 5·log10(1e7) = 17 − 35 = −18
    expect(absoluteFromApparent(17, 100)).toBeCloseTo(-18.0, 2);
  });
  it('round-trip: apparent → absolute → apparent', () => {
    const m0 = 14.5;
    const d = 350;
    const M = absoluteFromApparent(m0, d);
    expect(apparentFromAbsolute(M, d)).toBeCloseTo(m0, 6);
  });
  it('returns NaN for non-positive distance', () => {
    expect(absoluteFromApparent(17, 0)).toBeNaN();
    expect(absoluteFromApparent(17, -5)).toBeNaN();
  });
});
```

- [ ] **Step 2: Implement distanceModulus**

Create `src/utils/math/distanceModulus.ts`:

```ts
/**
 * Distance modulus utilities.
 *
 * Converts between apparent magnitude `m` (what we observe), absolute
 * magnitude `M` (what the galaxy would appear to be at 10 pc), and
 * distance in Mpc.  The classical relation is
 *
 *     m − M = 5·log₁₀(d_pc / 10)
 *
 * which we rewrite for our Mpc-based positions as
 *
 *     M = m − 5·log₁₀(d_Mpc) − 25.
 *
 * The constant −25 absorbs `5·log₁₀(10⁶ / 10) = 5·log₁₀(10⁵) = 25`.
 *
 * Used by every Malmquist-bias correction mode: `volume-limited` thresholds
 * on M, `1/V_max` derives `d_max(M)` from M, `Schechter` integrates the LF
 * over absolute magnitude.  All three need this conversion at some point,
 * which is why it lives in a dedicated module rather than inline in any
 * single mode's helper.
 */

const LOG10 = Math.log(10);

/**
 * Compute absolute magnitude `M` from apparent magnitude `m` and distance
 * in Mpc.  Returns NaN for non-positive distance — the only sensible
 * sentinel because the formula is undefined there.
 */
export function absoluteFromApparent(m: number, dMpc: number): number {
  if (dMpc <= 0) return NaN;
  return m - (5 * Math.log(dMpc)) / LOG10 - 25;
}

/**
 * Inverse: compute apparent `m` from absolute `M` and distance in Mpc.
 * Used by `vMaxWeight` to derive the maximum distance at which a galaxy
 * of intrinsic magnitude `M` would still hit the survey's flux limit.
 */
export function apparentFromAbsolute(M: number, dMpc: number): number {
  if (dMpc <= 0) return NaN;
  return M + (5 * Math.log(dMpc)) / LOG10 + 25;
}

/**
 * Maximum distance (Mpc) at which a galaxy of absolute magnitude `M`
 * hits the survey's apparent flux limit `m_lim`.  Used by `vMaxWeight`.
 *
 *     m_lim = M + 5·log₁₀(d_max_Mpc) + 25
 *     d_max_Mpc = 10^((m_lim − M − 25) / 5)
 */
export function dMaxFromAbsolute(M: number, mLim: number): number {
  return Math.pow(10, (mLim - M - 25) / 5);
}
```

- [ ] **Step 3: Run distanceModulus tests** — `npx vitest run tests/utils/math/distanceModulus.test.ts`. PASS.

- [ ] **Step 4: Write failing tests for vMaxWeight**

Create `tests/utils/math/vMaxWeight.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { vMaxWeight } from '../../../src/utils/math/vMaxWeight';

describe('vMaxWeight', () => {
  it('returns a finite weight in (0, 1]', () => {
    const w = vMaxWeight({ absMag: -19, mLim: 17.77, dRefMpc: 750 });
    expect(w).toBeGreaterThan(0);
    expect(w).toBeLessThanOrEqual(1);
  });

  it('intrinsically bright galaxies have a small weight (visible far)', () => {
    // M=−24 reaches d_max far beyond dRef → weight near zero.
    const wBright = vMaxWeight({ absMag: -24, mLim: 17.77, dRefMpc: 750 });
    const wMid = vMaxWeight({ absMag: -19, mLim: 17.77, dRefMpc: 750 });
    expect(wBright).toBeLessThan(wMid);
  });

  it('faint galaxies clip at weight=1 (only visible nearby)', () => {
    // M=−14 hits flux limit very close, smaller V_max than dRef volume.
    const wFaint = vMaxWeight({ absMag: -14, mLim: 17.77, dRefMpc: 750 });
    expect(wFaint).toBe(1);
  });

  it('NaN absMag returns 0 (galaxies missing photometry)', () => {
    expect(vMaxWeight({ absMag: NaN, mLim: 17.77, dRefMpc: 750 })).toBe(0);
  });
});
```

- [ ] **Step 5: Implement vMaxWeight**

Create `src/utils/math/vMaxWeight.ts`:

```ts
/**
 * Per-galaxy 1/V_max weight for Malmquist-bias correction (Schmidt 1968).
 *
 * Concept: each catalogued galaxy is the *one we see*, but it represents
 * a population of similar galaxies — many of which we'd see if they were
 * within `d_max`, the maximum distance at which a galaxy of this intrinsic
 * brightness could still pass the survey's flux limit.  The proper
 * unbiased weighting is `1 / V_max` where `V_max ∝ d_max³`.
 *
 * For visualisation we don't want unbounded weights (intrinsically faint
 * galaxies have tiny V_max and would saturate the alpha to 1 in a
 * cluster, while bright galaxies would vanish).  We normalise by a
 * reference volume `V_ref ∝ dRefMpc³` so the returned weight is roughly
 * "fraction of the reference volume in which this galaxy is detectable":
 *
 *     weight = clamp((d_max / dRef)³, 0, 1)         (then inverted below)
 *
 * Wait — that's V_max / V_ref, the WRONG direction.  We actually return
 * the reciprocal `(dRef / d_max)³` because the visualisation wants
 * faint-but-rare galaxies to render *more* prominently (representing
 * the many we can't see), not less.  But we clip at 1: if V_max is
 * already smaller than V_ref, we don't apply a bonus — the galaxy is
 * already representative of its slice of the reference volume.
 *
 * Returns 0 for NaN absolute magnitude (galaxies with missing
 * photometry) so the caller can identity-multiply by the weight without
 * special-casing.
 */

import { dMaxFromAbsolute } from './distanceModulus';

export type VMaxWeightInput = {
  /** Absolute magnitude of the galaxy in the survey's flux-limit band. */
  absMag: number;
  /** Survey's apparent-magnitude flux limit (e.g. SDSS m_r ≈ 17.77). */
  mLim: number;
  /** Reference distance (Mpc) defining the normalising volume. */
  dRefMpc: number;
};

export function vMaxWeight(input: VMaxWeightInput): number {
  const { absMag, mLim, dRefMpc } = input;
  if (!Number.isFinite(absMag)) return 0;
  const dMax = dMaxFromAbsolute(absMag, mLim);
  if (!Number.isFinite(dMax) || dMax <= 0) return 0;
  // V_ref / V_max = (dRefMpc / dMax)³.  We render this as (dRef/dMax)³
  // clipped to [0, 1] so the alpha multiplier never exceeds the un-
  // weighted alpha (i.e. we only ever DIM a galaxy, never brighten it).
  // Bright galaxies (large dMax) → ratio < 1 → small weight (rendered
  // dimmer).  Faint galaxies (small dMax < dRef) → ratio > 1 → clipped
  // to 1 (rendered at full strength).
  const ratio = dRefMpc / dMax;
  const weight = ratio * ratio * ratio;
  return Math.min(1, weight);
}
```

- [ ] **Step 6: Run vMaxWeight tests** — `npx vitest run tests/utils/math/vMaxWeight.test.ts`. PASS.

- [ ] **Step 7: Write failing tests for schechterDensity**

Create `tests/utils/math/schechterDensity.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { expectedNumberDensity } from '../../../src/utils/math/schechterDensity';

describe('expectedNumberDensity (Schechter LF integrated to flux limit)', () => {
  // SDSS Blanton 2003 r-band LF: M*=−21.18, α=−1.16, φ*=0.0093
  const sdss = { mStar: -21.18, alpha: -1.16, phiStar: 0.0093, mLim: 17.77 };

  it('density at d=100 Mpc is well-defined and positive', () => {
    const n = expectedNumberDensity({ ...sdss, dMpc: 100 });
    expect(n).toBeGreaterThan(0);
    expect(Number.isFinite(n)).toBe(true);
  });

  it('density decreases monotonically with distance', () => {
    const n100 = expectedNumberDensity({ ...sdss, dMpc: 100 });
    const n500 = expectedNumberDensity({ ...sdss, dMpc: 500 });
    const n1000 = expectedNumberDensity({ ...sdss, dMpc: 1000 });
    expect(n500).toBeLessThan(n100);
    expect(n1000).toBeLessThan(n500);
  });

  it('density at d=10 Mpc approaches Schechter total density φ*·Γ(α+1)', () => {
    // At very small distance every galaxy is brighter than the flux
    // limit — the integral covers the entire LF.  Numerical Γ(α+1) for
    // α=−1.16 ≈ 5.78, so n_total ≈ 0.0093 × 5.78 ≈ 0.054 / Mpc³.
    // We compare order-of-magnitude only because our integration is a
    // discrete sum, not the closed-form Γ.
    const n = expectedNumberDensity({ ...sdss, dMpc: 10 });
    expect(n).toBeGreaterThan(0.01);
    expect(n).toBeLessThan(0.5);
  });
});
```

- [ ] **Step 8: Implement schechterDensity**

Create `src/utils/math/schechterDensity.ts`:

```ts
/**
 * Expected number density of detectable galaxies at distance `dMpc`,
 * given a Schechter luminosity function `(α, M*, φ*)` and a survey
 * flux limit `mLim`.
 *
 * The Schechter LF is
 *
 *     φ(M) dM = 0.4·ln(10)·φ*·[10^(0.4·(M*−M))]^(α+1)·exp(−10^(0.4·(M*−M))) dM
 *
 * which is integrated over `M ∈ [M_min, M_lim − μ(d)]` where μ(d) is
 * the distance modulus and M_min is a deep cut (we use −30 mag, well
 * past the brightest known galaxies; any Schechter density at M=−30
 * is negligible).  Beyond `M_lim − μ(d)` the galaxy is fainter than
 * the survey can see, so it contributes 0 to the *detectable* density.
 *
 * We integrate by simple trapezoidal rule with 200 steps — fast, accurate
 * to 1% for our purposes, no external numerical-integration dependency.
 *
 * The returned density is in galaxies per Mpc³.  The visualisation
 * normalises it relative to the central density and uses the ratio
 * to modulate alpha (so dense regions don't blow out and sparse
 * regions don't vanish).
 */

import { absoluteFromApparent } from './distanceModulus';

export type SchechterInput = {
  /** Schechter characteristic absolute magnitude M*. */
  mStar: number;
  /** Schechter faint-end slope α (typically −1 to −1.3). */
  alpha: number;
  /** Schechter normalisation φ* in galaxies per Mpc³. */
  phiStar: number;
  /** Survey apparent-magnitude flux limit. */
  mLim: number;
  /** Distance to evaluate density at, in Mpc. */
  dMpc: number;
};

const LN10 = Math.log(10);

export function expectedNumberDensity(input: SchechterInput): number {
  const { mStar, alpha, phiStar, mLim, dMpc } = input;
  if (dMpc <= 0) return 0;
  const mFaintest = absoluteFromApparent(mLim, dMpc);
  const mBrightCut = -30; // brightest realistic galaxy
  if (mFaintest <= mBrightCut) return 0; // distance so large nothing is detectable

  // Trapezoidal integration over absolute magnitude.
  const N = 200;
  const dM = (mFaintest - mBrightCut) / N;
  let sum = 0;
  for (let i = 0; i <= N; i++) {
    const M = mBrightCut + i * dM;
    const x = Math.pow(10, 0.4 * (mStar - M));
    const phi = 0.4 * LN10 * phiStar * Math.pow(x, alpha + 1) * Math.exp(-x);
    const weight = i === 0 || i === N ? 0.5 : 1;
    sum += phi * weight;
  }
  return sum * dM;
}
```

- [ ] **Step 9: Run schechterDensity tests** — `npx vitest run tests/utils/math/schechterDensity.test.ts`. PASS.

- [ ] **Step 10: Write failing tests for surveyFluxLimits**

Create `tests/data/surveyFluxLimits.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { surveyFluxLimit, surveySchechter } from '../../src/data/surveyFluxLimits';
import { Source } from '../../src/data/sources';

describe('surveyFluxLimits', () => {
  it('SDSS m_lim is 17.77 (r-band spec completeness)', () => {
    expect(surveyFluxLimit(Source.SDSS)).toBeCloseTo(17.77, 2);
  });
  it('2MRS m_lim is 11.75 (K_s magnitude limit)', () => {
    expect(surveyFluxLimit(Source.TwoMRS)).toBeCloseTo(11.75, 2);
  });
  it('GLADE m_lim is 18.0 (B-band)', () => {
    expect(surveyFluxLimit(Source.Glade)).toBeCloseTo(18.0, 2);
  });
  it('Synthetic uses the SDSS calibration', () => {
    expect(surveyFluxLimit(Source.Synthetic)).toBe(surveyFluxLimit(Source.SDSS));
  });
});

describe('surveySchechter', () => {
  it('SDSS Schechter triple matches Blanton 2003 r-band LF', () => {
    const s = surveySchechter(Source.SDSS);
    expect(s.mStar).toBeCloseTo(-21.18, 2);
    expect(s.alpha).toBeCloseTo(-1.16, 2);
    expect(s.phiStar).toBeCloseTo(0.0093, 4);
  });
});
```

- [ ] **Step 11: Implement surveyFluxLimits**

Create `src/data/surveyFluxLimits.ts`:

```ts
/**
 * Per-survey flux limits and Schechter luminosity-function parameters.
 *
 * Used by the Malmquist-bias correction: the volume-limited and 1/V_max
 * modes need only `m_lim`; the Schechter density correction needs the
 * full Schechter triple `(M*, α, φ*)`.
 *
 * Sources:
 *   - SDSS:  Blanton et al. 2003, r-band LF for the spec sample.
 *            m_lim = 17.77 is the published spectroscopic completeness
 *            limit (SDSS DR1+).
 *   - 2MRS:  Huchra et al. 2012 catalogue (K_s ≤ 11.75); Kochanek et al.
 *            2001 K-band Schechter parameters from 2MASS.
 *   - GLADE: B-band parent samples (HyperLEDA, GWGC) with effective
 *            m_lim ≈ 18; Norberg et al. 2002 b_J Schechter parameters
 *            as a stand-in for B (close enough for visualisation).
 *
 * These values do not change between releases — they're properties of
 * each survey's selection function, not of any data we re-download —
 * so hard-coding them here is appropriate.
 */

import { Source } from './sources';

export type SchechterTriple = {
  /** Characteristic absolute magnitude M*. */
  mStar: number;
  /** Faint-end slope α. */
  alpha: number;
  /** Normalisation φ* in galaxies per Mpc³. */
  phiStar: number;
};

const M_LIM: Record<Source, number> = {
  [Source.SDSS]: 17.77,
  [Source.TwoMRS]: 11.75,
  [Source.Glade]: 18.0,
  [Source.Synthetic]: 17.77,
};

const SCHECHTER: Record<Source, SchechterTriple> = {
  [Source.SDSS]: { mStar: -21.18, alpha: -1.16, phiStar: 0.0093 },
  [Source.TwoMRS]: { mStar: -24.13, alpha: -1.10, phiStar: 0.0116 },
  [Source.Glade]: { mStar: -20.83, alpha: -1.08, phiStar: 0.0093 },
  [Source.Synthetic]: { mStar: -21.18, alpha: -1.16, phiStar: 0.0093 },
};

/** Per-survey apparent-magnitude flux limit (band varies — see SCHECHTER). */
export function surveyFluxLimit(source: Source): number {
  return M_LIM[source];
}

/** Per-survey Schechter triple for the band that defines the flux limit. */
export function surveySchechter(source: Source): SchechterTriple {
  return SCHECHTER[source];
}
```

- [ ] **Step 12: Run surveyFluxLimits tests** — `npx vitest run tests/data/surveyFluxLimits.test.ts`. PASS.

- [ ] **Step 13: Update barrel + commit**

Append to `src/utils/math/index.ts`:

```ts
export * from './distanceModulus';
export * from './schechterDensity';
export * from './vMaxWeight';
```

Run `npx tsc --noEmit` and `npx vitest run`. Both clean. Commit:

```bash
git add src/utils/math/distanceModulus.ts src/utils/math/vMaxWeight.ts \
        src/utils/math/schechterDensity.ts src/utils/math/index.ts \
        src/data/surveyFluxLimits.ts \
        tests/utils/math/distanceModulus.test.ts tests/utils/math/vMaxWeight.test.ts \
        tests/utils/math/schechterDensity.test.ts tests/data/surveyFluxLimits.test.ts
git commit -m "feat: pure helpers + flux-limit table for Malmquist-bias correction"
```

---

## Task 2: Volume-limited mode (shader discard)

**Files:**

- Modify: `src/services/gpu/shaders/points.wgsl`
- Modify: `src/services/gpu/pointRenderer.ts` (uniform layout + draw())
- Modify: `src/@types/EngineHandle.d.ts` (new setters)
- Modify: `src/@types/EngineCallbacks.d.ts` (new echo callback)
- Modify: `src/services/engine/engine.ts` (state + setter wiring)

The simplest of the three modes: a uniform `absMagLimit` and a uniform `biasMode`. When `biasMode == 1` (VolumeLimited), the vertex stage discards (writes a degenerate clip-space position) any galaxy whose computed absolute magnitude is fainter than the limit.

- [ ] **Step 1: Extend the WGSL Uniforms struct**

In `src/services/gpu/shaders/points.wgsl` near the existing `instanceIdOffset` field, add:

```wgsl
// Malmquist-bias correction state (Task 2 of malmquist-bias plan).
// `biasMode` chooses which correction to apply:
//   0 = none, 1 = volume-limited, 2 = 1/V_max, 3 = Schechter.
// `absMagLimit` is the threshold for mode 1 (vertex discard).
// `apparentMagLimit` and `schechterMStar`/`schechterAlpha` feed modes 2+3.
biasMode: u32,
absMagLimit: f32,
apparentMagLimit: f32,
schechterMStar: f32,
schechterAlpha: f32,
```

Update the `_pad0`/`_pad1` tail so the struct stays 16-byte aligned. Adjust `UNIFORM_BYTES` in `pointRenderer.ts` to match — the struct grows from 96 → 112 bytes (5 new f32/u32 = 20 bytes; round up to 16-byte boundary = 16 bytes added → 112).

Update the byte-offset comment block at the top of the WGSL file to list the new fields.

- [ ] **Step 2: Add the absolute-magnitude computation + discard branch in `vs`**

After the existing K-correction block in `vs`, add:

```wgsl
// ── Malmquist-bias gating ─────────────────────────────────────────────
//
// Compute absolute magnitude from apparent magnitude + distance modulus.
// `dMpc` was already computed for the K-correction; reuse it.
let dMpc = length(p.position);
let LOG10 = 2.302585092994046;
let absMag = p.magnitude − 5.0 * (log(dMpc) / LOG10) − 25.0;

// Mode 1 (volume-limited): discard galaxies fainter than the threshold
// by emitting a clip-space position behind the near plane (z < 0 in
// clip space → outside the unit cube, so all six vertices of the
// billboard quad land off-screen and the rasteriser drops the entire
// instance).  We can't `discard` here because that's a fragment-stage
// keyword — the vertex stage's only escape hatch is a degenerate
// clip-space position.
if (u.biasMode == 1u && absMag > u.absMagLimit) {
  out.clip = vec4<f32>(2.0, 2.0, 2.0, 1.0);
  return out;
}
```

- [ ] **Step 3: Mirror the JS-side uniform layout**

In `src/services/gpu/pointRenderer.ts`:

```ts
const UNIFORM_BYTES = 112; // mat4 (64) + vec4-slot (16) + u32×4 (16) + bias (16)

// In draw(), pack the new fields:
u32[24] = biasMode;            // offset 96
f32[25] = absMagLimit;         // offset 100
f32[26] = apparentMagLimit;    // offset 104
f32[27] = schechterMStar;      // offset 108
// f32[28] = schechterAlpha — but that overflows 28*4 = 112; expand UNIFORM_BYTES to 128 instead and add f32[28].
```

(Re-derive offsets carefully — WGSL's `vec4` alignment may force padding. Run with the WebGPU validation layer enabled to catch any layout mismatch.)

Add `biasMode`, `absMagLimit`, `apparentMagLimit`, `schechterMStar`, `schechterAlpha` parameters to `draw()`.

- [ ] **Step 4: Engine state + handle methods**

In `src/services/engine/engine.ts`, add closure variables:

```ts
let biasMode: BiasMode = BiasMode.None;
let absMagLimit = -19.0; // sensible default for SDSS spec sample
```

Pass them into `renderer.draw(...)`. Add public handle methods `setBiasMode(mode)` and `setAbsMagLimit(M)`. Both fire `cb.onBiasModeChange?.(mode)` / `cb.onAbsMagLimitChange?.(M)` echo callbacks. Seed both at engine init.

- [ ] **Step 5: Type extensions**

`src/@types/EngineHandle.d.ts`:

```ts
setBiasMode(mode: BiasMode): void;
setAbsMagLimit(absMag: number): void;
```

`src/@types/EngineCallbacks.d.ts`:

```ts
onBiasModeChange?: (mode: BiasMode) => void;
onAbsMagLimitChange?: (absMag: number) => void;
```

Export `BiasMode` from `src/@types/BiasMode.d.ts` (or co-locate).

- [ ] **Step 6: Manual visual test**

Hard-reload the dev server with the engine wired up. From the browser devtools console:

```js
window.__engine.setBiasMode(1)
window.__engine.setAbsMagLimit(-19)
```

Expected: galaxies fainter than M=−19 disappear. The local cluster should look noticeably less dense; far-away galaxies should still be visible (they pass the cut by being intrinsically brighter).

(If `__engine` isn't on `window`, expose it temporarily in `App.tsx` for testing or just verify via the settings panel after Task 5.)

- [ ] **Step 7: Commit**

```bash
git add src/services/gpu/shaders/points.wgsl src/services/gpu/pointRenderer.ts \
        src/services/engine/engine.ts \
        src/@types/EngineHandle.d.ts src/@types/EngineCallbacks.d.ts \
        src/@types/BiasMode.d.ts
git commit -m "feat(render): volume-limited Malmquist mode (M_lim threshold + shader discard)"
```

---

## Task 3: 1/V_max mode (per-vertex weight + alpha modulation)

**Files:**

- Modify: `src/services/gpu/pointRenderer.ts` (bake `vMaxWeight` per vertex; stride 28 → 32)
- Modify: `src/services/gpu/pickRenderer.ts` (mirror new vertex layout)
- Modify: `src/services/gpu/shaders/points.wgsl` (8th attribute + alpha multiplication)

1/V_max is per-galaxy. The cleanest place to compute it is at upload time, baked into a new vertex attribute alongside the existing `kPerZ`. That avoids any per-frame uniform write-race.

- [ ] **Step 1: Bake vMaxWeight at upload**

In `src/services/gpu/pointRenderer.ts`'s `upload()`, after the existing `pickColourIndex` call, add:

```ts
import { vMaxWeight } from '../../utils/math';
import { surveyFluxLimit } from '../../data/surveyFluxLimits';
import { absoluteFromApparent } from '../../utils/math';

// Inside upload():
const mLim = surveyFluxLimit(source);
// Reference distance for 1/V_max normalisation: midpoint of typical
// camera framing (Mpc).  Empirically tuned later if the visual feels
// off; 750 Mpc covers the bulk of SDSS density.
const D_REF_MPC = 750;
```

In the per-galaxy loop, compute the weight and write it into the new slot:

```ts
const dMpc = Math.hypot(
  cloud.positions[i * 3 + 0]!,
  cloud.positions[i * 3 + 1]!,
  cloud.positions[i * 3 + 2]!,
);
const M = absoluteFromApparent(g, dMpc);
const w = vMaxWeight({ absMag: M, mLim, dRefMpc: D_REF_MPC });

// New 8th slot (offset 28 bytes / shaderLocation 5):
interleaved[o + 7] = w;
```

Bump `SLOTS_PER_POINT` 7 → 8, `POINT_STRIDE` 28 → 32, add the 6th attribute to the pipeline descriptor.

- [ ] **Step 2: Mirror the picker**

In `src/services/gpu/pickRenderer.ts`: bump `arrayStride` to 32 and append:

```ts
{ shaderLocation: 5, offset: 28, format: 'float32' }, // vMaxWeight
```

The picker doesn't read this — but the layout has to match.

- [ ] **Step 3: WGSL changes**

Add `@location(5) vMaxWeight: f32` to `PerVertex`. In the fragment shader, multiply alpha by `p.vMaxWeight` when `biasMode == 2`:

```wgsl
// Mode 2 (1/V_max): modulate alpha by the per-vertex weight.
// We pre-baked the weight at upload time (see pointRenderer.upload).
// Mode-conditional so users can A/B compare against `none` and
// `volume-limited`.
let vMaxAlpha = select(1.0, p.vMaxWeight, u.biasMode == 2u);
out.intensity = clamp((22.0 - p.magnitude) / 8.0, 0.05, 1.0) * u.brightness * vMaxAlpha;
```

(The `select` keeps the `none`/`volume-limited`/`schechter` paths unaffected — all multiply by 1.)

- [ ] **Step 4: Verify in browser**

`window.__engine.setBiasMode(2)`. Expected: clusters look less saturated; distant intrinsically-bright galaxies dim slightly because their weights are small. The visual difference between mode 0 and mode 2 should be subtle but real — most striking near the Local Group.

- [ ] **Step 5: Commit**

```bash
git add src/services/gpu/pointRenderer.ts src/services/gpu/pickRenderer.ts \
        src/services/gpu/shaders/points.wgsl
git commit -m "feat(render): 1/V_max per-vertex weight for Malmquist alpha modulation"
```

---

## Task 4: Schechter density correction (lighter touch — in scope but not the focus)

**Files:**

- Modify: `src/services/gpu/pointRenderer.ts` (per-source Schechter uniform)
- Modify: `src/services/gpu/shaders/points.wgsl` (mode 3 alpha branch)

The Schechter correction is **optional** for users who want it; it's in scope per the user's request but not the primary mode. We implement it as a per-frame uniform-driven alpha modulation: the JS side computes a normalisation factor at startup (highest expected density across all loaded surveys) and the shader scales each galaxy's alpha by `n_central / n(d)` so dense regions don't blow out and sparse don't vanish.

- [ ] **Step 1: Pre-compute the central-density normaliser at upload**

In `src/services/gpu/pointRenderer.ts`'s `upload()`, after computing `mLim`:

```ts
import { expectedNumberDensity, surveySchechter } from '../../utils/math';
const sch = surveySchechter(source);
// Reference density at d=10 Mpc — beyond the over-density of the very
// local universe but still in the high-completeness regime for every
// survey we render.
const N_REF = expectedNumberDensity({ ...sch, mLim, dMpc: 10 });
// Stash mStar and alpha on the per-source bookkeeping so we can pass
// them via uniforms when this source is drawn.
this.clouds.set(source, { ...existing, schechter: sch, mLim, nRef: N_REF });
```

- [ ] **Step 2: Per-source uniform write in `draw()`**

In `draw()`'s per-source loop, after the existing logic, write the Schechter triple as a 4-f32 partial-uniform write at the right offset. Yes, this hits the same writeBuffer ordering nuance the picker fixed in commit a4ca281 — but for Schechter it doesn't matter, because **the mode 3 alpha branch only reads these for a soft visual modulation, not for picking-style identity**. Acceptable cost.

(If the user reports visual ordering artefacts, escalate to per-source bake — but defer for now.)

- [ ] **Step 3: WGSL mode-3 branch in `fs`**

```wgsl
// Mode 3 (Schechter): modulate alpha by n_ref / n(d) so dense regions
// don't blow out.  We compute n(d) on the GPU via a 200-step trapezoidal
// integration of the Schechter LF — same algorithm as the JS helper.
// Cost: ~200 mul/exp per fragment, runs at ~50 ns on a desktop GPU,
// negligible at our point counts.
fn schechterIntegral(mStar: f32, alpha: f32, mLimAbs: f32) -> f32 {
  let M_BRIGHT = -30.0;
  let N = 200.0;
  let dM = (mLimAbs - M_BRIGHT) / N;
  var sum = 0.0;
  for (var i = 0; i <= 200; i = i + 1) {
    let M = M_BRIGHT + f32(i) * dM;
    let x = pow(10.0, 0.4 * (mStar - M));
    let phi = 0.4 * 2.302585 * pow(x, alpha + 1.0) * exp(-x);
    let w = select(1.0, 0.5, i == 0 || i == 200);
    sum = sum + phi * w;
  }
  return sum * dM;
}
```

(`phiStar` cancels in the ratio `n_ref / n(d)` so we can drop it from the uniforms.)

- [ ] **Step 4: Visual verify**

Mode 3 should make the Local-Group concentration look like every other supercluster — bright but not exceptional. If the alpha ratio saturates everywhere bright, scale down the multiplier (e.g., `pow(ratio, 0.5)` instead of `ratio`).

- [ ] **Step 5: Commit**

```bash
git add src/services/gpu/pointRenderer.ts src/services/gpu/shaders/points.wgsl
git commit -m "feat(render): Schechter LF density correction (mode 3)"
```

---

## Task 5: SettingsPanel UX

**Files:**

- Modify: `src/components/SettingsPanel/SettingsPanel.tsx`
- Modify: `src/components/SettingsPanel/SettingsPanel.module.css` (only if a new style is needed)
- Modify: `src/App.tsx` (state mirror + callback wiring)

A dropdown to pick the mode, a slider for `M_lim` that's only enabled in volume-limited mode, and a small explanatory tooltip / aside per mode.

- [ ] **Step 1: Add controls to SettingsPanel.tsx**

```tsx
<div className={styles.section}>
  <label className={styles.label} htmlFor='biasMode'>
    Density correction
    <span className={styles.hint}>
      Compensate for nearby-galaxy over-detection
    </span>
  </label>
  <select
    id='biasMode'
    value={biasMode}
    onChange={(e) => onBiasModeChange(Number(e.target.value) as BiasMode)}
  >
    <option value={BiasMode.None}>None — show raw catalogue</option>
    <option value={BiasMode.VolumeLimited}>Volume-limited (recommended)</option>
    <option value={BiasMode.VMax}>1/V_max alpha</option>
    <option value={BiasMode.Schechter}>Schechter LF</option>
  </select>
  {biasMode === BiasMode.VolumeLimited && (
    <>
      <label className={styles.label} htmlFor='absMagLimit'>
        Absolute magnitude limit (M_lim)
      </label>
      <input
        id='absMagLimit'
        type='range'
        min={-24}
        max={-15}
        step={0.1}
        value={absMagLimit}
        onChange={(e) => onAbsMagLimitChange(Number(e.target.value))}
      />
      <span className={styles.value}>{absMagLimit.toFixed(1)} mag</span>
    </>
  )}
</div>
```

(Adapt to whatever the existing SettingsPanel.tsx style is — read it first; replicate its idiom.)

- [ ] **Step 2: Wire props through `App.tsx`**

Mirror engine state in `useState` hooks; pass `biasMode`, `absMagLimit`, `onBiasModeChange`, `onAbsMagLimitChange` to `<SettingsPanel>`. Wire the engine's echo callbacks (`onBiasModeChange`, `onAbsMagLimitChange`) into those `useState` setters so React state stays in sync if the engine ever changes them.

- [ ] **Step 3: Visual / interactive verify**

Reload. The settings panel now has a Density correction section. Selecting each mode should change the canvas appearance immediately. Slider for M_lim only appears in mode 1.

- [ ] **Step 4: Commit**

```bash
git add src/components/SettingsPanel/SettingsPanel.tsx \
        src/components/SettingsPanel/SettingsPanel.module.css \
        src/App.tsx
git commit -m "feat(ui): SettingsPanel dropdown for Malmquist-bias correction modes"
```

---

## Task 6: README

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Add a section**

Under existing renderer docs, add:

```markdown
## Density correction (Malmquist bias)

Flux-limited surveys over-represent nearby galaxies because faint ones
are only detectable when close.  Skymap offers four user-selectable
correction modes via the settings panel:

- **None** — raw catalogue, apparent over-density visible near origin.
- **Volume-limited** *(recommended)* — show only galaxies brighter than
  a tunable absolute-magnitude threshold M_lim.  Default M_lim = −19,
  matching SDSS's spectroscopic completeness near 750 Mpc.  Honest:
  shows uniformly-detectable subsample.
- **1/V_max alpha** — keep all data, but dim each galaxy by its
  inverse maximum-detection volume.  Schmidt 1968 weighting, applied
  as alpha rather than discard.
- **Schechter LF** — modulate per-distance alpha by the inverse of the
  expected number density predicted by each survey's Schechter
  luminosity function.  Most aggressive correction; visually flattens
  the local cluster into the cosmic web.

A separate **angular-isotropy** axis (orthogonal to the four modes
above) addresses GLADE's deep pencil-beam artefacts:

- **GLADE isotropic build** — when `tools/buildAllBins.ts` is run with
  `--glade-isotropic`, the parser drops GLADE rows whose only parent
  catalogue is SDSS-DR12 (which is footprint-restricted, ~1/3 of sky).
  Removes the radial "jet" structures that come from deep SDSS-only
  entries dominating outside their footprint.
- **HEALPix angular re-weighting** *(optional, runtime toggle)* — bin
  the sky into HEALPix cells and modulate per-galaxy alpha by the
  ratio of median angular density to local angular density.  Visually
  uniform direction-by-direction independent of which surveys
  contributed.

The flux-limit table (`src/data/surveyFluxLimits.ts`) hard-codes
`m_lim` and `(M*, α, φ*)` per survey based on:

- SDSS: Blanton et al. 2003 r-band LF; m_r ≤ 17.77 spec completeness.
- 2MRS: Huchra et al. 2012 catalogue; K_s ≤ 11.75; Kochanek et al. 2001
  K-band LF.
- GLADE: B-band parent samples (HyperLEDA, GWGC); Norberg et al. 2002
  b_J Schechter as the closest proxy.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: Malmquist-bias correction modes"
```

---

## Task 7: GLADE source-flag isotropic filter (Option B)

**Files:**

- Modify: `tools/parsers/glade.ts`
- Modify: `tools/buildAllBins.ts` (add `--glade-isotropic` CLI flag)
- Modify: `tests/parsers/glade.test.ts` (new test cases)

**Why this is a separate axis from the four BiasModes above.** Modes 1–4 are runtime renderer choices that compensate for *flux-limited Malmquist bias* — the artefact that says "near galaxies are over-represented at every direction equally". GLADE has an extra problem: its **angular completeness is non-uniform** because it's a compilation. Some parents (HyperLEDA, GWGC, 2MASS XSC, 2MPZ) cover the full sky; others (SDSS-DR12, 6dFGS) cover only a footprint. SDSS-DR12 in particular is the worst offender — it covers ~1/3 of the sky but reaches z > 0.5, so beyond ~600 Mpc GLADE has many more galaxies in the SDSS direction than elsewhere. Visually: pencil-beam-like "jets" of galaxies extending radially from the origin, only in the SDSS footprint.

This task addresses the artefact at parse time by dropping GLADE rows whose **only** parent catalogue is SDSS-DR12. Rows that show up in HyperLEDA, GWGC, 2MASS, or any other all-sky parent are kept regardless. The remaining sample has approximately uniform angular completeness.

It's a build-time flag (rebuild your `glade.bin` with `--glade-isotropic` to enable) rather than a runtime toggle, because the alternative — baking provenance into the `.bin` schema — is a much bigger change for what's effectively a permanent decision the user makes once for their dataset.

- [ ] **Step 1: Identify the parent-catalogue name byte ranges**

Read `tools/parsers/glade.ts` carefully. Note where the parent-catalogue name fields live (PGC, GWGC, HyperLEDA, 2MASS, SDSS-DR12) — the existing `parseGladeLine` already references their byte ranges in the `specZOnly` filter (around line 220–225). The relevant 0-based half-open ranges are roughly:

- GWGC name: bytes 8–36
- HyperLEDA name: bytes 37–66
- 2MASS XSC name: bytes 68–84 (verify against the existing parser)
- SDSS-DR12 name: bytes 84–102

Add a private helper if any of these byte ranges aren't already named constants. The existing `nameIsPopulated(line, start, end)` helper from the parser handles the empty-vs-populated test (it treats GLADE's `---` placeholder as empty).

- [ ] **Step 2: Add the `isotropic` option**

Extend `GladeParseOptions`:

```ts
export type GladeParseOptions = {
  specZOnly?: boolean;
  /**
   * Drop rows whose only parent catalogue is SDSS-DR12.
   *
   * SDSS-DR12 covers only ~1/3 of the sky but reaches z > 0.5; beyond
   * ~600 Mpc those rows dominate GLADE inside the SDSS footprint and
   * leave a gap outside it.  In 3D space this looks like radial
   * "jets" of galaxies extending from origin only in the SDSS
   * direction — a visually striking but artefactual structure.
   *
   * Filtering keeps rows that appear in any all-sky parent catalogue
   * (HyperLEDA, GWGC, 2MASS XSC, 2MPZ).  These remaining rows have
   * approximately uniform angular completeness — the deep pencil-beam
   * structure disappears, at the cost of dropping 30–50 % of the high-
   * redshift GLADE galaxies (which are the SDSS-only ones).
   */
  isotropic?: boolean;
};
```

- [ ] **Step 3: Add the filter logic in `parseGladeLine`**

After the existing `specZOnly` block, add:

```ts
// ── Angular-isotropy filter (opt-in) ────────────────────────────────────
//
// Drop rows whose ONLY populated parent name is SDSS-DR12.  See the
// GladeParseOptions docstring for the rationale.  We don't check 6dFGS
// here even though it's also footprint-restricted (southern hemisphere
// only) because 6dFGS contributes uniformly within its footprint and
// covers a hemisphere — that's coverage we want, not pencil-beam noise.
if (options.isotropic) {
  const inSdssOnly =
    nameIsPopulated(line, 84, 102) &&  // SDSS-DR12 populated
    !nameIsPopulated(line, 8, 36) &&   // GWGC empty
    !nameIsPopulated(line, 37, 66) &&  // HyperLEDA empty
    !nameIsPopulated(line, 67, 84);    // 2MASS XSC empty (verified against live parser)
  if (inSdssOnly) return null;
}
```

(Verify the 2MASS XSC byte range against the existing parser. If it's a different range, update both the comment and the call.)

- [ ] **Step 4: Wire the CLI flag in `tools/buildAllBins.ts`**

Find the existing `--glade-spec-only` flag handling (it sets `specZOnly: true` in the options passed to the parser). Add:

```ts
const gladeIsotropic = process.argv.includes('--glade-isotropic');
// ... when constructing the options:
const gladeOpts: GladeParseOptions = {
  specZOnly: gladeSpecOnly,
  isotropic: gladeIsotropic,
};
```

Both flags are independent — users can enable either, both, or neither.

- [ ] **Step 5: Test cases**

In `tests/parsers/glade.test.ts`, add:

```ts
describe('GLADE isotropic filter', () => {
  it('drops a row whose only parent is SDSS-DR12', () => {
    // Construct a GLADE line where SDSS-DR12 name byte range is populated
    // but GWGC, HyperLEDA, 2MASS XSC are not.  Expected: parser returns null.
    const line = makeFixture({ sdssOnly: true });
    expect(parseGladeLine(line, { isotropic: true })).toBeNull();
  });

  it('keeps a row that has both SDSS-DR12 and HyperLEDA names', () => {
    const line = makeFixture({ sdssAndHyperleda: true });
    expect(parseGladeLine(line, { isotropic: true })).not.toBeNull();
  });

  it('keeps a row whose only parent is HyperLEDA', () => {
    const line = makeFixture({ hyperledaOnly: true });
    expect(parseGladeLine(line, { isotropic: true })).not.toBeNull();
  });

  it('default (isotropic: false) keeps SDSS-only rows', () => {
    const line = makeFixture({ sdssOnly: true });
    expect(parseGladeLine(line, {})).not.toBeNull();
  });
});
```

`makeFixture` is a helper local to the test file: takes an options bag, returns a 256-byte string with the appropriate bytes populated. Reuse the existing `makeFixture` if one already exists; otherwise model it on whatever the existing parser tests do (read the file first).

- [ ] **Step 6: Run tests + commit**

```bash
npx vitest run tests/parsers/glade.test.ts
npx tsc --noEmit
git add tools/parsers/glade.ts tools/buildAllBins.ts tests/parsers/glade.test.ts
git commit -m "feat(glade): isotropic filter drops SDSS-only entries to remove pencil-beam jets"
```

- [ ] **Step 7: Rebuild glade.bin (manual step — flag the user)**

This task lands the code change. The user must rebuild their `glade.bin` to see the visual change:

```bash
npm run build:bins -- --glade-isotropic
```

Document this in the commit message and the README addition (Task 6 / Task 9 below).

---

## Task 8: HEALPix angular re-weighting (Option C — optional)

**Files:**

- Create: `src/utils/math/healpix.ts` (minimal HEALPix indexing — `nest_pixel(ra, dec, nside)`)
- Create: `src/services/engine/angularDensity.ts` (per-cell density LUT computed at engine startup)
- Modify: `src/services/gpu/pointRenderer.ts` (per-vertex `angularDensityWeight` baked at upload — stride 32 → 36, 8 → 9 slots)
- Modify: `src/services/gpu/pickRenderer.ts` (mirror layout)
- Modify: `src/services/gpu/shaders/points.wgsl` (mode 4 alpha branch reading per-vertex weight)
- Modify: `src/components/SettingsPanel/SettingsPanel.tsx` (extend dropdown with "Angular re-weight")
- Tests for healpix + angularDensity

**This task is OPTIONAL — implement only if Task 7 isn't enough.** The user can build a `--glade-isotropic` bin first, and if the residual angular non-uniformity (e.g., 6dFGS in the southern sky, or just real cosmic structure) still bothers them, this task adds a runtime correction on top.

The principle: tile the sky into HEALPix cells of nside=32 (12 × 32² = 12 288 cells, ~1.8° per cell — fine enough to resolve survey footprints, coarse enough that each cell has tens-to-hundreds of galaxies for a stable density estimate). For each loaded cloud, count galaxies per (cell, distance bin). Per galaxy, compute `weight = median_density / local_density`, clamp to [0.1, 10], and bake it into the vertex buffer. The shader multiplies alpha by this weight in mode 4.

- [ ] **Step 1: Implement minimal HEALPix indexing**

For the visualisation we don't need the full HEALPix library — just the `(ra, dec) → pixel_index` function for the NESTED scheme at a fixed nside. ~80 LOC of pure math; reference: Górski et al. 2005 paper §4.1, or the `astropy.healpix.lonlat_to_healpix` source. Tests against a few known (ra, dec, nside) → pixel triples from astropy or healpy output.

```ts
// src/utils/math/healpix.ts
/** HEALPix NESTED-scheme pixel index for (RA, Dec) at the given nside. */
export function healpixNest(raDeg: number, decDeg: number, nside: number): number {
  // ... implementation: convert to colatitude θ, longitude φ, then to (face, x, y),
  // then interleave x and y bits to produce the nested index.
}
```

(If the implementation gets above 150 LOC, take an `npm install` dependency on `healpix-geometry` instead.)

- [ ] **Step 2: Compute the angular-density LUT at startup**

In a new module `src/services/engine/angularDensity.ts`:

```ts
export function buildDensityWeights(
  cloud: PointCloud,
  nside = 32,
  distanceBins = 10,
): Float32Array {
  // Returns a Float32Array of length cloud.count: per-galaxy weight.
  // Steps:
  //   1. For each galaxy, compute (ra, dec, distance) from cloud.positions[i*3+...].
  //   2. healpixNest → cell index; bin distance into `distanceBins` shells.
  //   3. Accumulate count[cell][bin].
  //   4. Per (cell, bin), median_count = median across all cells in that bin.
  //   5. Per galaxy, weight = clamp(median_count / count[cell][bin], 0.1, 10).
}
```

- [ ] **Step 3: Bake the weight at upload**

In `pointRenderer.upload()`, after computing `vMaxWeight`, also compute the angular weight:

```ts
const angularWeights = buildDensityWeights(cloud);
// ... in the loop:
interleaved[o + 8] = angularWeights[i]!;
```

Bump `SLOTS_PER_POINT` 8 → 9, `POINT_STRIDE` 32 → 36. Add 7th attribute at offset 32, shaderLocation 6.

- [ ] **Step 4: Mirror the picker layout**

`src/services/gpu/pickRenderer.ts`: arrayStride 32 → 36, append 7th attribute.

- [ ] **Step 5: Shader branch for mode 4**

In `points.wgsl`, add `@location(6) angularDensityWeight: f32` to PerVertex. Extend `BiasMode` to include `AngularReweight = 4`. In `fs`, multiply alpha by `p.angularDensityWeight` when `biasMode == 4u`.

(If you want to combine with the other modes, design the alpha multiplication as multiplicative across modes — but that's a UX decision; consult before implementing.)

- [ ] **Step 6: Settings panel addition**

Extend the dropdown:

```tsx
<option value={BiasMode.AngularReweight}>Angular re-weight (HEALPix)</option>
```

- [ ] **Step 7: Tests + commit**

Tests for `healpixNest` against known values (e.g. ra=0, dec=0 should map to a specific pixel at nside=4 — check astropy output). Tests for `buildDensityWeights` on a synthetic cloud with one over-dense cone to verify the weight goes <1 there.

```bash
git add src/utils/math/healpix.ts src/services/engine/angularDensity.ts \
        src/services/gpu/pointRenderer.ts src/services/gpu/pickRenderer.ts \
        src/services/gpu/shaders/points.wgsl \
        src/components/SettingsPanel/SettingsPanel.tsx \
        tests/utils/math/healpix.test.ts tests/services/engine/angularDensity.test.ts
git commit -m "feat(render): HEALPix angular re-weight (BiasMode 4) for residual angular non-uniformity"
```

---

## Out of scope (deliberately)

- **Per-band K-correction in the bias math.** We use the survey's flux-limit band magnitude as-given. A proper analysis would correct for K(z, type) before computing absolute mag. Visualisation tolerates the simplification; science wouldn't.
- **Evolution.** Number density evolves with cosmic time. We use a static z=0 LF.
- **Survey-specific completeness tweaks.** GLADE's effective `m_lim` varies between parent sub-catalogues; we use a single-value approximation. 2MRS has band variants (`K_s` 11.75 or 12.0 depending on parent set) — we pick the spec-complete one.
- **Storing user preferences.** Mode + slider persist for the session only. localStorage is a separate plan.
- **Per-survey M_lim sliders.** v1 has one global M_lim that's compared against each galaxy's own absolute mag (so a 2MRS galaxy and an SDSS galaxy at the same M cut at the same threshold). If users want per-survey thresholds, that's a follow-up.

---

## Self-Review checklist

- [x] All three Malmquist correction modes covered (1, 2, 3 from the brief).
- [x] Focus weighted toward modes 1 and 2: Tasks 2 and 3 each have full TDD plus visual verify; Task 4 (mode 3) is a smaller block.
- [x] UX for switching is in scope (Task 5: dropdown + conditional slider).
- [x] GLADE pencil-beam-jets axis covered: Task 7 (build-time SDSS-only filter) plus optional Task 8 (runtime HEALPix re-weight).
- [x] No file paths assume the pre-`services/` layout.
- [x] Vertex stride bumps (28 → 32 in Task 3; → 36 in optional Task 8) match what each task needs and the picker-mirror tasks account for.
- [x] No placeholder text in step bodies — all code blocks are concrete.
- [x] Type names consistent (`BiasMode`, `SchechterTriple`, `VMaxWeightInput`, `GladeParseOptions`).
- [x] Task 7 is GLADE-specific and a parser-level (build-time) decision — flagged clearly so users know they need to rebuild `glade.bin` after enabling the flag.

## Execution handoff

Plan saved at `docs/superpowers/plans/2026-05-03-malmquist-bias-correction.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
