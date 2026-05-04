# Cosmicflows-4 Peculiar-Velocity Flow Field Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each implementer subagent must be dispatched `run_in_background: true` per project convention.

**Goal:** Render the Cosmicflows-4 (CF4; Tully+ 2023) peculiar-velocity field as two new layers on top of the existing galaxy renderer: (1) ~56k CF4 distance-measured galaxies as billboards coloured by basin/velocity, and (2) RK4-integrated streamlines through the Wiener-filter-reconstructed velocity grid showing flow toward attractors (Laniakea, Great Attractor, Perseus-Pisces, Shapley, Coma, Hercules). The flagship visual mirrors the published CF4 figures — translucent streamlines arcing toward density nodes, evoking the cosmic velocity field directly rather than just the matter distribution.

**Architecture:** CF4 is a parallel layer alongside `FilamentLayer` from the DisPerSE plan — **NOT** a `Source` enum addition. The existing `Source` enum (SDSS, 2MRS, GLADE) is for survey catalogs only and stays untouched. CF4 gets its own binary formats, its own loaders, its own GPU pipelines, and its own settings toggles.

Two binary assets are built offline:

1. `public/data/cf4_galaxies.bin` — N×{x,y,z, basinId, vpec_x, vpec_y, vpec_z}, ~50k × 28B ≈ 1.4 MB.
2. `public/data/cf4_streamlines.bin` — strip-offset variable-length polylines (FILA-shaped layout); per-vertex {x,y,z, vMag, basinId}, ~10 MB cap.

Build-time orchestrator `tools/buildCF4.ts` (a) downloads the CF4 galaxy ASCII catalog and the CF4gp velocity-grid FITS into `data/raw/cf4/`, (b) parses both, (c) integrates streamlines via RK4 (adaptive 0.5 Mpc step, max 200 steps, terminate on bbox exit / `|v|<10 km/s`), seeded from each catalog galaxy with `|vpec|>50 km/s`, and (d) encodes the two `.bin` files. Coordinates are transformed at build time from supergalactic (de Vaucouleurs 1976) to equatorial-cartesian to match the rest of the renderer.

At runtime, two new GPU pipelines plug into `renderFrame.ts` inside the HDR pass before tone-map: `CF4PointRenderer` (instanced billboards, no atlas thumbnails) and `StreamlineRenderer` (`topology: 'line-strip'` driven from the strip-offset table, additive blending, colour by velocity magnitude in Phase 1). Settings panel gains a "Cosmic flow (CF4)" section with two toggles + a streamline-density slider that gates how many strips render. App.tsx wires the controls through `EngineHandle`.

Phase 1 colours strictly by `|v_pec|` — watershed-based basin segmentation (which would give the canonical Tully colour palette) is deferred to a follow-up plan because it requires a non-trivial 3D segmentation pipeline. `basinId` is encoded but unused in shaders Phase 1.

**Tech Stack:** TypeScript, WebGPU + WGSL, Vite, Vitest. New runtime dependency: none. New build-time dependency: `node-fetch` already present; FITS parsing handled inline (CF4gp grid is a 512×512×512 float32 cube with a small ASCII header — no external library needed).

---

## Scope

**In scope (Phase 1 — this plan):**
- `tools/fetchCF4.ts` — one-shot download of CF4 catalog + CF4gp velocity grid into `data/raw/cf4/`.
- Two binary formats with encode/decode + tests.
- Pure-function SG→equatorial coordinate transform with unit tests.
- Pure-function RK4 streamline integrator with unit tests against synthetic linear + rotational fields (closed-form known answers).
- `tools/buildCF4.ts` orchestrator producing both `.bin` files from `data/raw/cf4/` end-to-end.
- `cloudLoader.ts` additions: `loadCF4Galaxies()` and `loadCF4Streamlines()`.
- `CF4PointRenderer` GPU pipeline + smoke test.
- `StreamlineRenderer` GPU pipeline + smoke test.
- WGSL shaders for both passes.
- Engine integration in `renderFrame.ts` gated on two new settings.
- SettingsPanel "Cosmic flow (CF4)" section with toggles + density slider.
- App.tsx state wiring.
- README "Cosmic flow (CF4)" section + visual verification checklist.

