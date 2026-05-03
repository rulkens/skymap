# Multi-Survey Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render galaxies from four redshift surveys (SDSS, 2MRS, 2MPZ, 6dFGS) in one merged dataset, with deduplication across overlap, auto-LOD that picks which surveys are visible based on camera distance, and a UI panel for manual per-survey toggles.

**Architecture:** A Node CLI cross-matches catalogues from VizieR + SDSS SkyServer into one master `.bin` (format v3, adds a 1-byte `sourceID` per point in the existing v2 padding). The renderer adds a per-instance `sourceID` vertex attribute and a `visibleSourceMask: u32` uniform; the WGSL vertex stage emits a degenerate triangle for points whose source bit is unset, so toggling is a single uniform write — no GPU re-upload. React state owns the source mask; an auto-LOD heuristic in the engine recomputes it from camera distance unless the user has overridden it.

**Tech Stack:** TypeScript 5, Node 20+, Vite 5, React 19, WebGPU, vitest, gl-matrix.

**Source priority** (best record wins on duplicates): SDSS spec > 2MRS spec > 6dFGS spec > 2MPZ photo.

---

## File Structure

Files this plan creates or modifies:

```
src/
  data/
    sources.ts                  CREATE  Source enum + per-survey metadata + URL builders
    pointCloudFormat.ts         MODIFY  bump to v3 (add sourceID byte at offset 40)
    physics.ts                  MODIFY  add DSS image-cutout URL fallback
    synthetic.ts                MODIFY  emit sourceIDs (all = Synthetic)
  types.ts                      MODIFY  add `sourceIDs: Uint8Array` to PointCloud
  engine.ts                     MODIFY  setSourceMask, auto-LOD heuristic, lodMode
  gpu/
    pointRenderer.ts            MODIFY  add sourceID vertex attribute + visibleSourceMask uniform
    shaders/points.wgsl         MODIFY  source-mask filter in vertex stage
  components/
    InfoCard.tsx                MODIFY  source badge, per-source link logic, DSS image fallback
    SettingsPanel.tsx           CREATE  per-source toggles + auto-LOD master
    App.tsx                     MODIFY  wires SettingsPanel state to engine
  index.html                    MODIFY  CSS for SettingsPanel, source badge

tools/
  parsers/
    common.ts                   CREATE  shared ParsedRecord type + helpers
    sdssCsv.ts                  CREATE  extracted from current csvToBin.ts
    twoMrs.ts                   CREATE  parse 2MRS ASCII catalogue
    twoMpz.ts                   CREATE  parse 2MPZ ASCII catalogue
    sixDfgs.ts                  CREATE  parse 6dFGS ASCII catalogue
  buildMasterBin.ts             CREATE  CLI: cross-match + merge + write master.bin
  csvToBin.ts                   MODIFY  thin shim around parsers/sdssCsv.ts

tests/
  sources.test.ts               CREATE  enum + URL builder tests
  pointCloudFormat.test.ts      MODIFY  v3 round-trip, sourceID preservation
  parsers/
    twoMrs.test.ts              CREATE  fixture-based parse test
    twoMpz.test.ts              CREATE  fixture-based parse test
    sixDfgs.test.ts             CREATE  fixture-based parse test
  crossMatch.test.ts            CREATE  dedup priority + position+z matching
  autoLod.test.ts               CREATE  distance → mask heuristic

README.md                       MODIFY  download instructions for all 4 surveys
```

**Source enum** (used everywhere, defined once in `src/data/sources.ts`):

```ts
export enum Source {
  Synthetic = 0,
  SDSS = 1,
  TwoMRS = 2,
  TwoMPZ = 3,
  SixDFGS = 4,
}
```

Bit position in `visibleSourceMask: u32` matches the enum value. `0xFFFFFFFF` means "all visible".

---

## Task 1: Source enum + metadata module

**Files:**

- Create: `src/data/sources.ts`
- Create: `tests/sources.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/sources.test.ts
import { describe, it, expect } from 'vitest';
import {
  Source,
  sourceLabel,
  sourceIsAllSky,
  sourceMaxDistanceMpc,
  ALL_VISIBLE_MASK,
  maskHas,
  maskWith,
  maskWithout,
} from '../src/data/sources';

describe('Source enum', () => {
  it('has stable numeric values used in the binary format', () => {
    expect(Source.Synthetic).toBe(0);
    expect(Source.SDSS).toBe(1);
    expect(Source.TwoMRS).toBe(2);
    expect(Source.TwoMPZ).toBe(3);
    expect(Source.SixDFGS).toBe(4);
  });
});

describe('sourceLabel', () => {
  it('returns human-readable names', () => {
    expect(sourceLabel(Source.SDSS)).toBe('SDSS');
    expect(sourceLabel(Source.TwoMRS)).toBe('2MRS');
    expect(sourceLabel(Source.TwoMPZ)).toBe('2MPZ');
    expect(sourceLabel(Source.SixDFGS)).toBe('6dFGS');
    expect(sourceLabel(Source.Synthetic)).toBe('Synthetic');
  });
});

describe('source coverage metadata', () => {
  it('flags all-sky sources', () => {
    expect(sourceIsAllSky(Source.TwoMRS)).toBe(true);
    expect(sourceIsAllSky(Source.TwoMPZ)).toBe(true);
    expect(sourceIsAllSky(Source.SDSS)).toBe(false);
    expect(sourceIsAllSky(Source.SixDFGS)).toBe(false);
  });
  it('reports approximate maximum distance per survey in Mpc', () => {
    expect(sourceMaxDistanceMpc(Source.TwoMRS)).toBeLessThan(300);
    expect(sourceMaxDistanceMpc(Source.TwoMPZ)).toBeLessThan(700);
    expect(sourceMaxDistanceMpc(Source.SixDFGS)).toBeLessThan(800);
    expect(sourceMaxDistanceMpc(Source.SDSS)).toBeGreaterThan(2000);
  });
});

describe('source mask helpers', () => {
  it('ALL_VISIBLE_MASK has every defined source bit set', () => {
    expect(maskHas(ALL_VISIBLE_MASK, Source.SDSS)).toBe(true);
    expect(maskHas(ALL_VISIBLE_MASK, Source.TwoMPZ)).toBe(true);
  });
  it('maskHas / maskWith / maskWithout flip individual bits', () => {
    let m = 0;
    expect(maskHas(m, Source.SDSS)).toBe(false);
    m = maskWith(m, Source.SDSS);
    expect(maskHas(m, Source.SDSS)).toBe(true);
    m = maskWithout(m, Source.SDSS);
    expect(maskHas(m, Source.SDSS)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- sources`
Expected: FAIL — module `../src/data/sources` not found.

- [ ] **Step 3: Create `src/data/sources.ts`**

```ts
/**
 * Source survey enum and per-survey metadata.
 *
 * Each point in our master `.bin` carries a `sourceID: u8` identifying which
 * sky survey produced it. The numeric values below MUST stay stable — they
 * are written into binary files and into the GPU vertex buffer.
 *
 * The `visibleSourceMask: u32` we pass to the shader uses bit position N for
 * source N, so e.g. `mask & (1 << Source.SDSS)` selects SDSS points.
 */
export enum Source {
  Synthetic = 0,
  SDSS = 1,
  TwoMRS = 2,
  TwoMPZ = 3,
  SixDFGS = 4,
}

const LABELS: Record<Source, string> = {
  [Source.Synthetic]: 'Synthetic',
  [Source.SDSS]: 'SDSS',
  [Source.TwoMRS]: '2MRS',
  [Source.TwoMPZ]: '2MPZ',
  [Source.SixDFGS]: '6dFGS',
};

const ALL_SKY: Record<Source, boolean> = {
  [Source.Synthetic]: true, // synthetic data is generated uniformly
  [Source.SDSS]: false, // ~1/3 of sky, mostly NGC + stripes
  [Source.TwoMRS]: true,
  [Source.TwoMPZ]: true,
  [Source.SixDFGS]: false, // dec < 0
};

/** Approximate maximum comoving distance (Mpc) covered by each survey. */
const MAX_DIST_MPC: Record<Source, number> = {
  [Source.Synthetic]: 1000,
  [Source.SDSS]: 3000,
  [Source.TwoMRS]: 250,
  [Source.TwoMPZ]: 600,
  [Source.SixDFGS]: 700,
};

/** Human-readable label for the UI. */
export function sourceLabel(s: Source): string {
  return LABELS[s];
}

/** Whether the survey covers the full celestial sphere (modulo galactic-plane dust). */
export function sourceIsAllSky(s: Source): boolean {
  return ALL_SKY[s];
}

/** Approximate maximum distance covered (Mpc). Used by the auto-LOD heuristic. */
export function sourceMaxDistanceMpc(s: Source): number {
  return MAX_DIST_MPC[s];
}

/** A mask with every defined source bit set. */
export const ALL_VISIBLE_MASK =
  (1 << Source.Synthetic) |
  (1 << Source.SDSS) |
  (1 << Source.TwoMRS) |
  (1 << Source.TwoMPZ) |
  (1 << Source.SixDFGS);

export function maskHas(mask: number, s: Source): boolean {
  return (mask & (1 << s)) !== 0;
}

export function maskWith(mask: number, s: Source): number {
  return mask | (1 << s);
}

export function maskWithout(mask: number, s: Source): number {
  return mask & ~(1 << s);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- sources`
