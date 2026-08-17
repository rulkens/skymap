# Atmosphere Constituents — Stage 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `ScatteringParams`' hard-coded Rayleigh / Mie / ozone triple with a list of constituents, reproducing every existing body's image exactly.

**Architecture:** `AtmosphereParams` loses nine positional physics fields and gains one `constituents` array. Each constituent carries its own `scatter`/`absorb` vectors, a tagged density profile (exponential or tent) and a tagged phase function (Rayleigh or Henyey-Greenstein). The shader accumulates over the list instead of naming three terms. The uniform grows from 80 to 224 bytes.

**Tech Stack:** TypeScript, WESL/WGSL, WebGPU, Vitest.

**Spec:** [`docs/superpowers/specs/2026-08-18-atmosphere-constituents-design.md`](../specs/2026-08-18-atmosphere-constituents-design.md) — stage 1 only. Stages 2 (recalibrate six rows) and 3 (Titan) are **out of scope** and get their own plans.

## Global Constraints

- **Zero visual change.** Every one of the eight existing rows must produce the same image. This is provable, not eyeballed — see "The equivalence argument" below. Any step that would change a rendered pixel belongs to stage 2.
- **Bit-exactness at the source level.** Constituents are ordered Rayleigh, then Mie, then ozone, and the accumulator starts at zero and adds in list order. `0 + x` and `x + 0` are exact for finite `x`, so the new accumulation has the same operands, groupings and order as the old expression. Any residual difference would be the GPU compiler's own reassociation, which it is equally free to do today.
- **`MAX_CONSTITUENTS = 4`**, stride 48 bytes, struct total 224 bytes, array starts at byte 32.
- **Kind tags are `u32`**, not float sentinels compared against `< 0.5`.
- **Keep the zero-width tent guard.** `densityTent` retains `if (widthKm <= 0.0) { return 0.0; }`. Without it the tent divides by zero at every sample and WGSL's Finite Math Assumption makes the whole expression an indeterminate value — the spec names `max` as a builtin that misbehaves under exactly that optimisation. The outer `max(0.0, ...)` is not a guard.
- **WESL comments use single quotes, never backticks** — the parser tokenises a backtick even inside a comment. Literal `package::` imports.
- **Comment budget** (CLAUDE.md): module header ≤ 10 lines, comment lines ≤ half the code lines in the file. The existing `scattering.wesl` header is over that budget already; do not grow it — this task shrinks it.
- One symbol per file in `@types/` (`tests/conventions/oneSymbolPerFile.test.ts` enforces it).

## The equivalence argument

The old `sampleMedium` computes exactly three terms. The mapping onto constituents is mechanical and total:

| old      | new constituent                                                                                                      |
| -------- | -------------------------------------------------------------------------------------------------------------------- |
| Rayleigh | `scatter: rayleighScatter`, `absorb: [0,0,0]`, `exponential(rayleighScaleHeightKm)`, `rayleigh`                      |
| Mie      | `scatter: mieScatter`, `absorb: [mieAbsorption × 3]`, `exponential(mieScaleHeightKm)`, `henyeyGreenstein(miePhaseG)` |
| ozone    | `scatter: [0,0,0]`, `absorb: ozoneAbsorption`, `tent(ozoneCenterKm, ozoneWidthKm)`, `rayleigh`                       |

Two consequences worth stating because a reviewer will ask:

- **The ozone constituent's phase is never evaluated to anything that matters** — its `scatter` is `[0,0,0]`, so its phased contribution is the zero vector whatever the phase function returns. `rayleigh` is chosen as the tag because it is the cheaper of the two and needs no `g`.
- **Seven of the eight rows drop the ozone constituent entirely.** Their `ozoneWidthKm` is `0`, which the old guard turned into a density of `0` — a term that contributed nothing. Omitting it is the same arithmetic and is the decomplection win: "this body has no ozone" becomes an absence rather than a zero-width sentinel. Earth keeps three constituents; every other row has two.

## File Structure

**Created:**

- `src/@types/scene/DensityProfile.d.ts` — the tagged density-profile union.
- `src/@types/scene/PhaseFunction.d.ts` — the tagged phase-function union.
- `src/@types/scene/AtmosphereConstituent.d.ts` — one constituent.
- `tests/data/bodies/atmosphereConstituentMigration.test.ts` — the migration gate.

**Modified:**