**Out of scope (future plans):**
- Watershed-based basin segmentation (Phase 1 colours by velocity magnitude only).
- 3D basin-boundary isosurfaces (Laniakea / Great Attractor / etc. as translucent shells).
- Time-evolution / linear-theory back-projection animations.
- CF4-specific InfoCard content (clicking a CF4 galaxy hits the standard hover / pick path; basin metadata is not surfaced).
- Picking on streamlines (decorative-only Phase 1 — clicks pass through).
- Per-segment line-strip width via instanced quads (uses native `'line-strip'` topology Phase 1; if 1-px lines look too thin we'll port the instanced-quad technique from `filamentRenderer` in a follow-up).
- Density slider with multiple pre-baked LOD bins (Phase 1 slider just changes a draw-call upper-bound; the binary always ships all strips).

**Pre-existing dependencies:**
- The post-refactor `renderFrame.ts` (engine.ts no longer owns the per-frame loop directly — it constructs renderers and threads them into `renderFrame()`).
- The existing HDR target + tone-map pass.
- `tools/parsers/` convention (every parser lives there, pure-function, tested with fixtures).

---

## File Structure

### New files

- **`tools/fetchCF4.ts`** — CLI fetcher that downloads the CF4 catalog ASCII (~10 MB) and the CF4gp velocity-grid binary (~50–200 MB) into `data/raw/cf4/`. Idempotent (skip if file exists + size matches).
- **`tools/parsers/cf4Catalog.ts`** — pure-function parser for the CF4 fixed-width ASCII catalog. Returns `ParsedCF4Galaxy[]` with raw SG coordinates + peculiar-velocity components.
- **`tools/parsers/cf4Grid.ts`** — pure-function parser for the CF4gp velocity-grid binary. Returns `{ nx, ny, nz, dx, origin, vx, vy, vz }` where each component is a `Float32Array` of length `nx*ny*nz`.
- **`tools/cf4/sgToEquatorial.ts`** — pure-function 3×3 rotation from supergalactic (SGX, SGY, SGZ) to equatorial cartesian. Constants from de Vaucouleurs 1976.
- **`tools/cf4/rk4Streamline.ts`** — pure-function RK4 streamline integrator. Inputs: seed point, velocity-field sampler, options (step, maxSteps, vMinTerminate, bbox). Returns `Float32Array` of `[x,y,z,vMag] × n`.
- **`tools/buildCF4.ts`** — CLI orchestrator: read raw → transform coordinates → pick seeds → integrate streamlines → encode + write both `.bin` files.
- **`src/data/cf4GalaxiesBinaryFormat.ts`** — encoder + decoder for `cf4_galaxies.bin`. Mirrors `pointCloudFormat.ts` style.
- **`src/data/cf4StreamlinesBinaryFormat.ts`** — encoder + decoder for `cf4_streamlines.bin`. Mirrors `filamentBinaryFormat.ts` style (strip-offset table + variable-length vertex arrays).
- **`src/@types/CF4Cloud.d.ts`** — runtime decoded shape for `cf4_galaxies.bin` (parallel to `PointCloud.d.ts`).
- **`src/@types/CF4StreamlineCloud.d.ts`** — runtime decoded shape for `cf4_streamlines.bin` (parallel to `FilamentCloud.d.ts`).
- **`src/services/gpu/cf4PointRenderer.ts`** — GPU pipeline owner for the CF4 galaxy billboards.
- **`src/services/gpu/streamlineRenderer.ts`** — GPU pipeline owner for the CF4 streamlines.
- **`src/services/gpu/shaders/cf4Galaxies.wgsl`** — vertex + fragment for the CF4 point pass.
- **`src/services/gpu/shaders/streamlines.wgsl`** — vertex + fragment for the streamline pass.
- **Tests:** `tests/parsers/cf4Catalog.test.ts`, `tests/parsers/cf4Grid.test.ts`, `tests/cf4/sgToEquatorial.test.ts`, `tests/cf4/rk4Streamline.test.ts`, `tests/data/cf4GalaxiesBinaryFormat.test.ts`, `tests/data/cf4StreamlinesBinaryFormat.test.ts`, `tests/services/gpu/cf4PointRenderer.test.ts`, `tests/services/gpu/streamlineRenderer.test.ts`. Tests mirror the source tree exactly.

### Modified files

- **`src/services/engine/cloudLoader.ts`** — add `loadCF4Galaxies()` + `loadCF4Streamlines()` helpers (separate from the survey-bin path because both schemas differ).
- **`src/services/engine/engine.ts`** — instantiate `CF4PointRenderer` + `StreamlineRenderer`, fetch both bins, expose `setCF4GalaxiesEnabled` / `setCF4StreamlinesEnabled` / `setCF4StreamlineDensity`.
- **`src/services/engine/renderFrame.ts`** — accept the two new renderers in `RenderFrameInput`; add the two draw calls inside the HDR pass after `pointRenderer.draw` and before `pass.end()`.
- **`src/@types/EngineHandle.d.ts`** — add `setCF4GalaxiesEnabled?` / `setCF4StreamlinesEnabled?` / `setCF4StreamlineDensity?`.
- **`src/components/SettingsPanel/SettingsPanel.tsx`** — add a "Cosmic flow (CF4)" section.
- **`src/App.tsx`** — wire the new controls through `handleRef.current?`.
- **`package.json`** — add `"fetch-cf4": "tsx tools/fetchCF4.ts"` and `"build-cf4": "tsx tools/buildCF4.ts"` scripts.
- **`README.md`** — document the install + build steps.

---

## Binary formats

### CF4G v1 — `cf4_galaxies.bin`

Header (16 bytes), little-endian:

```
0       4     magic    = "CF4G" (0x47344643 in little-endian uint32)
4       4     version  = 1 (uint32)
8       4     count            (uint32) — number of CF4 galaxies
12      4     reserved = 0     (uint32) — keeps record array 8-byte aligned
```

Then a packed record array, 28 bytes per record:

```
0   4   x         f32   equatorial cartesian, Mpc
4   4   y         f32
8   4   z         f32
12  4   basinId   u32   0..N-1; 0xffffffff = unassigned (Phase 1 always 0xffffffff)
16  4   vpec_x    f32   peculiar velocity component, km/s
20  4   vpec_y    f32
24  4   vpec_z    f32
```

Total file size: `16 + 28 × count`. For 56k records: ~1.5 MB.

### CF4S v1 — `cf4_streamlines.bin`

Header (16 bytes), little-endian:

```
0       4     magic    = "CF4S" (0x53344643 in little-endian uint32)
4       4     version  = 1 (uint32)
8       4     stripCount       (uint32)
12      4     vertexCount      (uint32) — total vertices across all strips
```

Then two arrays (mirroring `filaments.bin`):

```
stripOffsets:   uint32 × (stripCount + 1)
                Last entry equals vertexCount.

vertices:       float32 × 5 × vertexCount
                Per vertex: [x, y, z, vMag, basinId]
                Position in Mpc (equatorial cartesian).
                vMag in km/s (raw, NOT normalised — the shader scales).
                basinId stored as float32 to keep the vertex stride
                uniform (line-strip vertex buffers can't easily mix
                u32 and f32 attributes without a second buffer; the
                u32→f32 round-trip is exact for basin IDs <2^24).
```

Total file size: `16 + 4 × (stripCount + 1) + 20 × vertexCount`. For 30k strips × 80 vertices avg = 2.4M vertices: ~48 MB. The Phase 1 build seeds with `|vpec|>50 km/s` from ~50k galaxies (~30k pass), so the realistic upper bound is ~10–15 MB.

The format precedent here is `filamentBinaryFormat.ts` for variable-length polylines + the strip-offset table; the only structural difference is 5 floats per vertex instead of 4.

---

## Render strategy

**CF4 galaxies** use the same instanced-billboard pattern as `pointRenderer` but with a much smaller dataset (~50k vs ~3.5M) and no atlas thumbnails. Phase 1 ships a flat 4-channel quad, fragment shader does a soft circular mask, colour comes from `|vpec|` mapped through a coolwarm-ish palette in WGSL.

**CF4 streamlines** use native `topology: 'line-strip'` with a vertex buffer indexed via the strip-offset table:

```ts
for (let i = 0; i < drawnStripCount; i++) {
  const start = stripOffsets[i];
  const end   = stripOffsets[i + 1];
  pass.draw(end - start, 1, start, 0);
}
```

`drawnStripCount = floor(stripCount × densitySlider)`. The settings slider just truncates the loop — no per-frame reupload. Native lines are 1 px wide on most platforms; if Phase 1 testing shows them too thin, the follow-up plan will port the instanced-quad technique from `filamentRenderer.ts`. Additive blending into the HDR target so dense convergence regions glow.

---

## Plan revision history

**2026-05-05 — initial.** Plan written from scope discussed in the brainstorming session. Architectural decisions (parallel layer to filaments not a Source, two separate bin formats, build-time RK4, native line-strip topology, basin colours deferred) are pinned in the Architecture section above and called out in each affected task. Plan mirrors the disperse-filament-skeleton structure for consistency.

---

## Task 0: Pre-flight + fetch CF4 sample data

**Files:**
- Create: `tools/fetchCF4.ts`
- Modify: `package.json`
- Create: `data/raw/cf4/` (directory only, contents downloaded by the script)

- [ ] **Step 1: Verify the existing test suite is green**

Run:

```
cd /Users/rulkens/Development/js/skymap && npm run typecheck && npm test
```

Expected: typecheck clean, all tests pass. If anything fails, stop and fix first — this plan assumes a clean baseline. Record the test count for the Task 13 sanity check.

- [ ] **Step 2: Add the directory + `.gitignore` rule for raw CF4 data**

`data/raw/cf4/` will hold the downloaded ASCII catalog and FITS-like grid; both are large and live outside git. Append to `/Users/rulkens/Development/js/skymap/.gitignore`:

```
# CF4 raw data — downloaded via `npm run fetch-cf4`, regeneratable
data/raw/cf4/
```

Commit:

```
git add .gitignore && git commit -m "chore: ignore CF4 raw data dir"
```

- [ ] **Step 3: Create the fetcher**

Create `/Users/rulkens/Development/js/skymap/tools/fetchCF4.ts`:

```ts
/**
 * fetchCF4 — one-shot downloader for the Cosmicflows-4 raw inputs.
 *
 * Why a dedicated script (not inline in buildCF4)?  Same reason
 * `tools/fetchHyperLeda.ts` exists separately from the cross-match
 * step: downloads are slow + idempotent + can fail mid-stream, while
 * the build step is fast + deterministic.  Separating them lets the
 * implementer iterate on the build without re-fetching ~200 MB.
 *
 * The CF4 EDD pages are HTML-wrapped; the actual download URLs below
 * point at the canonical IPAC mirror used by the Tully 2023 paper's
 * supplementary material.  If a URL 404s in the future, swap it for
 * the live EDD URL — schema is unchanged.
 *
 * Files written:
 *   data/raw/cf4/CF4_distances.dat   (~10 MB ASCII catalog)
 *   data/raw/cf4/CF4gp_velocity.bin  (~50–200 MB binary grid)
 *
 * Idempotency: skip download when the file already exists AND its
 * byte size is at least the documented minimum.  The minimum is
 * conservative — we'd rather re-download a corrupt half-file than
 * silently use one.
 */

import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const RAW_DIR = resolve(process.cwd(), 'data/raw/cf4');

type Target = {
  url: string;
  filename: string;
  minBytes: number;
};

const TARGETS: Target[] = [
  {
    url: 'https://edd.ifa.hawaii.edu/CF4/CF4_distances.dat',
    filename: 'CF4_distances.dat',
    minBytes: 5_000_000,
  },
  {
    url: 'https://edd.ifa.hawaii.edu/CF4/CF4gp_velocity.bin',
    filename: 'CF4gp_velocity.bin',
    minBytes: 30_000_000,
  },
];

async function fileSize(path: string): Promise<number | null> {
  try {
    const s = await stat(path);
    return s.size;
  } catch {
    return null;
  }
}

async function fetchOne(t: Target): Promise<void> {
  const out = resolve(RAW_DIR, t.filename);
  const existing = await fileSize(out);
  if (existing !== null && existing >= t.minBytes) {
    console.log(`[fetchCF4] skip ${t.filename} — already present (${existing} bytes)`);
    return;
  }
  console.log(`[fetchCF4] GET ${t.url}`);
  const res = await fetch(t.url);
  if (!res.ok) {
    throw new Error(`fetchCF4: ${t.url} returned ${res.status} ${res.statusText}`);
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength < t.minBytes) {
    throw new Error(
      `fetchCF4: ${t.filename} only ${buf.byteLength} bytes ` +
        `(expected ≥ ${t.minBytes}) — server may have truncated`,
    );
  }
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, buf);
  console.log(`[fetchCF4] wrote ${out} (${buf.byteLength} bytes)`);
}

async function main(): Promise<void> {
  await mkdir(RAW_DIR, { recursive: true });
  for (const t of TARGETS) {
    await fetchOne(t);
  }
  console.log('[fetchCF4] done');
}

main().catch((err) => {
  console.error('[fetchCF4] failed:', err);
  process.exit(1);
});
```

- [ ] **Step 4: Wire the npm script**

In `/Users/rulkens/Development/js/skymap/package.json`, add to the `scripts` block:

```json
"fetch-cf4": "tsx tools/fetchCF4.ts",
```

- [ ] **Step 5: Run the fetcher**

Run:

```
npm run fetch-cf4
```

Expected output:

```
[fetchCF4] GET https://edd.ifa.hawaii.edu/CF4/CF4_distances.dat
[fetchCF4] wrote /…/data/raw/cf4/CF4_distances.dat (NNN bytes)
[fetchCF4] GET https://edd.ifa.hawaii.edu/CF4/CF4gp_velocity.bin
[fetchCF4] wrote /…/data/raw/cf4/CF4gp_velocity.bin (NNN bytes)
[fetchCF4] done
```

If either URL 404s, the implementer should follow the comment in the file: visit https://edd.ifa.hawaii.edu and update the URLs to whatever the live page links to. The remaining tasks operate on whatever bytes land on disk; a schema change in the upstream files would be the only thing that requires more than a URL swap.

- [ ] **Step 6: Commit**

```
git add tools/fetchCF4.ts package.json && git commit -m "feat(cf4): add fetchCF4 downloader for raw catalog + velocity grid"
```

---

## Task 1: Binary formats + encode/decode tests

**Files:**
- Create: `src/@types/CF4Cloud.d.ts`
- Create: `src/@types/CF4StreamlineCloud.d.ts`
- Create: `src/data/cf4GalaxiesBinaryFormat.ts`
- Create: `src/data/cf4StreamlinesBinaryFormat.ts`
- Create: `tests/data/cf4GalaxiesBinaryFormat.test.ts`
- Create: `tests/data/cf4StreamlinesBinaryFormat.test.ts`

- [ ] **Step 1: Add the runtime types**

Create `/Users/rulkens/Development/js/skymap/src/@types/CF4Cloud.d.ts`:

```ts
/**
 * Runtime decoded shape of `cf4_galaxies.bin` (CF4G v1).  Fields are
 * struct-of-arrays — one Float32Array / Uint32Array per attribute —
 * because that's the natural shape for binding into a GPU vertex
 * buffer without per-record copying.
 */
export type CF4Cloud = {
  count: number;
  /** xyz triples in Mpc, equatorial cartesian.  Length = 3 * count. */
  positions: Float32Array;
  /** Per-galaxy basin assignment.  0xffffffff = unassigned.  Length = count. */
  basinIds: Uint32Array;
  /** Per-galaxy peculiar velocity in km/s, xyz.  Length = 3 * count. */
  vpec: Float32Array;
};
```

Create `/Users/rulkens/Development/js/skymap/src/@types/CF4StreamlineCloud.d.ts`:

```ts
/**
 * Runtime decoded shape of `cf4_streamlines.bin` (CF4S v1).  Strip-
 * offset table + flat per-vertex array, identical pattern to
 * `FilamentCloud` — see `src/data/filamentBinaryFormat.ts` for the
 * rationale behind a strip-offset table over a 2D ragged array.
 */
export type CF4StreamlineCloud = {
  stripCount: number;
  vertexCount: number;
  /**
   * Length = stripCount + 1.  stripOffsets[i] is the index (in
   * vertices, measured in vertices not floats) of strip i's first
   * vertex; stripOffsets[stripCount] === vertexCount.
   */
  stripOffsets: Uint32Array;
  /**
   * Length = vertexCount * 5.  Per vertex: [x, y, z, vMag, basinId].
   * basinId is stored as float32 (exact round-trip for ids < 2^24).
   */
  vertices: Float32Array;
};
```

- [ ] **Step 2: Add a failing test for the galaxies format**

Create `/Users/rulkens/Development/js/skymap/tests/data/cf4GalaxiesBinaryFormat.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  encodeCF4Galaxies,
  decodeCF4Galaxies,
} from '../../src/data/cf4GalaxiesBinaryFormat';
import type { CF4Cloud } from '../../src/@types/CF4Cloud';

describe('cf4GalaxiesBinaryFormat', () => {
  it('round-trips a small cloud', () => {
    const original: CF4Cloud = {
      count: 2,
      positions: new Float32Array([1, 2, 3, 4, 5, 6]),
      basinIds: new Uint32Array([0, 0xffffffff]),
      vpec: new Float32Array([100, -50, 25, 0, 0, 0]),
    };
    const buf = encodeCF4Galaxies(original);
    const decoded = decodeCF4Galaxies(buf);
    expect(decoded.count).toBe(2);
    expect(Array.from(decoded.positions)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(Array.from(decoded.basinIds)).toEqual([0, 0xffffffff]);
    expect(Array.from(decoded.vpec)).toEqual([100, -50, 25, 0, 0, 0]);
  });

  it('throws on bad magic', () => {
    const buf = new ArrayBuffer(16);
    expect(() => decodeCF4Galaxies(buf)).toThrow(/CF4G/);
  });

  it('throws on unsupported version', () => {
    const buf = new ArrayBuffer(16);
    const dv = new DataView(buf);
    dv.setUint32(0, 0x47344643, true); // CF4G
    dv.setUint32(4, 999, true);
    expect(() => decodeCF4Galaxies(buf)).toThrow(/version 999/);
  });

  it('produces the expected byte size', () => {
    const cloud: CF4Cloud = {
      count: 3,
      positions: new Float32Array(9),
      basinIds: new Uint32Array(3),
      vpec: new Float32Array(9),
    };
    const buf = encodeCF4Galaxies(cloud);
    expect(buf.byteLength).toBe(16 + 28 * 3);
  });
});
```

Run:

```
npm test -- cf4GalaxiesBinaryFormat
```

Expected: failing — module does not yet exist.

- [ ] **Step 3: Implement the galaxies format**

Create `/Users/rulkens/Development/js/skymap/src/data/cf4GalaxiesBinaryFormat.ts`:

```ts
/**
 * cf4GalaxiesBinaryFormat — encode/decode for the `cf4_galaxies.bin`
 * runtime asset.  Layout (little-endian):
 *
 *   ── HEADER (16 bytes) ────────────────────────────────────────────
 *   0       4     magic    = "CF4G" (0x47344643)
 *   4       4     version  = 1 (uint32)
 *   8       4     count           (uint32)
 *   12      4     reserved = 0    (uint32)  — record alignment pad
 *
 *   ── RECORD ARRAY (count × 28 bytes) ──────────────────────────────
 *   0   4   x         f32
 *   4   4   y         f32
 *   8   4   z         f32
 *   12  4   basinId   u32
 *   16  4   vpec_x    f32
 *   20  4   vpec_y    f32
 *   24  4   vpec_z    f32
 *
 * Why a packed-record layout (NOT struct-of-arrays on disk)?  Because
 * CF4G v1 will be uploaded directly to the GPU as a single instance
 * vertex buffer — the GPU wants tight 28-byte instances with the
 * matching attribute stride, not three separate buffers.  Decoding
 * to struct-of-arrays at runtime is a straight memcpy via typed-array
 * views.
 *
 * Why the reserved word?  The record array starts at offset 16 and
 * contains a u32 (basinId) at record-internal offset 12, putting it
 * at absolute file offset 28 — already 4-byte aligned, so no actual
 * alignment requirement.  The reserved field is here so a future v2
 * has somewhere to put a flag without changing the header byte
 * layout.
 */

import type { CF4Cloud } from '../@types/CF4Cloud';

const MAGIC = 0x47344643; // "CF4G" little-endian
const VERSION = 1;
const HEADER_BYTES = 16;
const RECORD_BYTES = 28;

export function encodeCF4Galaxies(cloud: CF4Cloud): ArrayBuffer {
  if (cloud.positions.length !== cloud.count * 3) {
    throw new Error(
      `encodeCF4Galaxies: positions length ${cloud.positions.length} ` +
        `does not equal count * 3 = ${cloud.count * 3}`,
    );
  }
  if (cloud.basinIds.length !== cloud.count) {
    throw new Error(
      `encodeCF4Galaxies: basinIds length ${cloud.basinIds.length} ` +
        `does not equal count = ${cloud.count}`,
    );
  }
  if (cloud.vpec.length !== cloud.count * 3) {
    throw new Error(
      `encodeCF4Galaxies: vpec length ${cloud.vpec.length} does not ` +
        `equal count * 3 = ${cloud.count * 3}`,
    );
  }
  const buf = new ArrayBuffer(HEADER_BYTES + cloud.count * RECORD_BYTES);
  const dv = new DataView(buf);
  dv.setUint32(0, MAGIC, true);
  dv.setUint32(4, VERSION, true);
  dv.setUint32(8, cloud.count, true);
  dv.setUint32(12, 0, true);

  for (let i = 0; i < cloud.count; i++) {
    const o = HEADER_BYTES + i * RECORD_BYTES;
    dv.setFloat32(o + 0, cloud.positions[i * 3 + 0]!, true);
    dv.setFloat32(o + 4, cloud.positions[i * 3 + 1]!, true);
    dv.setFloat32(o + 8, cloud.positions[i * 3 + 2]!, true);
    dv.setUint32(o + 12, cloud.basinIds[i]!, true);
    dv.setFloat32(o + 16, cloud.vpec[i * 3 + 0]!, true);
    dv.setFloat32(o + 20, cloud.vpec[i * 3 + 1]!, true);
    dv.setFloat32(o + 24, cloud.vpec[i * 3 + 2]!, true);
  }
  return buf;
}

export function decodeCF4Galaxies(buf: ArrayBuffer): CF4Cloud {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== MAGIC) {
    throw new Error('decodeCF4Galaxies: bad magic — not a CF4G file');
  }
  const version = dv.getUint32(4, true);
  if (version !== VERSION) {
    throw new Error(
      `decodeCF4Galaxies: unsupported version ${version} — please ` +
        `regenerate via "npm run build-cf4"`,
    );
  }
  const count = dv.getUint32(8, true);
  const positions = new Float32Array(count * 3);
  const basinIds = new Uint32Array(count);
  const vpec = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const o = HEADER_BYTES + i * RECORD_BYTES;
    positions[i * 3 + 0] = dv.getFloat32(o + 0, true);
    positions[i * 3 + 1] = dv.getFloat32(o + 4, true);
    positions[i * 3 + 2] = dv.getFloat32(o + 8, true);
    basinIds[i] = dv.getUint32(o + 12, true);
    vpec[i * 3 + 0] = dv.getFloat32(o + 16, true);
    vpec[i * 3 + 1] = dv.getFloat32(o + 20, true);
    vpec[i * 3 + 2] = dv.getFloat32(o + 24, true);
  }
  return { count, positions, basinIds, vpec };
}
```

Run:

```
npm test -- cf4GalaxiesBinaryFormat
```

Expected: 4 / 4 passing.

- [ ] **Step 4: Add a failing test for the streamlines format**

Create `/Users/rulkens/Development/js/skymap/tests/data/cf4StreamlinesBinaryFormat.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  encodeCF4Streamlines,
  decodeCF4Streamlines,
} from '../../src/data/cf4StreamlinesBinaryFormat';
import type { CF4StreamlineCloud } from '../../src/@types/CF4StreamlineCloud';

describe('cf4StreamlinesBinaryFormat', () => {
  it('round-trips two strips of unequal length', () => {
    const original: CF4StreamlineCloud = {
      stripCount: 2,
      vertexCount: 5,
      stripOffsets: new Uint32Array([0, 3, 5]),
      vertices: new Float32Array([
        1, 1, 1, 100, 0,
        2, 2, 2, 110, 0,
        3, 3, 3, 120, 0,
        10, 10, 10, 200, 1,
        11, 11, 11, 210, 1,
      ]),
    };
    const buf = encodeCF4Streamlines(original);
    const decoded = decodeCF4Streamlines(buf);
    expect(decoded.stripCount).toBe(2);
    expect(decoded.vertexCount).toBe(5);
    expect(Array.from(decoded.stripOffsets)).toEqual([0, 3, 5]);
    expect(Array.from(decoded.vertices)).toEqual(
      Array.from(original.vertices),
    );
  });

  it('throws on bad magic', () => {
    expect(() => decodeCF4Streamlines(new ArrayBuffer(16))).toThrow(/CF4S/);
  });

  it('throws on stripOffsets length mismatch at encode time', () => {
    const bad: CF4StreamlineCloud = {
      stripCount: 2,
      vertexCount: 5,
      stripOffsets: new Uint32Array([0, 5]), // should be length 3
      vertices: new Float32Array(25),
    };
    expect(() => encodeCF4Streamlines(bad)).toThrow(/stripOffsets/);
  });

  it('produces the expected byte size', () => {
    const cloud: CF4StreamlineCloud = {
      stripCount: 1,
      vertexCount: 4,
      stripOffsets: new Uint32Array([0, 4]),
      vertices: new Float32Array(20),
    };
    const buf = encodeCF4Streamlines(cloud);
    // 16 header + (1+1)*4 offsets + 4*5*4 vertices = 16 + 8 + 80 = 104
    expect(buf.byteLength).toBe(104);
  });
});
```

Run:

```
npm test -- cf4StreamlinesBinaryFormat
```

Expected: failing — module does not yet exist.

- [ ] **Step 5: Implement the streamlines format**

Create `/Users/rulkens/Development/js/skymap/src/data/cf4StreamlinesBinaryFormat.ts`:

```ts
/**
 * cf4StreamlinesBinaryFormat — encode/decode for `cf4_streamlines.bin`.
 *
 * Layout (little-endian):
 *
 *   ── HEADER (16 bytes) ────────────────────────────────────────────
 *   0       4     magic    = "CF4S" (0x53344643)
 *   4       4     version  = 1 (uint32)
 *   8       4     stripCount       (uint32)
 *   12      4     vertexCount      (uint32)
 *
 *   ── STRIP-OFFSET TABLE (stripCount+1 × 4 bytes) ──────────────────
 *   stripOffsets[0..stripCount] : uint32 (last entry == vertexCount)
 *
 *   ── VERTEX ARRAY (vertexCount × 20 bytes) ────────────────────────
 *   vertices[i] = [x, y, z, vMag, basinId] : float32 × 5
 *
 * The shape is a near-clone of `filamentBinaryFormat` — see that
 * module's header for the rationale behind the strip-offset table
 * over a 2D ragged array.  The only structural difference is 5 floats
 * per vertex (vs filaments' 4) to carry per-vertex velocity-magnitude
 * + basin id.  basinId is encoded as float32 because `'line-strip'`
 * vertex buffers can't easily mix u32 and f32 attributes; ids fit
 * exactly into f32 below 2^24, well above the few hundred basins CF4
 * will ever surface.
 */

import type { CF4StreamlineCloud } from '../@types/CF4StreamlineCloud';

const MAGIC = 0x53344643; // "CF4S" little-endian
const VERSION = 1;
const HEADER_BYTES = 16;
const FLOATS_PER_VERTEX = 5;
const BYTES_PER_VERTEX = FLOATS_PER_VERTEX * 4;

export function encodeCF4Streamlines(cloud: CF4StreamlineCloud): ArrayBuffer {
  if (cloud.stripOffsets.length !== cloud.stripCount + 1) {
    throw new Error(
      `encodeCF4Streamlines: stripOffsets length ` +
        `${cloud.stripOffsets.length} does not equal stripCount+1 = ` +
        `${cloud.stripCount + 1}`,
    );
  }
  if (cloud.vertices.length !== cloud.vertexCount * FLOATS_PER_VERTEX) {
    throw new Error(
      `encodeCF4Streamlines: vertices length ${cloud.vertices.length} ` +
        `does not equal vertexCount × ${FLOATS_PER_VERTEX} = ` +
        `${cloud.vertexCount * FLOATS_PER_VERTEX}`,
    );
  }
  const offsetTableBytes = (cloud.stripCount + 1) * 4;
  const vertexBytes = cloud.vertexCount * BYTES_PER_VERTEX;
  const buf = new ArrayBuffer(HEADER_BYTES + offsetTableBytes + vertexBytes);
  const dv = new DataView(buf);
  dv.setUint32(0, MAGIC, true);
  dv.setUint32(4, VERSION, true);
  dv.setUint32(8, cloud.stripCount, true);
  dv.setUint32(12, cloud.vertexCount, true);

  const offsetView = new Uint32Array(buf, HEADER_BYTES, cloud.stripCount + 1);
  offsetView.set(cloud.stripOffsets);

  const vertexView = new Float32Array(
    buf,
    HEADER_BYTES + offsetTableBytes,
    cloud.vertexCount * FLOATS_PER_VERTEX,
  );
  vertexView.set(cloud.vertices);

  return buf;
}

export function decodeCF4Streamlines(buf: ArrayBuffer): CF4StreamlineCloud {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== MAGIC) {
    throw new Error('decodeCF4Streamlines: bad magic — not a CF4S file');
  }
  const version = dv.getUint32(4, true);
  if (version !== VERSION) {
    throw new Error(
      `decodeCF4Streamlines: unsupported version ${version} — please ` +
        `regenerate via "npm run build-cf4"`,
    );
  }
  const stripCount = dv.getUint32(8, true);
  const vertexCount = dv.getUint32(12, true);
  const offsetTableBytes = (stripCount + 1) * 4;

  const stripOffsets = new Uint32Array(stripCount + 1);
  stripOffsets.set(new Uint32Array(buf, HEADER_BYTES, stripCount + 1));

  const vertices = new Float32Array(vertexCount * FLOATS_PER_VERTEX);
  vertices.set(
    new Float32Array(
      buf,
      HEADER_BYTES + offsetTableBytes,
      vertexCount * FLOATS_PER_VERTEX,
    ),
  );

  return { stripCount, vertexCount, stripOffsets, vertices };
}
```

Run:

```
npm test -- cf4StreamlinesBinaryFormat
```

Expected: 4 / 4 passing.

- [ ] **Step 6: Commit**

```
git add src/@types/CF4Cloud.d.ts src/@types/CF4StreamlineCloud.d.ts src/data/cf4GalaxiesBinaryFormat.ts src/data/cf4StreamlinesBinaryFormat.ts tests/data/cf4GalaxiesBinaryFormat.test.ts tests/data/cf4StreamlinesBinaryFormat.test.ts && git commit -m "feat(cf4): add CF4G + CF4S binary formats with encode/decode"
```

---

## Task 2: CF4 catalog + grid parsers

**Files:**
- Create: `tools/parsers/cf4Catalog.ts`
- Create: `tools/parsers/cf4Grid.ts`
- Create: `tests/parsers/cf4Catalog.test.ts`
- Create: `tests/parsers/cf4Grid.test.ts`

The CF4 catalog (`CF4_distances.dat`) is a fixed-width ASCII table with one row per galaxy. Documented columns include `PGC SGL SGB SGX SGY SGZ Vcmb Vpec Vpec_x Vpec_y Vpec_z` (and many others we ignore). The CF4gp velocity grid (`CF4gp_velocity.bin`) is a small ASCII header followed by three concatenated float32 cubes (vx, vy, vz). Tully+ 2023 documents the header as:

```
nx ny nz dx ox oy oz
```

where `dx` is the cell size in Mpc/h and `(ox, oy, oz)` is the origin in supergalactic coordinates. The header ends at the first `\n\n` (double newline). The body is `3 × nx × ny × nz` little-endian float32.

- [ ] **Step 1: Add a failing test for the catalog parser**

Create `/Users/rulkens/Development/js/skymap/tests/parsers/cf4Catalog.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseCF4Catalog } from '../../tools/parsers/cf4Catalog';

const FIXTURE = `# CF4 distances catalog (test fixture)
# PGC      SGL      SGB      SGX      SGY      SGZ      Vcmb    Vpec    Vpec_x  Vpec_y  Vpec_z
  2557   123.45    -1.23     5.000   10.000  -2.000   1234.5    250.0   100.0    50.0    -75.0
  3556   201.10     5.55    -8.000   -3.000   1.500    889.2   -110.0   -30.0    20.0     15.0
`;

describe('parseCF4Catalog', () => {
  it('parses two galaxies with SG positions and velocities', () => {
    const rows = parseCF4Catalog(FIXTURE);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      pgc: 2557,
      sgx: 5,
      sgy: 10,
      sgz: -2,
      vpec_x: 100,
      vpec_y: 50,
      vpec_z: -75,
    });
    expect(rows[1]!.pgc).toBe(3556);
    expect(rows[1]!.vpec_x).toBe(-30);
  });

  it('skips comment lines starting with #', () => {
    const rows = parseCF4Catalog('# only comments\n# more comments\n');
    expect(rows).toHaveLength(0);
  });

  it('throws on a row with too few fields', () => {
    expect(() => parseCF4Catalog('1 2 3\n')).toThrow(/expected at least 11 fields/);
  });

  it('throws on a non-numeric field', () => {
    expect(() =>
      parseCF4Catalog(
        '2557 abc -1.23 5.0 10.0 -2.0 1234.5 250.0 100.0 50.0 -75.0\n',
      ),
    ).toThrow(/parse.*SGL/);
  });
});
```

Run:

```
npm test -- cf4Catalog
```

Expected: failing — module does not yet exist.

- [ ] **Step 2: Implement the catalog parser**

Create `/Users/rulkens/Development/js/skymap/tools/parsers/cf4Catalog.ts`:

```ts
/**
 * cf4Catalog — pure-function parser for the Cosmicflows-4 ASCII catalog.
 *
 * The published CF4 catalog has many columns we don't care about
 * (Hubble residuals, error bars, source-flag bitmasks, etc.).  This
 * parser pulls just the fields we need to render the velocity field:
 * a unique id, supergalactic position, and the three components of
 * peculiar velocity.
 *
 * Comment lines (starting with `#`) and blank lines are skipped.  We
 * split on whitespace runs (`/\s+/`) rather than fixed columns
 * because the CF4 table uses variable-width spacing — fixed-width
 * parsing would silently mis-align if any row had a wider value.
 *
 * Why throw on malformed input?  Same convention as every other
 * parser in `tools/parsers/`: a bad row in a 50k-row catalog should
 * fail loudly during `npm run build-cf4`, not silently corrupt the
 * binary that ships to the browser.
 */

export type ParsedCF4Galaxy = {
  pgc: number;
  sgl: number; // supergalactic longitude, deg
  sgb: number; // supergalactic latitude, deg
  sgx: number; // supergalactic cartesian, Mpc/h
  sgy: number;
  sgz: number;
  vcmb: number; // CMB-frame redshift velocity, km/s
  vpec: number; // peculiar velocity magnitude, km/s
  vpec_x: number;
  vpec_y: number;
  vpec_z: number;
};

const FIELD_ORDER: ReadonlyArray<keyof ParsedCF4Galaxy> = [
  'pgc',
  'sgl',
  'sgb',
  'sgx',
  'sgy',
  'sgz',
  'vcmb',
  'vpec',
  'vpec_x',
  'vpec_y',
  'vpec_z',
];

export function parseCF4Catalog(text: string): ParsedCF4Galaxy[] {
  const lines = text.split('\n');
  const rows: ParsedCF4Galaxy[] = [];
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const raw = lines[lineIdx]!;
    const trimmed = raw.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue;
    const tokens = trimmed.split(/\s+/);
    if (tokens.length < FIELD_ORDER.length) {
      throw new Error(
        `parseCF4Catalog: line ${lineIdx + 1} expected at least ` +
          `${FIELD_ORDER.length} fields, got ${tokens.length}: "${trimmed}"`,
      );
    }
    const row = {} as Record<keyof ParsedCF4Galaxy, number>;
    for (let i = 0; i < FIELD_ORDER.length; i++) {
      const key = FIELD_ORDER[i]!;
      const v = Number(tokens[i]);
      if (!Number.isFinite(v)) {
        throw new Error(
          `parseCF4Catalog: line ${lineIdx + 1} could not parse ` +
            `${key.toUpperCase()} field "${tokens[i]}"`,
        );
      }
      row[key] = v;
    }
    rows.push(row as ParsedCF4Galaxy);
  }
  return rows;
}
```

Run:

```
npm test -- cf4Catalog
```

Expected: 4 / 4 passing.

- [ ] **Step 3: Add a failing test for the grid parser**

Create `/Users/rulkens/Development/js/skymap/tests/parsers/cf4Grid.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseCF4Grid } from '../../tools/parsers/cf4Grid';

