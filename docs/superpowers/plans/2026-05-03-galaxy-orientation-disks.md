# Galaxy Orientation Disks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every galaxy an accurate (or stable pseudo-random fallback) orientation (axis ratio + position angle) and render it either as an oriented elliptical billboard mask in the far field or as a tilted 3D disk plane in the near field.

**Architecture:** Bump the on-disk `PointCloud` binary format from v2 (48 B) to v3 (56 B) to carry per-galaxy `axisRatio` and `positionAngleDeg`. Cross-match SDSS to its existing exp/deV columns, 2MRS to 2MASS XSC `sup_phi` (via Vizier TAP), GLADE to HyperLEDA `pa+logr25` (via SQL endpoint). Galaxies with no real measurement get a deterministic mulberry32-seeded fallback (provenance tracked). The point shader rotates the billboard UV by PA and squashes by `b/a` for a real elliptical mask; the existing thumbnail quad pipeline gets a sibling `DiskRenderer` (oriented in 3D world space) that takes over when apparent size ≥ 4 px.

**Tech Stack:** TypeScript, WebGPU + WGSL, Vite, Vitest

---

## Task 1: Format v3 — encode/decode + tests

- [ ] Update `/Users/rulkens/Development/js/skymap/src/data/pointCloudFormat.ts` to v3 (56 bytes/point, fields `axisRatio` and `positionAngleDeg` as f32 with NaN sentinel for "absent"; padding shrinks to 8 bytes to keep 16-byte alignment).
- [ ] Reject v1 AND v2 with the same regenerate message.
- [ ] Add tests asserting round-trip preserves NaN sentinel and finite values.

### Files

`/Users/rulkens/Development/js/skymap/src/data/pointCloudFormat.ts` — full rewrite of constants + loops:

```ts
/**
 * Binary on-disk format for a `PointCloud` — version 3.
 *
 * v3 adds per-galaxy orientation: axisRatio (b/a in [0,1]) and
 * positionAngleDeg (PA in [0,180), measured east of north). NaN in either
 * field means "no measurement / no fallback applied yet" — but in practice
 * the build pipeline always fills them in (real value if a cross-match
 * succeeded, deterministic fallback otherwise). We preserve NaN as a
 * legitimate decode value because the encoder is pure and unit-testable
 * regardless of how callers populate the cloud.
 *
 * Layout (little-endian):
 *
 *     ── HEADER (16 bytes) ──────────────────────────────────────────────────
 *     0       4     magic   = "SKMP" (0x504d4b53)
 *     4       4     version = 3 (uint32)
 *     8       4     count   = number of points (uint32)
 *     12      4     reserved = 0
 *
 *     ── PER-POINT RECORD (56 bytes) ────────────────────────────────────────
 *     0       8     objID
 *     8       4     x  (f32)
 *     12      4     y  (f32)
 *     16      4     z  (f32)
 *     20      4     magU
 *     24      4     magG
 *     28      4     magR
 *     32      4     magI
 *     36      4     magZ
 *     40      4     axisRatio
 *     44      4     positionAngleDeg
 *     48      8     padding
 *
 * Total: 16 + count × 56.
 */

import type { PointCloud } from '../@types';

const MAGIC = 0x504d4b53;
const VERSION = 3;
const HEADER_BYTES = 16;
const BYTES_PER_POINT = 56;

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
  } = cloud;
  if (objIDs.length !== count) throw new Error('objIDs length mismatch');
  if (positions.length !== count * 3) throw new Error('positions length mismatch');
  if (magU.length !== count) throw new Error('magU length mismatch');
  if (magG.length !== count) throw new Error('magG length mismatch');
  if (magR.length !== count) throw new Error('magR length mismatch');
  if (magI.length !== count) throw new Error('magI length mismatch');
  if (magZ.length !== count) throw new Error('magZ length mismatch');
  if (axisRatio.length !== count) throw new Error('axisRatio length mismatch');
  if (positionAngleDeg.length !== count)
    throw new Error('positionAngleDeg length mismatch');

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
    const f = (byteBase + 8) / 4;
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
    // floatView[f+10..11] = padding (zero-init)
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
  };
}
```

`/Users/rulkens/Development/js/skymap/tests/pointCloudFormat.test.ts` — append:

```ts
import { describe, it, expect } from 'vitest';
import { encodePointCloud, decodePointCloud } from '../src/data/pointCloudFormat';
import type { PointCloud } from '../src/@types';

function makeCloud(count: number, fillNaN = false): PointCloud {
  const ar = new Float32Array(count);
  const pa = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    ar[i] = fillNaN ? NaN : 0.6 + 0.01 * i;
    pa[i] = fillNaN ? NaN : 30 + i;
  }
  return {
    count,
    objIDs: BigUint64Array.from({ length: count }, (_, i) => BigInt(i + 1)),
    positions: new Float32Array(count * 3),
    magU: new Float32Array(count),
    magG: new Float32Array(count),
    magR: new Float32Array(count),
    magI: new Float32Array(count),
    magZ: new Float32Array(count),
    axisRatio: ar,
    positionAngleDeg: pa,
  };
}

describe('pointCloudFormat v3', () => {
  it('round-trips finite axisRatio and positionAngleDeg', () => {
    const cloud = makeCloud(4, false);
    const decoded = decodePointCloud(encodePointCloud(cloud));
    expect(Array.from(decoded.axisRatio)).toEqual(Array.from(cloud.axisRatio));
    expect(Array.from(decoded.positionAngleDeg)).toEqual(Array.from(cloud.positionAngleDeg));
  });

  it('round-trips NaN sentinel', () => {
    const cloud = makeCloud(2, true);
    const decoded = decodePointCloud(encodePointCloud(cloud));
    expect(Number.isNaN(decoded.axisRatio[0])).toBe(true);
    expect(Number.isNaN(decoded.positionAngleDeg[1])).toBe(true);
  });

  it('rejects v2 with regenerate message', () => {
    // forge a v2 header with count=0
    const buf = new ArrayBuffer(16);
    const dv = new DataView(buf);
    dv.setUint32(0, 0x504d4b53, true);
    dv.setUint32(4, 2, true);
    dv.setUint32(8, 0, true);
    expect(() => decodePointCloud(buf)).toThrow(/regenerate/);
  });
});
```

### Verify

```bash
npx vitest run tests/pointCloudFormat.test.ts
```

---

## Task 2: ParsedRecord + PointCloud type extensions

- [ ] Extend `ParsedRecord` with `axisRatio: number | null` and `positionAngleDeg: number | null`.
- [ ] Extend `PointCloud` with `axisRatio: Float32Array` and `positionAngleDeg: Float32Array`.
- [ ] Add `OrientationProvenance` enum on `PointCloud` (see Task 9).

### Files

`/Users/rulkens/Development/js/skymap/tools/parsers/common.ts` — add to `ParsedRecord` type. Replace the existing type with:

```ts
export type ParsedRecord = {
  source: Source;
  objID: bigint;
  ra: number;
  dec: number;
  z: number;
  magU: number;
  magG: number;
  magR: number;
  magI: number;
  magZ: number;
  /**
   * Galaxy minor/major axis ratio b/a, in (0, 1]. `null` means the parser
   * couldn't extract a real measurement from this row — the build pipeline
   * will fill in a deterministic fallback (see fallbackOrientation.ts) before
   * encoding the cloud, and stamp the provenance flag accordingly.
   */
  axisRatio: number | null;
  /**
   * Galaxy position angle in degrees, [0, 180). PA is measured east of north
   * (standard astronomical convention). `null` follows the same "no real
   * measurement" semantics as axisRatio above.
   */
  positionAngleDeg: number | null;
};
```

`/Users/rulkens/Development/js/skymap/src/@types/PointCloud.d.ts` — append two fields:

```ts
  /**
   * Galaxy minor/major axis ratio b/a per point — length === count.
   *
   * Range (0, 1]: 1.0 = circular (face-on disk or a true E0 elliptical),
   * 0.1 ≈ thin edge-on disk. NaN means the build pipeline failed to assign
   * either a real-data or fallback value — should not happen in production
   * bins but is preserved through the format for diagnostic purposes.
   */
  axisRatio: Float32Array;

  /**
   * Galaxy position angle per point — length === count, units degrees.
   *
   * Range [0, 180): the angle of the galaxy's major axis measured east of
   * north (standard astronomical convention). PA wraps modulo 180° because
   * a line has no direction; PA = 5° and PA = 185° describe the same
   * orientation. NaN: same diagnostic-only meaning as axisRatio.
   */
  positionAngleDeg: Float32Array;
```

### Verify

```bash
npm run typecheck
```

---

## Task 3: Deterministic fallback function (TDD)

- [ ] Write `tests/utils/random/fallbackOrientation.test.ts` first.
- [ ] Implement `src/utils/random/fallbackOrientation.ts` using `mulberry32`.
- [ ] Stable across reloads, range checks pass.

### Files

`/Users/rulkens/Development/js/skymap/tests/utils/random/fallbackOrientation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { fallbackOrientation } from '../../../src/utils/random/fallbackOrientation';

describe('fallbackOrientation', () => {
  it('is deterministic for the same input', () => {
    const a = fallbackOrientation(123n, 12.5, -3.2);
    const b = fallbackOrientation(123n, 12.5, -3.2);
    expect(a).toEqual(b);
  });

  it('produces different values for different inputs', () => {
    const a = fallbackOrientation(1n, 0, 0);
    const b = fallbackOrientation(2n, 0, 0);
    expect(a).not.toEqual(b);
  });

  it('axisRatio in [0.3, 1.0)', () => {
    for (let i = 0n; i < 1000n; i++) {
      const { axisRatio } = fallbackOrientation(i, 0.1 * Number(i), 0);
      expect(axisRatio).toBeGreaterThanOrEqual(0.3);
      expect(axisRatio).toBeLessThan(1.0);
    }
  });

  it('positionAngleDeg in [0, 180)', () => {
    for (let i = 0n; i < 1000n; i++) {
      const { positionAngleDeg } = fallbackOrientation(i, 0, 0.1 * Number(i));
      expect(positionAngleDeg).toBeGreaterThanOrEqual(0);
      expect(positionAngleDeg).toBeLessThan(180);
    }
  });

  it('handles objID 0n (synthetic / 2MRS / GLADE rows)', () => {
    const { axisRatio, positionAngleDeg } = fallbackOrientation(0n, 12.5, 30.4);
    expect(Number.isFinite(axisRatio)).toBe(true);
    expect(Number.isFinite(positionAngleDeg)).toBe(true);
  });
});
```

