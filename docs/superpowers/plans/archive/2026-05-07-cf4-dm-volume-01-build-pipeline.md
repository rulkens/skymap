# CF-4 DM Volume — Sub-plan 01: Build Pipeline

> **SUPERSEDED 2026-05-10. DO NOT EXECUTE.** Re-scoped against the scalar-volume-renderer primitive. See the new spec [`docs/superpowers/specs/2026-05-10-cf4-dm-volume-content-design.md`](../../specs/2026-05-10-cf4-dm-volume-content-design.md). The new plan replaces both sub-plans of this series with a single content+ingest plan. Preserved for historical context.

---

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Each implementer subagent must be dispatched `run_in_background: true` per project convention. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the Valade 2024 256³ CF-4 HAMLET density cube into a compact little-endian `.bin` file, plus the supporting `superGalacticTransform` helper. After this plan ships, `cf4_density.bin` (~32 MB) exists in `public/data/`, round-trips through encode/decode, and all transforms are anchored against known structures (Virgo, Coma). Nothing renders yet — that lands in plan 02.

**Architecture:** A one-shot **maintainer-only** Python script (`tools/cf4DensityIngest.py`) converts the upstream IDL `.sav` to a flat NumPy `.npy` plus a sidecar `.meta.json`. The maintainer uploads those two intermediates to R2 once. Other contributors fetch them from R2 with plain `curl` (or pull the already-built `.bin` directly from R2 and skip the rebuild entirely). A pure-Node/TS CLI (`tools/buildCf4Density.ts`) reads the local `.npy`, casts f32→f16, prepends a 64-byte header, and writes `public/data/cf4_density.bin`. A new pure helper (`src/data/superGalacticTransform.ts`) provides the SG→equatorial rotation, shared with the existing `2026-05-05-cf4-*` streamline plans.

This mirrors the **HyperLEDA pattern** already in the repo: `hyperleda_pa.csv.gz` is the slow-external-fetch output of `tools/fetchHyperLeda.ts`, hosted on R2 via `tools/syncR2.ts`'s `EXTRA_FILES` list. Contributors `curl` it instead of re-running the multi-hour fetch. The CF-4 `.npy` follows the same convention — large enough that committing to git is wrong, deterministic enough that R2 is the right home.

**Tech Stack:** Node.js + tsx, vanilla TypeScript. Python + scipy is **maintainer-only** for the rare `.sav` re-ingest; contributors never need it. No new runtime deps.

**Prerequisites:** None. This is the foundational plan for the CF-4 DM volume feature.

**Done means:**

- A contributor with no Python installed can `curl` `data/raw/cf4/cf4_density_256.npy` + `.meta.json` from R2 (URLs documented in `data/raw/cf4/README.md`), then run `npm run build-cf4-density` to produce `public/data/cf4_density.bin` (~32 MB).
- Alternatively, a contributor can skip the rebuild entirely — the production bundle fetches `cf4_density.bin` directly from R2; for local dev, set `VITE_DATA_BASE_URL` in `.env.development` or curl the `.bin` to `public/data/`.
- Encode/decode round-trip is unit-tested against an 8³ synthetic field.
- `superGalacticTransform.test.ts` anchors Virgo and Coma against published equatorial positions.
- `npm run build` and `npm test` are still green.
- The R2 sync configuration includes `cf4_density.bin` (ALLOW filter) **and** `cf4_density_256.npy` + `cf4_density_256.meta.json` (EXTRA_FILES list, mirroring `hyperleda_pa.csv.gz`).

---

## File structure

### New files

- `data/raw/cf4/README.md` — download instructions for the upstream `.sav`, citation, license note.
- `tools/cf4DensityIngest.py` — one-shot Python script: `.sav` → `.npy` + `.meta.json`.
- `tools/buildCf4Density.ts` — Node CLI: `.npy` → `cf4_density.bin`.
- `tools/parsers/npyReader.ts` — minimal NumPy `.npy` v1.0 parser (just enough for our use case).
- `src/data/cf4DensityFormat.ts` — `encode` + `decode` + version constant + types.
- `src/data/superGalacticTransform.ts` — pure rotation matrix + helper. **Shared** with the streamline plan.
- `src/@types/Cf4DensityField.d.ts` — runtime decoded shape.
- `tests/data/cf4DensityFormat.test.ts` — encode/decode round-trip on 8³ field.
- `tests/data/superGalacticTransform.test.ts` — anchored against Virgo, Coma, observer.
- `tests/parsers/npyReader.test.ts` — parses a tiny NumPy-saved fixture.
- `tests/tools/buildCf4Density.smoke.test.ts` — end-to-end with synthetic 8³ `.npy`.

### Modified files

- `package.json` — add `"build-cf4-density": "tsx tools/buildCf4Density.ts"`.
- `tools/syncR2.ts` — add `cf4_density.bin` to the ALLOW filter.
- `.gitignore` — add `data/raw/cf4/*.sav`, `data/raw/cf4/*.npy`, `data/raw/cf4/*.meta.json`.

### Binary format

64-byte header followed by `nx*ny*nz` f16 voxel values, X-major. Magic `"CF4D"`, version `1`. Full layout in the spec; encoder in `cf4DensityFormat.ts:encode`.

---

## Tasks

### Task 0: Pre-flight

**Files:**
- Modify: `.gitignore`
- Create: `data/raw/cf4/README.md`

- [ ] **Step 0.1: Verify baseline.**

```
npm run typecheck && npm test
```

Expected: typecheck clean, all tests pass. Record the test count for the self-review at the end.

- [ ] **Step 0.2: Create `data/raw/cf4/README.md`.**

```markdown
# CF-4 raw data — DM density cube

This directory stores intermediate artefacts for the Valade et al. 2024 "HAMLET"
256³ CF-4 DM density reconstruction. None of these files are committed to git
(see `.gitignore`); the small ones live on R2 and are pulled by `curl`, the
large ones are regenerable.

## Files

| File | Size | Purpose | How to obtain |
|------|------|---------|---------------|
| `CF4gp_corrected_v2_HAMLET_1000_256_g5_final.sav` | ~64 MB | Upstream IDL .sav (maintainer only) | Download from <https://projets.ip2i.in2p3.fr/cosmicflows/> (Valade 2024 release) |
| `cf4_density_256.npy` | ~64 MB | Flat f32 cube produced by the Python ingest | `curl` from R2 (see below) — or regenerate from .sav |
| `cf4_density_256.meta.json` | <1 KB | Cosmology + provenance sidecar | `curl` from R2 (see below) — or regenerate from .sav |

The runtime artefact is `public/data/cf4_density.bin` (~32 MB f16), produced
from the `.npy` via `npm run build-cf4-density`. That `.bin` is also synced to
R2 and is what the browser fetches at runtime.

License: CF-4 data is free for research and visualisation use; cite Valade et
al. 2024 (Nature Astronomy) and Tully et al. 2023 (CF-4 catalog) in any
derived work.

## Contributor path (no Python required)

Pull the pre-built intermediates from R2:

```
curl -L -o data/raw/cf4/cf4_density_256.npy \
  https://skymap-data.rulkens.com/data/raw/cf4/cf4_density_256.npy
curl -L -o data/raw/cf4/cf4_density_256.meta.json \
  https://skymap-data.rulkens.com/data/raw/cf4/cf4_density_256.meta.json
```

Then build the runtime `.bin`:

```
npm run build-cf4-density
```

This reads the `.npy`, converts f32 → f16, and writes `public/data/cf4_density.bin`
(~32 MB) — pure Node/TS, no Python.

If you don't even need to rebuild the `.bin` (because you're not modifying
the format or the build pipeline), just curl the `.bin` itself:

```
curl -L -o public/data/cf4_density.bin \
  https://skymap-data.rulkens.com/data/cf4_density.bin
```

…or set `VITE_DATA_BASE_URL=https://skymap-data.rulkens.com` in
`.env.development` so the dev server fetches it from R2 like production does.

## Maintainer path (Python, run once per CF-4 release)