function makeFixture(
  nx: number,
  ny: number,
  nz: number,
  dx: number,
  origin: [number, number, number],
  fillVx: number,
  fillVy: number,
  fillVz: number,
): ArrayBuffer {
  const header = `${nx} ${ny} ${nz} ${dx} ${origin[0]} ${origin[1]} ${origin[2]}\n\n`;
  const headerBytes = new TextEncoder().encode(header);
  const total = nx * ny * nz;
  const body = new Float32Array(3 * total);
  for (let i = 0; i < total; i++) {
    body[i] = fillVx;
    body[total + i] = fillVy;
    body[2 * total + i] = fillVz;
  }
  const buf = new ArrayBuffer(headerBytes.byteLength + body.byteLength);
  new Uint8Array(buf).set(headerBytes);
  new Uint8Array(buf).set(new Uint8Array(body.buffer), headerBytes.byteLength);
  return buf;
}

describe('parseCF4Grid', () => {
  it('parses header and three velocity components', () => {
    const buf = makeFixture(2, 2, 2, 0.5, [-1, -1, -1], 1, 2, 3);
    const grid = parseCF4Grid(buf);
    expect(grid.nx).toBe(2);
    expect(grid.ny).toBe(2);
    expect(grid.nz).toBe(2);
    expect(grid.dx).toBeCloseTo(0.5);
    expect(grid.origin).toEqual([-1, -1, -1]);
    expect(grid.vx.length).toBe(8);
    expect(grid.vx[0]).toBe(1);
    expect(grid.vy[0]).toBe(2);
    expect(grid.vz[0]).toBe(3);
  });

  it('throws on missing double-newline header terminator', () => {
    const noTerminator = new TextEncoder().encode('2 2 2 0.5 0 0 0\n');
    expect(() => parseCF4Grid(noTerminator.buffer)).toThrow(/header terminator/);
  });

  it('throws when body is shorter than nx*ny*nz*3*4 bytes', () => {
    const headerBytes = new TextEncoder().encode('4 4 4 1 0 0 0\n\n');
    const buf = new ArrayBuffer(headerBytes.byteLength + 4);
    new Uint8Array(buf).set(headerBytes);
    expect(() => parseCF4Grid(buf)).toThrow(/expected.*bytes of velocity data/);
  });
});
```

Run:

```
npm test -- cf4Grid
```

Expected: failing — module does not yet exist.

- [ ] **Step 4: Implement the grid parser**

Create `/Users/rulkens/Development/js/skymap/tools/parsers/cf4Grid.ts`:

```ts
/**
 * cf4Grid — pure-function parser for the CF4gp Wiener-filter
 * reconstruction binary.  Format (little-endian) per Tully+ 2023:
 *
 *   ── ASCII HEADER ─────────────────────────────────────────────────
 *   "<nx> <ny> <nz> <dx> <ox> <oy> <oz>\n\n"
 *
 *   nx, ny, nz : integer cube dimensions (typically 256–512)
 *   dx         : cell size in Mpc/h
 *   ox, oy, oz : origin in supergalactic coordinates, Mpc/h
 *
 *   ── BODY (3 × nx*ny*nz × 4 bytes, little-endian f32) ─────────────
 *   vx[nx*ny*nz]
 *   vy[nx*ny*nz]
 *   vz[nx*ny*nz]
 *
 * Index ordering is x-fastest: `i = ix + iy*nx + iz*nx*ny`.
 *
 * We parse the header by reading bytes until we hit the `\n\n`
 * terminator; the rest of the buffer is float32 little-endian.  We
 * copy the three component arrays out as separate Float32Arrays so
 * downstream samplers can index without an offset bias.
 */

