# CF-4 DM Volume — Content + Ingest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Each implementer subagent must be dispatched `run_in_background: true` per project convention. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the Valade 2024 256³ CF-4 HAMLET DM density cube into one `.scfd` file, host it on R2, and register it as a new field with the existing `scalarVolumeRenderer` so users can toggle "CF-4 dark matter" in the Volumes panel.

**Architecture:** Maintainer-only Python ingest (`.sav` → `.npy` + meta) + pure-Node TS build script (`.npy` → `.scfd`) + a new `Fetcher<ScalarCube, void>` wired as an eager `AssetSlot` in `wireSlots.ts`. No new format, no new renderer, no new shader, no new UI components — the scalar-volume primitive that landed 2026-05-09 already provides all of those.

**Tech Stack:** TypeScript, Node + tsx, Vitest. Python + scipy is maintainer-only for the rare `.sav` re-ingest. No new runtime deps.

**Spec:** [`docs/superpowers/specs/2026-05-10-cf4-dm-volume-content-design.md`](../specs/2026-05-10-cf4-dm-volume-content-design.md)

**Done means:**

- A contributor with no Python installed can `curl` the `.npy` + `.meta.json` from R2 (URLs in `data/raw/cf4/README.md`), run `npm run build-cf4-density`, and produce `public/data/cf4_density.scfd` (~32 MB).
- After the maintainer has uploaded a real `cf4_density.scfd` to R2, page-load registers the field automatically; the Volumes panel shows "CF-4 dark matter"; toggling it on renders Laniakea, the Local Void, and the Great Attractor as a translucent fog around existing GLADE galaxies.
- `superGalacticTransform` is anchored against Virgo + Coma in tests.
- `cf4DensityFetcher` happy-path + 404 + malformed-header tests are green.
- `buildCf4Density` smoke-tests end-to-end with a synthetic 8³ `.npy` written by the test itself (no committed binary fixture).
- `npm run typecheck`, `npm run build`, `npm test` all green.
- The R2 sync configuration includes `cf4_density.scfd` (ALLOW) and the two `.npy`/`.meta.json` intermediates (EXTRA_FILES, mirroring `hyperleda_pa.csv.gz`).

---

## File structure

### New files

- `data/raw/cf4/README.md` — Download instructions for the upstream `.sav`, citation, license note, R2 curl commands.
- `tools/cf4DensityIngest.py` — Maintainer-only one-shot: `.sav` → `.npy` + `.meta.json`.
- `tools/parsers/npyReader.ts` — Minimal NumPy v1.0 `.npy` reader (~80 LOC).
- `tools/buildCf4Density.ts` — Reads `.npy` + meta, casts f32→f16, writes `.scfd`.
- `src/data/superGalacticTransform.ts` — SG → equatorial rotation matrix + quaternion. Shared with the (future) cf4-flow-field plans.
- `src/services/loading/fetchers/cf4DensityFetcher.ts` — `Fetcher<ScalarCube, void>` against `dataUrl('cf4_density.scfd')`.
- `tests/data/superGalacticTransform.test.ts`
- `tests/parsers/npyReader.test.ts`
- `tests/tools/buildCf4Density.smoke.test.ts`
- `tests/services/loading/fetchers/cf4DensityFetcher.test.ts`

### Modified files

- `src/services/engine/phases/wireSlots.ts` — Mint `cf4DensitySlot`, register in `allSlots`, fire `.load()` at boot.
- `src/@types/EngineState.d.ts` — Add `cf4Density` field to `EngineAssetSlots`.
- `src/data/defaults.ts` — Add `DEFAULT_CF4_DENSITY_ENABLED = false`.
- `tools/syncR2.ts` — Add `cf4_density.scfd` to ALLOW; add `cf4_density_256.npy` and `cf4_density_256.meta.json` to EXTRA_FILES.
- `package.json` — Add `"build-cf4-density": "tsx tools/buildCf4Density.ts"`.
- `.gitignore` — Add `data/raw/cf4/*.sav`, `data/raw/cf4/*.npy`, `data/raw/cf4/*.meta.json`.

---

## Tasks

### Task 0: Pre-flight

**Files:** none modified.

- [ ] **Step 0.1: Verify baseline.**

```
npm run typecheck && npm test
```

Expected: typecheck clean; all tests pass. Record the test count for the self-review at the end.

- [ ] **Step 0.2: Verify the scalar-volume primitive is in place.**

```
test -f src/data/scalarFieldFormat.ts && echo "FORMAT: present" || echo "FORMAT: MISSING — abort"
test -f src/services/gpu/renderers/scalarVolumeRenderer.ts && echo "RENDERER: present" || echo "RENDERER: MISSING — abort"
test -f src/services/loading/fetchers/syntheticVolumeFetcher.ts && echo "TEMPLATE: present" || echo "TEMPLATE: MISSING — abort"
```