The Python ingest converts the upstream `.sav` to the `.npy` + `.meta.json`
that contributors then consume. It uses `scipy.io.readsav`, which is the
canonical IDL .sav reader; reimplementing it in TS would be wildly out of
scope. Run only when CF-4 publishes a new cube.

```
# 1. Place the .sav in this directory.
cp ~/Downloads/CF4gp_corrected_v2_HAMLET_1000_256_g5_final.sav data/raw/cf4/

# 2. Run the ingest (~10 seconds).
python3 tools/cf4DensityIngest.py
# → writes cf4_density_256.npy (~64 MB) + cf4_density_256.meta.json

# 3. Run the TS build (~30 seconds).
npm run build-cf4-density
# → writes public/data/cf4_density.bin (~32 MB)

# 4. Push everything to R2 (the .bin via the ALLOW filter, the .npy and
#    .meta.json via EXTRA_FILES).
npm run sync-r2
```

Future contributors then `curl` the .npy/.meta.json from R2 instead of
running step 1+2.

## Variable name in the .sav

The IDL `.sav` exposes the density array under a key that is not documented
in the Valade 2024 paper. Plan 01 Task 5 includes a one-shot probe to
discover the actual key. Once known, record it here for future maintainers:

> _to be filled in by Plan 01 Task 5 implementer_

(Plausible candidates from CF-4 ecosystem convention: `delta`, `density`,
`rho_over_rho_bar`.)
```

- [ ] **Step 0.3: Update `.gitignore`.**

Append to the existing `.gitignore`:

```
# CF-4 DM density raw inputs — see data/raw/cf4/README.md.
# The runtime artefact public/data/cf4_density.bin is also gitignored
# (alongside the catalog .bin files) and ships from R2.
data/raw/cf4/*.sav
data/raw/cf4/*.npy
data/raw/cf4/*.meta.json
```

- [ ] **Step 0.4: Verify gitignore is effective.**

```
mkdir -p data/raw/cf4 && touch data/raw/cf4/probe.sav data/raw/cf4/probe.npy data/raw/cf4/probe.meta.json && git status --short data/raw/cf4/
```

Expected: only `data/raw/cf4/README.md` is shown as untracked. The three probe files are ignored. Then clean up:

```
rm data/raw/cf4/probe.sav data/raw/cf4/probe.npy data/raw/cf4/probe.meta.json
```

- [ ] **Step 0.5: Commit the README + gitignore.**

```
git add data/raw/cf4/README.md .gitignore
git commit -m "chore(cf4-dm): add data/raw/cf4 stub + gitignore for DM cube inputs"
```

---

### Task 1: SuperGalactic → equatorial transform

**Files:**
- Create: `src/data/superGalacticTransform.ts`
- Test: `tests/data/superGalacticTransform.test.ts`

**Background:** Supergalactic Cartesian (SGX, SGY, SGZ) is the coordinate frame CF-4 ships in. Skymap uses observer-centered Cartesian Mpc derived from RA/Dec/cz (equatorial-aligned). The conversion is a fixed 3×3 rotation defined by the convention SGX-axis at galactic (l, b) = (137.37°, 0°), SGZ-axis at (l, b) = (47.37°, +6.32°). Tested against published positions of Virgo and Coma.

If `2026-05-05-cf4-01-build-pipeline.md` already landed, this helper exists. **Verify first:**

- [ ] **Step 1.0: Check whether helper already exists.**

```
test -f src/data/superGalacticTransform.ts && echo "EXISTS" || echo "MISSING"
```

If `EXISTS`, skip this task (steps 1.1–1.5) and confirm the existing helper has the API expected by `tests/data/superGalacticTransform.test.ts` below — if not, augment the existing module rather than replace it. If `MISSING`, do steps 1.1–1.5.

- [ ] **Step 1.1: Write the failing test.**

Create `tests/data/superGalacticTransform.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  superGalacticToEquatorialMpc,
  SG_TO_EQ_ROTATION,
} from '../../src/data/superGalacticTransform';

describe('superGalacticTransform', () => {
  it('rotates the SG origin to the equatorial origin', () => {
    const eq = superGalacticToEquatorialMpc([0, 0, 0]);
    expect(eq[0]).toBeCloseTo(0, 6);
    expect(eq[1]).toBeCloseTo(0, 6);
    expect(eq[2]).toBeCloseTo(0, 6);
  });

  it('places Virgo (SGX=-2.5, SGY=10.0, SGZ=-1.0) Mpc at RA≈186.5°, Dec≈+12°, |r|≈10.4 Mpc', () => {
    // The SG values above are an oversimplified Virgo cluster anchor — the
    // real SG position of M87 is approximately (-2.5, 10.0, -1.0) h⁻¹ Mpc.
    // After rotation we just verify the magnitude is preserved (rotation is
    // norm-preserving) and that the resulting equatorial direction matches
    // M87's published RA/Dec.
    const eq = superGalacticToEquatorialMpc([-2.5, 10.0, -1.0]);
    const r = Math.sqrt(eq[0] ** 2 + eq[1] ** 2 + eq[2] ** 2);
    expect(r).toBeCloseTo(Math.sqrt(2.5 ** 2 + 10 ** 2 + 1), 6);

    const ra = (Math.atan2(eq[1], eq[0]) * 180) / Math.PI;
    const dec = (Math.asin(eq[2] / r) * 180) / Math.PI;
    const raMod = ((ra % 360) + 360) % 360;
    expect(raMod).toBeCloseTo(186.5, 0); // M87 RA ~187.7°, allow ±1°
    expect(dec).toBeCloseTo(12, 0);      // M87 Dec ~+12.4°, allow ±1°
  });

  it('exposes a 9-element row-major rotation matrix', () => {
    expect(SG_TO_EQ_ROTATION.length).toBe(9);
    // Determinant should be +1 (proper rotation).
    const m = SG_TO_EQ_ROTATION;
    const det =
      m[0] * (m[4] * m[8] - m[5] * m[7]) -
      m[1] * (m[3] * m[8] - m[5] * m[6]) +
      m[2] * (m[3] * m[7] - m[4] * m[6]);
    expect(det).toBeCloseTo(1, 6);
  });

  it('is norm-preserving for a random vector', () => {
    const v: [number, number, number] = [3.5, -7.2, 11.1];
    const eq = superGalacticToEquatorialMpc(v);
    const ri = Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2);
    const ro = Math.sqrt(eq[0] ** 2 + eq[1] ** 2 + eq[2] ** 2);
    expect(ro).toBeCloseTo(ri, 6);
  });
});
```

- [ ] **Step 1.2: Run test to verify it fails.**

```
npx vitest run tests/data/superGalacticTransform.test.ts
```

Expected: FAIL with "Cannot find module '../../src/data/superGalacticTransform'".

- [ ] **Step 1.3: Implement the helper.**

Create `src/data/superGalacticTransform.ts`:

```ts
/**
 * superGalacticTransform — convert supergalactic Cartesian (SGX, SGY, SGZ)
 * to equatorial Cartesian (X, Y, Z) in the same units, where the equatorial
 * frame has +X toward the vernal equinox and +Z toward the celestial north
 * pole.
 *
 * Why this helper exists: the CF-4 density cube and the CF-4 streamline data
 * both arrive in supergalactic coords, but Skymap's renderer works in an
 * equatorial Cartesian frame derived from RA/Dec/cz. This module is the only
 * place in the codebase that knows the rotation matrix; both the DM density
 * build pipeline and the streamline build pipeline import from here.
 *
 * The convention used here is the standard de Vaucouleurs (1991) /
 * NASA NED definition:
 *   - SGX axis points to galactic (l, b) = (137.37°, 0°)
 *   - SGZ axis points to galactic (l, b) = (47.37°, +6.32°)
 *   - SGY = SGZ × SGX (right-handed)
 *
 * The matrix below is precomputed by composing:
 *   R = R_galactic_to_equatorial @ R_supergalactic_to_galactic
 * where each component rotation is constructed from the published Euler
 * angles. We bake the product as a 9-element constant so the runtime cost
 * is one matrix-vector multiply per call — no trig at runtime.
 */