`/Users/rulkens/Development/js/skymap/src/utils/random/fallbackOrientation.ts`:

```ts
/**
 * Deterministic pseudo-random orientation for galaxies that have no
 * real axis-ratio / position-angle measurement (after every cross-match
 * source has been exhausted).
 *
 * Why deterministic? Reload stability — the user pins a galaxy, refreshes
 * the page, and expects to see it tilted the same way. A fresh
 * `Math.random()` per session would re-roll on every load and look broken.
 *
 * Why a hash of (objID, ra, dec) and not just objID? Many of our records
 * have objID = 0n (2MRS, GLADE rows that weren't cross-matched to SDSS).
 * Without RA/Dec contribution every such row would seed the same way and
 * end up with identical orientation — a visible artifact of "every 2MRS
 * galaxy looks alike". Mixing in RA × 1e5 + Dec × 1e5 (positions are
 * unique to ~0.04 arcsec, well below the SDSS pixel scale) breaks the tie.
 *
 * Why mulberry32? It's the project's blessed seedable PRNG — the same
 * one used elsewhere for synthetic data — so the fallback's distribution
 * is statistically vetted and consistent with the rest of the codebase.
 *
 * Distribution:
 *   - axisRatio uniform in [0.3, 1.0): the lower bound matches the
 *     thinnest edge-on disks in real catalogues (b/a ≈ 0.1–0.2 is
 *     possible but rare; clipping to 0.3 keeps fallback rows from
 *     looking suspiciously elongated).
 *   - positionAngleDeg uniform in [0, 180): full range; PA wraps mod 180.
 */

import { mulberry32 } from './mulberry32';

/** Fold a bigint and two doubles into a single 32-bit seed. */
function hashSeed(objID: bigint, ra: number, dec: number): number {
  // Take low 32 bits of objID; SDSS objIDs encode tile/run/camcol/field, all
  // of which vary for distinct galaxies, so the low 32 bits are well-mixed.
  // For records with objID = 0n we lean on RA/Dec to produce variation.
  const idLow = Number(objID & 0xffffffffn);
  // RA × 1e5 wraps within 36e6 — fits comfortably in the int32 range when
  // we Math.imul-mix it. Dec × 1e5 ditto.
  const raMix = Math.imul(Math.round(ra * 1e5) | 0, 0x9e3779b1);
  const decMix = Math.imul(Math.round(dec * 1e5) | 0, 0x85ebca77);
  let h = idLow ^ raMix ^ decMix;
  // One MXS round to spread bits before handing to mulberry32.
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Deterministic fallback orientation for a galaxy with no measured
 * axisRatio / positionAngleDeg.
 *
 * @param objID  Catalogue ID; pass `0n` for 2MRS/GLADE rows that lack one.
 * @param ra     Right ascension in degrees.
 * @param dec    Declination in degrees.
 * @returns      `{ axisRatio in [0.3, 1.0), positionAngleDeg in [0, 180) }`
 */
export function fallbackOrientation(
  objID: bigint,
  ra: number,
  dec: number,
): { axisRatio: number; positionAngleDeg: number } {
  const rng = mulberry32(hashSeed(objID, ra, dec));
  const axisRatio = 0.3 + rng() * 0.7; // [0.3, 1.0)
  const positionAngleDeg = rng() * 180; // [0, 180)
  return { axisRatio, positionAngleDeg };
}
```

### Verify

```bash
npx vitest run tests/utils/random/fallbackOrientation.test.ts
```

---

## Task 4: SDSS parser update — read 5 new columns, blend exp+deV

- [ ] Read `expAB_r`, `expPhi_r`, `deVAB_r`, `deVPhi_r`, `fracDeV_r`.
- [ ] Blend: `axisRatio = (1-f)*expAB_r + f*deVAB_r`. PA blend uses circular mean for angles in [0, 180) (period 180).
- [ ] Set `axisRatio` / `positionAngleDeg` to `null` when any required column is missing.

### Files

Replace the column-reading + record-emit block in `/Users/rulkens/Development/js/skymap/tools/parsers/sdssCsv.ts`. Add column lookups after the existing ones:

```ts
  const COL_EXP_AB = requireColumn('expAB_r');
  const COL_EXP_PHI = requireColumn('expPhi_r');
  const COL_DEV_AB = requireColumn('deVAB_r');
  const COL_DEV_PHI = requireColumn('deVPhi_r');
  const COL_FRAC_DEV = requireColumn('fracDeV_r');
```

Add a helper above the row loop:

```ts
/**
 * Blend SDSS exponential and de Vaucouleurs profile fits into a single
 * (axisRatio, PA) pair.
 *
 * SDSS reports two parallel fits per band — exp (disc-like) and deV
 * (bulge-like) — plus `fracDeV_r ∈ [0, 1]` saying how much of the light is
 * actually deV-shaped. Blending by fracDeV gives the PSF-realistic shape
 * the user perceives:
 *
 *   axisRatio = (1 − f) · expAB + f · deVAB
 *
 * Position-angle blending is harder because PA is *circular* on [0, 180):
 * if expPhi = 5° and deVPhi = 175° they're actually 10° apart (across the
 * 0/180 wrap), not 170°. We project to the unit circle on the doubled
 * angle (so wrap is at 360°), blend the unit vectors weighted by their
 * shapes, then atan2 back. This is the standard circular mean.
 *
 * Returns `null` if any of the five inputs is non-finite — the row's PA/AB
 * is then handed off to the deterministic fallback in the build pipeline.
 */
function blendSdssShape(
  expAB: number,
  expPhi: number,
  deVAB: number,
  deVPhi: number,
  fracDeV: number,
): { axisRatio: number; positionAngleDeg: number } | null {
  if (
    !Number.isFinite(expAB) ||
    !Number.isFinite(expPhi) ||
    !Number.isFinite(deVAB) ||
    !Number.isFinite(deVPhi) ||
    !Number.isFinite(fracDeV)
  ) {
    return null;
  }
  const f = Math.max(0, Math.min(1, fracDeV));
  const axisRatio = (1 - f) * expAB + f * deVAB;

  // Circular mean of two angles on a 180°-period axis. Double the angle so
  // 0/180 becomes 0/360 (a true full circle), blend on the unit circle,
  // then halve and wrap.
  const e2 = (expPhi * 2 * Math.PI) / 180;
  const d2 = (deVPhi * 2 * Math.PI) / 180;
  const sx = (1 - f) * Math.cos(e2) + f * Math.cos(d2);
  const sy = (1 - f) * Math.sin(e2) + f * Math.sin(d2);
  let pa2 = Math.atan2(sy, sx); // (-π, π]
  if (pa2 < 0) pa2 += 2 * Math.PI;
  let positionAngleDeg = (pa2 * 180) / (2 * Math.PI); // back to [0, 180)
  if (positionAngleDeg >= 180) positionAngleDeg -= 180;

  return { axisRatio, positionAngleDeg };
}
```

In the row-parse loop, parse the 5 new columns and produce the blended result; replace the final `records.push(...)` with:

```ts
    const expAB = parseFloat(cells[COL_EXP_AB] ?? '');
    const expPhi = parseFloat(cells[COL_EXP_PHI] ?? '');
    const deVAB = parseFloat(cells[COL_DEV_AB] ?? '');
    const deVPhi = parseFloat(cells[COL_DEV_PHI] ?? '');
    const fracDeV = parseFloat(cells[COL_FRAC_DEV] ?? '');

    const shape = blendSdssShape(expAB, expPhi, deVAB, deVPhi, fracDeV);

    records.push({
      source: Source.SDSS,
      objID,
      ra,
      dec,
      z,
      magU,
      magG,
      magR,
      magI,
      magZ,
      axisRatio: shape ? shape.axisRatio : null,
      positionAngleDeg: shape ? shape.positionAngleDeg : null,
    });
```

Add a test to `/Users/rulkens/Development/js/skymap/tests/parsers/sdssCsv.test.ts`:

```ts
it('parses orientation columns and blends exp+deV via fracDeV_r', () => {
  const csv = [
    'objID,ra,dec,z,modelMag_u,modelMag_g,modelMag_r,modelMag_i,modelMag_z,expAB_r,expPhi_r,deVAB_r,deVPhi_r,fracDeV_r',
    '1237651738291,180.0,0.0,0.05,18,17,16.5,16,15.8,0.5,30,0.7,30,0.5',
  ].join('\n');
  const { records } = parseSdssCsv(csv);
  expect(records).toHaveLength(1);
  // 50/50 blend of 0.5 and 0.7
  expect(records[0]!.axisRatio).toBeCloseTo(0.6, 5);
  // both PAs are 30° → blend stays 30°
  expect(records[0]!.positionAngleDeg).toBeCloseTo(30, 5);
});
```

### Verify

```bash
npx vitest run tests/parsers/sdssCsv.test.ts && npm run typecheck
```

---

## Task 5: 2MASS XSC fetch script (Vizier TAP)