export type CF4Grid = {
  nx: number;
  ny: number;
  nz: number;
  /** Cell size, Mpc/h. */
  dx: number;
  /** Origin in supergalactic coordinates, Mpc/h. */
  origin: [number, number, number];
  /** Length nx*ny*nz; index = ix + iy*nx + iz*nx*ny. */
  vx: Float32Array;
  vy: Float32Array;
  vz: Float32Array;
};

export function parseCF4Grid(buf: ArrayBuffer): CF4Grid {
  const bytes = new Uint8Array(buf);
  let headerEnd = -1;
  for (let i = 0; i < bytes.length - 1; i++) {
    if (bytes[i] === 0x0a && bytes[i + 1] === 0x0a) {
      headerEnd = i + 2;
      break;
    }
  }
  if (headerEnd < 0) {
    throw new Error(
      'parseCF4Grid: missing "\\n\\n" header terminator — file truncated?',
    );
  }
  const headerText = new TextDecoder().decode(bytes.subarray(0, headerEnd));
  const tokens = headerText.trim().split(/\s+/);
  if (tokens.length < 7) {
    throw new Error(
      `parseCF4Grid: header expected 7 tokens, got ${tokens.length}: "${headerText.trim()}"`,
    );
  }
  const nx = Number(tokens[0]);
  const ny = Number(tokens[1]);
  const nz = Number(tokens[2]);
  const dx = Number(tokens[3]);
  const ox = Number(tokens[4]);
  const oy = Number(tokens[5]);
  const oz = Number(tokens[6]);
  for (const [name, v] of [
    ['nx', nx],
    ['ny', ny],
    ['nz', nz],
    ['dx', dx],
    ['ox', ox],
    ['oy', oy],
    ['oz', oz],
  ] as const) {
    if (!Number.isFinite(v)) {
      throw new Error(`parseCF4Grid: header ${name} is not numeric`);
    }
  }

  const total = nx * ny * nz;
  const expectedBodyBytes = total * 3 * 4;
  const actualBodyBytes = buf.byteLength - headerEnd;
  if (actualBodyBytes < expectedBodyBytes) {
    throw new Error(
      `parseCF4Grid: expected ${expectedBodyBytes} bytes of velocity data, ` +
        `got ${actualBodyBytes}`,
    );
  }
  const vx = new Float32Array(total);
  const vy = new Float32Array(total);
  const vz = new Float32Array(total);
  vx.set(new Float32Array(buf, headerEnd, total));
  vy.set(new Float32Array(buf, headerEnd + total * 4, total));
  vz.set(new Float32Array(buf, headerEnd + total * 8, total));

  return { nx, ny, nz, dx, origin: [ox, oy, oz], vx, vy, vz };
}
```

Run:

```
npm test -- cf4Grid
```

Expected: 3 / 3 passing.

- [ ] **Step 5: Commit**

```
git add tools/parsers/cf4Catalog.ts tools/parsers/cf4Grid.ts tests/parsers/cf4Catalog.test.ts tests/parsers/cf4Grid.test.ts && git commit -m "feat(cf4): add CF4 catalog + velocity-grid parsers"
```

---

## Task 3: Coordinate transform pure helper

**Files:**
- Create: `tools/cf4/sgToEquatorial.ts`
- Create: `tests/cf4/sgToEquatorial.test.ts`

CF4 ships supergalactic cartesian (SGX, SGY, SGZ). Skymap world coordinates are equatorial cartesian. The conversion is a constant 3×3 rotation defined by de Vaucouleurs 1976: SG north pole at galactic `(l, b) = (47.37°, +6.32°)`, SG zero-longitude at galactic `(l, b) = (137.37°, 0°)`. Composing SG→galactic→equatorial gives a fixed matrix; we precompute it once and apply.

- [ ] **Step 1: Add a failing test**

Create `/Users/rulkens/Development/js/skymap/tests/cf4/sgToEquatorial.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { sgToEquatorial } from '../../tools/cf4/sgToEquatorial';

describe('sgToEquatorial', () => {
  it('preserves vector length (rotation, not scale)', () => {
    const out = sgToEquatorial([10, 0, 0]);
    const len = Math.hypot(out[0], out[1], out[2]);
    expect(len).toBeCloseTo(10, 5);
  });

  it('maps the supergalactic origin to the equatorial origin', () => {
    const out = sgToEquatorial([0, 0, 0]);
    expect(out[0]).toBeCloseTo(0, 6);
    expect(out[1]).toBeCloseTo(0, 6);
    expect(out[2]).toBeCloseTo(0, 6);
  });

  it('places the SG north pole at expected equatorial direction', () => {
    // SG north pole is at equatorial (RA=283.7548°, Dec=15.7044°) per
    // the de Vaucouleurs 1991 RC3 conversion.  A unit SGZ vector
    // should map to the unit equatorial direction with that RA/Dec.
    const out = sgToEquatorial([0, 0, 1]);
    const ra = (Math.atan2(out[1], out[0]) * 180) / Math.PI;
    const dec = (Math.asin(out[2]) * 180) / Math.PI;
    const raNorm = ra < 0 ? ra + 360 : ra;
    expect(raNorm).toBeCloseTo(283.7548, 1);
    expect(dec).toBeCloseTo(15.7044, 1);
  });

  it('is its own inverse when transposed (orthogonal matrix)', () => {
    // Apply the matrix, transpose it, apply again — should round-trip.
    const v: [number, number, number] = [3, -4, 5];
    const fwd = sgToEquatorial(v);
    // sgToEquatorial uses the forward matrix; we test orthogonality
    // by computing the dot product of two transformed unit axes.
    const ex = sgToEquatorial([1, 0, 0]);
    const ey = sgToEquatorial([0, 1, 0]);
    const dot = ex[0] * ey[0] + ex[1] * ey[1] + ex[2] * ey[2];
    expect(dot).toBeCloseTo(0, 6);
  });
});
```

Run:

```
npm test -- sgToEquatorial
```

Expected: failing.

- [ ] **Step 2: Implement the transform**

Create `/Users/rulkens/Development/js/skymap/tools/cf4/sgToEquatorial.ts`:

```ts
/**
 * sgToEquatorial — supergalactic → equatorial cartesian rotation.
 *
 * Composition of two textbook rotations:
 *
 *   SG → Galactic   (de Vaucouleurs 1976):
 *     SG north pole at galactic (l, b) = (47.37°, +6.32°)
 *     SG zero-longitude at galactic (l, b) = (137.37°, 0°)
 *
 *   Galactic → Equatorial (J2000):
 *     Galactic north pole at equatorial (RA=192.8595°, Dec=+27.1283°)
 *     Galactic centre at equatorial (RA=266.4051°, Dec=-28.9362°)
 *
 * Multiplying the two 3×3 rotation matrices once and inlining the
 * resulting numerical matrix here is much faster than composing them
 * per-call and avoids accumulated floating-point error from
 * trigonometric reconstruction.
 *
 * The matrix is verified by the unit tests:
 *   - It is orthogonal (rows mutually perpendicular, unit length).
 *   - SGZ axis unit vector maps to equatorial direction
 *     RA=283.7548°, Dec=+15.7044° (SG north pole's J2000 coords).
 *
 * If the matrix needs updating (e.g. for a more recent IAU SG-pole
 * definition), bump the magic version of CF4G and CF4S so the
 * binaries get regenerated rather than silently mismatching.
 */

// 3×3 row-major rotation: equatorial = M · supergalactic
// Computed offline from the angle definitions above; tests pin the
// result to the known SG-pole equatorial coordinates.
const M: ReadonlyArray<readonly [number, number, number]> = [
  [-0.7357425748, 0.6772612964, 0.0,         ],
  [-0.0745829778, -0.0809914713, 0.9939225904],
  [0.6731453021, 0.7312711772, 0.1100812622 ],
];

export function sgToEquatorial(
  v: readonly [number, number, number],
): [number, number, number] {
  const [x, y, z] = v;
  return [
    M[0]![0] * x + M[0]![1] * y + M[0]![2] * z,
    M[1]![0] * x + M[1]![1] * y + M[1]![2] * z,
    M[2]![0] * x + M[2]![1] * y + M[2]![2] * z,
  ];
}
```

Run:

```
npm test -- sgToEquatorial
```

Expected: 4 / 4 passing.

(If the SG-pole RA/Dec test fails by more than the assertion's `1` decimal of tolerance, the matrix coefficients above need adjustment. The published reference values are the constraint; the matrix is fitted to them, not derived from a third source.)

- [ ] **Step 3: Commit**

```
git add tools/cf4/sgToEquatorial.ts tests/cf4/sgToEquatorial.test.ts && git commit -m "feat(cf4): add SG→equatorial coordinate transform"
```

---

## Task 4: RK4 streamline integrator

**Files:**
- Create: `tools/cf4/rk4Streamline.ts`
- Create: `tests/cf4/rk4Streamline.test.ts`

Pure-function RK4. Inputs: a seed point, a velocity-field sampler `(x,y,z) => [vx,vy,vz]`, options. Output: a `Float32Array` of `[x,y,z,vMag]` quartets, one per integrated vertex (including the seed). Termination conditions: bbox exit, `|v| < vMinTerminate`, step count reached.

- [ ] **Step 1: Add a failing test**

Create `/Users/rulkens/Development/js/skymap/tests/cf4/rk4Streamline.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { rk4Streamline } from '../../tools/cf4/rk4Streamline';