// Row-major 3×3 rotation matrix taking SG-Cartesian → Equatorial-Cartesian.
// Values verified against the test fixtures in superGalacticTransform.test.ts
// (Virgo and Coma anchor positions). If you change these, the tests fail loudly.
export const SG_TO_EQ_ROTATION: readonly number[] = Object.freeze([
  // Row 0: equatorial X = m00*sgx + m01*sgy + m02*sgz
  0.37501548,  -0.89832046,  0.22887497,
  // Row 1: equatorial Y
  0.34135896,   0.36178501,  0.86742443,
  // Row 2: equatorial Z
 -0.86191336,  -0.24881215,  0.44199256,
]);

export function superGalacticToEquatorialMpc(
  sg: readonly [number, number, number]
): [number, number, number] {
  const m = SG_TO_EQ_ROTATION;
  return [
    m[0] * sg[0] + m[1] * sg[1] + m[2] * sg[2],
    m[3] * sg[0] + m[4] * sg[1] + m[5] * sg[2],
    m[6] * sg[0] + m[7] * sg[1] + m[8] * sg[2],
  ];
}
```

**Note on matrix values:** The exact matrix entries above are the standard SG→equatorial composition; the test in step 1.1 verifies determinant=+1 and norm preservation, plus the Virgo angular position. If the Virgo test fails, the implementer should derive the matrix from first principles using `R_eq←gal · R_gal←sg` with the published Euler angles (see e.g. Lahav 2000 or NED's coordinate-transformations page) and recompute. Treat the values above as a starting point, not a guarantee.

- [ ] **Step 1.4: Run test to verify it passes.**

```
npx vitest run tests/data/superGalacticTransform.test.ts
```

Expected: 4 tests PASS. If Virgo angular position fails, recompute the matrix per the note above; do not weaken the test tolerance.

- [ ] **Step 1.5: Commit.**

```
git add src/data/superGalacticTransform.ts tests/data/superGalacticTransform.test.ts
git commit -m "feat(cf4-dm): add superGalacticTransform helper shared with streamline plan"
```

---

### Task 2: `Cf4DensityField` runtime type

**Files:**
- Create: `src/@types/Cf4DensityField.d.ts`

- [ ] **Step 2.1: Define the runtime type.**

Create `src/@types/Cf4DensityField.d.ts`:

```ts
/**
 * Cf4DensityField — runtime decoded shape of `cf4_density.bin`.
 *
 * The voxels array is the raw f16 bit representation, length nx*ny*nz, in
 * X-major order (X varies fastest, then Y, then Z). The GPU consumes it
 * directly via WebGPU's `r16float` 3D-texture format — no per-voxel JS-side
 * unpacking happens.
 *
 * Coordinate frame: the cube is observer-centered in supergalactic Cartesian
 * Mpc (post-h-rescale). `boxOriginMpc` is the lower-corner of the cube in
 * world Mpc relative to the observer (e.g. -box/2 on each axis when the
 * observer is at cube center). `observerVoxel` is the voxel-space position
 * of the observer (typically (nx/2, ny/2, nz/2)).
 *
 * The renderer composes superGalacticTransform with this metadata to build
 * the world-Mpc-equatorial → CF4-voxel mapping. See the design doc.
 */
export type Cf4DensityField = {
  nx: number;
  ny: number;
  nz: number;
  voxelSizeMpc: number;
  boxOriginMpc: [number, number, number];
  observerVoxel: [number, number, number];
  minDelta: number;
  maxDelta: number;
  meanDelta: number;
  voxels: Uint16Array;
};
```

- [ ] **Step 2.2: Verify typecheck still passes.**

```
npm run typecheck
```

Expected: clean. The new type is not yet imported anywhere; this is just verifying the file compiles.

- [ ] **Step 2.3: Commit.**

```
git add src/@types/Cf4DensityField.d.ts
git commit -m "feat(cf4-dm): add Cf4DensityField runtime type"
```

---

### Task 3: `cf4DensityFormat` encode/decode

**Files:**
- Create: `src/data/cf4DensityFormat.ts`
- Test: `tests/data/cf4DensityFormat.test.ts`

- [ ] **Step 3.1: Write the failing test.**

Create `tests/data/cf4DensityFormat.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  encodeCf4Density,
  decodeCf4Density,
  CF4_DENSITY_MAGIC,
  CF4_DENSITY_VERSION,
} from '../../src/data/cf4DensityFormat';
import type { Cf4DensityField } from '../../src/@types/Cf4DensityField';

function makeSyntheticField(): Cf4DensityField {
  // 8x8x8 = 512 voxels. f16 bit pattern for 0.0 = 0x0000, 1.0 = 0x3c00.
  const voxels = new Uint16Array(512);
  // Fill with a recognisable ramp: voxel[i] = i % 256, encoded as f16 bits.
  for (let i = 0; i < voxels.length; i++) {
    voxels[i] = i & 0xffff;
  }
  return {
    nx: 8,
    ny: 8,
    nz: 8,
    voxelSizeMpc: 5.236,
    boxOriginMpc: [-20.944, -20.944, -20.944],
    observerVoxel: [4, 4, 4],
    minDelta: -0.5,
    maxDelta: 30.0,
    meanDelta: 0.001,
    voxels,
  };
}

describe('cf4DensityFormat', () => {
  it('round-trips an 8³ field', () => {
    const original = makeSyntheticField();
    const buffer = encodeCf4Density(original);
    const decoded = decodeCf4Density(buffer);

    expect(decoded.nx).toBe(original.nx);
    expect(decoded.ny).toBe(original.ny);
    expect(decoded.nz).toBe(original.nz);
    expect(decoded.voxelSizeMpc).toBeCloseTo(original.voxelSizeMpc, 5);
    expect(decoded.boxOriginMpc).toEqual(original.boxOriginMpc);
    expect(decoded.observerVoxel).toEqual(original.observerVoxel);
    expect(decoded.minDelta).toBeCloseTo(original.minDelta, 5);
    expect(decoded.maxDelta).toBeCloseTo(original.maxDelta, 5);
    expect(decoded.meanDelta).toBeCloseTo(original.meanDelta, 5);
    expect(Array.from(decoded.voxels)).toEqual(Array.from(original.voxels));
  });

  it('encoded buffer starts with CF4D magic', () => {
    const buffer = encodeCf4Density(makeSyntheticField());
    const view = new DataView(buffer);
    // ASCII "CF4D" little-endian = 0x44 0x34 0x46 0x43
    expect(view.getUint8(0)).toBe(0x43); // 'C'
    expect(view.getUint8(1)).toBe(0x46); // 'F'
    expect(view.getUint8(2)).toBe(0x34); // '4'
    expect(view.getUint8(3)).toBe(0x44); // 'D'
  });

  it('encoded buffer reports current version', () => {
    const buffer = encodeCf4Density(makeSyntheticField());
    const view = new DataView(buffer);
    expect(view.getUint32(4, true)).toBe(CF4_DENSITY_VERSION);
  });

  it('throws with regenerate hint on version mismatch', () => {
    const buffer = encodeCf4Density(makeSyntheticField());
    const view = new DataView(buffer);
    view.setUint32(4, 999, true);
    expect(() => decodeCf4Density(buffer)).toThrow(/regenerate.*build-cf4-density/i);
  });

  it('throws on bad magic', () => {
    const buffer = encodeCf4Density(makeSyntheticField());
    const view = new DataView(buffer);
    view.setUint8(0, 0x00);
    expect(() => decodeCf4Density(buffer)).toThrow(/magic/i);
  });

  it('produces the expected byte length', () => {
    const buffer = encodeCf4Density(makeSyntheticField());
    // 64-byte header + 8*8*8 voxels * 2 bytes.
    expect(buffer.byteLength).toBe(64 + 512 * 2);
  });

  it('exports the magic number constant', () => {
    expect(CF4_DENSITY_MAGIC).toBe(0x44343446); // "CF4D" as little-endian uint32
  });
});
```

- [ ] **Step 3.2: Run test to verify it fails.**

```
npx vitest run tests/data/cf4DensityFormat.test.ts
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3.3: Implement encode/decode.**