Expected: PASS — all assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/data/sources.ts tests/sources.test.ts
git commit -m "feat: add Source enum + per-survey metadata + mask helpers"
```

---

## Task 2: PointCloud v3 binary format

**Files:**

- Modify: `src/types.ts`
- Modify: `src/data/pointCloudFormat.ts`
- Modify: `tests/pointCloudFormat.test.ts`

The v3 format reuses v2's 48-byte per-point record, repurposing the first byte of the existing 8-byte trailing padding as `sourceID`. The remaining 7 bytes stay as zeroed reserved padding.

- [ ] **Step 1: Update `src/types.ts` to add `sourceIDs`**

Replace the existing `PointCloud` definition with:

```ts
export type PointCloud = {
  count: number;
  objIDs: BigUint64Array;
  positions: Float32Array;
  magU: Float32Array;
  magG: Float32Array;
  magR: Float32Array;
  magI: Float32Array;
  magZ: Float32Array;
  /** Source survey ID per point — values are members of the `Source` enum. */
  sourceIDs: Uint8Array;
};
```

- [ ] **Step 2: Update tests in `tests/pointCloudFormat.test.ts`**

Replace the existing tests with:

```ts
import { describe, it, expect } from 'vitest';
import { encodePointCloud, decodePointCloud } from '../src/data/pointCloudFormat';
import { Source } from '../src/data/sources';
import type { PointCloud } from '../src/types';

function makeCloud(): PointCloud {
  return {
    count: 3,
    objIDs: new BigUint64Array([1234567890123456789n, 0n, 42n]),
    positions: new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]),
    magU: new Float32Array([NaN, NaN, 19.2]),
    magG: new Float32Array([18.5, 16.0, 18.5]),
    magR: new Float32Array([17.9, 15.5, 17.9]),
    magI: new Float32Array([17.6, 15.2, 17.6]),
    magZ: new Float32Array([NaN, NaN, 17.4]),
    sourceIDs: new Uint8Array([Source.SDSS, Source.TwoMPZ, Source.SDSS]),
  };
}

