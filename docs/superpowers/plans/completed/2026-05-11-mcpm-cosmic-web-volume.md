# MCPM Cosmic Web Volume — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ingest the SDSS DR17 Cosmic Slime VAC `SDSS_z_44-476mpc` cube (Wilde et al. 2023) via a one-shot pyslime extractor, build it as three tiered SCFD files, and render it through the existing scalar-volume renderer alongside the CF-4 overlay — gated by the existing `?volumes=1` URL flag and the new `'mcpm'` field handle in the per-handle defaults registry.

**Architecture:** Mirror the CF-4 ingest pipeline end-to-end. Pre-extract three `.npy` tier files in Python (one-time, maintainer); per-contributor TS build script reads the `.npy` files and emits `mcpm-{small,medium,large}.scfd`; runtime mints a tier-aware slot under `state.assetSlots.mcpm` that loads on boot and reloads when the user changes tier. Most of the renderer side comes free — registering the `'mcpm'` handle on `scalarVolumeRenderer.addField` is enough; the SettingsPanel auto-generates a row from the registered fields.

**Tech Stack:** Node + TypeScript (build script, runtime), Python 3 + pyslime + numpy + scikit-image (extractor only), Vitest (TDD), WebGPU + WGSL (already in place).

**Spec:** [`docs/superpowers/specs/2026-05-11-mcpm-cosmic-web-volume-design.md`](../specs/2026-05-11-mcpm-cosmic-web-volume-design.md) — read this first for the why-not's and references.

**Reality check vs spec:**
- The spec calls out a "new SettingsPanel toggle" — but inspecting `src/components/SettingsPanel/SettingsPanel.tsx:734-758`, volume rows are auto-generated from `volumeFields[]` (which itself derives from registered field handles). Adding `'mcpm'` to `VOLUME_FIELD_DEFAULTS` with a `label` is sufficient; **no SettingsPanel.tsx edit is needed**. This plan reflects that.
- The spec mentions a "volume registry" wiring point — there isn't a generic registry today; CF-4 has a per-cube slot factory (`createCf4DensitySlot`) wired ad-hoc inside `wireSlots.ts`. MCPM follows the same per-cube factory pattern; no registry generalisation needed for one new cube.
- The spec's tier-aware reload requires a small `setTier` extension in `engine.ts` (the existing `for (const src of [SDSS, …])` loop only iterates point sources; MCPM joins it as a separate one-line invocation).
- The spec's `'inferno'` palette name doesn't exist in skymap's current `ScalarFieldPaletteId` union (only `viridis | magma | blue-purple | yellow-green | coolwarm`). Task 5 adds `'inferno'` to the palette set as a precondition, then Task 6 uses it in the registry entry. The matplotlib inferno palette is the canonical aesthetic for slime-mould / cosmic-web fire-on-black visualisations (Polyphorm, MCPM tradition).

---

## File map

**New files:**
- `tools/extractMcpmCube.py` — Python one-shot: pyslime → block-average → 3 `.npy`
- `tools/buildMcpmVolume.ts` — TS build: 1 `.npy` → 1 `.scfd` (CLI flag `--factor=8|4|2|--all`)
- `tools/parsers/floatToHalf.ts` — extracted f32→f16 helper (was inline in `buildCf4Density.ts`)
- `src/services/loading/fetchers/mcpmFetcher.ts` — `Fetcher<ScalarCube, MCPMReq>` (`MCPMReq = { tier: Tier }`)
- `src/services/loading/slots/mcpmSlot.ts` — `SlotFactory<ScalarCube, MCPMReq>`
- `tests/tools/parsers/floatToHalf.test.ts`
- `tests/tools/buildMcpmVolume.smoke.test.ts`
- `tests/data/mcpmAnchors.test.ts`
- `tests/services/loading/fetchers/mcpmFetcher.test.ts`
- `data/raw/mcpm/README.md` — maintainer + contributor instructions (mirrors `data/raw/cf4/README.md`)

**Modified files:**
- `tools/buildCf4Density.ts` — import `f32ToF16Bits` from new helper module instead of inline
- `tools/syncR2.ts` — extend `ALLOW` filter for `mcpm-{small,medium,large}.scfd`; add 3 `EXTRA_FILES` entries for the source `.npy` tier files
- `src/@types/ScalarCube.d.ts` — add `'inferno'` to the `ScalarFieldPaletteId` union
- `src/data/scalarFieldPalettes.ts` — add `'inferno'` to `PALETTE_IDS` + `buildPaletteLut`
- `src/data/volumeFieldDefaults.ts` — add `'mcpm'` entry (uses `'inferno'`)
- `src/@types/EngineState.d.ts` — add `mcpm: AssetSlot<ScalarCube, MCPMReq> | null` to `assetSlots`
- `src/services/engine/phases/wireSlots.ts` — mint MCPM slot under `volumesGateOpen`; initial `load({ tier })`
- `src/services/engine/engine.ts` — extend `setTier` (around line 942) to reload MCPM on tier change
- `tests/data/scalarFieldPalettes.test.ts` — extend with an inferno assertion
- `tests/data/volumeFieldDefaults.test.ts` — extend with an `'mcpm'` block
- `package.json` — add `"build-mcpm"` script
- `.gitignore` — add `data/raw/mcpm/*.npy` and `public/data/mcpm-*.scfd`
- `CLAUDE.md` — add MCPM ingest paragraph in the data-pipeline section

---

## Task 1: Extract `f32ToF16Bits` into a shared helper module

This is a mechanical pre-refactor so MCPM and CF-4 can share the f16 packer. The helper currently lives at `tools/buildCf4Density.ts:62-92`. After this task it lives in `tools/parsers/floatToHalf.ts` and `buildCf4Density.ts` imports it. **No behaviour change.**

**Files:**
- Create: `tools/parsers/floatToHalf.ts`
- Create: `tests/tools/parsers/floatToHalf.test.ts`
- Modify: `tools/buildCf4Density.ts:36-92` — replace inline function with import

- [ ] **Step 1: Write the failing test**

Create `tests/tools/parsers/floatToHalf.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { f32ToF16Bits } from '../../../tools/parsers/floatToHalf';

/** Decode an f16 raw bit pattern back into a JS number; copy of the helper
 * already used by `tests/tools/buildCf4Density.smoke.test.ts`. */
function f16BitsToFloat(bits: number): number {
  const sign = (bits & 0x8000) >> 15;
  const exp = (bits & 0x7c00) >> 10;
  const mant = bits & 0x03ff;
  if (exp === 0) return (sign ? -1 : 1) * (mant / 1024) * Math.pow(2, -14);
  if (exp === 31) return mant === 0 ? (sign ? -Infinity : Infinity) : NaN;
  return (sign ? -1 : 1) * (1 + mant / 1024) * Math.pow(2, exp - 15);
}

describe('f32ToF16Bits', () => {
  it('round-trips representative values within f16 precision', () => {
    const cases = [0, 1, -1, 0.5, -0.5, 65504, -65504, 1e-4];
    for (const v of cases) {
      const round = f16BitsToFloat(f32ToF16Bits(v));
      expect(round).toBeCloseTo(v, Math.abs(v) > 1 ? 0 : 3);
    }
  });

  it('overflows to +Inf and -Inf', () => {
    expect(f16BitsToFloat(f32ToF16Bits(1e10))).toBe(Infinity);
    expect(f16BitsToFloat(f32ToF16Bits(-1e10))).toBe(-Infinity);
  });

  it('preserves NaN', () => {
    expect(Number.isNaN(f16BitsToFloat(f32ToF16Bits(NaN)))).toBe(true);
  });

  it('packs zero as bit pattern 0', () => {
    expect(f32ToF16Bits(0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/tools/parsers/floatToHalf.test.ts
```

Expected: FAIL with module-not-found error on `tools/parsers/floatToHalf`.

- [ ] **Step 3: Create the helper module**

Create `tools/parsers/floatToHalf.ts` with the existing implementation lifted verbatim from `tools/buildCf4Density.ts:62-92`. Do not change the algorithm; only the location and the export. Include the existing module docblock.

