# Scalar Volume Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Spec:** [`docs/superpowers/specs/2026-05-09-scalar-volume-renderer-design.md`](../specs/2026-05-09-scalar-volume-renderer-design.md)
>
> **Conventions** (from `CLAUDE.md` + memory):
> - Didactic comments — explain *why* and *what the alternative was*, not just *what*.
> - `type` aliases never `interface` — `export type X = { ... }`.
> - No barrel exports for components — import directly from `.tsx`.
> - Tests live under `tests/`, mirror `src/` tree, vitest `node` env.
> - Commits as the user (`rulkens@gmail.com`); add `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` trailer in the message body — never `--author=Claude…`.
> - Be meticulous with WGSL/WESL — slow down on shader edits, verify visually before claiming done.
> - Minimise stateful surface — pure helpers are unit-tested, factory shells are verified by the smoke test.

**Goal:** A generic 3D-scalar-field volume renderer (multi-pass, multi-field, palette-driven raymarcher) wired into the engine with a `Volumes` settings section, demonstrated end-to-end by a synthetic Gaussian cube visible in the dev server.

**Architecture:** Self-describing `SCFD` v1 binary → loader → `ScalarVolumeRenderer` factory holding one entry per registered field → one WESL pipeline that draws each enabled field as a back-face cube with in-shader AABB ray intersection, sampled through a per-field palette LUT, additively blended into the HDR target. New `scalarVolumePass` slots into the existing `HDR_PASSES` registry.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), WebGPU, WESL (linker plugin), React 18, Vitest (`node` env), Vite.

---

## File Structure

### Created

- `src/@types/ScalarCube.d.ts` — runtime decoded shape and supporting types (`ScalarFieldFrameKind`, `ScalarFieldPaletteId`).
- `src/data/scalarFieldFormat.ts` — `SCFD` v1 encoder + decoder.  Pure, no I/O.
- `src/data/scalarFieldPalettes.ts` — palette LUT table (viridis, magma, blue-purple, yellow-green) + LUT generation function.  Pure.
- `src/data/syntheticScalarField.ts` — pure helper that builds a 3D Gaussian-blob `ScalarCube` for the smoke test (and any future debug visualisations).
- `src/services/gpu/renderers/scalarVolumeRenderer.ts` — the renderer factory.
- `src/services/gpu/shaders/scalarVolume/vertex.wesl` — unit-cube → clip-space.
- `src/services/gpu/shaders/scalarVolume/fragment.wesl` — back-face raymarch with AABB intersection.
- `src/services/engine/frame/passes/scalarVolumePass.ts` — `Pass` wrapper.
- `src/services/loading/fetchers/syntheticVolumeFetcher.ts` — `Fetcher<ScalarCube, SyntheticVolumeReq>` parallel to `syntheticPointFetcher`; routes the synthetic cube through the same `AssetSlot` machinery as real cubes will.
- `tools/buildScalarVolumeFixture.ts` — one-shot script that emits the baked test fixture binary; rerun whenever the SCFD format bumps version.
- `tests/fixtures/scalar-volume/tiny-8x8x8.scfd` — checked-in `.scfd` byte sequence (~272 bytes) used as the format decoder's gold-standard fixture.
- `tests/data/scalarFieldFormat.test.ts` — `SCFD` round-trip + bad-magic + bad-version tests + on-disk fixture round-trip.
- `tests/data/scalarFieldPalettes.test.ts` — palette LUT shape + monotonicity tests.
- `tests/data/syntheticScalarField.test.ts` — Gaussian cube shape + symmetry tests.
- `tests/services/loading/fetchers/syntheticVolumeFetcher.test.ts` — fetcher returns a non-null cube of the requested dims.

### Modified

- `src/services/engine/frame/passes/types.ts` — add `scalarVolumeRenderer` to `PassDeps`.
- `src/services/engine/frame/passes/index.ts` — register `scalarVolumePass` in `HDR_PASSES`.
- `src/services/engine/frame/renderFrame.ts` — pass `scalarVolumeRenderer` through into `PassDeps`.
- `src/services/engine/engine.ts` — construct the renderer; in dev mode, kick off the synthetic-volume slot load.
- `src/services/engine/phases/wireSlots.ts` — add `syntheticVolumeSlot` (only in dev) that fetches the cube via `syntheticVolumeFetcher` and commits via `state.gpu.scalarVolumeRenderer.addField(...)`.
- `src/@types/EngineHandle.d.ts` — expose `addVolumeField`, `removeVolumeField`, `setVolumeFieldEnabled`, `setVolumeFieldIntensity` on the public engine handle.
- `src/@types/EngineSettingsState.d.ts` — add `volumesEnabled: boolean` master toggle and `volumeFields: Record<string, { enabled: boolean; intensity: number }>` per-field state.
- `src/data/defaults.ts` — `DEFAULT_VOLUMES_ENABLED = true`, `DEFAULT_VOLUME_FIELD_INTENSITY = 0.5`.
- `src/components/SettingsPanel/SettingsPanel.tsx` — new `Volumes` collapsible section, list-driven from registered fields.
- `src/components/SettingsPanel/SettingsPanel.module.css` — minor: row layout for the per-field controls.

---

## Task 0: Pre-flight — verify baseline

**Files:** none (read-only).

- [ ] **Step 1: Verify baseline tests are green**

Run: `npm test`
Expected: all tests pass (current count is ~590).  Note the exact count; you'll re-check at the end.

- [ ] **Step 2: Verify typecheck is clean**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 3: Confirm dev server starts**

Verify `npm run dev` is already running in the background (per project convention).  If not, start it.  You'll use it for the smoke test in Task 12.

If baseline is broken, STOP and report — don't push new work onto a red baseline.

---

## Task 1: ScalarCube type

**Files:**
- Create: `src/@types/ScalarCube.d.ts`

- [ ] **Step 1: Write the type file**

```ts
/**
 * ScalarCube — runtime form of a `SCFD` v1 binary.
 *
 * Shape after decoding:  the `voxels` array is x-fastest, then y, then z,
 * matching the on-disk byte order.  All metadata fields are decoded into
 * native JS numbers so downstream code never re-parses the header.
 *
 * Why a `f16` Uint16Array on the JS side:  WebGPU's `r16float` 3D texture
 * upload accepts the raw 2-byte representation directly; we store it as
 * `Uint16Array` so the decoder can `set()` the bytes without per-element
 * conversion.  The shader sees full f16 precision; the CPU side never
 * materialises floats unless a test specifically asks (and the synthetic
 * builder writes them out via a small float→f16 helper).
 */

export type ScalarFieldFrameKind = 'supergalactic-cartesian' | 'equatorial-cartesian' | 'galactic';

export type ScalarFieldPaletteId = 'viridis' | 'magma' | 'blue-purple' | 'yellow-green';

export type ScalarCube = {
  /** Voxel grid dimensions; x-fastest. */
  readonly dims: readonly [number, number, number];
  /** Raw f16 voxels as Uint16, length = dims[0] * dims[1] * dims[2]. */
  readonly voxels: Uint16Array;
  /** Coordinate frame the cube lives in.  Renderer maps this to world. */
  readonly frameKind: ScalarFieldFrameKind;
  /** Position of voxel (0,0,0) corner in `frameKind`'s coords, Mpc. */
  readonly origin: readonly [number, number, number];
  /** Edge length of one cubic voxel in Mpc. */
  readonly voxelSize: number;
  /** Unit quaternion (x, y, z, w) applied in the native frame. */
  readonly rotation: readonly [number, number, number, number];
  /** Palette identifier the renderer should use for this field. */
  readonly paletteId: ScalarFieldPaletteId;
  /** Diagnostic; only meaningful when the source data was raw, not pre-normalised. */
  readonly valueMin: number;
  readonly valueMax: number;
};
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/@types/ScalarCube.d.ts
git commit -m "$(cat <<'EOF'
feat(types): ScalarCube — runtime shape for SCFD v1 cubes

First piece of the generic scalar volume renderer (spec
2026-05-09).  Decoded form of the on-disk SCFD binary; raw f16
voxels are kept as Uint16Array so WebGPU r16float upload is a
single `set()` with no per-element conversion.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: SCFD v1 binary format

**Files:**
- Create: `src/data/scalarFieldFormat.ts`
- Create: `tests/data/scalarFieldFormat.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/data/scalarFieldFormat.test.ts
import { describe, it, expect } from 'vitest';
import { encodeScalarField, decodeScalarField, SCFD_HEADER_BYTES } from '../../src/data/scalarFieldFormat';
import type { ScalarCube } from '../../src/@types/ScalarCube';

function makeFixture(): ScalarCube {
  // Tiny 2x2x2 cube — 8 voxels — for quick round-trip checks.
  const voxels = new Uint16Array(8);
  for (let i = 0; i < 8; i++) voxels[i] = i * 1000;
  return {
    dims: [2, 2, 2],
    voxels,
    frameKind: 'supergalactic-cartesian',
    origin: [-100, -100, -100],
    voxelSize: 100,
    rotation: [0, 0, 0, 1],
    paletteId: 'blue-purple',
    valueMin: 0,
    valueMax: 1,
  };
}