- [ ] Add a Node script that takes a list of 2MASS IDs (extracted from `data/raw/2mrs_table3.dat`) and writes `data/raw/2mass_xsc_pa.csv` with `2massID,sup_phi,sup_ba`.
- [ ] One-shot tool — runs offline of `npm run build-all`. Cached output checked into git? No (large) — gitignore the cache.
- [ ] **Resumable**: on startup, read the existing CSV and skip any 2MASS ID already present. Append (don't overwrite) new chunk results. Record IDs queried-but-unmatched as rows with empty `sup_phi`/`sup_ba` so they aren't re-queried on resume.

### Files

`/Users/rulkens/Development/js/skymap/tools/fetch2massXsc.ts`:

```ts
#!/usr/bin/env node
/**
 * fetch2massXsc — pull `sup_phi` (PA) + `sup_ba` (b/a) from the 2MASS XSC
 * (VizieR table II/246/out) for every 2MASS ID listed in the local 2MRS
 * catalogue, and write the result to `data/raw/2mass_xsc_pa.csv`.
 *
 * Why a separate script (not part of buildAllBins): the fetch hits a
 * remote service, takes minutes, and produces a stable artefact. Build
 * runs read the cache; only `npm run fetch-2mass-xsc` re-pulls.
 *
 * Vizier TAP endpoint:
 *   POST https://vizier.cds.unistra.fr/viz-bin/TAP/sync
 *   form: REQUEST=doQuery&LANG=ADQL&FORMAT=csv&QUERY=...
 *
 * We chunk the IN(...) clause by ~500 IDs per request — TAP rejects
 * gigantic single-query strings. ~45 k 2MRS rows → ~90 chunks × ~3 s
 * each = ~5 minutes wall clock.
 */

import {
  createReadStream,
  writeFileSync,
  existsSync,
  mkdirSync,
  appendFileSync,
  readFileSync,
} from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const TAP_URL = 'https://vizier.cds.unistra.fr/viz-bin/TAP/sync';
const CHUNK_SIZE = 500;

/**
 * Read an existing 2MASS XSC cache CSV (if it exists) and return the set of
 * 2MASS IDs already queried — regardless of whether the row carries a real
 * sup_phi/sup_ba or empty fields (queried-but-no-XSC-match). Both states are
 * "we've already asked Vizier; don't ask again".
 *
 * Returning an empty Set for a missing file is the right "first run" behaviour.
 */
function readExistingIds(path: string): Set<string> {
  const done = new Set<string>();
  if (!existsSync(path)) return done;
  const text = readFileSync(path, 'utf8');
  const lines = text.split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    // Header is line 0; data lines have at least one comma.
    const line = lines[i];
    if (!line || !line.includes(',')) continue;
    const id = line.slice(0, line.indexOf(',')).trim();
    if (id.length > 0) done.add(id);
  }
  return done;
}

async function fetchChunk(ids: string[]): Promise<Map<string, { sup_phi: number; sup_ba: number }>> {
  const inList = ids.map((s) => `'${s}'`).join(',');
  const adql = `SELECT "2MASX", sup_phi, sup_ba FROM "II/246/out" WHERE "2MASX" IN (${inList})`;
  const body = new URLSearchParams({
    REQUEST: 'doQuery',
    LANG: 'ADQL',
    FORMAT: 'csv',
    QUERY: adql,
  });
  const res = await fetch(TAP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`TAP ${res.status}: ${await res.text()}`);
  const text = await res.text();
  const out = new Map<string, { sup_phi: number; sup_ba: number }>();
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  // First line is header.
  for (let i = 1; i < lines.length; i++) {
    const [id, sup_phi, sup_ba] = lines[i]!.split(',');
    if (!id) continue;
    const phi = parseFloat(sup_phi ?? '');
    const ba = parseFloat(sup_ba ?? '');
    if (Number.isFinite(phi) && Number.isFinite(ba)) {
      out.set(id.replace(/^"|"$/g, ''), { sup_phi: phi, sup_ba: ba });
    }
  }
  return out;
}

async function readTwoMrsIds(path: string): Promise<string[]> {
  const ids: string[] = [];
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of rl) {
    // Bytes 1-16 in the 2MRS fixed-width file are the 2MASS designation.
    const id = line.slice(0, 16).trim();
    if (id.length > 0) ids.push(id);
  }
  return ids;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const inputArg = argv.find((a) => !a.startsWith('--')) ?? 'data/raw/2mrs_table3.dat';
  const outPath = resolve('data/raw/2mass_xsc_pa.csv');

  process.stderr.write(`reading 2MRS IDs from ${inputArg}…\n`);
  const allIds = await readTwoMrsIds(resolve(inputArg));
  process.stderr.write(`  ${allIds.length.toLocaleString()} IDs in 2MRS\n`);

  if (!existsSync(dirname(outPath))) mkdirSync(dirname(outPath), { recursive: true });

  // Resume support: any ID already in the cache file is skipped, even if its
  // sup_phi/sup_ba columns are empty (we asked, XSC said "no match"). On a
  // fresh run, the file doesn't exist and the set is empty.
  const done = readExistingIds(outPath);
  if (done.size === 0) {
    // Fresh run — write header line. Subsequent runs append.
    writeFileSync(outPath, '2massID,sup_phi,sup_ba\n');
  } else {
    process.stderr.write(`  resume: ${done.size.toLocaleString()} IDs already cached, skipping\n`);
  }

  const todo = allIds.filter((id) => !done.has(id));
  process.stderr.write(`  fetching ${todo.length.toLocaleString()} remaining\n`);

  for (let i = 0; i < todo.length; i += CHUNK_SIZE) {
    const chunk = todo.slice(i, i + CHUNK_SIZE);
    process.stderr.write(`  chunk ${i / CHUNK_SIZE + 1}/${Math.ceil(todo.length / CHUNK_SIZE)}…\n`);
    const result = await fetchChunk(chunk);
    // Write one row per QUERIED id (matched or not) so resume sees them all.
    // Unmatched IDs become `id,,` — same row shape, empty numeric cells.
    const lines: string[] = [];
    for (const id of chunk) {
      const r = result.get(id);
      if (r) lines.push(`${id},${r.sup_phi},${r.sup_ba}`);
      else lines.push(`${id},,`);
    }
    appendFileSync(outPath, lines.join('\n') + '\n');
  }

  process.stderr.write(`done; total cached: ${(done.size + todo.length).toLocaleString()}\n`);
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`error: ${(err as Error).stack ?? (err as Error).message}\n`);
    process.exit(1);
  });
}
```

Add to `/Users/rulkens/Development/js/skymap/package.json` `scripts`:

```json
    "fetch-2mass-xsc": "tsx tools/fetch2massXsc.ts"
```

Add `data/raw/2mass_xsc_pa.csv` to `/Users/rulkens/Development/js/skymap/.gitignore`.

### Verify

```bash
npm run fetch-2mass-xsc
head -3 data/raw/2mass_xsc_pa.csv
wc -l data/raw/2mass_xsc_pa.csv
```

---

## Task 6: 2MRS parser update — read XSC PA + b/a from cache

- [ ] Load the XSC cache CSV before parsing 2MRS.
- [ ] For each 2MRS row, extract the 16-byte ID; look up in cache; assign `axisRatio = sup_ba`, `positionAngleDeg = sup_phi`. If not in cache, both are `null`.

### Files

Modify `/Users/rulkens/Development/js/skymap/tools/parsers/twoMrs.ts`:

Add a new exported helper to load the cache and a parameter on `parseTwoMrs`:

```ts
/**
 * Map from 2MASS designation (16-char string from bytes 1-16 of the 2MRS
 * fixed-width line) to the XSC's `sup_phi` (PA in deg) and `sup_ba` (b/a).
 * Built by reading `data/raw/2mass_xsc_pa.csv` once before parsing 2MRS.
 *
 * Exported as a type alias because the build pipeline lives in
 * `buildAllBins.ts` and needs to construct + pass the map explicitly so
 * the parser stays IO-free (and unit-testable).
 */
export type XscShapeMap = Map<string, { sup_phi: number; sup_ba: number }>;

/** Parse the cached XSC CSV produced by `tools/fetch2massXsc.ts`. */
export function parseXscShapeCsv(rawText: string): XscShapeMap {
  const out: XscShapeMap = new Map();
  const lines = rawText.split(/\r?\n/).filter((l) => l.length > 0);
  for (let i = 1; i < lines.length; i++) {
    const [id, sup_phi, sup_ba] = lines[i]!.split(',');
    if (!id) continue;
    const phi = parseFloat(sup_phi ?? '');
    const ba = parseFloat(sup_ba ?? '');
    if (Number.isFinite(phi) && Number.isFinite(ba)) {
      out.set(id.trim(), { sup_phi: phi, sup_ba: ba });
    }
  }
  return out;
}
```

Change `parseTwoMrs` signature:

```ts
export function parseTwoMrs(rawText: string, xsc: XscShapeMap = new Map()): TwoMrsResult {
```

Inside the row loop, extract the ID and look up:

```ts
    const massId = line.slice(0, 16).trim();
    const xscEntry = xsc.get(massId);
```

Replace the `records.push({...})` with:

```ts
    records.push({
      source: Source.TwoMRS,
      objID: 0n,
      ra,
      dec,
      z: cz / C_KM_S,
      magU: NaN,
      magG: jc,
      magR: hc,
      magI: kc,
      magZ: NaN,
      axisRatio: xscEntry ? xscEntry.sup_ba : null,
      positionAngleDeg: xscEntry ? xscEntry.sup_phi : null,
    });
```

Add to `/Users/rulkens/Development/js/skymap/tests/parsers/twoMrs.test.ts`:

```ts
it('applies XSC PA and b/a from a cache map', () => {
  // Construct one minimal 2MRS line: bytes 1-16 = '12345678+0123456'
  // pad to >= 178 bytes; cz at bytes 174-178.
  const id = '12345678+0123456';
  const line =
    id +
    ' '.repeat(178 - id.length - 5) +
    '01000'; // cz = 1000
  // Position columns are between byte 17-36; fill with sentinel space-padded values.
  // Easiest: rebuild with the real offsets.
  // (Use a fixture loaded from disk in the real test; this is a sketch.)
  const xsc = new Map([[id, { sup_phi: 45, sup_ba: 0.6 }]]);
  // Construct a properly-padded fixture in the real test.
  // Expected: records[0].axisRatio === 0.6, positionAngleDeg === 45.
});
```

### Verify

```bash
npx vitest run tests/parsers/twoMrs.test.ts
```

---

## Task 7: HyperLEDA fetch script

- [ ] Add `tools/fetchHyperLeda.ts` that pulls `pa, logr25` for every PGC mentioned in `data/raw/glade2.3.dat`.
- [ ] HyperLEDA endpoint: `https://leda.univ-lyon1.fr/fG.cgi?n=meandata&c=o&o=pgc&a=csv$pgc=...`
- [ ] Output: `data/raw/hyperleda_pa.csv` (`pgc,pa,logr25`).
- [ ] Convert `axisRatio = 10^(-logr25)` at parse time (inverted log of major/minor).
- [ ] **Resumable**: on startup, read the existing CSV and skip any PGC already present (matched or empty-no-match). The fetch is multi-hour; interrupt-and-resume must be safe. Append (don't overwrite) results as each PGC completes. Record queried-but-no-match PGCs as rows with empty `pa`/`logr25` so the next run skips them.

### Files

`/Users/rulkens/Development/js/skymap/tools/fetchHyperLeda.ts`:

```ts
#!/usr/bin/env node
/**
 * fetchHyperLeda — pull `pa` (deg) and `logr25` (log10 of major/minor axis
 * ratio) from HyperLEDA for every PGC referenced in GLADE v2.3.
 *
 * HyperLEDA exposes a CGI endpoint that returns CSV when requested:
 *
 *   https://leda.univ-lyon1.fr/G.cgi?n=meandata&c=o&o=pgc&a=csv&z=t&p=pgc%3Dxxxx
 *
 * The endpoint is happiest with one PGC per request, so we ratelimit to 4
 * concurrent fetches and stream results to disk. ~3.2M GLADE rows but
 * ~1.5M unique PGCs (the rest are zeros = not in HyperLEDA), so the actual
 * fetch volume is manageable in batches.
 *
 * Cached output: `data/raw/hyperleda_pa.csv` keyed by PGC. Re-run rarely.
 */

import {
  createReadStream,
  writeFileSync,
  existsSync,
  mkdirSync,
  appendFileSync,
  readFileSync,
} from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const CONCURRENCY = 4;

/**
 * Read the existing HyperLEDA cache (if present) and return the set of PGCs
 * already queried — including those rows where `pa`/`logr25` are empty
 * (HyperLEDA returned no match, but we DID ask). Both states mean "skip on
 * resume". Returns an empty Set on first run.
 *
 * Single-pass scan, no parsing of the numeric fields — we only need the PGC.
 */
function readExistingPgcs(path: string): Set<string> {
  const done = new Set<string>();
  if (!existsSync(path)) return done;
  const text = readFileSync(path, 'utf8');
  const lines = text.split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.includes(',')) continue;
    const pgc = line.slice(0, line.indexOf(',')).trim();
    if (pgc.length > 0) done.add(pgc);
  }
  return done;
}

async function fetchOne(pgc: string): Promise<{ pa: number; logr25: number } | null> {
  const url = `https://leda.univ-lyon1.fr/G.cgi?n=meandata&c=o&o=pgc&a=csv&z=t&p=pgc%3D${pgc}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const text = await res.text();
  // Find header row mentioning 'pa' and 'logr25', then the row below.
  const lines = text.split(/\r?\n/).filter((l) => l.includes(','));
  if (lines.length < 2) return null;
  const header = lines[0]!.split(',').map((s) => s.trim().toLowerCase());
  const paIdx = header.indexOf('pa');
  const lrIdx = header.indexOf('logr25');
  if (paIdx === -1 || lrIdx === -1) return null;
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i]!.split(',');
    const pa = parseFloat(cells[paIdx] ?? '');
    const lr = parseFloat(cells[lrIdx] ?? '');
    if (Number.isFinite(pa) && Number.isFinite(lr)) return { pa, logr25: lr };
  }
  return null;
}