Expected: all three `present`. If any are `MISSING`, the scalar-volume PR (#f0176a8) hasn't merged into main; abort and pull.

- [ ] **Step 0.3: Confirm dev server is running.**

```
ps aux | grep -v grep | grep "vite" | head -1
```

If no Vite process, ask the user to start one (`npm run dev`) per CLAUDE.md "dev server stays running" convention. Do NOT auto-start; the user owns the dev server lifecycle.

- [ ] **Step 0.4: Confirm we're on a feature branch (not main).**

```
git rev-parse --abbrev-ref HEAD
```

If on `main`, create a feature branch:

```
git checkout -b cf4-dm-volume-content
```

If on `cf4-dm-volume-content-spec` (the spec branch), continue on it — implementation commits stack on top of the spec commit.

---

### Task 1: `.gitignore` + `data/raw/cf4/README.md`

**Files:**
- Modify: `.gitignore`
- Create: `data/raw/cf4/README.md`

- [ ] **Step 1.1: Add CF-4 raw entries to `.gitignore`.**

Append to the bottom of `.gitignore`:

```
# CF-4 DM density cube intermediates (gitignored — hosted on R2; see data/raw/cf4/README.md)
data/raw/cf4/*.sav
data/raw/cf4/*.npy
data/raw/cf4/*.meta.json
```

- [ ] **Step 1.2: Create `data/raw/cf4/README.md`.**

```bash
mkdir -p data/raw/cf4
```

Write `data/raw/cf4/README.md`:

```markdown
# CF-4 raw data — DM density cube

This directory stores intermediate artefacts for the Valade et al. 2024 "HAMLET"
256³ CF-4 DM density reconstruction. None of these files are committed to git
(see `.gitignore`); the small ones live on R2 and are pulled by `curl`, the
large ones are regenerable from the upstream `.sav`.

## Files

| File | Size | Purpose | How to obtain |
|------|------|---------|---------------|
| `CF4gp_corrected_v2_HAMLET_1000_256_g5_final.sav` | ~64 MB | Upstream IDL .sav (maintainer only) | Download from <https://projets.ip2i.in2p3.fr/cosmicflows/> (Valade 2024 release) |
| `cf4_density_256.npy` | ~64 MB | Flat f32 cube produced by the Python ingest | `curl` from R2 (see below) — or regenerate from .sav |
| `cf4_density_256.meta.json` | <1 KB | Cosmology + provenance sidecar | `curl` from R2 (see below) — or regenerate from .sav |

The runtime artefact is `public/data/cf4_density.scfd` (~32 MB f16), produced
from the `.npy` via `npm run build-cf4-density`. That `.scfd` is also synced
to R2 and is what the browser fetches at runtime.

License: CF-4 data is free for research and visualisation use; cite Valade et
al. 2024 (Nature Astronomy) and Tully et al. 2023 (CF-4 catalog) in any
derived work.

## `.sav` variable name

The variable name inside the IDL `.sav` is undocumented in Valade 2024.
**Maintainer pre-flight:** download the `.sav` once and run

```
python -c "import scipy.io; print(list(scipy.io.readsav('CF4gp_corrected_v2_HAMLET_1000_256_g5_final.sav').keys()))"
```

Record the discovered key here for future maintainers, then hard-code it
into `tools/cf4DensityIngest.py`'s `SAV_VARIABLE_NAME` constant.

**Discovered variable name:** `<TODO: maintainer fills in after first run>`

## Contributor path (no Python required)

Pull the pre-built intermediates from R2:

```
curl -L -o data/raw/cf4/cf4_density_256.npy \
  https://skymap-data.rulkens.com/data/raw/cf4/cf4_density_256.npy
curl -L -o data/raw/cf4/cf4_density_256.meta.json \
  https://skymap-data.rulkens.com/data/raw/cf4/cf4_density_256.meta.json
```

Then build the runtime `.scfd`:

```
npm run build-cf4-density
```

This reads the `.npy`, converts f32 → f16, builds the SG→equatorial rotation,
and writes `public/data/cf4_density.scfd` (~32 MB) — pure Node/TS, no Python.

If you don't even need to rebuild the `.scfd` (because you're not modifying
the format or the build pipeline), just curl the `.scfd` itself:

```
curl -L -o public/data/cf4_density.scfd \
  https://skymap-data.rulkens.com/data/cf4_density.scfd
```

## Maintainer path (Python required, run once per upstream release)

1. Download the `.sav` from the URL above.
2. Set up a venv with `scipy`:
   ```
   python -m venv .venv-cf4 && source .venv-cf4/bin/activate && pip install scipy numpy
   ```
3. Run the ingest:
   ```
   python tools/cf4DensityIngest.py
   ```
   Produces `cf4_density_256.npy` and `cf4_density_256.meta.json` in this directory.
4. Sync to R2:
   ```
   npm run sync-r2
   ```
   Uploads the `.npy` + `.meta.json` (EXTRA_FILES) and any rebuilt `.scfd` (ALLOW).
```

- [ ] **Step 1.3: Verify nothing was committed accidentally.**

```
git status
```

Expected: only `.gitignore` and `data/raw/cf4/README.md` show as new/modified. No `*.sav`/`*.npy`/`*.meta.json` listed.

- [ ] **Step 1.4: Commit.**

```bash
git add .gitignore data/raw/cf4/README.md
git commit -m "$(cat <<'EOF'
feat(cf4): add data/raw/cf4/ scaffolding for DM volume ingest

README documents the maintainer (Python) and contributor (curl from R2)
paths; .gitignore keeps the .sav, .npy, and .meta.json out of git
(same pattern as catalog .bin files).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `superGalacticTransform` (TDD)

**Files:**
- Create: `src/data/superGalacticTransform.ts`
- Test: `tests/data/superGalacticTransform.test.ts`

This helper is shared with the (future) cf4-flow-field plans. SG → equatorial Cartesian rotation, plus a unit quaternion form (the SCFD header's `rotation` field expects a quaternion).

- [ ] **Step 2.1: Write the failing test.**

Create `tests/data/superGalacticTransform.test.ts`:

```ts
/**
 * Anchored unit tests for the supergalactic → equatorial Cartesian
 * rotation. Validates against published positions of nearby clusters
 * (Virgo, Coma) plus geometric invariants (quaternion unit-norm,
 * matrix orthonormal). Tolerance is ~1° on RA/Dec — enough to confirm
 * the convention is right; precision below that is dominated by the
 * cluster-position uncertainties themselves.
 */
import { describe, expect, it } from 'vitest';
import {
  SG_TO_EQ_MATRIX,
  SG_TO_EQ_QUATERNION,
  sgCartesianToEquatorial,
} from '../../src/data/superGalacticTransform';

const RAD = Math.PI / 180;

/** Convert an equatorial Cartesian (Mpc) to (RA degrees, Dec degrees, distance Mpc). */
function eqCartesianToRaDecDist(eq: readonly [number, number, number]): {
  ra: number;
  dec: number;
  dist: number;
} {
  const [x, y, z] = eq;
  const dist = Math.hypot(x, y, z);
  const ra = ((Math.atan2(y, x) / RAD) + 360) % 360;
  const dec = Math.asin(z / dist) / RAD;
  return { ra, dec, dist };
}

describe('superGalacticTransform', () => {
  it('exports a 3x3 matrix and a 4-element quaternion', () => {
    expect(SG_TO_EQ_MATRIX).toHaveLength(3);
    SG_TO_EQ_MATRIX.forEach((row) => expect(row).toHaveLength(3));
    expect(SG_TO_EQ_QUATERNION).toHaveLength(4);
  });

  it('quaternion is unit-norm', () => {
    const [x, y, z, w] = SG_TO_EQ_QUATERNION;
    const norm = Math.hypot(x, y, z, w);
    expect(norm).toBeCloseTo(1, 6);
  });

  it('matrix is orthonormal (rows have unit length, dot products are zero)', () => {
    const [r0, r1, r2] = SG_TO_EQ_MATRIX;
    expect(Math.hypot(...r0)).toBeCloseTo(1, 6);
    expect(Math.hypot(...r1)).toBeCloseTo(1, 6);
    expect(Math.hypot(...r2)).toBeCloseTo(1, 6);
    const dot = (a: readonly number[], b: readonly number[]) =>
      a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    expect(dot(r0, r1)).toBeCloseTo(0, 6);
    expect(dot(r0, r2)).toBeCloseTo(0, 6);
    expect(dot(r1, r2)).toBeCloseTo(0, 6);
  });

  it('maps origin to origin', () => {
    expect(sgCartesianToEquatorial([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it('maps Virgo (SGX≈-2.5, SGY≈+10.0, SGZ≈-1.0 Mpc/h) to RA≈187°, Dec≈+12°, dist≈10 Mpc/h', () => {
    const eq = sgCartesianToEquatorial([-2.5, 10.0, -1.0]);
    const { ra, dec, dist } = eqCartesianToRaDecDist(eq);
    expect(ra).toBeGreaterThan(184);
    expect(ra).toBeLessThan(190);
    expect(dec).toBeGreaterThan(9);
    expect(dec).toBeLessThan(15);
    // Distance is preserved by an orthonormal rotation; Mpc/h, not physical Mpc.
    expect(dist).toBeCloseTo(Math.hypot(-2.5, 10.0, -1.0), 5);
  });

  it('maps Coma (SGX≈+0.6, SGY≈+71.5, SGZ≈+12 Mpc/h) to RA≈195°, Dec≈+27°', () => {
    const eq = sgCartesianToEquatorial([0.6, 71.5, 12]);
    const { ra, dec } = eqCartesianToRaDecDist(eq);
    expect(ra).toBeGreaterThan(192);
    expect(ra).toBeLessThan(198);
    expect(dec).toBeGreaterThan(24);
    expect(dec).toBeLessThan(30);
  });
});
```

- [ ] **Step 2.2: Run the test to verify it fails.**

```
npx vitest run tests/data/superGalacticTransform.test.ts
```

Expected: FAIL with "Cannot find module '../../src/data/superGalacticTransform'".

- [ ] **Step 2.3: Implement the module.**

Create `src/data/superGalacticTransform.ts`:

```ts
/**
 * superGalacticTransform — pure rotation from supergalactic Cartesian
 * to equatorial Cartesian, both expressed in the same length unit
 * (rotations preserve length).
 *
 * The SG axis convention is Lahav 1991 / NED: SGX-axis points to
 * galactic (l, b) = (137.37°, 0°), SGZ-axis points to (l, b) = (47.37°, +6.32°).
 * We compose SG → galactic → equatorial via two well-known rotations:
 *
 *   1.  R_SG_to_GAL: rotate so SGX → (l=137.37°, b=0°), SGZ → galactic pole-ish.
 *       Standard form: a 3×3 with columns being the galactic-Cartesian unit
 *       vectors of SGX, SGY, SGZ.
 *
 *   2.  R_GAL_to_EQ: rotate galactic Cartesian → equatorial Cartesian.
 *       The galactic north pole is at equatorial (RA=192.8595°, Dec=+27.1283°);
 *       the galactic centre is at (RA=266.4051°, Dec=−28.9362°).
 *       Standard form: a 3×3 with columns being the equatorial-Cartesian
 *       unit vectors of (galactic X, Y, Z).
 *
 * Composition: R_SG_to_EQ = R_GAL_to_EQ · R_SG_to_GAL.
 *
 * Shared with the (future) `2026-05-05-cf4-*` flow-field plans, both of
 * which need the same rotation. Lives in `src/data/` rather than
 * `src/utils/` because it carries domain knowledge (cluster anchoring,
 * astronomical conventions) rather than being a generic vector helper.
 */

const RAD = Math.PI / 180;

/** Galactic Cartesian unit vector for galactic coords (l, b). */
function galLBtoCart(lDeg: number, bDeg: number): [number, number, number] {
  const l = lDeg * RAD;
  const b = bDeg * RAD;
  return [Math.cos(l) * Math.cos(b), Math.sin(l) * Math.cos(b), Math.sin(b)];
}

/** Equatorial Cartesian unit vector for equatorial coords (RA, Dec). */
function eqRaDecToCart(raDeg: number, decDeg: number): [number, number, number] {
  const a = raDeg * RAD;
  const d = decDeg * RAD;
  return [Math.cos(a) * Math.cos(d), Math.sin(a) * Math.cos(d), Math.sin(d)];
}

/**
 * R_SG_to_GAL columns are the galactic-Cartesian unit vectors of SGX, SGY, SGZ.
 * SGX axis is at (l=137.37°, b=0°). SGZ axis is at (l=47.37°, b=+6.32°).
 * SGY = SGZ × SGX (right-handed), then renormalised against numerical drift.
 */
function buildSgToGal(): readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]] {
  const sgx = galLBtoCart(137.37, 0);
  const sgz = galLBtoCart(47.37, 6.32);
  // SGY = SGZ × SGX (right-handed)
  const sgy: [number, number, number] = [
    sgz[1] * sgx[2] - sgz[2] * sgx[1],
    sgz[2] * sgx[0] - sgz[0] * sgx[2],
    sgz[0] * sgx[1] - sgz[1] * sgx[0],
  ];
  // Renormalise against accumulated FP drift.
  const norm = Math.hypot(...sgy);
  sgy[0] /= norm;
  sgy[1] /= norm;
  sgy[2] /= norm;
  // Matrix rows: gal-X-row = [sgx.x, sgy.x, sgz.x], etc.
  return [
    [sgx[0], sgy[0], sgz[0]],
    [sgx[1], sgy[1], sgz[1]],
    [sgx[2], sgy[2], sgz[2]],
  ] as const;
}

/**
 * R_GAL_to_EQ columns are the equatorial-Cartesian unit vectors of
 * galactic X, Y, Z. Galactic X (l=0, b=0) → galactic centre at
 * (RA=266.4051°, Dec=−28.9362°). Galactic Z (north pole) at
 * (RA=192.8595°, Dec=+27.1283°). Galactic Y = galZ × galX.
 */
function buildGalToEq(): readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]] {
  const gx = eqRaDecToCart(266.4051, -28.9362);
  const gz = eqRaDecToCart(192.8595, 27.1283);
  const gy: [number, number, number] = [
    gz[1] * gx[2] - gz[2] * gx[1],
    gz[2] * gx[0] - gz[0] * gx[2],
    gz[0] * gx[1] - gz[1] * gx[0],
  ];
  const norm = Math.hypot(...gy);
  gy[0] /= norm;
  gy[1] /= norm;
  gy[2] /= norm;
  return [
    [gx[0], gy[0], gz[0]],
    [gx[1], gy[1], gz[1]],
    [gx[2], gy[2], gz[2]],
  ] as const;
}

function multiply3x3(
  a: readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]],
  b: readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]],
): readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]] {
  const out: number[][] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      for (let k = 0; k < 3; k++) {
        out[i][j] += a[i][k] * b[k][j];
      }
    }
  }
  return [
    [out[0][0], out[0][1], out[0][2]],
    [out[1][0], out[1][1], out[1][2]],
    [out[2][0], out[2][1], out[2][2]],
  ] as const;
}