- `src/@types/scene/AtmosphereParams.d.ts` — nine fields out, one in.
- `src/data/bodies/atmosphereParams.ts` — all eight rows re-expressed.
- `src/utils/gpu/packScatteringParams.ts` — the 224-byte layout.
- `src/services/gpu/renderers/atmosphere/atmosphereShellRenderer.ts:377,380` — buffer size + `ArrayBuffer` write.
- `src/services/gpu/shaders/atmosphere/scattering.wesl` — struct, `MediumSample`, density/phase dispatch, `sampleMedium`.
- `src/services/gpu/shaders/atmosphere/transmittanceLut.wesl:33,65` — the fourth consumer.
- `src/services/gpu/shaders/atmosphere/multiScatterLut.wesl:41,92,99`.
- `src/services/gpu/shaders/atmosphere/skyViewLut.wesl:48-50,127-128,142,148-149`.
- `tests/utils/gpu/packScatteringParams.test.ts` — rewritten for the new layout.

**Spec correction:** the spec says the shader call-site delta is three lines. It is **four call sites across three files** — `transmittanceLut.wesl:65` also calls `sampleMedium` (for `extinction` only) and was missed. It switches to `sampleMediumIsotropic`; no behaviour change.

---

### Task 1: Constituent types and the eight rows

Additive only. The nine old fields stay on the type and the rows keep them, so the packer and shader are untouched and the suite stays green. This isolates 80-odd transcribed numbers into a diff a reviewer can check against the migration test alone.

**Files:**

- Create: `src/@types/scene/DensityProfile.d.ts`, `src/@types/scene/PhaseFunction.d.ts`, `src/@types/scene/AtmosphereConstituent.d.ts`
- Modify: `src/@types/scene/AtmosphereParams.d.ts`, `src/data/bodies/atmosphereParams.ts`
- Test: `tests/data/bodies/atmosphereConstituentMigration.test.ts`

**Interfaces:**

- Produces: `DensityProfile`, `PhaseFunction`, `AtmosphereConstituent` types; `AtmosphereParams.constituents: readonly AtmosphereConstituent[]`.
- Consumes: nothing.

- [ ] **Step 1: Write the failing migration test**

Create `tests/data/bodies/atmosphereConstituentMigration.test.ts`:

```ts
/**
 * Stage-1 migration gate: the constituent lists must reproduce the pre-refactor
 * coefficients exactly, for every row.
 *
 * END OF LIFE: delete this file at the start of stage 2, when six rows are
 * deliberately recalibrated onto physical channels and `LEGACY_ROWS` stops
 * describing anything true. It exists to catch a transcription slip in ~80
 * hand-moved numbers — a wrong coefficient on Saturn renders subtly wrong and
 * silently, which no other test or compiler check catches.
 */

import { describe, it, expect } from 'vitest';
import { ATMOSPHERE_PARAMS } from '../../../src/data/bodies/atmosphereParams';

type LegacyRow = {
  rayleighScatter: [number, number, number];
  rayleighScaleHeightKm: number;
  mieScatter: [number, number, number];
  mieAbsorption: number;
  mieScaleHeightKm: number;
  miePhaseG: number;
  ozoneAbsorption: [number, number, number];
  ozoneCenterKm: number;
  ozoneWidthKm: number;
};

// Frozen snapshot of `atmosphereParams.ts` as of commit c25c84558 — the values
// the constituent lists must reproduce.
const LEGACY_ROWS: Record<string, LegacyRow> = {
  earth: {
    rayleighScatter: [5.8e-3, 13.6e-3, 33.1e-3],
    rayleighScaleHeightKm: 8,
    mieScatter: [3.9e-3, 3.9e-3, 3.9e-3],
    mieAbsorption: 4.4e-3,
    mieScaleHeightKm: 1.2,
    miePhaseG: 0.8,
    ozoneAbsorption: [0.65e-3, 1.881e-3, 0.085e-3],
    ozoneCenterKm: 25,
    ozoneWidthKm: 15,
  },
  venus: {
    rayleighScatter: [12e-3, 10e-3, 7e-3],
    rayleighScaleHeightKm: 15.9,
    mieScatter: [25e-3, 25e-3, 25e-3],
    mieAbsorption: 2e-3,
    mieScaleHeightKm: 5,
    miePhaseG: 0.7,
    ozoneAbsorption: [0, 0, 0],
    ozoneCenterKm: 0,
    ozoneWidthKm: 0,
  },
  mars: {
    rayleighScatter: [8e-3, 5e-3, 3e-3],
    rayleighScaleHeightKm: 11.1,
    mieScatter: [10e-3, 10e-3, 10e-3],
    mieAbsorption: 4e-3,
    mieScaleHeightKm: 8,
    miePhaseG: 0.6,
    ozoneAbsorption: [0, 0, 0],
    ozoneCenterKm: 0,
    ozoneWidthKm: 0,
  },
  jupiter: {
    rayleighScatter: [4e-3, 4e-3, 5e-3],
    rayleighScaleHeightKm: 27,
    mieScatter: [3e-3, 3e-3, 3e-3],
    mieAbsorption: 1e-3,
    mieScaleHeightKm: 12,
    miePhaseG: 0.6,
    ozoneAbsorption: [0, 0, 0],
    ozoneCenterKm: 0,
    ozoneWidthKm: 0,
  },
  saturn: {
    rayleighScatter: [4e-3, 4e-3, 4e-3],
    rayleighScaleHeightKm: 59.5,
    mieScatter: [3e-3, 3e-3, 3e-3],
    mieAbsorption: 1e-3,
    mieScaleHeightKm: 25,
    miePhaseG: 0.6,
    ozoneAbsorption: [0, 0, 0],
    ozoneCenterKm: 0,
    ozoneWidthKm: 0,
  },
  uranus: {
    rayleighScatter: [4e-3, 10e-3, 20e-3],
    rayleighScaleHeightKm: 27.7,
    mieScatter: [2e-3, 2e-3, 2e-3],
    mieAbsorption: 1e-3,
    mieScaleHeightKm: 12,
    miePhaseG: 0.6,
    ozoneAbsorption: [0, 0, 0],
    ozoneCenterKm: 0,
    ozoneWidthKm: 0,
  },
  neptune: {
    rayleighScatter: [4e-3, 9e-3, 22e-3],
    rayleighScaleHeightKm: 20,
    mieScatter: [2e-3, 2e-3, 2e-3],
    mieAbsorption: 1e-3,
    mieScaleHeightKm: 10,
    miePhaseG: 0.6,
    ozoneAbsorption: [0, 0, 0],
    ozoneCenterKm: 0,
    ozoneWidthKm: 0,
  },
  pluto: {
    rayleighScatter: [4.5e-7, 1.06e-6, 2.59e-6],
    rayleighScaleHeightKm: 50,
    mieScatter: [1.85e-4, 3.83e-4, 8.25e-4],
    mieAbsorption: 9.6e-6,
    mieScaleHeightKm: 50,
    miePhaseG: 0.5,
    ozoneAbsorption: [0, 0, 0],
    ozoneCenterKm: 0,
    ozoneWidthKm: 0,
  },
};

describe('atmosphere constituent migration', () => {
  it('covers every authored row', () => {
    expect(Object.keys(ATMOSPHERE_PARAMS).sort()).toEqual(Object.keys(LEGACY_ROWS).sort());
  });

  for (const [id, legacy] of Object.entries(LEGACY_ROWS)) {
    it(`${id} reproduces its pre-refactor coefficients`, () => {
      const cs = ATMOSPHERE_PARAMS[id].constituents;
      const hasOzone = legacy.ozoneWidthKm > 0;
      expect(cs.length).toBe(hasOzone ? 3 : 2);

      expect(cs[0]).toEqual({
        scatter: legacy.rayleighScatter,
        absorb: [0, 0, 0],
        profile: { kind: 'exponential', scaleHeightKm: legacy.rayleighScaleHeightKm },
        phase: { kind: 'rayleigh' },
      });

      expect(cs[1]).toEqual({
        scatter: legacy.mieScatter,
        absorb: [legacy.mieAbsorption, legacy.mieAbsorption, legacy.mieAbsorption],
        profile: { kind: 'exponential', scaleHeightKm: legacy.mieScaleHeightKm },
        phase: { kind: 'henyeyGreenstein', g: legacy.miePhaseG },
      });

      if (hasOzone) {
        expect(cs[2]).toEqual({
          scatter: [0, 0, 0],
          absorb: legacy.ozoneAbsorption,
          profile: {
            kind: 'tent',
            centerKm: legacy.ozoneCenterKm,
            widthKm: legacy.ozoneWidthKm,
          },
          phase: { kind: 'rayleigh' },
        });
      }
    });
  }
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run tests/data/bodies/atmosphereConstituentMigration.test.ts`
Expected: FAIL — `constituents` is undefined on every row.

- [ ] **Step 3: Create the three type files**

`src/@types/scene/DensityProfile.d.ts`:

```ts
/**
 * DensityProfile — how a constituent's density falls off with altitude.
 *
 * `exponential` is the well-mixed / scale-height case (molecules, most aerosol);
 * `tent` is a discrete layer at an altitude (Earth's ozone, a detached haze).
 * Density is normalised to 1 at the profile's reference level, so a constituent's
 * `scatter`/`absorb` are its coefficients THERE, not column integrals.
 */

export type DensityProfile =
  | { readonly kind: 'exponential'; readonly scaleHeightKm: number }
  | { readonly kind: 'tent'; readonly centerKm: number; readonly widthKm: number };
```

`src/@types/scene/PhaseFunction.d.ts`:

```ts
/**
 * PhaseFunction — the angular distribution a constituent scatters into.
 *
 * `rayleigh` is the parameter-free molecular form; `henyeyGreenstein` is the
 * single-lobe aerosol approximation whose `g` sets how forward-peaked it is
 * (Earth's haze ≈ 0.8). A purely absorbing constituent still carries a phase tag
 * — it is never evaluated to anything but zero, since its `scatter` is zero.
 */

export type PhaseFunction =
  | { readonly kind: 'rayleigh' }
  | { readonly kind: 'henyeyGreenstein'; readonly g: number };
```