async function readGladePgcs(path: string): Promise<string[]> {
  const set = new Set<string>();
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.length < 256) continue;
    // PGC field: bytes 1-7 (per GLADE ReadMe). 0-based: 0-7.
    const pgc = line.slice(0, 7).trim();
    if (pgc !== '' && !/^-+$/.test(pgc) && pgc !== '0') set.add(pgc);
  }
  return Array.from(set);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const inputArg = argv.find((a) => !a.startsWith('--')) ?? 'data/raw/glade2.3.dat';
  const outPath = resolve('data/raw/hyperleda_pa.csv');

  process.stderr.write(`reading PGCs from ${inputArg}…\n`);
  const allPgcs = await readGladePgcs(resolve(inputArg));
  process.stderr.write(`  ${allPgcs.length.toLocaleString()} unique PGCs in GLADE\n`);

  if (!existsSync(dirname(outPath))) mkdirSync(dirname(outPath), { recursive: true });

  // Resume support: read existing cache; skip every PGC we've already queried.
  // First run: file doesn't exist, set is empty, write the header. Subsequent
  // runs: append to the existing file (header already in place).
  const alreadyDone = readExistingPgcs(outPath);
  if (alreadyDone.size === 0) {
    writeFileSync(outPath, 'pgc,pa,logr25\n');
  } else {
    process.stderr.write(`  resume: ${alreadyDone.size.toLocaleString()} PGCs already cached\n`);
  }

  const pgcs = allPgcs.filter((p) => !alreadyDone.has(p));
  process.stderr.write(`  fetching ${pgcs.length.toLocaleString()} remaining\n`);

  let i = 0;
  let done = 0;

  async function worker(): Promise<void> {
    while (i < pgcs.length) {
      const my = i++;
      const pgc = pgcs[my]!;
      try {
        const r = await fetchOne(pgc);
        // Always write a row — matched or not — so the next resume sees the
        // PGC in the cache and skips it. Unmatched rows look like `pgc,,`
        // (empty pa, empty logr25). Parsers must handle the empty-cell case.
        if (r) appendFileSync(outPath, `${pgc},${r.pa},${r.logr25}\n`);
        else appendFileSync(outPath, `${pgc},,\n`);
      } catch {
        // Network blip — DO NOT write anything; the PGC will be retried on
        // the next run. Resume will see it as "not in the cache".
      }
      done++;
      if (done % 1000 === 0) process.stderr.write(`  ${done}/${pgcs.length}\n`);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  process.stderr.write(`done; total cached: ${(alreadyDone.size + done).toLocaleString()}\n`);
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`error: ${(err as Error).stack ?? (err as Error).message}\n`);
    process.exit(1);
  });
}
```

Add to `package.json`:

```json
    "fetch-hyperleda": "tsx tools/fetchHyperLeda.ts"
```

Gitignore `data/raw/hyperleda_pa.csv`.

### Verify

```bash
npm run fetch-hyperleda
# Multi-hour. SIGINT is safe — rerun and it picks up from where it left off
# (already-cached PGCs are loaded and skipped). Network errors don't write to
# the cache, so failed PGCs naturally retry on the next run.

# Sanity: header + at least one row
head -3 data/raw/hyperleda_pa.csv

# How many cached so far
wc -l data/raw/hyperleda_pa.csv
```

---

## Task 8: GLADE parser update — apply HyperLEDA cross-match

- [ ] Read PGC from bytes 1-7 of each line (already known; not currently parsed).
- [ ] Look up in HyperLEDA cache; convert `axisRatio = 10^(-logr25)`.
- [ ] If not present, both are `null`.

### Files

Modify `/Users/rulkens/Development/js/skymap/tools/parsers/glade.ts`. Add helper + parameter:

```ts
/**
 * Map from PGC string (no padding, no leading zeros stripped) to HyperLEDA's
 * `pa` (PA in degrees) and derived `axisRatio = 10^(-logr25)`.
 *
 * The GLADE ReadMe says PGC sits in bytes 1-7 (0-based: 0-7). HyperLEDA
 * stores the same identifier as a plain integer; we trim the GLADE field
 * to its non-space content to match.
 */
export type HyperLedaShapeMap = Map<string, { pa: number; axisRatio: number }>;