describe('point cloud binary format v3', () => {
  it('round-trips a cloud preserving sourceID per point', () => {
    const original = makeCloud();
    const buf = encodePointCloud(original);
    const decoded = decodePointCloud(buf);
    expect(decoded.count).toBe(3);
    expect(Array.from(decoded.sourceIDs)).toEqual([Source.SDSS, Source.TwoMPZ, Source.SDSS]);
    expect(Array.from(decoded.objIDs).map((b) => b.toString())).toEqual([
      '1234567890123456789',
      '0',
      '42',
    ]);
    expect(Array.from(decoded.positions)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    // Float32 precision check on the well-rounded values:
    expect(decoded.magG[0]).toBeCloseTo(18.5, 5);
    // NaN preservation:
    expect(Number.isNaN(decoded.magU[0]!)).toBe(true);
    expect(Number.isNaN(decoded.magZ[1]!)).toBe(true);
  });

  it('rejects v2 files with a clear error', () => {
    const buf = encodePointCloud(makeCloud());
    new DataView(buf).setUint32(4, 2, true); // pretend it's v2
    expect(() => decodePointCloud(buf)).toThrow(/version/);
  });

  it('rejects wrong magic', () => {
    const buf = new ArrayBuffer(16);
    expect(() => decodePointCloud(buf)).toThrow(/magic/);
  });

  it('encoded byte length stays at header + 48 × count', () => {
    expect(encodePointCloud(makeCloud()).byteLength).toBe(16 + 3 * 48);
  });
});
```

- [ ] **Step 3: Run tests to verify failure**

Run: `npm test -- pointCloudFormat`
Expected: FAIL — encoder/decoder don't know about `sourceIDs`.

- [ ] **Step 4: Update `src/data/pointCloudFormat.ts`**

Bump version constant to `3`, write `sourceID` at byte offset 40 of each record, read it back. Keep the 7-byte reserved padding zeroed.

In the encoder loop add:

```ts
// Source ID lives in the first byte of what was v2's padding region.
// The remaining 7 bytes stay zero (the ArrayBuffer is zero-initialised).
new Uint8Array(buf, byteBase + 40, 1)[0] = cloud.sourceIDs[i]!;
```

In the decoder, allocate `sourceIDs = new Uint8Array(count)` and read each byte:

```ts
sourceIDs[i] = new Uint8Array(buf, byteBase + 40, 1)[0]!;
```

Update the `VERSION` constant from 2 to 3 and update the v2 rejection message to mention v3:

```ts
throw new Error(
  `unsupported version: ${version} — please regenerate the .bin via "npm run build-master" or "npm run csv-to-bin"`,
);
```

Update the file's top-of-file comment to describe v3 layout (sourceID at offset 40, 7 bytes reserved).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- pointCloudFormat`
Expected: PASS — all 4 tests green.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/data/pointCloudFormat.ts tests/pointCloudFormat.test.ts
git commit -m "feat: bump .bin format to v3 (per-point sourceID byte)"
```

---

## Task 3: Synthetic generator emits sourceIDs

**Files:**

- Modify: `src/data/synthetic.ts`

- [ ] **Step 1: Update `generateSyntheticCloud` to populate `sourceIDs`**

Add the import: `import { Source } from './sources';`

Inside `generateSyntheticCloud`, allocate `sourceIDs = new Uint8Array(count).fill(Source.Synthetic)` and include it in the returned object.

Document with a comment that synthetic points are tagged Source.Synthetic so they can be toggled separately from real surveys in the UI, and so the auto-LOD heuristic can ignore them in distance calculations.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS — the synthetic generator now matches the v3 PointCloud shape.

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: PASS — all existing tests still green.

- [ ] **Step 4: Commit**

```bash
git add src/data/synthetic.ts
git commit -m "feat: synthetic generator tags points with Source.Synthetic"
```

---

## Task 4: GPU per-instance sourceID + visibleSourceMask uniform

**Files:**

- Modify: `src/gpu/shaders/points.wgsl`
- Modify: `src/gpu/pointRenderer.ts`

The vertex buffer grows from 5 floats to 6 floats per instance — the 6th carries `sourceID` as a `f32` we bit-cast to `u32` in the shader. (Adding a separate vertex buffer for one byte per instance is simpler in the abstract but more complex in the WebGPU API; one extended buffer keeps the upload code linear.)

The `Uniforms` struct grows by 4 bytes for `visibleSourceMask: u32`. Pad to 16-byte boundary as before.

- [ ] **Step 1: Modify `src/gpu/shaders/points.wgsl`**

Add to `Uniforms`:

```wgsl
struct Uniforms {
  viewProj: mat4x4<f32>,
  viewport: vec2<f32>,
  pointSizePx: f32,
  brightness: f32,
  selectedIndex: u32,
  /** Bitmask of visible Source enum values. Bit N visible iff (1u << N). */
  visibleSourceMask: u32,
  _pad0: u32, _pad1: u32, _pad2: u32, // align to 16-byte boundary
};
```

Add to `PerVertex`:

```wgsl
struct PerVertex {
  @location(0) position: vec3<f32>,
  @location(1) magnitude: f32,
  @location(2) colorIndex: f32,
  @location(3) sourceIDFloat: f32,
};
```

In `vs`, very early — before any other math:

```wgsl
let sourceID = u32(p.sourceIDFloat);
let sourceBit = 1u << sourceID;
if ((u.visibleSourceMask & sourceBit) == 0u) {
  // This source is currently hidden. Emit a degenerate vertex outside the
  // canonical clip-space cube so the GPU clips the whole triangle without
  // drawing anything. Cheaper than a runtime branch for every fragment.
  var out: VSOut;
  out.clip = vec4<f32>(0.0, 0.0, 2.0, 1.0); // z=2 → clipped past the far plane
  out.uv = vec2<f32>(0.0);
  out.tint = vec3<f32>(0.0);
  out.intensity = 0.0;
  out.instanceIdx = ii;
  out.selected = 0u;
  return out;
}
```

Update the existing struct/uniform offset comment block to reflect the new size (was 96 bytes, now 112 with the visibleSourceMask + padding).

- [ ] **Step 2: Modify `src/gpu/pointRenderer.ts`**

Bump `FLOATS_PER_POINT` from 5 to 6 and `POINT_STRIDE` to `24`.

Bump `UNIFORM_BYTES` from 96 to 112 (add 4 bytes for the mask + 12 padding to next 16-byte boundary).

In the vertex buffer attribute layout, append a 4th attribute:

```ts
{ shaderLocation: 3, offset: 20, format: 'float32' }, // sourceID (as float)
```

In `upload`, when packing the interleaved Float32Array, store `cloud.sourceIDs[i]` as the 6th float per record:

```ts
interleaved[o + 5] = cloud.sourceIDs[i]!; // u8 fits in float32 exactly
```

Update the `draw` signature to accept the mask:

```ts
draw(
  pass: GPURenderPassEncoder,
  viewProj: mat4,
  viewportPx: [number, number],
  pointSizePx: number,
  brightness: number,
  selectedIndex: number,
  visibleSourceMask: number,
): void
```

Write the mask into the uniform buffer at the appropriate offset (use a `Uint32Array` view over the same buffer for the integer fields). Document why we use a typed-view trick (Float32Array can't hold a u32 exactly above 2^24).

- [ ] **Step 3: Update `src/engine.ts` to pass the mask through**

Find the `renderer.draw(...)` call. Replace with:

```ts
renderer.draw(
  pass,
  vp,
  [canvas.width, canvas.height],
  2.5,
  1.0,
  selectedIndex !== null ? selectedIndex : 0xffffffff >>> 0,
  visibleSourceMask, // new — sourced from engine state, defaults to ALL_VISIBLE_MASK
);
```

Add a state variable in the engine: `let visibleSourceMask = ALL_VISIBLE_MASK;` (import `ALL_VISIBLE_MASK` from `./data/sources`).

- [ ] **Step 4: Run typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 5: Visual verification (page reload)**

The dev server should hot-reload. The user reloads `http://localhost:5173/` and confirms the cloud still renders normally — the new mask defaults to `ALL_VISIBLE_MASK` so behaviour is unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/gpu/shaders/points.wgsl src/gpu/pointRenderer.ts src/engine.ts
git commit -m "feat: per-instance sourceID attribute + visibleSourceMask uniform"
```

---

## Task 5: Auto-LOD heuristic

**Files:**

- Create: `tests/autoLod.test.ts`
- Modify: `src/engine.ts` (add the heuristic + wiring)

The heuristic is a pure function of camera distance. Three depth bands:

| Distance (Mpc) | Visible sources                          |
| -------------- | ---------------------------------------- |
| < 200          | Synthetic, 2MRS, 2MPZ                    |
| 200 – 800      | Synthetic, SDSS, 2MRS, 2MPZ, 6dFGS (all) |
| > 800          | Synthetic, SDSS                          |

- [ ] **Step 1: Write the failing test**

```ts
// tests/autoLod.test.ts
import { describe, it, expect } from 'vitest';
import { autoLodMask } from '../src/engine';
import { Source, maskHas } from '../src/data/sources';

describe('autoLodMask', () => {
  it('local view (< 200 Mpc) shows 2MRS and 2MPZ but hides SDSS / 6dFGS', () => {
    const m = autoLodMask(150);
    expect(maskHas(m, Source.TwoMRS)).toBe(true);
    expect(maskHas(m, Source.TwoMPZ)).toBe(true);
    expect(maskHas(m, Source.SDSS)).toBe(false);
    expect(maskHas(m, Source.SixDFGS)).toBe(false);
  });
  it('mid range (200–800 Mpc) shows everything', () => {
    const m = autoLodMask(500);
    for (const s of [Source.SDSS, Source.TwoMRS, Source.TwoMPZ, Source.SixDFGS]) {
      expect(maskHas(m, s)).toBe(true);
    }
  });
  it('deep view (> 800 Mpc) shows SDSS only', () => {
    const m = autoLodMask(2000);
    expect(maskHas(m, Source.SDSS)).toBe(true);
    expect(maskHas(m, Source.TwoMRS)).toBe(false);
    expect(maskHas(m, Source.TwoMPZ)).toBe(false);
    expect(maskHas(m, Source.SixDFGS)).toBe(false);
  });
  it('always includes Source.Synthetic so the synthetic fallback stays visible', () => {
    expect(maskHas(autoLodMask(50), Source.Synthetic)).toBe(true);
    expect(maskHas(autoLodMask(500), Source.Synthetic)).toBe(true);
    expect(maskHas(autoLodMask(5000), Source.Synthetic)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- autoLod`
Expected: FAIL — `autoLodMask` not exported from engine.

- [ ] **Step 3: Add `autoLodMask` to `src/engine.ts`**

Near the top of the file (alongside other helpers), add:

```ts
import { ALL_VISIBLE_MASK, Source, maskWith, maskWithout } from './data/sources';

/**
 * Compute the visible-source bitmask for the auto-LOD policy at a given
 * camera distance from the target (in Mpc).
 *
 * Bands:
 *   < 200 Mpc   → "local"  : 2MRS + 2MPZ + Synthetic
 *   200–800 Mpc → "mid"    : all sources
 *   > 800 Mpc   → "deep"   : SDSS + Synthetic only
 *
 * Synthetic is always visible — it's the fallback dataset and the user toggles
 * it manually, never via auto-LOD.
 */
export function autoLodMask(distanceMpc: number): number {
  if (distanceMpc < 200) {
    let m = 0;
    m = maskWith(m, Source.Synthetic);
    m = maskWith(m, Source.TwoMRS);
    m = maskWith(m, Source.TwoMPZ);
    return m;
  }
  if (distanceMpc <= 800) {
    return ALL_VISIBLE_MASK;
  }
  let m = 0;
  m = maskWith(m, Source.Synthetic);
  m = maskWith(m, Source.SDSS);
  return m;
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npm test -- autoLod`
Expected: PASS — 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/engine.ts tests/autoLod.test.ts
git commit -m "feat: add autoLodMask heuristic (distance → visible source mask)"
```

---

## Task 6: Engine LOD mode + setSourceMask API

**Files:**

- Modify: `src/engine.ts`

The engine grows a `lodMode: 'auto' | 'manual'` state. In auto, the per-frame logic computes a fresh mask via `autoLodMask(cam.distance)` and overwrites `visibleSourceMask`. In manual, an external setter (called from React) overrides; the auto computation is skipped.

- [ ] **Step 1: Extend `EngineCallbacks` and `EngineHandle` types**

In `src/engine.ts`:

```ts
export type LodMode = 'auto' | 'manual';

export type EngineCallbacks = {
  onStatusChange: (s: EngineStatus) => void;
  onHoverChange: (info: PointInfo | null) => void;
  onSelectChange: (info: PointInfo | null) => void;
  onScaleChange: (info: ScaleInfo) => void;
  /** Fires when the visible-source mask changes (auto-LOD or user toggle). */
  onSourceMaskChange: (mask: number) => void;
  /** Fires when the LOD mode flips between 'auto' and 'manual'. */
  onLodModeChange: (mode: LodMode) => void;
};

export type EngineHandle = {
  clearSelection: () => void;
  destroy: () => void;
  /** Set LOD mode. 'auto' lets the engine recompute the mask each frame from
   *  camera distance. 'manual' freezes the mask at the last value passed in. */
  setLodMode: (mode: LodMode) => void;
  /** Force a specific visible-source mask. Switches LOD mode to 'manual'. */
  setSourceMask: (mask: number) => void;
};
```

- [ ] **Step 2: Implement state + setters inside `createEngine`**

Add closure variables:

```ts
let visibleSourceMask = ALL_VISIBLE_MASK;
let lodMode: LodMode = 'auto';

function emitSourceMask(): void {
  cb.onSourceMaskChange(visibleSourceMask);
}

function emitLodMode(): void {
  cb.onLodModeChange(lodMode);
}
```

Inside the render loop, before the `renderer.draw(...)` call:

```ts
if (lodMode === 'auto') {
  // Use camera distance to the target (orbit camera's `distance` field) as the
  // LOD trigger. cam.position - cam.target would also work; distance is simpler.
  const m = autoLodMask(cam.distance);
  if (m !== visibleSourceMask) {
    visibleSourceMask = m;
    emitSourceMask();
  }
}
```

Then expose the setters in the returned handle:

```ts
return {
  clearSelection() {
    /* ... existing ... */
  },
  destroy() {
    /* ... existing ... */
  },
  setLodMode(mode) {
    if (mode === lodMode) return;
    lodMode = mode;
    emitLodMode();
  },
  setSourceMask(mask) {
    visibleSourceMask = mask;
    if (lodMode !== 'manual') {
      lodMode = 'manual';
      emitLodMode();
    }
    emitSourceMask();
  },
};
```

Emit initial values once after engine construction so React's first render gets them.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: FAIL — `App.tsx` doesn't pass the new callbacks. We fix that in Task 8 — for now allow it to fail intentionally and continue.

Actually: provide default no-op callbacks at the engine entry to keep typecheck green during this transitional task. Update `EngineCallbacks` so the new fields are optional:

```ts
onSourceMaskChange?: (mask: number) => void;
onLodModeChange?: (mode: LodMode) => void;
```

And in the emit functions, guard with `cb.onSourceMaskChange?.(...)`. Now typecheck stays green.

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/engine.ts
git commit -m "feat: engine LOD mode (auto/manual) + setSourceMask API"
```

---

## Task 7: Settings panel React component

**Files:**

- Create: `src/components/SettingsPanel.tsx`
- Modify: `index.html` (add CSS)

- [ ] **Step 1: Add CSS to `index.html`**

Inside the existing `<style>` block, add:

```css
/* ── Settings panel (bottom-left) ────────────────────────────────────── */
#settings-panel {
  position: fixed;
  bottom: 16px;
  left: 16px;
  z-index: 10;
  padding: 12px 14px;

  background: rgba(8, 12, 28, 0.65);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(160, 200, 255, 0.16);
  border-radius: 8px;

  color: #cfd8ff;
  font:
    11px/1.4 ui-monospace,
    'SF Mono',
    Menlo,
    monospace;
  user-select: none;
  min-width: 180px;
}

#settings-panel .panel-title {
  margin-bottom: 8px;
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(160, 180, 230, 0.5);
}

#settings-panel .panel-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
}

#settings-panel input[type='checkbox'] {
  accent-color: rgba(180, 220, 255, 0.85);
  cursor: pointer;
}

#settings-panel .panel-divider {
  margin: 6px 0;
  border-top: 1px solid rgba(160, 200, 255, 0.12);
}

#settings-panel .panel-mode {
  font-size: 10px;
  letter-spacing: 0.04em;
  color: rgba(160, 200, 255, 0.6);
}
```

- [ ] **Step 2: Create `src/components/SettingsPanel.tsx`**

```tsx
import type { ReactNode } from 'react';
import { Source, sourceLabel, maskHas, maskWith, maskWithout } from '../data/sources';
import type { LodMode } from '../engine';

type Props = {
  /** Current visible-source mask (driven by the engine). */
  mask: number;
  /** Current LOD mode (driven by the engine). */
  mode: LodMode;
  /** Toggle a single source on/off. Switches mode to 'manual'. */
  onToggleSource: (s: Source, visible: boolean) => void;
  /** Switch between auto and manual LOD. */
  onSetMode: (mode: LodMode) => void;
};

/** Sources the user can toggle from the panel. Synthetic is hidden — it's
 *  controlled by the data-loading fallback, not the user. */
const TOGGLEABLE: readonly Source[] = [
  Source.SDSS,
  Source.TwoMRS,
  Source.TwoMPZ,
  Source.SixDFGS,
] as const;

export function SettingsPanel({ mask, mode, onToggleSource, onSetMode }: Props): ReactNode {
  return (
    <div id="settings-panel">
      <div className="panel-title">Surveys</div>

      {TOGGLEABLE.map((s) => (
        <label className="panel-row" key={s}>
          <input
            type="checkbox"
            checked={maskHas(mask, s)}
            onChange={(e) => onToggleSource(s, e.target.checked)}
          />
          {sourceLabel(s)}
        </label>
      ))}

      <div className="panel-divider" />

      <label className="panel-row">
        <input
          type="checkbox"
          checked={mode === 'auto'}
          onChange={(e) => onSetMode(e.target.checked ? 'auto' : 'manual')}
        />
        Auto LOD
      </label>

      <div className="panel-mode">
        mode: {mode === 'auto' ? 'auto (by zoom)' : 'manual override'}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/SettingsPanel.tsx index.html
git commit -m "feat: SettingsPanel React component (per-source toggles + auto-LOD)"
```

---

## Task 8: Wire SettingsPanel into App + engine

**Files:**

- Modify: `src/App.tsx`

- [ ] **Step 1: Add state, callbacks, and component mount in `App.tsx`**

Add imports:

```tsx
import { SettingsPanel } from './components/SettingsPanel';
import { Source, ALL_VISIBLE_MASK, maskWith, maskWithout } from './data/sources';
import type { LodMode } from './engine';
```

Add state hooks:

```tsx
const [sourceMask, setSourceMask] = useState<number>(ALL_VISIBLE_MASK);
const [lodMode, setLodMode] = useState<LodMode>('auto');
```

Wire the engine callbacks (extend the existing `createEngine` call):

```tsx
const handle = createEngine(canvas, {
  onStatusChange: setStatus,
  onHoverChange: setHovered,
  onSelectChange: setSelected,
  onScaleChange: setScale,
  onSourceMaskChange: setSourceMask,
  onLodModeChange: setLodMode,
});
```

Below the existing `<canvas>` and other UI components, add:

```tsx
<SettingsPanel
  mask={sourceMask}
  mode={lodMode}
  onToggleSource={(s, visible) => {
    const next = visible ? maskWith(sourceMask, s) : maskWithout(sourceMask, s);
    handleRef.current?.setSourceMask(next);
  }}
  onSetMode={(mode) => handleRef.current?.setLodMode(mode)}
/>
```

(`handleRef` is the ref already used by the Esc keydown listener — reuse it.)

- [ ] **Step 2: Run typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 3: Visual verification**

User reloads. The bottom-left panel appears with four checkboxes (SDSS, 2MRS, 2MPZ, 6dFGS) and an "Auto LOD" toggle. Currently SDSS is visible (real data) and 2MRS/2MPZ/6dFGS checkboxes don't change anything (no data for them yet — that lands in Tasks 10–13). Toggling SDSS off should make the cloud disappear; toggling back on restores it. Toggling Auto LOD off freezes the mask; on resumes per-frame recomputation. Zoom out far → with auto-LOD on, mask should drop to SDSS-only (visible by checking that 2MRS etc. checkmarks unset themselves — they're driven by the engine state).

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire SettingsPanel to engine source-mask + LOD mode"
```

---

## Task 9: Refactor SDSS CSV parser into reusable module

**Files:**

- Create: `tools/parsers/common.ts`
- Create: `tools/parsers/sdssCsv.ts`
- Modify: `tools/csvToBin.ts`

We extract the per-row parsing logic from `csvToBin.ts` into a reusable module so the new master-bin tool (Task 13) can share it with the other parsers.

- [ ] **Step 1: Create `tools/parsers/common.ts`**

```ts
/**
 * Shared types for catalog parsers. Each parser produces an array of
 * `ParsedRecord` — the canonical pre-merge representation.
 *
 * Fields not provided by a given survey are NaN (numeric) or 0n (bigint).
 * The merge step (buildMasterBin.ts) decides which records make it into the
 * final master file based on source priority and cross-match dedup.
 */

import { Source } from '../../src/data/sources';

export type ParsedRecord = {
  source: Source;
  /** Numeric SDSS objID when known (SDSS or 2MPZ rows that include an SDSS_OBJID
   *  cross-ID); 0n otherwise. Used for dedup against SDSS. */
  objID: bigint;
  ra: number; // degrees
  dec: number; // degrees
  z: number; // redshift
  /** Five-band magnitudes in SDSS frame; NaN where unavailable. */
  magU: number;
  magG: number;
  magR: number;
  magI: number;
  magZ: number;
};

/** Strip blank, `#`, and `--` lines and return non-empty trimmed rows. */
export function nonCommentLines(rawText: string): string[] {
  return rawText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return t !== '' && !t.startsWith('#') && !t.startsWith('--');
    });
}
```

- [ ] **Step 2: Create `tools/parsers/sdssCsv.ts`**

Extract the parsing logic from `tools/csvToBin.ts` into this new file. The function signature:

```ts
export function parseSdssCsv(rawText: string): { records: ParsedRecord[]; skipped: number };
```

Internally it does the same work as the current `csvToBin.ts` row loop, but returns `ParsedRecord[]` instead of writing a binary file. Required columns stay the same (`objID, ra, dec, z, modelMag_u/g/r/i/z`).

- [ ] **Step 3: Reduce `tools/csvToBin.ts` to a thin wrapper**

The CLI keeps its current usage. Internally:

```ts
import { parseSdssCsv } from './parsers/sdssCsv';
import { encodePointCloud } from '../src/data/pointCloudFormat';
import { Source } from '../src/data/sources';

const { records, skipped } = parseSdssCsv(rawText);

// Build PointCloud from records. Source for every row is SDSS.
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
  sourceIDs: new Uint8Array(count),
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
  cloud.sourceIDs[i] = Source.SDSS;
}
```

- [ ] **Step 4: Run smoke test**

Run: `npm run csv-to-bin -- "data/Skyserver_SQL5_3_2026 10_23_35 AM.csv" public/data/sdss.bin`
Expected: same output as before — 500,000 points written, 0 skipped, file size = 16 + 500000 × 48 = 24,000,016 bytes.

- [ ] **Step 5: Commit**

```bash
git add tools/parsers/common.ts tools/parsers/sdssCsv.ts tools/csvToBin.ts
git commit -m "refactor: extract SDSS CSV parser to reusable parsers/sdssCsv module"
```

---

## Task 10: 2MRS parser

**Files:**

- Create: `tools/parsers/twoMrs.ts`
- Create: `tests/parsers/twoMrs.test.ts`

The 2MRS catalog (VizieR VII/265) is fixed-width ASCII. Key columns by 1-based byte position (per the README):

```
ID         (chars 1–17)   2MASS designation, e.g. "12345678+1234567"
RA         (19–28)        decimal degrees
Dec        (30–39)        decimal degrees
J          (41–46)        2MASS J magnitude
H          (48–53)        2MASS H magnitude
K          (55–60)        2MASS K_s magnitude
cz         (137–144)      heliocentric velocity, km/s
```

(Column positions vary slightly between releases — the implementer should validate against the actual file's README before parsing.)

`z = cz / 299792.458`. Skip rows where `cz <= 0` (unmeasured), or any of J/H/K is blank.

We map 2MASS bands to our 5-band slots:

- magG ← J
- magR ← H
- magI ← K
- magU = NaN, magZ = NaN

- [ ] **Step 1: Write the failing test with a small fixture**

```ts
// tests/parsers/twoMrs.test.ts
import { describe, it, expect } from 'vitest';
import { parseTwoMrs } from '../../tools/parsers/twoMrs';
import { Source } from '../../src/data/sources';