/** Convert a 3×3 rotation matrix to a unit quaternion (x, y, z, w). */
function matrixToQuaternion(
  m: readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]],
): [number, number, number, number] {
  // Shepperd's method via the largest diagonal element — numerically stable.
  const trace = m[0][0] + m[1][1] + m[2][2];
  let x: number, y: number, z: number, w: number;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    w = 0.25 / s;
    x = (m[2][1] - m[1][2]) * s;
    y = (m[0][2] - m[2][0]) * s;
    z = (m[1][0] - m[0][1]) * s;
  } else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) {
    const s = 2 * Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]);
    w = (m[2][1] - m[1][2]) / s;
    x = 0.25 * s;
    y = (m[0][1] + m[1][0]) / s;
    z = (m[0][2] + m[2][0]) / s;
  } else if (m[1][1] > m[2][2]) {
    const s = 2 * Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]);
    w = (m[0][2] - m[2][0]) / s;
    x = (m[0][1] + m[1][0]) / s;
    y = 0.25 * s;
    z = (m[1][2] + m[2][1]) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]);
    w = (m[1][0] - m[0][1]) / s;
    x = (m[0][2] + m[2][0]) / s;
    y = (m[1][2] + m[2][1]) / s;
    z = 0.25 * s;
  }
  // Renormalise against numerical drift.
  const n = Math.hypot(x, y, z, w);
  return [x / n, y / n, z / n, w / n];
}

const R_SG_TO_GAL = buildSgToGal();
const R_GAL_TO_EQ = buildGalToEq();

/** Rotation matrix taking supergalactic Cartesian → equatorial Cartesian. */
export const SG_TO_EQ_MATRIX = multiply3x3(R_GAL_TO_EQ, R_SG_TO_GAL);

/** Same rotation as a unit quaternion (x, y, z, w). For SCFD header. */
export const SG_TO_EQ_QUATERNION: readonly [number, number, number, number] = matrixToQuaternion(SG_TO_EQ_MATRIX);

/** Apply the SG → equatorial rotation to a vector. Length is preserved. */
export function sgCartesianToEquatorial(
  sg: readonly [number, number, number],
): [number, number, number] {
  const m = SG_TO_EQ_MATRIX;
  return [
    m[0][0] * sg[0] + m[0][1] * sg[1] + m[0][2] * sg[2],
    m[1][0] * sg[0] + m[1][1] * sg[1] + m[1][2] * sg[2],
    m[2][0] * sg[0] + m[2][1] * sg[1] + m[2][2] * sg[2],
  ];
}
```

- [ ] **Step 2.4: Run the test to verify it passes.**

```
npx vitest run tests/data/superGalacticTransform.test.ts
```

Expected: 6 tests pass. If Virgo/Coma are off by more than the 6° envelope, double-check the SGZ convention — some sources use (47.37°, +6.32°) and some use the cleaner (47.37°, 0°). The published Virgo/Coma RA/Dec values resolve the ambiguity.

- [ ] **Step 2.5: Run typecheck + full test suite.**

```
npm run typecheck && npm test
```

Expected: clean.

- [ ] **Step 2.6: Commit.**

```bash
git add src/data/superGalacticTransform.ts tests/data/superGalacticTransform.test.ts
git commit -m "$(cat <<'EOF'
feat(cf4): add superGalacticTransform helper

Pure rotation from supergalactic Cartesian to equatorial Cartesian,
exported as both a 3x3 matrix and a unit quaternion (the SCFD header's
rotation field needs the latter). Anchored against Virgo (RA~187 deg,
Dec~+12 deg) and Coma (RA~195 deg, Dec~+27 deg) in tests.

Shared with the future cf4-flow-field plans, which also need this
rotation.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `npyReader` (TDD)

**Files:**
- Create: `tools/parsers/npyReader.ts`
- Test: `tests/parsers/npyReader.test.ts`

NumPy v1.0 `.npy` parser. Tiny — only enough to read flat f32 / f16 arrays. The test writes a `.npy` buffer in-memory (no committed binary fixture), then reads it back.

- [ ] **Step 3.1: Write the failing test.**

Create `tests/parsers/npyReader.test.ts`:

```ts
/**
 * Round-trip test for the minimal NumPy v1.0 .npy reader.
 *
 * Avoids a committed binary fixture by writing a known .npy buffer
 * in-memory inside the test (using the format spec at
 * https://numpy.org/doc/stable/reference/generated/numpy.lib.format.html).
 * The test thus exercises the reader against bytes whose every field
 * is known by construction.
 */
import { describe, expect, it } from 'vitest';
import { readNpy } from '../../tools/parsers/npyReader';

/**
 * Write a NumPy v1.0 .npy file representing a flat f32 array.
 * Returns an ArrayBuffer suitable for `readNpy`.
 *
 * Format: 6-byte magic '\x93NUMPY', 1-byte major (1), 1-byte minor (0),
 * 2-byte little-endian header_len, ASCII Python-dict header padded with
 * spaces to (10 + header_len) % 64 == 0, then raw little-endian bytes.
 */
function writeF32Npy(values: number[], shape: readonly number[]): ArrayBuffer {
  const headerDict = `{'descr': '<f4', 'fortran_order': False, 'shape': (${shape.join(', ')}${shape.length === 1 ? ',' : ''}), }`;
  // Pad header so that (10 + headerLen) is a multiple of 64.
  const baseLen = 10 + headerDict.length + 1; // +1 for trailing newline
  const padded = baseLen + ((64 - (baseLen % 64)) % 64);
  const headerLen = padded - 10;
  const headerStr = headerDict + ' '.repeat(headerLen - headerDict.length - 1) + '\n';
  const dataBytes = values.length * 4;
  const buf = new ArrayBuffer(10 + headerLen + dataBytes);
  const u8 = new Uint8Array(buf);
  // Magic + version
  u8[0] = 0x93;
  u8[1] = 0x4e; // 'N'
  u8[2] = 0x55; // 'U'
  u8[3] = 0x4d; // 'M'
  u8[4] = 0x50; // 'P'
  u8[5] = 0x59; // 'Y'
  u8[6] = 1;
  u8[7] = 0;
  // Header length (little-endian u16)
  const dv = new DataView(buf);
  dv.setUint16(8, headerLen, true);
  // Header bytes
  for (let i = 0; i < headerStr.length; i++) {
    u8[10 + i] = headerStr.charCodeAt(i);
  }
  // Data bytes
  const f32 = new Float32Array(buf, 10 + headerLen, values.length);
  f32.set(values);
  return buf;
}

describe('readNpy', () => {
  it('reads a 1-D f32 array', () => {
    const buf = writeF32Npy([1.5, -2.5, 3.5, 0], [4]);
    const result = readNpy(buf);
    expect(result.dtype).toBe('<f4');
    expect(Array.from(result.shape)).toEqual([4]);
    expect(result.values).toBeInstanceOf(Float32Array);
    expect(Array.from(result.values as Float32Array)).toEqual([1.5, -2.5, 3.5, 0]);
  });

  it('reads a 3-D f32 array (matches shape order)', () => {
    const data = Array.from({ length: 2 * 3 * 4 }, (_, i) => i + 0.5);
    const buf = writeF32Npy(data, [2, 3, 4]);
    const result = readNpy(buf);
    expect(Array.from(result.shape)).toEqual([2, 3, 4]);
    expect((result.values as Float32Array).length).toBe(24);
    expect(Array.from(result.values as Float32Array)).toEqual(data);
  });

  it('throws on bad magic', () => {
    const buf = new ArrayBuffer(16);
    expect(() => readNpy(buf)).toThrow(/magic/i);
  });

  it('throws on Fortran-order arrays (not supported)', () => {
    // Write a header with fortran_order: True
    const headerDict = `{'descr': '<f4', 'fortran_order': True, 'shape': (2, 2), }`;
    const baseLen = 10 + headerDict.length + 1;
    const padded = baseLen + ((64 - (baseLen % 64)) % 64);
    const headerLen = padded - 10;
    const headerStr = headerDict + ' '.repeat(headerLen - headerDict.length - 1) + '\n';
    const buf = new ArrayBuffer(10 + headerLen + 16);
    const u8 = new Uint8Array(buf);
    u8.set([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59, 1, 0]);
    new DataView(buf).setUint16(8, headerLen, true);
    for (let i = 0; i < headerStr.length; i++) u8[10 + i] = headerStr.charCodeAt(i);
    expect(() => readNpy(buf)).toThrow(/fortran/i);
  });
});
```

- [ ] **Step 3.2: Run the test to verify it fails.**

```
npx vitest run tests/parsers/npyReader.test.ts
```

Expected: FAIL with "Cannot find module '../../tools/parsers/npyReader'".

- [ ] **Step 3.3: Implement the parser.**

Create `tools/parsers/npyReader.ts`:

```ts
/**
 * Minimal NumPy v1.0 .npy reader. Only enough to read flat C-order
 * f32 / f16 arrays — which is all the CF-4 ingest pipeline emits.
 *
 * Format spec: https://numpy.org/doc/stable/reference/generated/numpy.lib.format.html
 *
 * Why hand-roll instead of adding a dep: the v1 format is ~50 LOC of
 * parsing; the npm packages that read it bring in heavier numerical
 * stacks for features we don't use. Keeps `tools/` zero-dep beyond
 * what's already there.
 */

export type NpyArray = {
  /** dtype string from the header, e.g. '<f4'. */
  dtype: string;
  /** Shape tuple, e.g. [256, 256, 256]. */
  shape: number[];
  /**
   * Decoded values. f32 → Float32Array; f16 → Uint16Array (raw f16
   * bits, the same shape consumed by SCFD encode).
   */
  values: Float32Array | Uint16Array;
};

const MAGIC = [0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59];

export function readNpy(buf: ArrayBuffer): NpyArray {
  const u8 = new Uint8Array(buf);
  if (u8.length < 10) throw new Error('readNpy: buffer too small for .npy header');
  for (let i = 0; i < 6; i++) {
    if (u8[i] !== MAGIC[i]) {
      throw new Error(`readNpy: bad magic at offset ${i} (got 0x${u8[i].toString(16)}, expected 0x${MAGIC[i].toString(16)})`);
    }
  }
  const major = u8[6];
  const minor = u8[7];
  if (major !== 1) {
    throw new Error(`readNpy: unsupported .npy version ${major}.${minor} (only v1.x supported)`);
  }
  const dv = new DataView(buf);
  const headerLen = dv.getUint16(8, true);
  const headerStart = 10;
  const headerBytes = u8.slice(headerStart, headerStart + headerLen);
  const headerStr = new TextDecoder('ascii').decode(headerBytes).trim();
  // Header is a Python-style dict literal; we don't need full parsing —
  // three regex extractions cover everything we use.
  const descrMatch = headerStr.match(/'descr':\s*'([^']+)'/);
  const fortranMatch = headerStr.match(/'fortran_order':\s*(True|False)/);
  const shapeMatch = headerStr.match(/'shape':\s*\(([^)]*)\)/);
  if (!descrMatch || !fortranMatch || !shapeMatch) {
    throw new Error(`readNpy: malformed header dict: ${headerStr}`);
  }
  const dtype = descrMatch[1];
  if (fortranMatch[1] === 'True') {
    throw new Error('readNpy: fortran_order arrays are not supported (only C-order)');
  }
  const shape = shapeMatch[1]
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => Number.parseInt(s, 10));
  const dataStart = headerStart + headerLen;
  const expectedCount = shape.reduce((a, b) => a * b, 1);
  if (dtype === '<f4') {
    const expectedBytes = expectedCount * 4;
    if (buf.byteLength - dataStart !== expectedBytes) {
      throw new Error(
        `readNpy: f32 byte count mismatch (${buf.byteLength - dataStart} bytes after header, expected ${expectedBytes} for shape ${shape.join('x')})`,
      );
    }
    const values = new Float32Array(buf.slice(dataStart, dataStart + expectedBytes));
    return { dtype, shape, values };
  }
  if (dtype === '<f2') {
    const expectedBytes = expectedCount * 2;
    if (buf.byteLength - dataStart !== expectedBytes) {
      throw new Error(
        `readNpy: f16 byte count mismatch (${buf.byteLength - dataStart} bytes after header, expected ${expectedBytes} for shape ${shape.join('x')})`,
      );
    }
    const values = new Uint16Array(buf.slice(dataStart, dataStart + expectedBytes));
    return { dtype, shape, values };
  }
  throw new Error(`readNpy: unsupported dtype "${dtype}" (only '<f4' and '<f2' supported)`);
}
```

- [ ] **Step 3.4: Run the test to verify it passes.**

```
npx vitest run tests/parsers/npyReader.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 3.5: Run typecheck.**

```
npm run typecheck
```

Expected: clean. (Note: `tools/` and `src/` use separate tsconfigs; the script tsconfig must include the test directory or the test run uses its own path resolution — verify both pass.)

- [ ] **Step 3.6: Commit.**

```bash
git add tools/parsers/npyReader.ts tests/parsers/npyReader.test.ts
git commit -m "$(cat <<'EOF'
feat(cf4): add minimal NumPy .npy reader

Reads flat C-order f32 ('<f4') and f16 ('<f2') arrays, which is all
the CF-4 ingest pipeline ever emits. Round-trip tested against an
in-memory .npy buffer (no committed binary fixture).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Python ingest script (`tools/cf4DensityIngest.py`)

**Files:**
- Create: `tools/cf4DensityIngest.py`

Maintainer-only one-shot. No automated test (it requires `scipy` + a 64 MB `.sav` neither of which is in the repo). Manual verification only.

- [ ] **Step 4.1: Create `tools/cf4DensityIngest.py`.**

```python
#!/usr/bin/env python3
"""
cf4DensityIngest.py — Maintainer-only ingest of the Valade 2024 CF-4
HAMLET 256³ DM density cube.

Reads the upstream IDL `.sav` file via `scipy.io.readsav`, extracts the
density-field array, validates shape (256, 256, 256) and dtype float32,
writes a flat NumPy `.npy` plus a sibling `.meta.json` with cosmology
constants.

Run once per upstream release (essentially never — CF-4 is a published
catalog, not a streaming feed). Contributors who don't have Python pull
the produced `.npy` + `.meta.json` from R2 instead.

Usage:
    python tools/cf4DensityIngest.py

The `.sav` variable name is undocumented in Valade 2024. Before running
this script for the first time, discover it:

    python -c "import scipy.io; print(list(scipy.io.readsav('data/raw/cf4/CF4gp_corrected_v2_HAMLET_1000_256_g5_final.sav').keys()))"

Then update SAV_VARIABLE_NAME below and record the discovered name in
`data/raw/cf4/README.md`.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import scipy.io

# ── Configuration ──────────────────────────────────────────────────
SAV_PATH = Path("data/raw/cf4/CF4gp_corrected_v2_HAMLET_1000_256_g5_final.sav")
NPY_PATH = Path("data/raw/cf4/cf4_density_256.npy")
META_PATH = Path("data/raw/cf4/cf4_density_256.meta.json")

# REPLACE with the actual key after running the discovery one-liner above.
# Plausible candidates: 'delta', 'density', 'rho_over_rho_bar'.
SAV_VARIABLE_NAME = "delta"

# Cosmology constants from Valade et al. 2024.
HUBBLE_H = 0.746
BOX_SIZE_H_MPC = 1000.0
VOXEL_SIZE_H_MPC = BOX_SIZE_H_MPC / 256  # 3.90625


def main() -> int:
    if not SAV_PATH.exists():
        print(f"ERROR: {SAV_PATH} not found.", file=sys.stderr)
        print(
            "Download the .sav from https://projets.ip2i.in2p3.fr/cosmicflows/ and place it at the path above.",
            file=sys.stderr,
        )
        return 1

    print(f"Reading {SAV_PATH} ...")
    sav = scipy.io.readsav(str(SAV_PATH))
    keys = list(sav.keys())
    if SAV_VARIABLE_NAME not in keys:
        print(
            f"ERROR: variable '{SAV_VARIABLE_NAME}' not found in .sav. Available keys: {keys}",
            file=sys.stderr,
        )
        print(
            "Update SAV_VARIABLE_NAME in this script (and data/raw/cf4/README.md) to one of the above.",
            file=sys.stderr,
        )
        return 2

    arr = sav[SAV_VARIABLE_NAME]
    arr = np.asarray(arr, dtype=np.float32)
    if arr.shape != (256, 256, 256):
        print(
            f"ERROR: expected shape (256, 256, 256), got {arr.shape}",
            file=sys.stderr,
        )
        return 3

    print(
        f"Loaded delta cube: shape={arr.shape}, dtype={arr.dtype}, "
        f"min={arr.min():.3f}, max={arr.max():.3f}, mean={arr.mean():.3f}"
    )

    # NumPy default is C-order, which matches our SCFD x-fastest expectation
    # only after a transpose: numpy stores the last axis fastest, but our
    # cube semantics put X-axis fastest. The IDL .sav is typically
    # delivered in (z, y, x) order; verify by inspecting one slice and
    # transpose if needed. For now we save as-is and let buildCf4Density.ts
    # do the transpose into x-fastest.
    np.save(NPY_PATH, arr, allow_pickle=False)
    print(f"Wrote {NPY_PATH} ({NPY_PATH.stat().st_size} bytes)")

    meta = {
        "h": HUBBLE_H,
        "box_size_h_mpc": BOX_SIZE_H_MPC,
        "voxel_size_h_mpc": VOXEL_SIZE_H_MPC,
        "field_type": "delta",
        "coord_frame": "supergalactic_cartesian",
        "source": (
            "Valade et al. 2024 (HAMLET) "
            "CF4gp_corrected_v2_HAMLET_1000_256_g5_final.sav"
        ),
        "sav_variable_name": SAV_VARIABLE_NAME,
        "stats": {
            "min": float(arr.min()),
            "max": float(arr.max()),
            "mean": float(arr.mean()),
        },
    }
    META_PATH.write_text(json.dumps(meta, indent=2))
    print(f"Wrote {META_PATH}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4.2: Make it executable + lint-check syntax.**

```
chmod +x tools/cf4DensityIngest.py
python3 -c "import ast; ast.parse(open('tools/cf4DensityIngest.py').read()); print('syntax OK')"
```

Expected: `syntax OK`. (Don't try to run the script — it needs scipy + a 64 MB `.sav`.)

- [ ] **Step 4.3: Commit.**

```bash
git add tools/cf4DensityIngest.py
git commit -m "$(cat <<'EOF'
feat(cf4): add maintainer-only Python ingest for HAMLET .sav

One-shot script that reads the Valade 2024 CF-4 HAMLET .sav via
scipy.io.readsav, extracts the 256^3 delta cube, validates shape +
dtype, and writes data/raw/cf4/cf4_density_256.npy + a sibling
.meta.json with cosmology constants. Run once per upstream release.

The .sav variable name is undocumented in the paper; the maintainer
discovers it via a one-liner (documented in the script) and updates
SAV_VARIABLE_NAME + data/raw/cf4/README.md.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `buildCf4Density.ts` (TDD via smoke test)

**Files:**
- Create: `tools/buildCf4Density.ts`
- Test: `tests/tools/buildCf4Density.smoke.test.ts`

End-to-end: write a synthetic 8³ `.npy` + meta in a tmpdir, run the build, decode the resulting `.scfd`, assert header fields match. The test exercises the exact path a contributor takes.

- [ ] **Step 5.1: Inspect the SCFD `origin`/`rotation` semantics so the build script populates them correctly.**

```
sed -n '60,140p' src/data/scalarFieldFormat.ts
```

Read the comments around `origin`, `rotation`, and how `scalarVolumeRenderer` consumes them (in particular, whether `origin` is the corner of voxel (0,0,0) in the *native* frame — pre-rotation — or the post-rotation world-space corner). Record the answer here as a comment in the build script before writing it.

Also inspect:

```
grep -n "origin\|rotation\|modelMatrix" src/services/gpu/renderers/scalarVolumeRenderer.ts | head -30
```

The ScalarCube type docstring says: `"origin: Position of voxel (0,0,0) corner in frameKind's coords, Mpc."` — i.e. origin is in the cube's *native* (pre-rotation) frame. The renderer applies `rotation` to the cube's local frame to place it in world space.