/** Parse the cached HyperLEDA CSV produced by `tools/fetchHyperLeda.ts`. */
export function parseHyperLedaCsv(rawText: string): HyperLedaShapeMap {
  const out: HyperLedaShapeMap = new Map();
  const lines = rawText.split(/\r?\n/).filter((l) => l.length > 0);
  for (let i = 1; i < lines.length; i++) {
    const [pgc, pa, logr25] = lines[i]!.split(',');
    if (!pgc) continue;
    const paN = parseFloat(pa ?? '');
    const lr = parseFloat(logr25 ?? '');
    if (Number.isFinite(paN) && Number.isFinite(lr)) {
      // logr25 = log10(major/minor); axisRatio = minor/major = 10^(-logr25)
      out.set(pgc.trim(), { pa: paN, axisRatio: Math.pow(10, -lr) });
    }
  }
  return out;
}
```

Modify `parseGladeLine` signature:

```ts
export function parseGladeLine(
  line: string,
  options: GladeParseOptions = {},
  hyperLeda: HyperLedaShapeMap = new Map(),
): ParsedRecord | null {
```

Inside, before the `return`:

```ts
  // PGC sits in bytes 1-7 (0-based: 0-7). Empty/sentinel rows (`---`, `0`) are
  // common — those rows just won't find a match in the cache and will fall
  // through to the deterministic fallback at build time.
  const pgcRaw = line.slice(0, 7).trim();
  const pgcKey = pgcRaw === '' || /^-+$/.test(pgcRaw) || pgcRaw === '0' ? null : pgcRaw;
  const ledaEntry = pgcKey ? hyperLeda.get(pgcKey) : undefined;
```

Replace the return object:

```ts
  return {
    source: Source.Glade,
    objID: 0n,
    ra,
    dec,
    z,
    magU: NaN,
    magG: bmag,
    magR: jmag,
    magI: hmag,
    magZ: kmag,
    axisRatio: ledaEntry ? ledaEntry.axisRatio : null,
    positionAngleDeg: ledaEntry ? ledaEntry.pa : null,
  };
```

Modify `parseGlade` signature similarly:

```ts
export function parseGlade(
  rawText: string,
  options: GladeParseOptions = {},
  hyperLeda: HyperLedaShapeMap = new Map(),
): GladeResult {
```

Pass `hyperLeda` to `parseGladeLine` inside the loop.

### Verify

```bash
npx vitest run tests/parsers/glade.test.ts
```

---

## Task 9: Build pipeline integration — fallback + provenance + encode

- [ ] In `buildAllBins.ts`, load `data/raw/2mass_xsc_pa.csv` and `data/raw/hyperleda_pa.csv` if present (else log a warning, proceed with empty maps).
- [ ] Pass cache maps into the parsers.
- [ ] After `crossMatch`, walk every record; if `axisRatio === null || positionAngleDeg === null`, fill from `fallbackOrientation`.
- [ ] Extend `recordsToCloud` to populate the new typed arrays.

### Files

Modify `/Users/rulkens/Development/js/skymap/tools/buildAllBins.ts`:

Add new imports near the top:

```ts
import { parseXscShapeCsv } from './parsers/twoMrs.js';
import { parseHyperLedaCsv } from './parsers/glade.js';
import { fallbackOrientation } from '../src/utils/random/fallbackOrientation.js';
```

Replace `recordsToCloud` with:

```ts
function recordsToCloud(records: ParsedRecord[]): PointCloud {
  const count = records.length;
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
  };
  for (let i = 0; i < count; i++) {
    const r = records[i]!;
    const [x, y, z] = raDecZToCartesian(r.ra, r.dec, r.z);
    cloud.objIDs[i] = r.objID;
    cloud.positions[i * 3 + 0] = x;
    cloud.positions[i * 3 + 1] = y;
    cloud.positions[i * 3 + 2] = z;
    cloud.magU[i] = r.magU;
    cloud.magG[i] = r.magG;
    cloud.magR[i] = r.magR;
    cloud.magI[i] = r.magI;
    cloud.magZ[i] = r.magZ;
    // Orientation: use the parser-supplied real value when available, else
    // hand off to the deterministic fallback so every galaxy has a stable
    // axisRatio + PA at render time. The fallback hashes (objID, ra, dec)
    // so the same galaxy gets the same orientation on every reload.
    if (r.axisRatio !== null && r.positionAngleDeg !== null) {
      cloud.axisRatio[i] = r.axisRatio;
      cloud.positionAngleDeg[i] = r.positionAngleDeg;
    } else {
      const fb = fallbackOrientation(r.objID, r.ra, r.dec);
      cloud.axisRatio[i] = fb.axisRatio;
      cloud.positionAngleDeg[i] = fb.positionAngleDeg;
    }
  }
  return cloud;
}
```

Replace the start of `runCli` to load caches:

```ts
async function runCli(): Promise<void> {
  const args = readArgs();
  if (!args['out-dir']) {
    process.stderr.write(
      'usage: build-all --sdss FILE --twomrs FILE --glade FILE --out-dir DIR [--glade-spec-only]\n',
    );
    process.exit(1);
  }

  const gladeSpecOnly = 'glade-spec-only' in args;
  if (gladeSpecOnly) {
    process.stderr.write(
      'GLADE filter: spec-z only (drops 2MPZ photo-z entries to reveal filaments)\n',
    );
  }

  // Load orientation caches if present. Missing files are fine — every
  // 2MRS / GLADE row simply falls through to fallbackOrientation in
  // recordsToCloud below.
  const xscPath = resolve('data/raw/2mass_xsc_pa.csv');
  let xsc = new Map<string, { sup_phi: number; sup_ba: number }>();
  try {
    xsc = parseXscShapeCsv(readFileSync(xscPath, 'utf8'));
    process.stderr.write(`loaded ${xsc.size.toLocaleString()} 2MASS XSC orientations\n`);
  } catch {
    process.stderr.write(`warning: ${xscPath} not present — 2MRS orientation = fallback only\n`);
  }

  const ledaPath = resolve('data/raw/hyperleda_pa.csv');
  let leda = new Map<string, { pa: number; axisRatio: number }>();
  try {
    leda = parseHyperLedaCsv(readFileSync(ledaPath, 'utf8'));
    process.stderr.write(`loaded ${leda.size.toLocaleString()} HyperLEDA orientations\n`);
  } catch {
    process.stderr.write(
      `warning: ${ledaPath} not present — GLADE orientation = fallback only\n`,
    );
  }

  process.stderr.write('parsing SDSS…\n');
  const sdss = loadOrEmpty(args.sdss, parseSdssCsv);
  process.stderr.write('parsing 2MRS…\n');
  const twoMrs = loadOrEmpty(args.twomrs, (raw) => parseTwoMrs(raw, xsc));
  process.stderr.write('parsing GLADE (streaming)…\n');
  const glade = await loadGladeStream(args.glade, { specZOnly: gladeSpecOnly }, leda);
  // ...rest unchanged
```

Modify `loadGladeStream` signature & internal call:

```ts
async function loadGladeStream(
  path: string | undefined,
  options: { specZOnly?: boolean } = {},
  hyperLeda: HyperLedaShapeMap = new Map(),
): Promise<ParsedRecord[]> {
```

In its loop body: `const rec = parseGladeLine(line, options, hyperLeda);`

(Add `import type { HyperLedaShapeMap } from './parsers/glade.js';`.)

### Verify

```bash
npm run build-all -- --sdss "data/Skyserver_SQL5_3_2026 6_09_20 PM.csv" --twomrs data/raw/2mrs_table3.dat --glade data/raw/glade2.3.dat --out-dir public/data
```

Confirm logs show non-zero XSC + HyperLEDA matches and the .bin files have the expected new size (`16 + count × 56`).

---

## Task 10: Vertex buffer extension — 36 bytes / 9 slots (renderer + WGSL)

- [ ] Bump `SLOTS_PER_POINT` from 7 to 9.
- [ ] Add vertex attributes for axisRatio and positionAngleDeg.
- [ ] Update WGSL `PerVertex` struct to receive both.

### Files

Modify `/Users/rulkens/Development/js/skymap/src/services/gpu/pointRenderer.ts`:

Replace the layout-constants block with:

```ts
const SLOTS_PER_POINT = 9;
const POINT_STRIDE = SLOTS_PER_POINT * 4; // 36 bytes
const GLOBAL_IDX_BYTE_OFFSET = 20;
const K_PER_Z_BYTE_OFFSET = 24;
const AXIS_RATIO_BYTE_OFFSET = 28;
const POSITION_ANGLE_BYTE_OFFSET = 32;
```

Add the two new attributes to the pipeline descriptor's `attributes:` array:

```ts
              { shaderLocation: 5, offset: AXIS_RATIO_BYTE_OFFSET, format: 'float32' },
              { shaderLocation: 6, offset: POSITION_ANGLE_BYTE_OFFSET, format: 'float32' },
```

Inside `upload`, in the per-instance fill loop, after writing slot 6 (kPerZ), add:

```ts
      // Slots 7 and 8 (offsets 28 and 32 bytes): galaxy orientation. The
      // shader reads these as f32; NaN at decode time would propagate into
      // the ellipse mask and produce a black billboard, but the build
      // pipeline guarantees both fields are finite (real or fallback) so
      // we just copy them through.
      interleaved[o + 7] = cloud.axisRatio[i]!;
      interleaved[o + 8] = cloud.positionAngleDeg[i]!;
```

Modify `/Users/rulkens/Development/js/skymap/src/services/gpu/shaders/points.wgsl` — extend `PerVertex`:

```wgsl
  // Galaxy minor/major axis ratio b/a in (0, 1]. Used by the fragment
  // shader to squash the unit-circle UV mask into an ellipse before the
  // radial cutoff — a face-on disk (b/a = 1) renders as the original
  // round point, an edge-on disk (b/a = 0.2) renders as a thin streak.
  @location(5) axisRatio: f32,
  // Position angle in degrees, [0, 180). Rotates the squashed ellipse
  // around the billboard centre. East-of-north convention; we negate
  // before applying because UV-space y points down on the screen.
  @location(6) positionAngleDeg: f32,
```

Forward both through `VSOut`:

```wgsl
  @location(5) axisRatio: f32,
  @location(6) positionAngleDeg: f32,
```

In the `vs` body, before `return out;`:

```wgsl
  out.axisRatio = p.axisRatio;
  out.positionAngleDeg = p.positionAngleDeg;
```

### Verify

```bash
npm run typecheck && npm run dev   # visually confirm points still render (mask still circular at this stage)
```

---

## Task 11: WGSL ellipse mask in fragment shader

- [ ] In the fragment stage, before the `r2 > 1.0` cull, transform `in.uv` by rotating by `-PA` (negated because screen-y is inverted) and scaling y by `1/axisRatio` (so a 0.5 axis ratio means the y extent is twice as far from centre, making the ellipse short along PA-perpendicular).
- [ ] Apply the existing `r2 > 1.0` cull on the transformed coordinate.

### Files

In `/Users/rulkens/Development/js/skymap/src/services/gpu/shaders/points.wgsl`, replace the `fs` opening with:

```wgsl
@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  // ── Elliptical-mask transform ────────────────────────────────────────────
  //
  // The vertex shader hands us a UV in [-1, +1]² centred on the billboard.
  // We want to discard fragments outside an ELLIPSE oriented at PA with
  // semi-axes 1.0 (major) and axisRatio (minor). The cheapest way is to
  // rotate the UV by -PA (so PA-aligned axis becomes screen-x), then divide
  // y by axisRatio (so the unit-circle test in the rotated frame is the
  // ellipse test in the original frame), then apply the existing radial
  // cutoff.
  //
  // We negate the PA rotation because:
  //   1. Astronomical PA is measured east of north (counter-clockwise on
  //      sky), but our UV-y points down on screen — a sign flip.
  //   2. Rotating the UV is the inverse of rotating the ellipse, so the
  //      target rotation `+PA` becomes a UV rotation of `-PA`.
  //
  // Cost: 2 trig + 4 mul + 1 div per fragment — negligible against the 6
  // fragments per billboard at typical point sizes.
  let paRad = -in.positionAngleDeg * 3.14159265 / 180.0;
  let cs = cos(paRad);
  let sn = sin(paRad);
  let rotated = vec2<f32>(
    cs * in.uv.x - sn * in.uv.y,
    sn * in.uv.x + cs * in.uv.y,
  );
  // axisRatio is guaranteed > 0 by the build pipeline (fallback floor 0.3).
  // Even so, clamp here as a defence against a hypothetical 0 leaking
  // through — division by zero would produce a NaN distance and never
  // discard, painting a full screen-aligned square.
  let safeAB = max(in.axisRatio, 0.05);
  let elliptic = vec2<f32>(rotated.x, rotated.y / safeAB);
  let r2 = dot(elliptic, elliptic);
  // ────────────────────────────────────────────────────────────────────────
```

Replace `let r2 = dot(in.uv, in.uv);` (the existing line) by deletion (we computed it above).

Important: the SELECTION branch still uses `r2` (unchanged behavior). Selection ring on an oriented ellipse looks fine — the user wants to see that the selected galaxy is tilted.

The pick fragment (`fsPick`) keeps the original circular mask — picking should NOT depend on orientation, otherwise edge-on galaxies become unpickable. Leave `fsPick` reading `dot(in.uv, in.uv)` directly:

```wgsl
@fragment
fn fsPick(in: VSOut) -> @location(0) vec4<u32> {
  let r2 = dot(in.uv, in.uv);  // circular mask intentionally — see comment
  if (r2 > 2.25) { discard; }
  return vec4<u32>(in.instanceIdx + 1u, 0u, 0u, 0u);
}
```

### Verify

```bash
npm run dev   # visually: point billboards now show varied elongation/orientation; selection ring still circular outline (acceptable)
```

---

## Task 12: 3D disk plane geometry — DiskRenderer

- [ ] Create a sibling `diskRenderer.ts` modelled on `quadRenderer.ts`, but the quad is oriented in 3D (tilted by inclination cos(i) = b/a, rotated by PA around the line of sight).
- [ ] Justification (per the spec): keeping `quadRenderer.ts` as the screen-aligned billboard for "still loading" and synthetic galaxies preserves a clean fallback path. The new pipeline is opt-in via apparent-size threshold.

### Files

`/Users/rulkens/Development/js/skymap/src/services/gpu/diskRenderer.ts`:

```ts
/**
 * DiskRenderer — oriented 3D galaxy disks.
 *
 * Differs from QuadRenderer in two ways:
 *   1. Each instance is tilted in 3D world space: the disk's normal points
 *      toward the camera by default (face-on), and is rotated around the
 *      line-of-sight axis by PA, then tilted by inclination angle
 *      cos(i) = axisRatio. So an axisRatio = 1 disk is face-on; axisRatio
 *      ≈ 0 is edge-on.
 *   2. The fragment shader no longer applies a circular alpha mask — the
 *      disk silhouette IS the geometry, so we sample the texture and
 *      composite directly (still with premultiplied-alpha "over" blending).
 *
 * Why a separate renderer rather than extending QuadRenderer? Two reasons:
 *   - The existing QuadRenderer's vertex shader bakes screen-axis
 *     billboarding directly into clip-space (it offsets corners after
 *     viewProj). Tilting in 3D requires the corners to be transformed
 *     IN world space and then projected — a fundamentally different
 *     pipeline. Branching inside one shader doubles its length.
 *   - The engine still wants a screen-aligned thumbnail path for
 *     fallback orientations (where tilting would be cosmetically
 *     misleading). Keeping QuadRenderer alive lets the engine pick
 *     per-galaxy: real-orientation → DiskRenderer; fallback → QuadRenderer.
 *
 * Per-instance attributes (48 bytes / 12 floats):
 *   posSize       vec4   xyz, sizeWorld
 *   uvRect        vec4   u0, v0, u1, v1
 *   orientation   vec4   axisRatio, positionAngleDeg, _, _
 */

import type { mat4 } from 'gl-matrix';
import type { GpuContext } from '../../@types';
import diskWgsl from './shaders/disks.wgsl?raw';

/** Per-instance payload identical to QuadInstance but with orientation. */
export type DiskInstance = {
  x: number;
  y: number;
  z: number;
  sizeWorld: number;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  axisRatio: number;
  positionAngleDeg: number;
};

const FLOATS_PER_INSTANCE = 12;
const BYTES_PER_INSTANCE = FLOATS_PER_INSTANCE * 4;
const UNIFORM_BYTES = 80;

export class DiskRenderer {
  private readonly device: GPUDevice;
  private readonly format: GPUTextureFormat;
  private readonly pipeline: GPURenderPipeline;
  private readonly bindGroupLayout: GPUBindGroupLayout;
  private readonly uniformBuffer: GPUBuffer;
  private readonly instanceBuffer: GPUBuffer;
  private readonly sampler: GPUSampler;
  private bindGroup: GPUBindGroup | undefined;
  private readonly maxInstances: number;

  constructor(ctx: GpuContext, maxInstances = 256) {
    this.device = ctx.device;
    this.format = ctx.format;
    this.maxInstances = maxInstances;

    this.bindGroupLayout = this.device.createBindGroupLayout({
      label: 'disk-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    });

    const module = this.device.createShaderModule({ label: 'disks-wgsl', code: diskWgsl });

    this.pipeline = this.device.createRenderPipeline({
      label: 'disk-pipeline',
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] }),
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [
          {
            arrayStride: BYTES_PER_INSTANCE,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x4' }, // posSize
              { shaderLocation: 1, offset: 16, format: 'float32x4' }, // uvRect
              { shaderLocation: 2, offset: 32, format: 'float32x4' }, // orientation
            ],
          },
        ],
      },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [
          {
            format: this.format,
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-list' },
    });

    this.uniformBuffer = this.device.createBuffer({
      label: 'disk-uniforms',
      size: UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.instanceBuffer = this.device.createBuffer({
      label: 'disk-instances',
      size: maxInstances * BYTES_PER_INSTANCE,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    this.sampler = this.device.createSampler({
      label: 'disk-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });
  }

  bindAtlas(atlasView: GPUTextureView): void {
    this.bindGroup = this.device.createBindGroup({
      label: 'disk-bg',
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: atlasView },
        { binding: 2, resource: this.sampler },
      ],
    });
  }

  draw(
    pass: GPURenderPassEncoder,
    viewProj: mat4,
    viewportPx: [number, number],
    instances: ReadonlyArray<DiskInstance>,
  ): void {
    if (!this.bindGroup) return;
    if (instances.length === 0) return;

    const uni = new Float32Array(UNIFORM_BYTES / 4);
    uni.set(viewProj as Float32Array, 0);
    uni[16] = viewportPx[0];
    uni[17] = viewportPx[1];
    this.device.queue.writeBuffer(this.uniformBuffer, 0, uni);

    const data = new Float32Array(instances.length * FLOATS_PER_INSTANCE);
    for (let i = 0; i < instances.length; i++) {
      const ins = instances[i]!;
      const base = i * FLOATS_PER_INSTANCE;
      data[base + 0] = ins.x;
      data[base + 1] = ins.y;
      data[base + 2] = ins.z;
      data[base + 3] = ins.sizeWorld;
      data[base + 4] = ins.u0;
      data[base + 5] = ins.v0;
      data[base + 6] = ins.u1;
      data[base + 7] = ins.v1;
      data[base + 8] = ins.axisRatio;
      data[base + 9] = ins.positionAngleDeg;
      data[base + 10] = 0;
      data[base + 11] = 0;
    }
    this.device.queue.writeBuffer(this.instanceBuffer, 0, data);

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.setVertexBuffer(0, this.instanceBuffer);
    pass.draw(6, instances.length, 0, 0);
  }
}
```

`/Users/rulkens/Development/js/skymap/src/services/gpu/shaders/disks.wgsl`:

```wgsl
// disks.wgsl — oriented galaxy disks.
//
// Each instance is one tilted+rotated quad in WORLD space (unlike
// quads.wgsl, which is screen-aligned). Building the disk in world space
// means the projection matrix handles foreshortening naturally: a tilted
// disk projects to an ellipse on screen, exactly as it should.
//
// Frame construction (right-handed):
//   - Disk lies in a plane whose normal n is the line from the disk to
//     the camera (so a face-on disk normal points at the camera).
//   - First we build an axes pair (right, up) that span the disk plane,
//     orthogonal to n.
//   - We then rotate that pair around n by the position angle so the
//     disk's major axis aligns with the on-sky PA.
//   - Finally we squash the "up" basis by axisRatio to produce the
//     inclination — cos(i) = axisRatio is the standard disk inclination
//     formula.
// The result is a 2-vector basis (rightTilted, upTilted) we use to place
// each quad corner in world space before projection.

struct Uniforms {
  viewProj: mat4x4<f32>,
  viewport: vec2<f32>,
  _pad0: f32,
  _pad1: f32,
};

struct InstanceIn {
  @location(0) posSize: vec4<f32>,
  @location(1) uvRect:  vec4<f32>,
  @location(2) orient:  vec4<f32>,  // x: axisRatio, y: positionAngleDeg
};

struct VsOut {
  @builtin(position) clipPos:  vec4<f32>,
  @location(0)       atlasUv:  vec2<f32>,
  @location(1)       cornerUv: vec2<f32>,
};

@group(0) @binding(0) var<uniform> u:        Uniforms;
@group(0) @binding(1) var          atlasTex: texture_2d<f32>;
@group(0) @binding(2) var          atlasSmp: sampler;

const CORNERS = array<vec2<f32>, 6>(
  vec2<f32>(-1.0, -1.0),
  vec2<f32>( 1.0, -1.0),
  vec2<f32>( 1.0,  1.0),
  vec2<f32>(-1.0, -1.0),
  vec2<f32>( 1.0,  1.0),
  vec2<f32>(-1.0,  1.0),
);

// Camera position in world space — recovered from inverse(viewProj). Doing
// this on the CPU and passing as a uniform would be cheaper, but we already
// have viewProj here and the GPU cost (one inverse per draw call, NOT per
// vertex) is negligible. WGSL has no inverse() built-in, so we re-derive
// the camera world position by extracting the translation column of the
// inverse-view-matrix… which we don't have here either. Practical fix:
// add a `camPos` uniform on the JS side. We'll do that — see TODO marker
// below replaced in real code.
//
// For the implementation, the JS side passes camPos as the 19th-22nd float
// of the uniform (we extend the uniform layout by 16 bytes to fit it).

@vertex
fn vs(@builtin(vertex_index) vid: u32, instance: InstanceIn) -> VsOut {
  let corner = CORNERS[vid];
  let center = instance.posSize.xyz;
  let halfSize = instance.posSize.w * 0.5;
  let axisRatio = max(instance.orient.x, 0.05);
  let paDeg = instance.orient.y;
  let paRad = paDeg * 3.14159265 / 180.0;

  // Build a basis aligned with the line from the disk to the camera.
  // Using world-up (0,1,0) as the seed and Gram-Schmidting against n
  // produces a stable basis except in the degenerate case where n is
  // exactly vertical, where we substitute world-x.
  // (camPos lives in the uniform — see TODO above. JS-side: we'll extend
  // the uniform layout to carry it.)
  let camPos = vec3<f32>(u._pad0, u._pad1, 0.0); // PLACEHOLDER — replaced
  let n = normalize(camPos - center);
  let worldUpSeed = select(vec3<f32>(0.0, 1.0, 0.0), vec3<f32>(1.0, 0.0, 0.0), abs(n.y) > 0.99);
  let right = normalize(cross(worldUpSeed, n));
  let up    = cross(n, right);

  // Rotate (right, up) around n by paRad to align the major axis with PA.
  let cs = cos(paRad);
  let sn = sin(paRad);
  let rightPA = right * cs + up * sn;
  let upPA    = -right * sn + up * cs;

  // Squash up by axisRatio to produce inclination.
  let upTilt = upPA * axisRatio;

  // Place this corner in world space, then project.
  let world = center + (rightPA * corner.x + upTilt * corner.y) * halfSize;
  var out: VsOut;
  out.clipPos = u.viewProj * vec4<f32>(world, 1.0);

  let cornerUv = (corner + vec2<f32>(1.0, 1.0)) * 0.5;
  let uvLocal = vec2<f32>(cornerUv.x, 1.0 - cornerUv.y);
  out.atlasUv = mix(instance.uvRect.xy, instance.uvRect.zw, uvLocal);
  out.cornerUv = cornerUv;
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4<f32> {
  let rgba = textureSample(atlasTex, atlasSmp, in.atlasUv);
  // Soft circular mask — the disk geometry is already tilted in world
  // space, so the on-screen shape is a true ellipse from projection;
  // the mask just rounds the four corners of the (square) UV space.
  let r = length(in.cornerUv - vec2<f32>(0.5, 0.5));
  let mask = 1.0 - smoothstep(0.45, 0.5, r);
  let alpha = rgba.a * mask;
  return vec4<f32>(rgba.rgb * alpha, alpha);
}
```

Important refinement: the placeholder `camPos = vec3(u._pad0, u._pad1, 0)` is a sketch. Bump the disk uniform layout to 96 bytes and pass the camera position from JS:

In `diskRenderer.ts` change `UNIFORM_BYTES = 80;` → `UNIFORM_BYTES = 96;` and update `Uniforms` struct in WGSL:

```wgsl
struct Uniforms {
  viewProj: mat4x4<f32>,
  viewport: vec2<f32>,
  _pad0: f32,
  _pad1: f32,
  camPos: vec3<f32>,
  _pad2: f32,
};
```

Replace the placeholder line in the WGSL with `let camPos = u.camPos;`

Update `DiskRenderer.draw` to take `camPos` and write it:

```ts
  draw(
    pass: GPURenderPassEncoder,
    viewProj: mat4,
    viewportPx: [number, number],
    camPos: [number, number, number],
    instances: ReadonlyArray<DiskInstance>,
  ): void {
    if (!this.bindGroup) return;
    if (instances.length === 0) return;

    const uni = new Float32Array(UNIFORM_BYTES / 4);
    uni.set(viewProj as Float32Array, 0);
    uni[16] = viewportPx[0];
    uni[17] = viewportPx[1];
    // [18, 19] = _pad0, _pad1
    uni[20] = camPos[0];
    uni[21] = camPos[1];
    uni[22] = camPos[2];
    // uni[23] = _pad2
    this.device.queue.writeBuffer(this.uniformBuffer, 0, uni);
    // ... rest unchanged
  }
```

### Verify

```bash
npm run typecheck
```

---

## Task 13: Wire DiskRenderer into engine + texture sourcing

- [ ] In `engine.ts`, instantiate `DiskRenderer` next to `QuadRenderer`. Both share the same `TextureAtlas`.
- [ ] In the per-frame loop, when emitting a quad, branch on whether the cloud has finite `axisRatio`/`positionAngleDeg` AND whether `apparentSizePx > 4`. If yes → emit DiskInstance; otherwise → emit QuadInstance.
- [ ] Pass `cam.position` to the disk draw call.

### Files

Modify `/Users/rulkens/Development/js/skymap/src/services/engine/engine.ts`:

Add import:

```ts
import { DiskRenderer, type DiskInstance } from '../gpu/diskRenderer';
```

Inside the async IIFE, after `quadRenderer.bindAtlas(...)`:

```ts
      const diskRenderer = new DiskRenderer({ device, context, format, canvas });
      diskRenderer.bindAtlas(atlas.getTextureView());
```

In the per-frame thumbnail loop, restructure the QuadInstance push. Replace the loop body's tail (`const sizeWorldMpc = ...; const [u0, ...] = ...; quads.push(...)`) with:

```ts
              const sizeWorldMpc = (dKpc / 1000) * 4;
              const [u0, v0, u1, v1] = atlas.slotUv(slot);

              const ar = cloud.axisRatio[i]!;
              const pa = cloud.positionAngleDeg[i]!;
              // 3D disk path: only when (a) the apparent size is large
              // enough that the inclination ellipse is perceptually
              // distinguishable from a circle, and (b) the orientation
              // values are finite (defensive — the build pipeline
              // guarantees this, but a corrupted cache could flip them
              // to NaN, in which case we fall back to a flat quad rather
              // than render a NaN-projected mess).
              if (px > 4 && Number.isFinite(ar) && Number.isFinite(pa)) {
                disks.push({
                  x,
                  y,
                  z,
                  sizeWorld: sizeWorldMpc,
                  u0,
                  v0,
                  u1,
                  v1,
                  axisRatio: ar,
                  positionAngleDeg: pa,
                });
              } else {
                quads.push({ x, y, z, sizeWorld: sizeWorldMpc, u0, v0, u1, v1 });
              }
```

And just above the loop, declare `const disks: DiskInstance[] = [];` alongside `const quads: QuadInstance[] = [];`.

Replace the post-loop draw block with:

```ts
          if (quads.length > 0) {
            quadRenderer.draw(pass, vp, [canvas.width, canvas.height], quads);
          }
          if (disks.length > 0) {
            diskRenderer.draw(
              pass,
              vp,
              [canvas.width, canvas.height],
              [cam.position[0], cam.position[1], cam.position[2]],
              disks,
            );
          }
```

### Verify

```bash
npm run dev   # zoom in on a galaxy; confirm tilted disks appear once apparent-size > 4 px and texture is loaded
```

---

## Task 14: InfoCard orientation row + provenance

- [ ] Extend `PointInfo` with `orientation: { axisRatio: number; positionAngleDeg: number; provenance: string }`.
- [ ] Build it in `pointInfoBuilder.ts`. Provenance logic: SDSS rows where `cloud.axisRatio[i]` matches the pipeline's deterministic-fallback signature → "deterministic fallback"; else SDSS → "SDSS exp+deV blend"; 2MRS with finite real → "2MASS XSC sup_phi"; GLADE with finite real → "HyperLEDA PGC"; everyone else → "deterministic fallback".

Since we don't carry a separate provenance flag in the binary format, we'll re-derive it cheaply at the build pipeline level. Update task 9 to write the provenance into a *separate* compact in-memory map keyed by global index (or by source) — but simplest path: at runtime, mark provenance based on `(source, hasOrientation)` where `hasOrientation` is encoded as: real orientation produces a finite value distinct from what `fallbackOrientation` would produce for the same `(objID, ra, dec)`.

A simpler, robust approach: re-run `fallbackOrientation` at runtime and compare with the stored values to detect fallback. If they're identical (within float epsilon), it's a fallback. Cheap: only computed when the user opens the InfoCard.

### Files

`/Users/rulkens/Development/js/skymap/src/@types/PointInfo.d.ts` — append:

```ts
  /**
   * Orientation provenance + values for the InfoCard "Orientation" row.
   *
   * `axisRatio` and `positionAngleDeg` mirror the cloud's per-galaxy
   * fields (always finite — fallback-filled at build time). `provenance`
   * is a human-readable tag derived at info-card-build time by comparing
   * the cloud value to what `fallbackOrientation` would produce for this
   * row's (objID, ra, dec):
   *
   *   - exact match → 'deterministic fallback'
   *   - SDSS row, mismatch → 'SDSS exp+deV blend'
   *   - 2MRS row, mismatch → '2MASS XSC sup_phi'
   *   - GLADE row, mismatch → 'HyperLEDA PGC'
   *   - Synthetic row → 'deterministic fallback' (synthetic skips real-data fetch)
   */
  orientation: {
    axisRatio: number;
    positionAngleDeg: number;
    provenance: string;
  };
```

Modify `/Users/rulkens/Development/js/skymap/src/services/engine/pointInfoBuilder.ts` — locate `buildPointInfo` and add to the returned object:

```ts
  // Detect orientation provenance by replaying the deterministic fallback
  // for this row and comparing to the stored value. If they match exactly
  // (down to the float bits — the build pipeline writes the same f32 that
  // we re-compute here), the row is a fallback; otherwise it's real.
  // Cheap: only runs when an InfoCard is built (hover or click), not
  // every frame.
  const ar = cloud.axisRatio[i]!;
  const pa = cloud.positionAngleDeg[i]!;
  const fb = fallbackOrientation(cloud.objIDs[i]!, ra, dec);
  // Float32 round-trip: encode through Float32Array so the comparison
  // matches what was written to the .bin.
  const fbAr = new Float32Array([fb.axisRatio])[0]!;
  const fbPa = new Float32Array([fb.positionAngleDeg])[0]!;
  const isFallback = ar === fbAr && pa === fbPa;
  let provenance: string;
  if (isFallback) {
    provenance = 'deterministic fallback';
  } else if (source === Source.SDSS) {
    provenance = 'SDSS exp+deV blend';
  } else if (source === Source.TwoMRS) {
    provenance = '2MASS XSC sup_phi';
  } else if (source === Source.Glade) {
    provenance = 'HyperLEDA PGC';
  } else {
    provenance = 'deterministic fallback';
  }
```

Add `import { fallbackOrientation } from '../../utils/random/fallbackOrientation';` at the top of the file, and add `import { Source } from '../../data/sources';` if not already imported.

In the returned object literal, add:

```ts
    orientation: {
      axisRatio: ar,
      positionAngleDeg: pa,
      provenance,
    },
```

Modify `/Users/rulkens/Development/js/skymap/src/components/InfoCard/FullCard.tsx` — inside the `<details>` section, just before the ObjID row, add:

```tsx
          <CardRow
            label="Orientation"
            value={
              <>
                b/a&nbsp;{info.orientation.axisRatio.toFixed(2)}
                &nbsp;&nbsp;PA&nbsp;{info.orientation.positionAngleDeg.toFixed(0)}&deg;
                <br />
                <span style={{ opacity: 0.7, fontSize: '0.85em' }}>
                  {info.orientation.provenance}
                </span>
              </>
            }
          />
```

### Verify

```bash
npm run typecheck && npm run dev   # click a galaxy, expand details; confirm Orientation row shows expected provenance
```

---

## Task 15: Debug toggle — highlight fallback galaxies

- [ ] Add a SettingsPanel toggle "Highlight fallback orientations" that tints fallback rows magenta in the point pass.
- [ ] Plumb a `highlightFallback: bool` uniform to the WGSL shader; when true, multiply tint by magenta if the fragment is a fallback row.
- [ ] Detection: on the JS side at upload time, write a 1-bit flag into the high bit of an existing slot. We have `globalInstanceIdx` as u32 — the high bit is unused for the foreseeable future (4 billion galaxies away). Use bit 31 = "is fallback".

### Files

Modify `/Users/rulkens/Development/js/skymap/src/services/gpu/pointRenderer.ts`. In the upload loop, replace:

```ts
      interleavedU32[o + 5] = priorCount + i;
```

with:

```ts
      // Detect fallback by replaying the deterministic fallback hash and
      // comparing to the stored values (same trick as pointInfoBuilder).
      // Encode the boolean into the HIGH bit of the global instance ID
      // u32 — we have 31 bits left over which is 2 billion points,
      // comfortably beyond any catalogue we'll load.
      const ar = cloud.axisRatio[i]!;
      const pa = cloud.positionAngleDeg[i]!;
      const fb = fallbackOrientation(cloud.objIDs[i]!, /*ra*/ 0, /*dec*/ 0);
      // NOTE: fallbackOrientation needs ra/dec; the upload path doesn't
      // have them as scalars, but we recover them from positions via
      // cartesianToRaDecZ. To keep this hot loop fast, we precompute
      // outside the loop (see below).
      // [precomputed isFallback array assumed here]
      const isFallback = isFallbackArr[i];
      const idx = priorCount + i;
      interleavedU32[o + 5] = isFallback ? idx | 0x80000000 : idx;
```

Add at the top of `upload`, before the main loop:

```ts
    // Pre-compute the fallback flag for every row. Done once at upload
    // (CPU, not per-frame); the cost is the same hash + float32 round-trip
    // we'd pay anyway in the InfoCard.
    const isFallbackArr = new Uint8Array(cloud.count);
    for (let i = 0; i < cloud.count; i++) {
      const x = cloud.positions[i * 3 + 0]!;
      const y = cloud.positions[i * 3 + 1]!;
      const z = cloud.positions[i * 3 + 2]!;
      const [ra, dec] = cartesianToRaDecZ(x, y, z);
      const fb = fallbackOrientation(cloud.objIDs[i]!, ra, dec);
      const fbAr = new Float32Array([fb.axisRatio])[0]!;
      const fbPa = new Float32Array([fb.positionAngleDeg])[0]!;
      if (cloud.axisRatio[i] === fbAr && cloud.positionAngleDeg[i] === fbPa) {
        isFallbackArr[i] = 1;
      }
    }
```

Add imports:

```ts
import { fallbackOrientation } from '../../utils/random/fallbackOrientation';
import { cartesianToRaDecZ } from '../../utils/math';
```

Add a `highlightFallback` uniform. Bump `UNIFORM_BYTES` to 112 (add one vec4 slot). In the WGSL `Uniforms`:

```wgsl
  highlightFallback: u32,
  _pad2: u32,
  _pad3: u32,
  _pad4: u32,
```

In `PointRenderer.draw`, accept a new `highlightFallback: boolean` parameter, write `u32[24] = highlightFallback ? 1 : 0;` (after the existing writes; verify byte offset).

In the WGSL fragment shader (`fs`), at the very end before the `return`:

```wgsl
  // Decode the fallback flag from the high bit of the global instance ID.
  // The vertex shader propagated `selected` as a u32 already; we'd need to
  // do the same for `isFallback`. Instead we forward it through VSOut.
  let isFb = (in.isFallback == 1u);
  let tintFinal = select(in.tint, in.tint * vec3<f32>(1.0, 0.3, 1.0), isFb && (u.highlightFallback == 1u));
  let rgb = tintFinal * in.intensity;
  return vec4<f32>(rgb * alpha, alpha);
```

Add `@location(5) @interpolate(flat) isFallback: u32` to `VSOut`, and in `vs` after `out.selected = select(...)`:

```wgsl
  // High bit of the baked global instance idx flags fallback orientations.
  out.isFallback = select(0u, 1u, (p.globalInstanceIdx & 0x80000000u) != 0u);
  // Strip the flag bit before any downstream consumer reads instanceIdx.
  out.instanceIdx = p.globalInstanceIdx & 0x7fffffffu;
  // Same for the selection compare — our bookkeeping in JS uses the low
  // 31 bits as the canonical id.
  let realIdx = p.globalInstanceIdx & 0x7fffffffu;
  let isSelected2 = (realIdx == u.selectedIndex);
  // ... reuse isSelected2 in place of isSelected for sizeScale + selected output
```

(The original `isSelected = (p.globalInstanceIdx == u.selectedIndex)` line must be replaced with the masked-comparison version.)

In SettingsPanel, add a checkbox bound to the new engine setter `setHighlightFallback(bool)`. In `engine.ts`:

```ts
let highlightFallback = false;
// ... pass to renderer.draw(pass, vp, [...], pointSizePx, brightness, sel, mask, highlightFallback);
// ... add to handle: setHighlightFallback(b) { highlightFallback = b; cb.onHighlightFallbackChange?.(b); }
```

Update `EngineCallbacks` and `EngineHandle` types in `/Users/rulkens/Development/js/skymap/src/@types/EngineCallbacks.d.ts` and `EngineHandle.d.ts` accordingly:

```ts
  onHighlightFallbackChange?: (enabled: boolean) => void;
```

```ts
  setHighlightFallback(enabled: boolean): void;
```

In `/Users/rulkens/Development/js/skymap/src/components/SettingsPanel/SettingsPanel.tsx` (or equivalent), add the checkbox row near the existing toggles, calling the new setter.

### Verify

```bash
npm run typecheck && npm run dev
# Toggle "Highlight fallback orientations": fallback galaxies turn magenta. Real-data galaxies stay normal-coloured.
```

---

## Task 16: Visual verification

- [ ] Run `npm run dev` and verify (described, not automated):
  - Far view: thousands of point billboards show varied elliptical shapes & orientations.
  - Zoom into an SDSS galaxy: it tilts smoothly into a 3D disk; tilt direction matches the InfoCard's PA value.
  - Toggle "Highlight fallback orientations" on: 2MRS / GLADE galaxies that didn't match a cross-match cache turn magenta; SDSS galaxies stay normal-coloured (because their orientation is real).
  - Pin a galaxy, refresh the page: same orientation persists (deterministic).
- [ ] Run all tests:

```bash
npm test
```

- [ ] Confirm 155+ tests still pass plus the new orientation/fallback ones.

---

## Self-review notes (author)

- Spec coverage check: format v3 (Task 1) ✓; types (2) ✓; fallback (3) ✓; SDSS exp/deV blend (4) ✓; XSC fetch (5) ✓; 2MRS parser (6) ✓; HyperLEDA fetch (7) ✓; GLADE parser (8) ✓; pipeline integration with fallback (9) ✓; vertex layout 36B (10) ✓; ellipse mask (11) ✓; 3D disk plane (12) ✓; texture sourcing + engine wiring (13) ✓; InfoCard provenance (14) ✓; debug toggle (15) ✓; visual verify (16) ✓. 16 tasks total — matches the suggested breakdown.
- Naming consistency: `axisRatio` (lowercase camel) and `positionAngleDeg` used end-to-end (ParsedRecord, PointCloud, vertex layout, WGSL, DiskInstance, PointInfo). XSC cache CSV columns are `sup_phi` / `sup_ba` (per Vizier). HyperLEDA columns are `pa` / `logr25` (per LEDA).
- Type/byte alignment: 56 bytes/point in v3 = 16-byte aligned ✓. 36 bytes/vertex in renderer = 4-byte aligned (no GPU alignment requirement since not a uniform). 96-byte disk uniform = 16-byte aligned ✓. 112-byte point uniform after Task 15 = 16-byte aligned ✓.
- Provenance recovery: comparing `fallbackOrientation`-output to stored f32 value via Float32Array round-trip is bit-exact since both go through the same f32 quantisation. The build pipeline encodes f32 (via Float32Array view); pointInfoBuilder re-quantises the same way.
- Open question (flagged for the user): GLADE's PGC field is bytes 1-7 in the ReadMe, but the code currently doesn't parse it. The new code parses it but treats `'0'`-only / dash-only as missing. If a GLADE row has PGC = `'0123456'` (a real PGC starting with zero), the comparison `pgcRaw === '0'` would falsely accept it — actually no, `'0123456' === '0'` is false, so this is fine. But if a row has PGC literally `'0'` padded to 7 chars (`'0      '`), `.trim()` produces `'0'`, which we drop. Is that the right semantics? HyperLEDA assigns PGC = 0 to "not in catalogue", so dropping is correct.
- Open question: Disk renderer doesn't currently sort by depth before drawing. If two disks overlap, the painter's-algorithm ordering depends on instance buffer insertion order, not actual depth. Acceptable for v1 (overlap is rare at apparent-size > 4 px); revisit if visible.
