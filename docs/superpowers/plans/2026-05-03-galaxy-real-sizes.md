# Galaxy Real Sizes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every galaxy a per-row physical diameter in kiloparsecs (real measurement when the catalog provides one, Tully size–luminosity estimate when only B-mag is known, otherwise the existing 30 kpc default), then thread that diameter through the binary format, GPU vertex buffer, point/quad/disk renderers, and focus tween.

**Architecture:** Bump the on-disk `PointCloud` binary format from v3 (56 B/point) to v4 (64 B/point) by appending an `f32 diameterKpc` slot before the trailing padding. Each parser is extended to source the most accurate diameter signal its catalog carries: 2MRS uses the table-3 `Riso` log-isophotal-radius column, GLADE uses the existing `Bmag` (already parsed for `magG`) routed through the Tully (1988) size–luminosity relation, SDSS reads a newly-added `petroR50_r` column when present. Every parser emits `diameterKpc: number | null`; the build pipeline applies the existing `DEFAULT_GALAXY_DIAMETER_KPC = 30` to `null` rows so the encoder sees only finite values. The point-renderer vertex stride grows from 36 B / 9 slots to 40 B / 10 slots (new `diameterKpc` per-instance attribute), the WGSL `points.wgsl` replaces its `GALAXY_RADIUS_MPC = 0.06` constant with the per-instance value, and the engine's per-frame quad/disk pass replaces the constant `dKpc` lookup with `cloud.diameterKpc[i]`. `focusDistanceMpc()` becomes per-galaxy. HyperLEDA `logd25` real diameters are deferred to a Phase-2 plan because the in-flight HyperLEDA fetch (mid-run, populating `pa + logr25` only) must not be invalidated.

**Tech Stack:** TypeScript, WebGPU + WGSL, Vite, Vitest

---

## Task 0: Pre-flight — confirm clean baseline

**Files:** none (read-only check)

- [ ] **Step 1: Run typecheck and tests to confirm clean baseline before starting**

Run:

```
npm run typecheck && npm test
```

Expected: typecheck clean, 191/191 tests pass. If anything fails, STOP and report — the plan assumes the pre-existing orientation work is fully landed.

- [ ] **Step 2: Confirm `data/raw/2mrs_table3.dat`, `data/raw/glade2.3.dat`, and `data/raw/J_ApJS_199_26_ReadMe` exist**

Run:

```
ls -lh /Users/rulkens/Development/js/skymap/data/raw/2mrs_table3.dat /Users/rulkens/Development/js/skymap/data/raw/glade2.3.dat /Users/rulkens/Development/js/skymap/data/raw/J_ApJS_199_26_ReadMe /Users/rulkens/Development/js/skymap/data/raw/VII_281_ReadMe
```

Expected: all four exist. The 2MRS file is ~10 MB, GLADE is ~800 MB.

- [ ] **Step 3: Note the `data/raw/hyperleda_pa.csv` mid-run state — DO NOT delete or schema-change**

Run:

```
ls -lh /Users/rulkens/Development/js/skymap/data/raw/hyperleda_pa.csv 2>/dev/null || echo "not yet present (in-flight fetch)"
```

Either output is fine. The plan does not touch this file.

---

## Task 1: User data prep — re-fetch SDSS CSV with petroR50_r

**Files:** none in repo; this is an ops step the human user runs.

- [ ] **Step 1: User runs the new SkyServer SQL query**

Open https://skyserver.sdss.org/dr18/SearchTools/sql in a browser, paste the SQL below into the form, click Submit, choose "CSV" output, save as `/Users/rulkens/Development/js/skymap/data/sdss_dr18.csv` (replacing any prior file).

```sql
-- skymap SDSS pull (v2 — adds petroR50_r and petroR90_r for per-galaxy size)
SELECT
  s.objID, s.ra, s.dec, s.z,
  p.modelMag_u, p.modelMag_g, p.modelMag_r, p.modelMag_i, p.modelMag_z,
  p.expAB_r, p.expPhi_r, p.deVAB_r, p.deVPhi_r, p.fracDeV_r,
  p.petroR50_r, p.petroR90_r
FROM SpecObj AS s
JOIN PhotoObj AS p ON s.bestObjID = p.objID
WHERE s.class = 'GALAXY'
  AND s.zWarning = 0
  AND s.z BETWEEN 0.001 AND 0.3
  AND p.modelMag_u BETWEEN 14 AND 22
  AND p.modelMag_g BETWEEN 14 AND 22
```

- [ ] **Step 2: Verify the CSV has the new columns**

Run:

```
head -1 /Users/rulkens/Development/js/skymap/data/sdss_dr18.csv
```

Expected: a comma-separated header row that includes `petroR50_r` and `petroR90_r` (case-insensitive). If not, the user re-ran the wrong query — ask them to redo.

- [ ] **Step 3: Confirm GLADE and 2MRS files are untouched (no user action needed)**

Both `data/raw/glade2.3.dat` and `data/raw/2mrs_table3.dat` already carry the columns we need (`Bmag` and `Riso` respectively); no re-download required. Skip if confirmed in Task 0 step 2.

---

## Task 2: Add `arcsecToKpc` helper + tests

**Files:**

- Create: `/Users/rulkens/Development/js/skymap/src/utils/math/arcsecToKpc.ts`
- Create: `/Users/rulkens/Development/js/skymap/tests/utils/arcsecToKpc.test.ts`
- Modify: `/Users/rulkens/Development/js/skymap/src/utils/math/index.ts` (append the re-export)

- [ ] **Step 1: Write the failing tests**

Create `/Users/rulkens/Development/js/skymap/tests/utils/arcsecToKpc.test.ts`:

```ts
/**
 * arcsecToKpc converts an angular size on the sky (arcseconds) to a
 * physical size (kiloparsecs) at a given comoving distance.
 *
 * The math is the small-angle approximation: physicalSize = θ × distance,
 * where θ is in radians. We multiply arcseconds by π/(180·3600) to convert
 * to radians, then multiply by distance_Mpc × 1000 to land in kpc.
 */

import { describe, it, expect } from 'vitest';
import { arcsecToKpc } from '../../src/utils/math/arcsecToKpc';

describe('arcsecToKpc', () => {
  it('converts 1 arcsec at 1 Mpc to ≈ 4.848e-3 kpc', () => {
    // 1" × (π/180/3600) rad ≈ 4.848e-6 rad; × 1 Mpc × 1000 kpc/Mpc ≈ 4.848e-3 kpc
    expect(arcsecToKpc(1, 1)).toBeCloseTo(4.848e-3, 6);
  });

  it('converts a 30" galaxy at 100 Mpc to ≈ 14.5 kpc', () => {
    // Real-world calibration: a typical 2MRS galaxy with Riso≈log10(15)=1.18
    // (so 15" radius, 30" diameter) at z=0.024 (≈100 Mpc with H0=70) should
    // come out to ~14.5 kpc — close to the canonical 30 kpc default after
    // doubling for radius→diameter elsewhere.
    expect(arcsecToKpc(30, 100)).toBeCloseTo(14.54, 2);
  });

  it('returns NaN when distance is non-finite', () => {
    expect(Number.isNaN(arcsecToKpc(10, NaN))).toBe(true);
  });

  it('returns NaN when arcsec is non-finite', () => {
    expect(Number.isNaN(arcsecToKpc(NaN, 100))).toBe(true);
  });

  it('returns 0 when arcsec is 0', () => {
    expect(arcsecToKpc(0, 100)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```
npx vitest run tests/utils/arcsecToKpc.test.ts
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement `arcsecToKpc`**

Create `/Users/rulkens/Development/js/skymap/src/utils/math/arcsecToKpc.ts`:

```ts
/**
 * Convert an angular size in arcseconds at a given distance in megaparsecs
 * to a physical size in kiloparsecs.
 *
 * This is the standard small-angle formula:
 *
 *     physical = θ_radians × distance
 *
 * with two unit conversions: arcsec → radians (× π / (180 · 3600)) and
 * Mpc → kpc (× 1000) to land in kpc when `distanceMpc` is in Mpc.
 *
 * Why a tiny dedicated helper rather than inlining the formula in each
 * parser?  Three of the four catalog paths (2MRS Riso, SDSS petroR50_r,
 * future HyperLEDA logd25) all need this exact conversion, and getting
 * the constant wrong by a factor of 2 (radius vs diameter) or 1000 (kpc
 * vs Mpc) is silent and devastating — every galaxy ends up the wrong
 * size and the renderer just shows uniformly-tiny or uniformly-huge
 * blobs.  Centralising the conversion in one tested helper means every
 * call site is one obvious-named function call.
 *
 * Returns NaN when either input is non-finite — propagates "missing
 * measurement" through arithmetic without a special-case branch at the
 * call site.  Returns 0 when arcsec === 0 (rare but legal: a perfectly
 * unresolved point source).
 */
export function arcsecToKpc(arcsec: number, distanceMpc: number): number {
  if (!Number.isFinite(arcsec) || !Number.isFinite(distanceMpc)) return NaN;
  // π/(180·3600) ≈ 4.84814e-6 rad/arcsec.  We compute this from named
  // constants rather than hard-coding the decimal so the unit chain
  // stays auditable.
  const RAD_PER_ARCSEC = Math.PI / (180 * 3600);
  const KPC_PER_MPC = 1000;
  return arcsec * RAD_PER_ARCSEC * distanceMpc * KPC_PER_MPC;
}
```

- [ ] **Step 4: Add the barrel re-export**

Edit `/Users/rulkens/Development/js/skymap/src/utils/math/index.ts` and add the line `export * from './arcsecToKpc';` immediately after `export * from './galaxyDiameterKpc';`.

- [ ] **Step 5: Run the test to verify it passes**

Run:

```
npx vitest run tests/utils/arcsecToKpc.test.ts
```

Expected: 5 PASS.

- [ ] **Step 6: Commit**

```
cd /Users/rulkens/Development/js/skymap && git add src/utils/math/arcsecToKpc.ts src/utils/math/index.ts tests/utils/arcsecToKpc.test.ts && git commit -m "feat(math): add arcsecToKpc helper for catalog diameter conversions"
```

---

## Task 3: Extend `galaxyDiameterKpc` with Tully size–luminosity (TDD)

**Files:**

- Modify: `/Users/rulkens/Development/js/skymap/src/utils/math/galaxyDiameterKpc.ts`
- Create: `/Users/rulkens/Development/js/skymap/tests/utils/galaxyDiameterKpc.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `/Users/rulkens/Development/js/skymap/tests/utils/galaxyDiameterKpc.test.ts`:

```ts
/**
 * galaxyDiameterKpc applies the Tully (1988) size–luminosity relation when
 * an absolute B magnitude is supplied:
 *
 *   log10(R_25_kpc) = -0.249 · (M_B + 21) + 1.366
 *   D_25_kpc        = 2 · 10^log10R
 *
 * Sanity check: M_B = -20.5 (Milky Way-ish L*) →
 *   log10R = -0.249 · (0.5) + 1.366 = -0.1245 + 1.366 = 1.2415
 *   R      = 10^1.2415 ≈ 17.43 kpc
 *   D      = 2R ≈ 34.86 kpc
 * Close to the canonical Milky Way D_25 ≈ 30 kpc — within 15 %, expected
 * for a single-relation linear fit across all galaxy types.
 *
 * When `absMagBmag` is undefined / NaN we fall back to
 * DEFAULT_GALAXY_DIAMETER_KPC = 30.
 */