const SAMPLE = [
  // chars 1-17        19-28      30-39      41-46  48-53  55-60   ...   137-144
  '12345678+1234567   180.000000 +30.000000 12.345 11.567 10.789                                                                                  3000.0',
  '23456789+0234567   200.000000 -10.000000  9.876  9.123  8.456                                                                                  6000.0',
  // bad row: missing cz (treated as 0 → skipped)
  '34567890-1234567   100.000000 -20.000000 14.000 13.500 13.000                                                                                       0',
].join('\n');

describe('parseTwoMrs', () => {
  it('parses RA, Dec, mags, and converts cz → z', () => {
    const { records, skipped } = parseTwoMrs(SAMPLE);
    expect(skipped).toBe(1);
    expect(records).toHaveLength(2);
    const r0 = records[0]!;
    expect(r0.source).toBe(Source.TwoMRS);
    expect(r0.ra).toBeCloseTo(180);
    expect(r0.dec).toBeCloseTo(30);
    expect(r0.magG).toBeCloseTo(12.345); // J → magG
    expect(r0.magR).toBeCloseTo(11.567); // H → magR
    expect(r0.magI).toBeCloseTo(10.789); // K → magI
    expect(Number.isNaN(r0.magU)).toBe(true);
    expect(Number.isNaN(r0.magZ)).toBe(true);
    // z = 3000 / 299792.458 ≈ 0.01001
    expect(r0.z).toBeCloseTo(0.01001, 4);
    // 2MRS records don't carry SDSS objIDs; objID stays 0.
    expect(r0.objID).toBe(0n);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- twoMrs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `tools/parsers/twoMrs.ts`**

```ts
import { Source } from '../../src/data/sources';
import { nonCommentLines, type ParsedRecord } from './common';

const C_KM_S = 299792.458;

/**
 * Parse the 2MASS Redshift Survey (2MRS) catalogue from VizieR VII/265.
 *
 * Format: fixed-width ASCII. Column positions are taken from the catalogue
 * README — verify against the actual file if column offsets differ.
 *
 * Magnitude mapping into our 5-band SDSS slots:
 *   magG = J  (2MASS near-IR)
 *   magR = H
 *   magI = K_s
 *   magU = NaN, magZ = NaN  (2MASS doesn't publish optical bands)
 *
 * Redshift is derived from heliocentric velocity: z = cz / c.
 *
 * Skipped rows: any with `cz ≤ 0` or any J/H/K blank or unparseable.
 */
export function parseTwoMrs(rawText: string): { records: ParsedRecord[]; skipped: number } {
  const lines = nonCommentLines(rawText);
  const records: ParsedRecord[] = [];
  let skipped = 0;

  for (const line of lines) {
    // Slice by fixed widths (1-based positions inclusive in the README, so
    // `line.slice(N-1, M)` extracts characters N..M).
    const ra = parseFloat(line.slice(18, 28).trim());
    const dec = parseFloat(line.slice(29, 39).trim());
    const j = parseFloat(line.slice(40, 46).trim());
    const h = parseFloat(line.slice(47, 53).trim());
    const k = parseFloat(line.slice(54, 60).trim());
    const cz = parseFloat(line.slice(136, 144).trim());

    if (
      !Number.isFinite(ra) ||
      !Number.isFinite(dec) ||
      !Number.isFinite(j) ||
      !Number.isFinite(h) ||
      !Number.isFinite(k) ||
      !Number.isFinite(cz) ||
      cz <= 0
    ) {
      skipped++;
      continue;
    }

    records.push({
      source: Source.TwoMRS,
      objID: 0n,
      ra,
      dec,
      z: cz / C_KM_S,
      magU: NaN,
      magG: j,
      magR: h,
      magI: k,
      magZ: NaN,
    });
  }

  return { records, skipped };
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npm test -- twoMrs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/parsers/twoMrs.ts tests/parsers/twoMrs.test.ts
git commit -m "feat: add 2MRS catalogue parser"
```

---

## Task 11: 2MPZ parser

**Files:**

- Create: `tools/parsers/twoMpz.ts`
- Create: `tests/parsers/twoMpz.test.ts`

The 2MPZ catalog (VizieR VII/281) is whitespace-separated ASCII with ~17 columns. Relevant ones (1-based column index after splitting on whitespace):

| Col | Field      | Notes                                       |
| --- | ---------- | ------------------------------------------- |
| 2   | RA         | decimal degrees                             |
| 3   | Dec        | decimal degrees                             |
| 4   | J          | 2MASS J magnitude                           |
| 5   | H          | 2MASS H magnitude                           |
| 6   | K          | 2MASS K_s magnitude                         |
| 13  | ZPHOTO     | photometric redshift                        |
| 14  | ZPHOTO_ERR | error on ZPHOTO                             |
| 15  | ZSPEC      | spectroscopic z (when available; -1 if not) |
| 17  | SDSS_OBJID | numeric, 0 if no SDSS match                 |

Use `ZSPEC` if `ZSPEC > 0`, else `ZPHOTO`. Skip if both are non-positive. Magnitude mapping is the same as 2MRS: magG = J, magR = H, magI = K, magU/magZ NaN.

- [ ] **Step 1: Write the failing test**

```ts
// tests/parsers/twoMpz.test.ts
import { describe, it, expect } from 'vitest';
import { parseTwoMpz } from '../../tools/parsers/twoMpz';
import { Source } from '../../src/data/sources';

const SAMPLE = `# 2MPZ catalogue header — implementer notes
# col1=ID  col2=RA  col3=Dec  col4=J  col5=H  col6=K  col13=ZPHOTO  col15=ZSPEC  col17=SDSS_OBJID
2MPZJ001      180.0   +30.0   12.3 11.5 10.7  0.0  0.0  0.0  0.0  0.0  0.0  0.0  0.08  0.01  0.085  0.0  1237651738291011584
2MPZJ002      200.0   -10.0   13.1 12.4 11.6  0.0  0.0  0.0  0.0  0.0  0.0  0.0  0.05  0.01   -1     0.0  0
2MPZJ003      120.0   +45.0   14.0 13.5 13.0  0.0  0.0  0.0  0.0  0.0  0.0  0.0   -1   0.0   -1     0.0  0
`;

describe('parseTwoMpz', () => {
  it('parses ZSPEC when present; falls back to ZPHOTO; skips rows with neither', () => {
    const { records, skipped } = parseTwoMpz(SAMPLE);
    expect(skipped).toBe(1);
    expect(records).toHaveLength(2);
    const r0 = records[0]!;
    expect(r0.source).toBe(Source.TwoMPZ);
    expect(r0.ra).toBeCloseTo(180);
    expect(r0.dec).toBeCloseTo(30);
    expect(r0.z).toBeCloseTo(0.085); // ZSPEC preferred over ZPHOTO
    expect(r0.objID).toBe(1237651738291011584n);
    expect(r0.magG).toBeCloseTo(12.3);
    expect(Number.isNaN(r0.magU)).toBe(true);

    const r1 = records[1]!;
    expect(r1.z).toBeCloseTo(0.05); // ZSPEC = -1 → ZPHOTO
    expect(r1.objID).toBe(0n); // no SDSS match
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- twoMpz`
Expected: FAIL.

- [ ] **Step 3: Implement `tools/parsers/twoMpz.ts`**

```ts
import { Source } from '../../src/data/sources';
import { nonCommentLines, type ParsedRecord } from './common';

/**
 * Parse the 2MPZ (2MASS Photometric Redshift Catalogue) from VizieR VII/281.
 *
 * Format: whitespace-separated ASCII. Tokens used (1-based column index):
 *   2 = RA (deg)         3 = Dec (deg)
 *   4 = J  5 = H  6 = K  (2MASS magnitudes)
 *   13 = ZPHOTO          15 = ZSPEC (-1 if not measured)
 *   17 = SDSS_OBJID      (0 if no SDSS counterpart)
 *
 * Redshift policy: prefer ZSPEC when > 0, else ZPHOTO; skip if neither.
 */
export function parseTwoMpz(rawText: string): { records: ParsedRecord[]; skipped: number } {
  const lines = nonCommentLines(rawText);
  const records: ParsedRecord[] = [];
  let skipped = 0;

  for (const line of lines) {
    const tok = line.trim().split(/\s+/);
    if (tok.length < 17) {
      skipped++;
      continue;
    }

    const ra = parseFloat(tok[1]!);
    const dec = parseFloat(tok[2]!);
    const j = parseFloat(tok[3]!);
    const h = parseFloat(tok[4]!);
    const k = parseFloat(tok[5]!);
    const zphoto = parseFloat(tok[12]!);
    const zspec = parseFloat(tok[14]!);
    const objStr = tok[16]!;

    let z: number;
    if (Number.isFinite(zspec) && zspec > 0) z = zspec;
    else if (Number.isFinite(zphoto) && zphoto > 0) z = zphoto;
    else {
      skipped++;
      continue;
    }

    if (
      !Number.isFinite(ra) ||
      !Number.isFinite(dec) ||
      !Number.isFinite(j) ||
      !Number.isFinite(h) ||
      !Number.isFinite(k)
    ) {
      skipped++;
      continue;
    }

    let objID = 0n;
    try {
      const parsed = BigInt(objStr);
      if (parsed > 0n) objID = parsed;
    } catch {
      // Leave as 0n — many 2MPZ rows have no SDSS counterpart.
    }

    records.push({
      source: Source.TwoMPZ,
      objID,
      ra,
      dec,
      z,
      magU: NaN,
      magG: j,
      magR: h,
      magI: k,
      magZ: NaN,
    });
  }

  return { records, skipped };
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npm test -- twoMpz`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/parsers/twoMpz.ts tests/parsers/twoMpz.test.ts
git commit -m "feat: add 2MPZ catalogue parser"
```

---

## Task 12: 6dFGS parser

**Files:**

- Create: `tools/parsers/sixDfgs.ts`
- Create: `tests/parsers/sixDfgs.test.ts`

The 6dFGS catalog (VizieR VII/259) is whitespace-separated ASCII. Relevant columns (1-based by token):

| Col | Field | Notes                                |
| --- | ----- | ------------------------------------ |
| 2   | RA    | decimal degrees                      |
| 3   | Dec   | decimal degrees                      |
| 4   | z     | spectroscopic redshift               |
| 5   | q     | quality flag (1–6; we keep `q == 4`) |
| 7   | Kmag  | 2MASS K magnitude                    |

Mapping into our 5-band slots: magI = K, all others NaN. (6dFGS doesn't publish optical photometry.)

- [ ] **Step 1: Write the failing test**

```ts
// tests/parsers/sixDfgs.test.ts
import { describe, it, expect } from 'vitest';
import { parseSixDfgs } from '../../tools/parsers/sixDfgs';
import { Source } from '../../src/data/sources';

const SAMPLE = `# 6dFGS DR3 — col2=RA, col3=Dec, col4=z, col5=q, col7=Kmag
g0001  300.0  -45.0  0.04  4  0.0  10.5
g0002  150.0   -5.0  0.10  3  0.0  11.2
g0003  200.0  -30.0  0.08  4  0.0  12.0
g0004  100.0  -10.0  -0.01 4  0.0  13.5
`;

describe('parseSixDfgs', () => {
  it('keeps q == 4 rows with positive z; skips others', () => {
    const { records, skipped } = parseSixDfgs(SAMPLE);
    expect(skipped).toBe(2);
    expect(records).toHaveLength(2);
    const r0 = records[0]!;
    expect(r0.source).toBe(Source.SixDFGS);
    expect(r0.ra).toBeCloseTo(300);
    expect(r0.dec).toBeCloseTo(-45);
    expect(r0.z).toBeCloseTo(0.04);
    expect(r0.magI).toBeCloseTo(10.5);
    expect(Number.isNaN(r0.magG)).toBe(true);
    expect(Number.isNaN(r0.magR)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- sixDfgs`
Expected: FAIL.

- [ ] **Step 3: Implement `tools/parsers/sixDfgs.ts`**

```ts
import { Source } from '../../src/data/sources';
import { nonCommentLines, type ParsedRecord } from './common';

/**
 * Parse the 6dF Galaxy Survey catalogue from VizieR VII/259.
 *
 * Format: whitespace-separated ASCII. Tokens used (1-based):
 *   2 = RA (deg)   3 = Dec (deg)   4 = z   5 = q (quality)   7 = Kmag
 *
 * Quality cuts: keep q == 4 (best spectroscopic redshift). Other values
 * indicate marginal or contested redshifts — we drop them rather than
 * mix qualities into the visualisation.
 */
export function parseSixDfgs(rawText: string): { records: ParsedRecord[]; skipped: number } {
  const lines = nonCommentLines(rawText);
  const records: ParsedRecord[] = [];
  let skipped = 0;

  for (const line of lines) {
    const tok = line.trim().split(/\s+/);
    if (tok.length < 7) {
      skipped++;
      continue;
    }

    const ra = parseFloat(tok[1]!);
    const dec = parseFloat(tok[2]!);
    const z = parseFloat(tok[3]!);
    const q = parseInt(tok[4]!, 10);
    const k = parseFloat(tok[6]!);

    if (
      !Number.isFinite(ra) ||
      !Number.isFinite(dec) ||
      !Number.isFinite(z) ||
      z <= 0 ||
      !Number.isFinite(k) ||
      q !== 4
    ) {
      skipped++;
      continue;
    }

    records.push({
      source: Source.SixDFGS,
      objID: 0n,
      ra,
      dec,
      z,
      magU: NaN,
      magG: NaN,
      magR: NaN,
      magI: k,
      magZ: NaN,
    });
  }

  return { records, skipped };
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npm test -- sixDfgs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/parsers/sixDfgs.ts tests/parsers/sixDfgs.test.ts
git commit -m "feat: add 6dFGS catalogue parser"
```

---

## Task 13: Cross-match merger and master-bin builder

**Files:**

- Create: `tests/crossMatch.test.ts`
- Create: `tools/buildMasterBin.ts`
- Modify: `package.json` (add `build-master` script)

Cross-match strategy:

1. Sort all input records by source priority: SDSS first, then 2MRS, 6dFGS, 2MPZ.
2. Maintain a set of `BigInt` SDSS objIDs already seen. For each non-SDSS record with a non-zero `objID`, skip if its objID is in that set.
3. Maintain a spatial index (grid keyed by `floor(ra)`, `floor(dec)`) of accepted records. For a candidate record, look up the grid cell + 8 neighbours; reject if any neighbour is within 5 arcsec angularly AND `|Δz/(1+z)| < 0.01`.
4. Otherwise accept and insert into the grid.

Tasks 9–12 already produced `ParsedRecord[]` arrays; this task wires them together.

- [ ] **Step 1: Write the failing test**

```ts
// tests/crossMatch.test.ts
import { describe, it, expect } from 'vitest';
import { crossMatch } from '../tools/buildMasterBin';
import { Source } from '../src/data/sources';
import type { ParsedRecord } from '../tools/parsers/common';

function rec(source: Source, ra: number, dec: number, z: number, objID = 0n): ParsedRecord {
  return {
    source,
    objID,
    ra,
    dec,
    z,
    magU: NaN,
    magG: 18,
    magR: NaN,
    magI: NaN,
    magZ: NaN,
  };
}

describe('crossMatch', () => {
  it('keeps SDSS over 2MPZ when they share an objID', () => {
    const out = crossMatch({
      sdss: [rec(Source.SDSS, 180, 0, 0.1, 100n)],
      twoMrs: [],
      sixDfgs: [],
      twoMpz: [rec(Source.TwoMPZ, 180.001, 0.001, 0.1, 100n)],
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.source).toBe(Source.SDSS);
  });

  it('rejects positional duplicates within 5 arcsec and Δz/(1+z) < 1%', () => {
    const out = crossMatch({
      sdss: [rec(Source.SDSS, 180, 0, 0.1, 100n)],
      twoMrs: [rec(Source.TwoMRS, 180.0001, 0, 0.10005)], // 0.36 arcsec away, same z
      sixDfgs: [],
      twoMpz: [],
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.source).toBe(Source.SDSS);
  });

  it('keeps records that differ in z even at the same position', () => {
    const out = crossMatch({
      sdss: [rec(Source.SDSS, 180, 0, 0.1, 100n)],
      twoMrs: [],
      sixDfgs: [],
      twoMpz: [rec(Source.TwoMPZ, 180, 0, 0.5)], // background galaxy along same LoS
    });
    expect(out).toHaveLength(2);
  });

  it('preserves SDSS, 2MRS, 6dFGS, 2MPZ priority on objID-matched dedup', () => {
    const out = crossMatch({
      sdss: [],
      twoMrs: [rec(Source.TwoMRS, 180, 0, 0.05)],
      sixDfgs: [rec(Source.SixDFGS, 180.0001, 0, 0.05005)],
      twoMpz: [rec(Source.TwoMPZ, 180.0002, 0.0001, 0.0501)],
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.source).toBe(Source.TwoMRS);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- crossMatch`
Expected: FAIL — `tools/buildMasterBin` not found.

- [ ] **Step 3: Implement `tools/buildMasterBin.ts`**

```ts
#!/usr/bin/env node
/**
 * buildMasterBin — combine four parsed catalogues into one master `.bin`.
 *
 * Usage:
 *   npm run build-master -- \
 *     --sdss     path/to/sdss.csv \
 *     --twomrs   path/to/2mrs.txt \
 *     --twompz   path/to/2mpz.txt \
 *     --sixdfgs  path/to/6dfgs.txt \
 *     --out      public/data/master.bin
 *
 * Cross-match dedup priority: SDSS > 2MRS > 6dFGS > 2MPZ.
 *
 * Two dedup signals are checked in this order:
 *   1. objID match — if a 2MPZ row carries an SDSS_OBJID we already accepted
 *      from the SDSS file, the 2MPZ row is dropped.
 *   2. Position + z match — angular separation < 5 arcsec AND
 *      |Δz/(1+z)| < 0.01.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parseSdssCsv } from './parsers/sdssCsv';
import { parseTwoMrs } from './parsers/twoMrs';
import { parseTwoMpz } from './parsers/twoMpz';
import { parseSixDfgs } from './parsers/sixDfgs';
import type { ParsedRecord } from './parsers/common';

import { encodePointCloud } from '../src/data/pointCloudFormat';
import { raDecZToCartesian } from '../src/data/coords';
import { Source } from '../src/data/sources';
import type { PointCloud } from '../src/types';

// ─── Cross-match ──────────────────────────────────────────────────────────────

const ARC_SEC_IN_DEG = 1 / 3600;
const POSITION_TOL_DEG = 5 * ARC_SEC_IN_DEG;
const REDSHIFT_TOL_REL = 0.01;

type Inputs = {
  sdss: ParsedRecord[];
  twoMrs: ParsedRecord[];
  sixDfgs: ParsedRecord[];
  twoMpz: ParsedRecord[];
};

export function crossMatch(inputs: Inputs): ParsedRecord[] {
  // Concatenate in priority order — the loop accepts the first record per
  // dedup group, so order = priority.
  const all: ParsedRecord[] = [
    ...inputs.sdss,
    ...inputs.twoMrs,
    ...inputs.sixDfgs,
    ...inputs.twoMpz,
  ];

  const acceptedObjIDs = new Set<bigint>();
  // 2D grid keyed by floor(ra),floor(dec); each cell holds the records
  // already accepted in that 1°×1° tile.
  const grid = new Map<string, ParsedRecord[]>();
  const cellKey = (ra: number, dec: number) => `${Math.floor(ra)}|${Math.floor(dec)}`;

  function angularSepDeg(ra1: number, dec1: number, ra2: number, dec2: number): number {
    // Small-angle approximation — adequate for our 5-arcsec threshold and
    // dec away from the poles. cos(dec) compresses the RA delta.
    const dRa = (ra1 - ra2) * Math.cos(((dec1 + dec2) * 0.5 * Math.PI) / 180);
    const dDec = dec1 - dec2;
    return Math.sqrt(dRa * dRa + dDec * dDec);
  }

  const accepted: ParsedRecord[] = [];

  for (const r of all) {
    // 1. objID-based dedup (only meaningful for SDSS objIDs).
    if (r.objID > 0n) {
      if (acceptedObjIDs.has(r.objID)) continue;
    }

    // 2. Position + redshift dedup. Check the cell + 8 neighbours.
    let isDuplicate = false;
    const cx = Math.floor(r.ra);
    const cy = Math.floor(r.dec);
    for (let dy = -1; dy <= 1 && !isDuplicate; dy++) {
      for (let dx = -1; dx <= 1 && !isDuplicate; dx++) {
        const cell = grid.get(`${cx + dx}|${cy + dy}`);
        if (!cell) continue;
        for (const other of cell) {
          if (angularSepDeg(r.ra, r.dec, other.ra, other.dec) < POSITION_TOL_DEG) {
            const dz = Math.abs(r.z - other.z) / (1 + Math.min(r.z, other.z));
            if (dz < REDSHIFT_TOL_REL) {
              isDuplicate = true;
              break;
            }
          }
        }
      }
    }
    if (isDuplicate) continue;

    accepted.push(r);
    if (r.objID > 0n) acceptedObjIDs.add(r.objID);
    const k = cellKey(r.ra, r.dec);
    let cell = grid.get(k);
    if (!cell) {
      cell = [];
      grid.set(k, cell);
    }
    cell.push(r);
  }

  return accepted;
}

// ─── PointCloud assembly + write ──────────────────────────────────────────────

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
    sourceIDs: new Uint8Array(count),
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
    cloud.sourceIDs[i] = r.source;
  }
  return cloud;
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

function readArgs(): Record<string, string> {
  const out: Record<string, string> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      out[a.slice(2)] = argv[i + 1] ?? '';
      i++;
    }
  }
  return out;
}

const args = readArgs();
if (!args.out) {
  process.stderr.write(
    'usage: build-master --sdss FILE --twomrs FILE --twompz FILE --sixdfgs FILE --out OUT\n',
  );
  process.exit(1);
}

function loadOrEmpty(
  path: string | undefined,
  parser: (raw: string) => { records: ParsedRecord[]; skipped: number },
): ParsedRecord[] {
  if (!path) return [];
  const text = readFileSync(resolve(path), 'utf8');
  const { records, skipped } = parser(text);
  process.stderr.write(
    `  loaded ${records.length.toLocaleString()} records (skipped ${skipped.toLocaleString()})\n`,
  );
  return records;
}

process.stderr.write('parsing SDSS…\n');
const sdss = loadOrEmpty(args.sdss, parseSdssCsv);
process.stderr.write('parsing 2MRS…\n');
const twoMrs = loadOrEmpty(args.twomrs, parseTwoMrs);
process.stderr.write('parsing 2MPZ…\n');
const twoMpz = loadOrEmpty(args.twompz, parseTwoMpz);
process.stderr.write('parsing 6dFGS…\n');
const sixDfgs = loadOrEmpty(args.sixdfgs, parseSixDfgs);

process.stderr.write('cross-matching…\n');
const merged = crossMatch({ sdss, twoMrs, sixDfgs, twoMpz });
process.stderr.write(`  ${merged.length.toLocaleString()} records survived dedup\n`);

const cloud = recordsToCloud(merged);
const buf = encodePointCloud(cloud);
writeFileSync(resolve(args.out), Buffer.from(buf));
process.stderr.write(
  `wrote ${cloud.count.toLocaleString()} points to ${args.out} (${buf.byteLength.toLocaleString()} bytes)\n`,
);
```

- [ ] **Step 4: Add npm script**

In `package.json`, add to the `scripts` block:

```json
"build-master": "tsx tools/buildMasterBin.ts"
```

Place it alphabetically between `build` and `csv-to-bin`.

- [ ] **Step 5: Run test to verify pass**

Run: `npm test -- crossMatch`
Expected: PASS — 4 tests green.

- [ ] **Step 6: Commit**

```bash
git add tools/buildMasterBin.ts tests/crossMatch.test.ts package.json
git commit -m "feat: add cross-match merger + build-master CLI"
```

---

## Task 14: InfoCard source attribution + DSS image fallback

**Files:**

- Modify: `src/data/physics.ts`
- Modify: `src/engine.ts`
- Modify: `src/components/InfoCard.tsx`
- Modify: `index.html` (CSS for source badge)

For non-SDSS sources we can't link to the SDSS Quick-Look page (no objID). The image cutout still works for any RA/Dec via the DSS service:

```
https://archive.eso.org/dss/dss/image?ra={ra}&dec={dec}&x=2&y=2&Sky-Survey=DSS2-red&mime-type=image/jpeg
```

(2-arcmin square — comparable to the SDSS 200 px @ 0.4 arcsec/px ≈ 80-arcsec view.)

- [ ] **Step 1: Add `dssThumbnailUrl` to `src/data/physics.ts`**

Add the function, JSDoc, and tests:

```ts
/**
 * Build a Digitized Sky Survey image cutout URL for a given (RA, Dec).
 *
 * DSS is all-sky (originally photographic plates), unlike SDSS which only
 * covers ~1/3 of the sky. We fall back to DSS for points sourced from
 * non-SDSS surveys.
 *
 * `arcMin` is the field-of-view side length (default 2 arcmin = 120 arcsec,
 * roughly comparable to the 200 px @ 0.4 arcsec/px SDSS thumbnail).
 */
export function dssThumbnailUrl(raDeg: number, decDeg: number, arcMin = 2): string {
  return (
    `https://archive.eso.org/dss/dss/image?ra=${raDeg}&dec=${decDeg}` +
    `&x=${arcMin}&y=${arcMin}&Sky-Survey=DSS2-red&mime-type=image/jpeg`
  );
}
```

Add a unit test in `tests/physics.test.ts`:

```ts
import { dssThumbnailUrl } from '../src/data/physics';

describe('dssThumbnailUrl', () => {
  it('builds the ESO DSS endpoint with default 2-arcmin field', () => {
    expect(dssThumbnailUrl(180, 0)).toBe(
      'https://archive.eso.org/dss/dss/image?ra=180&dec=0&x=2&y=2&Sky-Survey=DSS2-red&mime-type=image/jpeg',
    );
  });
});
```

Run: `npm test -- physics`
Expected: PASS — 46 physics tests now (was 45).

- [ ] **Step 2: Update `PointInfo` to include `source` and per-source URLs**

In `src/engine.ts`:

Extend `PointInfo`:

```ts
export type PointInfo = {
  // … existing fields …
  source: Source;
  sourceLabel: string; // pre-formatted from sourceLabel(source)
  // explorerUrl now optional — non-SDSS rows have no Explorer page.
  explorerUrl: string | null;
  // thumbnailUrl picks SDSS or DSS based on source.
  thumbnailUrl: string;
};
```

In `buildPointInfo` (or wherever the object is constructed):

```ts
import { Source, sourceLabel as sourceLabelFn } from './data/sources';
import { dssThumbnailUrl, sdssThumbnailUrl, sdssExplorerUrl } from './data/physics';

const source = cloud.sourceIDs[index]! as Source;
const isSdss = source === Source.SDSS;
const explorerUrl =
  isSdss && cloud.objIDs[index]! > 0n ? sdssExplorerUrl(cloud.objIDs[index]!) : null;
const thumbnailUrl = isSdss ? sdssThumbnailUrl(ra, dec, 200) : dssThumbnailUrl(ra, dec, 2);

const info: PointInfo = {
  // …
  source,
  sourceLabel: sourceLabelFn(source),
  explorerUrl,
  thumbnailUrl,
};
```

Run `npm run typecheck`.
Expected: FAIL — `InfoCard.tsx` doesn't yet handle `explorerUrl: null`. Fix in next step.

- [ ] **Step 3: Update `src/components/InfoCard.tsx`**

In `FullCard`:

```tsx
// Above the card rows, just under the SDSS J... headline:
<div className="card-source-badge">{info.sourceLabel}</div>;

// Replace the existing Explorer link block:
{
  info.explorerUrl ? (
    <a className="external-link" href={info.explorerUrl} target="_blank" rel="noopener noreferrer">
      View in SDSS Explorer →
    </a>
  ) : (
    <div className="external-link external-link-disabled">
      No catalogue page for {info.sourceLabel}
    </div>
  );
}
```

In `CompactCard`, also add the badge near the top (below the name).

- [ ] **Step 4: Add CSS for `.card-source-badge` in `index.html`**

```css
.card-source-badge {
  display: inline-block;
  padding: 1px 6px;
  margin: 4px 0 6px 0;
  border-radius: 3px;
  background: rgba(160, 200, 255, 0.12);
  border: 1px solid rgba(160, 200, 255, 0.25);
  color: rgba(220, 230, 255, 0.85);
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.external-link-disabled {
  opacity: 0.45;
  font-style: italic;
}
```

- [ ] **Step 5: Run typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/data/physics.ts src/engine.ts src/components/InfoCard.tsx index.html tests/physics.test.ts
git commit -m "feat: source attribution badge + DSS image fallback for non-SDSS rows"
```

---

## Task 15: README updates

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Add a "Multi-survey master file" section**

Insert after the existing "Loading real SDSS data" section:

````markdown
## Loading multi-survey data

To render galaxies from all four surveys (SDSS + 2MRS + 2MPZ + 6dFGS) in one cloud:

### 1. Download the catalogues

| Survey | Source                                                                         | Notes                                 |
| ------ | ------------------------------------------------------------------------------ | ------------------------------------- |
| SDSS   | [SkyServer SQL](http://skyserver.sdss.org/dr18/SearchTools/sql)                | Use the query from the section above. |
| 2MRS   | [VizieR VII/265](https://vizier.cds.unistra.fr/viz-bin/VizieR?-source=VII/265) | ASCII fixed-width, ~5 MB.             |
| 2MPZ   | [VizieR VII/281](https://vizier.cds.unistra.fr/viz-bin/VizieR?-source=VII/281) | ASCII whitespace-separated, ~50 MB.   |
| 6dFGS  | [VizieR VII/259](https://vizier.cds.unistra.fr/viz-bin/VizieR?-source=VII/259) | ASCII, ~10 MB.                        |

Save them anywhere — pass paths in the next step.

### 2. Build the master file

```bash
npm run build-master -- \
  --sdss     data/sdss-query.csv \
  --twomrs   data/2mrs.dat \
  --twompz   data/2mpz.dat \
  --sixdfgs  data/6dfgs.dat \
  --out      public/data/master.bin
```

The tool parses each file, cross-matches by SDSS objID and by sky position + redshift (5 arcsec / 1% Δz tolerance), and writes a single `master.bin` in v3 format. Per-row priority: SDSS spec > 2MRS spec > 6dFGS spec > 2MPZ photo.

### 3. Reload

The browser will load `master.bin` if present (looking up `/data/master.bin` first, falling back to `/data/sdss.bin`, then synthetic). The settings panel bottom-left gives you per-survey checkboxes plus an Auto LOD toggle that picks visible surveys based on camera distance.

> Want only some surveys? Just omit the corresponding `--xxx` flag — the merger treats missing inputs as empty arrays.
````

- [ ] **Step 2: Update the runtime loader description**

Find the "Loading real SDSS data" section's note about the renderer fetching `/data/sdss.bin` and update it to mention the master.bin fallback chain. The engine should try `master.bin` first (this is a small change in `src/engine.ts`'s `loadCloud` — actually, this isn't yet implemented; defer to Task 16 if needed, but for v3-format files, both work since both are .bin format).

For now, document that you can rename your `master.bin` to `sdss.bin` (or vice versa) — the loader's `/data/sdss.bin` fetch path is unchanged. A follow-up cleanup task can rename the loader path.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README — multi-survey master.bin workflow + VizieR sources"
```

---

## Out of scope (deferred)

- **FITS file support** — VizieR also offers FITS downloads. Easier to parse than ASCII for some catalogues but adds a dependency (e.g. `astrojs/fits` or hand-rolled). Stick with ASCII for v1.
- **Spatial chunking / frustum culling** for ≥10M points. The four-survey merged cloud is ~1.5M points which the existing single-vertex-buffer renderer handles at 60 fps. The 100M-photometric-scale problem is its own plan.
- **Photometric mass / luminosity estimates** from the cross-band photometry. Adds a stellar-population-synthesis pipeline; defer.
- **Galactic-plane region** highlighting. The 2MPZ/2MRS data sparsens through `|b| < 5°`; visualising this gap is its own UX exercise.
- **Settings panel keyboard shortcuts** (e.g. `1`/`2`/`3`/`4` to toggle surveys, `a` for auto-LOD).
- **Per-survey colour tinting** in the renderer — the user explicitly opted _out_ (option 4B). If they ever change their mind: add a `tintBySource: bool` uniform and a 4-vec3 colour table.

---

## Self-review notes

- **Spec coverage:** 4 surveys ingested (Tasks 9–12), pre-merged single bin with cross-match (Task 13), auto-LOD by camera distance + manual override (Tasks 5–8), source as metadata only — no visual differentiation (the WGSL change in Task 4 only filters; it doesn't tint). All four user choices implemented.
- **Type consistency:** `PointCloud.sourceIDs` named consistently in Tasks 2, 3, 4, 9, 13. `Source` enum values fixed in Task 1 and used identically everywhere. `visibleSourceMask` named consistently in shader, renderer, engine, App.
- **No placeholders.** Each task contains the full code or a complete code template plus the location it goes. No "TBD" / "implement later" / "similar to Task N".
- **Open assumption:** the exact column offsets for 2MRS / 2MPZ / 6dFGS may differ slightly from the README values used in the parser tasks. Each parser task notes that the implementer should validate against the actual file's README. The fixture-based tests will catch obvious off-by-one errors during implementation.