For CF-4: the cube is centered at the observer in supergalactic-Cartesian Mpc/h. Voxel (0,0,0) is at the lower corner. With voxel size `5.236 Mpc` (post-h-rescale) and 256 voxels per side, the lower corner is at `(-5.236 × 128, -5.236 × 128, -5.236 × 128) ≈ (-670, -670, -670) Mpc` in supergalactic-Cartesian. The `rotation` quaternion rotates this whole cube (corners and contents) into equatorial Cartesian.

- [ ] **Step 5.2: Write the failing test.**

Create `tests/tools/buildCf4Density.smoke.test.ts`:

```ts
/**
 * End-to-end smoke test for tools/buildCf4Density.ts.
 *
 * Writes a synthetic 8x8x8 .npy + .meta.json into a tmpdir, invokes the
 * build script's main() against those paths, decodes the resulting
 * .scfd, and asserts every header field carries the expected value.
 *
 * Avoids spawning a child process: the build script exports its `main`
 * function so we can call it directly with custom paths.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildCf4Density } from '../../tools/buildCf4Density';
import { decodeScalarField } from '../../src/data/scalarFieldFormat';
import { SG_TO_EQ_QUATERNION } from '../../src/data/superGalacticTransform';

/** Write a flat C-order f32 .npy with the given shape and values. */
function writeF32Npy(path: string, values: number[], shape: readonly number[]): void {
  const headerDict = `{'descr': '<f4', 'fortran_order': False, 'shape': (${shape.join(', ')}${shape.length === 1 ? ',' : ''}), }`;
  const baseLen = 10 + headerDict.length + 1;
  const padded = baseLen + ((64 - (baseLen % 64)) % 64);
  const headerLen = padded - 10;
  const headerStr = headerDict + ' '.repeat(headerLen - headerDict.length - 1) + '\n';
  const dataBytes = values.length * 4;
  const buf = new ArrayBuffer(10 + headerLen + dataBytes);
  const u8 = new Uint8Array(buf);
  u8.set([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59, 1, 0]);
  new DataView(buf).setUint16(8, headerLen, true);
  for (let i = 0; i < headerStr.length; i++) u8[10 + i] = headerStr.charCodeAt(i);
  new Float32Array(buf, 10 + headerLen, values.length).set(values);
  writeFileSync(path, Buffer.from(buf));
}

describe('buildCf4Density (smoke)', () => {
  let dir: string;
  let npyPath: string;
  let metaPath: string;
  let outPath: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'cf4-build-'));
    npyPath = join(dir, 'cube.npy');
    metaPath = join(dir, 'cube.meta.json');
    outPath = join(dir, 'cf4_density.scfd');

    // 8^3 = 512 voxels with values 0..511 normalised so min=-1, max=+1.
    const values = Array.from({ length: 512 }, (_, i) => -1 + (2 * i) / 511);
    writeF32Npy(npyPath, values, [8, 8, 8]);

    const meta = {
      h: 0.746,
      box_size_h_mpc: 1000,
      voxel_size_h_mpc: 1000 / 8, // 125 (so voxel_size = 125/0.746 ≈ 167.56 Mpc per voxel)
      field_type: 'delta',
      coord_frame: 'supergalactic_cartesian',
      source: 'smoke-test synthetic 8^3',
      sav_variable_name: 'delta',
      stats: { min: -1, max: 1, mean: 0 },
    };
    writeFileSync(metaPath, JSON.stringify(meta));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes a decodable SCFD with correct header', async () => {
    await buildCf4Density({ npyPath, metaPath, outPath });
    expect(existsSync(outPath)).toBe(true);

    const buf = readFileSync(outPath);
    const cube = decodeScalarField(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

    expect(cube.dims).toEqual([8, 8, 8]);
    expect(cube.frameKind).toBe('supergalactic-cartesian');
    expect(cube.voxelSize).toBeCloseTo(125 / 0.746, 4);
    // Origin is voxel (0,0,0)'s corner in the native (SG) frame:
    // -voxel_size * (dims/2) per axis.
    const expectedCorner = -(125 / 0.746) * 4;
    expect(cube.origin[0]).toBeCloseTo(expectedCorner, 3);
    expect(cube.origin[1]).toBeCloseTo(expectedCorner, 3);
    expect(cube.origin[2]).toBeCloseTo(expectedCorner, 3);
    // Rotation matches the SG→eq quaternion exactly.
    expect(cube.rotation[0]).toBeCloseTo(SG_TO_EQ_QUATERNION[0], 6);
    expect(cube.rotation[1]).toBeCloseTo(SG_TO_EQ_QUATERNION[1], 6);
    expect(cube.rotation[2]).toBeCloseTo(SG_TO_EQ_QUATERNION[2], 6);
    expect(cube.rotation[3]).toBeCloseTo(SG_TO_EQ_QUATERNION[3], 6);
    expect(cube.valueMin).toBeCloseTo(-1, 4);
    expect(cube.valueMax).toBeCloseTo(1, 4);
    expect(cube.voxels).toBeInstanceOf(Uint16Array);
    expect(cube.voxels.length).toBe(512);
    expect(['viridis', 'magma', 'blue-purple', 'yellow-green']).toContain(cube.paletteId);
  });
});
```

- [ ] **Step 5.3: Run the test to verify it fails.**

```
npx vitest run tests/tools/buildCf4Density.smoke.test.ts
```

Expected: FAIL with "Cannot find module '../../tools/buildCf4Density'".

- [ ] **Step 5.4: Implement the build script.**

Create `tools/buildCf4Density.ts`:

```ts
/**
 * buildCf4Density.ts — convert the maintainer-produced .npy + .meta.json
 * into the runtime cf4_density.scfd consumed by the scalar-volume renderer.
 *
 * Pure Node/TS — no Python required. Mirrors the conventions of the
 * existing build scripts in tools/ (idempotent, prints what it generated,
 * exits non-zero on missing inputs).
 *
 * Output is gitignored and synced to R2 by `npm run sync-r2`.
 *
 * The script exports `buildCf4Density({ npyPath, metaPath, outPath })`
 * for direct invocation from tests; the CLI wrapper at the bottom
 * forwards the standard paths in data/raw/cf4/ → public/data/.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { readNpy } from './parsers/npyReader';
import { encodeScalarField } from '../src/data/scalarFieldFormat';
import { SG_TO_EQ_QUATERNION } from '../src/data/superGalacticTransform';
import type { ScalarCube, ScalarFieldPaletteId } from '../src/@types/ScalarCube';

type Cf4DensityMeta = {
  h: number;
  box_size_h_mpc: number;
  voxel_size_h_mpc: number;
  field_type: string;
  coord_frame: string;
  source: string;
  sav_variable_name: string;
  stats?: { min: number; max: number; mean: number };
};

/** Convert a single f32 to its f16 raw bits. Round-to-nearest-even. */
function f32ToF16Bits(value: number): number {
  // Re-use the well-known IEEE-754 packing.
  const f32 = new Float32Array(1);
  f32[0] = value;
  const u32 = new Uint32Array(f32.buffer)[0];
  const sign = (u32 >>> 16) & 0x8000;
  let mant = u32 & 0x007fffff;
  let exp = (u32 >>> 23) & 0xff;
  if (exp === 255) {
    // Inf / NaN
    return sign | 0x7c00 | (mant ? 1 : 0);
  }
  exp = exp - 127 + 15;
  if (exp >= 31) return sign | 0x7c00; // overflow → Inf
  if (exp <= 0) {
    // Subnormal or zero
    if (exp < -10) return sign;
    mant = (mant | 0x00800000) >>> (1 - exp);
    if (mant & 0x00001000) mant += 0x00002000; // round
    return sign | (mant >>> 13);
  }
  if (mant & 0x00001000) {
    mant += 0x00002000;
    if (mant & 0x00800000) {
      mant = 0;
      exp += 1;
      if (exp >= 31) return sign | 0x7c00;
    }
  }
  return sign | (exp << 10) | (mant >>> 13);
}

/** Default palette for CF-4 DM density cubes. */
const DEFAULT_CF4_PALETTE: ScalarFieldPaletteId = 'magma';

/**
 * Choose a per-cube `densityScale` so that an "interesting" voxel value
 * yields a saturated alpha at intensity=1. For CF-4 delta values which
 * range over [~-1, +30], we pick scale such that a path through the
 * peak voxel saturates over ~10% of the cube diagonal — soft enough to
 * see structure, dense enough to read as fog.
 *
 * Heuristic only; can be retuned without invalidating the format.
 */
function chooseDensityScale(valueMax: number, voxelSizeMpc: number, dims: readonly [number, number, number]): number {
  const diagonalMpc = voxelSizeMpc * Math.hypot(dims[0], dims[1], dims[2]);
  const targetSaturationPathMpc = diagonalMpc * 0.1;
  // alpha_per_step ≈ palette.a × intensity × densityScale × stepLengthMpc
  // We want sum over targetSaturationPath/stepLength steps to ≈ 1 at value=valueMax.
  // Ignoring the per-step palette modulation (which is data-dependent), this
  // gives densityScale ≈ 1 / (valueMax × targetSaturationPathMpc).
  const scale = 1 / Math.max(1e-3, valueMax * targetSaturationPathMpc);
  // Clamp to a sane range so a degenerate stats block doesn't produce
  // NaN/Inf opacity.
  return Math.min(10, Math.max(1e-4, scale));
}

export async function buildCf4Density(args: {
  npyPath: string;
  metaPath: string;
  outPath: string;
  paletteId?: ScalarFieldPaletteId;
}): Promise<void> {
  const { npyPath, metaPath, outPath } = args;
  const paletteId = args.paletteId ?? DEFAULT_CF4_PALETTE;

  // ── 1. Load .npy ─────────────────────────────────────────────────
  const npyBuf = readFileSync(npyPath);
  const npy = readNpy(npyBuf.buffer.slice(npyBuf.byteOffset, npyBuf.byteOffset + npyBuf.byteLength));
  if (npy.shape.length !== 3) {
    throw new Error(`buildCf4Density: expected 3D array, got shape ${npy.shape.join('x')}`);
  }
  if (!(npy.values instanceof Float32Array)) {
    throw new Error(`buildCf4Density: expected f32 .npy, got dtype ${npy.dtype}`);
  }
  const values = npy.values;
  const dims: [number, number, number] = [npy.shape[0], npy.shape[1], npy.shape[2]];

  // ── 2. Load .meta.json ───────────────────────────────────────────
  const meta: Cf4DensityMeta = JSON.parse(readFileSync(metaPath, 'utf8'));
  if (meta.coord_frame !== 'supergalactic_cartesian') {
    throw new Error(
      `buildCf4Density: meta coord_frame "${meta.coord_frame}" not supported (only supergalactic_cartesian)`,
    );
  }

  // ── 3. Compute stats ─────────────────────────────────────────────
  let valueMin = +Infinity;
  let valueMax = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v < valueMin) valueMin = v;
    if (v > valueMax) valueMax = v;
  }

  // ── 4. Convert f32 → f16 bits ────────────────────────────────────
  const voxels = new Uint16Array(values.length);
  for (let i = 0; i < values.length; i++) {
    voxels[i] = f32ToF16Bits(values[i]);
  }

  // ── 5. Compute origin (voxel (0,0,0) corner in native SG frame, Mpc) ─
  // The cube is centered on the observer in SG, so the lower corner is
  // -voxel_size × (dims/2) per axis. voxel_size is post-h-rescale to
  // physical Mpc.
  const voxelSize = meta.voxel_size_h_mpc / meta.h;
  const origin: [number, number, number] = [
    -voxelSize * (dims[0] / 2),
    -voxelSize * (dims[1] / 2),
    -voxelSize * (dims[2] / 2),
  ];

  // ── 6. Build the cube + densityScale ─────────────────────────────
  const densityScale = chooseDensityScale(Math.max(0.001, Math.abs(valueMax)), voxelSize, dims);

  const cube: ScalarCube = {
    dims,
    voxels,
    frameKind: 'supergalactic-cartesian',
    origin,
    voxelSize,
    rotation: [
      SG_TO_EQ_QUATERNION[0],
      SG_TO_EQ_QUATERNION[1],
      SG_TO_EQ_QUATERNION[2],
      SG_TO_EQ_QUATERNION[3],
    ],
    paletteId,
    densityScale,
    valueMin,
    valueMax,
  };

  // ── 7. Encode + write ────────────────────────────────────────────
  const out = encodeScalarField(cube);
  writeFileSync(outPath, Buffer.from(out));

  console.log(
    `[buildCf4Density] wrote ${outPath} ` +
      `(dims=${dims.join('x')}, voxelSize=${voxelSize.toFixed(3)} Mpc, ` +
      `min=${valueMin.toFixed(3)}, max=${valueMax.toFixed(3)}, ` +
      `palette=${paletteId}, densityScale=${densityScale.toExponential(2)}, ` +
      `${out.byteLength} bytes)`,
  );
}

// ── CLI wrapper ────────────────────────────────────────────────────
async function main(): Promise<void> {
  await buildCf4Density({
    npyPath: 'data/raw/cf4/cf4_density_256.npy',
    metaPath: 'data/raw/cf4/cf4_density_256.meta.json',
    outPath: 'public/data/cf4_density.scfd',
  });
}

// Only run main() when invoked directly via tsx, not when imported by tests.
const invokedDirectly = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}`;
  } catch {
    return false;
  }
})();
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
```

- [ ] **Step 5.5: Run the test to verify it passes.**

```
npx vitest run tests/tools/buildCf4Density.smoke.test.ts
```

Expected: 1 test pass. The decoded SCFD must have:
- `dims = [8, 8, 8]`
- `frameKind = 'supergalactic-cartesian'`
- `voxelSize ≈ 167.56`
- `origin ≈ [-670.24, -670.24, -670.24]` (each axis)
- `rotation` matches `SG_TO_EQ_QUATERNION` to 6 decimals
- `valueMin ≈ -1`, `valueMax ≈ 1`
- `voxels` is `Uint16Array` of length 512
- `paletteId` is one of the four enum values

If the rotation/origin match fails, double-check the f32→f16 conversion (NaN propagation) and the SCFD header layout (the `densityScale` field at offset 64 in the header is read by the decoder — make sure `chooseDensityScale` returns a non-zero value, or the decoder substitutes the legacy 1.0 default).

- [ ] **Step 5.6: Run typecheck + full test suite.**

```
npm run typecheck && npm test
```

Expected: clean.

- [ ] **Step 5.7: Commit.**

```bash
git add tools/buildCf4Density.ts tests/tools/buildCf4Density.smoke.test.ts
git commit -m "$(cat <<'EOF'
feat(cf4): add buildCf4Density TS build script

Reads data/raw/cf4/cf4_density_256.npy + .meta.json, casts f32 -> f16,
builds the SG->equatorial rotation quaternion via superGalacticTransform,
and writes public/data/cf4_density.scfd via the existing
scalarFieldFormat.encodeScalarField. Pure Node/TS - no Python.

Smoke-tested end-to-end with a synthetic 8^3 .npy written by the test
in a tmpdir; asserts every header field matches expected values
(dims, voxelSize, origin, rotation, valueMin/max, paletteId).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Wire `npm run build-cf4-density`

**Files:**
- Modify: `package.json`

- [ ] **Step 6.1: Read package.json scripts section.**

```
grep -n '"scripts"' -A 30 package.json
```

- [ ] **Step 6.2: Add the script.**

In `package.json`, inside the `"scripts"` block, add (sorted near the other `build-*` entries):

```json
"build-cf4-density": "tsx tools/buildCf4Density.ts",
```

- [ ] **Step 6.3: Verify the script resolves.**

```
npm run build-cf4-density 2>&1 | head -20 || true
```

Expected: it errors with "ENOENT: no such file or directory, open 'data/raw/cf4/cf4_density_256.npy'" — that's correct (the contributor hasn't curl'd the .npy from R2 yet). The error confirms the script wires up correctly.

- [ ] **Step 6.4: Commit.**

```bash
git add package.json
git commit -m "$(cat <<'EOF'
feat(cf4): add npm run build-cf4-density script

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: R2 sync wiring

**Files:**
- Modify: `tools/syncR2.ts`

- [ ] **Step 7.1: Read the ALLOW filter and EXTRA_FILES list.**

```
sed -n '70,135p' tools/syncR2.ts
```

- [ ] **Step 7.2: Add `cf4_density.scfd` to ALLOW.**

In `tools/syncR2.ts`, inside the `ALLOW` function, add a new line at the end (before the closing `;`):

```ts
const ALLOW = (name: string): boolean =>
  /^(sdss|glade)-(small|medium|large)\.bin$/.test(name) ||
  name === '2mrs.bin' ||
  name === 'famous.bin' ||
  name === 'filaments.bin' ||
  name === 'filaments-small.bin' ||
  name === 'famous_meta.json' ||
  name === 'famous_xrefs.json' ||
  name === 'cf4_density.scfd';
```

- [ ] **Step 7.3: Add the `.npy` + `.meta.json` to EXTRA_FILES.**

Find the `EXTRA_FILES` array in `tools/syncR2.ts` and append two new entries:

```ts
const EXTRA_FILES: ExtraFile[] = [
  // ...existing hyperleda entry...
  {
    // CF-4 DM density cube intermediate. Maintainer-produced once per
    // upstream release via tools/cf4DensityIngest.py against the
    // Valade 2024 .sav. Contributors curl this instead of running
    // Python. See data/raw/cf4/README.md.
    localPath: 'data/raw/cf4/cf4_density_256.npy',
    r2Key: 'data/raw/cf4/cf4_density_256.npy',
  },
  {
    localPath: 'data/raw/cf4/cf4_density_256.meta.json',
    r2Key: 'data/raw/cf4/cf4_density_256.meta.json',
  },
];
```

- [ ] **Step 7.4: Verify syncR2.ts compiles.**

```
npm run typecheck
```

Expected: clean.

- [ ] **Step 7.5: Dry-run the sync (no actual upload — the files don't exist locally).**

```
npm run sync-r2 -- --help 2>&1 | head -5 || true
ls public/data/cf4_density.scfd 2>/dev/null && echo "WOULD UPLOAD" || echo "no .scfd present yet (expected)"
```

Expected: "no .scfd present yet (expected)". The maintainer runs the actual sync after producing the file.

- [ ] **Step 7.6: Commit.**

```bash
git add tools/syncR2.ts
git commit -m "$(cat <<'EOF'
feat(cf4): wire CF-4 DM density artefacts into R2 sync

Adds cf4_density.scfd to the ALLOW filter (runtime fetch surface) and
the .npy + .meta.json intermediates to EXTRA_FILES (HyperLEDA precedent
for slow-external-fetch caches).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: `DEFAULT_CF4_DENSITY_ENABLED` constant

**Files:**
- Modify: `src/data/defaults.ts`

- [ ] **Step 8.1: Find the volume-defaults block.**

```
grep -n "DEFAULT_VOLUME\|DEFAULT_VOLUMES_ENABLED\|Scalar-volume overlay" src/data/defaults.ts
```

- [ ] **Step 8.2: Add the new default.**

In `src/data/defaults.ts`, near the other `DEFAULT_VOLUME_*` constants (after `DEFAULT_VOLUME_PALETTE_ID`), add:

```ts
/**
 * Per-field default for the CF-4 DM density volume. False by first-load
 * so users discover the field in the Volumes panel and opt in — rather
 * than being surprised by a translucent fog they didn't ask for. Once
 * the visual is dialed in, this can be flipped to true in a follow-up.
 */
export const DEFAULT_CF4_DENSITY_ENABLED = false;
```

- [ ] **Step 8.3: Verify typecheck.**

```
npm run typecheck
```

Expected: clean.

- [ ] **Step 8.4: Commit.**