import { describe, it, expect } from 'vitest';
import {
  galaxyDiameterKpc,
  DEFAULT_GALAXY_DIAMETER_KPC,
} from '../../src/utils/math/galaxyDiameterKpc';

describe('galaxyDiameterKpc', () => {
  it('returns the default when no input is supplied', () => {
    expect(galaxyDiameterKpc({})).toBe(DEFAULT_GALAXY_DIAMETER_KPC);
  });

  it('returns the default when absMagBmag is NaN', () => {
    expect(galaxyDiameterKpc({ absMagBmag: NaN })).toBe(DEFAULT_GALAXY_DIAMETER_KPC);
  });

  it('returns ~34.9 kpc for M_B = -20.5 (Milky-Way-ish L*)', () => {
    expect(galaxyDiameterKpc({ absMagBmag: -20.5 })).toBeCloseTo(34.86, 1);
  });

  it('returns a smaller diameter for a fainter galaxy (M_B = -18)', () => {
    // log10R = -0.249 · (-18 + 21) + 1.366 = -0.747 + 1.366 = 0.619
    // R = 10^0.619 ≈ 4.16 kpc, D ≈ 8.32 kpc
    expect(galaxyDiameterKpc({ absMagBmag: -18 })).toBeCloseTo(8.32, 1);
  });

  it('returns a larger diameter for a brighter galaxy (M_B = -22.5)', () => {
    // log10R = -0.249 · (-1.5) + 1.366 = 0.3735 + 1.366 = 1.7395
    // R = 10^1.7395 ≈ 54.91 kpc, D ≈ 109.81 kpc
    expect(galaxyDiameterKpc({ absMagBmag: -22.5 })).toBeCloseTo(109.81, 1);
  });

  it('clamps to a sensible minimum to avoid zero/negative diameters', () => {
    // An absurdly faint dwarf at M_B = -10 would produce R ≈ 0.078 kpc,
    // D ≈ 0.16 kpc — below the renderer's reasonable floor.  We clamp to
    // 1 kpc so no galaxy ever ends up smaller than a globular cluster.
    expect(galaxyDiameterKpc({ absMagBmag: -10 })).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```
npx vitest run tests/utils/galaxyDiameterKpc.test.ts
```

Expected: 4 FAIL (only the "no input" and "NaN" cases pass with the current placeholder implementation).

- [ ] **Step 3: Replace `galaxyDiameterKpc.ts` with the Tully implementation**

Replace the entire contents of `/Users/rulkens/Development/js/skymap/src/utils/math/galaxyDiameterKpc.ts`:

```ts
/**
 * Estimate a galaxy's physical diameter in kiloparsecs.
 *
 * v2 (this version) implements the Tully (1988) size–luminosity relation:
 *
 *   log10(R_25_kpc) = -0.249 · (M_B + 21) + 1.366
 *   D_25_kpc        = 2 · 10^log10R
 *
 * R_25 is the radius at which the B-band surface brightness drops below
 * 25 mag/arcsec² — the standard "where the galaxy looks like it ends" radius
 * astronomers quote.  The factor of 2 turns radius into diameter.
 *
 * Sanity check: M_B = -20.5 (an L* galaxy near the Milky Way's luminosity)
 *   log10R = -0.249 · 0.5 + 1.366 = 1.2415
 *   R      = 10^1.2415 ≈ 17.4 kpc
 *   D      ≈ 34.9 kpc
 * That's within 15 % of the Milky Way's measured D_25 ≈ 30 kpc — good
 * agreement for a single-relation fit across spirals + ellipticals.
 *
 * When `absMagBmag` is missing (undefined or NaN), the function returns
 * the project-wide DEFAULT_GALAXY_DIAMETER_KPC = 30 — the same value used
 * by every fallback path elsewhere in the build pipeline (see
 * `tools/buildAllBins.ts`).  Keeping the constant exported lets the
 * pipeline reuse it without re-importing the helper.
 *
 * The output is clamped to a 1 kpc floor.  Without the clamp, very faint
 * dwarfs (M_B ≈ -10) would compute D ≈ 0.16 kpc — smaller than a globular
 * cluster — and the renderer's apparent-size logic would shrink them past
 * the visibility floor entirely.  1 kpc is a defensible minimum for any
 * "object the user can call a galaxy".
 */
export const DEFAULT_GALAXY_DIAMETER_KPC = 30;

/**
 * Minimum diameter we'll ever return.  See module doc for the rationale —
 * this prevents pathological tiny numbers from collapsing the renderer's
 * apparent-size math.
 */
const MIN_DIAMETER_KPC = 1;

export function galaxyDiameterKpc(input: { absMagBmag?: number }): number {
  if (input.absMagBmag === undefined || !Number.isFinite(input.absMagBmag)) {
    return DEFAULT_GALAXY_DIAMETER_KPC;
  }
  // Tully (1988) size–luminosity, expressed in B-band absolute magnitude.
  const logR = -0.249 * (input.absMagBmag + 21) + 1.366;
  const diameter = 2 * Math.pow(10, logR);
  return Math.max(diameter, MIN_DIAMETER_KPC);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```
npx vitest run tests/utils/galaxyDiameterKpc.test.ts
```

Expected: 6 PASS.

- [ ] **Step 5: Commit**

```
cd /Users/rulkens/Development/js/skymap && git add src/utils/math/galaxyDiameterKpc.ts tests/utils/galaxyDiameterKpc.test.ts && git commit -m "feat(math): apply Tully size-luminosity in galaxyDiameterKpc"
```

---

## Task 4: Extend `ParsedRecord` and `PointCloud` types with `diameterKpc`

**Files:**

- Modify: `/Users/rulkens/Development/js/skymap/tools/parsers/common.ts`
- Modify: `/Users/rulkens/Development/js/skymap/src/@types/PointCloud.d.ts`

- [ ] **Step 1: Add `diameterKpc: number | null` to `ParsedRecord`**

In `/Users/rulkens/Development/js/skymap/tools/parsers/common.ts`, append a new field at the end of the `ParsedRecord` type (after `positionAngleDeg`):

```ts
/**
 * Physical diameter in kiloparsecs derived from this row's catalog.
 *
 *   - 2MRS  → 2 · 10^Riso · arcsecToKpc(1, distance_Mpc)  (real isophotal)
 *   - GLADE → Tully(1988) on absolute B mag derived from Bmag + distance
 *   - SDSS  → 3 · petroR50_r · arcsecToKpc(1, distance_Mpc)  (Petrosian)
 *
 * `null` means the parser couldn't extract a real measurement — the
 * build pipeline applies `DEFAULT_GALAXY_DIAMETER_KPC = 30` before
 * encoding, so the renderer always sees a finite value.  `null` over
 * NaN keeps the "we have a measurement vs we don't" decision a true
 * binary at the parser→pipeline boundary, mirroring how the orientation
 * fields handle the same kind of "real or fallback" distinction.
 */
diameterKpc: number | null;
```

- [ ] **Step 2: Add `diameterKpc: Float32Array` to `PointCloud`**

In `/Users/rulkens/Development/js/skymap/src/@types/PointCloud.d.ts`, append a new field at the end of the type (after `positionAngleDeg`):

```ts
/**
 * Per-galaxy physical diameter in kiloparsecs — length === count.
 *
 * Drives the renderer's apparent-size math, the thumbnail quad's
 * world-space footprint, the 3D disk plane's geometry, and the focus
 * tween distance.  The build pipeline guarantees every entry is a
 * finite, positive value: real catalog measurement when the parser
 * supplied one, otherwise DEFAULT_GALAXY_DIAMETER_KPC = 30.
 *
 * Unlike `axisRatio`/`positionAngleDeg`, NaN is never a legitimate
 * decoded value here — the renderer multiplies and divides by this
 * field every frame and a NaN would turn the entire billboard black.
 * The encoder still preserves NaN bit-for-bit (it's a pure function
 * of the input cloud), but the pipeline never produces a NaN entry.
 */
diameterKpc: Float32Array;
```

- [ ] **Step 3: Run typecheck to expose every call site that needs updating**

Run:

```
cd /Users/rulkens/Development/js/skymap && npm run typecheck
```

Expected: many errors saying `Property 'diameterKpc' is missing in type ...`. That's the correct intermediate state — Tasks 5–8 will fix the call sites.

- [ ] **Step 4: Commit the type extension**

```
cd /Users/rulkens/Development/js/skymap && git add tools/parsers/common.ts src/@types/PointCloud.d.ts && git commit -m "feat(types): add diameterKpc to ParsedRecord and PointCloud"
```

---

## Task 5: Bump binary format to v4 (encode/decode + tests)

**Files:**

- Modify: `/Users/rulkens/Development/js/skymap/src/data/pointCloudFormat.ts`
- Modify: `/Users/rulkens/Development/js/skymap/tests/pointCloudFormat.test.ts`

- [ ] **Step 1: Read the current test file to understand its conventions**

Run:

```
wc -l /Users/rulkens/Development/js/skymap/tests/pointCloudFormat.test.ts
```

Expected: a non-empty file. Open it and skim — keep its naming and helper style for the new tests.

- [ ] **Step 2: Add failing v4 tests**

Append to `/Users/rulkens/Development/js/skymap/tests/pointCloudFormat.test.ts` (after the existing v3 tests):

```ts
import { describe, it, expect } from 'vitest';
import { encodePointCloud, decodePointCloud } from '../src/data/pointCloudFormat';
import type { PointCloud } from '../src/@types';

describe('pointCloudFormat v4', () => {
  it('round-trips diameterKpc finite values', () => {
    const cloud: PointCloud = {
      count: 2,
      objIDs: new BigUint64Array([1n, 2n]),
      positions: new Float32Array([1, 2, 3, 4, 5, 6]),
      magU: new Float32Array([14, 15]),
      magG: new Float32Array([14.5, 15.5]),
      magR: new Float32Array([14.7, 15.7]),
      magI: new Float32Array([14.8, 15.8]),
      magZ: new Float32Array([14.9, 15.9]),
      axisRatio: new Float32Array([0.5, 0.8]),
      positionAngleDeg: new Float32Array([45, 90]),
      diameterKpc: new Float32Array([30, 12.5]),
    };
    const decoded = decodePointCloud(encodePointCloud(cloud));
    expect(Array.from(decoded.diameterKpc)).toEqual([30, 12.5]);
  });

  it('round-trips NaN sentinel in diameterKpc', () => {
    const cloud: PointCloud = {
      count: 1,
      objIDs: new BigUint64Array([1n]),
      positions: new Float32Array([1, 2, 3]),
      magU: new Float32Array([14]),
      magG: new Float32Array([14.5]),
      magR: new Float32Array([14.7]),
      magI: new Float32Array([14.8]),
      magZ: new Float32Array([14.9]),
      axisRatio: new Float32Array([0.5]),
      positionAngleDeg: new Float32Array([45]),
      diameterKpc: new Float32Array([NaN]),
    };
    const decoded = decodePointCloud(encodePointCloud(cloud));
    expect(Number.isNaN(decoded.diameterKpc[0])).toBe(true);
  });

  it('produces a 64-byte-per-point file (header 16 + 1 point × 64 = 80)', () => {
    const cloud: PointCloud = {
      count: 1,
      objIDs: new BigUint64Array([1n]),
      positions: new Float32Array([1, 2, 3]),
      magU: new Float32Array([14]),
      magG: new Float32Array([14.5]),
      magR: new Float32Array([14.7]),
      magI: new Float32Array([14.8]),
      magZ: new Float32Array([14.9]),
      axisRatio: new Float32Array([0.5]),
      positionAngleDeg: new Float32Array([45]),
      diameterKpc: new Float32Array([30]),
    };
    expect(encodePointCloud(cloud).byteLength).toBe(80);
  });

  it('rejects v1, v2, AND v3 with the same regenerate message', () => {
    for (const version of [1, 2, 3]) {
      const buf = new ArrayBuffer(16);
      const dv = new DataView(buf);
      dv.setUint32(0, 0x504d4b53, true); // "SKMP"
      dv.setUint32(4, version, true);
      dv.setUint32(8, 0, true);
      dv.setUint32(12, 0, true);
      expect(() => decodePointCloud(buf)).toThrow(/regenerate/i);
    }
  });

  it('throws when diameterKpc length mismatches count', () => {
    const cloud: PointCloud = {
      count: 2,
      objIDs: new BigUint64Array([1n, 2n]),
      positions: new Float32Array([1, 2, 3, 4, 5, 6]),
      magU: new Float32Array([14, 15]),
      magG: new Float32Array([14.5, 15.5]),
      magR: new Float32Array([14.7, 15.7]),
      magI: new Float32Array([14.8, 15.8]),
      magZ: new Float32Array([14.9, 15.9]),
      axisRatio: new Float32Array([0.5, 0.8]),
      positionAngleDeg: new Float32Array([45, 90]),
      diameterKpc: new Float32Array([30]), // wrong length
    };
    expect(() => encodePointCloud(cloud)).toThrow(/diameterKpc length mismatch/);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run:

```
npx vitest run tests/pointCloudFormat.test.ts
```

Expected: the new v4 tests fail with errors like `unsupported version: 4` or output size 72 (current v3 was 16 + 56 = 72).

- [ ] **Step 4: Replace `pointCloudFormat.ts` with the v4 implementation**

Replace the entire contents of `/Users/rulkens/Development/js/skymap/src/data/pointCloudFormat.ts`:

```ts
/**
 * Binary on-disk format for a `PointCloud` — version 4.
 *
 * What changed in v4?  We added an `f32 diameterKpc` slot at offset 48 of
 * each per-point record, growing the per-point footprint from 56 bytes to
 * 64 bytes.  The trailing padding shrinks from 8 bytes (v3) to 12 bytes
 * (v4) — wait, that grew, because we added 4 bytes of payload but bumped
 * the record size by a full 16-byte alignment quantum to keep the per-point
 * record on a 16-byte boundary (so the buffer remains usable as a WebGPU
 * uniform/storage-buffer payload without restructuring).
 *
 * Why a per-galaxy diameter at all?  Earlier versions used a project-wide
 * 30 kpc constant for every renderer footprint computation.  That made
 * dwarf galaxies look implausibly large and giants look implausibly small;
 * worse, it dragged the apparent-size threshold for thumbnail loading away
 * from the actual galaxy boundary, so the visible disk and the JPEG
 * texture were misaligned.  The diameter now drives:
 *   - point-billboard apparent radius (points.wgsl GALAXY_RADIUS_MPC)
 *   - thumbnail quad world-space size (engine.ts sizeWorldMpc)
 *   - 3D disk plane world-space size
 *   - focusDistanceMpc tween destination
 *
 * Why preserve NaN round-trip if the renderer can't tolerate NaN?  The
 * encoder/decoder remain pure functions (easy to unit-test in isolation
 * and independent of the build pipeline).  The pipeline guarantees a
 * finite value upstream; if a corrupted .bin ever delivered NaN, that's a
 * logged warning, not a malformed format.
 *
 * Layout (little-endian):
 *
 *     ── HEADER (16 bytes) ──────────────────────────────────────────────────
 *     0       4     magic    = "SKMP" (0x504d4b53)
 *     4       4     version  = 4 (uint32)
 *     8       4     count    = number of points (uint32)
 *     12      4     reserved = 0
 *
 *     ── PER-POINT RECORD (64 bytes) ────────────────────────────────────────
 *     0       8     objID            (uint64)
 *     8       4     x                (float32, Mpc)
 *     12      4     y                (float32)
 *     16      4     z                (float32)
 *     20      4     magU             (float32)
 *     24      4     magG             (float32)
 *     28      4     magR             (float32)
 *     32      4     magI             (float32)
 *     36      4     magZ             (float32)
 *     40      4     axisRatio        (float32) — b/a in [0,1] or NaN
 *     44      4     positionAngleDeg (float32) — PA in [0,180) or NaN
 *     48      4     diameterKpc      (float32) — physical diameter in kpc (NEW in v4)
 *     52      12    padding          (zeroed)
 *
 * Total file size: 16 + count × 64.
 */

import type { PointCloud } from '../@types';

/** "SKMP" as a little-endian uint32. */
const MAGIC = 0x504d4b53;

/** Bump this when the layout changes incompatibly. */
const VERSION = 4;

/** Header size in bytes. */
const HEADER_BYTES = 16;

/**
 * Per-point payload in bytes.
 *
 * Breakdown: 8 (objID) + 4×3 (xyz) + 4×5 (5 photometric bands)
 *          + 4×2 (axisRatio + positionAngleDeg) + 4 (diameterKpc)
 *          + 12 (tail padding) = 64.
 * 64 is a multiple of 16 ✓.
 */
const BYTES_PER_POINT = 64;

export function encodePointCloud(cloud: PointCloud): ArrayBuffer {
  const {
    count,
    objIDs,
    positions,
    magU,
    magG,
    magR,
    magI,
    magZ,
    axisRatio,
    positionAngleDeg,
    diameterKpc,
  } = cloud;
  if (objIDs.length !== count) throw new Error('objIDs length mismatch');
  if (positions.length !== count * 3) throw new Error('positions length mismatch');
  if (magU.length !== count) throw new Error('magU length mismatch');
  if (magG.length !== count) throw new Error('magG length mismatch');
  if (magR.length !== count) throw new Error('magR length mismatch');
  if (magI.length !== count) throw new Error('magI length mismatch');
  if (magZ.length !== count) throw new Error('magZ length mismatch');
  if (axisRatio.length !== count) throw new Error('axisRatio length mismatch');
  if (positionAngleDeg.length !== count) throw new Error('positionAngleDeg length mismatch');
  if (diameterKpc.length !== count) throw new Error('diameterKpc length mismatch');

  const buf = new ArrayBuffer(HEADER_BYTES + count * BYTES_PER_POINT);
  const dv = new DataView(buf);
  dv.setUint32(0, MAGIC, true);
  dv.setUint32(4, VERSION, true);
  dv.setUint32(8, count, true);
  dv.setUint32(12, 0, true);

  const floatView = new Float32Array(buf);
  for (let i = 0; i < count; i++) {
    const byteBase = HEADER_BYTES + i * BYTES_PER_POINT;
    dv.setBigUint64(byteBase + 0, objIDs[i]!, true);
    const f = (byteBase + 8) / 4; // first float-aligned slot
    floatView[f + 0] = positions[i * 3 + 0]!;
    floatView[f + 1] = positions[i * 3 + 1]!;
    floatView[f + 2] = positions[i * 3 + 2]!;
    floatView[f + 3] = magU[i]!;
    floatView[f + 4] = magG[i]!;
    floatView[f + 5] = magR[i]!;
    floatView[f + 6] = magI[i]!;
    floatView[f + 7] = magZ[i]!;
    floatView[f + 8] = axisRatio[i]!;
    floatView[f + 9] = positionAngleDeg[i]!;
    floatView[f + 10] = diameterKpc[i]!;
    // floatView[f+11..13] = 12 bytes of padding (zero-init)
  }
  return buf;
}

export function decodePointCloud(buf: ArrayBuffer): PointCloud {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== MAGIC) throw new Error('bad magic — not a SKMP file');

  const version = dv.getUint32(4, true);
  if (version !== VERSION) {
    throw new Error(
      `unsupported version: ${version} — please regenerate the .bin via "npm run build-all"`,
    );
  }

  const count = dv.getUint32(8, true);

  const objIDs = new BigUint64Array(count);
  const positions = new Float32Array(count * 3);
  const magU = new Float32Array(count);
  const magG = new Float32Array(count);
  const magR = new Float32Array(count);
  const magI = new Float32Array(count);
  const magZ = new Float32Array(count);
  const axisRatio = new Float32Array(count);
  const positionAngleDeg = new Float32Array(count);
  const diameterKpc = new Float32Array(count);

  const floatView = new Float32Array(buf);

  for (let i = 0; i < count; i++) {
    const byteBase = HEADER_BYTES + i * BYTES_PER_POINT;
    objIDs[i] = dv.getBigUint64(byteBase + 0, true);
    const f = (byteBase + 8) / 4;
    positions[i * 3 + 0] = floatView[f + 0]!;
    positions[i * 3 + 1] = floatView[f + 1]!;
    positions[i * 3 + 2] = floatView[f + 2]!;
    magU[i] = floatView[f + 3]!;
    magG[i] = floatView[f + 4]!;
    magR[i] = floatView[f + 5]!;
    magI[i] = floatView[f + 6]!;
    magZ[i] = floatView[f + 7]!;
    axisRatio[i] = floatView[f + 8]!;
    positionAngleDeg[i] = floatView[f + 9]!;
    diameterKpc[i] = floatView[f + 10]!;
    // floatView[f+11..13] = padding, ignored
  }

  return {
    count,
    objIDs,
    positions,
    magU,
    magG,
    magR,
    magI,
    magZ,
    axisRatio,
    positionAngleDeg,
    diameterKpc,
  };
}
```

- [ ] **Step 5: Run the v4 tests to verify they pass**

Run:

```
npx vitest run tests/pointCloudFormat.test.ts
```

Expected: every test passes (existing v3 tests will need their fixtures updated — see step 6).

- [ ] **Step 6: Update existing v3 tests in the same file to include `diameterKpc` in fixtures**

Open `/Users/rulkens/Development/js/skymap/tests/pointCloudFormat.test.ts`. For every existing fixture that constructs a `PointCloud`, add a `diameterKpc: new Float32Array([...])` field with one entry per record (use 30 for every entry as a default — matches `DEFAULT_GALAXY_DIAMETER_KPC`). Re-run the suite:

```
npx vitest run tests/pointCloudFormat.test.ts
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```
cd /Users/rulkens/Development/js/skymap && git add src/data/pointCloudFormat.ts tests/pointCloudFormat.test.ts && git commit -m "feat(format): bump PointCloud binary to v4 with diameterKpc slot"
```

---

## Task 6: 2MRS parser — decode `Riso`, convert to kpc

**Files:**

- Modify: `/Users/rulkens/Development/js/skymap/tools/parsers/twoMrs.ts`
- Modify: `/Users/rulkens/Development/js/skymap/tests/parsers/twoMrs.test.ts` (if it exists; otherwise create)

- [ ] **Step 1: Locate the 2MRS test file**

Run:

```
ls /Users/rulkens/Development/js/skymap/tests/parsers/
```

Expected: includes a `twoMrs.test.ts` (or similar). If absent, create `/Users/rulkens/Development/js/skymap/tests/parsers/twoMrs.test.ts` with the standard import header (`import { describe, it, expect } from 'vitest'; import { parseTwoMrs } from '../../tools/parsers/twoMrs';`).

- [ ] **Step 2: Add a failing test for diameterKpc on a real-shape line**

Append to `tests/parsers/twoMrs.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseTwoMrs } from '../../tools/parsers/twoMrs';

describe('parseTwoMrs diameterKpc', () => {
  /**
   * 2MRS table-3 byte layout (1-based, from J_ApJS_199_26_ReadMe):
   *   bytes 1-16    ID
   *   bytes 18-26   RAdeg
   *   bytes 28-36   DEdeg
   *   bytes 58-63   Kcmag
   *   bytes 65-70   Hcmag
   *   bytes 72-77   Jcmag
   *   bytes 142-146 Riso  (log10 isophotal-radius arcsec)
   *   bytes 148-152 Rext
   *   bytes 174-178 cz
   *
   * The line below is hand-built to exactly that layout.  Riso = 1.176
   * (i.e. 10^1.176 ≈ 15" radius), cz = 7000 km/s → distance ≈ 100 Mpc at
   * H0 = 70.  Expected diameter:
   *   2 · 15"  ≈ 30" diameter
   *   30 · π/(180·3600) · 100 · 1000 ≈ 14.54 kpc
   */
  it('extracts diameterKpc from Riso for a finite cz row', () => {
    // We construct the line by space-padding each field to its width.
    const pad = (s: string, w: number, left = false): string =>
      left ? s.padStart(w, ' ') : s.padEnd(w, ' ');

    // Bytes 1..16 (16w) ID, 17 space, 18..26 (9w) RA, 27 space, 28..36 (9w) Dec,
    // pad to byte 57, 58..63 (6w) Kcmag, 64 space, 65..70 (6w) Hcmag,
    // 71 space, 72..77 (6w) Jcmag, pad to 141, 142..146 (5w) Riso,
    // 147 space, 148..152 (5w) Rext, pad to 173, 174..178 (5w) cz, then
    // pad to MIN_LINE_LEN (178).
    let line = '';
    line += pad('00000000+0000000', 16);
    line += ' ';
    line += pad('150.00000', 9, true);
    line += ' ';
    line += pad(' 30.00000', 9, true);
    // pad bytes 37..57 (21 spaces)
    line += ' '.repeat(57 - line.length);
    line += pad('10.000', 6, true); // Kcmag bytes 58..63
    line += ' ';
    line += pad('10.500', 6, true); // Hcmag bytes 65..70
    line += ' ';
    line += pad('11.000', 6, true); // Jcmag bytes 72..77
    line += ' '.repeat(141 - line.length);
    line += pad('1.176', 5); // Riso bytes 142..146
    line += ' ';
    line += pad('1.200', 5); // Rext bytes 148..152
    line += ' '.repeat(173 - line.length);
    line += pad(' 7000', 5, true); // cz bytes 174..178
    expect(line.length).toBeGreaterThanOrEqual(178);

    const { records } = parseTwoMrs(line);
    expect(records).toHaveLength(1);
    // 7000 km/s / 70 km/s/Mpc = 100 Mpc → 30" → 14.54 kpc.
    expect(records[0]!.diameterKpc).toBeCloseTo(14.54, 1);
  });

  it('returns null diameterKpc when Riso is blank', () => {
    // Same line but with Riso bytes blanked.
    const pad = (s: string, w: number, left = false): string =>
      left ? s.padStart(w, ' ') : s.padEnd(w, ' ');
    let line = '';
    line += pad('00000000+0000000', 16);
    line += ' ';
    line += pad('150.00000', 9, true);
    line += ' ';
    line += pad(' 30.00000', 9, true);
    line += ' '.repeat(57 - line.length);
    line += pad('10.000', 6, true);
    line += ' ';
    line += pad('10.500', 6, true);
    line += ' ';
    line += pad('11.000', 6, true);
    line += ' '.repeat(141 - line.length);
    line += '     '; // Riso blank (5 spaces)
    line += ' ';
    line += '     '; // Rext blank
    line += ' '.repeat(173 - line.length);
    line += pad(' 7000', 5, true);

    const { records } = parseTwoMrs(line);
    expect(records).toHaveLength(1);
    expect(records[0]!.diameterKpc).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run:

```
npx vitest run tests/parsers/twoMrs.test.ts
```

Expected: FAIL — either compile error from missing `diameterKpc`, or undefined value.

- [ ] **Step 4: Add `Riso` decoding + diameter conversion to `parseTwoMrs`**

In `/Users/rulkens/Development/js/skymap/tools/parsers/twoMrs.ts`:

1. Add a new import at the top of the file (next to the existing imports):

```ts
import { arcsecToKpc } from '../../src/utils/math/arcsecToKpc.js';
```

2. Add a new constant near `C_KM_S` (after the existing constant definitions):

```ts
/**
 * Hubble constant in km/s/Mpc used to convert 2MRS heliocentric velocity
 * (cz, km/s) into a comoving distance (Mpc) for the diameter calculation.
 * 70 is the project-wide convention — same value used by the renderer's
 * raDecZToCartesian helper, so the diameter math agrees with the world
 * positions out of the box.
 */
const H0_KM_S_PER_MPC = 70;
```

3. Inside the per-row loop, immediately _before_ the `records.push({...})` call (i.e. after the `jc` computation), insert:

```ts
// Riso (log10 of isophotal RADIUS in arcsec, K=20 mag/arcsec² isophote)
// sits at bytes 142-146 (1-based inclusive, half-open 141..146).  About
// 80 % of 2MRS rows carry it; the rest (mostly faint galaxies near the
// K=11.75 sample limit where the isophote fits poorly) have it blank.
// We treat blank/non-finite as "no measurement" and emit null — the
// build pipeline applies DEFAULT_GALAXY_DIAMETER_KPC = 30 in that case.
const risoStr = line.slice(141, 146).trim();
const riso = risoStr === '' ? NaN : parseFloat(risoStr);
let diameterKpc: number | null = null;
if (Number.isFinite(riso)) {
  // Riso is log10(arcsec-radius) — the radius is 10^Riso, the diameter
  // is 2× that, and we project to kpc using the cz-derived distance.
  const arcsecRadius = Math.pow(10, riso);
  const arcsecDiameter = 2 * arcsecRadius;
  const distanceMpc = cz / H0_KM_S_PER_MPC;
  // Local Group galaxies have negative cz — the resulting "negative
  // distance" is unphysical and would produce a nonsense diameter.
  // For those rows fall through to null and let the pipeline use the
  // 30 kpc default; the LG members M31/M33/etc are special-cased
  // enough that a real-distance lookup belongs in a future pass.
  if (distanceMpc > 0) {
    const kpc = arcsecToKpc(arcsecDiameter, distanceMpc);
    if (Number.isFinite(kpc) && kpc > 0) diameterKpc = kpc;
  }
}
```

4. Add `diameterKpc,` to the object literal pushed into `records` (next to `axisRatio` / `positionAngleDeg`).

- [ ] **Step 5: Run the test to verify it passes**

Run:

```
npx vitest run tests/parsers/twoMrs.test.ts
```

Expected: 2 PASS for the new tests, plus all pre-existing 2MRS tests still passing.

- [ ] **Step 6: Run the full parser test suite**

Run:

```
npx vitest run tests/parsers/
```

Expected: all parser tests pass — only 2MRS records gained a new field; SDSS and GLADE will still be missing it but their existing tests don't check for it yet.

- [ ] **Step 7: Commit**

```
cd /Users/rulkens/Development/js/skymap && git add tools/parsers/twoMrs.ts tests/parsers/twoMrs.test.ts && git commit -m "feat(parsers): decode 2MRS Riso into diameterKpc"
```

---

## Task 7: GLADE parser — extract Bmag, derive diameter via Tully

**Files:**

- Modify: `/Users/rulkens/Development/js/skymap/tools/parsers/glade.ts`
- Modify: `/Users/rulkens/Development/js/skymap/tests/parsers/glade.test.ts`

- [ ] **Step 1: Add a failing test**

Append to `/Users/rulkens/Development/js/skymap/tests/parsers/glade.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseGladeLine } from '../../tools/parsers/glade';

describe('parseGladeLine diameterKpc', () => {
  /**
   * Build a synthetic 256-byte GLADE line with Bmag = 14.0, z = 0.05.
   * At z = 0.05 the comoving distance is ≈ 214.3 Mpc (cz/H0 with cz=15000),
   * so the distance modulus 5·log10(d_pc/10) ≈ 5·log10(2.143e7) ≈ 36.66.
   * Apparent B = 14, so absolute B = 14 - 36.66 ≈ -22.66.
   * Tully: log10R = -0.249·(-22.66 + 21) + 1.366
   *       = -0.249·(-1.66) + 1.366 ≈ 0.413 + 1.366 ≈ 1.779
   * R = 10^1.779 ≈ 60 kpc, D ≈ 120 kpc.
   */
  it('derives diameterKpc from Bmag via Tully size-luminosity', () => {
    const pad = (s: string, w: number, left = false): string =>
      left ? s.padStart(w, ' ') : s.padEnd(w, ' ');
    let line = '';
    // Bytes 1-7: PGC (irrelevant for this test)
    line += pad('1', 7);
    // Bytes 8-103: name fields (sentinel ---)
    line += ' '.repeat(103 - line.length);
    // Byte 104: Flag1 = 'G'
    line = line.slice(0, 103) + 'G';
    // Byte 105: space
    line += ' ';
    // Bytes 106-123: RA (F18)
    line += pad('150.00000000000000', 18, true);
    // Byte 124: space
    line += ' ';
    // Bytes 125-144: Dec (F20)
    line += pad('  30.000000000000000', 20, true);
    // Pad to byte 173
    line += ' '.repeat(173 - line.length);
    // Bytes 174-191: z (E18.15) = 0.05
    line += pad('5.000000000000E-02', 18, true);
    // Byte 192: space
    line += ' ';
    // Bytes 193-198: Bmag (6w) = 14.000
    line += pad('14.000', 6, true);
    // Pad to byte 253
    line += ' '.repeat(253 - line.length);
    // Byte 254: Flag2 = '1' (z-derived distance, accepted)
    line += '1';
    // Pad to MIN_LINE_LEN 256
    line += ' '.repeat(256 - line.length);
    expect(line.length).toBe(256);

    const rec = parseGladeLine(line);
    expect(rec).not.toBeNull();
    // Tolerance ±5 kpc — covers small differences in the log/exp chain.
    expect(rec!.diameterKpc).toBeCloseTo(120, -1);
  });

  it('returns null diameterKpc when Bmag is the dash sentinel', () => {
    const pad = (s: string, w: number, left = false): string =>
      left ? s.padStart(w, ' ') : s.padEnd(w, ' ');
    let line = '';
    line += pad('1', 7);
    line += ' '.repeat(103 - line.length);
    line = line.slice(0, 103) + 'G';
    line += ' ';
    line += pad('150.00000000000000', 18, true);
    line += ' ';
    line += pad('  30.000000000000000', 20, true);
    line += ' '.repeat(173 - line.length);
    line += pad('5.000000000000E-02', 18, true);
    line += ' ';
    line += '------'; // Bmag dash sentinel
    line += ' '.repeat(253 - line.length);
    line += '1';
    line += ' '.repeat(256 - line.length);

    const rec = parseGladeLine(line);
    expect(rec).not.toBeNull();
    expect(rec!.diameterKpc).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```
npx vitest run tests/parsers/glade.test.ts
```

Expected: FAIL — `diameterKpc` is missing from records.

- [ ] **Step 3: Wire Tully into `parseGladeLine`**

In `/Users/rulkens/Development/js/skymap/tools/parsers/glade.ts`:

1. Add imports near the top:

```ts
import {
  galaxyDiameterKpc,
  DEFAULT_GALAXY_DIAMETER_KPC,
} from '../../src/utils/math/galaxyDiameterKpc.js';
import { absoluteMagnitude } from '../../src/utils/math/absoluteMagnitude.js';
```

Verify `absoluteMagnitude` exists. Run:

```
grep -l 'export function absoluteMagnitude' /Users/rulkens/Development/js/skymap/src/utils/math/absoluteMagnitude.ts
```

Expected: a single match. If the function name differs, adapt the import.

Open `/Users/rulkens/Development/js/skymap/src/utils/math/absoluteMagnitude.ts` and confirm the signature is `absoluteMagnitude(apparentMag: number, redshift: number): number`. If the signature differs, adapt the call below to match it (it computes M = m - 5·log10(d_pc/10) using H0=70 and small-z Hubble).

2. Inside `parseGladeLine`, after `bmag` is parsed but before `return { ... }`:

```ts
// GLADE doesn't carry a measured galaxy radius; instead we route the
// apparent B magnitude through the Tully (1988) size–luminosity relation
// to derive a sensible diameter.  Apparent B + redshift gives absolute
// B (via the project's `absoluteMagnitude` helper using H0 = 70), which
// then feeds `galaxyDiameterKpc({ absMagBmag })`.
//
// When Bmag is missing (dash sentinel → NaN), we emit null and let the
// build pipeline apply DEFAULT_GALAXY_DIAMETER_KPC.  Routing through
// `null` rather than `DEFAULT_GALAXY_DIAMETER_KPC` here keeps the
// "real measurement vs fallback" provenance visible at the parser
// boundary, mirroring how axisRatio + positionAngleDeg are handled.
let diameterKpc: number | null = null;
if (Number.isFinite(bmag)) {
  const absB = absoluteMagnitude(bmag, z);
  if (Number.isFinite(absB)) {
    const d = galaxyDiameterKpc({ absMagBmag: absB });
    // galaxyDiameterKpc returns the constant default when its input is
    // bad; we want to detect that case and emit null instead, so the
    // pipeline's default-application path runs uniformly for ALL "no
    // measurement" rows regardless of which parser produced them.
    if (d !== DEFAULT_GALAXY_DIAMETER_KPC) diameterKpc = d;
  }
}
```

3. Add `diameterKpc,` to the returned object literal.

- [ ] **Step 4: Run the test to verify it passes**

Run:

```
npx vitest run tests/parsers/glade.test.ts
```

Expected: all GLADE tests pass.

- [ ] **Step 5: Commit**

```
cd /Users/rulkens/Development/js/skymap && git add tools/parsers/glade.ts tests/parsers/glade.test.ts && git commit -m "feat(parsers): derive GLADE diameterKpc from Bmag via Tully"
```

---

## Task 8: SDSS parser — read `petroR50_r` (graceful when missing)

**Files:**

- Modify: `/Users/rulkens/Development/js/skymap/tools/parsers/sdssCsv.ts`
- Modify: `/Users/rulkens/Development/js/skymap/tests/parsers/sdssCsv.test.ts`

- [ ] **Step 1: Add a failing test for the new column**

Append to `/Users/rulkens/Development/js/skymap/tests/parsers/sdssCsv.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseSdssCsv } from '../../tools/parsers/sdssCsv';

describe('parseSdssCsv diameterKpc', () => {
  /**
   * SDSS petroR50_r is the Petrosian radius enclosing 50 % of the r-band
   * light, in arcseconds.  petroR90_r encloses 90 %.  D_25 (the visual
   * isophotal diameter) sits between the two; we approximate it as
   * 3 × petroR50_r diameter (i.e. 3 × 2 × petroR50_r), which empirically
   * brackets D_25 within ±20 % for the SDSS main-sample magnitude range.
   *
   * petroR90_r is closer to the visual edge but still slightly smaller
   * than D_25; we read both columns when present so a future Phase-2
   * refinement can swap the multiplier without re-touching the parser.
   *
   * Test row: petroR50_r = 5", z = 0.05 (≈214 Mpc) → diameter
   *   3 · 2 · 5 · arcsecToKpc(1, 214.3)
   *   = 30 · 4.848e-6 · 214300 ≈ 31.18 kpc
   */
  it('extracts diameterKpc from petroR50_r when the column is present', () => {
    const csv = [
      'objID,ra,dec,z,modelMag_u,modelMag_g,modelMag_r,modelMag_i,modelMag_z,expAB_r,expPhi_r,deVAB_r,deVPhi_r,fracDeV_r,petroR50_r,petroR90_r',
      '1,150.0,30.0,0.05,18,18,18,18,18,0.5,30,0.6,40,0.3,5.0,12.0',
    ].join('\n');
    const { records } = parseSdssCsv(csv);
    expect(records).toHaveLength(1);
    expect(records[0]!.diameterKpc).toBeCloseTo(31.18, 1);
  });

  it('returns null diameterKpc when petroR50_r column is absent', () => {
    const csv = [
      'objID,ra,dec,z,modelMag_u,modelMag_g,modelMag_r,modelMag_i,modelMag_z,expAB_r,expPhi_r,deVAB_r,deVPhi_r,fracDeV_r',
      '1,150.0,30.0,0.05,18,18,18,18,18,0.5,30,0.6,40,0.3',
    ].join('\n');
    const { records } = parseSdssCsv(csv);
    expect(records).toHaveLength(1);
    expect(records[0]!.diameterKpc).toBeNull();
  });

  it('returns null diameterKpc when petroR50_r cell is empty', () => {
    const csv = [
      'objID,ra,dec,z,modelMag_u,modelMag_g,modelMag_r,modelMag_i,modelMag_z,expAB_r,expPhi_r,deVAB_r,deVPhi_r,fracDeV_r,petroR50_r,petroR90_r',
      '1,150.0,30.0,0.05,18,18,18,18,18,0.5,30,0.6,40,0.3,,',
    ].join('\n');
    const { records } = parseSdssCsv(csv);
    expect(records).toHaveLength(1);
    expect(records[0]!.diameterKpc).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```
npx vitest run tests/parsers/sdssCsv.test.ts
```

Expected: 3 FAIL.

- [ ] **Step 3: Read `petroR50_r` optionally and convert to kpc**

In `/Users/rulkens/Development/js/skymap/tools/parsers/sdssCsv.ts`:

1. Add imports at the top (next to existing imports):

```ts
import { arcsecToKpc } from '../../src/utils/math/arcsecToKpc.js';
import { redshiftToDistanceMpc } from '../../src/utils/math/redshiftToDistanceMpc.js';
```

Verify `redshiftToDistanceMpc` exists with that name and signature `(z: number) => number`:

```
grep -n 'export function redshiftToDistanceMpc' /Users/rulkens/Development/js/skymap/src/utils/math/redshiftToDistanceMpc.ts
```

Expected: a single match. If the function name differs, adapt the import + call site.

2. After the existing `requireColumn` calls (just after `COL_FRAC_DEV`), add an OPTIONAL column lookup helper and read `petroR50_r`:

```ts
/**
 * Find the 0-based column index for an optional column.  Returns -1
 * when the column is absent — the caller branches on this so the parser
 * stays compatible with older SDSS CSVs that pre-date the new
 * `petroR50_r` / `petroR90_r` columns.
 */
const optionalColumn = (name: string): number => headers.indexOf(name.toLowerCase());

const COL_PETRO_R50 = optionalColumn('petroR50_r');
// We read petroR90 too so a future Phase-2 plan can refine the visual
// diameter approximation without re-touching the parser API.
const COL_PETRO_R90 = optionalColumn('petroR90_r');
```

3. Inside the per-row loop, just before the `records.push({...})` call, compute the diameter:

```ts
// ── Petrosian → physical diameter ──────────────────────────────────
//
// SDSS petroR50_r is the Petrosian half-light RADIUS in arcseconds.
// The visual D_25 isophote lies somewhere between petroR90_r diameter
// and a few half-light radii out; the empirical multiplier we use is
//
//   diameter_kpc ≈ 3 · 2 · petroR50_r · arcsecToKpc(1, distance_Mpc)
//
// i.e. treat 3× the half-light DIAMETER as a stand-in for D_25.  This
// brackets the true visual diameter within ±20 % across the SDSS
// main-sample magnitude range — enough for a renderer footprint.  A
// future plan can refine using petroR90 (closer to the visual edge)
// or a per-galaxy sersic-index calibration; the parser exposes
// diameterKpc as a single number to avoid leaking that decision.
let diameterKpc: number | null = null;
if (COL_PETRO_R50 !== -1) {
  const r50Str = cells[COL_PETRO_R50] ?? '';
  const r50 = r50Str === '' ? NaN : parseFloat(r50Str);
  if (Number.isFinite(r50) && r50 > 0) {
    const distanceMpc = redshiftToDistanceMpc(z);
    if (Number.isFinite(distanceMpc) && distanceMpc > 0) {
      const arcsecDiameter = 3 * 2 * r50;
      const kpc = arcsecToKpc(arcsecDiameter, distanceMpc);
      if (Number.isFinite(kpc) && kpc > 0) diameterKpc = kpc;
    }
  }
}
```

4. Add `diameterKpc,` to the `records.push({ ... })` literal.

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```
npx vitest run tests/parsers/sdssCsv.test.ts
```

Expected: all SDSS parser tests pass.

- [ ] **Step 5: Commit**

```
cd /Users/rulkens/Development/js/skymap && git add tools/parsers/sdssCsv.ts tests/parsers/sdssCsv.test.ts && git commit -m "feat(parsers): read SDSS petroR50_r into diameterKpc when present"
```

---

## Task 9: Build pipeline — apply default fallback + materialise into PointCloud

**Files:**

- Modify: `/Users/rulkens/Development/js/skymap/tools/buildAllBins.ts`
- Modify: `/Users/rulkens/Development/js/skymap/tools/crossMatch.ts` (only if it constructs ParsedRecord literals; verify first)

- [ ] **Step 1: Verify `crossMatch.ts` doesn't synthesise records**

Run:

```
grep -n 'diameterKpc\|axisRatio' /Users/rulkens/Development/js/skymap/tools/crossMatch.ts
```

Expected: no matches (cross-match passes records through, never constructs new ones). If matches appear, fix any literal constructions to include `diameterKpc: null` — but typecheck after Task 4 will already flag it.

- [ ] **Step 2: Update `recordsToCloud` in `buildAllBins.ts`**

Open `/Users/rulkens/Development/js/skymap/tools/buildAllBins.ts`. Add a new import near the top (next to the existing `fallbackOrientation` import):

```ts
import { DEFAULT_GALAXY_DIAMETER_KPC } from '../src/data/pointCloudFormat.js';
```

Wait — `DEFAULT_GALAXY_DIAMETER_KPC` lives in `galaxyDiameterKpc.ts`, not `pointCloudFormat.ts`. Use the correct path:

```ts
import { DEFAULT_GALAXY_DIAMETER_KPC } from '../src/utils/math/galaxyDiameterKpc.js';
```

In the `recordsToCloud` function, modify the cloud literal (the `const cloud: PointCloud = { ... }` block) to include the new array:

```ts
const cloud: PointCloud = {
  count,
  objIDs: new BigUint64Array(count),
  positions: new Float32Array(count * 3),
  magU: new Float32Array(count),
  magG: new Float32Array(count),
  magR: new Float32Array(count),
  magI: new Float32Array(count),
  magZ: new Float32Array(count),
  axisRatio: new Float32Array(count),
  positionAngleDeg: new Float32Array(count),
  diameterKpc: new Float32Array(count),
};
```

In the per-row fill loop (just after the orientation-fallback `if/else`), append:

```ts
// Diameter: prefer the parser-supplied real measurement (2MRS Riso,
// GLADE Tully(Bmag), SDSS petroR50_r).  When the parser couldn't
// extract a real value, fall back to DEFAULT_GALAXY_DIAMETER_KPC = 30
// so the encoded cloud always carries a finite, positive diameter.
//
// Why apply the fallback here rather than inside each parser?  Three
// reasons: (1) a single source-of-truth for the default value, (2)
// future Phase-2 plans (HyperLEDA logd25) can swap the fallback to a
// pgc-keyed lookup without touching every parser, and (3) the
// null/finite distinction at the parser boundary doubles as the
// provenance signal for the InfoCard's "real / Tully / fallback"
// chip in Task 14.
cloud.diameterKpc[i] =
  r.diameterKpc !== null && r.diameterKpc > 0 ? r.diameterKpc : DEFAULT_GALAXY_DIAMETER_KPC;
```

- [ ] **Step 3: Run typecheck and crossMatch tests**

Run:

```
cd /Users/rulkens/Development/js/skymap && npm run typecheck
```

Expected: clean. (If `crossMatch.ts` had record literals, typecheck would have flagged them; fix by adding `diameterKpc: null` and re-run.)

Run:

```
npx vitest run tests/crossMatch.test.ts
```

Expected: clean — typecheck-only changes here.

- [ ] **Step 4: Regenerate the .bin files**

Ensure SDSS, 2MRS, GLADE source files are at the standard paths (verify with `ls`). Then:

```
cd /Users/rulkens/Development/js/skymap && npm run build-all -- --sdss data/sdss_dr18.csv --twomrs data/raw/2mrs_table3.dat --glade data/raw/glade2.3.dat --out-dir public/data
```

Expected: stderr logs the per-source kept/dropped counts AND writes `sdss.bin`, `2mrs.bin`, `glade.bin` to `public/data/`. The 2MRS file should now be 16 + count × 64 bytes (vs the old 16 + count × 56) — confirm with `ls -l public/data/2mrs.bin` and dividing by 64.

- [ ] **Step 5: Commit (the regenerated .bins are typically gitignored — verify)**

Run:

```
cd /Users/rulkens/Development/js/skymap && git status public/data/
```

If the .bins show up as untracked / modified, check `.gitignore` to confirm whether they should be committed (project convention varies). Commit the build-pipeline change either way:

```
cd /Users/rulkens/Development/js/skymap && git add tools/buildAllBins.ts && git commit -m "feat(build): apply DEFAULT_GALAXY_DIAMETER_KPC fallback in recordsToCloud"
```

---

## Task 10: Vertex buffer extension — 10 slots / 40 bytes

**Files:**

- Modify: `/Users/rulkens/Development/js/skymap/src/services/gpu/pointRenderer.ts`

- [ ] **Step 1: Update layout constants**

In `/Users/rulkens/Development/js/skymap/src/services/gpu/pointRenderer.ts`, find the layout-constants block near the top of the class. Replace `SLOTS_PER_POINT = 9` with:

```ts
/**
 * Number of 4-byte slots packed per catalog point in the vertex buffer.
 *
 * Layout (matches the `PerVertex` struct in points.wgsl):
 *   [x f32, y f32, z f32,
 *    magnitude f32, colorIndex f32,
 *    globalInstanceIdx u32, kPerZ f32,
 *    axisRatio f32, positionAngleDeg f32,
 *    diameterKpc f32]
 *
 * Slot 9 (`diameterKpc`) carries the per-galaxy physical diameter in
 * kiloparsecs (v4 binary format).  The vertex shader uses it to size the
 * billboard's apparent radius — replacing the previous shader-side
 * GALAXY_RADIUS_MPC = 0.06 constant — so dwarfs render small and giants
 * render large.  4 extra bytes per instance is ~14 MB at 3.5 M points,
 * well within VRAM budget.
 */
const SLOTS_PER_POINT = 10;

/**
 * Byte stride: 10 slots × 4 bytes = 40 bytes.
 */
const POINT_STRIDE = SLOTS_PER_POINT * 4; // 40 bytes
```

After `POSITION_ANGLE_BYTE_OFFSET = 32`, add:

```ts
/**
 * Byte offset of the `diameterKpc` slot — physical disk diameter in kpc.
 *
 * Sits at slot index 9 (offset 36).  The vertex shader reads it to compute
 * the apparent angular radius `(diameterKpc / 1000 / 2) / distance_Mpc`
 * scaled to pixels, replacing the prior project-wide 0.06 Mpc constant.
 */
const DIAMETER_KPC_BYTE_OFFSET = 36;
```

- [ ] **Step 2: Add the new vertex attribute to the pipeline descriptor**

In the `vertex.buffers[0].attributes` array, append:

```ts
              // diameterKpc (f32) — offset 36 bytes.  Per-galaxy physical
              // diameter in kpc.  Drives apparent-size sizing in the vertex
              // shader.
              { shaderLocation: 7, offset: DIAMETER_KPC_BYTE_OFFSET, format: 'float32' },
```

- [ ] **Step 3: Write the new slot during upload**

In the `upload(source, cloud)` method, locate the per-row write loop. After the existing `interleaved[o + 8] = cloud.positionAngleDeg[i]!` line, append:

```ts
// Slot 9 (offset 36): per-galaxy diameter in kpc.  The build pipeline
// guarantees a finite, positive value (real measurement when the
// parser had one, otherwise DEFAULT_GALAXY_DIAMETER_KPC = 30), so we
// copy through with an `!` non-null assertion just like the other
// SoA fields above.
interleaved[o + 9] = cloud.diameterKpc[i]!;
```

- [ ] **Step 4: Run typecheck**

```
cd /Users/rulkens/Development/js/skymap && npm run typecheck
```

Expected: clean.

- [ ] **Step 5: Commit**

```
cd /Users/rulkens/Development/js/skymap && git add src/services/gpu/pointRenderer.ts && git commit -m "feat(gpu): extend point vertex buffer with diameterKpc slot"
```

---

## Task 11: WGSL — read `diameterKpc` per instance, replace `GALAXY_RADIUS_MPC` constant

**Files:**

- Modify: `/Users/rulkens/Development/js/skymap/src/services/gpu/shaders/points.wgsl`

- [ ] **Step 1: Add the new attribute to the `PerVertex` struct**

Open `/Users/rulkens/Development/js/skymap/src/services/gpu/shaders/points.wgsl`. In the `struct PerVertex { ... }` block, after `@location(6) positionAngleDeg: f32,`, add:

```wgsl
  // Per-galaxy physical diameter in kiloparsecs.  Drives the apparent-size
  // billboard radius below — a 100-kpc giant elliptical at 50 Mpc subtends
  // ~6× the angular footprint of a 30-kpc default disk, and the renderer
  // now reflects that.  v4 binary format guarantees a finite positive
  // value (real or DEFAULT_GALAXY_DIAMETER_KPC = 30 fallback) in every row.
  @location(7) diameterKpc: f32,
```

- [ ] **Step 2: Replace the constant with the per-instance lookup in `vs`**

Find the block in `vs` that defines `let GALAXY_RADIUS_MPC: f32 = 0.06;`. Replace that single line and the `apparentPxRadius` calculation with:

```wgsl
  // ── PER-GALAXY APPARENT-SIZE RADIUS ──────────────────────────────────────
  //
  // The radius in Mpc of a galaxy with diameter `p.diameterKpc`.  The 4×
  // multiplier matches the QuadRenderer's `sizeWorld = (dKpc/1000) * 4`
  // — a "padding factor" that gives the billboard visual presence around
  // the galaxy's body.  The thumbnail texture's visible content fills the
  // central ~25 % of the quad with a soft alpha-fade in the surrounding
  // tail; matching radii here keeps the soft glow and the textured disk
  // perfectly aligned at the texture-load fade-in moment.
  //
  // Formula: half-diameter × padding × kpc→Mpc:
  //
  //   radius_Mpc = (diameterKpc / 2) * 4 / 1000 = diameterKpc * 2 / 1000
  //
  // Algebraically simplified.  We guard against pathological zero/NaN
  // diameters (shouldn't happen post-pipeline, but a corrupted .bin
  // could deliver one) by clamping to the project default of 30 kpc.
  let safeDiameterKpc = select(30.0, p.diameterKpc, p.diameterKpc > 0.0);
  let GALAXY_RADIUS_MPC = safeDiameterKpc * 2.0 / 1000.0;
  let toGalaxy = p.position - u.camPosWorld;
  let distanceMpc = length(toGalaxy);
  let safeDist = max(distanceMpc, 0.001);
  let apparentPxRadius = (GALAXY_RADIUS_MPC / safeDist) * u.pxPerRad;
  let sizePx = max(u.pointSizePx, apparentPxRadius);
```

- [ ] **Step 3: Run the dev server in the background and visually inspect**

If `npm run dev` is not already running, start it:

```
cd /Users/rulkens/Development/js/skymap && npm run dev
```

Open http://localhost:5173 in the browser. Expected visual difference: galaxies of diverse diameters should now show varied billboard sizes — large nearby ellipticals should appear visibly bigger than tiny dwarfs at the same distance. Confirm the renderer doesn't throw a WGSL compile error in the console (look for any "validation error" entries).

- [ ] **Step 4: Run the full test suite to confirm nothing else broke**

```
cd /Users/rulkens/Development/js/skymap && npm test
```

Expected: every test passes (we didn't touch anything tested-by-fixture besides the format).

- [ ] **Step 5: Commit**

```
cd /Users/rulkens/Development/js/skymap && git add src/services/gpu/shaders/points.wgsl && git commit -m "feat(shader): drive point-billboard radius from per-instance diameterKpc"
```

---

## Task 12: Engine — replace constant `dKpc` with per-galaxy lookup

**Files:**

- Modify: `/Users/rulkens/Development/js/skymap/src/services/engine/engine.ts`

- [ ] **Step 1: Replace the per-frame constant with a per-galaxy read**

Open `/Users/rulkens/Development/js/skymap/src/services/engine/engine.ts`. Find the per-frame block beginning at the `if (galaxyTexturesEnabled && cam) {` branch (around line 905). Locate this section:

```ts
const fovYRad = cam.fovYRad;
const viewportH = canvas.height;
const pxPerRad = viewportH / (2 * Math.tan(fovYRad / 2));
const dKpc = galaxyDiameterKpc({}); // v1: constant 30 kpc
const dMpc = dKpc / 1000;
// A galaxy of this diameter at distance camDist is
// `dMpc / camDist * pxPerRad` pixels wide.  Inverting the
// ≥ APPARENT_SIZE_THRESHOLD_PX inequality:
//   camDist ≤ dMpc * pxPerRad / threshold
// which lets us cull on a single squared compare without sqrt.
const maxCamDistForVisibility = (dMpc * pxPerRad) / APPARENT_SIZE_THRESHOLD_PX;
const maxCamDistSq = maxCamDistForVisibility * maxCamDistForVisibility;
```

Replace it with:

```ts
const fovYRad = cam.fovYRad;
const viewportH = canvas.height;
const pxPerRad = viewportH / (2 * Math.tan(fovYRad / 2));

// ── Per-galaxy diameters now live on the cloud ─────────────────────────
//
// v3 of this loop hoisted a single `dKpc = galaxyDiameterKpc({})` (the
// project-wide 30 kpc placeholder) and pre-computed a single
// `maxCamDistSq` from it.  v4 uses per-galaxy `cloud.diameterKpc[i]`,
// which means the visibility threshold varies per row — a 100-kpc giant
// stays visible 3× farther than a 30-kpc disk.  We pre-compute a UPPER
// BOUND `maxCamDistSqUpper` from the largest plausible diameter so the
// cheap squared-distance early-out still culls the absolute majority of
// far-away rows; the precise per-galaxy threshold is then re-checked
// after the sqrt.
//
// Why an upper bound rather than the per-row threshold?  Because the
// outer cull happens BEFORE we read cloud.diameterKpc[i] — pulling that
// read forward would defeat the cache-friendly tight loop.  The bound
// keeps the squared-compare path identical for the 99 % of rows we drop
// without touching memory.
const MAX_PLAUSIBLE_DIAMETER_KPC = 200; // generous: covers giant ellipticals
const dMpcMax = MAX_PLAUSIBLE_DIAMETER_KPC / 1000;
const maxCamDistForVisibilityUpper = (dMpcMax * pxPerRad) / APPARENT_SIZE_THRESHOLD_PX;
const maxCamDistSqUpper = maxCamDistForVisibilityUpper * maxCamDistForVisibilityUpper;
```

- [ ] **Step 2: Replace the per-row apparent-size check and `sizeWorldMpc`**

In the inner loop (still inside `if (galaxyTexturesEnabled && cam)`), find:

```ts
const camDistSq = dx * dx + dy * dy + dz * dz;
if (camDistSq <= 0 || camDistSq > maxCamDistSq) continue;

// Galaxy is close enough to qualify; now pay for the sqrt
// and exact apparent-size formula on this small subset.
const camDist = Math.sqrt(camDistSq);
const px = (dMpc / camDist) * pxPerRad;
if (px < APPARENT_SIZE_THRESHOLD_PX) continue;
```

Replace with:

```ts
const camDistSq = dx * dx + dy * dy + dz * dz;
if (camDistSq <= 0 || camDistSq > maxCamDistSqUpper) continue;

// We're in the cheap-cull-survivor set; pay for the per-galaxy diameter
// read + sqrt + exact apparent-size compare.
const dKpcRow = cloud.diameterKpc[i]!;
const dMpcRow = dKpcRow / 1000;
const camDist = Math.sqrt(camDistSq);
const px = (dMpcRow / camDist) * pxPerRad;
if (px < APPARENT_SIZE_THRESHOLD_PX) continue;
```

Then locate the line:

```ts
const sizeWorldMpc = (dKpc / 1000) * 4;
```

Replace with:

```ts
// 4× the per-galaxy diameter gives the quad/disk world-space footprint.
// Same multiplier as before (matches `GALAXY_RADIUS_MPC` in points.wgsl)
// so the soft-glow point and the textured thumbnail occupy identical
// screen real-estate at the moment the bitmap finishes loading.
const sizeWorldMpc = (dKpcRow / 1000) * 4;
```

- [ ] **Step 3: Confirm `galaxyDiameterKpc` import is still used or remove it**

The constant-call `galaxyDiameterKpc({})` is gone. Run:

```
grep -n 'galaxyDiameterKpc' /Users/rulkens/Development/js/skymap/src/services/engine/engine.ts
```

If only the import remains, remove it from the import statement. Update the comment block above the per-frame loop so it no longer references "single-diameter assumption".

- [ ] **Step 4: Typecheck and visual smoke test**

```
cd /Users/rulkens/Development/js/skymap && npm run typecheck && npm test
```

Expected: typecheck clean, tests pass.

Visual check via the running dev server: zoom toward a known giant elliptical (e.g. M87 if 2MRS-loaded). Its thumbnail quad should now appear noticeably larger than a typical dwarf at the same distance.

- [ ] **Step 5: Commit**

```
cd /Users/rulkens/Development/js/skymap && git add src/services/engine/engine.ts && git commit -m "feat(engine): drive thumbnail/disk size from per-galaxy diameterKpc"
```

---

## Task 13: Focus tween — per-galaxy distance

**Files:**

- Modify: `/Users/rulkens/Development/js/skymap/src/services/engine/focusTween.ts`
- Modify: `/Users/rulkens/Development/js/skymap/src/services/engine/engine.ts` (call site at line ~1360)

- [ ] **Step 1: Make `focusDistanceMpc` accept a diameter**

Replace `/Users/rulkens/Development/js/skymap/src/services/engine/focusTween.ts` with:

```ts
/**
 * focusTween — constants and helpers for the focus-on-galaxy camera tween.
 *
 * The engine offers two camera tweens — `focusOn(worldXYZ, diameterKpc)` and
 * `focusOnHome()` — both sharing a 600 ms duration and, for `focusOn`, a
 * target distance derived from the galaxy's physical diameter.
 *
 * Why expose the diameter as an argument now?  Earlier versions used a
 * project-wide 30 kpc placeholder, which framed dwarfs too far away (the
 * camera looked like it had stopped short) and giants too close (the
 * camera ended up inside the disk).  v4 binary format gives every galaxy
 * its real diameter; this helper now accepts it so the framing matches
 * each galaxy's actual size.
 */

/**
 * Tween duration for focus / home camera moves, in milliseconds.
 *
 * 600 ms is the sweet spot: long enough to read as motion, short enough to
 * stay snappy when clicking through the InfoCard list.
 */
export const FOCUS_TWEEN_MS = 600;

/** Convert kpc → Mpc. */
const KPC_PER_MPC = 1000;

/**
 * Focus distance multiplier — how many galaxy diameters away we sit.
 * 4× a 30 kpc disk = 120 kpc = 0.12 Mpc — a "see the whole galaxy with a
 * little space around it" framing that scales naturally with diameter.
 */
const FOCUS_DIAMETER_MULTIPLIER = 4;

/**
 * Compute the focus-tween target distance for a galaxy of the given
 * physical diameter.
 *
 * Returns 0.12 Mpc (4 × 30 kpc) when `diameterKpc` is missing or non-finite,
 * matching the prior placeholder constant exactly.  Callers without a
 * diameter on hand can simply omit the argument.
 */
export function focusDistanceMpc(diameterKpc?: number): number {
  const FALLBACK_KPC = 30;
  const d =
    diameterKpc !== undefined && Number.isFinite(diameterKpc) && diameterKpc > 0
      ? diameterKpc
      : FALLBACK_KPC;
  return (FOCUS_DIAMETER_MULTIPLIER * d) / KPC_PER_MPC;
}
```

- [ ] **Step 2: Update the engine call site**

Open `/Users/rulkens/Development/js/skymap/src/services/engine/engine.ts`. Find the `focusDistanceMpc()` call near line 1360 — it sits inside a `focusOn` tween-trigger block. The surrounding code already has access to the cloud and the selected index (the same code path that computes `info` for the InfoCard). Capture the diameter into a local and pass it:

```ts
// Look up the selected galaxy's diameter so the camera frames it at the
// right distance.  When the cloud or index is unavailable, fall back to
// the no-arg form (which yields 0.12 Mpc — the prior constant).
let selectedDiameterKpc: number | undefined;
if (selectedCloud && selectedLocalIdx !== undefined) {
  const d = selectedCloud.diameterKpc[selectedLocalIdx];
  if (d !== undefined && Number.isFinite(d) && d > 0) {
    selectedDiameterKpc = d;
  }
}
// ... existing code ...
toDistance: focusDistanceMpc(selectedDiameterKpc),
```

Note: the local variable names (`selectedCloud`, `selectedLocalIdx`) reflect what's already in scope at this call site. Verify by reading the surrounding 30 lines first; if the variables differ, adapt the names but keep the lookup pattern.

- [ ] **Step 3: Typecheck**

```
cd /Users/rulkens/Development/js/skymap && npm run typecheck
```

Expected: clean. If the existing `focusDistanceMpc()` is called from anywhere besides engine.ts (search to confirm), update those call sites to either pass a diameter or rely on the new optional-argument default:

```
grep -rn 'focusDistanceMpc' /Users/rulkens/Development/js/skymap/src /Users/rulkens/Development/js/skymap/tests
```

Each match must compile cleanly because the argument is optional.

- [ ] **Step 4: Visual smoke**

Click a couple of distinct-size galaxies in the running app. The dwarf should leave the camera farther from its disk than the giant — the framing should look "consistent" rather than "everything ends up at the same distance regardless of size".

- [ ] **Step 5: Commit**

```
cd /Users/rulkens/Development/js/skymap && git add src/services/engine/focusTween.ts src/services/engine/engine.ts && git commit -m "feat(focus): derive focusDistanceMpc from per-galaxy diameter"
```

---

## Task 14: InfoCard — show diameter + provenance

**Files:**

- Modify: `/Users/rulkens/Development/js/skymap/src/services/engine/pointInfoBuilder.ts`
- Modify: `/Users/rulkens/Development/js/skymap/src/components/InfoCard.tsx` (or whatever the InfoCard file is — verify)

- [ ] **Step 1: Confirm the InfoCard file path**

```
ls /Users/rulkens/Development/js/skymap/src/components/
```

Expected: an `InfoCard.tsx`. If it lives elsewhere, adapt the path below.

- [ ] **Step 2: Extend `pointInfoBuilder` to surface diameter + provenance**

Open `/Users/rulkens/Development/js/skymap/src/services/engine/pointInfoBuilder.ts`. Locate the `PointInfo` (or similarly named) result type. Add two fields:

```ts
/**
 * Physical diameter in kiloparsecs as encoded in the v4 .bin.  Always
 * finite (the build pipeline applies DEFAULT_GALAXY_DIAMETER_KPC = 30
 * when the parser couldn't extract a real value).  The renderer's
 * apparent-size, focus-tween, and quad-size code all consume the same
 * field, so what the user sees here is what the GPU is actually using.
 */
diameterKpc: number;
/**
 * Provenance tag describing where the diameter came from.  Three values:
 *   - 'measured' — real catalog measurement (2MRS Riso, SDSS petroR50_r)
 *   - 'tully'    — derived via Tully(1988) from absolute B-mag (GLADE)
 *   - 'fallback' — no real signal; project-wide 30 kpc default
 *
 * The v4 binary format does NOT carry this provenance flag (it was
 * cheaper to recover it heuristically here than to bump the format
 * again), so we infer it: equality with DEFAULT_GALAXY_DIAMETER_KPC
 * means fallback; GLADE rows are 'tully' (their parser routes Bmag
 * through the Tully relation); SDSS/2MRS rows whose diameter differs
 * from the default are 'measured'.
 */
diameterProvenance: 'measured' | 'tully' | 'fallback';
```

In the function body, after the orientation lookups, populate the two new fields. The `Source` and per-galaxy `cloud.diameterKpc[i]` are already in scope:

```ts
import { DEFAULT_GALAXY_DIAMETER_KPC } from '../../utils/math/galaxyDiameterKpc';
import { Source } from '../../data/sources';
// ... existing imports ...

const diameterKpc = cloud.diameterKpc[localIdx]!;
// Provenance heuristic — see field doc above for the rationale.
let diameterProvenance: 'measured' | 'tully' | 'fallback';
// f32 round-trip: any path that wrote DEFAULT_GALAXY_DIAMETER_KPC = 30
// produced exactly the f32 representation of 30.0, so the equality test
// is reliable without an epsilon.
const FALLBACK_F32 = new Float32Array([DEFAULT_GALAXY_DIAMETER_KPC])[0]!;
if (diameterKpc === FALLBACK_F32) {
  diameterProvenance = 'fallback';
} else if (source === Source.Glade) {
  diameterProvenance = 'tully';
} else {
  diameterProvenance = 'measured';
}
// ... when constructing the returned info object ...
return {
  // ... existing fields ...
  diameterKpc,
  diameterProvenance,
};
```

Note: `localIdx` and `source` are illustrative variable names. Read the surrounding 50 lines first and use the names actually present in the function — likely `i` and a parameter named `source` or similar.

- [ ] **Step 3: Render the diameter row in `InfoCard.tsx`**

Open `/Users/rulkens/Development/js/skymap/src/components/InfoCard.tsx`. Find the existing `<dl>` (or equivalent) where galaxy properties are listed. Add a new row below the orientation row:

```tsx
{/*
  Diameter row.  The provenance chip lets the user distinguish "we measured
  this" from "we estimated it" from "we have no real signal" — important
  for understanding why two galaxies of the same apparent magnitude render
  at very different sizes.
*/}
<dt>Diameter</dt>
<dd>
  {info.diameterKpc.toFixed(1)} kpc{' '}
  <span
    style={{
      fontSize: '0.85em',
      opacity: 0.7,
      marginLeft: '0.5em',
    }}
    title={
      info.diameterProvenance === 'measured'
        ? 'Real catalog measurement (2MRS Riso or SDSS petroR50_r)'
        : info.diameterProvenance === 'tully'
          ? 'Estimated from absolute B-mag via Tully (1988)'
          : 'No measurement; using project default of 30 kpc'
    }
  >
    ({info.diameterProvenance})
  </span>
</dd>
```

If the InfoCard uses a different markup convention, adapt to match — the only requirement is that the diameter and provenance both render visibly.

- [ ] **Step 4: Typecheck and visual check**

```
cd /Users/rulkens/Development/js/skymap && npm run typecheck && npm test
```

Expected: clean.

Click any galaxy in the running dev server. The InfoCard should show a "Diameter: X kpc (provenance)" row. Click galaxies from each survey to verify all three provenance values appear at least once.

- [ ] **Step 5: Commit**

```
cd /Users/rulkens/Development/js/skymap && git add src/services/engine/pointInfoBuilder.ts src/components/InfoCard.tsx && git commit -m "feat(ui): show per-galaxy diameter + provenance in InfoCard"
```

---

## Task 15: Visual verification + final test sweep

**Files:** none (verification only)

- [ ] **Step 1: Full clean test run**

```
cd /Users/rulkens/Development/js/skymap && npm run typecheck && npm test
```

Expected: typecheck clean, every test passes (target ≥ 191/191; new tests bring the total higher).

- [ ] **Step 2: Build to confirm Vite production path**

```
cd /Users/rulkens/Development/js/skymap && npm run build
```

Expected: clean exit, `dist/` populated.

- [ ] **Step 3: Re-run the data pipeline end-to-end as a smoke test**

```
cd /Users/rulkens/Development/js/skymap && npm run build-all -- --sdss data/sdss_dr18.csv --twomrs data/raw/2mrs_table3.dat --glade data/raw/glade2.3.dat --out-dir public/data
```

Expected: stderr reports a coherent `loaded N records (skipped M)` line per source, then `wrote N points to public/data/X.bin (B bytes)` lines whose byte count satisfies `B === 16 + N * 64`.

Spot-check the math:

```
ls -l /Users/rulkens/Development/js/skymap/public/data/2mrs.bin
```

Take the file size, subtract 16, divide by 64 — must yield an integer matching the count printed during the build.

- [ ] **Step 4: Visual checklist in the running dev server**

Open the running app at http://localhost:5173 (started in Task 11 step 3). Verify:

- [ ] Galaxies render at visibly diverse billboard sizes (not all the same).
- [ ] At least one giant elliptical from 2MRS (M87 / NGC 1316 / etc) appears noticeably bigger than nearby spirals.
- [ ] Clicking a galaxy zooms the camera to a distance proportional to its size — small galaxies frame closer, giants frame farther.
- [ ] InfoCard shows a Diameter row with one of the three provenance tags.
- [ ] No WGSL validation errors, no NaN-rendering artifacts (pure-black billboards), no missing thumbnails.

If any item fails, STOP and debug before continuing.

- [ ] **Step 5: Commit (if any small fixes were needed)**

If steps 1-4 produced no fixes, no commit needed — close out the plan. If they did, commit with:

```
cd /Users/rulkens/Development/js/skymap && git commit -am "fix: address verification findings for galaxy real-sizes pipeline"
```

---

## Self-Review

**1. Spec coverage**

- 2MRS Riso → Task 6 ✓
- GLADE Bmag → Tully → Task 7 ✓
- SDSS petroR50_r (graceful when missing) → Task 8 ✓
- HyperLEDA logd25 deferred to Phase-2 (no task here, called out in Task 0 step 3 + plan goal) ✓
- Format v4 (encode/decode + tests, reject v1/v2/v3) → Task 5 ✓
- ParsedRecord + PointCloud type extensions → Task 4 ✓
- galaxyDiameterKpc Tully + arcsecToKpc helper → Tasks 2 + 3 ✓
- Build pipeline applies DEFAULT_GALAXY_DIAMETER_KPC fallback → Task 9 ✓
- Vertex buffer 10 slots / 40 bytes → Task 10 ✓
- WGSL `PerVertex.diameterKpc` + replace `GALAXY_RADIUS_MPC` constant → Task 11 ✓
- Engine replaces constant `dKpc` with per-galaxy lookup; QuadInstance/DiskInstance untouched (already carry per-instance sizeWorld) → Task 12 ✓
- Focus tween becomes per-galaxy → Task 13 ✓
- InfoCard "Diameter" row + provenance chip → Task 14 ✓
- Visual verification step → Task 15 ✓
- User data prep (SkyServer SQL with petroR50_r) → Task 1 ✓

**2. Placeholder scan**

No "TBD", no "TODO", no "implement later", no "add appropriate error handling", no "similar to Task N", no "write tests for the above" without code. Every step has its actual content.

**3. Type consistency**

- `diameterKpc: number | null` in `ParsedRecord` (Task 4) — matches the assignments in Tasks 6, 7, 8.
- `diameterKpc: Float32Array` in `PointCloud` (Task 4) — matches the constructor in Task 9 (`new Float32Array(count)`) and the encoder/decoder in Task 5.
- `DEFAULT_GALAXY_DIAMETER_KPC` is exported from `galaxyDiameterKpc.ts` (Task 3) and imported in Tasks 7, 9, 14.
- `arcsecToKpc(arcsec, distanceMpc)` (Task 2) — same call signature in Tasks 6 and 8.
- `galaxyDiameterKpc({ absMagBmag })` (Task 3) — same call signature in Task 7.
- `focusDistanceMpc(diameterKpc?: number)` (Task 13) — optional argument keeps existing call sites compiling.
- `SLOTS_PER_POINT = 10`, `POINT_STRIDE = 40`, `DIAMETER_KPC_BYTE_OFFSET = 36` (Task 10) — match `@location(7) diameterKpc` in Task 11 (offset 36 = slot 9 × 4).
- InfoCard provenance values `'measured' | 'tully' | 'fallback'` consistent between `pointInfoBuilder.ts` field type and the InfoCard.tsx `title` switch (Task 14).

No naming drift detected.