describe('SCFD v1 binary format', () => {
  it('round-trips a small cube byte-for-byte', () => {
    const original = makeFixture();
    const decoded = decodeScalarField(encodeScalarField(original));
    expect(decoded.dims).toEqual([2, 2, 2]);
    expect(Array.from(decoded.voxels)).toEqual(Array.from(original.voxels));
    expect(decoded.frameKind).toBe('supergalactic-cartesian');
    expect(decoded.origin).toEqual([-100, -100, -100]);
    expect(decoded.voxelSize).toBe(100);
    expect(decoded.rotation).toEqual([0, 0, 0, 1]);
    expect(decoded.paletteId).toBe('blue-purple');
  });

  it('produces the expected byte length', () => {
    // header 96 + 8 voxels × 2 bytes (f16) = 112
    const buf = encodeScalarField(makeFixture());
    expect(buf.byteLength).toBe(SCFD_HEADER_BYTES + 16);
  });

  it('rejects bad magic', () => {
    const buf = new ArrayBuffer(SCFD_HEADER_BYTES);
    expect(() => decodeScalarField(buf)).toThrow(/magic/);
  });

  it('rejects unsupported version with regenerate hint', () => {
    const buf = encodeScalarField(makeFixture());
    new DataView(buf).setUint32(4, 99, true);
    expect(() => decodeScalarField(buf)).toThrow(/version/);
    expect(() => decodeScalarField(buf)).toThrow(/regenerat/);
  });

  it('rejects unknown frameKind on decode', () => {
    const buf = encodeScalarField(makeFixture());
    new DataView(buf).setUint8(23, 99); // frame_kind byte (offset 20+3 in our header)
    // Note: actual offset depends on the layout — verify against the
    // implementation; the assertion is "throws when the byte is invalid".
    expect(() => decodeScalarField(buf)).toThrow(/frameKind|frame_kind/i);
  });

  it('rejects unknown paletteId on decode', () => {
    const buf = encodeScalarField(makeFixture());
    // palette_id sits before frame_kind in the header — see the
    // implementation comment; this assertion is structural.
    expect(() => decodeScalarField(buf)).not.toThrow(); // baseline OK
    new DataView(buf).setUint8(22, 99);
    expect(() => decodeScalarField(buf)).toThrow(/palette/i);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- scalarFieldFormat`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Write the implementation**

```ts
// src/data/scalarFieldFormat.ts
/**
 * SCFD v1 — Scalar Field binary format.  Self-describing; one cube
 * per file.  Carries enough metadata that the renderer never needs
 * a sidecar JSON.
 *
 * Layout (little-endian):
 *
 *   ── HEADER (96 bytes) ────────────────────────────────────────────
 *   0    4   magic       = "SCFD"  (0x44464353)
 *   4    4   version     = 1
 *   8   12   dims        : uint32 × 3 (Nx, Ny, Nz)
 *  20    1   dtype       : uint8  (0 = f16; only value supported in v1)
 *  21    1   value_kind  : uint8  (0 = pre-normalised [0,1]; 1 reserved)
 *  22    1   palette_id  : uint8  (index into the palette table; see
 *                                    src/data/scalarFieldPalettes.ts)
 *  23    1   frame_kind  : uint8  (0 = supergalactic-cartesian,
 *                                    1 = equatorial-cartesian,
 *                                    2 = galactic)
 *  24   12   origin      : float32 × 3
 *  36    4   voxel_size  : float32
 *  40   16   rotation    : float32 × 4 (unit quaternion x, y, z, w)
 *  56    4   value_min   : float32
 *  60    4   value_max   : float32
 *  64   32   reserved    : uint8 × 32 (zero-filled)
 *
 *   ── VOXEL ARRAY (Nx*Ny*Nz × 2 bytes) ─────────────────────────────
 *   voxels[i] : f16 (stored as Uint16 raw bits)
 *
 * Why bake palette + frame into the binary instead of a sidecar JSON:
 * the existing `.bin` files in skymap (PointCloud, FilamentCloud) are
 * all single-file self-describing — having one consumer require a
 * sidecar would break the precedent and add a fetch.  All metadata
 * here is fixed-width, so the cost is 96 bytes regardless of cube size.
 */

import type {
  ScalarCube,
  ScalarFieldFrameKind,
  ScalarFieldPaletteId,
} from '../@types/ScalarCube';

const MAGIC = 0x44464353; // "SCFD" little-endian
const VERSION = 1;
export const SCFD_HEADER_BYTES = 96;

const FRAME_KIND_TO_ID: Record<ScalarFieldFrameKind, number> = {
  'supergalactic-cartesian': 0,
  'equatorial-cartesian': 1,
  galactic: 2,
};

const ID_TO_FRAME_KIND: ReadonlyArray<ScalarFieldFrameKind> = [
  'supergalactic-cartesian',
  'equatorial-cartesian',
  'galactic',
];

const PALETTE_ID_TO_INDEX: Record<ScalarFieldPaletteId, number> = {
  viridis: 0,
  magma: 1,
  'blue-purple': 2,
  'yellow-green': 3,
};

const INDEX_TO_PALETTE_ID: ReadonlyArray<ScalarFieldPaletteId> = [
  'viridis',
  'magma',
  'blue-purple',
  'yellow-green',
];

export function encodeScalarField(cube: ScalarCube): ArrayBuffer {
  const expectedVoxels = cube.dims[0] * cube.dims[1] * cube.dims[2];
  if (cube.voxels.length !== expectedVoxels) {
    throw new Error(
      `encodeScalarField: voxel count ${cube.voxels.length} does not match Nx*Ny*Nz = ${expectedVoxels}`,
    );
  }
  const buf = new ArrayBuffer(SCFD_HEADER_BYTES + cube.voxels.byteLength);
  const dv = new DataView(buf);
  dv.setUint32(0, MAGIC, true);
  dv.setUint32(4, VERSION, true);
  dv.setUint32(8, cube.dims[0], true);
  dv.setUint32(12, cube.dims[1], true);
  dv.setUint32(16, cube.dims[2], true);
  dv.setUint8(20, 0); // dtype = f16
  dv.setUint8(21, 0); // value_kind = pre-normalised
  dv.setUint8(22, PALETTE_ID_TO_INDEX[cube.paletteId]);
  dv.setUint8(23, FRAME_KIND_TO_ID[cube.frameKind]);
  dv.setFloat32(24, cube.origin[0], true);
  dv.setFloat32(28, cube.origin[1], true);
  dv.setFloat32(32, cube.origin[2], true);
  dv.setFloat32(36, cube.voxelSize, true);
  dv.setFloat32(40, cube.rotation[0], true);
  dv.setFloat32(44, cube.rotation[1], true);
  dv.setFloat32(48, cube.rotation[2], true);
  dv.setFloat32(52, cube.rotation[3], true);
  dv.setFloat32(56, cube.valueMin, true);
  dv.setFloat32(60, cube.valueMax, true);
  // bytes 64..95 stay zero (reserved)

  // Voxel array follows the header.  Source is Uint16Array of f16 bits
  // — copy bytes directly, no per-element conversion.
  new Uint8Array(buf, SCFD_HEADER_BYTES).set(new Uint8Array(cube.voxels.buffer, cube.voxels.byteOffset, cube.voxels.byteLength));
  return buf;
}

export function decodeScalarField(buf: ArrayBuffer): ScalarCube {
  if (buf.byteLength < SCFD_HEADER_BYTES) {
    throw new Error(`decodeScalarField: buffer too small (${buf.byteLength} < ${SCFD_HEADER_BYTES})`);
  }
  const dv = new DataView(buf);
  const magic = dv.getUint32(0, true);
  if (magic !== MAGIC) {
    throw new Error(`decodeScalarField: bad magic 0x${magic.toString(16)} (expected SCFD)`);
  }
  const version = dv.getUint32(4, true);
  if (version !== VERSION) {
    throw new Error(
      `decodeScalarField: unsupported version ${version} (expected ${VERSION}); regenerate the cube via the dataset's build pipeline`,
    );
  }
  const dims: [number, number, number] = [
    dv.getUint32(8, true),
    dv.getUint32(12, true),
    dv.getUint32(16, true),
  ];
  const dtype = dv.getUint8(20);
  if (dtype !== 0) {
    throw new Error(`decodeScalarField: unsupported dtype ${dtype} (v1 supports f16 only)`);
  }
  const paletteIdIdx = dv.getUint8(22);
  const paletteId = INDEX_TO_PALETTE_ID[paletteIdIdx];
  if (paletteId === undefined) {
    throw new Error(`decodeScalarField: unknown palette id ${paletteIdIdx}`);
  }
  const frameKindIdx = dv.getUint8(23);
  const frameKind = ID_TO_FRAME_KIND[frameKindIdx];
  if (frameKind === undefined) {
    throw new Error(`decodeScalarField: unknown frameKind id ${frameKindIdx}`);
  }
  const origin: [number, number, number] = [
    dv.getFloat32(24, true),
    dv.getFloat32(28, true),
    dv.getFloat32(32, true),
  ];
  const voxelSize = dv.getFloat32(36, true);
  const rotation: [number, number, number, number] = [
    dv.getFloat32(40, true),
    dv.getFloat32(44, true),
    dv.getFloat32(48, true),
    dv.getFloat32(52, true),
  ];
  const valueMin = dv.getFloat32(56, true);
  const valueMax = dv.getFloat32(60, true);

  const expectedVoxels = dims[0] * dims[1] * dims[2];
  const expectedBytes = SCFD_HEADER_BYTES + expectedVoxels * 2;
  if (buf.byteLength !== expectedBytes) {
    throw new Error(
      `decodeScalarField: byte length ${buf.byteLength} does not match expected ${expectedBytes} for dims ${dims.join('x')}`,
    );
  }
  // Copy the voxels into a freshly-owned buffer so the caller can hold
  // it independent of the underlying ArrayBuffer's lifetime (matches the
  // PointCloud decoder's contract).
  const voxels = new Uint16Array(expectedVoxels);
  voxels.set(new Uint16Array(buf, SCFD_HEADER_BYTES, expectedVoxels));

  return { dims, voxels, frameKind, origin, voxelSize, rotation, paletteId, valueMin, valueMax };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- scalarFieldFormat`
Expected: PASS, all 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/data/scalarFieldFormat.ts tests/data/scalarFieldFormat.test.ts
git commit -m "$(cat <<'EOF'
feat(data): SCFD v1 — self-describing scalar-cube binary format

96-byte header (magic + version + dims + dtype + value_kind +
palette_id + frame_kind + origin + voxel_size + rotation + value
range + reserved pad) followed by raw f16 voxels.  Encoder /
decoder pair plus round-trip + bad-magic + bad-version +
invalid-frame + invalid-palette tests.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2.5: Baked binary fixture (`tiny-8x8x8.scfd`)

**Files:**
- Create: `tools/buildScalarVolumeFixture.ts` — one-shot generator script.
- Create: `tests/fixtures/scalar-volume/tiny-8x8x8.scfd` — committed binary (~272 bytes).
- Modify: `tests/data/scalarFieldFormat.test.ts` — add a "decode the on-disk fixture" test.

**Why this exists:** an in-process encode→decode test catches symmetric bugs (encoder writes wrong, decoder reads wrong, both agree).  A baked fixture catches the asymmetric case — accidental format bumps where the encoder changes but the on-disk bytes don't, OR endianness assumptions that round-trip in JS but break when a Python preprocessor ships the same bytes.  Costs ~272 bytes in the repo, gives us a gold-standard reference that survives encoder churn.

- [ ] **Step 1: Write the generator script**

```ts
// tools/buildScalarVolumeFixture.ts
/**
 * One-shot generator for the SCFD format's regression fixture.
 *
 * Run manually: `npx tsx tools/buildScalarVolumeFixture.ts`.
 *
 * Re-run only when:
 *   - SCFD version bumps (the fixture must match the current decoder)
 *   - The fixture's content needs to change for new test coverage
 *
 * The output bytes are checked into git at the path below.  Tests
 * round-trip them through `decodeScalarField` to detect drift between
 * the encoder and the on-disk byte format.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { encodeScalarField } from '../src/data/scalarFieldFormat';
import type { ScalarCube } from '../src/@types/ScalarCube';

const OUT = 'tests/fixtures/scalar-volume/tiny-8x8x8.scfd';

// 8×8×8 = 512 voxels.  Each voxel = its linear index, stored as raw
// uint16 (NOT a real f16 encoding — we just need a deterministic byte
// pattern the decoder can read back without needing to compute f16
// values for the assertion).  The fixture's purpose is structural
// (header bytes + voxel byte order), not numerical.
const voxels = new Uint16Array(8 * 8 * 8);
for (let i = 0; i < voxels.length; i++) voxels[i] = i;

const cube: ScalarCube = {
  dims: [8, 8, 8],
  voxels,
  frameKind: 'equatorial-cartesian',
  origin: [-200, -200, -200],
  voxelSize: 50,
  rotation: [0, 0, 0, 1],
  paletteId: 'viridis',
  valueMin: 0,
  valueMax: 1,
};

const buf = encodeScalarField(cube);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, Buffer.from(buf));
console.log(`Wrote ${buf.byteLength} bytes to ${OUT}`);
```

- [ ] **Step 2: Generate the fixture**

Run: `npx tsx tools/buildScalarVolumeFixture.ts`
Expected output: `Wrote 1120 bytes to tests/fixtures/scalar-volume/tiny-8x8x8.scfd` (96-byte header + 512 voxels × 2 bytes = 1120 bytes).

- [ ] **Step 3: Add the on-disk round-trip test**

Append to `tests/data/scalarFieldFormat.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('SCFD v1 — baked fixture round-trip', () => {
  it('decodes the checked-in tiny-8x8x8 fixture with expected metadata', () => {
    const path = join(process.cwd(), 'tests/fixtures/scalar-volume/tiny-8x8x8.scfd');
    const bytes = readFileSync(path);
    // Convert Buffer → ArrayBuffer slice that matches its byte range.
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const decoded = decodeScalarField(ab);
    expect(decoded.dims).toEqual([8, 8, 8]);
    expect(decoded.frameKind).toBe('equatorial-cartesian');
    expect(decoded.paletteId).toBe('viridis');
    expect(decoded.origin).toEqual([-200, -200, -200]);
    expect(decoded.voxelSize).toBe(50);
    // Voxel pattern: index 0 → 0, index 1 → 1, ..., index 511 → 511.
    expect(decoded.voxels[0]).toBe(0);
    expect(decoded.voxels[1]).toBe(1);
    expect(decoded.voxels[511]).toBe(511);
    expect(decoded.voxels.length).toBe(512);
  });

  it('on-disk fixture has the expected total byte length', () => {
    const path = join(process.cwd(), 'tests/fixtures/scalar-volume/tiny-8x8x8.scfd');
    const bytes = readFileSync(path);
    expect(bytes.byteLength).toBe(96 + 512 * 2);
  });
});
```

- [ ] **Step 4: Run the test**

Run: `npm test -- scalarFieldFormat`
Expected: all tests pass, including the two new fixture tests.

- [ ] **Step 5: Commit (fixture + script + test together)**

```bash
git add tools/buildScalarVolumeFixture.ts tests/fixtures/scalar-volume/tiny-8x8x8.scfd tests/data/scalarFieldFormat.test.ts
git commit -m "$(cat <<'EOF'
test(data): baked SCFD fixture for on-disk round-trip

Adds tests/fixtures/scalar-volume/tiny-8x8x8.scfd — an 8³ cube
(1120 bytes) with a deterministic voxel pattern (voxel[i] = i).
Tests now round-trip both an in-memory encode→decode AND the
checked-in bytes; catches accidental format drift where the
encoder is consistent with itself but inconsistent with the
documented on-disk layout.  Fixture is regenerated by
`npx tsx tools/buildScalarVolumeFixture.ts` whenever the SCFD
version bumps.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Palette table + LUT generator

**Files:**
- Create: `src/data/scalarFieldPalettes.ts`
- Create: `tests/data/scalarFieldPalettes.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/data/scalarFieldPalettes.test.ts
import { describe, it, expect } from 'vitest';
import { buildPaletteLut, PALETTE_LUT_SIZE } from '../../src/data/scalarFieldPalettes';

describe('scalar field palettes', () => {
  it('produces a 256×4 RGBA8 LUT', () => {
    const lut = buildPaletteLut('viridis');
    expect(lut.length).toBe(PALETTE_LUT_SIZE * 4);
    expect(lut).toBeInstanceOf(Uint8Array);
  });

  it('starts dark and ends bright for viridis (luminance monotonic-ish)', () => {
    const lut = buildPaletteLut('viridis');
    // Read the alpha channel at both ends to assert the renderer's
    // assumption: alpha ramps from 0 (transparent voids) to ~1 (opaque
    // density peaks).  A LUT with constant alpha would make the entire
    // cube opaque; a LUT with backwards alpha would invert.
    const alphaStart = lut[3]!;
    const alphaEnd = lut[(PALETTE_LUT_SIZE - 1) * 4 + 3]!;
    expect(alphaStart).toBeLessThan(alphaEnd);
    expect(alphaEnd).toBeGreaterThan(200); // basically opaque at peak
  });

  it('blue-purple has higher B than R at the low end', () => {
    const lut = buildPaletteLut('blue-purple');
    // Mid value should still be on the blue/purple side of the spectrum.
    const mid = (PALETTE_LUT_SIZE / 4) * 4;
    expect(lut[mid + 2]!).toBeGreaterThan(lut[mid + 0]!);
  });

  it('yellow-green peaks have R+G high and B low', () => {
    const lut = buildPaletteLut('yellow-green');
    const peak = (PALETTE_LUT_SIZE - 1) * 4;
    expect(lut[peak + 0]! + lut[peak + 1]!).toBeGreaterThan(lut[peak + 2]! * 2);
  });

  it('throws on unknown palette id', () => {
    // @ts-expect-error — testing the runtime guard
    expect(() => buildPaletteLut('does-not-exist')).toThrow(/palette/i);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- scalarFieldPalettes`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Write the implementation**

```ts
// src/data/scalarFieldPalettes.ts
/**
 * Scalar-field palette table.  Each palette is a 256-entry RGBA8 LUT
 * sampled on the GPU as a 1D texture; the alpha channel doubles as the
 * opacity ramp so voids (low values) are transparent and density peaks
 * (high values) are opaque.
 *
 * Why bake the alpha into the LUT instead of computing it shader-side
 * from the value: the perceptual mapping varies per palette (yellow-
 * green wants a steeper opacity ramp than blue-purple to compensate for
 * the higher luminance), and folding it into the LUT lets us tune both
 * colour AND opacity in a single artist-facing data structure.  A
 * separate opacity LUT would double the bind-group complexity for no
 * functional gain.
 *
 * Why these four palettes:
 *   - viridis  / magma         : generic perceptual gradients (matplotlib
 *                                 colormaps).  Useful fallbacks for new
 *                                 datasets before someone picks a brand
 *                                 colour.
 *   - blue-purple              : CF-4 default; matches the Pomarède/Tully
 *                                 publication aesthetic for cosmography.
 *   - yellow-green             : MCPM default; deliberately distinct from
 *                                 blue-purple so the two layers read as
 *                                 separate overlays when both are on.
 *
 * Adding a new palette: extend the union type in ScalarCube.d.ts, add a
 * builder branch here, regenerate any binaries that should reference it.
 * The renderer reads `paletteId` from the cube header — no other touch
 * points.
 */

import type { ScalarFieldPaletteId } from '../@types/ScalarCube';

export const PALETTE_LUT_SIZE = 256;

export function buildPaletteLut(id: ScalarFieldPaletteId): Uint8Array {
  switch (id) {
    case 'viridis':
      return rampLut([
        // (t, r, g, b) — endpoints + a couple of interior anchors for the
        // canonical viridis gradient.  Linearly interpolated between
        // anchors; alpha = t (so voids are transparent, peaks opaque).
        [0.0, 68, 1, 84],
        [0.25, 59, 82, 139],
        [0.5, 33, 144, 141],
        [0.75, 94, 201, 98],
        [1.0, 253, 231, 37],
      ]);
    case 'magma':
      return rampLut([
        [0.0, 0, 0, 4],
        [0.25, 80, 18, 123],
        [0.5, 182, 54, 121],
        [0.75, 252, 137, 97],
        [1.0, 252, 253, 191],
      ]);
    case 'blue-purple':
      return rampLut([
        [0.0, 5, 5, 30],
        [0.4, 60, 30, 150],
        [0.7, 140, 80, 200],
        [1.0, 220, 180, 255],
      ]);
    case 'yellow-green':
      return rampLut([
        [0.0, 5, 20, 5],
        [0.4, 80, 130, 30],
        [0.7, 180, 220, 60],
        [1.0, 255, 255, 180],
      ]);
    default: {
      const _exhaustive: never = id;
      throw new Error(`buildPaletteLut: unknown palette id "${String(_exhaustive)}"`);
    }
  }
}

function rampLut(anchors: ReadonlyArray<readonly [number, number, number, number]>): Uint8Array {
  // anchors is a sorted list of (t, r, g, b) at t in [0, 1]; alpha is
  // derived as t * 255 so voids are transparent and peaks are opaque.
  const out = new Uint8Array(PALETTE_LUT_SIZE * 4);
  for (let i = 0; i < PALETTE_LUT_SIZE; i++) {
    const t = i / (PALETTE_LUT_SIZE - 1);
    // Find the two anchors bracketing t.
    let aIdx = 0;
    for (let j = 0; j < anchors.length - 1; j++) {
      if (t >= anchors[j]![0] && t <= anchors[j + 1]![0]) {
        aIdx = j;
        break;
      }
    }
    const a = anchors[aIdx]!;
    const b = anchors[aIdx + 1] ?? a;
    const span = b[0] - a[0];
    const u = span > 0 ? (t - a[0]) / span : 0;
    out[i * 4 + 0] = Math.round(a[1] + (b[1] - a[1]) * u);
    out[i * 4 + 1] = Math.round(a[2] + (b[2] - a[2]) * u);
    out[i * 4 + 2] = Math.round(a[3] + (b[3] - a[3]) * u);
    out[i * 4 + 3] = Math.round(t * 255);
  }
  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- scalarFieldPalettes`
Expected: PASS, all 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/data/scalarFieldPalettes.ts tests/data/scalarFieldPalettes.test.ts
git commit -m "$(cat <<'EOF'
feat(data): scalar-field palette table + LUT builder

Four palettes (viridis, magma, blue-purple, yellow-green) as
256×4 RGBA8 LUTs.  Alpha = t so voids stay transparent and peaks
go opaque — folds opacity into the same artist-facing data
structure as colour.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Synthetic Gaussian cube generator

**Files:**
- Create: `src/data/syntheticScalarField.ts`
- Create: `tests/data/syntheticScalarField.test.ts`

This is the data fixture the smoke test will visualise.  Pure helper, easy to test, easy to regenerate with different parameters when iterating.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/data/syntheticScalarField.test.ts
import { describe, it, expect } from 'vitest';
import { makeSyntheticGaussianCube } from '../../src/data/syntheticScalarField';
import { f16ToFloat } from '../../src/data/syntheticScalarField';

describe('synthetic Gaussian cube', () => {
  it('produces the requested dims', () => {
    const cube = makeSyntheticGaussianCube({ dims: 8, frameKind: 'equatorial-cartesian' });
    expect(cube.dims).toEqual([8, 8, 8]);
    expect(cube.voxels.length).toBe(8 * 8 * 8);
  });

  it('peaks at the centre', () => {
    const cube = makeSyntheticGaussianCube({ dims: 9, frameKind: 'equatorial-cartesian' });
    // Centre voxel index (4, 4, 4) of a 9³ cube; x-fastest layout.
    const centreIdx = 4 + 4 * 9 + 4 * 81;
    const centre = f16ToFloat(cube.voxels[centreIdx]!);
    // Edge voxel at (0,0,0).
    const edge = f16ToFloat(cube.voxels[0]!);
    expect(centre).toBeGreaterThan(edge);
    expect(centre).toBeGreaterThan(0.9);
    expect(edge).toBeLessThan(0.1);
  });

  it('is symmetric about the centre axes', () => {
    const cube = makeSyntheticGaussianCube({ dims: 9, frameKind: 'equatorial-cartesian' });
    // Compare (1,4,4) vs (7,4,4) — same distance from centre on x.
    const left = f16ToFloat(cube.voxels[1 + 4 * 9 + 4 * 81]!);
    const right = f16ToFloat(cube.voxels[7 + 4 * 9 + 4 * 81]!);
    expect(Math.abs(left - right)).toBeLessThan(0.01);
  });

  it('is centred at the world origin by construction', () => {
    const cube = makeSyntheticGaussianCube({ dims: 8, frameKind: 'equatorial-cartesian', boxSizeMpc: 200 });
    // origin is the corner — for a centred box, that's -boxSize/2.
    expect(cube.origin).toEqual([-100, -100, -100]);
    expect(cube.voxelSize).toBe(200 / 8);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- syntheticScalarField`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Write the implementation**

```ts
// src/data/syntheticScalarField.ts
/**
 * Synthetic 3D Gaussian-blob cube generator.
 *
 * Used for the smoke test in the scalar volume renderer rollout — gives
 * us a recognisable, axially-symmetric, box-centred shape so visual
 * regressions are obvious (a blown-up corner means the AABB intersection
 * is wrong; a smeared-out blob means the linear-interpolation sampler
 * disagreed with the cube model matrix; an off-centre peak means the
 * model matrix translation has the wrong sign).
 *
 * Pure: no I/O.  Returns a fully-formed `ScalarCube` ready to hand to
 * the renderer's `addField`.
 *
 * Why a separate file and not inline in the engine: the smoke test wants
 * to construct the cube outside the engine bootstrap so we can also
 * use it as a vitest fixture for any future renderer-level integration
 * test.  Keeping the helper in `src/data/` (alongside the format
 * encoder/decoder) puts it next to the type it produces.
 */

import type { ScalarCube, ScalarFieldFrameKind } from '../@types/ScalarCube';

export type SyntheticGaussianOptions = {
  /** Cube edge length in voxels (cubic grid).  Default 64. */
  dims?: number;
  /** Frame the cube lives in.  Default `equatorial-cartesian`. */
  frameKind?: ScalarFieldFrameKind;
  /** Physical edge length of the cube in Mpc.  Default 400. */
  boxSizeMpc?: number;
  /** Standard deviation of the Gaussian, in voxels.  Default dims/6. */
  sigmaVoxels?: number;
};

export function makeSyntheticGaussianCube(opts: SyntheticGaussianOptions = {}): ScalarCube {
  const dims = opts.dims ?? 64;
  const frameKind = opts.frameKind ?? 'equatorial-cartesian';
  const boxSizeMpc = opts.boxSizeMpc ?? 400;
  const sigma = opts.sigmaVoxels ?? dims / 6;
  const voxelSize = boxSizeMpc / dims;
  const centre = (dims - 1) / 2;
  const inv2Sigma2 = 1 / (2 * sigma * sigma);

  const voxels = new Uint16Array(dims * dims * dims);
  for (let z = 0; z < dims; z++) {
    for (let y = 0; y < dims; y++) {
      for (let x = 0; x < dims; x++) {
        const dx = x - centre;
        const dy = y - centre;
        const dz = z - centre;
        const r2 = dx * dx + dy * dy + dz * dz;
        const value = Math.exp(-r2 * inv2Sigma2); // [0, 1]
        voxels[x + y * dims + z * dims * dims] = floatToF16(value);
      }
    }
  }

  return {
    dims: [dims, dims, dims],
    voxels,
    frameKind,
    origin: [-boxSizeMpc / 2, -boxSizeMpc / 2, -boxSizeMpc / 2],
    voxelSize,
    rotation: [0, 0, 0, 1],
    paletteId: 'blue-purple',
    valueMin: 0,
    valueMax: 1,
  };
}

// ── f16 conversion helpers ──────────────────────────────────────────
//
// JS has no native f16, so we keep cube voxels as Uint16 holding the
// raw IEEE 754 binary16 bits.  These two helpers convert between f32
// and that representation.  Used here for the Gaussian generator and
// exposed for tests; the renderer uploads the Uint16 directly to a
// WebGPU `r16float` texture (which understands the same bit layout).
//
// Implementation borrowed from the standard "Float16Array shim" trick:
// a 1-element Float32Array view into the same buffer as a Uint32Array
// gives us bit-level access to the f32 representation, which we then
// re-encode into f16.

const f32Buf = new ArrayBuffer(4);
const f32View = new Float32Array(f32Buf);
const u32View = new Uint32Array(f32Buf);

export function floatToF16(value: number): number {
  f32View[0] = value;
  const x = u32View[0]!;
  const sign = (x >> 31) & 0x1;
  let exp = (x >> 23) & 0xff;
  let mant = x & 0x7fffff;
  // Handle special values + denormals roughly — adequate for cubes that
  // ship values in [0, 1] (no NaN/Inf, no negatives expected).
  if (exp === 0xff) {
    return (sign << 15) | 0x7c00 | (mant ? 1 : 0);
  }
  exp = exp - 127 + 15;
  if (exp >= 0x1f) return (sign << 15) | 0x7c00; // Inf
  if (exp <= 0) {
    if (exp < -10) return sign << 15; // underflow → 0
    mant = (mant | 0x800000) >> (1 - exp);
    return (sign << 15) | (mant >> 13);
  }
  return (sign << 15) | (exp << 10) | (mant >> 13);
}

export function f16ToFloat(bits: number): number {
  const sign = (bits >> 15) & 0x1;
  const exp = (bits >> 10) & 0x1f;
  const mant = bits & 0x3ff;
  if (exp === 0) {
    if (mant === 0) return sign ? -0 : 0;
    // Denormal — rebuild as f32.
    const value = mant / 1024 / 16384;
    return sign ? -value : value;
  }
  if (exp === 0x1f) return mant ? NaN : sign ? -Infinity : Infinity;
  const e = exp - 15;
  const value = (1 + mant / 1024) * Math.pow(2, e);
  return sign ? -value : value;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- syntheticScalarField`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/data/syntheticScalarField.ts tests/data/syntheticScalarField.test.ts
git commit -m "$(cat <<'EOF'
feat(data): synthetic Gaussian cube + f16 conversion helpers

Pure helper that produces a 3D Gaussian-blob ScalarCube for use
as the smoke-test fixture for the new scalar volume renderer.
Centre-peaked, box-centred, axially symmetric — visual
regressions in the renderer (off-centre peak, smeared blob,
blown-up corner) become obvious against this fixture.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: WESL vertex shader — unit cube → clip space

**Files:**
- Create: `src/services/gpu/shaders/scalarVolume/vertex.wesl`

This is intentionally small — just transforms a 24-vertex unit cube by per-field model matrix and the shared camera matrix.  No tests (shaders are verified by the smoke test in Task 12, per the *be meticulous with WGSL* memory).

- [ ] **Step 1: Write the shader**

```wgsl
// src/services/gpu/shaders/scalarVolume/vertex.wesl
//
// Vertex stage for the scalar volume renderer.  Draws a unit cube
// (corners at 0..1) transformed by the per-field model matrix and the
// shared camera viewProj.  The fragment shader will reconstruct the
// world-space ray and intersect with the cube's local AABB.
//
// We pass the local-space position through to the fragment shader
// (interpolated across the back-face surface) so the fragment shader
// has a starting point to compute the camera-to-fragment ray direction
// — and a known surface point on the cube boundary, useful for
// validating the AABB intersection (a fragment on the back face must
// have the entry point either behind it on the ray, or at t=0 if the
// camera is inside).

import package::lib::camera::CameraUniforms;

struct VolumeUniforms {
  cam: CameraUniforms,            // 80 bytes (shared prefix)
  modelMatrix: mat4x4<f32>,       //   64 bytes — local cube → world space
  invModelMatrix: mat4x4<f32>,    //   64 bytes — world → local cube space
  cameraPosWorld: vec3<f32>,      //   12 bytes — for ray origin
  intensity: f32,                 //    4 bytes — per-field slider [0,1]
};

@group(0) @binding(0) var<uniform> u: VolumeUniforms;

struct VsOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) localPos: vec3<f32>,        // unit-cube local coords (0..1)
  @location(1) worldPos: vec3<f32>,        // world-space position of this back-face fragment
};

@vertex
fn vs_main(@location(0) cornerLocal: vec3<f32>) -> VsOut {
  let worldPos4 = u.modelMatrix * vec4<f32>(cornerLocal, 1.0);
  var out: VsOut;
  out.clip = u.cam.viewProj * worldPos4;
  out.localPos = cornerLocal;
  out.worldPos = worldPos4.xyz;
  return out;
}
```

- [ ] **Step 2: Verify the shader compiles via the wesl-plugin pre-bundle check**

Run: `npm run typecheck`
Expected: zero errors (the wesl-plugin parses imports at typecheck time).

There is no separate "compile WESL" step — the plugin processes shaders at Vite build time, and the fragment shader in Task 6 is what actually consumes this module.  Visual verification happens in Task 12.

- [ ] **Step 3: Commit**

```bash
git add src/services/gpu/shaders/scalarVolume/vertex.wesl
git commit -m "$(cat <<'EOF'
feat(shaders): scalar volume vertex stage — unit cube → clip space

Transforms a unit cube by per-field model matrix and the shared
camera viewProj.  Passes local-space and world-space positions
through for the fragment-stage AABB intersection.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: WESL fragment shader — back-face raymarch with AABB intersection

**Files:**
- Create: `src/services/gpu/shaders/scalarVolume/fragment.wesl`

This is the most delicate piece in the plan.  Per the *be meticulous with WGSL* memory: read it twice, do not assume it's right until Task 12 confirms it visually.

- [ ] **Step 1: Write the fragment shader**

```wgsl
// src/services/gpu/shaders/scalarVolume/fragment.wesl
//
// Fragment stage for the scalar volume renderer.  Front-face culling at
// the pipeline level means only back faces of the cube rasterise.  This
// is the production-standard pattern that handles both inside-the-cube
// and outside-the-cube cases without per-frame branching:
//
//   - Camera outside the cube:  back faces are visible behind the front
//     faces, both rasterise; we use back faces because they always exist
//     wherever the cube projects on screen.
//   - Camera inside the cube:   front faces are behind the camera and
//     don't rasterise; back faces are the walls we see, and they cover
//     the whole screen.
//
// In both cases the fragment shader reconstructs the camera ray, finds
// where it enters and exits the cube's local-space AABB, and marches
// front-to-back from entry to exit.  The clamp `tMin = max(tMin, 0)`
// handles the inside-the-cube case naturally — the camera starts the
// march from its own position rather than a negative entry point.
//
// We additively blend across multiple fields, so each field's draw
// outputs (rgb * a, a) for over-compositing within ITSELF (front-to-back
// inside the cube), and the pipeline's blend state adds that to the
// HDR target.  Two fields therefore composite as
// `final = field_A_contribution + field_B_contribution`, which is what
// the spec calls for.

import package::lib::camera::CameraUniforms;

struct VolumeUniforms {
  cam: CameraUniforms,
  modelMatrix: mat4x4<f32>,
  invModelMatrix: mat4x4<f32>,
  cameraPosWorld: vec3<f32>,
  intensity: f32,
};

@group(0) @binding(0) var<uniform> u: VolumeUniforms;
@group(0) @binding(1) var volume: texture_3d<f32>;
@group(0) @binding(2) var volumeSampler: sampler;
@group(0) @binding(3) var palette: texture_1d<f32>;
@group(0) @binding(4) var paletteSampler: sampler;

const STEP_COUNT: i32 = 192;
const SATURATION_THRESHOLD: f32 = 0.99;

struct FsIn {
  @location(0) localPos: vec3<f32>,
  @location(1) worldPos: vec3<f32>,
};

// Ray-vs-axis-aligned-unit-AABB intersection in the cube's LOCAL space
// (the cube spans [0, 1]^3 in local coords).  Returns the (tMin, tMax)
// range along the ray, with tMin clamped to 0 so a ray origin inside
// the cube starts marching from the origin.  If the ray misses the cube
// entirely, returns tMax < tMin and the caller discards.
fn intersectUnitAabb(rayOrigin: vec3<f32>, rayDir: vec3<f32>) -> vec2<f32> {
  let invDir = 1.0 / rayDir;
  let t0 = -rayOrigin * invDir;
  let t1 = (vec3<f32>(1.0) - rayOrigin) * invDir;
  let tMinV = min(t0, t1);
  let tMaxV = max(t0, t1);
  let tMin = max(max(tMinV.x, tMinV.y), tMinV.z);
  let tMax = min(min(tMaxV.x, tMaxV.y), tMaxV.z);
  return vec2<f32>(max(tMin, 0.0), tMax);
}

@fragment
fn fs_main(in: FsIn) -> @location(0) vec4<f32> {
  // Reconstruct the camera → fragment ray in WORLD space, then transform
  // into the cube's LOCAL space (where the AABB is the unit cube).
  let rayOriginLocal = (u.invModelMatrix * vec4<f32>(u.cameraPosWorld, 1.0)).xyz;
  let rayDirWorld = normalize(in.worldPos - u.cameraPosWorld);
  let rayDirLocal = (u.invModelMatrix * vec4<f32>(rayDirWorld, 0.0)).xyz;

  let tRange = intersectUnitAabb(rayOriginLocal, rayDirLocal);
  let tMin = tRange.x;
  let tMax = tRange.y;
  if (tMax <= tMin) {
    discard;
  }

  // Fixed-step march from tMin to tMax.  stepLength normalises against
  // STEP_COUNT so opacity is invariant to changes in the constant.
  let stepLength = (tMax - tMin) / f32(STEP_COUNT);
  var accum = vec4<f32>(0.0);
  var t = tMin;
  for (var i = 0; i < STEP_COUNT; i = i + 1) {
    let p = rayOriginLocal + rayDirLocal * t;
    // Sample the 3D texture in [0,1]^3 — same coordinate system as the
    // local AABB, so `p` is directly the texture coordinate.
    let sampleValue = textureSample(volume, volumeSampler, p).r;
    // Look up colour through the 1D palette LUT.  The LUT's alpha
    // channel doubles as the opacity ramp.
    let lut = textureSample(palette, paletteSampler, sampleValue);
    // Pre-multiply alpha by intensity * stepLength (normalised).
    let alpha = lut.a * u.intensity * stepLength * f32(STEP_COUNT) * 0.01;
    let contrib = vec4<f32>(lut.rgb * alpha, alpha);
    // Front-to-back over-compositing within this field.
    accum = accum + (1.0 - accum.a) * contrib;
    if (accum.a > SATURATION_THRESHOLD) { break; }
    t = t + stepLength;
  }
  return accum;
}
```

- [ ] **Step 2: Verify the shader compiles**

Run: `npm run typecheck`
Expected: zero errors.

Note: this fragment shader is the highest-risk file in the plan.  Common bugs to check for during the smoke test in Task 12: the `0.01` opacity normalisation factor at the bottom is empirical — if the smoke-test blob is invisible or fully opaque, this is the first thing to tune.  Document any change here back into the spec's "Rendering pipeline" section.

- [ ] **Step 3: Commit**

```bash
git add src/services/gpu/shaders/scalarVolume/fragment.wesl
git commit -m "$(cat <<'EOF'
feat(shaders): scalar volume fragment — back-face raymarch + AABB

Front-face culling at the pipeline level → only back faces
rasterise.  Fragment reconstructs the camera ray, intersects
with the cube's local-space unit AABB (clamping tMin to 0 so an
inside-the-cube camera starts from itself), front-to-back marches
192 steps, samples the 3D volume + 1D palette LUT, over-composites
within the field, breaks at 0.99 saturation.  Output goes into
the HDR target where the pipeline blend state additively combines
multiple fields.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: ScalarVolumeRenderer factory

**Files:**
- Create: `src/services/gpu/renderers/scalarVolumeRenderer.ts`

Per the project pattern (filamentRenderer, pointRenderer, etc.), the factory shell isn't unit-tested directly — pure helpers extracted from it are.  In v1, the only natural pure helper is the model-matrix builder.

- [ ] **Step 1: Write the failing test for the model-matrix builder**

```ts
// tests/services/gpu/renderers/scalarVolumeRenderer.test.ts
import { describe, it, expect } from 'vitest';
import { buildCubeModelMatrix } from '../../../../src/services/gpu/renderers/scalarVolumeRenderer';
import type { ScalarCube } from '../../../../src/@types/ScalarCube';

function fixture(overrides: Partial<ScalarCube> = {}): ScalarCube {
  return {
    dims: [4, 4, 4],
    voxels: new Uint16Array(64),
    frameKind: 'equatorial-cartesian',
    origin: [-100, -100, -100],
    voxelSize: 50,
    rotation: [0, 0, 0, 1],
    paletteId: 'blue-purple',
    valueMin: 0,
    valueMax: 1,
    ...overrides,
  };
}

describe('buildCubeModelMatrix', () => {
  it('maps unit-cube corner (0,0,0) to the cube origin in world space', () => {
    const m = buildCubeModelMatrix(fixture());
    // m * [0,0,0,1] should equal [origin, 1].  Column-major mat4 ⇒
    // translation lives in elements 12..14.
    expect(m[12]).toBeCloseTo(-100);
    expect(m[13]).toBeCloseTo(-100);
    expect(m[14]).toBeCloseTo(-100);
  });

  it('maps unit-cube corner (1,1,1) to origin + dims*voxelSize', () => {
    const m = buildCubeModelMatrix(fixture());
    // Apply m to [1,1,1,1]: the result is origin + dims*voxelSize on
    // each axis.  For an identity rotation and equatorial frame, that's
    // a clean (-100 + 4*50, -100 + 4*50, -100 + 4*50) = (100, 100, 100).
    const x = m[0]! + m[4]! + m[8]! + m[12]!;
    const y = m[1]! + m[5]! + m[9]! + m[13]!;
    const z = m[2]! + m[6]! + m[10]! + m[14]!;
    expect(x).toBeCloseTo(100);
    expect(y).toBeCloseTo(100);
    expect(z).toBeCloseTo(100);
  });

  it('applies the supergalactic→equatorial rotation when frameKind is supergalactic', () => {
    const m = buildCubeModelMatrix(fixture({ frameKind: 'supergalactic-cartesian' }));
    // The rotation is non-identity, so the upper-left 3x3 should not
    // be a pure scale matrix.  Specifically, off-diagonal entries should
    // be non-zero (the rotation mixes axes).
    const offDiag = Math.abs(m[1]!) + Math.abs(m[2]!) + Math.abs(m[4]!) + Math.abs(m[6]!);
    expect(offDiag).toBeGreaterThan(0.01);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- scalarVolumeRenderer`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Write the renderer**

```ts
// src/services/gpu/renderers/scalarVolumeRenderer.ts
/**
 * ScalarVolumeRenderer — multi-field, palette-driven, additive 3D
 * scalar-field volume renderer.  See the spec at
 * `docs/superpowers/specs/2026-05-09-scalar-volume-renderer-design.md`.
 *
 * Public surface (factory shape, matching D.2 conventions):
 *
 *   - createScalarVolumeRenderer(device, format)
 *   - addField(handle, cube)        → upload cube to a 3D r16float
 *                                       texture, register in the field map
 *   - removeField(handle)            → drop the texture, unregister
 *   - setEnabled(handle, enabled)    → per-field draw gate
 *   - setIntensity(handle, intensity) → [0, 1]
 *   - hasActiveFields()              → true iff any registered+enabled
 *                                       field has intensity > 0; used by
 *                                       the renderer's pass to early-out
 *   - draw(pass, camera)             → dispatch one raymarch per active
 *                                       field, additively blended
 *   - destroy()                      → release all GPU resources
 *
 * Per-field state lives in a `Map<handle, FieldEntry>`; each entry owns
 * its own 3D texture, palette LUT texture, bind group, uniform buffer,
 * and runtime tunables (enabled, intensity, model matrix).  Sharing the
 * pipeline across all fields keeps the layout-`auto` trap from biting:
 * one pipeline → one auto-derived bind-group layout → all bind groups
 * are interchangeable across fields with the same shape.
 */

import { mat4, quat } from 'gl-matrix';
import type { ScalarCube, ScalarFieldFrameKind } from '../../../@types/ScalarCube';
import { buildPaletteLut, PALETTE_LUT_SIZE } from '../../../data/scalarFieldPalettes';
import vsCode from '../shaders/scalarVolume/vertex.wesl?static';
import fsCode from '../shaders/scalarVolume/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../shaderCompileLogger';

// 80 (cam) + 64 (model) + 64 (invModel) + 12 (camPos) + 4 (intensity) = 224
const UNIFORM_BYTES = 224;

// 24 vertices (4 per face × 6 faces) — easier than indexing for a tiny
// fixed-purpose mesh.  Or: 8 unique corners + 36 indices.  We pick the
// indexed form to keep the vertex buffer to 8 × vec3.
const CUBE_CORNERS = new Float32Array([
  0, 0, 0,
  1, 0, 0,
  0, 1, 0,
  1, 1, 0,
  0, 0, 1,
  1, 0, 1,
  0, 1, 1,
  1, 1, 1,
]);

const CUBE_INDICES = new Uint16Array([
  // -z face (winding so normal points -z)
  0, 2, 1,  1, 2, 3,
  // +z face
  4, 5, 6,  5, 7, 6,
  // -y face
  0, 1, 4,  1, 5, 4,
  // +y face
  2, 6, 3,  3, 6, 7,
  // -x face
  0, 4, 2,  2, 4, 6,
  // +x face
  1, 3, 5,  3, 7, 5,
]);

// Supergalactic→equatorial rotation, J2000.  Standard astronomy
// constant — see e.g. de Vaucouleurs 1976.  Stored as a 3x3 column-
// major matrix because it's only ever multiplied with another mat4.
const SG_TO_EQ_ROT = mat4.fromValues(
  -0.7357425, -0.0745682,  0.6731453, 0,
   0.6772612, -0.0808998,  0.7312238, 0,
   0.0000000,  0.9938837,  0.1100143, 0,
   0,          0,          0,         1,
);

const FRAME_TO_WORLD: Record<ScalarFieldFrameKind, mat4> = {
  'supergalactic-cartesian': SG_TO_EQ_ROT,
  'equatorial-cartesian': mat4.create(),
  galactic: mat4.create(), // TODO when we ship a galactic-frame dataset
};

// ── Pure helper: model matrix builder ───────────────────────────────
//
// Maps the unit cube `[0,1]^3` (vertex shader's input space) to the
// cube's footprint in skymap world space.  Composition order, applied
// right-to-left to a unit-cube corner:
//
//   1. scale by (Nx*voxelSize, Ny*voxelSize, Nz*voxelSize) → physical extent
//   2. rotate by the cube's per-cube quaternion (in its native frame)
//   3. translate by the cube's origin (in its native frame)
//   4. transform from the native frame into world space
//
// The function is exported (rather than locked inside the factory)
// because steps 1-3 are pure math worth unit-testing without standing
// up a GPU device.
export function buildCubeModelMatrix(cube: ScalarCube): mat4 {
  const out = mat4.create();
  // Compose right-to-left (so the matrix multiplies in the order above
  // when applied to a column vector).
  // Start with identity, then apply frame→world.
  mat4.copy(out, FRAME_TO_WORLD[cube.frameKind]);
  // Translate by origin.
  mat4.translate(out, out, [cube.origin[0], cube.origin[1], cube.origin[2]]);
  // Rotate by per-cube quaternion.
  const rotMat = mat4.create();
  mat4.fromQuat(rotMat, [cube.rotation[0], cube.rotation[1], cube.rotation[2], cube.rotation[3]]);
  mat4.multiply(out, out, rotMat);
  // Scale to physical extent.
  const sx = cube.dims[0] * cube.voxelSize;
  const sy = cube.dims[1] * cube.voxelSize;
  const sz = cube.dims[2] * cube.voxelSize;
  mat4.scale(out, out, [sx, sy, sz]);
  return out;
}

// ── Factory ─────────────────────────────────────────────────────────

export type ScalarFieldHandle = string;

type FieldEntry = {
  handle: ScalarFieldHandle;
  enabled: boolean;
  intensity: number;
  modelMatrix: mat4;
  invModelMatrix: mat4;
  volumeTexture: GPUTexture;
  paletteTexture: GPUTexture;
  uniformBuffer: GPUBuffer;
  bindGroup: GPUBindGroup;
};

export type ScalarVolumeRenderer = {
  addField(handle: ScalarFieldHandle, cube: ScalarCube): void;
  removeField(handle: ScalarFieldHandle): void;
  setEnabled(handle: ScalarFieldHandle, enabled: boolean): void;
  setIntensity(handle: ScalarFieldHandle, intensity: number): void;
  hasActiveFields(): boolean;
  listHandles(): ScalarFieldHandle[];
  draw(pass: GPURenderPassEncoder, viewProj: mat4, viewportPx: [number, number], cameraPosWorld: [number, number, number]): void;
  destroy(): void;
};

export function createScalarVolumeRenderer(
  device: GPUDevice,
  format: GPUTextureFormat,
): ScalarVolumeRenderer {
  // ── Static per-renderer GPU resources ────────────────────────────
  const cornerBuffer = device.createBuffer({
    size: CUBE_CORNERS.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(cornerBuffer, 0, CUBE_CORNERS);

  const indexBuffer = device.createBuffer({
    size: CUBE_INDICES.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(indexBuffer, 0, CUBE_INDICES);

  const volumeSampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
    addressModeW: 'clamp-to-edge',
  });
  const paletteSampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'scalarVolume.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'scalarVolume.fragment');

  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: vsModule,
      entryPoint: 'vs_main',
      buffers: [
        {
          arrayStride: 12,
          attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
        },
      ],
    },
    fragment: {
      module: fsModule,
      entryPoint: 'fs_main',
      targets: [
        {
          format,
          blend: {
            color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
          },
        },
      ],
    },
    primitive: {
      topology: 'triangle-list',
      cullMode: 'front', // ← back faces only; see fragment.wesl module header
    },
  });
  const bindGroupLayout = pipeline.getBindGroupLayout(0);

  const fields = new Map<ScalarFieldHandle, FieldEntry>();

  function uploadCube(cube: ScalarCube): GPUTexture {
    const tex = device.createTexture({
      size: { width: cube.dims[0], height: cube.dims[1], depthOrArrayLayers: cube.dims[2] },
      format: 'r16float',
      dimension: '3d',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.writeTexture(
      { texture: tex },
      cube.voxels,
      { bytesPerRow: cube.dims[0] * 2, rowsPerImage: cube.dims[1] },
      { width: cube.dims[0], height: cube.dims[1], depthOrArrayLayers: cube.dims[2] },
    );
    return tex;
  }

  function uploadPalette(cube: ScalarCube): GPUTexture {
    const lut = buildPaletteLut(cube.paletteId);
    const tex = device.createTexture({
      size: { width: PALETTE_LUT_SIZE, height: 1, depthOrArrayLayers: 1 },
      format: 'rgba8unorm',
      dimension: '1d',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.writeTexture(
      { texture: tex },
      lut,
      { bytesPerRow: PALETTE_LUT_SIZE * 4 },
      { width: PALETTE_LUT_SIZE, height: 1, depthOrArrayLayers: 1 },
    );
    return tex;
  }

  return {
    addField(handle, cube) {
      // Idempotent — if a field with this handle already exists, drop
      // the old one before registering the new (avoids GPU resource
      // leaks if a hot-reload re-registers).
      const existing = fields.get(handle);
      if (existing) {
        existing.volumeTexture.destroy();
        existing.paletteTexture.destroy();
        existing.uniformBuffer.destroy();
        fields.delete(handle);
      }
      const modelMatrix = buildCubeModelMatrix(cube);
      const invModelMatrix = mat4.create();
      mat4.invert(invModelMatrix, modelMatrix);
      const volumeTexture = uploadCube(cube);
      const paletteTexture = uploadPalette(cube);
      const uniformBuffer = device.createBuffer({
        size: UNIFORM_BYTES,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      const bindGroup = device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: uniformBuffer } },
          { binding: 1, resource: volumeTexture.createView() },
          { binding: 2, resource: volumeSampler },
          { binding: 3, resource: paletteTexture.createView() },
          { binding: 4, resource: paletteSampler },
        ],
      });
      fields.set(handle, {
        handle,
        enabled: true,
        intensity: 0.5,
        modelMatrix,
        invModelMatrix,
        volumeTexture,
        paletteTexture,
        uniformBuffer,
        bindGroup,
      });
    },
    removeField(handle) {
      const entry = fields.get(handle);
      if (!entry) return;
      entry.volumeTexture.destroy();
      entry.paletteTexture.destroy();
      entry.uniformBuffer.destroy();
      fields.delete(handle);
    },
    setEnabled(handle, enabled) {
      const entry = fields.get(handle);
      if (entry) entry.enabled = enabled;
    },
    setIntensity(handle, intensity) {
      const entry = fields.get(handle);
      if (entry) entry.intensity = Math.max(0, Math.min(1, intensity));
    },
    hasActiveFields() {
      for (const e of fields.values()) {
        if (e.enabled && e.intensity > 0) return true;
      }
      return false;
    },
    listHandles() {
      return Array.from(fields.keys());
    },
    draw(pass, viewProj, viewportPx, cameraPosWorld) {
      pass.setPipeline(pipeline);
      pass.setVertexBuffer(0, cornerBuffer);
      pass.setIndexBuffer(indexBuffer, 'uint16');
      // Per-field uniform buffer layout:
      //   0..63   viewProj        (mat4x4 column-major, 16 floats)
      //  64..71   viewportPx      (vec2)
      //  72..79   _pad0, _pad1
      //  80..143  modelMatrix     (mat4x4)
      // 144..207  invModelMatrix  (mat4x4)
      // 208..219  cameraPosWorld  (vec3)
      // 220..223  intensity       (f32)
      const scratch = new Float32Array(UNIFORM_BYTES / 4);
      for (const e of fields.values()) {
        if (!e.enabled || e.intensity <= 0) continue;
        // Write CameraUniforms prefix.
        for (let i = 0; i < 16; i++) scratch[i] = viewProj[i] ?? 0;
        scratch[16] = viewportPx[0];
        scratch[17] = viewportPx[1];
        scratch[18] = 0;
        scratch[19] = 0;
        // modelMatrix at f32 offset 20.
        for (let i = 0; i < 16; i++) scratch[20 + i] = e.modelMatrix[i] ?? 0;
        // invModelMatrix at f32 offset 36.
        for (let i = 0; i < 16; i++) scratch[36 + i] = e.invModelMatrix[i] ?? 0;
        // cameraPosWorld at f32 offset 52.
        scratch[52] = cameraPosWorld[0];
        scratch[53] = cameraPosWorld[1];
        scratch[54] = cameraPosWorld[2];
        // intensity at f32 offset 55.
        scratch[55] = e.intensity;
        device.queue.writeBuffer(e.uniformBuffer, 0, scratch);
        pass.setBindGroup(0, e.bindGroup);
        pass.drawIndexed(CUBE_INDICES.length);
      }
    },
    destroy() {
      for (const e of fields.values()) {
        e.volumeTexture.destroy();
        e.paletteTexture.destroy();
        e.uniformBuffer.destroy();
      }
      fields.clear();
      cornerBuffer.destroy();
      indexBuffer.destroy();
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- scalarVolumeRenderer`
Expected: PASS, all 3 tests.

- [ ] **Step 5: Run typecheck to verify the renderer compiles cleanly**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/services/gpu/renderers/scalarVolumeRenderer.ts tests/services/gpu/renderers/scalarVolumeRenderer.test.ts
git commit -m "$(cat <<'EOF'
feat(gpu): ScalarVolumeRenderer factory + buildCubeModelMatrix

Multi-field, palette-driven, additive 3D scalar-field volume
renderer.  One shared pipeline (front-face culling), one
GPU bind group per field, additive blend at the pipeline level
so multiple active fields composite as sums.  Pure model-matrix
builder (frame→world × translate × rotate × scale) is unit-tested
against three reference cases.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Pass wrapper

**Files:**
- Create: `src/services/engine/frame/passes/scalarVolumePass.ts`
- Modify: `src/services/engine/frame/passes/types.ts`
- Modify: `src/services/engine/frame/passes/index.ts`
- Modify: `src/services/engine/frame/renderFrame.ts`

- [ ] **Step 1: Add `scalarVolumeRenderer` to `PassDeps`**

Edit `src/services/engine/frame/passes/types.ts`.  Find the `PassDeps` type and add:

```ts
import type { ScalarVolumeRenderer } from '../../../gpu/renderers/scalarVolumeRenderer';

// Inside PassDeps:
  /**
   * Scalar 3D volume renderer (CF-4 DM cube, MCPM, synthetic
   * fixtures, ...).  Always present; `hasActiveFields()` is the
   * runtime gate for whether `scalarVolumePass` actually draws.
   */
  scalarVolumeRenderer: ScalarVolumeRenderer;
```

Verify with: `npm run typecheck`
Expected: errors at every site that constructs `PassDeps` (the field is now required).  Those will be fixed in the next steps as we plumb the renderer through.

- [ ] **Step 2: Write the pass**

```ts
// src/services/engine/frame/passes/scalarVolumePass.ts
/**
 * scalarVolumePass — draws all active scalar-field cubes.
 *
 * Gate: master `volumesEnabled` setting AND the renderer reports at
 * least one enabled field with intensity > 0.  When the gate is true
 * the pass dispatches one raymarch per active field; the renderer's
 * pipeline is configured to additively blend, so two active fields
 * with distinct palettes read as two layered overlays.
 *
 * Position in the HDR pass order: AFTER points / quads / disks /
 * filaments — the cubes are decorative atmospherics, drawn over
 * geometry and tone-mapped together with everything else by the
 * post-process step.
 */

import type { Pass } from './types';

export const scalarVolumePass: Pass = {
  name: 'scalar-volume',
  enabled(state, _ctx, settings) {
    return settings.volumesEnabled && state.gpu.scalarVolumeRenderer?.hasActiveFields() === true;
    // Note: state.gpu.scalarVolumeRenderer is non-null after engine
    // bootstrap.  The optional-chain is a belt-and-braces for the
    // (unlikely) frame between the bootstrap gate passing and the
    // renderer being assigned.  See the bootstrap-progression-vs-
    // teardown memory note for why we don't tighten this gate.
  },
  draw(pass, ctx, state, _settings, deps) {
    deps.scalarVolumeRenderer.draw(
      pass,
      ctx.viewProj,
      [ctx.canvasWidthPx, ctx.canvasHeightPx],
      [state.cam!.position[0], state.cam!.position[1], state.cam!.position[2]],
    );
  },
};
```

Note: this assumes `EngineState.gpu` carries a `scalarVolumeRenderer` field.  We add that in Task 9.  The pass references it with optional-chain so the typecheck doesn't break ordering.

- [ ] **Step 3: Register the pass in `HDR_PASSES`**

Edit `src/services/engine/frame/passes/index.ts`.  Import and append `scalarVolumePass` to the array, AFTER the filament pass:

```ts
import { scalarVolumePass } from './scalarVolumePass';

export const HDR_PASSES: ReadonlyArray<Pass> = [
  pointSpritesPass,
  galaxyThumbnailsPass,
  filamentsPass,
  scalarVolumePass, // ← new
  milkyWayPass,
  labelsPass,
  markerLinesPass,
];
```

(Adjust the existing list ordering to match what's currently there — append `scalarVolumePass` after `filamentsPass`.)

- [ ] **Step 4: Plumb `scalarVolumeRenderer` through `renderFrame`'s `PassDeps` build**

Edit `src/services/engine/frame/renderFrame.ts`.  Find where `PassDeps` is constructed and add `scalarVolumeRenderer: input.scalarVolumeRenderer`.  Add `scalarVolumeRenderer: ScalarVolumeRenderer` to the `RenderFrameInput` type (or whatever input bag this file consumes — match the existing pattern for `filamentRenderer`).

- [ ] **Step 5: Verify typecheck**

Run: `npm run typecheck`
Expected: errors only at the call site in `runFrame.ts` that hasn't yet been updated.  We fix that in Task 9.

- [ ] **Step 6: Commit**

```bash
git add src/services/engine/frame/passes/scalarVolumePass.ts src/services/engine/frame/passes/types.ts src/services/engine/frame/passes/index.ts src/services/engine/frame/renderFrame.ts
git commit -m "$(cat <<'EOF'
feat(engine): scalarVolumePass + HDR registry slot

Slots the scalar volume renderer into HDR_PASSES after filaments,
before milky-way.  Gate: master `volumesEnabled` AND the renderer
reports at least one active field.  PassDeps grows a
`scalarVolumeRenderer` field; the engine wiring in the next
commit will populate it.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Engine wiring + handle exposure

**Files:**
- Modify: `src/@types/EngineState.d.ts` (or the relevant sub-type) — add `scalarVolumeRenderer: ScalarVolumeRenderer` to `EngineGpuHandles`.
- Modify: `src/@types/EngineHandle.d.ts` — add the four public setters.
- Modify: `src/@types/EngineSettingsState.d.ts` — add `volumesEnabled` and `volumeFields`.
- Modify: `src/data/defaults.ts` — add the two new defaults.
- Modify: `src/services/engine/engine.ts` — construct the renderer at GPU-init time, expose the four setters, plumb through to `runFrame`.
- Modify: `src/services/engine/frame/runFrame.ts` — pass the renderer into `RenderFrameInput`.

- [ ] **Step 1: Add types**

In `src/@types/EngineSettingsState.d.ts` add:

```ts
export type VolumeFieldSettings = {
  enabled: boolean;
  intensity: number;
};

// Inside EngineSettingsState:
  volumesEnabled: boolean;
  volumeFields: Record<string, VolumeFieldSettings>;
```

In `src/@types/EngineHandle.d.ts` add:

```ts
import type { ScalarCube } from './ScalarCube';

// Inside EngineHandle:
  addVolumeField(handle: string, cube: ScalarCube): void;
  removeVolumeField(handle: string): void;
  setVolumeFieldEnabled(handle: string, enabled: boolean): void;
  setVolumeFieldIntensity(handle: string, intensity: number): void;
  listVolumeFields(): string[];
```

In whichever file declares `EngineGpuHandles` (probably `src/@types/EngineGpuHandles.d.ts`):

```ts
import type { ScalarVolumeRenderer } from '../services/gpu/renderers/scalarVolumeRenderer';

// Inside EngineGpuHandles:
  scalarVolumeRenderer: ScalarVolumeRenderer | null;
```

- [ ] **Step 2: Add defaults**

In `src/data/defaults.ts`:

```ts
export const DEFAULT_VOLUMES_ENABLED = true;
export const DEFAULT_VOLUME_FIELD_INTENSITY = 0.5;
```

In whichever file builds the initial `EngineSettingsState`, add:

```ts
  volumesEnabled: DEFAULT_VOLUMES_ENABLED,
  volumeFields: {},
```

- [ ] **Step 3: Construct the renderer in `engine.ts`**

Find the GPU-bootstrap code (where `pointRenderer`, `filamentRenderer`, etc. are constructed).  Add:

```ts
import { createScalarVolumeRenderer } from '../gpu/renderers/scalarVolumeRenderer';

// During GPU init:
const scalarVolumeRenderer = createScalarVolumeRenderer(device, presentationFormat);
state.gpu.scalarVolumeRenderer = scalarVolumeRenderer;
```

- [ ] **Step 4: Expose the four setters on the engine handle**

In the same file, where the public `EngineHandle` is built (look for `setFilamentSigma` or similar precedent):

```ts
addVolumeField(handle, cube) {
  state.gpu.scalarVolumeRenderer?.addField(handle, cube);
  // Seed the per-field settings entry with defaults if not present.
  if (!state.settings.volumeFields[handle]) {
    state.settings.volumeFields[handle] = {
      enabled: true,
      intensity: DEFAULT_VOLUME_FIELD_INTENSITY,
    };
  }
  state.gpu.scalarVolumeRenderer?.setIntensity(handle, state.settings.volumeFields[handle].intensity);
  state.gpu.scalarVolumeRenderer?.setEnabled(handle, state.settings.volumeFields[handle].enabled);
  callbacks.onVolumeFieldsChanged?.();
  scheduler.requestRender();
},
removeVolumeField(handle) {
  state.gpu.scalarVolumeRenderer?.removeField(handle);
  delete state.settings.volumeFields[handle];
  callbacks.onVolumeFieldsChanged?.();
  scheduler.requestRender();
},
setVolumeFieldEnabled(handle, enabled) {
  if (state.settings.volumeFields[handle]) {
    state.settings.volumeFields[handle].enabled = enabled;
  }
  state.gpu.scalarVolumeRenderer?.setEnabled(handle, enabled);
  scheduler.requestRender();
},
setVolumeFieldIntensity(handle, intensity) {
  if (state.settings.volumeFields[handle]) {
    state.settings.volumeFields[handle].intensity = intensity;
  }
  state.gpu.scalarVolumeRenderer?.setIntensity(handle, intensity);
  scheduler.requestRender();
},
listVolumeFields() {
  return state.gpu.scalarVolumeRenderer?.listHandles() ?? [];
},
```

(`onVolumeFieldsChanged` is a new callback — declare it in `EngineCallbacks.d.ts` as `onVolumeFieldsChanged?: () => void;` so React can re-read the field list.)

- [ ] **Step 5: Plumb the renderer through `runFrame.ts` into `RenderFrameInput`**

Edit `src/services/engine/frame/runFrame.ts`.  Find where `renderFrame(...)` is called and add `scalarVolumeRenderer: state.gpu.scalarVolumeRenderer` (with a non-null assertion or pre-frame gate matching the existing pattern for other renderers).

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 7: Run tests**

Run: `npm test`
Expected: all existing tests still pass.  No new failures from the wiring.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(engine): wire ScalarVolumeRenderer into the engine + handle

Constructs the renderer at GPU-init time, plumbs it through
runFrame → renderFrame → PassDeps, exposes addVolumeField /
removeVolumeField / setVolumeFieldEnabled / setVolumeFieldIntensity
on the public EngineHandle, plus a listVolumeFields() readback.
Per-field enabled+intensity round-trip through EngineSettingsState
so the SettingsPanel can render the controls in the next commit.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: SettingsPanel "Volumes" section

**Files:**
- Modify: `src/components/SettingsPanel/SettingsPanel.tsx` — add the new section.
- Modify: `src/components/SettingsPanel/SettingsPanel.module.css` — minimal layout for per-field rows.
- Modify: `src/App.tsx` (or wherever the SettingsPanel's props are constructed) — pass the `volumeFields` list + setters down.

- [ ] **Step 1: Inspect the existing `Filaments` section as the structural template**

Open `src/components/SettingsPanel/SettingsPanel.tsx` and locate the Filaments section.  The new Volumes section should follow the same shape: a `CollapsibleSection` with a master checkbox in the title row, and a list of per-field rows inside.

- [ ] **Step 2: Add the section**

```tsx
// Inside SettingsPanel.tsx, in the section list:
<CollapsibleSection
  title="Volumes"
  titleControl={
    <input
      type="checkbox"
      checked={volumesEnabled}
      onChange={(e) => onVolumesEnabledChange(e.target.checked)}
    />
  }
>
  {volumeFields.length === 0 ? (
    <div className={styles.emptyHint}>No volume fields registered.</div>
  ) : (
    volumeFields.map((field) => (
      <div key={field.handle} className={styles.volumeFieldRow}>
        <label className={styles.volumeFieldLabel}>
          <input
            type="checkbox"
            checked={field.enabled}
            onChange={(e) => onVolumeFieldEnabledChange(field.handle, e.target.checked)}
          />
          <span>{field.label}</span>
        </label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={field.intensity}
          onChange={(e) => onVolumeFieldIntensityChange(field.handle, Number(e.target.value))}
          disabled={!field.enabled}
        />
      </div>
    ))
  )}
</CollapsibleSection>
```

- [ ] **Step 3: Define the prop types**

Extend the `SettingsPanelProps` type (or whatever it's called):

```ts
export type VolumeFieldRowData = {
  handle: string;
  label: string;       // human-readable; default to handle if not provided
  enabled: boolean;
  intensity: number;
};

// Inside SettingsPanelProps:
  volumesEnabled: boolean;
  volumeFields: ReadonlyArray<VolumeFieldRowData>;
  onVolumesEnabledChange: (enabled: boolean) => void;
  onVolumeFieldEnabledChange: (handle: string, enabled: boolean) => void;
  onVolumeFieldIntensityChange: (handle: string, intensity: number) => void;
```

- [ ] **Step 4: Pipe state and callbacks from `App.tsx`**

In `App.tsx`, mirror the existing pattern for filament settings:

```ts
// React state
const [volumesEnabled, setVolumesEnabled] = useState(DEFAULT_VOLUMES_ENABLED);
const [volumeFields, setVolumeFields] = useState<VolumeFieldRowData[]>([]);

// Subscribe to engine's onVolumeFieldsChanged callback to refresh `volumeFields`.

// Pass into SettingsPanel:
<SettingsPanel
  ...
  volumesEnabled={volumesEnabled}
  volumeFields={volumeFields}
  onVolumesEnabledChange={(v) => { setVolumesEnabled(v); /* no engine setter for master toggle in v1; settings flow via state */ }}
  onVolumeFieldEnabledChange={(h, e) => engineHandle.setVolumeFieldEnabled(h, e)}
  onVolumeFieldIntensityChange={(h, i) => engineHandle.setVolumeFieldIntensity(h, i)}
/>
```

The master `volumesEnabled` toggle round-trips through React state into `EngineSettingsState.volumesEnabled` via the existing settings dispatcher (look at how `filamentsEnabled` is wired and copy the pattern).

- [ ] **Step 5: Add minimal CSS**

In `SettingsPanel.module.css`:

```css
.volumeFieldRow {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.25rem 0;
}
.volumeFieldRow input[type="range"] {
  flex: 1;
}
.volumeFieldLabel {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  min-width: 8rem;
}
.emptyHint {
  font-size: 0.85em;
  opacity: 0.6;
  font-style: italic;
}
```

- [ ] **Step 6: Run typecheck and tests**

Run: `npm run typecheck && npm test`
Expected: zero typecheck errors; all tests still pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(ui): SettingsPanel "Volumes" section

List-driven section: master toggle + one row per registered
volume field, each with its own enable checkbox and intensity
slider.  Empty-state hint when no fields are registered.  Field
list refreshes via the engine's onVolumeFieldsChanged callback so
adding a cube at runtime appears immediately.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Localstorage persistence

**Files:**
- Modify: `src/App.tsx` — persist `volumesEnabled` and `volumeFields[handle].{enabled,intensity}` per the existing localStorage pattern (look at how `filamentSigma` or similar is stored).

- [ ] **Step 1: Add the persistence**

```ts
// On mount:
useEffect(() => {
  const stored = localStorage.getItem('skymap.volumesEnabled');
  if (stored !== null) setVolumesEnabled(stored === 'true');
  const storedFields = localStorage.getItem('skymap.volumeFields');
  if (storedFields) {
    try {
      const parsed = JSON.parse(storedFields) as Record<string, { enabled: boolean; intensity: number }>;
      // Apply to engine; the engine will broadcast onVolumeFieldsChanged
      // which refreshes volumeFields state.
      for (const [h, s] of Object.entries(parsed)) {
        engineHandle?.setVolumeFieldEnabled(h, s.enabled);
        engineHandle?.setVolumeFieldIntensity(h, s.intensity);
      }
    } catch { /* ignore corrupt storage */ }
  }
}, [engineHandle]);

// On change:
useEffect(() => {
  localStorage.setItem('skymap.volumesEnabled', String(volumesEnabled));
}, [volumesEnabled]);

useEffect(() => {
  const snapshot = Object.fromEntries(
    volumeFields.map((f) => [f.handle, { enabled: f.enabled, intensity: f.intensity }]),
  );
  localStorage.setItem('skymap.volumeFields', JSON.stringify(snapshot));
}, [volumeFields]);
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm test`
Expected: zero errors, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "$(cat <<'EOF'
feat(ui): persist volume settings to localStorage

`volumesEnabled` and per-field `{enabled, intensity}` round-trip
through localStorage.  Unknown handles in storage are no-ops
(graceful when fields are unregistered between sessions).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11.5: Synthetic volume fetcher + AssetSlot wiring

**Files:**
- Create: `src/services/loading/fetchers/syntheticVolumeFetcher.ts`
- Create: `tests/services/loading/fetchers/syntheticVolumeFetcher.test.ts`
- Modify: `src/services/engine/phases/wireSlots.ts` — add `syntheticVolumeSlot` (dev-only).
- Modify: `src/@types/EngineState.d.ts` (or wherever `assetSlots` is declared) — add `syntheticVolume` slot field.

**Why this exists:** the equivalent of `syntheticPointFetcher` for the volume renderer.  Routing the synthetic cube through `AssetSlot` instead of calling `engineHandle.addVolumeField` directly means it gets the same fade-in, status reporting, race-checked commit, and retry semantics as a real CF-4 or MCPM cube will when those land.  Two code paths for the same conceptual "this volume is now on the GPU" event would force every future feature (e.g., a "loading volumes…" status row) to be implemented twice.

- [ ] **Step 1: Write the failing test for the fetcher**

```ts
// tests/services/loading/fetchers/syntheticVolumeFetcher.test.ts
import { describe, it, expect } from 'vitest';
import { syntheticVolumeFetcher } from '../../../../src/services/loading/fetchers/syntheticVolumeFetcher';

describe('syntheticVolumeFetcher', () => {
  it('resolves to a ScalarCube of the requested dims', async () => {
    const ctrl = new AbortController();
    const cube = await syntheticVolumeFetcher(
      { handle: 'debug-gaussian', dims: 32, boxSizeMpc: 200 },
      ctrl.signal,
      () => {},
    );
    expect(cube.dims).toEqual([32, 32, 32]);
    expect(cube.voxels.length).toBe(32 * 32 * 32);
    expect(cube.voxelSize).toBe(200 / 32);
  });

  it('respects defaults when dims/boxSizeMpc are not provided', async () => {
    const ctrl = new AbortController();
    const cube = await syntheticVolumeFetcher(
      { handle: 'debug-gaussian' },
      ctrl.signal,
      () => {},
    );
    expect(cube.dims).toEqual([64, 64, 64]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- syntheticVolumeFetcher`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Write the fetcher**

```ts
// src/services/loading/fetchers/syntheticVolumeFetcher.ts
/**
 * syntheticVolumeFetcher — `Fetcher<ScalarCube, SyntheticVolumeReq>`.
 *
 * Resolves synchronously to a deterministic Gaussian-blob cube produced
 * by `makeSyntheticGaussianCube`.  Routed through the `AssetSlot`
 * machinery so the synthetic cube's lifecycle is identical to a real
 * CF-4 or MCPM cube's: ready/error transitions, race-checked commit,
 * `LoadingDevPanel` row.
 *
 * Mirrors the `syntheticPointFetcher` precedent — see that file's
 * docblock for the full rationale.  Without this fetcher, dev-mode
 * synthetic test data would bypass the slot system, and any future
 * feature that touches the slot machinery (e.g., a "loading volumes…"
 * status indicator) would have to be implemented twice.
 */

import type { Fetcher } from '../types';
import type { ScalarCube } from '../../../@types/ScalarCube';
import { makeSyntheticGaussianCube } from '../../../data/syntheticScalarField';

export type SyntheticVolumeReq = {
  /** Caller-chosen identifier; surfaced in `LoadingDevPanel`. */
  handle: string;
  /** Cube edge length in voxels.  Default 64 (matches generator default). */
  dims?: number;
  /** Physical edge length in Mpc.  Default 400 (matches generator default). */
  boxSizeMpc?: number;
};

export const syntheticVolumeFetcher: Fetcher<ScalarCube, SyntheticVolumeReq> = async (req) => {
  return makeSyntheticGaussianCube({
    dims: req.dims,
    boxSizeMpc: req.boxSizeMpc,
    frameKind: 'equatorial-cartesian',
  });
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- syntheticVolumeFetcher`
Expected: PASS, both tests.

- [ ] **Step 5: Wire the slot in `wireSlots.ts`**

Open `src/services/engine/phases/wireSlots.ts` and follow the precedent set by `filamentSlot`.  Add (only in dev):

```ts
import { syntheticVolumeFetcher } from '../../loading/fetchers/syntheticVolumeFetcher';
import type { ScalarCube } from '../../../@types/ScalarCube';

// Inside the slot-wiring function, after filamentSlot:
const syntheticVolumeSlot = import.meta.env.DEV
  ? createAssetSlot<ScalarCube, { handle: string; dims?: number; boxSizeMpc?: number }>({
      name: 'syntheticVolume',
      fetch: syntheticVolumeFetcher,
      commit: async (cube) => {
        if (!state.gpu.scalarVolumeRenderer) return;
        // Use the public engine path so settings + UI bookkeeping run.
        engineHandle.addVolumeField('debug-gaussian', cube);
      },
    })
  : null;

if (syntheticVolumeSlot) {
  state.assetSlots.syntheticVolume = syntheticVolumeSlot;
}
```

(Match the existing file's exact coding conventions for slot creation — it may use a slightly different helper name or pass `state` differently.  Mirror what `filamentSlot` does.)

- [ ] **Step 6: Add the slot to the assetSlots type**

In whichever file declares `EngineState.assetSlots`:

```ts
import type { AssetSlot } from '../services/loading/AssetSlot';
import type { ScalarCube } from './ScalarCube';
import type { SyntheticVolumeReq } from '../services/loading/fetchers/syntheticVolumeFetcher';

// Inside assetSlots:
  syntheticVolume?: AssetSlot<ScalarCube, SyntheticVolumeReq>;
```

The `?` is intentional — production builds don't have the slot.

- [ ] **Step 7: Run typecheck and tests**

Run: `npm run typecheck && npm test`
Expected: zero errors, all tests pass.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(loading): syntheticVolumeFetcher + dev-only AssetSlot

Routes the synthetic Gaussian cube through the same AssetSlot
machinery as real volume cubes will use, so it gets the same
fade-in, status reporting, race-checked commit, and retry
semantics for free.  Mirrors syntheticPointFetcher's precedent.
Slot is dev-only; production builds don't pay for it.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: SMOKE TEST — synthetic Gaussian cube visible in dev server

**Files:**
- Modify: `src/services/engine/engine.ts` — kick off the synthetic-volume slot load during dev bootstrap.

This is the visual confirmation that everything end-to-end works.  Per the *be meticulous with WGSL* memory: do not declare success until you have actually looked at the running app.

- [ ] **Step 1: Trigger the synthetic-volume slot load on dev bootstrap**

In `engine.ts`, after the slot-wiring phase has run (so `state.assetSlots.syntheticVolume` is populated), add:

```ts
// After GPU init + slot wiring, only in dev:
if (import.meta.env.DEV && state.assetSlots.syntheticVolume) {
  state.assetSlots.syntheticVolume.load({
    handle: 'debug-gaussian',
    dims: 64,
    boxSizeMpc: 400,
  });
}
```

The slot's `commit` function calls `engineHandle.addVolumeField('debug-gaussian', cube)` once the cube is decoded, so the SettingsPanel sees the field appear via the same `onVolumeFieldsChanged` callback as any other (future) cube would trigger.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 3: Verify in the dev server**

The dev server should already be running (`npm run dev` is a long-lived background process per project convention).  Open the app in a browser.

**What to look for:**

1. **Settings panel** — the new "Volumes" section is present, master toggle on, one row labelled `debug-gaussian` (or similar) with enable checkbox on and intensity slider at 0.5.
2. **In the scene** — when zoomed out so the entire 400 Mpc box is visible, you should see a soft glowing **blue-purple blob** centred at the world origin.  The blob is roughly Gaussian — bright at the centre, fading outward to invisibility at the edges of the box.
3. **Toggle test** — uncheck the per-field checkbox in the SettingsPanel; the blob disappears.  Re-check; it returns.
4. **Intensity test** — drag the intensity slider down to 0; the blob fades out smoothly.  Drag up to 1; it intensifies.
5. **Inside-the-box test** — fly the camera toward the origin so it ends up *inside* the cube's 400 Mpc bounding box.  The blob should still render correctly — you're now seeing it from the inside, and the back-face raymarch with `tMin = max(tMin, 0)` should keep it visible without artefacts (no missing surface, no flickering).
6. **Master toggle** — uncheck the section's master toggle; the entire Volumes layer disappears regardless of per-field state.

**If any of those fail:**

- *Nothing visible at all*: most likely the fragment shader's opacity normalisation factor (`* 0.01` in the shader) is too small.  Try `0.1`.  If still nothing, suspect an upload issue (texture format mismatch, wrong byte stride) and add a `console.warn` of the cube's first few voxel values in the loader.
- *Fully opaque white square*: the AABB intersection is wrong — likely a sign error in `intersectUnitAabb` or the inverse model matrix is identity.  Re-check `mat4.invert` actually ran.
- *Blob in the wrong position*: the model matrix composition order is wrong.  Pure-function unit tests in Task 7 should have caught this; re-run them.
- *Blob disappears when camera enters the box*: the `tMin = max(tMin, 0)` clamp didn't take, OR you're rendering front faces by mistake.  Check `cullMode: 'front'` in the pipeline descriptor.
- *Two cubes additively over-saturate to white when both registered*: expected for now — register a second debug cube via the browser console (`engineHandle.addVolumeField(...)`) only if you specifically want to test multi-field; leave one cube on for the smoke test by default.

- [ ] **Step 4: Commit**

```bash
git add src/services/engine/engine.ts
git commit -m "$(cat <<'EOF'
feat(engine): smoke-test synthetic Gaussian cube in dev mode

Registers a 64³ centred Gaussian blob through the public
addVolumeField path on dev-server bootstrap so the new scalar
volume renderer is end-to-end visually verifiable from a fresh
checkout.  Production builds skip the registration; nothing
ships to users.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Final check — full test + typecheck pass**

Run: `npm test && npm run typecheck`
Expected: all tests pass (test count = baseline + ~20 new), zero typecheck errors.

- [ ] **Step 6: Report**

Report to the user:
- Total commits in the plan: 14 (one per task; Task 0 has no commit).
- Smoke test status: confirmed visible in dev server (or list the failure mode you hit).
- New test count: baseline + N (cite both numbers).

---

## Definition of Done

- [ ] All 14 tasks complete (0, 1, 2, 2.5, 3, 4, 5, 6, 7, 8, 9, 10, 11, 11.5, 12); each non-pre-flight task has its own commit.
- [ ] `npm test` green (existing tests + ~15 new ones).
- [ ] `npm run typecheck` clean.
- [ ] Synthetic Gaussian blob is visible in the dev server with the synthetic cube registered, with the SettingsPanel's Volumes section listing it; toggling and intensity-sliding work; flying inside the box keeps it rendering correctly.
- [ ] Worktree is on a feature branch; nothing pushed to `main`.