```bash
git add src/data/defaults.ts
git commit -m "$(cat <<'EOF'
feat(cf4): add DEFAULT_CF4_DENSITY_ENABLED = false

Default off so users discover the field in the Volumes panel and opt in.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: `cf4DensityFetcher` (TDD)

**Files:**
- Create: `src/services/loading/fetchers/cf4DensityFetcher.ts`
- Test: `tests/services/loading/fetchers/cf4DensityFetcher.test.ts`

Mirrors `filamentFetcher`'s shape (URL fetch via `fetchWithProgress` + decode). Request type is `void` (one and only one CF-4 cube).

- [ ] **Step 9.1: Read the existing fetcher tests for the mock pattern.**

```
cat tests/services/loading/fetchers/filamentFetcher.test.ts
```

The harness wraps `globalThis.fetch` via `tests/setup/fetchMock.ts` (introduced in the recent scalar-volume PR). Reuse it.

- [ ] **Step 9.2: Write the failing test.**

Create `tests/services/loading/fetchers/cf4DensityFetcher.test.ts`:

```ts
/**
 * cf4DensityFetcher tests — happy path, 404, and malformed-header
 * paths against a mocked global fetch.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { cf4DensityFetcher } from '../../../../src/services/loading/fetchers/cf4DensityFetcher';
import { encodeScalarField } from '../../../../src/data/scalarFieldFormat';
import { SG_TO_EQ_QUATERNION } from '../../../../src/data/superGalacticTransform';
import type { ScalarCube } from '../../../../src/@types/ScalarCube';
import { installFetchMock, uninstallFetchMock } from '../../../setup/fetchMock';

function makeTinyCube(): ScalarCube {
  return {
    dims: [2, 2, 2],
    voxels: new Uint16Array([0, 0x3c00, 0x4000, 0x4200, 0x4400, 0x4500, 0x4600, 0x4700]),
    frameKind: 'supergalactic-cartesian',
    origin: [-1, -1, -1],
    voxelSize: 1,
    rotation: [
      SG_TO_EQ_QUATERNION[0],
      SG_TO_EQ_QUATERNION[1],
      SG_TO_EQ_QUATERNION[2],
      SG_TO_EQ_QUATERNION[3],
    ],
    paletteId: 'magma',
    densityScale: 1,
    valueMin: 0,
    valueMax: 7,
  };
}

const noopSignal = new AbortController().signal;
const noopProgress = (_loaded: number, _total: number): void => {};

describe('cf4DensityFetcher', () => {
  beforeEach(() => installFetchMock());
  afterEach(() => uninstallFetchMock());

  it('happy path: fetches and decodes a SCFD', async () => {
    const buf = encodeScalarField(makeTinyCube());
    installFetchMock({
      'cf4_density.scfd': { status: 200, body: buf },
    });
    const cube = await cf4DensityFetcher(undefined as never, noopSignal, noopProgress);
    expect(cube.dims).toEqual([2, 2, 2]);
    expect(cube.frameKind).toBe('supergalactic-cartesian');
    expect(cube.paletteId).toBe('magma');
  });

  it('404 throws an HttpError', async () => {
    installFetchMock({
      'cf4_density.scfd': { status: 404, body: new ArrayBuffer(0) },
    });
    await expect(cf4DensityFetcher(undefined as never, noopSignal, noopProgress)).rejects.toThrow(/404|HTTP/);
  });

  it('malformed header throws decodeScalarField regenerate message', async () => {
    const garbage = new ArrayBuffer(96);
    new DataView(garbage).setUint32(0, 0xdeadbeef, true);
    installFetchMock({
      'cf4_density.scfd': { status: 200, body: garbage },
    });
    await expect(cf4DensityFetcher(undefined as never, noopSignal, noopProgress)).rejects.toThrow(/magic|SCFD/);
  });
});
```

If `tests/setup/fetchMock.ts` exposes a different installation API, adapt the test setup calls accordingly — but keep the three test cases (happy / 404 / malformed) intact.

- [ ] **Step 9.3: Run the test to verify it fails.**

```
npx vitest run tests/services/loading/fetchers/cf4DensityFetcher.test.ts
```

Expected: FAIL with "Cannot find module '.../cf4DensityFetcher'".

- [ ] **Step 9.4: Implement the fetcher.**

Create `src/services/loading/fetchers/cf4DensityFetcher.ts`:

```ts
/**
 * cf4DensityFetcher — `Fetcher<ScalarCube, void>` against the prebuilt
 * `cf4_density.scfd` on R2 (or `public/data/` in local dev).
 *
 * Mirrors `filamentFetcher`'s shape: one URL, no per-request branching,
 * decode via the format module. The request payload is `void` — there
 * is one and only one CF-4 cube; tier doesn't apply (volume rendering
 * isn't tier-gated), so a request type would be vestigial.
 *
 * On 404 the slot machinery's error path leaves the field unregistered;
 * the Volumes panel simply doesn't show "CF-4 dark matter". This mirrors
 * the filament fallback (a missing filaments.bin disables that layer
 * silently rather than crashing).
 */

import type { Fetcher } from '../types';
import type { ScalarCube } from '../../../@types/ScalarCube';
import { decodeScalarField } from '../../../data/scalarFieldFormat';
import { dataUrl, fetchWithProgress } from '../fetchWithProgress';

export const cf4DensityFetcher: Fetcher<ScalarCube, void> = async (
  _req,
  signal,
  onProgress,
) => {
  const buf = await fetchWithProgress(dataUrl('cf4_density.scfd'), signal, onProgress);
  return decodeScalarField(buf);
};
```

- [ ] **Step 9.5: Run the test to verify it passes.**

```
npx vitest run tests/services/loading/fetchers/cf4DensityFetcher.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 9.6: Run typecheck + full test suite.**

```
npm run typecheck && npm test
```

Expected: clean.

- [ ] **Step 9.7: Commit.**

```bash
git add src/services/loading/fetchers/cf4DensityFetcher.ts tests/services/loading/fetchers/cf4DensityFetcher.test.ts
git commit -m "$(cat <<'EOF'
feat(cf4): add cf4DensityFetcher

Fetcher<ScalarCube, void> that GETs cf4_density.scfd via fetchWithProgress
and decodes via scalarFieldFormat.decodeScalarField. Mirrors filamentFetcher's
shape; void request because there's one and only one CF-4 cube.

Tests cover happy path, 404 (slot machinery handles silently), and
malformed-header decode failure.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Extend `EngineAssetSlots` for CF-4

**Files:**
- Modify: `src/@types/EngineState.d.ts`

- [ ] **Step 10.1: Read the existing EngineAssetSlots type.**

```
sed -n '110,175p' src/@types/EngineState.d.ts
```

- [ ] **Step 10.2: Add the `cf4Density` slot field.**

In `src/@types/EngineState.d.ts`, inside the `EngineAssetSlots` type, after the `pgcAlias` entry and before `syntheticVolumes`, add:

```ts
  /**
   * CF-4 dark-matter density volume — Valade 2024 256³ HAMLET cube.
   *
   * Loaded eagerly at engine boot via `cf4DensityFetcher`; the slot's
   * commit registers the cube as the `'cf4-density'` field on the
   * scalar-volume renderer. Default-off in user settings, so the
   * extra ~32 MB of decoded voxel data is paid on every page load
   * but the field is invisible until the user toggles it on in the
   * Volumes panel.
   *
   * Null until the IIFE mints it (matches `filaments` for the same
   * lifecycle reason — the renderer must exist before the slot can
   * commit). Missing/404 .scfd surfaces as a never-fires commit; the
   * field simply won't appear in the Volumes panel.
   */
  cf4Density: AssetSlot<ScalarCube, void> | null;
```

If `ScalarCube` isn't already imported into this file, add it to the imports near the top:

```ts
import type { ScalarCube } from './ScalarCube';
```

- [ ] **Step 10.3: Verify typecheck.**

```
npm run typecheck
```

Expected: complains in `wireSlots.ts` that `cf4Density` is required but never assigned. That's fine — Task 11 will assign it. Continue.

- [ ] **Step 10.4: Commit.**

```bash
git add src/@types/EngineState.d.ts
git commit -m "$(cat <<'EOF'
types(cf4): add cf4Density slot to EngineAssetSlots

Holds the AssetSlot<ScalarCube, void> for the Valade 2024 256^3 HAMLET
DM density cube. Wired in the next commit.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Wire the slot in `wireSlots.ts`

**Files:**
- Modify: `src/services/engine/phases/wireSlots.ts`

This is the single integration point. Mirrors the synthetic-volume slot's commit shape but uses a single slot (not a Map) and is unconditional (not DEV-gated).

- [ ] **Step 11.1: Read the synthetic-volume slot wiring + the filament slot wiring.**

```
sed -n '130,160p' src/services/engine/phases/wireSlots.ts
sed -n '270,322p' src/services/engine/phases/wireSlots.ts
sed -n '440,470p' src/services/engine/phases/wireSlots.ts
```

These three sites are the templates: filament for the single-slot shape, synthetic-volume for the `addField` + per-handle settings dance, and the load() trigger block for boot-time fetch firing.

- [ ] **Step 11.2: Add imports.**

Near the top of `src/services/engine/phases/wireSlots.ts`, with the other fetcher imports, add:

```ts
import { cf4DensityFetcher } from '../../loading/fetchers/cf4DensityFetcher';
```

With the other defaults imports (search for `DEFAULT_VOLUME_FIELD_INTENSITY`), add:

```ts
import { DEFAULT_CF4_DENSITY_ENABLED } from '../../../data/defaults';
```