```ts
/**
 * Convert IEEE-754 f32 values into f16 raw bit patterns (Uint16). Used by
 * the SCFD volume builders (`buildCf4Density`, `buildMcpmVolume`) to pack
 * a Float32Array source into the on-disk f16 voxel array.
 *
 * Why hand-roll: per-element conversion from a Float32Array into Uint16
 * f16 bit patterns. Using the well-known IEEE-754 bit-manipulation
 * approach avoids importing a heavy f16 library (or shelling out to
 * Python) for what is fundamentally just a packing step.
 *
 * The algorithm extracts sign, exponent, and mantissa from the f32 bit
 * pattern and repacks them into the f16 5-bit exponent + 10-bit mantissa
 * layout, handling overflow to Inf, underflow to subnormal, and NaN
 * passthrough.
 */
export function f32ToF16Bits(value: number): number {
  const f32 = new Float32Array(1);
  f32[0] = value;
  const u32 = new Uint32Array(f32.buffer)[0]!;
  const sign = (u32 >>> 16) & 0x8000;
  let mant = u32 & 0x007fffff;
  let exp = (u32 >>> 23) & 0xff;
  if (exp === 255) {
    return sign | 0x7c00 | (mant ? 1 : 0);
  }
  exp = exp - 127 + 15;
  if (exp >= 31) return sign | 0x7c00;
  if (exp <= 0) {
    if (exp < -10) return sign;
    mant = (mant | 0x00800000) >>> (1 - exp);
    if (mant & 0x00001000) mant += 0x00002000;
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
```

- [ ] **Step 4: Update `buildCf4Density.ts` to import the helper**

In `tools/buildCf4Density.ts`:

1. Add the import near the top, alongside the existing `readNpy` import:

```ts
import { f32ToF16Bits } from './parsers/floatToHalf';
```

2. Delete lines `50-92` (the docblock + `f32ToF16Bits` function definition). Leave the `CF4PP_VOXEL_SIZE_MPC` constant (lines 41-48) intact above the deletion.

- [ ] **Step 5: Run all relevant tests**

```bash
npx vitest run tests/tools/parsers/floatToHalf.test.ts tests/tools/buildCf4Density.smoke.test.ts
```

Expected: BOTH pass. The CF-4 smoke test exercises the helper indirectly and would catch any regression from the extraction.

- [ ] **Step 6: Commit**

```bash
git add tools/parsers/floatToHalf.ts tests/tools/parsers/floatToHalf.test.ts tools/buildCf4Density.ts
git commit -m "$(cat <<'EOF'
refactor(tools): extract f32ToF16Bits into shared helper module

Pre-requisite for the MCPM volume builder, which needs the same f16 packer.
No behaviour change — buildCf4Density.ts imports the function from its new
home in tools/parsers/floatToHalf.ts instead of defining it inline.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Python extractor `tools/extractMcpmCube.py`

One-shot maintainer script. Reads `data/raw/mcpm/trace.bin.bz2`, decompresses + parses via pyslime, block-averages the 712×1200×728 cube by factors {8, 4, 2}, and writes three `.npy` files. Not automatically tested (one-shot, requires upstream 345 MB blob and pyslime install); the build-script smoke test in Task 3 covers correctness from `.npy` onward.

**Files:**
- Create: `tools/extractMcpmCube.py`
- Create: `data/raw/mcpm/README.md`

- [ ] **Step 1: Write the extractor**

Create `tools/extractMcpmCube.py`:

```python
#!/usr/bin/env python3
"""
extractMcpmCube.py — one-shot maintainer script.

Reads data/raw/mcpm/trace.bin.bz2 (the SDSS DR17 Cosmic Slime VAC
`SDSS_z_44-476mpc` cube, ~345 MB compressed), decompresses + parses via
pyslime into a 712 x 1200 x 728 float32 array, block-averages by factors
{8, 4, 2}, and writes the three downsampled cubes as .npy files alongside
the input.

Run once per VAC release. The .npy outputs get uploaded to R2 (see
tools/syncR2.ts EXTRA_FILES); contributors curl them instead of running
this script.

Dependencies (maintainer-only):
    pip install pyslime numpy scikit-image

Usage:
    python tools/extractMcpmCube.py
    # writes mcpm_sdss_d{8,4,2}.npy into data/raw/mcpm/

Verification:
    The script prints (min, max, mean, p99) of the trace values and the
    sample at world (0, 0, 0). The latter should be near a local-density
    peak — a near-zero sample would suggest pyslime returned axes in a
    different order than export_metadata.txt implies (see CF-4 commit
    c6024d3 for the precedent surprise — "transpose numpy axes 0↔2 to
    match WebGPU x-fastest layout"). If that happens, the build script
    in tools/buildMcpmVolume.ts already does the WebGPU-axis transpose;
    this script just needs to ensure the .npy is in (X, Y, Z) order
    matching export_metadata.txt's (712, 1200, 728).
"""
import os
import sys
import numpy as np
from pyslime import slime  # provided by pip install pyslime
from skimage.transform import downscale_local_mean

RAW_DIR = "data/raw/mcpm"
INPUT = os.path.join(RAW_DIR, "trace.bin.bz2")
EXPECTED_SHAPE = (712, 1200, 728)
GRID_CENTER_MPC = np.array([-239.469, -16.5618, 201.275])
BASE_VOXEL_EDGE_MPC = 0.78131  # 556.288 / 712 (matches export_metadata.txt)
FACTORS = (8, 4, 2)


def load_cube() -> np.ndarray:
    if not os.path.exists(INPUT):
        sys.exit(
            f"missing {INPUT}\n"
            "  Maintainer: download from\n"
            "    https://data.sdss.org/sas/dr17/env/EBOSS_LSS/mcpm/v1_0_1/datacube/SDSS_z_44-476mpc/trace.bin.bz2"
        )
    print(f"loading {INPUT} via pyslime ...")
    sl = slime.Slime.from_file(INPUT)
    arr = np.asarray(sl.data, dtype=np.float32)
    if arr.shape != EXPECTED_SHAPE:
        sys.exit(
            f"unexpected shape {arr.shape}; expected {EXPECTED_SHAPE} per export_metadata.txt"
        )
    return arr


def sanity_check(arr: np.ndarray) -> None:
    print(
        f"trace stats: min={arr.min():.3g}, max={arr.max():.3g}, "
        f"mean={arr.mean():.3g}, p99={np.percentile(arr, 99):.3g}"
    )
    # World (0,0,0) sample. The voxel index for world position p is
    # (p - origin) / voxelSize, where origin = grid_center - grid_size/2.
    origin = GRID_CENTER_MPC - 0.5 * np.array(EXPECTED_SHAPE) * BASE_VOXEL_EDGE_MPC
    idx = ((np.zeros(3) - origin) / BASE_VOXEL_EDGE_MPC).astype(int)
    if (0 <= idx).all() and (idx < EXPECTED_SHAPE).all():
        print(f"world (0,0,0) sample: arr[{tuple(idx)}] = {arr[tuple(idx)]:.3g}")
        print("  (expect a non-trivial value; near-zero suggests an axis-order issue)")
    else:
        print(f"world (0,0,0) maps to voxel idx {tuple(idx)} — outside cube; investigate")


def write_tier(arr: np.ndarray, factor: int) -> None:
    out = os.path.join(RAW_DIR, f"mcpm_sdss_d{factor}.npy")
    print(f"downsampling by {factor}x ...")
    if factor == 1:
        small = arr
    else:
        small = downscale_local_mean(arr, (factor, factor, factor)).astype(np.float32)
    np.save(out, small)
    sizeMB = os.path.getsize(out) / 1024 / 1024
    print(f"  wrote {out}  shape={small.shape}  ({sizeMB:.1f} MB)")


def main() -> None:
    arr = load_cube()
    sanity_check(arr)
    for f in FACTORS:
        write_tier(arr, f)
    print("done.")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Write the contributor README**

Create `data/raw/mcpm/README.md`:

```markdown
# `data/raw/mcpm/` — MCPM Cosmic Web ingest

Three downsampled `.npy` tiers of the SDSS DR17 Cosmic Slime VAC
`SDSS_z_44-476mpc` cube (Wilde et al. 2023). Used by
`tools/buildMcpmVolume.ts` to emit `public/data/mcpm-{small,medium,large}.scfd`.

This directory is gitignored. Contributors download the pre-extracted
`.npy` files from R2; only the maintainer runs the extractor.

## Contributor (every full data rebuild)

```bash
mkdir -p data/raw/mcpm
for f in mcpm_sdss_d8.npy mcpm_sdss_d4.npy mcpm_sdss_d2.npy; do
  curl -L -o "data/raw/mcpm/$f" "https://skymap-data.rulkens.com/data/raw/mcpm/$f"