`src/@types/scene/AtmosphereConstituent.d.ts`:

```ts
/**
 * AtmosphereConstituent — one scattering/absorbing species in a body's atmosphere.
 *
 * The roles are no longer positional: before this type, Rayleigh was scatter-only
 * by construction and ozone absorb-only by construction. A constituent that does
 * both is one row setting both vectors — what a haze deck or a UV absorber needs.
 * Coefficients are 1/km at the profile's reference level.
 */

import type { Vec3 } from '../math/Vec3';
import type { DensityProfile } from './DensityProfile';
import type { PhaseFunction } from './PhaseFunction';

export type AtmosphereConstituent = {
  readonly scatter: Vec3;
  readonly absorb: Vec3;
  readonly profile: DensityProfile;
  readonly phase: PhaseFunction;
};
```

- [ ] **Step 4: Add `constituents` to `AtmosphereParams`**

In `src/@types/scene/AtmosphereParams.d.ts`, add the import and the field. Leave the nine old fields in place — Task 3 removes them.

```ts
import type { AtmosphereConstituent } from './AtmosphereConstituent';
```

```ts
  readonly constituents: readonly AtmosphereConstituent[]; // ≤ MAX_CONSTITUENTS; order is the accumulation order
```

- [ ] **Step 5: Add a `constituents` list to all eight rows**

In `src/data/bodies/atmosphereParams.ts`, give each row a `constituents` array per the mapping table above, ordered Rayleigh, Mie, ozone. Keep the existing per-row comments and the Pluto row's `[M]`/`[D]`/`[L]` tags with the values they describe — move each tag comment onto the constituent that now carries that number. Earth's list:

```ts
    constituents: [
      {
        scatter: [5.8e-3, 13.6e-3, 33.1e-3],
        absorb: [0, 0, 0],
        profile: { kind: 'exponential', scaleHeightKm: 8 },
        phase: { kind: 'rayleigh' },
      },
      {
        scatter: [3.9e-3, 3.9e-3, 3.9e-3],
        absorb: [4.4e-3, 4.4e-3, 4.4e-3],
        profile: { kind: 'exponential', scaleHeightKm: 1.2 },
        phase: { kind: 'henyeyGreenstein', g: 0.8 },
      },
      {
        scatter: [0, 0, 0],
        absorb: [0.65e-3, 1.881e-3, 0.085e-3],
        profile: { kind: 'tent', centerKm: 25, widthKm: 15 },
        phase: { kind: 'rayleigh' },
      },
    ],
```

The seven other rows follow the same shape with their own numbers and **no ozone constituent** (their `ozoneWidthKm` is 0, a term that contributed nothing).

- [ ] **Step 6: Run the migration test**

Run: `npx vitest run tests/data/bodies/atmosphereConstituentMigration.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 7: Typecheck and commit**

Run: `npm run typecheck`

```bash
git add src/@types/scene/DensityProfile.d.ts src/@types/scene/PhaseFunction.d.ts src/@types/scene/AtmosphereConstituent.d.ts src/@types/scene/AtmosphereParams.d.ts src/data/bodies/atmosphereParams.ts tests/data/bodies/atmosphereConstituentMigration.test.ts
git commit -m "refactor(atmosphere): express every row as a constituent list"
```

---

### Task 2: Pack and consume the constituent list

The atomic GPU switch: the packer's new layout and the shader's new struct must land in one commit or the CPU write and the GPU read disagree.

**Files:**

- Modify: `src/utils/gpu/packScatteringParams.ts`, `src/services/gpu/renderers/atmosphere/atmosphereShellRenderer.ts`, `src/services/gpu/shaders/atmosphere/scattering.wesl`, `src/services/gpu/shaders/atmosphere/transmittanceLut.wesl`, `src/services/gpu/shaders/atmosphere/multiScatterLut.wesl`, `src/services/gpu/shaders/atmosphere/skyViewLut.wesl`
- Test: `tests/utils/gpu/packScatteringParams.test.ts`

**Interfaces:**

- Consumes: `AtmosphereParams.constituents` from Task 1.
- Produces: `packScatteringParams(params: ScatteringInput): ArrayBuffer`, `SCATTERING_PARAMS_BYTES = 224`, `MAX_CONSTITUENTS = 4`.

The packer's parameter narrows to `Pick<AtmosphereParams, 'planetRadiusKm' | 'atmosphereTopKm' | 'groundAlbedo' | 'constituents'>` — the four fields it actually reads. That is not cosmetic: it decouples this task from Task 3, which is still deleting fields from `AtmosphereParams`, and it stops the test fixture having to carry nine dead keys to typecheck. It also makes the "the look dials do not ride this buffer" contract a type, not a comment.

- [ ] **Step 1: Rewrite the packer test**

Replace `tests/utils/gpu/packScatteringParams.test.ts`. Drive the real packer with a two-constituent fixture (one exponential/HG, one tent/rayleigh) using distinct dyadic sentinels, and pin every offset including the `u32` tag words and the zero-fill of unused slots:

```ts
import { describe, it, expect } from 'vitest';
import {
  packScatteringParams,
  SCATTERING_PARAMS_BYTES,
  MAX_CONSTITUENTS,
} from '../../../src/utils/gpu/packScatteringParams';
import type { AtmosphereParams } from '../../../src/@types/scene/AtmosphereParams';