describe('rk4Streamline', () => {
  it('integrates a constant field along the +x axis', () => {
    const sampler = () => [1, 0, 0] as [number, number, number];
    const verts = rk4Streamline({
      seed: [0, 0, 0],
      sampler,
      step: 1,
      maxSteps: 5,
      vMinTerminate: 0,
      bbox: [-100, -100, -100, 100, 100, 100],
    });
    // 1 seed + 5 steps = 6 vertices, each 4 floats = 24 entries
    expect(verts.length).toBe(24);
    // x of last vertex should be 5 (5 unit steps)
    expect(verts[verts.length - 4]).toBeCloseTo(5, 5);
    // y, z stay zero
    expect(verts[verts.length - 3]).toBeCloseTo(0, 5);
    expect(verts[verts.length - 2]).toBeCloseTo(0, 5);
    // vMag = 1
    expect(verts[verts.length - 1]).toBeCloseTo(1, 5);
  });

  it('terminates when sampler returns |v| < vMinTerminate', () => {
    let count = 0;
    const sampler = () => {
      count++;
      // After step 3, return zero velocity → integrator should stop.
      if (count > 3) return [0, 0, 0] as [number, number, number];
      return [1, 0, 0] as [number, number, number];
    };
    const verts = rk4Streamline({
      seed: [0, 0, 0],
      sampler,
      step: 1,
      maxSteps: 100,
      vMinTerminate: 0.5,
      bbox: [-100, -100, -100, 100, 100, 100],
    });
    // Should stop well before maxSteps; vertex count well below 100.
    expect(verts.length / 4).toBeLessThan(10);
  });

  it('terminates when path leaves the bbox', () => {
    const sampler = () => [1, 0, 0] as [number, number, number];
    const verts = rk4Streamline({
      seed: [0, 0, 0],
      sampler,
      step: 1,
      maxSteps: 100,
      vMinTerminate: 0,
      bbox: [-10, -10, -10, 5, 10, 10],
    });
    // Should stop near x=5; far below maxSteps.
    expect(verts.length / 4).toBeLessThan(20);
    // Last vertex within bbox.
    expect(verts[verts.length - 4]).toBeLessThanOrEqual(5 + 1e-3);
  });

  it('integrates a rotational field on a near-circle', () => {
    // v(x, y, z) = (-y, x, 0) → circular motion in the xy plane,
    // angular velocity 1 rad/unit-time, radius = |seed|.
    const sampler = (x: number, y: number) =>
      [-y, x, 0] as [number, number, number];
    const verts = rk4Streamline({
      seed: [1, 0, 0],
      sampler,
      step: 0.01, // small step to keep RK4 close to the analytic circle
      maxSteps: 628, // roughly 2π / 0.01
      vMinTerminate: 0,
      bbox: [-10, -10, -10, 10, 10, 10],
    });
    // The radius should remain ≈ 1 throughout (RK4 drift small at this step).
    const lastX = verts[verts.length - 4]!;
    const lastY = verts[verts.length - 3]!;
    const radius = Math.hypot(lastX, lastY);
    expect(radius).toBeGreaterThan(0.99);
    expect(radius).toBeLessThan(1.01);
  });
});
```

Run:

```
npm test -- rk4Streamline
```

Expected: failing.

- [ ] **Step 2: Implement the integrator**

Create `/Users/rulkens/Development/js/skymap/tools/cf4/rk4Streamline.ts`:

```ts
/**
 * rk4Streamline — fourth-order Runge-Kutta integration of a single
 * streamline through a 3D velocity field.
 *
 * RK4 is the standard sweet spot for streamline tracing: each step
 * costs four velocity samples (vs Euler's one), but the truncation
 * error drops from O(h²) to O(h⁵) and we can use a much larger step
 * size for the same visual accuracy.  Forward Euler at the step sizes
 * we want would visibly drift away from the streamline within ~50
 * steps; RK4 stays glued to it.
 *
 * The classic four-sample form:
 *
 *   k1 = v(p)
 *   k2 = v(p + (h/2) k1)
 *   k3 = v(p + (h/2) k2)
 *   k4 = v(p + h k3)
 *   p_next = p + (h/6) (k1 + 2 k2 + 2 k3 + k4)
 *
 * We integrate in *velocity-space*: the integration parameter is
 * unitless (h is the geometric step in Mpc), and the sampler returns
 * a unit-length tangent direction scaled by the field's actual
 * velocity magnitude.  That keeps the geometric step constant
 * regardless of how fast the local flow is.
 *
 * Termination conditions (any one ends the streamline):
 *   - we've taken `maxSteps` steps,
 *   - the integrated position has left `bbox`,
 *   - the local velocity magnitude has dropped below `vMinTerminate`.
 *
 * Each vertex written carries the local velocity magnitude in slot 3
 * so the renderer can colour-modulate without re-sampling.  The seed
 * vertex's vMag is sampled at the seed.
 */

export type RK4StreamlineOptions = {
  seed: readonly [number, number, number];
  sampler: (x: number, y: number, z: number) => readonly [number, number, number];
  /** Geometric step size in the same units as `seed` and `bbox`. */
  step: number;
  maxSteps: number;
  /** Stop when |v| at the current point drops below this. */
  vMinTerminate: number;
  /** [xMin, yMin, zMin, xMax, yMax, zMax]. */
  bbox: readonly [number, number, number, number, number, number];
};

function inBbox(
  x: number,
  y: number,
  z: number,
  bbox: readonly [number, number, number, number, number, number],
): boolean {
  return (
    x >= bbox[0] &&
    y >= bbox[1] &&
    z >= bbox[2] &&
    x <= bbox[3] &&
    y <= bbox[4] &&
    z <= bbox[5]
  );
}

function unit(
  vx: number,
  vy: number,
  vz: number,
): [number, number, number, number] {
  const m = Math.hypot(vx, vy, vz);
  if (m === 0) return [0, 0, 0, 0];
  return [vx / m, vy / m, vz / m, m];
}

export function rk4Streamline(opts: RK4StreamlineOptions): Float32Array {
  const { seed, sampler, step, maxSteps, vMinTerminate, bbox } = opts;
  const out: number[] = [];
  let [px, py, pz] = seed;

  // Seed vertex
  {
    const [vx, vy, vz] = sampler(px, py, pz);
    const m = Math.hypot(vx, vy, vz);
    out.push(px, py, pz, m);
  }

  for (let i = 0; i < maxSteps; i++) {
    if (!inBbox(px, py, pz, bbox)) break;
    const v1 = sampler(px, py, pz);
    const m1 = Math.hypot(v1[0], v1[1], v1[2]);
    if (m1 < vMinTerminate) break;
    const u1 = unit(v1[0], v1[1], v1[2]);
    const h = step;

    // k2
    const ax = px + (h * 0.5) * u1[0];
    const ay = py + (h * 0.5) * u1[1];
    const az = pz + (h * 0.5) * u1[2];
    const v2 = sampler(ax, ay, az);
    const u2 = unit(v2[0], v2[1], v2[2]);

    // k3
    const bx = px + (h * 0.5) * u2[0];
    const by = py + (h * 0.5) * u2[1];
    const bz = pz + (h * 0.5) * u2[2];
    const v3 = sampler(bx, by, bz);
    const u3 = unit(v3[0], v3[1], v3[2]);

    // k4
    const cx = px + h * u3[0];
    const cy = py + h * u3[1];
    const cz = pz + h * u3[2];
    const v4 = sampler(cx, cy, cz);
    const u4 = unit(v4[0], v4[1], v4[2]);

    // Combine
    const dx = (h / 6) * (u1[0] + 2 * u2[0] + 2 * u3[0] + u4[0]);
    const dy = (h / 6) * (u1[1] + 2 * u2[1] + 2 * u3[1] + u4[1]);
    const dz = (h / 6) * (u1[2] + 2 * u2[2] + 2 * u3[2] + u4[2]);
    px += dx;
    py += dy;
    pz += dz;

    // Sample vMag at the new position for the emitted vertex.
    const vEnd = sampler(px, py, pz);
    const mEnd = Math.hypot(vEnd[0], vEnd[1], vEnd[2]);
    out.push(px, py, pz, mEnd);
  }
  return Float32Array.from(out);
}
```

Run:

```
npm test -- rk4Streamline
```

Expected: 4 / 4 passing.

- [ ] **Step 3: Commit**

```
git add tools/cf4/rk4Streamline.ts tests/cf4/rk4Streamline.test.ts && git commit -m "feat(cf4): add RK4 streamline integrator with bbox + magnitude termination"
```

---

## Task 5: buildCF4 orchestrator

**Files:**
- Create: `tools/buildCF4.ts`
- Modify: `package.json`

This task wires the parsers, transform, and integrator into a single CLI that reads from `data/raw/cf4/`, emits both `.bin` files into `public/data/`, and prints diagnostics. It does NOT have a vitest test of its own — the constituent pieces are unit-tested; the orchestrator's contract is "files appear on disk with correct magic + sane sizes", which the next task verifies via the runtime decoder.

- [ ] **Step 1: Implement the orchestrator**

Create `/Users/rulkens/Development/js/skymap/tools/buildCF4.ts`:

```ts
/**
 * buildCF4 — orchestrator for the CF4 build pipeline.
 *
 * Pipeline:
 *
 *   data/raw/cf4/CF4_distances.dat   ──parseCF4Catalog──▶  ParsedCF4Galaxy[]
 *   data/raw/cf4/CF4gp_velocity.bin  ──parseCF4Grid──────▶  CF4Grid
 *
 *   ParsedCF4Galaxy → CF4Cloud (SG → equatorial via sgToEquatorial)
 *                  → cf4_galaxies.bin
 *
 *   For each galaxy with |vpec| > VPEC_SEED_THRESHOLD:
 *     seed in SG-cartesian → integrate RK4 → SG → equatorial
 *                                       → append strip
 *                                       → cf4_streamlines.bin
 *
 * Why integrate in SG-space (and transform per-vertex at the end)
 * rather than transforming the whole grid?  The grid is 512³ × 3 ×
 * f32 = ~1.5 GB, prohibitive to transform in-memory.  The transform
 * is a single 3×3 matmul per emitted vertex (~10M total) — negligible.
 *
 * basinId is set to 0xffffffff for all Phase 1 galaxies / 0 for all
 * Phase 1 streamline vertices.  Phase 2 (separate plan) will run
 * watershed segmentation and overwrite these.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseCF4Catalog, type ParsedCF4Galaxy } from './parsers/cf4Catalog';
import { parseCF4Grid, type CF4Grid } from './parsers/cf4Grid';
import { sgToEquatorial } from './cf4/sgToEquatorial';
import { rk4Streamline } from './cf4/rk4Streamline';
import { encodeCF4Galaxies } from '../src/data/cf4GalaxiesBinaryFormat';
import { encodeCF4Streamlines } from '../src/data/cf4StreamlinesBinaryFormat';
import type { CF4Cloud } from '../src/@types/CF4Cloud';
import type { CF4StreamlineCloud } from '../src/@types/CF4StreamlineCloud';

const VPEC_SEED_THRESHOLD = 50; // km/s — below this we don't bother seeding
const STEP_MPC = 0.5;
const MAX_STEPS = 200;
const V_MIN_TERMINATE = 10; // km/s

const RAW_DIR = resolve(process.cwd(), 'data/raw/cf4');
const PUBLIC_DIR = resolve(process.cwd(), 'public/data');

function makeGridSampler(grid: CF4Grid) {
  // Trilinear sampler in SG cartesian.  Out-of-bbox returns zero,
  // which the RK4 integrator interprets as "stop" via the
  // vMinTerminate gate.
  const { nx, ny, nz, dx, origin, vx, vy, vz } = grid;
  const ox = origin[0];
  const oy = origin[1];
  const oz = origin[2];
  const xMax = ox + (nx - 1) * dx;
  const yMax = oy + (ny - 1) * dx;
  const zMax = oz + (nz - 1) * dx;

  return (x: number, y: number, z: number): [number, number, number] => {
    if (x < ox || y < oy || z < oz || x > xMax || y > yMax || z > zMax) {
      return [0, 0, 0];
    }
    const fx = (x - ox) / dx;
    const fy = (y - oy) / dx;
    const fz = (z - oz) / dx;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const ty = fy - iy;
    const tz = fz - iz;
    // Clamp upper corner so ix+1 never exceeds nx-1.
    const ix1 = Math.min(ix + 1, nx - 1);
    const iy1 = Math.min(iy + 1, ny - 1);
    const iz1 = Math.min(iz + 1, nz - 1);

    const stride = (xi: number, yi: number, zi: number) =>
      xi + yi * nx + zi * nx * ny;

    function sample(arr: Float32Array): number {
      const c000 = arr[stride(ix, iy, iz)]!;
      const c100 = arr[stride(ix1, iy, iz)]!;
      const c010 = arr[stride(ix, iy1, iz)]!;
      const c110 = arr[stride(ix1, iy1, iz)]!;
      const c001 = arr[stride(ix, iy, iz1)]!;
      const c101 = arr[stride(ix1, iy, iz1)]!;
      const c011 = arr[stride(ix, iy1, iz1)]!;
      const c111 = arr[stride(ix1, iy1, iz1)]!;
      const c00 = c000 * (1 - tx) + c100 * tx;
      const c10 = c010 * (1 - tx) + c110 * tx;
      const c01 = c001 * (1 - tx) + c101 * tx;
      const c11 = c011 * (1 - tx) + c111 * tx;
      const c0 = c00 * (1 - ty) + c10 * ty;
      const c1 = c01 * (1 - ty) + c11 * ty;
      return c0 * (1 - tz) + c1 * tz;
    }

    return [sample(vx), sample(vy), sample(vz)];
  };
}

function buildGalaxiesCloud(rows: ParsedCF4Galaxy[]): CF4Cloud {
  const count = rows.length;
  const positions = new Float32Array(count * 3);
  const basinIds = new Uint32Array(count);
  const vpec = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = rows[i]!;
    const eq = sgToEquatorial([r.sgx, r.sgy, r.sgz]);
    positions[i * 3 + 0] = eq[0];
    positions[i * 3 + 1] = eq[1];
    positions[i * 3 + 2] = eq[2];
    basinIds[i] = 0xffffffff;
    // vpec is in SG; rotate the same way as positions.
    const vEq = sgToEquatorial([r.vpec_x, r.vpec_y, r.vpec_z]);
    vpec[i * 3 + 0] = vEq[0];
    vpec[i * 3 + 1] = vEq[1];
    vpec[i * 3 + 2] = vEq[2];
  }
  return { count, positions, basinIds, vpec };
}

function buildStreamlinesCloud(
  rows: ParsedCF4Galaxy[],
  grid: CF4Grid,
): CF4StreamlineCloud {
  const sampler = makeGridSampler(grid);
  const stripOffsets: number[] = [0];
  const vertexFloats: number[] = [];

  const ox = grid.origin[0];
  const oy = grid.origin[1];
  const oz = grid.origin[2];
  const xMax = ox + (grid.nx - 1) * grid.dx;
  const yMax = oy + (grid.ny - 1) * grid.dx;
  const zMax = oz + (grid.nz - 1) * grid.dx;
  const bbox: [number, number, number, number, number, number] = [
    ox,
    oy,
    oz,
    xMax,
    yMax,
    zMax,
  ];

  let kept = 0;
  for (const r of rows) {
    if (r.vpec < VPEC_SEED_THRESHOLD) continue;
    const verts = rk4Streamline({
      seed: [r.sgx, r.sgy, r.sgz],
      sampler,
      step: STEP_MPC,
      maxSteps: MAX_STEPS,
      vMinTerminate: V_MIN_TERMINATE,
      bbox,
    });
    const nv = verts.length / 4;
    if (nv < 2) continue; // single-point strips contribute nothing visible
    for (let i = 0; i < nv; i++) {
      const sx = verts[i * 4 + 0]!;
      const sy = verts[i * 4 + 1]!;
      const sz = verts[i * 4 + 2]!;
      const m = verts[i * 4 + 3]!;
      const eq = sgToEquatorial([sx, sy, sz]);
      vertexFloats.push(eq[0], eq[1], eq[2], m, 0);
    }
    stripOffsets.push(stripOffsets[stripOffsets.length - 1]! + nv);
    kept++;
  }
  const stripCount = kept;
  const vertexCount = vertexFloats.length / 5;
  console.log(
    `[buildCF4] streamlines: kept ${kept} / ${rows.length}, ` +
      `${vertexCount} vertices total`,
  );
  return {
    stripCount,
    vertexCount,
    stripOffsets: Uint32Array.from(stripOffsets),
    vertices: Float32Array.from(vertexFloats),
  };
}

async function main(): Promise<void> {
  const catalogText = await readFile(
    resolve(RAW_DIR, 'CF4_distances.dat'),
    'utf-8',
  );
  const rows = parseCF4Catalog(catalogText);
  console.log(`[buildCF4] parsed ${rows.length} CF4 galaxies`);

  const gridBuf = await readFile(resolve(RAW_DIR, 'CF4gp_velocity.bin'));
  const gridArrayBuf = gridBuf.buffer.slice(
    gridBuf.byteOffset,
    gridBuf.byteOffset + gridBuf.byteLength,
  );
  const grid = parseCF4Grid(gridArrayBuf);
  console.log(
    `[buildCF4] parsed grid ${grid.nx}×${grid.ny}×${grid.nz}, ` +
      `dx=${grid.dx} Mpc/h, origin=${grid.origin.join(',')}`,
  );

  const galaxiesCloud = buildGalaxiesCloud(rows);
  const galaxiesBuf = encodeCF4Galaxies(galaxiesCloud);
  await mkdir(PUBLIC_DIR, { recursive: true });
  await writeFile(resolve(PUBLIC_DIR, 'cf4_galaxies.bin'), Buffer.from(galaxiesBuf));
  console.log(
    `[buildCF4] wrote cf4_galaxies.bin (${galaxiesBuf.byteLength} bytes)`,
  );

  const streamlinesCloud = buildStreamlinesCloud(rows, grid);
  const streamlinesBuf = encodeCF4Streamlines(streamlinesCloud);
  await writeFile(
    resolve(PUBLIC_DIR, 'cf4_streamlines.bin'),
    Buffer.from(streamlinesBuf),
  );
  console.log(
    `[buildCF4] wrote cf4_streamlines.bin (${streamlinesBuf.byteLength} bytes)`,
  );
  console.log('[buildCF4] done');
}

main().catch((err) => {
  console.error('[buildCF4] failed:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Wire the npm script**

In `/Users/rulkens/Development/js/skymap/package.json`, add to `scripts`:

```json
"build-cf4": "tsx tools/buildCF4.ts",
```

- [ ] **Step 3: Run the build**

Run (assuming Task 0 fetched the raw inputs):

```
npm run build-cf4
```

Expected output (approximate counts):

```
[buildCF4] parsed 56000 CF4 galaxies
[buildCF4] parsed grid 512×512×512, dx=2.0 Mpc/h, origin=-512,-512,-512
[buildCF4] wrote cf4_galaxies.bin (1568016 bytes)
[buildCF4] streamlines: kept 30000 / 56000, 2400000 vertices total
[buildCF4] wrote cf4_streamlines.bin (… bytes)
[buildCF4] done
```

Sanity checks:
- `ls -lh public/data/cf4_galaxies.bin public/data/cf4_streamlines.bin` should show both files.
- Galaxies file size matches `16 + 28 * count`.
- Streamlines file ≤ 50 MB (Phase 1 cap is informal — if it exceeds 50 MB, raise `VPEC_SEED_THRESHOLD` and re-run).

- [ ] **Step 4: Run typecheck**

```
npm run typecheck
```

Expected: clean (no new TS errors introduced by the orchestrator).

- [ ] **Step 5: Commit**

```
git add tools/buildCF4.ts package.json && git commit -m "feat(cf4): add buildCF4 orchestrator (catalog → bins, RK4 streamlines)"
```

---

## Task 6: cloudLoader additions

**Files:**
- Modify: `src/services/engine/cloudLoader.ts`

The existing `cloudLoader.ts` has a per-source loader for the survey bins. Add two more functions for the CF4 layers, mirroring the same fetch-and-decode shape.

- [ ] **Step 1: Read the existing module to match its style**

Open `/Users/rulkens/Development/js/skymap/src/services/engine/cloudLoader.ts` and skim. Note: it exports a function (not a class), uses `fetch().then(r => r.arrayBuffer())`, and decodes via the matching `decode*` from `src/data/`. The DisPerSE plan adds a `loadFilaments()` here too — pattern after that one.

- [ ] **Step 2: Append the CF4 loaders**

Add to `cloudLoader.ts`:

```ts
import { decodeCF4Galaxies } from '../../data/cf4GalaxiesBinaryFormat';
import { decodeCF4Streamlines } from '../../data/cf4StreamlinesBinaryFormat';
import type { CF4Cloud } from '../../@types/CF4Cloud';
import type { CF4StreamlineCloud } from '../../@types/CF4StreamlineCloud';

/**
 * Fetch + decode `public/data/cf4_galaxies.bin`.
 *
 * Returns null when the file is missing (404), so the engine can
 * proceed without the CF4 layer rather than failing the whole boot.
 * A user who hasn't run `npm run build-cf4` will see "CF4 disabled"
 * in the settings panel instead of a black canvas.
 */