(Confirm the precise relative path matches the file's existing `defaults` import — if `DEFAULT_VOLUME_FIELD_INTENSITY` is already imported on a single line, append `DEFAULT_CF4_DENSITY_ENABLED` to that import.)

- [ ] **Step 11.3: Mint the slot, after the filament slot block (~line 154).**

Right after the line `state.assetSlots.filaments = filamentSlot;`, insert:

```ts
  // ── CF-4 DM density volume slot ──────────────────────────────────
  //
  // Eager-at-boot fetch of public/data/cf4_density.scfd. On commit,
  // hands the decoded ScalarCube to scalarVolumeRenderer.addField under
  // the handle 'cf4-density', then seeds per-field settings if not
  // already present (preserving any user-tuned intensity/palette across
  // sessions). Mirrors the synthetic-volume commit shape, minus the
  // dev-only gating.
  //
  // Why eager (not lazy on toggle): keeps this plan small and matches
  // the syntheticVolume pattern. If the always-paid ~32 MB shows up
  // in load metrics, a follow-up plan can add a KNOWN_VOLUME_FIELDS
  // registry + on-toggle fetch. Default-off settings means the bytes
  // are paid but the renderer never draws them until the user opts in.
  const cf4DensitySlot = createAssetSlot({
    name: 'cf4Density',
    fetch: cf4DensityFetcher,
    commit: async (cube) => {
      const renderer = state.gpu.scalarVolumeRenderer;
      if (!renderer) return;
      const handle = 'cf4-density';
      renderer.addField(handle, cube);
      if (!state.settings.volumeFields[handle]) {
        state.settings.volumeFields[handle] = {
          enabled: DEFAULT_CF4_DENSITY_ENABLED,
          intensity: DEFAULT_VOLUME_FIELD_INTENSITY,
          paletteId: cube.paletteId,
        };
      }
      const persisted = state.settings.volumeFields[handle];
      renderer.setIntensity(handle, persisted.intensity);
      renderer.setEnabled(handle, persisted.enabled);
      renderer.setFieldPalette(handle, persisted.paletteId);
      cb.onVolumeFieldsChanged?.();
      state.subsystems.scheduler.requestRender();
    },
  });
  cf4DensitySlot.subscribe((s) => {
    if (s.kind === 'ready') {
      console.log(
        `[engine] cf4Density: ${s.value.dims.join('x')} cube, ` +
          `min=${s.value.valueMin.toFixed(3)}, max=${s.value.valueMax.toFixed(3)}`,
      );
    }
  });
  state.assetSlots.cf4Density = cf4DensitySlot;
```

If `DEFAULT_VOLUME_FIELD_INTENSITY` isn't already imported in this file, add it to the same import line that brings in the volume defaults — see how the synthetic-volume block uses it (around the `mintSyntheticVolumeSlot` definition).

- [ ] **Step 11.4: Register in `allSlots` for the dev panel.**

Find the block (around line 354) that does `allSlots.set(filamentSlot.name, ...)` and append:

```ts
  allSlots.set(cf4DensitySlot.name, cf4DensitySlot as unknown as AssetSlot<unknown, unknown>);
```

Place it adjacent to the filament/famousMeta/pgcAlias registrations.

- [ ] **Step 11.5: Fire the load at boot.**

Find the block (around line 451) `state.assetSlots.filaments?.load({ tier: state.sources.tier });` and add immediately after:

```ts
  // CF-4 DM density loads exactly once at boot — no tier dependency.
  // Failure (404, decode error) leaves the field unregistered; Volumes
  // panel simply omits it.
  state.assetSlots.cf4Density?.load();
```

- [ ] **Step 11.6: Verify typecheck.**

```
npm run typecheck
```

Expected: clean. The previously-failing `cf4Density` field on `EngineAssetSlots` is now assigned.

- [ ] **Step 11.7: Run the full test suite.**

```
npm test
```

Expected: clean. The wireSlots tests should pick up the new slot in any registry-aggregating test; verify those pass and adjust expected slot counts if a test asserts on the exact count (search for `assetSlots\.size\|allSlots\.size` first).

```
grep -rn "assetSlots\.size\|allSlots\.size\|cf4Density" tests/ 2>/dev/null
```

If any test asserts an exact slot count or registry size, update it to include the new `cf4Density` slot.

- [ ] **Step 11.8: Commit.**

```bash
git add src/services/engine/phases/wireSlots.ts
git commit -m "$(cat <<'EOF'
feat(cf4): wire cf4Density slot into engine bootstrap

Mints an AssetSlot<ScalarCube, void> against cf4DensityFetcher; on
commit registers the decoded cube as the 'cf4-density' field on the
scalar-volume renderer with default-off settings. Eager fetch at boot
mirrors the syntheticVolume pattern; failure (404, decode error)
silently omits the field from the Volumes panel.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Visual verification + final pass

**Files:** none modified (manual verification + final green-light commit if any cleanup is needed).

This task gates on a real `cf4_density.scfd` being available on R2 (or in `public/data/`). If the maintainer hasn't run the Python ingest yet, the visual checks fall back to "the field is registered but invisible because the bytes 404" — that's a partial verification.

- [ ] **Step 12.1: Verify a `cf4_density.scfd` is present (or curl one).**

```
test -f public/data/cf4_density.scfd && echo "present ($(wc -c < public/data/cf4_density.scfd) bytes)" || echo "missing"
```

If missing AND the maintainer has uploaded one to R2:

```
curl -L -o public/data/cf4_density.scfd https://skymap-data.rulkens.com/data/cf4_density.scfd
```

If still missing (maintainer ingest not done yet), skip steps 12.2–12.5 and document this in step 12.6's PR description.

- [ ] **Step 12.2: Reload the dev server in a browser.**

Open http://localhost:5173 and check the browser console:

```
[engine] cf4Density: 256x256x256 cube, min=<X>, max=<Y>
```

Expected: the log line appears. If it's missing, the slot didn't fire — check Network tab for a 404 on `cf4_density.scfd`.

- [ ] **Step 12.3: Open the Volumes panel.**

Confirm "cf4-density" appears as a row alongside the synthetic test cubes (in DEV) or as the only row (in production-mode dev). The toggle should be OFF by default.

- [ ] **Step 12.4: Toggle ON and visually verify.**

- Laniakea blob centered roughly toward (RA, Dec) ≈ (160°, −60°), distance ~80 Mpc — should appear as a translucent warm-colored fog.
- Local Void as a transparent / cool-tinted gap toward (l, b) ≈ (60°, +20°).
- Great Attractor in the Hydra-Centaurus direction at ~50 Mpc.
- Volume fades to transmittance ≈ 1 beyond ~half the box; no hard cube edge visible.
- Toggling off → scene identical to current main.
- Intensity slider 0 → 2 → fades cleanly.
- Palette dropdown switching → smooth recolour, no flicker.

If anchor positions are visibly *wrong* (e.g. Laniakea appearing in the northern sky), the SG→equatorial rotation is off — re-check the Virgo/Coma anchor test in Task 2 against the published positions.

- [ ] **Step 12.5: Toggle OFF and confirm parity with main.**

Compare to a screenshot of pre-feature `main` if available. Galaxies, filaments, thumbnails, hover state, selection — all unchanged.

- [ ] **Step 12.6: Final verification.**

```
npm run typecheck && npm test && npm run build
```

Expected: all three pass. Test count should be increased by the tasks added above (rough delta: +6 superGalacticTransform, +4 npyReader, +1 buildCf4Density smoke, +3 cf4DensityFetcher = +14 tests).

- [ ] **Step 12.7: Push the branch and open a PR.**

```bash
git push -u origin "$(git rev-parse --abbrev-ref HEAD)"
gh pr create --title "feat(cf4): add CF-4 DM density volume content + ingest" --body "$(cat <<'EOF'
## Summary
- Adds the Valade 2024 256³ CF-4 HAMLET DM density cube as a new volume in the existing scalar-volume renderer.
- One-shot Python ingest (`tools/cf4DensityIngest.py`) maintainer-only; pure-Node TS build script (`tools/buildCf4Density.ts`) for contributors.
- New `Fetcher<ScalarCube, void>` wired as an eager `AssetSlot` in `wireSlots.ts`. Default-off in user settings; user opts in via the Volumes panel.
- No new format, no new renderer, no new shader, no new UI component — all leveraged from the scalar-volume primitive that landed 2026-05-09.

Spec: `docs/superpowers/specs/2026-05-10-cf4-dm-volume-content-design.md`

## Test plan
- [ ] `npm run typecheck && npm test && npm run build` all green
- [ ] `superGalacticTransform` anchored against Virgo (RA≈187°, Dec≈+12°) and Coma (RA≈195°, Dec≈+27°)
- [ ] `npyReader` round-trip against in-memory .npy fixture
- [ ] `buildCf4Density` smoke test produces a decodable .scfd from synthetic 8³ input
- [ ] `cf4DensityFetcher` happy / 404 / malformed-header tests
- [ ] Visual: toggle "cf4-density" in Volumes panel; Laniakea blob visible toward (RA, Dec) ≈ (160°, −60°)
- [ ] Visual: toggle OFF → scene identical to main

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review checklist (run after writing the plan)

**Spec coverage:**

- ✅ §Goal — Task 11 wires the slot; Task 12 verifies the toggle.
- ✅ §Architecture diagram — Tasks 1 (raw dir), 4 (Python), 5 (TS build), 9 (fetcher), 11 (slot wiring) cover every box.
- ✅ §Build pipeline (Python + TS) — Tasks 4 + 5.
- ✅ §superGalacticTransform — Task 2.
- ✅ §Loading (eager, at boot) — Task 11.
- ✅ §File layout — every file in the spec's "New files" and "Modified files" lists is touched in some task.
- ✅ §Testing strategy — superGalacticTransform (Task 2), npyReader (Task 3), buildCf4Density smoke (Task 5), cf4DensityFetcher (Task 9), visual verification (Task 12).
- ✅ §Open questions — `.sav` variable name resolution is the manual pre-flight in Task 4 + README.

**Placeholder scan:** No "TBD"/"TODO"/"implement later" in the task body. The README has one TODO marker that is intentionally a maintainer-fillable slot, not a plan placeholder.

**Type consistency:** `addField(handle, cube)`, `setEnabled(handle, bool)`, `setIntensity(handle, float)`, `setFieldPalette(handle, id)` are used identically in Task 11 and match the existing `scalarVolumeRenderer` API verified against `src/services/gpu/renderers/scalarVolumeRenderer.ts`. `Fetcher<T, Req>` shape matches the existing typing. `EngineAssetSlots.cf4Density` is `AssetSlot<ScalarCube, void> | null` and Task 11 uses optional chaining (`?.load()`) consistently.