// Only the four fields the packer reads — the look dials and the twilight knobs
// do not ride this buffer, and the narrowed parameter type says so.
const PARAMS = {
  planetRadiusKm: 1 / 16,
  atmosphereTopKm: 2 / 16,
  groundAlbedo: [3 / 16, 4 / 16, 5 / 16],
  constituents: [
    {
      scatter: [6 / 16, 7 / 16, 8 / 16],
      absorb: [9 / 16, 10 / 16, 11 / 16],
      profile: { kind: 'exponential', scaleHeightKm: 12 / 16 },
      phase: { kind: 'henyeyGreenstein', g: 13 / 16 },
    },
    {
      scatter: [14 / 16, 15 / 16, 16 / 16],
      absorb: [17 / 16, 18 / 16, 19 / 16],
      profile: { kind: 'tent', centerKm: 20 / 16, widthKm: 21 / 16 },
      phase: { kind: 'rayleigh' },
    },
  ],
} as const satisfies Pick<
  AtmosphereParams,
  'planetRadiusKm' | 'atmosphereTopKm' | 'groundAlbedo' | 'constituents'
>;

describe('ScatteringParams byte offsets', () => {
  it('packs a 224-byte record in the WESL struct field order', () => {
    const buf = packScatteringParams(PARAMS);
    expect(buf.byteLength).toBe(SCATTERING_PARAMS_BYTES);
    expect(buf.byteLength).toBe(224);

    const f = new Float32Array(buf);
    const u = new Uint32Array(buf);

    expect(f[0]).toBe(PARAMS.groundAlbedo[0]);
    expect(f[1]).toBe(PARAMS.groundAlbedo[1]);
    expect(f[2]).toBe(PARAMS.groundAlbedo[2]);
    expect(f[3]).toBe(PARAMS.planetRadiusKm);
    expect(f[4]).toBe(PARAMS.atmosphereTopKm);
    expect(u[5]).toBe(2); // constituentCount

    // Constituent 0 at byte 32 (f32 slot 8), stride 48 B (12 f32).
    expect(f[8]).toBe(PARAMS.constituents[0].scatter[0]);
    expect(f[9]).toBe(PARAMS.constituents[0].scatter[1]);
    expect(f[10]).toBe(PARAMS.constituents[0].scatter[2]);
    expect(f[11]).toBe(PARAMS.constituents[0].phase.g);
    expect(f[12]).toBe(PARAMS.constituents[0].absorb[0]);
    expect(f[13]).toBe(PARAMS.constituents[0].absorb[1]);
    expect(f[14]).toBe(PARAMS.constituents[0].absorb[2]);
    expect(f[15]).toBe(PARAMS.constituents[0].profile.scaleHeightKm);
    expect(f[16]).toBe(0); // centerKm — unused by an exponential profile
    expect(f[17]).toBe(0); // widthKm
    expect(u[18]).toBe(0); // profileKind: exponential
    expect(u[19]).toBe(1); // phaseKind: henyeyGreenstein

    // Constituent 1 at byte 80 (f32 slot 20).
    expect(f[20]).toBe(PARAMS.constituents[1].scatter[0]);
    expect(f[23]).toBe(0); // phaseG — unused by the Rayleigh phase
    expect(f[24]).toBe(PARAMS.constituents[1].absorb[0]);
    // A tent constituent packs a FINITE scale height it never reads — see the
    // packer's header for why 1 and not 0.
    expect(f[27]).toBe(1);
    expect(f[28]).toBe(PARAMS.constituents[1].profile.centerKm);
    expect(f[29]).toBe(PARAMS.constituents[1].profile.widthKm);
    expect(u[30]).toBe(1); // profileKind: tent
    expect(u[31]).toBe(0); // phaseKind: rayleigh

    // Unused slots are zero-filled and never read (the loop bounds on count).
    for (let i = 32; i < SCATTERING_PARAMS_BYTES / 4; i++) {
      expect(f[i]).toBe(0);
    }
  });

  it('rejects a row with more constituents than the uniform holds', () => {
    const tooMany = {
      ...PARAMS,
      constituents: Array.from({ length: MAX_CONSTITUENTS + 1 }, () => PARAMS.constituents[1]),
    };
    expect(() => packScatteringParams(tooMany)).toThrow(/MAX_CONSTITUENTS/);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run tests/utils/gpu/packScatteringParams.test.ts`
Expected: FAIL — `SCATTERING_PARAMS_BYTES` and `MAX_CONSTITUENTS` are not exported.

- [ ] **Step 3: Rewrite the packer**

Replace the body of `src/utils/gpu/packScatteringParams.ts`. Rewrite the module header to describe the new layout (and cut it to the ≤ 10-line budget — the dense-vec3-tail essay describes a layout that no longer exists). The `u32` tags are why this returns an `ArrayBuffer` with two views rather than a bare `Float32Array`.

```ts
export const MAX_CONSTITUENTS = 4;
export const SCATTERING_PARAMS_BYTES = 224;

const CONSTITUENT_BASE_F32 = 8; // byte 32
const CONSTITUENT_STRIDE_F32 = 12; // 48 bytes

/** The subset of a row this buffer carries — geometry plus the constituent list. */
type ScatteringInput = Pick<
  AtmosphereParams,
  'planetRadiusKm' | 'atmosphereTopKm' | 'groundAlbedo' | 'constituents'
>;

export function packScatteringParams(params: ScatteringInput): ArrayBuffer {
  const count = params.constituents.length;
  if (count > MAX_CONSTITUENTS) {
    throw new Error(
      `packScatteringParams: ${count} constituents exceeds MAX_CONSTITUENTS (${MAX_CONSTITUENTS})`,
    );
  }
  const buf = new ArrayBuffer(SCATTERING_PARAMS_BYTES);
  const f = new Float32Array(buf);
  const u = new Uint32Array(buf);

  f[0] = params.groundAlbedo[0];
  f[1] = params.groundAlbedo[1];
  f[2] = params.groundAlbedo[2];
  f[3] = params.planetRadiusKm;
  f[4] = params.atmosphereTopKm;
  u[5] = count;
  // f[6], f[7] stay 0: the array must start 16-byte aligned, at byte 32.

  for (let i = 0; i < count; i++) {
    const c = params.constituents[i];
    const b = CONSTITUENT_BASE_F32 + i * CONSTITUENT_STRIDE_F32;
    f[b] = c.scatter[0];
    f[b + 1] = c.scatter[1];
    f[b + 2] = c.scatter[2];
    f[b + 3] = c.phase.kind === 'henyeyGreenstein' ? c.phase.g : 0;
    f[b + 4] = c.absorb[0];
    f[b + 5] = c.absorb[1];
    f[b + 6] = c.absorb[2];
    // A tent's scale height is never read, but it must be FINITE: a compiler
    // that flattens the profile branch into a select evaluates both sides, and
    // exp(-alt/0) is the indeterminate-value trap `densityTent`'s guard exists
    // for. 1 is the cheapest finite value.
    f[b + 7] = c.profile.kind === 'exponential' ? c.profile.scaleHeightKm : 1;
    f[b + 8] = c.profile.kind === 'tent' ? c.profile.centerKm : 0;
    f[b + 9] = c.profile.kind === 'tent' ? c.profile.widthKm : 0;
    u[b + 10] = c.profile.kind === 'tent' ? 1 : 0;
    u[b + 11] = c.phase.kind === 'henyeyGreenstein' ? 1 : 0;
  }
  return buf;
}
```

- [ ] **Step 4: Update the renderer's two lines**

In `src/services/gpu/renderers/atmosphere/atmosphereShellRenderer.ts`, change the import from `SCATTERING_PARAMS_FLOATS` to `SCATTERING_PARAMS_BYTES` and line 377 from `size: SCATTERING_PARAMS_FLOATS * 4` to `size: SCATTERING_PARAMS_BYTES`. Line 380 needs no change — `writeBuffer` accepts an `ArrayBuffer`.

- [ ] **Step 5: Rewrite the shader core**

In `src/services/gpu/shaders/atmosphere/scattering.wesl`:

Replace `struct ScatteringParams` and add `struct Constituent` above it, with a byte-layout comment replacing the old dense-vec3-tail one. Add the two kind constants:

```wgsl
const PROFILE_EXPONENTIAL: u32 = 0u;
const PROFILE_TENT: u32 = 1u;
const PHASE_RAYLEIGH: u32 = 0u;
const PHASE_HENYEY_GREENSTEIN: u32 = 1u;

struct Constituent {
  scatter: vec3<f32>,
  phaseG: f32,
  absorb: vec3<f32>,
  scaleHeightKm: f32,
  centerKm: f32,
  widthKm: f32,
  profileKind: u32,
  phaseKind: u32,
};

struct ScatteringParams {
  groundAlbedo: vec3<f32>,
  planetRadiusKm: f32,
  atmosphereTopKm: f32,
  constituentCount: u32,
  _pad: vec2<f32>,
  constituents: array<Constituent, 4>,
};
```

Replace `MediumSample`:

```wgsl
struct MediumSample {
  scatterPhased: vec3<f32>,
  scatterTotal: vec3<f32>,
  extinction: vec3<f32>,
};
```

Collapse `densityRayleigh` + `densityMie` into one `densityExponential`, rename `densityOzone` to `densityTent` **keeping its guard and the comment explaining why the guard is load-bearing**, and add the two dispatchers:

```wgsl
fn densityExponential(altitudeKm: f32, scaleHeightKm: f32) -> f32 {
  return exp(-altitudeKm / scaleHeightKm);
}

fn densityTent(altitudeKm: f32, centerKm: f32, widthKm: f32) -> f32 {
  if (widthKm <= 0.0) {
    return 0.0;
  }
  return max(0.0, 1.0 - abs(altitudeKm - centerKm) / widthKm);
}

fn constituentDensity(c: Constituent, altitudeKm: f32) -> f32 {
  if (c.profileKind == PROFILE_TENT) {
    return densityTent(altitudeKm, c.centerKm, c.widthKm);
  }
  return densityExponential(altitudeKm, c.scaleHeightKm);
}

fn constituentPhase(c: Constituent, cosTheta: f32) -> f32 {
  if (c.phaseKind == PHASE_HENYEY_GREENSTEIN) {
    return miePhase(cosTheta, c.phaseG);
  }
  return rayleighPhase(cosTheta);
}
```

Replace `sampleMedium` with the accumulator and its two entry points. The accumulator starts at zero and adds in list order, which is what makes this bit-identical to the three-term expression it replaces:

```wgsl
fn accumulateMedium(
  params: ScatteringParams,
  posKm: vec3<f32>,
  cosTheta: f32,
  phased: bool,
) -> MediumSample {
  let altitude = max(0.0, length(posKm) - params.planetRadiusKm);

  var m: MediumSample;
  m.scatterPhased = vec3<f32>(0.0);
  m.scatterTotal = vec3<f32>(0.0);
  m.extinction = vec3<f32>(0.0);

  var i: u32 = 0u;
  loop {
    if (i >= params.constituentCount) { break; }
    let c = params.constituents[i];
    let d = constituentDensity(c, altitude);
    let s = c.scatter * d;
    m.scatterTotal = m.scatterTotal + s;
    m.extinction = m.extinction + (c.scatter + c.absorb) * d;
    if (phased) {
      m.scatterPhased = m.scatterPhased + s * constituentPhase(c, cosTheta);
    }
    i = i + 1u;
  }
  return m;
}

// sampleMedium — optical properties at 'posKm' including the phase-weighted
// single-scatter source. 'cosTheta' is the cosine between the view ray and the
// sun.
fn sampleMedium(params: ScatteringParams, posKm: vec3<f32>, cosTheta: f32) -> MediumSample {
  return accumulateMedium(params, posKm, cosTheta, true);
}

// sampleMediumIsotropic — the same, skipping the phase evaluation. For the
// transmittance bake (extinction only) and the multi-scatter bake (which treats
// higher orders as directionally uniform and would discard the phase weighting).
fn sampleMediumIsotropic(params: ScatteringParams, posKm: vec3<f32>) -> MediumSample {
  return accumulateMedium(params, posKm, 0.0, false);
}
```

- [ ] **Step 6: Update the four call sites**

`transmittanceLut.wesl`: line 33 import `sampleMediumIsotropic` instead of `sampleMedium`; line 65 `let m = sampleMediumIsotropic(params, pos);`.

`multiScatterLut.wesl`: line 41 import `sampleMediumIsotropic`; line 92 `let m = sampleMediumIsotropic(params, pos);`; line 99 `let scattering = m.scatterTotal;`.

`skyViewLut.wesl`: drop the `rayleighPhase` / `miePhase` imports (lines 49-50) and the `rp` / `mp` locals (lines 127-128) — `params.miePhaseG` no longer exists; line 142 `let m = sampleMedium(params, pos, cosTheta);`; line 148 `let scatterPhased = m.scatterPhased;`; line 149 `let scatterTotal = m.scatterTotal;`. Keep `cosTheta` (line 126) — it is now an argument. Inline the two locals at their single use if that reads better, but do not disturb the twilight block below them.

- [ ] **Step 7: Run the tests, typecheck and build**

Run: `npx vitest run tests/utils/gpu/packScatteringParams.test.ts tests/data/bodies/atmosphereConstituentMigration.test.ts`
Expected: PASS.

Run: `npm run typecheck` then `npm run build` (the build relinks WESL — this is the only compile check the shader gets).
Expected: both clean.

- [ ] **Step 8: Commit**

```bash
git add src/utils/gpu/packScatteringParams.ts src/services/gpu/renderers/atmosphere/atmosphereShellRenderer.ts src/services/gpu/shaders/atmosphere/scattering.wesl src/services/gpu/shaders/atmosphere/transmittanceLut.wesl src/services/gpu/shaders/atmosphere/multiScatterLut.wesl src/services/gpu/shaders/atmosphere/skyViewLut.wesl tests/utils/gpu/packScatteringParams.test.ts
git commit -m "refactor(atmosphere): accumulate over constituents in the LUT bakes"
```

---

### Task 3: Delete the nine dead fields

**Files:**

- Modify: `src/@types/scene/AtmosphereParams.d.ts`, `src/data/bodies/atmosphereParams.ts`

**Interfaces:**

- Consumes: everything from Task 2 — nothing reads the old fields by this point.
- Produces: nothing new.

- [ ] **Step 1: Remove the fields from the type**

Delete `rayleighScatter`, `rayleighScaleHeightKm`, `mieScatter`, `mieAbsorption`, `mieScaleHeightKm`, `miePhaseG`, `ozoneAbsorption`, `ozoneCenterKm`, `ozoneWidthKm` from `AtmosphereParams`. Update the type's header comment: it currently describes Bruneton/Hillaire coefficient fields that no longer exist.

- [ ] **Step 2: Remove them from all eight rows**

Delete the same nine keys from every row in `src/data/bodies/atmosphereParams.ts`. Update the module header, which describes the old shape.

- [ ] **Step 3: Confirm nothing else referenced them**

Run: `rg -n "rayleighScatter|rayleighScaleHeightKm|mieScatter|mieAbsorption|mieScaleHeightKm|miePhaseG|ozoneAbsorption|ozoneCenterKm|ozoneWidthKm" src tools tests`
Expected: matches only inside `tests/data/bodies/atmosphereConstituentMigration.test.ts` (its own frozen `LEGACY_ROWS`).

- [ ] **Step 4: Full suite, typecheck, build**

Run: `npm test`, `npm run typecheck`, `npm run build`
Expected: all clean, no test-count regression.

- [ ] **Step 5: Commit**

```bash
git add src/@types/scene/AtmosphereParams.d.ts src/data/bodies/atmosphereParams.ts
git commit -m "refactor(atmosphere): drop the nine positional physics fields"
```

---

### Task 4: Visual verification

The equivalence argument is a source-level proof; this is the check that the GPU agrees. It is the only gate that can catch a byte-layout error, since a wrong offset produces no GPU error.

- [ ] **Step 1: Confirm the dev server is serving this worktree**

The dev server stays running (CLAUDE.md). Confirm the port belongs to _this_ worktree's server before looking — a wrong port silently checks another branch.

- [ ] **Step 2: Ask the user to compare each body against `main`**

Earth is the sensitive one (three constituents, the only tent profile, and the ozone term is what keeps the twilight zenith blue rather than grey). Then Venus, Mars, Jupiter, Saturn, Uranus, Neptune, and Pluto's backlit haze ring at phase > 160°, ~7 radii out.

Expected: no perceptible difference on any body. A changed Earth twilight means the tent constituent is mis-packed; a changed Pluto ring means the per-channel Mie path is.

- [ ] **Step 3: Record the outcome in the plan and commit any fix**

## Definition of Done

- [ ] All eight rows render identically to `main` (Task 4, user-confirmed).
- [ ] `npm test`, `npm run typecheck`, `npm run build` clean.
- [ ] `AtmosphereParams` carries no positional physics field.
- [ ] The zero-width tent guard survives in `densityTent`, with its comment.
- [ ] `MAX_CONSTITUENTS`, the 48-byte stride and the 224-byte total agree between `packScatteringParams.ts`, `scattering.wesl` and the packer test.
- [ ] No new TODO/FIXME without an owner.
- [ ] Comment budget respected in every touched file — `scattering.wesl`'s header and `packScatteringParams.ts`'s header both shrink.

## Out of scope (deferred)

- **Stage 2** — recalibrating Venus, Mars, Jupiter, Saturn, Uranus and Neptune onto physical channels. Its own plan. The migration test is deleted at its start.
- **Stage 3** — Titan. Its own plan.
- `AtmosphereParams.sunIrradiance`, the named pad → `docs/backlog/2026-08-18-atmosphere-sun-irradiance-named-pad.md`.
- Seed albedos vs measured Bond albedos → `docs/backlog/2026-08-18-body-seed-albedos-vs-measured.md`.
- The stale "Mars / Venus / Titan opt in later" comment at `EngineGpuHandles.d.ts:490-507` rides stage 3.