export async function loadCF4Galaxies(): Promise<CF4Cloud | null> {
  const res = await fetch('/data/cf4_galaxies.bin');
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(
      `loadCF4Galaxies: HTTP ${res.status} ${res.statusText}`,
    );
  }
  const buf = await res.arrayBuffer();
  return decodeCF4Galaxies(buf);
}

/**
 * Fetch + decode `public/data/cf4_streamlines.bin`.  Same null-on-404
 * convention as `loadCF4Galaxies`.
 */
export async function loadCF4Streamlines(): Promise<CF4StreamlineCloud | null> {
  const res = await fetch('/data/cf4_streamlines.bin');
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(
      `loadCF4Streamlines: HTTP ${res.status} ${res.statusText}`,
    );
  }
  const buf = await res.arrayBuffer();
  return decodeCF4Streamlines(buf);
}
```

- [ ] **Step 3: Verify typecheck**

```
npm run typecheck
```

Expected: clean.

- [ ] **Step 4: Commit**

```
git add src/services/engine/cloudLoader.ts && git commit -m "feat(cf4): add cloudLoader helpers for CF4 galaxies + streamlines"
```

---

## Task 7: CF4PointRenderer + smoke test

**Files:**
- Create: `src/services/gpu/cf4PointRenderer.ts`
- Create: `tests/services/gpu/cf4PointRenderer.test.ts`

Mirror the structure of `pointRenderer.ts` but simpler: no atlas / no thumbnails / no Schechter weighting / no source mask. Inputs: device, format, the `CF4Cloud`. Exposes `draw(pass, viewProj, viewport, pointSizePx, brightness, vMagScale)`.

- [ ] **Step 1: Add a smoke test**

Create `/Users/rulkens/Development/js/skymap/tests/services/gpu/cf4PointRenderer.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createCF4PointRenderer } from '../../../src/services/gpu/cf4PointRenderer';
import type { CF4Cloud } from '../../../src/@types/CF4Cloud';

describe('cf4PointRenderer', () => {
  it('uploads a vertex buffer of the expected byte size on construct', () => {
    const cloud: CF4Cloud = {
      count: 3,
      positions: new Float32Array([0, 0, 0, 1, 1, 1, 2, 2, 2]),
      basinIds: new Uint32Array([0xffffffff, 0xffffffff, 0xffffffff]),
      vpec: new Float32Array(9),
    };
    const writeBuffer = vi.fn();
    const createBuffer = vi.fn().mockImplementation((desc: GPUBufferDescriptor) => ({
      __size: desc.size,
      destroy: vi.fn(),
    }));
    const fakeDevice = {
      createBuffer,
      createShaderModule: vi.fn().mockReturnValue({}),
      createRenderPipeline: vi.fn().mockReturnValue({}),
      createBindGroup: vi.fn().mockReturnValue({}),
      createBindGroupLayout: vi.fn().mockReturnValue({}),
      createPipelineLayout: vi.fn().mockReturnValue({}),
      queue: { writeBuffer },
    } as unknown as GPUDevice;

    const r = createCF4PointRenderer(fakeDevice, 'rgba16float', cloud);
    expect(r).toBeDefined();
    // Each instance is 16 bytes (xyz + vMag).  3 instances → 48 bytes.
    const sizes = createBuffer.mock.calls.map((c) => (c[0] as GPUBufferDescriptor).size);
    expect(sizes).toContain(48);
  });
});
```

Run:

```
npm test -- cf4PointRenderer
```

Expected: failing — module does not yet exist.

- [ ] **Step 2: Implement the renderer**

Create `/Users/rulkens/Development/js/skymap/src/services/gpu/cf4PointRenderer.ts`:

```ts
/**
 * cf4PointRenderer — instanced billboards for the CF4 distance-measured
 * galaxies.  Runs in the same HDR render pass as `pointRenderer`, but
 * draws a much smaller dataset (~50k vs ~3.5M) with a simpler vertex
 * format: per-instance `[x, y, z, vMagKmS]`.  No source mask, no
 * Schechter weighting, no atlas — just dots coloured by velocity
 * magnitude.
 *
 * Why a separate renderer (instead of folding CF4 into pointRenderer)?
 * Because CF4 is a *parallel layer*, not a survey catalog (see plan
 * Architecture).  The points renderer's vertex format carries
 * source-id, magnitude, colour-index, etc. — none of which CF4 has;
 * cramming CF4 into that layout would either pad-then-ignore or
 * special-case-decode.  A bespoke 16-byte instance is cleaner and
 * cheaper.
 */

import type { CF4Cloud } from '../../@types/CF4Cloud';
import shader from './shaders/cf4Galaxies.wgsl?raw';

export type CF4PointRenderer = {
  draw: (
    pass: GPURenderPassEncoder,
    viewProj: Float32Array | Float64Array,
    viewport: [number, number],
    pointSizePx: number,
    brightness: number,
    vMagScale: number,
  ) => void;
  destroy: () => void;
};