done
npm run build-mcpm
```

## Maintainer (once per VAC release)

```bash
# 1. Install Python deps (one-time)
pip install pyslime numpy scikit-image

# 2. Download the upstream blob (~345 MB)
mkdir -p data/raw/mcpm
curl -L -o data/raw/mcpm/trace.bin.bz2 \
  https://data.sdss.org/sas/dr17/env/EBOSS_LSS/mcpm/v1_0_1/datacube/SDSS_z_44-476mpc/trace.bin.bz2

# 3. Extract + downsample
python tools/extractMcpmCube.py

# 4. Upload .npy tiers to R2 (idempotent; sync also picks up the .scfd build outputs)
npm run build-mcpm
npm run sync-r2
```

## Format references

- VAC landing page: https://www.sdss4.org/dr17/data_access/value-added-catalogs/?vac_id=cosmic-web-environmental-densities-from-mcpm-slimemold
- pyslime: https://github.com/jnburchett/pyslime
- Design spec: `docs/superpowers/specs/2026-05-11-mcpm-cosmic-web-volume-design.md`
```

- [ ] **Step 3: Verify Python is syntactically valid**

```bash
python3 -m py_compile tools/extractMcpmCube.py
```

Expected: silent success (no output, exit 0).

- [ ] **Step 4: Commit**

```bash
git add tools/extractMcpmCube.py data/raw/mcpm/README.md
git commit -m "$(cat <<'EOF'
feat(tools): MCPM cube Python extractor + contributor README

One-shot maintainer script: pyslime → block-average × {8,4,2} → 3 .npy
files in data/raw/mcpm/. README covers both maintainer and contributor
paths so first-time builders know to curl pre-extracted .npy from R2
rather than running the extractor themselves.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Constants module + anchor test

The MCPM build script needs five constants that are derived from `export_metadata.txt`. Pinning them in their own module + test means a future re-extraction with different metadata fails loudly instead of silently misaligning the cube.

**Files:**
- Create: `tests/data/mcpmAnchors.test.ts`
- (Constants will be placed at the top of `tools/buildMcpmVolume.ts` in Task 4 — the test imports from there.)

- [ ] **Step 1: Write the failing test**

Create `tests/data/mcpmAnchors.test.ts`:

```ts
/**
 * MCPM tier anchors — anti-drift pin on origin and voxelSize for each tier.
 *
 * If a future maintainer re-runs `tools/extractMcpmCube.py` against a new
 * VAC release with different metadata, these assertions fail loudly
 * rather than silently shipping a misaligned cube. Mirrors the role of
 * `tools/auditCf4Anchors.ts` for CF-4.
 */
import { describe, it, expect } from 'vitest';
import {
  MCPM_BASE_DIMS,
  MCPM_BASE_VOXEL_EDGE_MPC,
  MCPM_GRID_CENTER_MPC,
  mcpmTierAnchors,
} from '../../tools/buildMcpmVolume';