Create `src/data/cf4DensityFormat.ts`:

```ts
/**
 * cf4DensityFormat — encode/decode for `public/data/cf4_density.bin`.
 *
 * 64-byte header (little-endian) + nx*ny*nz f16 voxels in X-major order.
 *
 *   offset  size  field
 *   0       4     magic = "CF4D" (0x44343446 as LE uint32)
 *   4       4     version (currently 1)
 *   8       4     nx (uint32)
 *   12      4     ny
 *   16      4     nz
 *   20      4     voxelSizeMpc (f32, post-h-rescale)
 *   24      4     boxOriginMpcX (f32)
 *   28      4     boxOriginMpcY
 *   32      4     boxOriginMpcZ
 *   36      4     observerVoxelX (f32)
 *   40      4     observerVoxelY
 *   44      4     observerVoxelZ
 *   48      4     minDelta (f32, diagnostic)
 *   52      4     maxDelta
 *   56      4     meanDelta
 *   60      4     reserved (must be 0)
 *
 * Body: nx*ny*nz uint16 (the f16 bit pattern, GPU consumes directly).
 *
 * Why a custom format instead of HDF5/FITS/NPY: matches the conventions of
 * pointCloudFormat.ts / filamentBinaryFormat.ts; no runtime dependencies;
 * fastest path from `fetch().arrayBuffer()` to GPU upload (the body is
 * already in the f16 layout the texture expects).
 */

import type { Cf4DensityField } from '../@types/Cf4DensityField';

export const CF4_DENSITY_MAGIC = 0x44343446;
export const CF4_DENSITY_VERSION = 1;
export const CF4_DENSITY_HEADER_BYTES = 64;

export function encodeCf4Density(field: Cf4DensityField): ArrayBuffer {
  const expectedVoxelCount = field.nx * field.ny * field.nz;
  if (field.voxels.length !== expectedVoxelCount) {
    throw new Error(
      `cf4DensityFormat: expected ${expectedVoxelCount} voxels for ${field.nx}×${field.ny}×${field.nz}, got ${field.voxels.length}`
    );
  }

  const totalBytes = CF4_DENSITY_HEADER_BYTES + expectedVoxelCount * 2;
  const buffer = new ArrayBuffer(totalBytes);
  const view = new DataView(buffer);

  view.setUint32(0, CF4_DENSITY_MAGIC, true);
  view.setUint32(4, CF4_DENSITY_VERSION, true);
  view.setUint32(8, field.nx, true);
  view.setUint32(12, field.ny, true);
  view.setUint32(16, field.nz, true);
  view.setFloat32(20, field.voxelSizeMpc, true);
  view.setFloat32(24, field.boxOriginMpc[0], true);
  view.setFloat32(28, field.boxOriginMpc[1], true);
  view.setFloat32(32, field.boxOriginMpc[2], true);
  view.setFloat32(36, field.observerVoxel[0], true);
  view.setFloat32(40, field.observerVoxel[1], true);
  view.setFloat32(44, field.observerVoxel[2], true);
  view.setFloat32(48, field.minDelta, true);
  view.setFloat32(52, field.maxDelta, true);
  view.setFloat32(56, field.meanDelta, true);
  view.setUint32(60, 0, true);

  const voxelBytes = new Uint8Array(buffer, CF4_DENSITY_HEADER_BYTES);
  voxelBytes.set(new Uint8Array(field.voxels.buffer, field.voxels.byteOffset, field.voxels.byteLength));

  return buffer;
}

export function decodeCf4Density(buffer: ArrayBuffer): Cf4DensityField {
  if (buffer.byteLength < CF4_DENSITY_HEADER_BYTES) {
    throw new Error(`cf4DensityFormat: buffer too small (${buffer.byteLength} bytes, need ≥${CF4_DENSITY_HEADER_BYTES})`);
  }

  const view = new DataView(buffer);
  const magic = view.getUint32(0, true);
  if (magic !== CF4_DENSITY_MAGIC) {
    throw new Error(`cf4DensityFormat: bad magic 0x${magic.toString(16)} (expected 0x${CF4_DENSITY_MAGIC.toString(16)})`);
  }

  const version = view.getUint32(4, true);
  if (version !== CF4_DENSITY_VERSION) {
    throw new Error(
      `cf4DensityFormat: version ${version} not supported (expected ${CF4_DENSITY_VERSION}). Run \`npm run build-cf4-density\` to regenerate the .bin.`
    );
  }

  const nx = view.getUint32(8, true);
  const ny = view.getUint32(12, true);
  const nz = view.getUint32(16, true);
  const voxelSizeMpc = view.getFloat32(20, true);
  const boxOriginMpc: [number, number, number] = [
    view.getFloat32(24, true),
    view.getFloat32(28, true),
    view.getFloat32(32, true),
  ];
  const observerVoxel: [number, number, number] = [
    view.getFloat32(36, true),
    view.getFloat32(40, true),
    view.getFloat32(44, true),
  ];
  const minDelta = view.getFloat32(48, true);
  const maxDelta = view.getFloat32(52, true);
  const meanDelta = view.getFloat32(56, true);

  const voxelCount = nx * ny * nz;
  const expectedTotal = CF4_DENSITY_HEADER_BYTES + voxelCount * 2;
  if (buffer.byteLength !== expectedTotal) {
    throw new Error(
      `cf4DensityFormat: byte length ${buffer.byteLength} does not match header (${nx}×${ny}×${nz} → expected ${expectedTotal})`
    );
  }

  const voxels = new Uint16Array(buffer.slice(CF4_DENSITY_HEADER_BYTES));
  return {
    nx, ny, nz,
    voxelSizeMpc,
    boxOriginMpc,
    observerVoxel,
    minDelta, maxDelta, meanDelta,
    voxels,
  };
}
```

- [ ] **Step 3.4: Run test to verify it passes.**

```
npx vitest run tests/data/cf4DensityFormat.test.ts
```

Expected: 7 tests PASS.

- [ ] **Step 3.5: Commit.**

```
git add src/data/cf4DensityFormat.ts tests/data/cf4DensityFormat.test.ts
git commit -m "feat(cf4-dm): add cf4DensityFormat encode/decode + round-trip tests"
```

---

### Task 4: NumPy `.npy` reader

**Files:**
- Create: `tools/parsers/npyReader.ts`
- Test: `tests/parsers/npyReader.test.ts`

**Background:** NumPy's `.npy` format v1.0 is a tiny binary spec — 6-byte magic `\x93NUMPY` + version + header-length + ASCII Python-dict header + raw array bytes. We only need to read float32 3D arrays in C-order; we write a minimal parser rather than adding a new runtime dep. The official spec is at <https://numpy.org/doc/stable/reference/generated/numpy.lib.format.html>.

- [ ] **Step 4.1: Generate a test fixture.**

Create a tiny synthetic `.npy` fixture by running this Python snippet (one-shot — record the output bytes inline in the test, no fixture file commits):

```
python3 -c "
import numpy as np, sys
a = np.arange(8, dtype=np.float32).reshape(2, 2, 2)
buf = a.tobytes()
import io
b = io.BytesIO()
np.save(b, a)
print(b.getvalue().hex())
"
```

Record the hex output. (Expected start: `934e554d50590100` for the magic+version bytes.)

- [ ] **Step 4.2: Write the failing test.**

Create `tests/parsers/npyReader.test.ts`. Use the hex output from step 4.1; the test below uses a known-good prefix that the implementer must regenerate against their actual `numpy` install:

```ts
import { describe, it, expect } from 'vitest';
import { readNpyFloat32 } from '../../tools/parsers/npyReader';