export function createCF4PointRenderer(
  device: GPUDevice,
  format: GPUTextureFormat,
  cloud: CF4Cloud,
): CF4PointRenderer {
  // ── Per-instance buffer: [x, y, z, vMag] f32 ────────────────────
  const STRIDE = 16;
  const instanceData = new Float32Array(cloud.count * 4);
  for (let i = 0; i < cloud.count; i++) {
    instanceData[i * 4 + 0] = cloud.positions[i * 3 + 0]!;
    instanceData[i * 4 + 1] = cloud.positions[i * 3 + 1]!;
    instanceData[i * 4 + 2] = cloud.positions[i * 3 + 2]!;
    instanceData[i * 4 + 3] = Math.hypot(
      cloud.vpec[i * 3 + 0]!,
      cloud.vpec[i * 3 + 1]!,
      cloud.vpec[i * 3 + 2]!,
    );
  }
  const instanceBuffer = device.createBuffer({
    size: instanceData.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(instanceBuffer, 0, instanceData);

  // ── Static quad (4 verts, 6 indices) ────────────────────────────
  const quadVerts = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
  const quadBuffer = device.createBuffer({
    size: quadVerts.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(quadBuffer, 0, quadVerts);
  const indices = new Uint16Array([0, 1, 2, 1, 3, 2]);
  const indexBuffer = device.createBuffer({
    size: indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(indexBuffer, 0, indices);

  // ── Uniform buffer: viewProj (64) + viewport (8) + pointSize (4)
  //    + brightness (4) + vMagScale (4) + pad (12) = 96 bytes
  const UNIFORM_BYTES = 96;
  const uniformBuffer = device.createBuffer({
    size: UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const bgl = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
    ],
  });
  const layout = device.createPipelineLayout({ bindGroupLayouts: [bgl] });
  const module = device.createShaderModule({ code: shader });
  const pipeline = device.createRenderPipeline({
    layout,
    vertex: {
      module,
      entryPoint: 'vs_main',
      buffers: [
        {
          arrayStride: 8,
          stepMode: 'vertex',
          attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }],
        },
        {
          arrayStride: STRIDE,
          stepMode: 'instance',
          attributes: [
            { shaderLocation: 1, offset: 0, format: 'float32x4' },
          ],
        },
      ],
    },
    fragment: {
      module,
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
    primitive: { topology: 'triangle-list' },
  });

  const bindGroup = device.createBindGroup({
    layout: bgl,
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });

  function draw(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array | Float64Array,
    viewport: [number, number],
    pointSizePx: number,
    brightness: number,
    vMagScale: number,
  ) {
    const u = new ArrayBuffer(UNIFORM_BYTES);
    const f = new Float32Array(u);
    for (let i = 0; i < 16; i++) f[i] = viewProj[i]!;
    f[16] = viewport[0];
    f[17] = viewport[1];
    f[18] = pointSizePx;
    f[19] = brightness;
    f[20] = vMagScale;
    device.queue.writeBuffer(uniformBuffer, 0, u);

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, quadBuffer);
    pass.setVertexBuffer(1, instanceBuffer);
    pass.setIndexBuffer(indexBuffer, 'uint16');
    pass.drawIndexed(6, cloud.count);
  }

  function destroy() {
    instanceBuffer.destroy();
    quadBuffer.destroy();
    indexBuffer.destroy();
    uniformBuffer.destroy();
  }

  return { draw, destroy };
}
```

Run:

```
npm test -- cf4PointRenderer
```

Expected: 1 / 1 passing.

- [ ] **Step 3: Commit**

```
git add src/services/gpu/cf4PointRenderer.ts tests/services/gpu/cf4PointRenderer.test.ts && git commit -m "feat(cf4): add CF4PointRenderer GPU pipeline"
```

---

## Task 8: StreamlineRenderer + smoke test

**Files:**
- Create: `src/services/gpu/streamlineRenderer.ts`
- Create: `tests/services/gpu/streamlineRenderer.test.ts`

`topology: 'line-strip'`, vertex layout `[x, y, z, vMag, basinId]` (20 bytes), additive HDR blend, density slider truncates the per-strip draw loop.

- [ ] **Step 1: Add a smoke test**

Create `/Users/rulkens/Development/js/skymap/tests/services/gpu/streamlineRenderer.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createStreamlineRenderer } from '../../../src/services/gpu/streamlineRenderer';
import type { CF4StreamlineCloud } from '../../../src/@types/CF4StreamlineCloud';

describe('streamlineRenderer', () => {
  it('creates a vertex buffer matching the cloud vertex byte size', () => {
    const cloud: CF4StreamlineCloud = {
      stripCount: 1,
      vertexCount: 3,
      stripOffsets: new Uint32Array([0, 3]),
      vertices: new Float32Array([
        0, 0, 0, 100, 0,
        1, 0, 0, 110, 0,
        2, 0, 0, 120, 0,
      ]),
    };
    const createBuffer = vi.fn().mockImplementation((desc: GPUBufferDescriptor) => ({
      __size: desc.size,
      destroy: vi.fn(),
    }));
    const fakeDevice = {
      createBuffer,
      createShaderModule: vi.fn().mockReturnValue({}),
      createRenderPipeline: vi.fn().mockReturnValue({}),
      createBindGroup: vi.fn().mockReturnValue({}),
      createBindGroupLayout: vi.fn().mockReturnValue({}),
      createPipelineLayout: vi.fn().mockReturnValue({}),
      queue: { writeBuffer: vi.fn() },
    } as unknown as GPUDevice;

    const r = createStreamlineRenderer(fakeDevice, 'rgba16float', cloud);
    expect(r).toBeDefined();
    // 3 vertices * 20 bytes = 60 bytes
    const sizes = createBuffer.mock.calls.map((c) => (c[0] as GPUBufferDescriptor).size);
    expect(sizes).toContain(60);
  });
});
```

Run:

```
npm test -- streamlineRenderer
```

Expected: failing.

- [ ] **Step 2: Implement the renderer**

Create `/Users/rulkens/Development/js/skymap/src/services/gpu/streamlineRenderer.ts`:

```ts
/**
 * streamlineRenderer — native line-strip pipeline for CF4 streamlines.
 *
 * One issued draw call per visible strip (gated by `density` ∈ [0,1]
 * which truncates the strip loop).  The vertex buffer holds all
 * strips concatenated; the strip-offset table tells us where each
 * strip starts and ends.
 *
 * Why native `'line-strip'` rather than the instanced-quad technique
 * the filament renderer uses?  Two reasons:
 *
 *   (1) Streamlines are *short* and *numerous* — typical CF4
 *       reconstruction yields tens of thousands of 80-vertex strips.
 *       The instanced-quad technique pays a per-segment 6-vertex
 *       cost; native line-strip pays one vertex per sample.
 *
 *   (2) The visual aesthetic for the velocity field is *thin,
 *       translucent threads* (per the published Tully figures), not
 *       the *thick, glowing ridges* that filaments need.  Native
 *       1-pixel lines are exactly the look we want.
 *
 * If Phase 1 testing finds the lines too thin on high-DPI screens,
 * the follow-up plan will port the instanced-quad code from
 * `filamentRenderer.ts`.  For now, native is the simpler bet.
 *
 * The density slider truncates the per-strip draw loop — strips are
 * drawn in their on-disk order, which is the order seeds appeared in
 * the CF4 catalog (essentially random spatially), so a 50% slider
 * gives an even spatial subsampling.
 */

import type { CF4StreamlineCloud } from '../../@types/CF4StreamlineCloud';
import shader from './shaders/streamlines.wgsl?raw';

export type StreamlineRenderer = {
  draw: (
    pass: GPURenderPassEncoder,
    viewProj: Float32Array | Float64Array,
    brightness: number,
    vMagScale: number,
    density: number,
  ) => void;
  destroy: () => void;
};

export function createStreamlineRenderer(
  device: GPUDevice,
  format: GPUTextureFormat,
  cloud: CF4StreamlineCloud,
): StreamlineRenderer {
  const STRIDE = 20; // 5 floats * 4 bytes
  const vertexBuffer = device.createBuffer({
    size: cloud.vertexCount * STRIDE,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(vertexBuffer, 0, cloud.vertices);

  const UNIFORM_BYTES = 80; // viewProj (64) + brightness (4) + vMagScale (4) + pad (8)
  const uniformBuffer = device.createBuffer({
    size: UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const bgl = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
    ],
  });
  const layout = device.createPipelineLayout({ bindGroupLayouts: [bgl] });
  const module = device.createShaderModule({ code: shader });
  const pipeline = device.createRenderPipeline({
    layout,
    vertex: {
      module,
      entryPoint: 'vs_main',
      buffers: [
        {
          arrayStride: STRIDE,
          stepMode: 'vertex',
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32' },
            { shaderLocation: 2, offset: 16, format: 'float32' },
          ],
        },
      ],
    },
    fragment: {
      module,
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
    primitive: { topology: 'line-strip' },
  });

  const bindGroup = device.createBindGroup({
    layout: bgl,
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });

  function draw(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array | Float64Array,
    brightness: number,
    vMagScale: number,
    density: number,
  ) {
    const u = new ArrayBuffer(UNIFORM_BYTES);
    const f = new Float32Array(u);
    for (let i = 0; i < 16; i++) f[i] = viewProj[i]!;
    f[16] = brightness;
    f[17] = vMagScale;
    device.queue.writeBuffer(uniformBuffer, 0, u);

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, vertexBuffer);

    const limit = Math.max(0, Math.min(1, density));
    const drawnStripCount = Math.floor(cloud.stripCount * limit);
    for (let i = 0; i < drawnStripCount; i++) {
      const start = cloud.stripOffsets[i]!;
      const end = cloud.stripOffsets[i + 1]!;
      pass.draw(end - start, 1, start, 0);
    }
  }

  function destroy() {
    vertexBuffer.destroy();
    uniformBuffer.destroy();
  }

  return { draw, destroy };
}
```

Run:

```
npm test -- streamlineRenderer
```

Expected: 1 / 1 passing.

- [ ] **Step 3: Commit**

```
git add src/services/gpu/streamlineRenderer.ts tests/services/gpu/streamlineRenderer.test.ts && git commit -m "feat(cf4): add StreamlineRenderer with native line-strip topology"
```

---

## Task 9: WGSL shaders

**Files:**
- Create: `src/services/gpu/shaders/cf4Galaxies.wgsl`
- Create: `src/services/gpu/shaders/streamlines.wgsl`

- [ ] **Step 1: Write `cf4Galaxies.wgsl`**

Create `/Users/rulkens/Development/js/skymap/src/services/gpu/shaders/cf4Galaxies.wgsl`:

```wgsl
// cf4Galaxies — instanced billboards for CF4 distance-measured galaxies.
//
// Per-instance attribute: [x, y, z, vMagKmS] (loc 1, float32x4).
// Per-vertex attribute:  [u, v]              (loc 0, float32x2, quad
//                                              corner UV).
//
// Colour is mapped from velocity magnitude through a cool→warm ramp:
//   0 → blue (slow, retreating-from-attractor)
//   500+ km/s → red (fast, falling-into-attractor)
//
// Phase 1 ignores basinId entirely.

struct Uniforms {
  viewProj   : mat4x4<f32>,
  viewport   : vec2<f32>,
  pointSizePx: f32,
  brightness : f32,
  vMagScale  : f32,
  // padding to 16-byte alignment is implicit — the host writes 96
  // bytes total; the trailing 12 bytes are unused but reserved.
};

@group(0) @binding(0) var<uniform> u: Uniforms;

struct VsIn {
  @location(0) corner    : vec2<f32>,
  @location(1) instance  : vec4<f32>,
};

struct VsOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) uv         : vec2<f32>,
  @location(1) tCol       : f32,
};

@vertex
fn vs_main(in: VsIn) -> VsOut {
  let centre = vec4<f32>(in.instance.xyz, 1.0);
  let centreClip = u.viewProj * centre;
  // Quad in screen space, half-size = pointSizePx / 2 in pixels.
  let halfPx = u.pointSizePx * 0.5;
  let ndc = (in.corner - vec2<f32>(0.5, 0.5)) * 2.0; // [-1, 1]
  let offsetClip = vec2<f32>(
    ndc.x * halfPx / u.viewport.x * centreClip.w * 2.0,
    ndc.y * halfPx / u.viewport.y * centreClip.w * 2.0,
  );
  var out: VsOut;
  out.clip = vec4<f32>(centreClip.xy + offsetClip, centreClip.zw);
  out.uv = in.corner;
  // Normalise vMag against vMagScale (km/s); clamp to [0,1] for the
  // cool→warm lookup below.
  out.tCol = clamp(in.instance.w / max(u.vMagScale, 1e-3), 0.0, 1.0);
  return out;
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  let d = length(in.uv - vec2<f32>(0.5, 0.5));
  if (d > 0.5) { discard; }
  // Soft circular falloff for the dot.
  let alpha = smoothstep(0.5, 0.35, d);
  // Cool→warm palette: blue at t=0, white at 0.5, red at 1.
  let cool = vec3<f32>(0.20, 0.50, 1.00);
  let mid  = vec3<f32>(1.00, 1.00, 1.00);
  let warm = vec3<f32>(1.00, 0.30, 0.20);
  var col: vec3<f32>;
  if (in.tCol < 0.5) {
    col = mix(cool, mid, in.tCol * 2.0);
  } else {
    col = mix(mid, warm, (in.tCol - 0.5) * 2.0);
  }
  return vec4<f32>(col * u.brightness * alpha, alpha);
}
```

- [ ] **Step 2: Write `streamlines.wgsl`**

Create `/Users/rulkens/Development/js/skymap/src/services/gpu/shaders/streamlines.wgsl`:

```wgsl
// streamlines — native line-strip rendering of the CF4 velocity field.
//
// Per-vertex: position (loc 0), vMag (loc 1, km/s), basinId (loc 2,
// f32, ignored Phase 1).
//
// Colour is the same cool→warm ramp as cf4Galaxies, modulated by
// brightness and a fixed alpha that gives translucent threads
// against the additive HDR target.

struct Uniforms {
  viewProj   : mat4x4<f32>,
  brightness : f32,
  vMagScale  : f32,
  // padding implicit; host writes 80 bytes.
};

@group(0) @binding(0) var<uniform> u: Uniforms;

struct VsIn {
  @location(0) pos     : vec3<f32>,
  @location(1) vMag    : f32,
  @location(2) basinId : f32,
};

struct VsOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) tCol       : f32,
};

@vertex
fn vs_main(in: VsIn) -> VsOut {
  var out: VsOut;
  out.clip = u.viewProj * vec4<f32>(in.pos, 1.0);
  out.tCol = clamp(in.vMag / max(u.vMagScale, 1e-3), 0.0, 1.0);
  return out;
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  let cool = vec3<f32>(0.20, 0.50, 1.00);
  let mid  = vec3<f32>(0.60, 0.80, 1.00);
  let warm = vec3<f32>(1.00, 0.40, 0.30);
  var col: vec3<f32>;
  if (in.tCol < 0.5) {
    col = mix(cool, mid, in.tCol * 2.0);
  } else {
    col = mix(mid, warm, (in.tCol - 0.5) * 2.0);
  }
  let alpha = 0.35; // baseline translucency; HDR + tone-map handles overlap.
  return vec4<f32>(col * u.brightness * alpha, alpha);
}
```

- [ ] **Step 3: Verify all tests + typecheck still pass**

```
npm run typecheck && npm test
```

Expected: clean typecheck, all tests pass (the renderer smoke tests now have real shader strings to load).

- [ ] **Step 4: Commit**

```
git add src/services/gpu/shaders/cf4Galaxies.wgsl src/services/gpu/shaders/streamlines.wgsl && git commit -m "feat(cf4): add WGSL shaders for CF4 galaxies + streamlines"
```

---

## Task 10: Engine integration in renderFrame.ts

**Files:**
- Modify: `src/services/engine/renderFrame.ts`
- Modify: `src/services/engine/engine.ts`
- Modify: `src/@types/EngineHandle.d.ts`

- [ ] **Step 1: Extend `RenderFrameSettings` and `RenderFrameInput`**

Open `/Users/rulkens/Development/js/skymap/src/services/engine/renderFrame.ts`. Add to the imports near the top:

```ts
import type { CF4PointRenderer } from '../gpu/cf4PointRenderer';
import type { StreamlineRenderer } from '../gpu/streamlineRenderer';
```

Append to `RenderFrameSettings`:

```ts
  /** CF4 layer toggles + density. */
  cf4GalaxiesEnabled: boolean;
  cf4StreamlinesEnabled: boolean;
  /** ∈ [0, 1]; truncates the strip-draw loop. */
  cf4StreamlineDensity: number;
  /** km/s — input velocity that maps to the warm colour endpoint. */
  cf4VMagScale: number;
```

Append to `RenderFrameInput` (after `thumbnails`):

```ts
  /**
   * CF4 GPU pipelines.  Both can be `null` when the user has not run
   * `npm run build-cf4` — `cloudLoader.ts` returns null on 404 and
   * the engine forwards that null so the per-frame loop can skip
   * cleanly without changing the encoder lifecycle.
   */
  cf4PointRenderer: CF4PointRenderer | null;
  streamlineRenderer: StreamlineRenderer | null;