describe('MCPM anchors', () => {
  it('base dims match export_metadata.txt', () => {
    expect(MCPM_BASE_DIMS).toEqual([712, 1200, 728]);
  });

  it('base voxel edge ≈ 0.78131 Mpc', () => {
    expect(MCPM_BASE_VOXEL_EDGE_MPC).toBeCloseTo(0.78131, 4);
  });

  it('grid center matches export_metadata.txt', () => {
    expect(MCPM_GRID_CENTER_MPC).toEqual([-239.469, -16.5618, 201.275]);
  });

  // Origin is grid_center - grid_size/2; tier-independent because
  // downsampling preserves the box extents.
  const expectedOrigin: [number, number, number] = [
    MCPM_GRID_CENTER_MPC[0] - 0.5 * MCPM_BASE_DIMS[0] * MCPM_BASE_VOXEL_EDGE_MPC,
    MCPM_GRID_CENTER_MPC[1] - 0.5 * MCPM_BASE_DIMS[1] * MCPM_BASE_VOXEL_EDGE_MPC,
    MCPM_GRID_CENTER_MPC[2] - 0.5 * MCPM_BASE_DIMS[2] * MCPM_BASE_VOXEL_EDGE_MPC,
  ];

  for (const factor of [8, 4, 2] as const) {
    it(`tier (factor=${factor}) inherits origin and scales voxel edge`, () => {
      const a = mcpmTierAnchors(factor);
      expect(a.origin[0]).toBeCloseTo(expectedOrigin[0], 3);
      expect(a.origin[1]).toBeCloseTo(expectedOrigin[1], 3);
      expect(a.origin[2]).toBeCloseTo(expectedOrigin[2], 3);
      expect(a.voxelSize).toBeCloseTo(MCPM_BASE_VOXEL_EDGE_MPC * factor, 6);
      expect(a.dims[0]).toBe(Math.round(MCPM_BASE_DIMS[0] / factor));
      expect(a.dims[1]).toBe(Math.round(MCPM_BASE_DIMS[1] / factor));
      expect(a.dims[2]).toBe(Math.round(MCPM_BASE_DIMS[2] / factor));
    });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/data/mcpmAnchors.test.ts
```

Expected: FAIL with module-not-found on `tools/buildMcpmVolume`.

(The implementation lands in Task 4; this test fails on the import until then. Leave it failing — Task 4's commit makes it green.)

---

## Task 4: `tools/buildMcpmVolume.ts` build script + smoke test

Implements the build script. Constants from Task 3 land at the top; smoke test covers the build end-to-end (synthetic .npy → decode → header assertions). The CF-4 smoke test (`tests/tools/buildCf4Density.smoke.test.ts`) is the line-by-line precedent.

**Files:**
- Create: `tools/buildMcpmVolume.ts`
- Create: `tests/tools/buildMcpmVolume.smoke.test.ts`

- [ ] **Step 1: Write the failing smoke test**

Create `tests/tools/buildMcpmVolume.smoke.test.ts`:

```ts
/**
 * End-to-end smoke test for tools/buildMcpmVolume.ts. Mirrors the
 * tests/tools/buildCf4Density.smoke.test.ts shape: write a synthetic
 * .npy, build, decode the .scfd, assert header fields.
 *
 * MCPM differs from CF-4 in two ways the test must exercise:
 *   - frameKind = 'equatorial-cartesian' (CF-4 is 'supergalactic-cartesian')
 *   - origin = grid_center − grid_size/2 (CF-4 centers on observer)
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildMcpmVolume } from '../../tools/buildMcpmVolume';
import { decodeScalarField } from '../../src/data/scalarFieldFormat';

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

describe('buildMcpmVolume (smoke)', () => {
  let dir: string;
  let npyPath: string;
  let outPath: string;
  // Synthetic 4×4×4 cube with a synthetic origin/voxelSize override so the
  // assertions don't bake in the production MCPM constants.
  const dims: [number, number, number] = [4, 4, 4];
  const overrideOrigin: [number, number, number] = [-100, -50, 25];
  const overrideVoxelSize = 10;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'mcpm-build-'));
    npyPath = join(dir, 'cube.npy');
    outPath = join(dir, 'mcpm-test.scfd');
    const values = Array.from({ length: 64 }, (_, i) => i / 63); // 0..1 ramp
    writeF32Npy(npyPath, values, dims);
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes a decodable SCFD with equatorial-cartesian frame', async () => {
    await buildMcpmVolume({
      npyPath,
      outPath,
      origin: overrideOrigin,
      voxelSizeMpc: overrideVoxelSize,
    });
    expect(existsSync(outPath)).toBe(true);
    const buf = readFileSync(outPath);
    const cube = decodeScalarField(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    );

    expect(cube.dims).toEqual(dims);
    // MCPM uses equatorial-cartesian (id=1 in the SCFD spec); this is the
    // assertion that catches an accidental copy-paste of CF-4's frameKind.
    expect(cube.frameKind).toBe('equatorial-cartesian');
    expect(cube.voxelSize).toBeCloseTo(overrideVoxelSize, 4);
    expect(cube.origin[0]).toBeCloseTo(overrideOrigin[0], 3);
    expect(cube.origin[1]).toBeCloseTo(overrideOrigin[1], 3);
    expect(cube.origin[2]).toBeCloseTo(overrideOrigin[2], 3);
    // Identity rotation — see CF-4 smoke test's matching assertion for the
    // pre-existing rotation-doubling pitfall this guards against.
    expect(cube.rotation[0]).toBeCloseTo(0, 6);
    expect(cube.rotation[1]).toBeCloseTo(0, 6);
    expect(cube.rotation[2]).toBeCloseTo(0, 6);
    expect(cube.rotation[3]).toBeCloseTo(1, 6);
    // Input ran 0..1, no negative values — symmetric normalisation:
    // half = max(|0|, |1|) = 1; normalised = clamp(0.5 + v/2, 0, 1).
    // First voxel (input 0) → 0.5; last (input 1) → 1.0.
    expect(cube.valueMin).toBeCloseTo(0, 4);
    expect(cube.valueMax).toBeCloseTo(1, 4);
    expect(cube.voxels).toBeInstanceOf(Uint16Array);
    expect(cube.voxels.length).toBe(64);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/tools/buildMcpmVolume.smoke.test.ts
```

Expected: FAIL with module-not-found on `tools/buildMcpmVolume`.

- [ ] **Step 3: Write the build script**

Create `tools/buildMcpmVolume.ts`:

```ts
/**
 * buildMcpmVolume.ts — convert one downsampled `.npy` from
 * `tools/extractMcpmCube.py` into the runtime `mcpm-<tier>.scfd`
 * consumed by the scalar-volume renderer.
 *
 * Pure Node/TS — no Python required. Mirrors the conventions of
 * `tools/buildCf4Density.ts`; the f16 packing helper is shared via
 * `tools/parsers/floatToHalf.ts`.
 *
 * Output is gitignored and synced to R2 by `npm run sync-r2`.
 *
 * CLI:
 *   tsx tools/buildMcpmVolume.ts --factor=8|4|2  → one tier
 *   tsx tools/buildMcpmVolume.ts --all           → all three tiers
 *
 * Origin / voxel size are derived from the constants below (sourced from
 * the upstream `export_metadata.txt`); see `tests/data/mcpmAnchors.test.ts`
 * for the anti-drift pin on those constants.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { readNpy } from './parsers/npyReader';
import { f32ToF16Bits } from './parsers/floatToHalf';
import { encodeScalarField } from '../src/data/scalarFieldFormat';
import type { ScalarCube } from '../src/@types/ScalarCube';

/** Native MCPM cube dims per export_metadata.txt (X, Y, Z). */
export const MCPM_BASE_DIMS: readonly [number, number, number] = [712, 1200, 728];

/** Native voxel edge length: 556.288 Mpc / 712 voxels = 0.78131 Mpc. */
export const MCPM_BASE_VOXEL_EDGE_MPC = 0.78131;

/** Grid center in equatorial-cartesian comoving Mpc (observer at origin). */
export const MCPM_GRID_CENTER_MPC: readonly [number, number, number] = [
  -239.469, -16.5618, 201.275,
];

/** Tier filename mapping — keep aligned with src/@types/Tier and syncR2 ALLOW. */
export const MCPM_TIER_FILENAME: Record<8 | 4 | 2, string> = {
  8: 'mcpm-small.scfd',
  4: 'mcpm-medium.scfd',
  2: 'mcpm-large.scfd',
};

/** Derived per-tier dims/origin/voxelSize. Origin is tier-independent. */
export function mcpmTierAnchors(factor: 8 | 4 | 2): {
  dims: [number, number, number];
  origin: [number, number, number];
  voxelSize: number;
} {
  const origin: [number, number, number] = [
    MCPM_GRID_CENTER_MPC[0] - 0.5 * MCPM_BASE_DIMS[0] * MCPM_BASE_VOXEL_EDGE_MPC,
    MCPM_GRID_CENTER_MPC[1] - 0.5 * MCPM_BASE_DIMS[1] * MCPM_BASE_VOXEL_EDGE_MPC,
    MCPM_GRID_CENTER_MPC[2] - 0.5 * MCPM_BASE_DIMS[2] * MCPM_BASE_VOXEL_EDGE_MPC,
  ];
  const dims: [number, number, number] = [
    Math.round(MCPM_BASE_DIMS[0] / factor),
    Math.round(MCPM_BASE_DIMS[1] / factor),
    Math.round(MCPM_BASE_DIMS[2] / factor),
  ];
  return { dims, origin, voxelSize: MCPM_BASE_VOXEL_EDGE_MPC * factor };
}

/**
 * Build one MCPM tier .scfd from a downsampled .npy.
 *
 * Exported for direct invocation from tests; the CLI wrapper at the
 * bottom routes the standard production paths.
 *
 * @param args.npyPath        Path to the f32 .npy (3D, C-order).
 * @param args.outPath        Destination .scfd path.
 * @param args.origin         Override the cube's lower-corner origin in
 *                            equatorial-cartesian Mpc. Production callers
 *                            omit this — the CLI fills in tier-derived
 *                            values from `mcpmTierAnchors`. Tests pass
 *                            a synthetic value matching their tmpdir cube.
 * @param args.voxelSizeMpc   Voxel edge length in Mpc. Same override-vs-
 *                            tier-derived pattern as `origin`.
 */
export async function buildMcpmVolume(args: {
  npyPath: string;
  outPath: string;
  origin: [number, number, number];
  voxelSizeMpc: number;
}): Promise<void> {
  const { npyPath, outPath, origin, voxelSizeMpc } = args;

  // ── 1. Load .npy ─────────────────────────────────────────────────
  const npyBuf = readFileSync(npyPath);
  const npy = readNpy(
    npyBuf.buffer.slice(npyBuf.byteOffset, npyBuf.byteOffset + npyBuf.byteLength),
  );
  if (npy.shape.length !== 3) {
    throw new Error(`buildMcpmVolume: expected 3D array, got shape ${npy.shape.join('x')}`);
  }
  if (!(npy.values instanceof Float64Array) && !(npy.values instanceof Float32Array)) {
    throw new Error(`buildMcpmVolume: expected f64 or f32 .npy, got dtype ${npy.dtype}`);
  }
  const values: Float64Array | Float32Array = npy.values;
  const dims: [number, number, number] = [npy.shape[0]!, npy.shape[1]!, npy.shape[2]!];

  // ── 2. Compute stats ─────────────────────────────────────────────
  let valueMin = +Infinity;
  let valueMax = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (v < valueMin) valueMin = v;
    if (v > valueMax) valueMax = v;
  }

  // ── 3. Symmetric normalisation around 0 → [0, 1] and pack as f16 ──
  // Same algorithm as tools/buildCf4Density.ts; see that file's lines
  // 153-176 for the why-symmetric rationale (preserves zero → 0.5 for
  // divergent palettes). MCPM's trace density is non-negative so the
  // normalised range collapses to [0.5, 1.0] in practice — that's
  // intentional, lets users flip palettes without re-encoding.
  const half = Math.max(1e-9, Math.max(Math.abs(valueMin), Math.abs(valueMax)));
  const invTwoHalf = 1 / (2 * half);
  const voxels = new Uint16Array(values.length);

  // ── Axis transpose: numpy C-order → WebGPU x-fastest ─────────────
  // Same transpose buildCf4Density.ts performs (lines 178-215). The .npy
  // from extractMcpmCube.py is C-order with axis 0 = X (slowest), axis 2
  // = Z (fastest). WebGPU's writeTexture interprets the buffer as
  // x-fastest. A straight copy would visually swap X and Z; the
  // tier-anchors test (Task 3) doesn't catch this — only a visual smoke
  // test or a per-axis fixture would. Keep the transpose in place.
  for (let i = 0; i < dims[0]; i++) {
    for (let j = 0; j < dims[1]; j++) {
      for (let k = 0; k < dims[2]; k++) {
        const inputIdx = i * dims[1] * dims[2] + j * dims[2] + k;
        const outputIdx = k * dims[1] * dims[0] + j * dims[0] + i;
        const normalised = 0.5 + values[inputIdx]! * invTwoHalf;
        const clamped = normalised < 0 ? 0 : normalised > 1 ? 1 : normalised;
        voxels[outputIdx] = f32ToF16Bits(clamped);
      }
    }
  }

  // ── 4. Build the data-only cube ────────────────────────────────────
  const cube: ScalarCube = {
    dims,
    voxels,
    // Equatorial-cartesian: the export_metadata.txt grid center is given
    // in equatorial-cartesian comoving Mpc with observer at origin —
    // same frame SDSS spectroscopic positions live in. The renderer's
    // FRAME_TO_WORLD['equatorial-cartesian'] is identity; no rotation
    // composed underneath, so this `rotation` field is identity too.
    frameKind: 'equatorial-cartesian',
    origin,
    voxelSize: voxelSizeMpc,
    rotation: [0, 0, 0, 1],
    valueMin,
    valueMax,
  };

  const out = encodeScalarField(cube);
  writeFileSync(outPath, Buffer.from(out));

  console.log(
    `[buildMcpmVolume] wrote ${outPath} ` +
      `(dims=${dims.join('x')}, voxelSize=${voxelSizeMpc.toFixed(3)} Mpc, ` +
      `min=${valueMin.toFixed(3)}, max=${valueMax.toFixed(3)}, ` +
      `${out.byteLength} bytes)`,
  );
}

/** Build a single tier from data/raw/mcpm/mcpm_sdss_d{factor}.npy. */
export async function buildMcpmTier(factor: 8 | 4 | 2): Promise<void> {
  const a = mcpmTierAnchors(factor);
  await buildMcpmVolume({
    npyPath: `data/raw/mcpm/mcpm_sdss_d${factor}.npy`,
    outPath: `public/data/${MCPM_TIER_FILENAME[factor]}`,
    origin: a.origin,
    voxelSizeMpc: a.voxelSize,
  });
}

// ── CLI wrapper ────────────────────────────────────────────────────
async function main(): Promise<void> {
  const arg = process.argv[2] ?? '--all';
  if (arg === '--all') {
    for (const f of [8, 4, 2] as const) await buildMcpmTier(f);
    return;
  }
  const m = /^--factor=(8|4|2)$/.exec(arg);
  if (!m) {
    console.error(`usage: tsx tools/buildMcpmVolume.ts [--all | --factor=8|4|2]`);
    process.exit(1);
  }
  await buildMcpmTier(Number(m[1]) as 8 | 4 | 2);
}

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

- [ ] **Step 4: Run typecheck and the new tests**

```bash
npm run typecheck && npx vitest run tests/data/mcpmAnchors.test.ts tests/tools/buildMcpmVolume.smoke.test.ts
```

Expected: typecheck PASS; both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/buildMcpmVolume.ts tests/tools/buildMcpmVolume.smoke.test.ts tests/data/mcpmAnchors.test.ts
git commit -m "$(cat <<'EOF'
feat(tools): MCPM volume build script + smoke + anchor tests

buildMcpmVolume.ts mirrors buildCf4Density.ts: reads a downsampled .npy
tier file, applies symmetric normalisation + WebGPU x-fastest axis
transpose, writes equatorial-cartesian SCFD.  Constants for grid center
and base voxel edge come from export_metadata.txt; tests/data/
mcpmAnchors.test.ts pins them so a future re-extraction with different
metadata fails loudly rather than misaligning the cube silently.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Add `'inferno'` palette to the scalar-field palette set

Aesthetic match for MCPM's slime-mould rendering tradition (warm fire-on-black). Inferno is a matplotlib perceptually-uniform palette in the same family as magma/plasma/viridis — slightly more orange in the upper range than magma, slightly redder in the middle.

**Files:**
- Modify: `src/@types/ScalarCube.d.ts:20-26` — extend the union
- Modify: `src/data/scalarFieldPalettes.ts:53-115` — extend `PALETTE_IDS` + `buildPaletteLut`
- Modify: `tests/data/scalarFieldPalettes.test.ts` — add a peak/valley assertion

- [ ] **Step 1: Write the failing test**

In `tests/data/scalarFieldPalettes.test.ts`, before the closing `});` of the existing `describe`, add:

```ts
  it('inferno is dark at the low end and warm-bright at the high end', () => {
    const lut = buildPaletteLut('inferno');
    expect(lut.length).toBe(PALETTE_LUT_SIZE * 4);
    // Low end is near-black: R+G+B should be small.
    const lowSum = lut[0]! + lut[1]! + lut[2]!;
    expect(lowSum).toBeLessThan(30);
    // High end is warm-bright: R should be high, B should be lower than R+G.
    const peak = (PALETTE_LUT_SIZE - 1) * 4;
    expect(lut[peak + 0]!).toBeGreaterThan(200); // R bright
    expect(lut[peak + 1]!).toBeGreaterThan(180); // G bright
    expect(lut[peak + 2]!).toBeLessThan(lut[peak + 0]! + lut[peak + 1]!); // B not dominant
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/data/scalarFieldPalettes.test.ts
```

Expected: FAIL — TS error or runtime error: `'inferno'` not assignable to `ScalarFieldPaletteId`.

- [ ] **Step 3: Extend the `ScalarFieldPaletteId` union**

In `src/@types/ScalarCube.d.ts`, locate the `ScalarFieldPaletteId` type union (around line 20). Add `'inferno'` between `'magma'` and the next entry:

```ts
export type ScalarFieldPaletteId =
  | 'viridis'
  | 'magma'
  | 'inferno'
  | 'blue-purple'
  | 'yellow-green'
  | 'coolwarm';
```

(Match the existing list members; the snippet above shows the expected final state. If the source uses different formatting, preserve that.)

- [ ] **Step 4: Add `'inferno'` to `PALETTE_IDS`**

In `src/data/scalarFieldPalettes.ts`, in the `PALETTE_IDS` array (around line 53), add the entry next to `'magma'`:

```ts
export const PALETTE_IDS: readonly ScalarFieldPaletteId[] = [
  'viridis',
  'magma',
  'inferno',
  'blue-purple',
  'yellow-green',
  'coolwarm',
];
```

- [ ] **Step 5: Implement `'inferno'` in `buildPaletteLut`**

In the same file, add the case inside `buildPaletteLut` between `'magma'` and `'blue-purple'`. Anchor values are taken from matplotlib's canonical inferno LUT control points:

```ts
    case 'inferno':
      // Matplotlib's `inferno` perceptually-uniform palette: dark
      // purple → red → orange → pale yellow on a near-black floor.
      // Slightly more orange-saturated than magma, which makes it the
      // canonical match for slime-mould / cosmic-web fire-on-black
      // visualisations (Polyphorm, MCPM, plasma family). Anchor RGB
      // values match matplotlib's `_cm_listed.py` inferno entries
      // sampled at t = {0, 0.25, 0.5, 0.75, 1.0}.
      return rampLut([
        [0.0, 0, 0, 4],
        [0.25, 87, 16, 110],
        [0.5, 188, 55, 84],
        [0.75, 249, 142, 9],
        [1.0, 252, 255, 164],
      ]);
```

- [ ] **Step 6: Re-run the palette tests**

```bash
npm run typecheck && npx vitest run tests/data/scalarFieldPalettes.test.ts
```

Expected: typecheck PASS; tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/@types/ScalarCube.d.ts src/data/scalarFieldPalettes.ts tests/data/scalarFieldPalettes.test.ts
git commit -m "$(cat <<'EOF'
feat(palette): add 'inferno' to the scalar-field palette set

Matplotlib's `inferno` perceptually-uniform palette — fiery red/orange/
yellow on near-black — is the canonical aesthetic for slime-mould /
cosmic-web density visualisations (Polyphorm, MCPM tradition). Pre-
requisite for the MCPM volume registration which uses 'inferno' as
its default palette.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `'mcpm'` entry in `volumeFieldDefaults.ts`

**Files:**
- Modify: `src/data/volumeFieldDefaults.ts:125-191` — add `'mcpm'` block
- Modify: `tests/data/volumeFieldDefaults.test.ts:1-79` — extend with `'mcpm'` assertions

- [ ] **Step 1: Extend the failing test**

In `tests/data/volumeFieldDefaults.test.ts`, add this `it` block before the closing `});` of the existing `describe`:

```ts
  it('exposes mcpm with inferno + windowed contrast for heavy-tailed trace density', () => {
    const d = VOLUME_FIELD_DEFAULTS['mcpm'];
    expect(d).toBeDefined();
    // Inferno (matplotlib perceptually-uniform) is the canonical
    // aesthetic for slime-mould / cosmic-web fire-on-black
    // visualisations (Polyphorm, MCPM tradition). Visually distinct
    // from CF-4's coolwarm (divergent cool/warm) so both overlays
    // can be enabled simultaneously and read as separate layers.
    expect(d!.paletteId).toBe('inferno');
    // MCPM trace densities are heavy-tailed (slime-mould agent density
    // spans decades); modest windowing brings filament structure forward
    // without crushing low-density voids.
    expect(d!.contrast).toBeCloseTo(1.5, 6);
    expect(d!.densityScale).toBeCloseTo(4.0, 6);
    expect(d!.label).toBe('MCPM Cosmic Web');
  });

  it('mcpm carries a soft spatial envelope', () => {
    const env = VOLUME_FIELD_DEFAULTS['mcpm']!.envelope;
    expect(env.inner).toBeLessThan(env.outer);
    expect(env.outer).toBeLessThanOrEqual(Math.sqrt(3));
  });
```

- [ ] **Step 2: Verify the test fails**

```bash
npx vitest run tests/data/volumeFieldDefaults.test.ts
```

Expected: two new tests FAIL with "expected undefined to be defined" / matching errors.

- [ ] **Step 3: Add the registry entry**

In `src/data/volumeFieldDefaults.ts`, add this block to `VOLUME_FIELD_DEFAULTS` alphabetically (between `'debug-spherical'` and the closing `};`):

```ts
  'mcpm': {
    // Inferno (matplotlib perceptually-uniform, fire-on-black) is the
    // canonical aesthetic for slime-mould / cosmic-web density
    // visualisations (Polyphorm, MCPM tradition). Visually distinct
    // from CF-4's divergent coolwarm so both overlays can be enabled
    // together and read as separate layers. Added to the palette set
    // by Task 5; this entry is the first consumer.
    paletteId: 'inferno',
    // MCPM trace density spans several decades (slime-mould agent
    // density is heavy-tailed); modest windowing brings filament
    // structure forward without crushing the low-density voids.
    contrast: 1.5,
    // Initial value pending visual tuning against the real cube; lower
    // than CF-4's 20 because MCPM's normalised range stays in [0.5, 1.0]
    // (non-negative input) and saturates faster.
    densityScale: 4.0,
    // Same posture as CF-4: soft skirt from the inscribed sphere
    // inward to hide the axis-aligned silhouette. The MCPM cube extends
    // 556×938×569 Mpc, so the inscribed sphere reaches well past the
    // SDSS volume of interest; envelope corner-cropping costs nothing
    // visually meaningful.
    envelope: { inner: 0.85, outer: 1.05 },
    label: 'MCPM Cosmic Web',
  },
```

- [ ] **Step 4: Re-run the test**

```bash
npx vitest run tests/data/volumeFieldDefaults.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/volumeFieldDefaults.ts tests/data/volumeFieldDefaults.test.ts
git commit -m "$(cat <<'EOF'
feat(volumes): register 'mcpm' field defaults (inferno + windowing)

Inferno (matplotlib perceptually-uniform, added in the previous commit)
pairs visually with CF-4's divergent coolwarm so both overlays read as
distinct layers when enabled together.  Contrast 1.5 windows out the
heavy-tailed slime-mould density's noise floor; densityScale 4.0 is an
initial value pending visual tuning against the real cube.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `mcpmFetcher` (tier-aware)

**Files:**
- Create: `src/services/loading/fetchers/mcpmFetcher.ts`
- Create: `tests/services/loading/fetchers/mcpmFetcher.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/services/loading/fetchers/mcpmFetcher.test.ts`:

```ts
/**
 * Unit test for mcpmFetcher: maps `req.tier` to the right filename and
 * decodes the response into a ScalarCube. We stub fetchWithProgress to
 * avoid a real network call.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../src/services/loading/fetchWithProgress', () => ({
  dataUrl: (path: string) => `/data/${path}`,
  fetchWithProgress: vi.fn(),
}));

import { mcpmFetcher } from '../../../../src/services/loading/fetchers/mcpmFetcher';
import { encodeScalarField } from '../../../../src/data/scalarFieldFormat';
import { fetchWithProgress } from '../../../../src/services/loading/fetchWithProgress';
import type { ScalarCube } from '../../../../src/@types/ScalarCube';

const fakeCube: ScalarCube = {
  dims: [2, 2, 2],
  voxels: new Uint16Array(8),
  frameKind: 'equatorial-cartesian',
  origin: [0, 0, 0],
  voxelSize: 1,
  rotation: [0, 0, 0, 1],
  valueMin: 0,
  valueMax: 1,
};

describe('mcpmFetcher', () => {
  beforeEach(() => vi.mocked(fetchWithProgress).mockReset());

  it.each([
    ['small', 'mcpm-small.scfd'],
    ['medium', 'mcpm-medium.scfd'],
    ['large', 'mcpm-large.scfd'],
  ] as const)('fetches %s tier from %s', async (tier, expectedFilename) => {
    vi.mocked(fetchWithProgress).mockResolvedValueOnce(encodeScalarField(fakeCube));
    const cube = await mcpmFetcher({ tier }, undefined, undefined);
    expect(fetchWithProgress).toHaveBeenCalledOnce();
    const url = vi.mocked(fetchWithProgress).mock.calls[0]![0];
    expect(url).toContain(expectedFilename);
    expect(cube.dims).toEqual([2, 2, 2]);
    expect(cube.frameKind).toBe('equatorial-cartesian');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/services/loading/fetchers/mcpmFetcher.test.ts
```

Expected: FAIL with module-not-found.

- [ ] **Step 3: Write the fetcher**

Create `src/services/loading/fetchers/mcpmFetcher.ts`:

```ts
/**
 * mcpmFetcher — Fetcher<ScalarCube, MCPMReq>.
 *
 * Tier-aware filename: `mcpm-{small,medium,large}.scfd`. Mirrors
 * filamentFetcher's `{ tier }` request shape. Unlike filaments
 * (which never reload on tier flip — the topology barely differs),
 * MCPM IS tier-reloaded — the resolution change is the user-visible
 * point of the tier dropdown for this overlay, and a lower-tier
 * .scfd is small enough that the bandwidth tradeoff inverts vs
 * filaments.
 *
 * On 404 the slot machinery's error path leaves the field
 * unregistered; the Volumes panel simply doesn't show "MCPM Cosmic
 * Web". Mirrors the cf4DensityFetcher fallback.
 */
import type { Fetcher } from '../types';
import type { ScalarCube } from '../../../@types/ScalarCube';
import type { Tier } from '../../../@types/Tier';
import { decodeScalarField } from '../../../data/scalarFieldFormat';
import { dataUrl, fetchWithProgress } from '../fetchWithProgress';

/** Request shape: tier alone — the cube isn't per-source. */
export type MCPMReq = { tier: Tier };

const FILENAME: Record<Tier, string> = {
  small: 'mcpm-small.scfd',
  medium: 'mcpm-medium.scfd',
  large: 'mcpm-large.scfd',
};

export const mcpmFetcher: Fetcher<ScalarCube, MCPMReq> = async (req, signal, onProgress) => {
  const buf = await fetchWithProgress(dataUrl(FILENAME[req.tier]), signal, onProgress);
  return decodeScalarField(buf);
};
```

- [ ] **Step 4: Re-run the test**

```bash
npm run typecheck && npx vitest run tests/services/loading/fetchers/mcpmFetcher.test.ts
```

Expected: typecheck PASS; test PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/loading/fetchers/mcpmFetcher.ts tests/services/loading/fetchers/mcpmFetcher.test.ts
git commit -m "$(cat <<'EOF'
feat(loading): mcpmFetcher — tier-aware MCPM .scfd fetch

Mirrors filamentFetcher's { tier }-only request shape. Unlike filaments,
MCPM IS reloaded on tier flip — the resolution change is the user-
visible point of the tier dropdown for this overlay, and a lower-tier
.scfd is small enough for the bandwidth tradeoff to invert.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `mcpmSlot` factory + `assetSlots.mcpm` type field

**Files:**
- Create: `src/services/loading/slots/mcpmSlot.ts`
- Modify: `src/@types/EngineState.d.ts:148-164` area — add `mcpm: AssetSlot<ScalarCube, MCPMReq> | null`

- [ ] **Step 1: Extend `EngineState.assetSlots` type**

In `src/@types/EngineState.d.ts`, locate the `cf4Density: AssetSlot<ScalarCube, void> | null;` field (around line 164). Immediately after it, add:

```ts
  /**
   * MCPM Cosmic Web density volume — SDSS DR17 Cosmic Slime VAC
   * `SDSS_z_44-476mpc` cube (Wilde et al. 2023), 712×1200×728 voxels at
   * native resolution, downsampled into three tiers.
   *
   * Tier-aware (unlike cf4Density above): slot is loaded at boot with
   * `state.sources.tier`, and reloaded on tier change by `engine.setTier`.
   * Default-off in user settings; the .scfd is fetched eagerly so the
   * field is ready when the user toggles it on in the Volumes panel.
   *
   * Null until `wireSlots` mints it (matches cf4Density for the same
   * lifecycle reason — the renderer must exist before commit).
   */
  mcpm: AssetSlot<ScalarCube, MCPMReq> | null;
```

If `MCPMReq` isn't already imported in this file, add it to the existing fetcher imports near the top:

```ts
import type { MCPMReq } from '../services/loading/fetchers/mcpmFetcher';
```

(Match the existing import style — most slot req types are imported there.)

- [ ] **Step 2: Verify typecheck fails on the slot factory consuming the new field**

This is the canonical "test" for an interface change — the next step's typecheck is the proof. Skip directly to Step 3.

- [ ] **Step 3: Write the slot factory**

Create `src/services/loading/slots/mcpmSlot.ts`:

```ts
/**
 * mcpmSlot — factory for the MCPM Cosmic Web volume's asset slot.
 *
 * Tier-aware (unlike cf4DensitySlot's void request). On commit, hands
 * the decoded ScalarCube to scalarVolumeRenderer.addField under the
 * handle 'mcpm', then seeds per-field settings if not already present
 * (preserving any user-tuned intensity/palette across tier reloads).
 *
 * Gate ownership matches cf4DensitySlot: the factory itself is
 * unconditional; `wireSlots` is responsible for the volumesGateOpen
 * check before invoking it.
 */
import { createAssetSlot } from '../AssetSlot';
import { mcpmFetcher } from '../fetchers/mcpmFetcher';
import type { MCPMReq } from '../fetchers/mcpmFetcher';
import { DEFAULT_VOLUME_FIELD_INTENSITY } from '../../../data/defaults';
import { getVolumeFieldDefaults } from '../../../data/volumeFieldDefaults';
import type { ScalarCube } from '../../../@types/ScalarCube';
import type { SlotFactory } from './types';

export const createMcpmSlot: SlotFactory<ScalarCube, MCPMReq> = (state, cb) => {
  const slot = createAssetSlot({
    name: 'mcpm',
    fetch: mcpmFetcher,
    commit: async (cube) => {
      const renderer = state.gpu.scalarVolumeRenderer;
      if (!renderer) return;
      const handle = 'mcpm';
      const defaults = getVolumeFieldDefaults(handle);
      renderer.addField(handle, cube);
      // Seed-and-forward shape lifted from cf4DensitySlot (verbatim
      // duplication is intentional — H3 in the 2026-05-11 audit deferred
      // dedup of this pattern to a follow-up PR).
      if (!state.settings.volumes.fields[handle]) {
        state.settings.volumes.fields[handle] = {
          // Default-off — same posture as CF-4. The user opts in via the
          // SettingsPanel toggle.
          enabled: false,
          intensity: DEFAULT_VOLUME_FIELD_INTENSITY,
          contrast: defaults.contrast,
          densityScale: defaults.densityScale,
          paletteId: defaults.paletteId,
        };
      }
      const persisted = state.settings.volumes.fields[handle]!;
      renderer.setIntensity(handle, persisted.intensity);
      renderer.setEnabled(handle, persisted.enabled);
      renderer.setContrast(handle, persisted.contrast);
      renderer.setFieldPalette(handle, persisted.paletteId);
      renderer.setDensityScale(handle, persisted.densityScale);
      renderer.setEnvelope(handle, defaults.envelope.inner, defaults.envelope.outer);
      cb.volumes?.onFieldsChanged?.();
      state.subsystems.scheduler.requestRender();
    },
  });
  slot.subscribe((s) => {
    if (s.kind === 'ready') {
      console.log(
        `[engine] mcpm: ${s.value.dims.join('x')} cube, ` +
          `min=${s.value.valueMin.toFixed(3)}, max=${s.value.valueMax.toFixed(3)}`,
      );
    }
  });
  state.assetSlots.mcpm = slot;
  return slot;
};
```

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/loading/slots/mcpmSlot.ts src/@types/EngineState.d.ts
git commit -m "$(cat <<'EOF'
feat(loading): mcpmSlot factory + assetSlots.mcpm type field

Tier-aware slot for the MCPM Cosmic Web cube. Commit registers the cube
under the 'mcpm' field handle on scalarVolumeRenderer. Per-field
settings default to enabled=false so the user opts in via the Volumes
panel toggle. Seed-and-forward shape duplicates cf4DensitySlot's
inline pattern (audit H3 deferred dedup to a follow-up).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Wire MCPM into `wireSlots.ts` + reload on tier change

**Files:**
- Modify: `src/services/engine/phases/wireSlots.ts:84` (import), `:240-249` (mint block)
- Modify: `src/services/engine/engine.ts:929-946` (setTier)

- [ ] **Step 1: Import the factory in `wireSlots.ts`**

Add the import next to the existing `createCf4DensitySlot` import (around line 84):

```ts
import { createMcpmSlot } from '../../loading/slots/mcpmSlot';
```

- [ ] **Step 2: Mint the slot inside the `volumesGateOpen` block**

In `wireSlots.ts`, locate the `if (volumesGateOpen) { createCf4DensitySlot(state, cb); }` block (around line 247-249). Replace it with:

```ts
  if (volumesGateOpen) {
    createCf4DensitySlot(state, cb);
    const mcpmSlot = createMcpmSlot(state, cb);
    // Eager initial load at the tier the engine boots into. Tier changes
    // mid-session reroute through engine.setTier (see engine.ts).
    void mcpmSlot.load({ tier: state.sources.tier });
  }
```

- [ ] **Step 3: Extend `setTier` to reload MCPM**

In `src/services/engine/engine.ts`, locate the `setTier` function (line 929). Inside the function, after the existing `for (const src of [...]) { ... slot?.load(...) }` loop and before the closing `}`, add:

```ts
    // MCPM volume: tier-aware (unlike CF-4). Same per-tier reload semantics
    // as the point-source loop above — different fetcher, different field
    // handle, but the AssetSlot machinery handles cancellation of any
    // in-flight previous-tier load identically.
    state.assetSlots.mcpm?.load({ tier });
```

- [ ] **Step 4: Run typecheck + the full test suite**

```bash
npm run typecheck && npm test
```

Expected: PASS for both. The pre-existing 590+ tests should stay green; nothing here changes runtime behaviour for non-MCPM paths.

- [ ] **Step 5: Commit**

```bash
git add src/services/engine/phases/wireSlots.ts src/services/engine/engine.ts
git commit -m "$(cat <<'EOF'
feat(engine): wire MCPM slot — boot load + tier-change reload

wireSlots mints the slot under the existing volumesGateOpen check
(same gate as cf4Density and the synthetic debug fixtures). Initial
load at state.sources.tier; setTier extension reloads MCPM whenever
the user changes tier. Re-uses the AssetSlot machinery's in-flight
cancellation for tier-swap races.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Sync R2 ALLOW filter + EXTRA_FILES for `.npy` tiers

**Files:**
- Modify: `tools/syncR2.ts:74-89` (ALLOW), `:110-140` (EXTRA_FILES)

- [ ] **Step 1: Extend the ALLOW filter for the three `.scfd` tiers**

In `tools/syncR2.ts`, locate the `ALLOW` predicate (lines 74-89). Add the MCPM line before the closing `;` at line 89:

```ts
  // MCPM Cosmic Web density cubes — SDSS DR17 Cosmic Slime VAC
  // (Wilde et al. 2023), tiered downsamples emitted by
  // `npm run build-mcpm` from the .npy tiers in data/raw/mcpm/.
  /^mcpm-(small|medium|large)\.scfd$/.test(name);
```

If the existing line above it ends with `||`, your new line keeps the chain. Otherwise add a leading `||` to the line above to close the chain into the new test.

- [ ] **Step 2: Add EXTRA_FILES entries for the source `.npy` tiers**

In `tools/syncR2.ts`, locate the `EXTRA_FILES` array (around line 110). After the existing `cf4` entry, add:

```ts
  ...([8, 4, 2] as const).map((factor) => ({
    // MCPM Cosmic Web .npy tier — block-averaged downsample of the SDSS
    // DR17 Cosmic Slime VAC trace.bin.bz2, produced by
    // `python tools/extractMcpmCube.py`. Contributors curl these instead
    // of installing pyslime + the 345 MB upstream blob.
    localPath: `data/raw/mcpm/mcpm_sdss_d${factor}.npy`,
    r2Key: `data/raw/mcpm/mcpm_sdss_d${factor}.npy`,
  })),
```

- [ ] **Step 3: Verify typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tools/syncR2.ts
git commit -m "$(cat <<'EOF'
feat(sync-r2): allow mcpm-{small,medium,large}.scfd + .npy sources

Extends the ALLOW filter for the three runtime-fetched .scfd tiers,
and EXTRA_FILES for the upstream .npy tier files (so contributors
curl pre-extracted .npy from R2 instead of running pyslime).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: package.json script + .gitignore + CLAUDE.md

**Files:**
- Modify: `package.json:35-50` area (scripts)
- Modify: `.gitignore:135-140` area (CF-4 block) — add MCPM section
- Modify: `CLAUDE.md` data-pipeline section — add MCPM ingest paragraph

- [ ] **Step 1: Add the build-mcpm script**

In `package.json`, locate the `"build-cf4-density"` script entry. Add immediately after:

```json
    "build-mcpm": "tsx tools/buildMcpmVolume.ts --all",
```

- [ ] **Step 2: Extend .gitignore**

In `.gitignore`, after the existing CF-4 block (lines 135-138), add:

```
# MCPM Cosmic Web cube intermediates and build artefacts (gitignored —
# .npy tiers hosted on R2; .scfd outputs are deterministic build outputs.
# See data/raw/mcpm/README.md.)
data/raw/mcpm/*.npy
data/raw/mcpm/*.bin.bz2
public/data/mcpm-*.scfd
```

- [ ] **Step 3: Add MCPM paragraph to CLAUDE.md**

In `CLAUDE.md`, locate the "Deploy workflow (Cloudflare Workers Assets + R2)" section. After the existing CF-4-related text but before the `_headers` / CORS subsections, add this paragraph (or append to the existing data-rebuild numbered list):

```markdown
### MCPM Cosmic Web volume

The SDSS DR17 Cosmic Slime VAC `SDSS_z_44-476mpc` cube ships as three
tiered SCFDs (`mcpm-{small,medium,large}.scfd`) alongside CF-4. The
extract step requires Python + pyslime and only happens once per VAC
release; contributors curl the pre-extracted `.npy` tiers from R2 and
run `npm run build-mcpm` to emit the SCFDs locally. The runtime fetches
`mcpm-<tier>.scfd` per the user's current tier dropdown — same path
the point clouds use through `state.sources.tier`. See
`docs/superpowers/specs/2026-05-11-mcpm-cosmic-web-volume-design.md`
for the full pipeline + format details.
```

- [ ] **Step 4: Sanity check**

```bash
git diff package.json .gitignore CLAUDE.md
```

Confirm the diff matches the steps above.

- [ ] **Step 5: Commit**

```bash
git add package.json .gitignore CLAUDE.md
git commit -m "$(cat <<'EOF'
chore: build-mcpm npm script + gitignore + CLAUDE.md ingest paragraph

Wires the maintainer-facing surface (npm script + docs) and gitignores
the .npy intermediates and .scfd build outputs.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Manual smoke + open PR

This task is the gate before merge. The build pipeline ships fully tested in Tasks 1-10; this task confirms the rendered output matches expectations against the real cube.

- [ ] **Step 1: Verify the test suite is green end-to-end**

```bash
npm test
```

Expected: all 590+ tests PASS, plus the new MCPM tests added in Tasks 1-7.

- [ ] **Step 2: Type-check both src and tools**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3 (maintainer-only, optional pre-PR): build the real tiers**

If the maintainer has the `.npy` tiers staged in `data/raw/mcpm/`:

```bash
npm run build-mcpm
ls -lh public/data/mcpm-*.scfd
```

Expected output: three files, sizes approximately matching the spec (small ~2.4 MB, medium ~19 MB, large ~155 MB).

- [ ] **Step 4 (visual): dev-server smoke test**

```bash
# Dev server should already be running; otherwise:
# npm run dev
# Open http://localhost:5173/?volumes=1
```

In the browser:

1. Open Settings → Volumes section.
2. Confirm "MCPM Cosmic Web" row appears (registry-driven).
3. Toggle it on. Expect an orange/red smoky overlay centered on the SDSS galaxy region.
4. Toggle CF-4 on alongside. Both should render as visually distinct layers (inferno vs coolwarm).
5. Switch tier (small ↔ medium ↔ large). The MCPM overlay should swap and intensify with the higher-resolution cube.

If any visual step fails (mis-aligned cube, no overlay, wrong palette), the diagnosis path is:
- Check the browser console for `[engine] mcpm: ...` log line — confirms the slot loaded.
- Inspect the network tab for `mcpm-<tier>.scfd` — confirms tier-swap re-fetched.
- If the overlay is mis-aligned, check the X↔Z transpose in `tools/buildMcpmVolume.ts` against the CF-4 commit `c6024d3` for the precedent fix.

- [ ] **Step 5: Push and open PR**

```bash
git push -u origin spec/mcpm-cosmic-web-volume
gh pr create --title "MCPM Cosmic Web volume — spec + implementation" --body "$(cat <<'EOF'
## Summary

- Adds the SDSS DR17 Cosmic Slime VAC `SDSS_z_44-476mpc` cube as a tiered scalar volume overlay alongside CF-4.
- Pipeline: `tools/extractMcpmCube.py` (one-shot, pyslime) → 3 `.npy` tiers → `tools/buildMcpmVolume.ts` → `mcpm-{small,medium,large}.scfd` → R2 → runtime tier-aware slot → existing `scalarVolumeRenderer`.
- Auto-registered in the SettingsPanel via the `'mcpm'` entry in `src/data/volumeFieldDefaults.ts` (no SettingsPanel.tsx edit needed).
- Gated behind the existing `?volumes=1` URL flag, same as CF-4.

## Test plan

- [ ] `npm test` green (smoke test for builder, anchor pin, fetcher unit, defaults registry).
- [ ] `npm run typecheck` clean.
- [ ] Visual smoke (manual, see plan): MCPM overlay renders correctly when toggled; tier-swap works; both MCPM and CF-4 read as distinct layers when both enabled.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review notes

- **Spec coverage:** every numbered section of the spec maps to a task — extractor (Task 2), build script (Task 4), constants/anchors (Task 3), inferno palette (Task 5), defaults entry (Task 6), runtime wiring (Tasks 7-9), R2 sync (Task 10), gitignore + script + docs (Task 11), visual verification (Task 12). The "geometric invariants" test the spec hints at is covered by the smoke test (Task 4) plus the visual smoke test (Task 12) — a binary fixture for `tests/fixtures/` would be heavyweight for marginal additional coverage and is deferred.
- **Helper extraction first:** Task 1 must run before Task 4. The plan orders them accordingly. Task 2 (Python) is independent and could run anywhere; placed second because it's the natural reading order for someone following the data flow.
- **No new SettingsPanel.tsx edit:** confirmed by reading `SettingsPanel.tsx:734-758` — volume rows auto-generate from registered fields. The plan calls this out in the "Reality check vs spec" header section.
- **Tier-aware reload pattern:** new — neither CF-4 (single cube, void request) nor filaments (one-shot, never reloaded) does this. Task 8 introduces it as a one-line addition to `engine.setTier`.