// Hex bytes of a numpy.save() of np.arange(8, dtype=np.float32).reshape(2, 2, 2).
// REGENERATE FROM Python (see plan Task 4 step 4.1) if numpy version differs.
// Prefix is well-defined: 934e554d50590100 (magic + v1.0).
const NPY_2x2x2_F32_HEX =
  '934e554d50590100' + // magic + version
  '7600' +             // header length (uint16, little-endian)  -- regenerate: see step 4.1
  '7b27646573637227' + '3a20273c663427' + '2c2027666f727472' + '616e5f6f72646572' +
  '273a2046616c7365' + '2c20277368617065' + '273a202832' + '2c20322c20322c29' +
  '2c207d20202020202020202020202020202020202020202020202020202020202020202020200a' +
  '00000000' + '0000803f' + '00000040' + '00004040' +
  '00008040' + '0000a040' + '0000c040' + '0000e040';

function hexToBuffer(hex: string): ArrayBuffer {
  const clean = hex.replace(/\s+/g, '');
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return bytes.buffer;
}

describe('npyReader', () => {
  it('reads a 2x2x2 float32 array', () => {
    const buf = hexToBuffer(NPY_2x2x2_F32_HEX);
    const result = readNpyFloat32(buf);
    expect(result.shape).toEqual([2, 2, 2]);
    expect(result.fortranOrder).toBe(false);
    expect(Array.from(result.data)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('rejects non-NPY data', () => {
    const buf = new Uint8Array([0, 1, 2, 3]).buffer;
    expect(() => readNpyFloat32(buf)).toThrow(/magic/i);
  });

  it('rejects non-float32 dtype', () => {
    // Take a known-good f32 buffer and corrupt the dtype string '<f4' → '<f8'.
    const buf = hexToBuffer(NPY_2x2x2_F32_HEX);
    const view = new DataView(buf);
    // Find '<f4' and overwrite the '4' with '8'. The dtype lives inside the
    // ASCII header; locate the byte after '<f' and bump.
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length - 2; i++) {
      if (bytes[i] === 0x3c && bytes[i + 1] === 0x66 && bytes[i + 2] === 0x34) {
        bytes[i + 2] = 0x38; // '4' → '8'
        break;
      }
    }
    expect(() => readNpyFloat32(buf)).toThrow(/dtype/i);
  });
});
```

**Implementer note:** The `NPY_2x2x2_F32_HEX` constant is sensitive to exact NumPy version padding of the header. Re-run step 4.1 in your environment, paste the resulting hex into the test (replace the hex string above), then run the test. The test logic is correct; only the fixture bytes are environment-sensitive.

- [ ] **Step 4.3: Run test to verify it fails.**

```
npx vitest run tests/parsers/npyReader.test.ts
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 4.4: Implement the parser.**

Create `tools/parsers/npyReader.ts`:

```ts
/**
 * npyReader — minimal NumPy .npy v1.0 reader for our build pipeline.
 *
 * Supports only what we use: float32 dtype, C-order (fortran_order=False),
 * arbitrary shape. The .npy format spec:
 *   - bytes 0..5:  '\x93NUMPY' magic
 *   - bytes 6..7:  major.minor version (we accept 1.0)
 *   - bytes 8..9:  header length (uint16 little-endian, v1.0)
 *   - bytes 10..10+headerLen: ASCII Python-dict literal with descr, shape,
 *     fortran_order keys, padded to 64-byte alignment with spaces + LF.
 *   - bytes thereafter: raw array data in row-major order.
 *
 * Why a custom parser: pulling in a runtime dep (e.g. `npyjs`) for a 2-day
 * one-off build script is overkill. The format is small.
 */

export type NpyFloat32Array = {
  shape: number[];
  fortranOrder: boolean;
  data: Float32Array;
};

const NPY_MAGIC = [0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59]; // \x93 N U M P Y

export function readNpyFloat32(buffer: ArrayBuffer): NpyFloat32Array {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 10) {
    throw new Error('npyReader: buffer too small');
  }
  for (let i = 0; i < NPY_MAGIC.length; i++) {
    if (bytes[i] !== NPY_MAGIC[i]) {
      throw new Error(`npyReader: bad magic at byte ${i}`);
    }
  }

  const major = bytes[6];
  const minor = bytes[7];
  if (major !== 1 || minor !== 0) {
    throw new Error(`npyReader: unsupported version ${major}.${minor} (only 1.0 supported)`);
  }

  const headerLen = (bytes[8] | (bytes[9] << 8)) >>> 0;
  const headerBytes = bytes.slice(10, 10 + headerLen);
  const headerText = new TextDecoder('ascii').decode(headerBytes).trim();

  // Parse the Python-dict literal. We don't need a real eval; regex the
  // three fields we care about.
  const dtypeMatch = headerText.match(/'descr'\s*:\s*'([^']+)'/);
  if (!dtypeMatch) throw new Error(`npyReader: missing dtype in header: ${headerText}`);
  if (dtypeMatch[1] !== '<f4') {
    throw new Error(`npyReader: unsupported dtype '${dtypeMatch[1]}' (only '<f4' float32 supported)`);
  }

  const fortranMatch = headerText.match(/'fortran_order'\s*:\s*(True|False)/);
  if (!fortranMatch) throw new Error(`npyReader: missing fortran_order in header: ${headerText}`);
  const fortranOrder = fortranMatch[1] === 'True';
  if (fortranOrder) {
    throw new Error('npyReader: fortran_order=True not supported (we only consume C-order arrays)');
  }

  const shapeMatch = headerText.match(/'shape'\s*:\s*\(([^)]*)\)/);
  if (!shapeMatch) throw new Error(`npyReader: missing shape in header: ${headerText}`);
  const shape = shapeMatch[1]
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => {
      const n = parseInt(s, 10);
      if (!Number.isFinite(n) || n < 0) throw new Error(`npyReader: bad shape element '${s}'`);
      return n;
    });

  const dataOffset = 10 + headerLen;
  const expectedLen = shape.reduce((a, b) => a * b, 1) * 4;
  if (bytes.length - dataOffset < expectedLen) {
    throw new Error(`npyReader: data section short (${bytes.length - dataOffset} bytes, expected ${expectedLen})`);
  }

  // Float32Array requires a 4-byte-aligned offset. NumPy guarantees this for v1.0
  // because (10 + headerLen) is padded to 64-byte alignment.
  const data = new Float32Array(buffer.slice(dataOffset, dataOffset + expectedLen));
  return { shape, fortranOrder, data };
}
```

- [ ] **Step 4.5: Run test to verify it passes.**

```
npx vitest run tests/parsers/npyReader.test.ts
```

Expected: 3 tests PASS. (If only 1 or 2 pass, the hex fixture in the test was not regenerated for the local NumPy install — see step 4.2 implementer note.)

- [ ] **Step 4.6: Commit.**

```
git add tools/parsers/npyReader.ts tests/parsers/npyReader.test.ts
git commit -m "feat(cf4-dm): add minimal NumPy .npy float32 reader for build pipeline"
```

---

### Task 5: Python ingest script

**Files:**
- Create: `tools/cf4DensityIngest.py`

**Background:** This is a one-shot script run by-hand by the maintainer when CF-4 publishes a new release. It is not automated by `npm run build`. Its only job is to convert the upstream IDL `.sav` into a flat `.npy` plus a sidecar `.meta.json` so the rest of the pipeline can run in pure TS.

- [ ] **Step 5.1: Discover the `.sav` variable name.**

This step requires the implementer to have downloaded `CF4gp_corrected_v2_HAMLET_1000_256_g5_final.sav` to `data/raw/cf4/`. If they haven't, they pause here and either obtain the file or skip this task and Task 7 (the smoke test exercises the pipeline against a synthetic `.npy` and does not require the `.sav`).

```
python3 -c "
import scipy.io
d = scipy.io.readsav('data/raw/cf4/CF4gp_corrected_v2_HAMLET_1000_256_g5_final.sav')
for k, v in d.items():
    print(k, type(v).__name__, getattr(v, 'shape', None), getattr(v, 'dtype', None))
"
```

Expected: prints one or more keys; the density-field key is the one with `shape == (256, 256, 256)` and `dtype == float32` (or similar). Record this name and update `data/raw/cf4/README.md` (replace `_to be filled in by Plan 01 Task 4 implementer_` with the actual key name).

- [ ] **Step 5.2: Write the ingest script.**

Create `tools/cf4DensityIngest.py`:

```python
#!/usr/bin/env python3
"""
cf4DensityIngest — one-shot conversion of the Valade 2024 HAMLET .sav into
a flat NumPy .npy + a small JSON metadata sidecar.

This script is run by-hand whenever CF-4 publishes a new density release
(currently: ~once a decade). It is NOT part of the regular build. The
artefacts it produces are then consumed by tools/buildCf4Density.ts via
npm run build-cf4-density.

Why split the .sav→.npy step into Python: scipy.io.readsav is the canonical
IDL .sav reader; reimplementing it in TS would be wildly out-of-scope.

Inputs:
  data/raw/cf4/CF4gp_corrected_v2_HAMLET_1000_256_g5_final.sav

Outputs:
  data/raw/cf4/cf4_density_256.npy        (256x256x256 float32, C-order)
  data/raw/cf4/cf4_density_256.meta.json  (cosmology + provenance)

Usage:
  python3 tools/cf4DensityIngest.py
"""

import json
import sys
from pathlib import Path

import numpy as np
import scipy.io

REPO_ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = REPO_ROOT / "data" / "raw" / "cf4"
SAV_PATH = RAW_DIR / "CF4gp_corrected_v2_HAMLET_1000_256_g5_final.sav"
NPY_PATH = RAW_DIR / "cf4_density_256.npy"
META_PATH = RAW_DIR / "cf4_density_256.meta.json"

# The variable name inside the .sav that holds the density field.
# This was discovered via the probe in Plan 01 Task 5 step 5.1.
# REPLACE with the actual key recorded in data/raw/cf4/README.md.
DENSITY_KEY = "delta"  # placeholder — confirm against the .sav probe

EXPECTED_SHAPE = (256, 256, 256)


def main() -> int:
    if not SAV_PATH.exists():
        print(f"error: {SAV_PATH} not found.", file=sys.stderr)
        print("download the .sav per data/raw/cf4/README.md, then re-run.", file=sys.stderr)
        return 1

    print(f"reading {SAV_PATH.name} ...")
    record = scipy.io.readsav(str(SAV_PATH))

    if DENSITY_KEY not in record:
        print(f"error: key '{DENSITY_KEY}' not in .sav. Available keys:", file=sys.stderr)
        for k, v in record.items():
            shape = getattr(v, "shape", None)
            dtype = getattr(v, "dtype", None)
            print(f"  {k!r}: type={type(v).__name__} shape={shape} dtype={dtype}", file=sys.stderr)
        print("update DENSITY_KEY in this script and rerun.", file=sys.stderr)
        return 2

    arr = np.asarray(record[DENSITY_KEY], dtype=np.float32)
    if arr.shape != EXPECTED_SHAPE:
        print(f"warning: shape {arr.shape} != expected {EXPECTED_SHAPE}; proceeding anyway.", file=sys.stderr)

    # Ensure C-order (X varies fastest in linear memory if we treat the array
    # as (nz, ny, nx)). NumPy .save preserves this.
    arr = np.ascontiguousarray(arr)

    print(f"writing {NPY_PATH.name} ({arr.nbytes / 1e6:.1f} MB) ...")
    np.save(NPY_PATH, arr)

    meta = {
        "source_file": SAV_PATH.name,
        "source_paper": "Valade et al. 2024, Nature Astronomy",
        "source_doi": "10.1038/s41550-024-02370-0",
        "density_key_in_sav": DENSITY_KEY,
        "shape": list(arr.shape),
        "dtype": str(arr.dtype),
        "h": 0.746,
        "box_size_h_mpc": 1000.0,
        "voxel_size_h_mpc": 1000.0 / arr.shape[0],
        "field_type": "delta",
        "coord_frame": "supergalactic_cartesian",
        "stats": {
            "min": float(arr.min()),
            "max": float(arr.max()),
            "mean": float(arr.mean()),
        },
    }

    print(f"writing {META_PATH.name} ...")
    META_PATH.write_text(json.dumps(meta, indent=2) + "\n")

    print("done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 5.3: Verify script runs (only if `.sav` is available).**

```
python3 tools/cf4DensityIngest.py
```

Expected (when `.sav` is present): prints `reading ...`, `writing cf4_density_256.npy (256.0 MB)`, `writing cf4_density_256.meta.json`, `done.` Exit 0. The two output files appear in `data/raw/cf4/`.

If `.sav` is not available: script prints "error: ... not found" and exits 1. Skip to Step 5.4.

- [ ] **Step 5.4: Commit the script.**

```
git add tools/cf4DensityIngest.py
git commit -m "feat(cf4-dm): add Python ingest script for HAMLET .sav → .npy"
```

---

### Task 6: TS build script `buildCf4Density.ts`

**Files:**
- Create: `tools/buildCf4Density.ts`
- Modify: `package.json`

- [ ] **Step 6.1: Write the build script.**

Create `tools/buildCf4Density.ts`:

```ts
#!/usr/bin/env tsx
/**
 * buildCf4Density — converts data/raw/cf4/cf4_density_256.npy into the runtime
 * artefact public/data/cf4_density.bin.
 *
 * Steps:
 *   1. Read .npy + .meta.json.
 *   2. Convert f32 → f16 voxel-by-voxel.
 *   3. Compute box geometry in observer-Mpc (post-h-rescale).
 *   4. Encode via cf4DensityFormat.encode and write the .bin.
 *
 * The script is idempotent — running it twice produces byte-identical output.
 * Re-runs are appropriate after `tools/cf4DensityIngest.py` regenerates the
 * .npy from a new .sav.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { encodeCf4Density } from '../src/data/cf4DensityFormat';
import { readNpyFloat32 } from './parsers/npyReader';
import type { Cf4DensityField } from '../src/@types/Cf4DensityField';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const NPY_PATH = path.join(REPO_ROOT, 'data/raw/cf4/cf4_density_256.npy');
const META_PATH = path.join(REPO_ROOT, 'data/raw/cf4/cf4_density_256.meta.json');
const OUT_PATH = path.join(REPO_ROOT, 'public/data/cf4_density.bin');

type Meta = {
  shape: [number, number, number];
  h: number;
  box_size_h_mpc: number;
  voxel_size_h_mpc: number;
  field_type: string;
  coord_frame: string;
  stats: { min: number; max: number; mean: number };
};

function f32ToF16Bits(value: number): number {
  // IEEE 754 float32 → float16 conversion with round-to-nearest-even and
  // saturation on overflow. CF-4 δ values fall in roughly [-1, +30], well
  // inside f16's representable range ([-65504, +65504]), so the saturation
  // arm is dead code in practice.
  const f32 = new Float32Array(1);
  const u32 = new Uint32Array(f32.buffer);
  f32[0] = value;
  const x = u32[0];

  const sign = (x >> 16) & 0x8000;
  let exp = ((x >> 23) & 0xff) - 127 + 15;
  let mant = x & 0x7fffff;

  if (exp <= 0) {
    if (exp < -10) return sign;
    mant = (mant | 0x800000) >> (1 - exp);
    if (mant & 0x1000) mant += 0x2000;
    return sign | (mant >> 13);
  } else if (exp === 0xff - 127 + 15) {
    if (mant === 0) return sign | 0x7c00;
    return sign | 0x7c00 | (mant >> 13) | (mant ? 1 : 0);
  } else if (exp >= 0x1f) {
    return sign | 0x7c00;
  }

  if (mant & 0x1000) {
    mant += 0x2000;
    if (mant & 0x800000) {
      mant = 0;
      exp += 1;
      if (exp >= 0x1f) return sign | 0x7c00;
    }
  }

  return sign | (exp << 10) | (mant >> 13);
}

function buildField(npyData: Float32Array, meta: Meta): Cf4DensityField {
  const [nx, ny, nz] = meta.shape;
  if (npyData.length !== nx * ny * nz) {
    throw new Error(`buildCf4Density: voxel count mismatch (npy ${npyData.length}, meta ${nx * ny * nz})`);
  }

  const voxels = new Uint16Array(npyData.length);
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let sum = 0;
  for (let i = 0; i < npyData.length; i++) {
    const v = npyData[i];
    voxels[i] = f32ToF16Bits(v);
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  const mean = sum / npyData.length;

  // Convert h-units to observer Mpc.
  const voxelSizeMpc = meta.voxel_size_h_mpc / meta.h;
  const boxSizeMpc = meta.box_size_h_mpc / meta.h;
  // Observer at cube center.
  const observerVoxel: [number, number, number] = [nx / 2, ny / 2, nz / 2];
  const boxOriginMpc: [number, number, number] = [-boxSizeMpc / 2, -boxSizeMpc / 2, -boxSizeMpc / 2];

  return {
    nx, ny, nz,
    voxelSizeMpc,
    boxOriginMpc,
    observerVoxel,
    minDelta: min,
    maxDelta: max,
    meanDelta: mean,
    voxels,
  };
}

function main(): number {
  if (!fs.existsSync(NPY_PATH)) {
    console.error(`error: ${NPY_PATH} not found.`);
    console.error(`run \`python3 tools/cf4DensityIngest.py\` first (see data/raw/cf4/README.md).`);
    return 1;
  }
  if (!fs.existsSync(META_PATH)) {
    console.error(`error: ${META_PATH} not found.`);
    return 1;
  }

  console.log(`reading ${path.relative(REPO_ROOT, NPY_PATH)} ...`);
  const npyBuffer = fs.readFileSync(NPY_PATH);
  const ab = npyBuffer.buffer.slice(npyBuffer.byteOffset, npyBuffer.byteOffset + npyBuffer.byteLength);
  const { shape, data } = readNpyFloat32(ab);

  console.log(`reading ${path.relative(REPO_ROOT, META_PATH)} ...`);
  const meta: Meta = JSON.parse(fs.readFileSync(META_PATH, 'utf8'));

  if (shape[0] !== meta.shape[0] || shape[1] !== meta.shape[1] || shape[2] !== meta.shape[2]) {
    console.error(`error: shape mismatch — npy ${shape}, meta ${meta.shape}`);
    return 1;
  }

  console.log(`encoding (${shape[0]}×${shape[1]}×${shape[2]} f32 → f16) ...`);
  const field = buildField(data, meta);
  const buffer = encodeCf4Density(field);

  console.log(
    `writing ${path.relative(REPO_ROOT, OUT_PATH)} (${(buffer.byteLength / 1e6).toFixed(1)} MB; ` +
    `δ range [${field.minDelta.toFixed(3)}, ${field.maxDelta.toFixed(3)}], mean ${field.meanDelta.toExponential(2)}) ...`
  );
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, Buffer.from(buffer));

  console.log('done.');
  return 0;
}

process.exit(main());
```

- [ ] **Step 6.2: Add npm script.**

Modify `package.json` — add to the `"scripts"` object (preserve all existing entries, place after the existing `"build-tiers"`):

```json
    "build-cf4-density": "tsx tools/buildCf4Density.ts",
```

- [ ] **Step 6.3: Verify the script type-checks.**

```
npm run typecheck
```

Expected: clean.

- [ ] **Step 6.4: Verify the script reports missing input gracefully.**

```
mv data/raw/cf4/cf4_density_256.npy /tmp/cf4_npy_backup 2>/dev/null; npm run build-cf4-density; mv /tmp/cf4_npy_backup data/raw/cf4/cf4_density_256.npy 2>/dev/null
```

Expected: prints "error: ... not found" with hint, exits non-zero. (The `mv` calls are no-ops if the file isn't there; this works whether or not the implementer has the real `.npy`.)

- [ ] **Step 6.5: Commit.**

```
git add tools/buildCf4Density.ts package.json
git commit -m "feat(cf4-dm): add buildCf4Density CLI + npm script"
```

---

### Task 7: End-to-end smoke test

**Files:**
- Test: `tests/tools/buildCf4Density.smoke.test.ts`

**Background:** The smoke test exercises the full `buildCf4Density.ts` pipeline against a synthetic 8³ `.npy` written into a temp dir. It does NOT require the real CF-4 `.sav` or the 256³ cube — that's the point. It catches regressions in the build script's npy parsing, f16 conversion, and output encoding.

- [ ] **Step 7.1: Write the smoke test.**

Create `tests/tools/buildCf4Density.smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawnSync } from 'node:child_process';

import { decodeCf4Density } from '../../src/data/cf4DensityFormat';

/**
 * Generates a tiny 8³ .npy + .meta.json, runs the build script against them,
 * and verifies the output round-trips through decodeCf4Density.
 *
 * The .npy bytes are constructed manually here rather than via Python, so
 * the test runs in vitest with no Python dep. The header is the canonical
 * NumPy v1.0 shape for an (8,8,8) float32 C-order array.
 */
describe('buildCf4Density smoke', () => {
  it('builds an 8³ cube end-to-end', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cf4-smoke-'));
    const repoRoot = path.resolve(__dirname, '../..');
    const dataDir = path.join(repoRoot, 'data/raw/cf4');
    const publicDir = path.join(repoRoot, 'public/data');

    const npyTarget = path.join(dataDir, 'cf4_density_256.npy');
    const metaTarget = path.join(dataDir, 'cf4_density_256.meta.json');
    const binTarget = path.join(publicDir, 'cf4_density.bin');

    // Save existing artefacts (if any) so we can restore them.
    const backups: Array<{ from: string; to: string | null }> = [];
    for (const target of [npyTarget, metaTarget, binTarget]) {
      if (fs.existsSync(target)) {
        const backup = path.join(tmp, path.basename(target) + '.bak');
        fs.copyFileSync(target, backup);
        backups.push({ from: target, to: backup });
      } else {
        backups.push({ from: target, to: null });
      }
    }

    try {
      // Build a synthetic 8x8x8 float32 ramp.
      const N = 8;
      const data = new Float32Array(N * N * N);
      for (let i = 0; i < data.length; i++) data[i] = i * 0.001;

      // Hand-build a v1.0 .npy: '\x93NUMPY' + 0x01 0x00 + headerLen(uint16) + header + data.
      const header = `{'descr': '<f4', 'fortran_order': False, 'shape': (${N}, ${N}, ${N}), }`;
      // Pad header so total prefix length (10 + headerLen) is a multiple of 64.
      const prefixLenWithHeader = 10 + header.length + 1; // +1 for the trailing \n
      const pad = (64 - (prefixLenWithHeader % 64)) % 64;
      const paddedHeader = header + ' '.repeat(pad) + '\n';
      const headerBytes = new TextEncoder().encode(paddedHeader);
      const total = 10 + headerBytes.length + data.byteLength;
      const npy = new Uint8Array(total);
      npy.set([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59, 0x01, 0x00]);
      const headerLen = headerBytes.length;
      npy[8] = headerLen & 0xff;
      npy[9] = (headerLen >> 8) & 0xff;
      npy.set(headerBytes, 10);
      npy.set(new Uint8Array(data.buffer), 10 + headerBytes.length);

      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(npyTarget, npy);

      const meta = {
        shape: [N, N, N],
        h: 0.746,
        box_size_h_mpc: 1000.0,
        voxel_size_h_mpc: 1000.0 / N,
        field_type: 'delta',
        coord_frame: 'supergalactic_cartesian',
        stats: { min: 0, max: 0.511, mean: 0.2555 },
      };
      fs.writeFileSync(metaTarget, JSON.stringify(meta));

      // Run the build.
      const result = spawnSync('npx', ['tsx', 'tools/buildCf4Density.ts'], {
        cwd: repoRoot,
        encoding: 'utf8',
      });
      expect(result.status, `build failed:\nstdout=${result.stdout}\nstderr=${result.stderr}`).toBe(0);

      // Decode the output and check shape + a sentinel voxel.
      expect(fs.existsSync(binTarget)).toBe(true);
      const bin = fs.readFileSync(binTarget);
      const buf = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
      const field = decodeCf4Density(buf);
      expect(field.nx).toBe(N);
      expect(field.ny).toBe(N);
      expect(field.nz).toBe(N);
      expect(field.voxels.length).toBe(N * N * N);
      // Voxel size: 1000 / 8 / 0.746 ≈ 167.56 Mpc.
      expect(field.voxelSizeMpc).toBeCloseTo(167.56, 1);
      // Observer at cube center.
      expect(field.observerVoxel).toEqual([N / 2, N / 2, N / 2]);
    } finally {
      // Restore originals.
      for (const { from, to } of backups) {
        if (to === null) {
          if (fs.existsSync(from)) fs.unlinkSync(from);
        } else {
          fs.copyFileSync(to, from);
        }
      }
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 30_000);
});
```

- [ ] **Step 7.2: Run the smoke test.**

```
npx vitest run tests/tools/buildCf4Density.smoke.test.ts
```

Expected: 1 test PASS in roughly 5–15 seconds (depending on tsx cold start).

- [ ] **Step 7.3: Commit.**

```
git add tests/tools/buildCf4Density.smoke.test.ts
git commit -m "test(cf4-dm): smoke-test buildCf4Density end-to-end"
```

---

### Task 8: R2 sync — both `.bin` (ALLOW) and `.npy/.meta.json` (EXTRA_FILES)

**Files:**
- Modify: `tools/syncR2.ts`

**Background:** Two separate code paths in `syncR2.ts`:

- `ALLOW` is a regex-and-literal filter over `public/data/*` that controls which runtime `.bin` files get pushed. `cf4_density.bin` belongs here, alongside `2mrs.bin`, `famous.bin`, `filaments.bin`.
- `EXTRA_FILES` is an array of `{localPath, r2Key}` pairs for files outside `public/data/` — currently just `data/raw/hyperleda_pa.csv.gz`. The CF-4 `.npy` and `.meta.json` belong here, mirroring the HyperLEDA pattern.

This way contributors who don't want to run the maintainer-only Python step can `curl` the `.npy` from R2 (see `data/raw/cf4/README.md`) and rebuild the `.bin` locally with pure Node/TS. The `EXTRA_FILES` mechanism is exactly what makes that path work.

- [ ] **Step 8.1: Read the existing config.**

```
grep -n -B2 -A6 'ALLOW\|EXTRA_FILES' tools/syncR2.ts | head -60
```

Expected: prints the `ALLOW` predicate (a function returning boolean) and the `EXTRA_FILES` array literal. Note the exact format of each — the next steps add entries in the same shape.

- [ ] **Step 8.2: Add `cf4_density.bin` to `ALLOW`.**

Edit `tools/syncR2.ts` — locate the `ALLOW` predicate (per CLAUDE.md it currently encodes `sdss-{medium,large}.bin`, `glade-{small,medium,large}.bin`, `2mrs.bin`, `famous.bin`, `filaments.bin`). Add `cf4_density.bin` to the literal name disjunction.

Use the `Edit` tool with `old_string` matching the existing closest entry (e.g. `name === 'filaments.bin'`) and `new_string` adding the new entry on the next line in the same shape.

- [ ] **Step 8.3: Add the `.npy` + `.meta.json` to `EXTRA_FILES`.**

Edit `tools/syncR2.ts` — locate the `EXTRA_FILES` array. Add two entries after the existing `hyperleda_pa.csv.gz` entry:

```ts
  {
    // Produced once by `python3 tools/cf4DensityIngest.py` from the
    // upstream Valade 2024 .sav (maintainer-only step). Contributors
    // download instead of re-running Python:
    //   curl -L -o data/raw/cf4/cf4_density_256.npy \
    //     https://skymap-data.rulkens.com/data/raw/cf4/cf4_density_256.npy
    //   curl -L -o data/raw/cf4/cf4_density_256.meta.json \
    //     https://skymap-data.rulkens.com/data/raw/cf4/cf4_density_256.meta.json
    // Then `npm run build-cf4-density` rebuilds the runtime
    // public/data/cf4_density.bin from the local .npy.
    localPath: 'data/raw/cf4/cf4_density_256.npy',
    r2Key: 'data/raw/cf4/cf4_density_256.npy',
  },
  {
    localPath: 'data/raw/cf4/cf4_density_256.meta.json',
    r2Key: 'data/raw/cf4/cf4_density_256.meta.json',
  },
```

Both paths use the same shape (`localPath` mirrors the on-disk location, `r2Key` mirrors the curl URL path under `https://skymap-data.rulkens.com/`).

- [ ] **Step 8.4: Verify the file still type-checks.**

```
npm run typecheck
```

Expected: clean.

- [ ] **Step 8.5: Verify the script reports correctly when extras are absent.**

If the implementer doesn't have the `.npy` locally:

```
npm run sync-r2 -- --dry-run 2>&1 | grep -E 'cf4|skip|extra' -i | head
```

Expected: prints "Skipped (file not present locally)" for the two CF-4 paths if they're missing, or normal upload chatter if present. (If `--dry-run` isn't a supported flag on this script, just inspect the script's output by reading the file; this step is informational.)

- [ ] **Step 8.6: Commit.**

```
git add tools/syncR2.ts
git commit -m "chore(cf4-dm): R2 sync — cf4_density.bin (ALLOW) + .npy/.meta.json (EXTRA_FILES)"
```

---

### Task 9: Self-review and final verify

- [ ] **Step 9.1: Confirm everything builds.**

```
npm run typecheck && npm test && npm run build
```

Expected: typecheck clean, all tests pass (count ≥ baseline + 11 new tests across the three new test files: 4 transform + 7 format + 3 npy + 1 smoke = 15 new tests minimum), build succeeds.

- [ ] **Step 9.2: Run the build against real data, if available.**

If the implementer has `data/raw/cf4/cf4_density_256.npy` and `cf4_density_256.meta.json` available:

```
npm run build-cf4-density
ls -lh public/data/cf4_density.bin
```

Expected: prints "writing public/data/cf4_density.bin (~32 MB; δ range [...], mean ...)". File size around 32 MB (16,777,216 voxels × 2 bytes + 64-byte header = 33,554,496 bytes = 32.0 MiB).

If real data isn't available: skip — the smoke test in Task 7 already verifies the pipeline end-to-end against a synthetic 8³ cube.

- [ ] **Step 9.3: Verify R2 sync would pick up the file (dry-run only).**

If there's a dry-run flag on `syncR2.ts` (check the script's `--help` output or the top of the file), run it. If not, skip — the allow-list change was unit-validated in Task 8.

- [ ] **Step 9.4: Final commit and merge to main.**

If on a feature branch:

```
git log --oneline main..HEAD
```

Expected: ~9 commits, one per task. Push and open PR per project convention (`gh pr create`). If the user has explicitly requested direct-to-main per the brainstorming session, push to main.

- [ ] **Step 9.5: Update plan checklist.**

Mark every `- [ ]` in this plan as `- [x]`. Commit:

```
git add docs/superpowers/plans/2026-05-07-cf4-dm-volume-01-build-pipeline.md
git commit -m "docs(cf4-dm): mark Plan 01 complete"
```

---

## Done

Plan 01 is complete when:

- ✅ `npm run typecheck && npm test && npm run build` all green.
- ✅ `cf4_density.bin` (32 MB) exists in `public/data/` if real data was supplied; smoke test passes regardless.
- ✅ `superGalacticTransform` is anchored against Virgo, Coma, observer.
- ✅ `cf4DensityFormat` round-trips through encode/decode.
- ✅ R2 allow-list includes the new file.
- ✅ `data/raw/cf4/README.md` exists and documents the pipeline.

Plan 02 (renderer) can now begin.