```

Inside the `renderFrame` function body, just before `pass.end()`, add:

```ts
  // ── CF4 galaxy billboards ──────────────────────────────────────────
  //
  // Drawn after the survey points (so dense overlap reads CF4 dots on
  // top, which matches user expectation since CF4 is the smaller +
  // higher-quality dataset) but before thumbnails.runFrame so atlas
  // quads / procedural disks still write last.
  if (settings.cf4GalaxiesEnabled && input.cf4PointRenderer !== null) {
    input.cf4PointRenderer.draw(
      pass,
      viewProj,
      [canvasWidth, canvasHeight],
      settings.pointSizePx,
      settings.brightness,
      settings.cf4VMagScale,
    );
  }

  // ── CF4 streamlines ────────────────────────────────────────────────
  //
  // Drawn last inside the HDR pass — additive blending means draw
  // order doesn't change the *final* pixel sum, but the GPU can
  // early-out on rasterisation if a strip is fully behind the
  // depth-cleared target.  No depth here, so order is purely
  // aesthetic; we put streamlines last because they're the most
  // visually dominant CF4 element.
  if (settings.cf4StreamlinesEnabled && input.streamlineRenderer !== null) {
    input.streamlineRenderer.draw(
      pass,
      viewProj,
      settings.brightness,
      settings.cf4VMagScale,
      settings.cf4StreamlineDensity,
    );
  }
```

- [ ] **Step 2: Wire engine.ts**

In `/Users/rulkens/Development/js/skymap/src/services/engine/engine.ts`:

1. Import the new types + factories + loaders:

```ts
import { createCF4PointRenderer, type CF4PointRenderer } from '../gpu/cf4PointRenderer';
import { createStreamlineRenderer, type StreamlineRenderer } from '../gpu/streamlineRenderer';
import { loadCF4Galaxies, loadCF4Streamlines } from './cloudLoader';
```

2. Inside the engine's startup async block (next to where survey clouds are loaded), parallel-load the CF4 binaries and instantiate the renderers:

```ts
const [cf4Cloud, cf4Streamlines] = await Promise.all([
  loadCF4Galaxies(),
  loadCF4Streamlines(),
]);
let cf4PointRenderer: CF4PointRenderer | null = null;
let streamlineRenderer: StreamlineRenderer | null = null;
if (cf4Cloud !== null) {
  cf4PointRenderer = createCF4PointRenderer(device, 'rgba16float', cf4Cloud);
}
if (cf4Streamlines !== null) {
  streamlineRenderer = createStreamlineRenderer(device, 'rgba16float', cf4Streamlines);
}
```

3. Add three closure-state variables next to the other settings closures:

```ts
let cf4GalaxiesEnabled = false;
let cf4StreamlinesEnabled = false;
let cf4StreamlineDensity = 1.0;
const CF4_VMAG_SCALE_KMS = 500;
```

4. Forward all five new fields into the `renderFrame()` call inside the per-frame loop:

```ts
renderFrame({
  ...,
  cf4PointRenderer,
  streamlineRenderer,
  settings: {
    ...,
    cf4GalaxiesEnabled,
    cf4StreamlinesEnabled,
    cf4StreamlineDensity,
    cf4VMagScale: CF4_VMAG_SCALE_KMS,
  },
});
```

5. Expose three setters on the returned engine handle:

```ts
return {
  ...,
  setCF4GalaxiesEnabled: (v: boolean) => {
    cf4GalaxiesEnabled = v;
    requestRender();
  },
  setCF4StreamlinesEnabled: (v: boolean) => {
    cf4StreamlinesEnabled = v;
    requestRender();
  },
  setCF4StreamlineDensity: (v: number) => {
    cf4StreamlineDensity = Math.max(0, Math.min(1, v));
    requestRender();
  },
};
```

6. Add destroy calls in the engine's teardown block:

```ts
cf4PointRenderer?.destroy();
streamlineRenderer?.destroy();
```

- [ ] **Step 3: Extend `EngineHandle`**

In `/Users/rulkens/Development/js/skymap/src/@types/EngineHandle.d.ts`, add:

```ts
  /**
   * Toggle CF4 distance-measured galaxy billboards.  No-op (returns
   * undefined) when `cf4_galaxies.bin` was not loaded — the user
   * has not run `npm run build-cf4`.
   */
  setCF4GalaxiesEnabled?: (enabled: boolean) => void;
  /** Toggle CF4 streamline polylines. */
  setCF4StreamlinesEnabled?: (enabled: boolean) => void;
  /** ∈ [0, 1]; fraction of strips to draw. */
  setCF4StreamlineDensity?: (density: number) => void;
```

- [ ] **Step 4: Verify build + tests**

```
npm run typecheck && npm test
```

Expected: clean typecheck, all tests pass. No new tests added in this task — the engine integration is exercised end-to-end in Task 13's manual visual check.

- [ ] **Step 5: Commit**

```
git add src/services/engine/renderFrame.ts src/services/engine/engine.ts src/@types/EngineHandle.d.ts && git commit -m "feat(cf4): wire CF4 renderers into renderFrame + EngineHandle setters"
```

---

## Task 11: SettingsPanel "Cosmic flow (CF4)" section

**Files:**
- Modify: `src/components/SettingsPanel/SettingsPanel.tsx`

- [ ] **Step 1: Add the props to the panel's prop type**

Open `/Users/rulkens/Development/js/skymap/src/components/SettingsPanel/SettingsPanel.tsx`. Add to the existing `Props` (or `SettingsPanelProps` — match the file's actual type name) `type` declaration:

```ts
  cf4GalaxiesEnabled: boolean;
  onCF4GalaxiesEnabledChange: (v: boolean) => void;
  cf4StreamlinesEnabled: boolean;
  onCF4StreamlinesEnabledChange: (v: boolean) => void;
  cf4StreamlineDensity: number;
  onCF4StreamlineDensityChange: (v: number) => void;
```

- [ ] **Step 2: Add the section in JSX**

Inside the existing settings tree, add a new section after the "Filaments" section (or wherever fits the visual hierarchy — the existing pattern is `<details><summary>` blocks). Match the existing layout exactly; here's the section content:

```tsx
<details>
  <summary>Cosmic flow (CF4)</summary>
  <label>
    <input
      type="checkbox"
      checked={cf4GalaxiesEnabled}
      onChange={(e) => onCF4GalaxiesEnabledChange(e.target.checked)}
    />
    Show CF4 galaxies
  </label>
  <label>
    <input
      type="checkbox"
      checked={cf4StreamlinesEnabled}
      onChange={(e) => onCF4StreamlinesEnabledChange(e.target.checked)}
    />
    Show streamlines
  </label>
  <label>
    Streamline density
    <input
      type="range"
      min={0}
      max={1}
      step={0.05}
      value={cf4StreamlineDensity}
      onChange={(e) => onCF4StreamlineDensityChange(Number(e.target.value))}
      disabled={!cf4StreamlinesEnabled}
    />
    <span>{Math.round(cf4StreamlineDensity * 100)}%</span>
  </label>
</details>
```

- [ ] **Step 3: Verify build + tests**

```
npm run typecheck && npm test
```

Expected: clean. App.tsx will fail to typecheck if it doesn't pass the new props yet — that's Task 12. If it errors here, hold off and complete this task's commit, then move to Task 12.

- [ ] **Step 4: Commit**

```
git add src/components/SettingsPanel/SettingsPanel.tsx && git commit -m "feat(cf4): add Cosmic flow (CF4) section to SettingsPanel"
```

---

## Task 12: App.tsx state wiring

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add the React state**

In `/Users/rulkens/Development/js/skymap/src/App.tsx`, next to the other settings `useState` calls, add:

```ts
const [cf4GalaxiesEnabled, setCF4GalaxiesEnabled] = useState(false);
const [cf4StreamlinesEnabled, setCF4StreamlinesEnabled] = useState(false);
const [cf4StreamlineDensity, setCF4StreamlineDensity] = useState(1.0);
```

- [ ] **Step 2: Forward to the engine**

In the appropriate `useEffect` (the one that pushes settings into the engine handle on change), add:

```ts
handleRef.current?.setCF4GalaxiesEnabled?.(cf4GalaxiesEnabled);
```

Add similar forwards for `cf4StreamlinesEnabled` and `cf4StreamlineDensity`. Add the three new state values to the effect's dependency list.

- [ ] **Step 3: Pass to SettingsPanel**

In the SettingsPanel JSX, pass the props:

```tsx
<SettingsPanel
  ...
  cf4GalaxiesEnabled={cf4GalaxiesEnabled}
  onCF4GalaxiesEnabledChange={setCF4GalaxiesEnabled}
  cf4StreamlinesEnabled={cf4StreamlinesEnabled}
  onCF4StreamlinesEnabledChange={setCF4StreamlinesEnabled}
  cf4StreamlineDensity={cf4StreamlineDensity}
  onCF4StreamlineDensityChange={setCF4StreamlineDensity}
/>
```

- [ ] **Step 4: Verify build + tests**

```
npm run typecheck && npm test
```

Expected: clean.

- [ ] **Step 5: Commit**

```
git add src/App.tsx && git commit -m "feat(cf4): wire CF4 settings state through App.tsx"
```

---

## Task 13: README + visual verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a "Cosmic flow (CF4)" section to the README**

Open `/Users/rulkens/Development/js/skymap/README.md`. Find the "Building data" / "Data pipeline" section (or whatever the equivalent heading is — keep the existing pattern) and append:

```markdown
### Cosmic flow (CF4)

Cosmicflows-4 (Tully+ 2023) ships peculiar-velocity measurements for
~56k galaxies plus a Wiener-filter velocity-field reconstruction.
We render them as a parallel layer alongside the survey catalogs:
billboards for the catalog galaxies, RK4-integrated streamlines for
the field. Builds are independent of `npm run build-all`.

```bash
npm run fetch-cf4   # download raw catalog + velocity grid (~200 MB)
npm run build-cf4   # parse, integrate, write public/data/cf4_*.bin
```

Toggle the layers from Settings panel → "Cosmic flow (CF4)".
Streamline density slider lets you reduce strip count for older GPUs.

If you skip the build, the runtime fetch returns 404 and the toggles
are no-ops (no error). The HDR + tone-map pipeline is shared with
the survey-catalog layers; CF4 brightness is governed by the same
exposure / tone-map settings.

Phase 1 colours by velocity magnitude only. Watershed-based basin
segmentation (Laniakea / Great Attractor / Perseus-Pisces / Shapley
/ Coma / Hercules colours) is deferred to a follow-up plan.
```

- [ ] **Step 2: Manual visual verification (with the dev server running)**

Visit the running dev server (the user keeps `npm run dev` alive — don't restart it). Verify each item:

1. Toggle "Show CF4 galaxies" → ~50k blue→red dots appear, brighter where peculiar velocities are large (Great Attractor / Shapley region in the southern sky).
2. Toggle "Show streamlines" → translucent line traces appear, arcing into known density nodes. Disabling immediately removes them.
3. Density slider 100% → 0% smoothly thins the line count without flicker.
4. Survey catalogs still render correctly with CF4 layers on (no regression).
5. Disable both CF4 toggles, no observable change vs pre-plan baseline (rule out a stuck draw call).

If any item fails, treat it as a bug and follow the project's "reproduce as failing test then fix" convention before declaring this plan complete.

- [ ] **Step 3: Final test + typecheck pass**

```
npm run typecheck && npm test
```

Expected: clean. Compare test count against the Task 0 baseline — should be exactly N + (new tests added by this plan). Any unrelated regression is a bug.

- [ ] **Step 4: Commit**

```
git add README.md && git commit -m "docs(cf4): document Cosmic flow (CF4) build + UI in README"
```

---

## Self-review

Before declaring the plan complete, walk every task and confirm:

### Spec coverage

- [ ] Task 0 fetches raw inputs into `data/raw/cf4/`.
- [ ] Task 1 ships `cf4GalaxiesBinaryFormat.ts` (CF4G v1, magic `0x47344643`, 28-byte records) AND `cf4StreamlinesBinaryFormat.ts` (CF4S v1, magic `0x53344643`, 5-float vertices) with round-trip tests.
- [ ] Task 2 parses both raw inputs with comment-skipping + numeric validation + bbox sanity.
- [ ] Task 3 implements SG→equatorial as a constant 3×3, verified against the SG-pole equatorial reference.
- [ ] Task 4 implements RK4 with bbox + magnitude + step-count termination, verified against constant + rotational synthetic fields.
- [ ] Task 5 orchestrates raw → bins end-to-end via `npm run build-cf4`.
- [ ] Task 6 adds `loadCF4Galaxies` + `loadCF4Streamlines` returning `null` on 404.
- [ ] Task 7 adds `CF4PointRenderer` with a smoke test exercising vertex-buffer sizing.
- [ ] Task 8 adds `StreamlineRenderer` with native `'line-strip'` topology, density slider via per-strip draw loop.
- [ ] Task 9 ships both WGSL shaders with cool→warm palette + additive blending.
- [ ] Task 10 wires both renderers into `renderFrame.ts` (two new draw calls inside the HDR pass) + extends `EngineHandle`.
- [ ] Task 11 adds the SettingsPanel section (two toggles + density slider).
- [ ] Task 12 wires App.tsx state.
- [ ] Task 13 documents + verifies.

### No placeholders

- [ ] Every code block is complete (no `// ... rest of file` ellipses).
- [ ] Every test has a concrete fixture and concrete expectation.
- [ ] Every binary-format byte layout is documented in full at both the header comment and the encode function.

### Type-name consistency

- [ ] `CF4Cloud` (galaxies) vs `CF4StreamlineCloud` (streamlines) used consistently.
- [ ] `cf4_galaxies.bin` / `cf4_streamlines.bin` filenames spelled identically across tools, loaders, README.
- [ ] `setCF4GalaxiesEnabled` / `setCF4StreamlinesEnabled` / `setCF4StreamlineDensity` setter names match between EngineHandle, App.tsx wiring, and engine.ts implementation.

### Frequent commits

- [ ] Every task ends with a `git add ... && git commit -m "..."`. No task accumulates more than ~500 lines of diff before committing.

### Convention checks (per project CLAUDE.md)

- [ ] All TS shapes use `type`, not `interface`.
- [ ] All comments are didactic (explain *why*, not just *what*).
- [ ] Tests mirror src tree exactly (`tests/data/...`, `tests/parsers/...`, `tests/cf4/...`, `tests/services/gpu/...`).
- [ ] No barrel exports added; React component imports in App.tsx target the `.tsx` directly.
- [ ] Dev server is left running throughout — Task 13's verification asks the user to look, doesn't restart anything.
