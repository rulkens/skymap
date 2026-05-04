# DisPerSE Filament Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the cosmic-web filament skeleton — the network of 1D ridges connecting galaxy clusters through saddle points — as an additive-blended overlay on the existing point cloud, producing the canonical "cosmic web" visual seen in published Laniakea / SDSS DR18 figures.

**Architecture:** Offline build step runs the DisPerSE toolchain (`mse` + `skelconv`) against the merged SDSS+2MRS+GLADE galaxy positions, parses the resulting `.NDskl` ASCII skeleton into a custom binary format (`filaments.bin`), and ships it alongside the existing `.bin` files. At runtime, a new `FilamentRenderer` draws each filament as an instanced-quad line strip in WGSL using additive blending. Engine wires it as a fourth render pass after points/quads/disks; SettingsPanel adds a toggle. Persistence threshold is fixed at 5σ + 2 smoothing passes (per the 2025 SDSS DR18 paper) — adjustable in a later plan if needed.

**Tech Stack:** TypeScript, WebGPU + WGSL, Vite, Vitest. New external tooling: DisPerSE C++ binaries (one-time install).

---

## Scope

**In scope (Phase 1 — this plan):**
- Build-time DisPerSE wrapper, `.NDskl` parser, custom binary writer.
- New `FilamentRenderer` GPU pipeline drawing line strips via the instanced-quad technique.
- WGSL shader with soft-glow falloff and density-modulated alpha.
- Engine + cloudLoader integration; one new draw call per frame.
- Settings panel toggle (on/off, no slider).
- README docs covering install + build steps.

**Out of scope (future plans):**
- Persistence-cut slider with multiple pre-baked bins.
- Per-filament density coloring along the ridge (Phase 1 ships single-hue + flat alpha; ridge density is parsed but not yet used in the shader).
- SDSS footprint mask (Phase 1 accepts the boundary artefacts; mask gen is a separate plan).
- Filtering Local-Group artefact rows out of DisPerSE input (M31 / M33 etc.).
- Picking on filaments (filaments are decorative-only in Phase 1; clicking a filament does nothing).

**Pre-existing dependencies:**
- The merged SDSS + 2MRS + GLADE `.bin` files at `public/data/{sdss,2mrs,glade}.bin` (produced by `npm run build-all`).
- The v4 PointCloud format (we read it for galaxy positions, not write it).
- Existing per-frame draw orchestration in `src/services/engine/renderFrame.ts` (post-refactor: `engine.ts` constructs renderers; `renderFrame.ts` owns the HDR-pass + tone-map dispatch).

---

## File Structure

### New files

- **`tools/parsers/ndskl.ts`** — pure TypeScript parser for DisPerSE's ASCII `.NDskl` format. Lives alongside the other catalog parsers (`glade.ts`, `twoMrs.ts`, `sdssCsv.ts`); pure-function, fully testable without DisPerSE installed.
- **`src/data/filamentBinaryFormat.ts`** — encoder + decoder for the runtime `filaments.bin` format. Mirrors `src/data/pointCloudFormat.ts` style and lives next to it so the runtime can import it without crossing the `src/`↔`tools/` boundary.
- **`tools/buildFilaments.ts`** — CLI orchestrator: reads the survey `.bin` files, builds the merged TSV input for DisPerSE, shells out to `mse` + `skelconv`, calls the parser, calls the binary encoder, writes `public/data/filaments.bin`.
- **`src/services/gpu/filamentRenderer.ts`** — GPU pipeline owner. Loads `filaments.bin`, builds vertex + instance buffers, exposes `draw(pass, viewProj, ...)`.
- **`src/services/gpu/shaders/filaments.wgsl`** — vertex + fragment shaders for the filament pass.
- **`src/@types/FilamentCloud.d.ts`** — runtime decoded shape (parallel to `PointCloud.d.ts`).
- **Tests**: `tests/parsers/ndskl.test.ts`, `tests/data/filamentBinaryFormat.test.ts`, `tests/services/gpu/filamentRenderer.test.ts`. Tests mirror the source tree exactly.

### Modified files

- **`src/services/engine/cloudLoader.ts`** — append a `loadFilaments()` helper (separate from the survey-bin path because the schema is different).
- **`src/services/engine/engine.ts`** — instantiate `FilamentRenderer`, fetch the binary, expose `setFilamentsEnabled(boolean)`. Engine no longer owns the per-frame loop directly (post-refactor) — it constructs renderers and threads them into `renderFrame()`.
- **`src/services/engine/renderFrame.ts`** — add the filament draw call to the HDR pass after `pointRenderer.draw` and `thumbnails.runFrame`, before `pass.end()`.
- **`src/@types/EngineHandle.d.ts`** — add `setFilamentsEnabled?: (enabled: boolean) => void`.
- **`src/components/SettingsPanel/SettingsPanel.tsx`** — add a "Filaments" checkbox.
- **`src/App.tsx`** — wire the checkbox through `handleRef.current?.setFilamentsEnabled`.
- **`package.json`** — add `"build-filaments": "tsx tools/buildFilaments.ts"` script.
- **`README.md`** — document the install + build steps.

---

## Binary format (FILA v1)

Header (16 bytes), little-endian:

```
0       4     magic    = "FILA" (0x414c4946 in little-endian uint32)
4       4     version  = 1 (uint32)
8       4     stripCount       (uint32) — number of filament polylines
12      4     vertexCount      (uint32) — total vertices across all strips
```

Then two arrays:

```
stripOffsets:   uint32 × (stripCount + 1)
                Index into the vertices array for each strip's starting vertex.
                Last entry equals vertexCount (for tidy "next strip" lookups).

vertices:       float32 × 4 × vertexCount
                Per vertex: [x, y, z, density]
                Position in Mpc (same coordinate system as the survey bins).
                Density is the DTFE log-density at this skeleton sample,
                normalised to [0, 1] at encode time. Phase 1 ignores it in
                the shader; Phase 2 will modulate alpha + color by it.
```

Total file size: `16 + 4 × (stripCount + 1) + 16 × vertexCount`. For 10,000 filaments × 30 samples each = 300,000 vertices: ~5 MB. Comfortable.

The `pointCloudFormat.ts` precedent is for a fixed-record-size cloud; this format is variable per strip, so `decodeFilaments` returns a struct-of-arrays similar to PointCloud but with the strip-offset table preserved alongside.

---

## Render strategy: instanced-quad line technique

Native WebGPU `topology: 'line-list'` produces 1-pixel-wide lines on most platforms — too thin for our usage. The standard fix:

For every consecutive pair of vertices `(v_i, v_{i+1})` in a strip, emit one instance of a 4-vertex quad in the vertex shader. The quad has unit-square corners `[(0,0), (1,0), (0,1), (1,1)]` (UV coordinates). The vertex shader expands each corner to a thick segment:

1. Project `v_i` and `v_{i+1}` to clip space.
2. Compute the screen-space tangent direction `t = normalize(v_{i+1}.xy - v_i.xy)`.
3. Compute the screen-space perpendicular `n = vec2(-t.y, t.x)`.
4. Position each quad corner: corner.x picks `v_i` vs `v_{i+1}` (start vs end), corner.y picks `+n` vs `-n` (one side vs the other), scaled by a half-width in pixels.

The fragment shader then uses the UV's y coordinate (0..1 across the line's width) to compute a soft falloff via `smoothstep` — wider in the middle, fading to 0 at the edges.

Vertex buffers:
- **Quad vertex buffer** (4 vertices, drawn once via index buffer): `[(0,0), (1,0), (0,1), (1,1)]`. Static.
- **Index buffer**: `[0, 1, 2, 1, 3, 2]` — two triangles per quad. Static.
- **Instance buffer** (one entry per filament segment): `[v_i.xyz, v_i.density, v_{i+1}.xyz, v_{i+1}.density]` = 8 f32 = 32 bytes. Built at filament-load time by walking each strip and emitting `stripVertices.length - 1` instances.

For a 300k-vertex catalog: ~290k segments → ~9 MB of instance data on the GPU. Still fine.

We draw with `pass.draw(6, instanceCount)` — six quad-vertex indices, one instance per filament segment.

---

## Plan revision history

**2026-05-04 — convention audit (post Task 1 review).** A code review of the Task 1 implementation surfaced three issues that were inherited from the plan rather than introduced by the implementer: (1) parser file placement diverged from the `tools/parsers/` convention every sibling parser uses; (2) example code did `if (v === undefined) break` on truncated `[FILAMENTS DATA]` blocks, contradicting the project's "throw loudly on malformed input" stance; (3) `Number(... ?? '0')` swallowed malformed field counts as zero. Because this plan dispatches future implementers verbatim, leaving those patterns in the plan would silently re-introduce them. The audit walked every task and aligned file placement (`tools/parsers/ndskl.ts`, `src/data/filamentBinaryFormat.ts`, `tests/parsers/`, `tests/data/`), tightened error handling to throw on declared-count mismatches and malformed numerics, retargeted the engine integration onto the post-refactor `renderFrame.ts` (engine.ts no longer owns the per-frame loop), and switched the renderer's colour-attachment format to `'rgba16float'` so filaments accumulate into the HDR target the rest of the renderer uses. See individual task changes for specifics; the architectural decisions (binary format v1, two-component shader model, single render pass) are unchanged.

---

## Task 0: Pre-flight — confirm baseline + DisPerSE availability

**Files:** none

- [ ] **Step 1: Verify the existing test suite is green**

Run:

```
cd /Users/rulkens/Development/js/skymap && npm run typecheck && npm test
```

Expected: typecheck clean, all tests pass. If anything fails, stop and fix first — this plan assumes a clean baseline.

- [ ] **Step 2: Verify the source bin files exist (DisPerSE input)**

Run:

```
ls -lh public/data/sdss.bin public/data/2mrs.bin public/data/glade.bin
```

Expected: all three present. If absent, run `npm run build-all` first.

- [ ] **Step 3: Check whether DisPerSE is installed**

Run:

```
which mse skelconv 2>&1
```

Expected: full paths if DisPerSE is installed. If "not found" for either binary, the engineer must build DisPerSE before Task 5 can run end-to-end. Tasks 1-4 + 6-12 do NOT require DisPerSE — they're either pure code, parsers operating on fixtures, or runtime work — so the engineer can proceed without it and only block on Task 5.

Build instructions (record in your shell history; not part of any commit):

```
git clone https://gitlab.com/florent.sousbie/disperse.git /tmp/disperse
cd /tmp/disperse
mkdir build && cd build
cmake ..
make -j 4
sudo make install
```

Build deps: CGAL (Homebrew: `brew install cgal`), boost (`brew install boost`), CMake. Total time ~15 minutes on a modern Mac.

- [ ] **Step 4: Note current baseline metrics**

Record from Step 1's output: number of tests passing, lines of code (e.g. `find src tools tests -name '*.ts' | xargs wc -l`). Useful as a sanity reference when Task 12's verification compares against pre-plan state.

---

## Task 1: Pure NDskl parser

**Files:**
- Create: `tools/parsers/ndskl.ts` (mirrors the existing `tools/parsers/{glade,twoMrs,sdssCsv}.ts` layout — every catalog parser lives here)
- Create: `tests/parsers/ndskl.test.ts` (tests mirror the source tree exactly)

DisPerSE's `.NDskl` ASCII format documented at <https://www2.iap.fr/users/sousbier/web4/?page_id=14> (see "Output Files"). The relevant subset for our needs is the `[CRITICAL POINTS]` block (we ignore — we only want skeleton arcs) and the `[FILAMENTS]` block (we want all of it).

A representative `.NDskl` body looks like:

```
ANDSKEL
3
[BBOX]
0 0 0 100 100 100
[CRITICAL POINTS]
2
0 50.0 50.0 50.0 0 -1 0 0
1 60.0 60.0 60.0 0 -1 0 0
[FILAMENTS]
1
0 1 4
50.0 50.0 50.0
52.5 52.5 52.5
55.0 55.0 55.0
57.5 57.5 57.5
[CRITICAL POINTS DATA]
1
density
0
0
[FILAMENTS DATA]
1
field_value
0.5
0.4
0.3
0.2
```

Parser job: scan to `[FILAMENTS]`, read the count, then for each filament read `cp_idx_a cp_idx_b n_samples` and the next `n_samples` lines as `x y z`. Then scan to `[FILAMENTS DATA]` (if present) and read the per-vertex density values into a parallel array.

- [ ] **Step 1: Add a failing test for the parser**

Create `/Users/rulkens/Development/js/skymap/tests/parsers/ndskl.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseNDskl } from '../../tools/parsers/ndskl';

const FIXTURE = `ANDSKEL
3
[BBOX]
0 0 0 100 100 100
[CRITICAL POINTS]
2
0 50.0 50.0 50.0 0 -1 0 0
1 60.0 60.0 60.0 0 -1 0 0
[FILAMENTS]
2
0 1 3
10.0 10.0 10.0
20.0 20.0 20.0
30.0 30.0 30.0
0 1 2
40.0 40.0 40.0
50.0 50.0 50.0
[CRITICAL POINTS DATA]
1
density
0
0
[FILAMENTS DATA]
1
field_value
0.9
0.8
0.7
0.6
0.5
`;

describe('parseNDskl', () => {
  it('parses two filaments with their sample positions', () => {
    const sk = parseNDskl(FIXTURE);
    expect(sk.strips).toHaveLength(2);
    expect(sk.strips[0]!.vertices).toEqual([
      [10, 10, 10],
      [20, 20, 20],
      [30, 30, 30],
    ]);
    expect(sk.strips[1]!.vertices).toEqual([
      [40, 40, 40],
      [50, 50, 50],
    ]);
  });

  it('attaches per-vertex density when [FILAMENTS DATA] is present', () => {
    const sk = parseNDskl(FIXTURE);
    expect(sk.strips[0]!.density).toEqual([0.9, 0.8, 0.7]);
    expect(sk.strips[1]!.density).toEqual([0.6, 0.5]);
  });

  it('falls back to NaN-filled density when [FILAMENTS DATA] is absent', () => {
    const fixtureNoData = FIXTURE.split('[FILAMENTS DATA]')[0]!;
    const sk = parseNDskl(fixtureNoData);
    expect(sk.strips[0]!.density.every((d) => Number.isNaN(d))).toBe(true);
  });

  it('throws on missing ANDSKEL magic', () => {
    expect(() => parseNDskl('not a skeleton file')).toThrow(/ANDSKEL/);
  });

  it('throws when [FILAMENTS] block declares a count but lines run out', () => {
    const truncated = `ANDSKEL
3
[FILAMENTS]
2
0 1 3
10 10 10
`;
    expect(() => parseNDskl(truncated)).toThrow(/incomplete/i);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run:

```
npx vitest run tests/parsers/ndskl.test.ts
```

Expected: every test fails with `Cannot find module '../../tools/parsers/ndskl'`.

- [ ] **Step 3: Implement the parser**

Create `/Users/rulkens/Development/js/skymap/tools/parsers/ndskl.ts`:

```ts
/**
 * parseNDskl — pure parser for DisPerSE's `.NDskl` ASCII skeleton format.
 *
 * What is .NDskl?
 *
 * DisPerSE (Sousbie 2011) outputs the persistent skeleton of a density
 * field as a graph of critical points (max / min / saddles) connected by
 * filament arcs.  The ASCII serialisation interleaves several blocks
 * delimited by bracketed headers; we ignore everything except [FILAMENTS]
 * (the polylines themselves) and [FILAMENTS DATA] (per-vertex density).
 *
 * Why a pure parser separated from the IO?
 *
 * Pure-function parsers are trivially unit-testable from a string fixture
 * — no temp files, no DisPerSE install needed in CI.  The CLI wrapper
 * (`tools/buildFilaments.ts`) does the file IO and shells out to the
 * native binary; this module just turns text into typed data.
 *
 * Why ignore [CRITICAL POINTS]?
 *
 * For visualisation we only need the polyline geometry of each filament.
 * The critical-point list is useful for analytical work (filament-length
 * statistics, persistence diagrams) but adds no visual signal — the
 * polylines already start and end at maxima or saddles.  Phase 2 might
 * surface them if we ever want to render cluster nodes as dots.
 */

/** A single filament polyline. */
export type FilamentStrip = {
  /** Sequence of (x, y, z) sample points in input-file units (Mpc for us). */
  vertices: Array<[number, number, number]>;
  /**
   * Per-vertex density values from the [FILAMENTS DATA] field_value column.
   * Same length as `vertices`; NaN-filled when [FILAMENTS DATA] is absent
   * or when DisPerSE was run without per-skeleton field tracking.
   */
  density: number[];
};

/** Parsed skeleton result. */
export type ParsedSkeleton = {
  strips: FilamentStrip[];
};

/**
 * Parse a `.NDskl` ASCII skeleton.  Throws on malformed input rather than
 * returning partial results — DisPerSE output is machine-generated, so
 * any malformedness is a real bug we want surfaced loudly.
 */
export function parseNDskl(text: string): ParsedSkeleton {
  // Normalise CRLF → LF so the line splitter doesn't double-count.  Some
  // operating systems write .NDskl with Windows line endings even when
  // the toolchain is Linux-native.
  const lines = text.replace(/\r\n/g, '\n').split('\n');

  // ── Magic check ──────────────────────────────────────────────────────
  if (!lines[0]?.startsWith('ANDSKEL')) {
    throw new Error('parseNDskl: missing ANDSKEL magic on first line');
  }

  // ── Locate the [FILAMENTS] block ─────────────────────────────────────
  const filamentsHdr = lines.findIndex((l) => l.trim() === '[FILAMENTS]');
  if (filamentsHdr < 0) {
    throw new Error('parseNDskl: [FILAMENTS] block not found');
  }

  // The very next line is the filament count.
  const countLine = lines[filamentsHdr + 1];
  if (!countLine) throw new Error('parseNDskl: incomplete [FILAMENTS] header');
  const filamentCount = Number(countLine.trim());
  if (!Number.isFinite(filamentCount) || filamentCount < 0) {
    throw new Error(`parseNDskl: bad filament count "${countLine}"`);
  }

  // ── Walk forward, reading each filament's header + samples ────────────
  const strips: FilamentStrip[] = [];
  let cursor = filamentsHdr + 2;
  for (let f = 0; f < filamentCount; f++) {
    const header = lines[cursor++];
    if (!header) {
      throw new Error(
        `parseNDskl: incomplete filament ${f}/${filamentCount}; reached end of input`,
      );
    }
    // header layout: cp_idx_a cp_idx_b n_samples
    const headerParts = header.trim().split(/\s+/);
    if (headerParts.length < 3) {
      throw new Error(`parseNDskl: bad filament header "${header}"`);
    }
    const nSamples = Number(headerParts[2]);
    if (!Number.isFinite(nSamples) || nSamples < 2) {
      throw new Error(
        `parseNDskl: filament ${f} has invalid sample count ${headerParts[2]}`,
      );
    }
    const vertices: Array<[number, number, number]> = [];
    for (let s = 0; s < nSamples; s++) {
      const sampleLine = lines[cursor++];
      if (!sampleLine) {
        throw new Error(
          `parseNDskl: incomplete filament ${f}; expected ${nSamples} samples but ran out`,
        );
      }
      const parts = sampleLine.trim().split(/\s+/);
      if (parts.length < 3) {
        throw new Error(`parseNDskl: bad sample "${sampleLine}" in filament ${f}`);
      }
      vertices.push([Number(parts[0]), Number(parts[1]), Number(parts[2])]);
    }
    strips.push({ vertices, density: new Array<number>(nSamples).fill(NaN) });
  }

  // ── Optional [FILAMENTS DATA] block — per-vertex density ─────────────
  //
  // The block, when present, lists field-value samples for *every* vertex
  // across *every* filament in the same order the [FILAMENTS] block emitted
  // them.  So we re-walk our strips array and consume one density value
  // per vertex.
  //
  // Throw-loudly philosophy: the BLOCK itself is optional (not every
  // DisPerSE invocation tracks per-skeleton fields).  But once the
  // [FILAMENTS DATA] header is present, its DECLARED counts must match the
  // filament geometry exactly — any discrepancy is a real upstream bug
  // we want surfaced now rather than silently rendered as zeros.
  const dataHdr = lines.findIndex((l) => l.trim() === '[FILAMENTS DATA]');
  if (dataHdr >= 0) {
    // The format puts the field-count on the line after [FILAMENTS DATA],
    // then one line per declared field name, then the value rows begin.
    let dataCursor = dataHdr + 1;
    const fieldCountLine = lines[dataCursor++];
    if (fieldCountLine === undefined) {
      throw new Error('parseNDskl: [FILAMENTS DATA] missing field-count line');
    }
    const fieldCount = Number(fieldCountLine.trim());
    if (!Number.isFinite(fieldCount) || fieldCount < 0) {
      throw new Error(
        `parseNDskl: [FILAMENTS DATA] bad field count "${fieldCountLine}"`,
      );
    }
    if (fieldCount > 0) {
      dataCursor += fieldCount; // skip the field-name lines
      for (let si = 0; si < strips.length; si++) {
        const strip = strips[si]!;
        for (let i = 0; i < strip.vertices.length; i++) {
          const v = lines[dataCursor++];
          if (v === undefined) {
            throw new Error(
              `parseNDskl: [FILAMENTS DATA] truncated at strip ${si} vertex ${i} ` +
                `(line ${dataCursor}); declared geometry expects more values`,
            );
          }
          const n = Number(v.trim());
          if (!Number.isFinite(n)) {
            throw new Error(
              `parseNDskl: [FILAMENTS DATA] non-numeric value "${v}" at strip ${si} vertex ${i}`,
            );
          }
          strip.density[i] = n;
        }
      }
    }
  }

  return { strips };
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run:

```
npx vitest run tests/parsers/ndskl.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```
cd /Users/rulkens/Development/js/skymap && git add tools/parsers/ndskl.ts tests/parsers/ndskl.test.ts && git commit -m "feat(filaments): pure NDskl parser"
```

---

## Task 2: Filament binary format (encoder + decoder)

**Files:**
- Create: `src/data/filamentBinaryFormat.ts` (lives next to `pointCloudFormat.ts`; consumed by both the build-time encoder in `tools/buildFilaments.ts` and the runtime decoder in `cloudLoader.ts` — putting it under `src/data/` lets the runtime import it without crossing the `src/`↔`tools/` boundary)
- Create: `src/@types/FilamentCloud.d.ts`
- Create: `tests/data/filamentBinaryFormat.test.ts` (mirrors `src/data/`)

**Format spec is at the top of this plan ("Binary format (FILA v1)").**

- [ ] **Step 1: Define the runtime type**

Create `/Users/rulkens/Development/js/skymap/src/@types/FilamentCloud.d.ts`:

```ts
/**
 * FilamentCloud — the runtime decoded shape of `filaments.bin`.
 *
 * Mirrors the SoA layout of `PointCloud`: separate typed arrays for each
 * field so we can `device.queue.writeBuffer` them straight to the GPU
 * without per-strip allocations.
 *
 * The `stripOffsets` table preserves filament boundaries so the renderer
 * can iterate per-strip when building instance buffers.  Total
 * vertices live in a single flat `Float32Array` of length 4 × vertexCount
 * (interleaved xyz + density) so the GPU upload is a single writeBuffer
 * call.
 */
export type FilamentCloud = {
  /** Number of filament polylines. */
  stripCount: number;
  /** Total vertices across all strips. */
  vertexCount: number;
  /**
   * For strip i, vertices are stored at
   *   `vertices[stripOffsets[i] * 4 .. stripOffsets[i+1] * 4]`
   * stripOffsets has length stripCount + 1; the last entry equals
   * vertexCount so "next strip" lookups don't need a bounds check.
   */
  stripOffsets: Uint32Array;
  /**
   * Interleaved per-vertex data: [x, y, z, density, x, y, z, density, ...]
   * Length = vertexCount * 4.  Density is in [0, 1] (normalised at encode
   * time); Phase 1 ignores it in the shader.
   */
  vertices: Float32Array;
};
```

- [ ] **Step 2: Add a failing roundtrip test**

Create `/Users/rulkens/Development/js/skymap/tests/data/filamentBinaryFormat.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  encodeFilaments,
  decodeFilaments,
} from '../../src/data/filamentBinaryFormat';
import type { FilamentCloud } from '../../src/@types/FilamentCloud';

function makeFixture(): FilamentCloud {
  // Two strips: A has 3 vertices, B has 2.  Total 5 vertices.
  return {
    stripCount: 2,
    vertexCount: 5,
    stripOffsets: new Uint32Array([0, 3, 5]),
    vertices: new Float32Array([
      10, 20, 30, 0.9,
      11, 21, 31, 0.8,
      12, 22, 32, 0.7,
      40, 50, 60, 0.6,
      41, 51, 61, 0.5,
    ]),
  };
}

describe('filament binary format (FILA v1)', () => {
  it('round-trips a small cloud byte-for-byte', () => {
    const original = makeFixture();
    const decoded = decodeFilaments(encodeFilaments(original));
    expect(decoded.stripCount).toBe(2);
    expect(decoded.vertexCount).toBe(5);
    expect(Array.from(decoded.stripOffsets)).toEqual([0, 3, 5]);
    expect(Array.from(decoded.vertices)).toEqual(Array.from(original.vertices));
  });

  it('produces the expected byte length', () => {
    // header 16 + (stripCount+1)*4 + vertexCount*16 = 16 + 12 + 80 = 108
    const buf = encodeFilaments(makeFixture());
    expect(buf.byteLength).toBe(108);
  });

  it('rejects bad magic', () => {
    const buf = new ArrayBuffer(16);
    expect(() => decodeFilaments(buf)).toThrow(/magic/);
  });

  it('rejects unsupported version with regenerate hint', () => {
    const cloud = makeFixture();
    const buf = encodeFilaments(cloud);
    new DataView(buf).setUint32(4, 99, true); // overwrite version
    expect(() => decodeFilaments(buf)).toThrow(/version/);
    expect(() => decodeFilaments(buf)).toThrow(/build-filaments/);
  });

  it('throws when stripOffsets length disagrees with stripCount+1', () => {
    const cloud: FilamentCloud = {
      stripCount: 2,
      vertexCount: 5,
      stripOffsets: new Uint32Array([0, 3]), // wrong length
      vertices: new Float32Array(20),
    };
    expect(() => encodeFilaments(cloud)).toThrow(/stripOffsets length/);
  });
});
```

- [ ] **Step 3: Run the test, verify it fails**

Run:

```
npx vitest run tests/data/filamentBinaryFormat.test.ts
```

Expected: every test fails with `Cannot find module '../../src/data/filamentBinaryFormat'`.

- [ ] **Step 4: Implement the format**

Create `/Users/rulkens/Development/js/skymap/src/data/filamentBinaryFormat.ts`:

```ts
/**
 * filamentBinaryFormat — encode/decode for the `filaments.bin` runtime asset.
 *
 * Layout (little-endian):
 *
 *   ── HEADER (16 bytes) ────────────────────────────────────────────────
 *   0       4     magic    = "FILA" (0x414c4946)
 *   4       4     version  = 1 (uint32)
 *   8       4     stripCount    (uint32)
 *   12      4     vertexCount   (uint32)
 *
 *   ── STRIP-OFFSET TABLE (stripCount+1 × 4 bytes) ──────────────────────
 *   stripOffsets[0..stripCount] : uint32
 *
 *   ── VERTEX ARRAY (vertexCount × 16 bytes) ────────────────────────────
 *   vertices[i] = [x, y, z, density] : float32 × 4
 *
 * The +1 in the strip-offset table is the standard "exclusive scan"
 * convention — `stripOffsets[i]` is the starting vertex index of strip i,
 * `stripOffsets[i+1]` is one past its last vertex.  Lookups don't need
 * a bounds check.
 *
 * Why a separate format from PointCloud?  Filaments are variable-length
 * polylines, not fixed records.  Forcing them into the v4 PointCloud
 * shape would either truncate strips or pad them — either way wasting
 * bytes.  A bespoke format with a strip-offset table is ~10% smaller
 * AND simpler to render with `pass.draw(6, instanceCount)`.
 */

import type { FilamentCloud } from '../@types/FilamentCloud';

const MAGIC = 0x414c4946; // "FILA" little-endian
const VERSION = 1;
const HEADER_BYTES = 16;
const FLOATS_PER_VERTEX = 4;
const BYTES_PER_VERTEX = FLOATS_PER_VERTEX * 4;

/**
 * Encode a `FilamentCloud` to an ArrayBuffer.  Pure — no I/O.
 *
 * Throws on length-mismatch errors that indicate a malformed cloud
 * (caller bug); the runtime decoder must be able to round-trip whatever
 * we emit here without re-validating.
 */
export function encodeFilaments(cloud: FilamentCloud): ArrayBuffer {
  if (cloud.stripOffsets.length !== cloud.stripCount + 1) {
    throw new Error(
      `encodeFilaments: stripOffsets length ${cloud.stripOffsets.length} ` +
        `does not equal stripCount+1 = ${cloud.stripCount + 1}`,
    );
  }
  if (cloud.vertices.length !== cloud.vertexCount * FLOATS_PER_VERTEX) {
    throw new Error(
      `encodeFilaments: vertices length ${cloud.vertices.length} does not ` +
        `equal vertexCount × 4 = ${cloud.vertexCount * FLOATS_PER_VERTEX}`,
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

  // Strip-offset table is contiguous after the header.
  const offsetView = new Uint32Array(buf, HEADER_BYTES, cloud.stripCount + 1);
  offsetView.set(cloud.stripOffsets);

  // Vertex array follows the offset table.
  const vertexView = new Float32Array(
    buf,
    HEADER_BYTES + offsetTableBytes,
    cloud.vertexCount * FLOATS_PER_VERTEX,
  );
  vertexView.set(cloud.vertices);

  return buf;
}

/**
 * Decode an ArrayBuffer to a `FilamentCloud`.  Throws on bad magic or
 * unsupported version; the version error message points at the build
 * script so users can re-run with a single command.
 */
export function decodeFilaments(buf: ArrayBuffer): FilamentCloud {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== MAGIC) {
    throw new Error('decodeFilaments: bad magic — not a FILA file');
  }
  const version = dv.getUint32(4, true);
  if (version !== VERSION) {
    throw new Error(
      `decodeFilaments: unsupported version ${version} — please regenerate ` +
        `via "npm run build-filaments"`,
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

- [ ] **Step 5: Run the test, verify it passes**

Run:

```
npx vitest run tests/data/filamentBinaryFormat.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 6: Commit**

```
cd /Users/rulkens/Development/js/skymap && git add src/data/filamentBinaryFormat.ts src/@types/FilamentCloud.d.ts tests/data/filamentBinaryFormat.test.ts && git commit -m "feat(filaments): FILA v1 binary format with encode/decode + tests"
```

---

## Task 3: NDskl → FilamentCloud converter

**Files:**
- Modify: `tools/parsers/ndskl.ts` (add a converter helper)
- Modify: `tests/parsers/ndskl.test.ts` (add tests for the converter)

The parser from Task 1 returns a `ParsedSkeleton` with arrays-of-tuples-of-arrays. The renderer wants a flat SoA `FilamentCloud`. This task adds the conversion.

- [ ] **Step 1: Add a failing test for the converter**

Append to `/Users/rulkens/Development/js/skymap/tests/parsers/ndskl.test.ts`:

```ts
import { skeletonToFilamentCloud } from '../../tools/parsers/ndskl';

describe('skeletonToFilamentCloud', () => {
  it('flattens strips into the SoA FilamentCloud shape', () => {
    const cloud = skeletonToFilamentCloud({
      strips: [
        {
          vertices: [
            [10, 20, 30],
            [11, 21, 31],
          ],
          density: [0.9, 0.8],
        },
        {
          vertices: [
            [40, 50, 60],
            [41, 51, 61],
            [42, 52, 62],
          ],
          density: [0.7, 0.6, 0.5],
        },
      ],
    });
    expect(cloud.stripCount).toBe(2);
    expect(cloud.vertexCount).toBe(5);
    expect(Array.from(cloud.stripOffsets)).toEqual([0, 2, 5]);
    expect(Array.from(cloud.vertices)).toEqual([
      10, 20, 30, 0.9,
      11, 21, 31, 0.8,
      40, 50, 60, 0.7,
      41, 51, 61, 0.6,
      42, 52, 62, 0.5,
    ]);
  });

  it('drops zero-vertex strips defensively', () => {
    const cloud = skeletonToFilamentCloud({
      strips: [
        { vertices: [], density: [] },
        {
          vertices: [
            [1, 2, 3],
            [4, 5, 6],
          ],
          density: [0.5, 0.5],
        },
      ],
    });
    expect(cloud.stripCount).toBe(1);
    expect(cloud.vertexCount).toBe(2);
  });

  it('normalises density to [0, 1] across all strips', () => {
    const cloud = skeletonToFilamentCloud({
      strips: [
        {
          vertices: [
            [0, 0, 0],
            [1, 1, 1],
          ],
          density: [0, 100], // pre-normalisation: min=0, max=100
        },
      ],
    });
    expect(cloud.vertices[3]).toBe(0); // first vertex's density slot, normalised
    expect(cloud.vertices[7]).toBe(1); // second vertex's density slot, normalised
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run:

```
npx vitest run tests/parsers/ndskl.test.ts
```

Expected: 3 new tests fail with `skeletonToFilamentCloud` not exported.

- [ ] **Step 3: Implement the converter**

Append to `/Users/rulkens/Development/js/skymap/tools/parsers/ndskl.ts`:

```ts
import type { FilamentCloud } from '../../src/@types/FilamentCloud';

/**
 * Convert a parsed `.NDskl` skeleton to the SoA `FilamentCloud` shape
 * the renderer + binary format expect.
 *
 * Two transforms happen here:
 *
 *   1. Strips with zero vertices are silently dropped.  DisPerSE has
 *      been observed to emit empty filaments at the very edges of
 *      under-resolved volumes (saddle-to-saddle pairings with no
 *      sample points between them).  Including them would produce
 *      stripOffsets[i] === stripOffsets[i+1] which the renderer would
 *      issue a zero-instance draw for — wasted but harmless.  We drop
 *      them to keep the offset table tight.
 *
 *   2. Density is normalised to [0, 1] across all surviving vertices.
 *      DisPerSE's [FILAMENTS DATA] field_value is the absolute density
 *      at each skeleton sample, in arbitrary units depending on the
 *      DTFE input.  The shader wants a 0..1 alpha multiplier; rescaling
 *      at encode time means we don't have to thread a per-frame uniform
 *      with min/max bounds.  NaN values (when [FILAMENTS DATA] is
 *      absent) are kept as 0 — Phase 1 ignores density anyway, so this
 *      is harmless.
 */
export function skeletonToFilamentCloud(sk: ParsedSkeleton): FilamentCloud {
  // Drop empty strips.
  const live = sk.strips.filter((s) => s.vertices.length >= 2);

  const stripCount = live.length;
  const vertexCount = live.reduce((acc, s) => acc + s.vertices.length, 0);

  const stripOffsets = new Uint32Array(stripCount + 1);
  const vertices = new Float32Array(vertexCount * 4);

  // First pass: compute offsets + collect raw density for normalisation.
  let off = 0;
  let dMin = Infinity;
  let dMax = -Infinity;
  for (let i = 0; i < live.length; i++) {
    stripOffsets[i] = off;
    const strip = live[i]!;
    for (const d of strip.density) {
      if (Number.isFinite(d)) {
        if (d < dMin) dMin = d;
        if (d > dMax) dMax = d;
      }
    }
    off += strip.vertices.length;
  }
  stripOffsets[stripCount] = vertexCount;

  // Compute the normalisation scale.  Degenerate cases (all-NaN, single
  // value, etc.) collapse to zero output density — fine for Phase 1.
  const haveRange = Number.isFinite(dMin) && Number.isFinite(dMax) && dMax > dMin;
  const scale = haveRange ? 1 / (dMax - dMin) : 0;

  // Second pass: write the interleaved vertex array.
  let v = 0;
  for (const strip of live) {
    for (let s = 0; s < strip.vertices.length; s++) {
      const [x, y, z] = strip.vertices[s]!;
      const d = strip.density[s]!;
      vertices[v * 4 + 0] = x;
      vertices[v * 4 + 1] = y;
      vertices[v * 4 + 2] = z;
      vertices[v * 4 + 3] = haveRange && Number.isFinite(d) ? (d - dMin) * scale : 0;
      v++;
    }
  }

  return { stripCount, vertexCount, stripOffsets, vertices };
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run:

```
npx vitest run tests/parsers/ndskl.test.ts
```

Expected: all (5 + 3) = 8 tests pass.

- [ ] **Step 5: Commit**

```
cd /Users/rulkens/Development/js/skymap && git add tools/parsers/ndskl.ts tests/parsers/ndskl.test.ts && git commit -m "feat(filaments): NDskl → FilamentCloud converter"
```

---

## Task 4: buildFilaments CLI orchestrator

**Files:**
- Create: `tools/buildFilaments.ts`
- Modify: `package.json` (add npm script)

The orchestrator does FOUR things:

1. Reads the merged survey positions out of `public/data/{sdss,2mrs,glade}.bin`.
2. Writes a temporary TSV file at `data/raw/galaxies_merged.tsv` with one line per galaxy: `x y z` (Mpc).
3. Shells out to `mse` (Morse-Smale extraction) and `skelconv` (persistence cut + skeleton extraction).
4. Reads back the resulting `.NDskl`, parses it, converts to FilamentCloud, encodes, writes to `public/data/filaments.bin`.

We hardcode the persistence cut at 5σ + 2 smoothing passes per the 2025 SDSS DR18 paper. A `--cut` CLI flag allows overrides for testing.

- [ ] **Step 1: Implement the orchestrator**

Create `/Users/rulkens/Development/js/skymap/tools/buildFilaments.ts`:

```ts
#!/usr/bin/env node
/**
 * buildFilaments — assemble the cosmic-web filament skeleton.
 *
 * Pipeline:
 *
 *   1. Read public/data/{sdss,2mrs,glade}.bin → merged xyz positions
 *   2. Write data/raw/galaxies_merged.tsv (one line per galaxy: "x y z")
 *   3. Run DisPerSE: mse + skelconv (5σ persistence, 2 smoothing passes)
 *   4. Parse the resulting .NDskl, convert to FilamentCloud, encode FILA v1
 *   5. Write public/data/filaments.bin
 *
 * Run order: must be after `npm run build-all` so the survey .bin files
 * exist.
 *
 * External requirements:
 *   - DisPerSE installed (mse + skelconv on PATH).  See README for build
 *     instructions; this script throws a friendly error if either binary
 *     is missing.
 *   - ~16 GB RAM during the mse step (DisPerSE peaks high).
 *   - 6-12 hours wall time on a workstation for the merged catalogue.
 *
 * The `--cut` flag overrides the default 5σ persistence threshold (e.g.
 * `--cut 7` for a sparser, more conservative skeleton).
 */
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodePointCloud } from '../src/data/pointCloudFormat.js';
import { parseNDskl, skeletonToFilamentCloud } from './parsers/ndskl.js';
import { encodeFilaments } from '../src/data/filamentBinaryFormat.js';

/** Default persistence cut in σ.  2025 SDSS DR18 paper used 5σ + 2 smoothing. */
const DEFAULT_PERSISTENCE_CUT = 5;
const DEFAULT_SMOOTHING_PASSES = 2;

function parseArgs(): { cut: number; smooth: number } {
  const argv = process.argv.slice(2);
  let cut = DEFAULT_PERSISTENCE_CUT;
  let smooth = DEFAULT_SMOOTHING_PASSES;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--cut') cut = Number(argv[++i] ?? cut);
    else if (argv[i] === '--smooth') smooth = Number(argv[++i] ?? smooth);
  }
  return { cut, smooth };
}

function checkDisperse(): void {
  const r = spawnSync('mse', ['--help'], { encoding: 'utf8' });
  if (r.error || r.status !== 0) {
    process.stderr.write(
      'error: DisPerSE `mse` binary not found on PATH.\n' +
        'Install: see README "Filament skeleton" section.\n',
    );
    process.exit(1);
  }
}

function readMergedPositions(): { count: number; positions: Float32Array } {
  const sources = ['sdss.bin', '2mrs.bin', 'glade.bin'] as const;
  const clouds = sources
    .map((name) => {
      const path = resolve('public/data', name);
      if (!existsSync(path)) {
        process.stderr.write(`warning: ${path} not found — skipping\n`);
        return null;
      }
      return decodePointCloud(readFileSync(path).buffer);
    })
    .filter(<T,>(c: T | null): c is T => c !== null);
  const total = clouds.reduce((acc, c) => acc + c.count, 0);
  const positions = new Float32Array(total * 3);
  let off = 0;
  for (const c of clouds) {
    positions.set(c.positions, off);
    off += c.positions.length;
  }
  return { count: total, positions };
}

function writeTsvInput(path: string, positions: Float32Array, count: number): void {
  const lines: string[] = [];
  for (let i = 0; i < count; i++) {
    lines.push(
      `${positions[i * 3]} ${positions[i * 3 + 1]} ${positions[i * 3 + 2]}`,
    );
  }
  if (!existsSync(dirname(path))) mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, lines.join('\n') + '\n');
}

function runDisperse(tsvPath: string, cut: number, smooth: number): string {
  // mse: Morse-Smale extraction.  --periodicity 0 0 0 disables periodic BCs;
  // --upSkl writes the skeleton to disk.
  process.stderr.write(`running mse on ${tsvPath} (this can take hours)…\n`);
  execSync(`mse ${tsvPath} --upSkl --forceLoops --nsig ${cut}`, {
    stdio: 'inherit',
  });
  // mse writes <input>.NDskl alongside the input file.
  const skelRaw = `${tsvPath}.NDskl`;

  // skelconv: post-process — apply persistence threshold, smooth.
  process.stderr.write(`running skelconv (smooth=${smooth})…\n`);
  execSync(`skelconv ${skelRaw} -smooth ${smooth} -trimBelow robustness ${cut} -to NDskl_ascii`, {
    stdio: 'inherit',
  });
  // skelconv writes <input>.S<cut>.NDskl_ascii.
  return `${skelRaw}.S${cut}.NDskl_ascii`;
}

async function main(): Promise<void> {
  const { cut, smooth } = parseArgs();
  process.stderr.write(`buildFilaments — cut=${cut}σ smooth=${smooth}\n`);

  checkDisperse();

  const { count, positions } = readMergedPositions();
  process.stderr.write(`  merged ${count.toLocaleString()} galaxy positions\n`);

  const tsvPath = resolve('data/raw/galaxies_merged.tsv');
  writeTsvInput(tsvPath, positions, count);
  process.stderr.write(`  wrote ${tsvPath}\n`);

  const ndsklPath = runDisperse(tsvPath, cut, smooth);
  process.stderr.write(`  parsed skeleton at ${ndsklPath}\n`);

  const skel = parseNDskl(readFileSync(ndsklPath, 'utf8'));
  const cloud = skeletonToFilamentCloud(skel);
  process.stderr.write(
    `  ${cloud.stripCount.toLocaleString()} strips, ` +
      `${cloud.vertexCount.toLocaleString()} vertices\n`,
  );

  const outPath = resolve('public/data/filaments.bin');
  const buf = encodeFilaments(cloud);
  writeFileSync(outPath, Buffer.from(buf));
  process.stderr.write(
    `wrote filaments.bin (${(buf.byteLength / 1024 / 1024).toFixed(1)} MB)\n`,
  );
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`error: ${(err as Error).stack ?? (err as Error).message}\n`);
    process.exit(1);
  });
}
```

- [ ] **Step 2: Add the npm script**

In `/Users/rulkens/Development/js/skymap/package.json`, add to the scripts block alongside `build-all`:

```json
    "build-filaments": "tsx tools/buildFilaments.ts",
```

- [ ] **Step 3: Run typecheck**

Run:

```
cd /Users/rulkens/Development/js/skymap && npm run typecheck
```

Expected: clean. (Don't actually run `npm run build-filaments` yet — it requires DisPerSE installed and takes hours; we cover that in Task 11's verification step.)

- [ ] **Step 4: Commit**

```
cd /Users/rulkens/Development/js/skymap && git add tools/buildFilaments.ts package.json && git commit -m "feat(filaments): build-filaments CLI orchestrator"
```

---

## Task 5: cloudLoader fetch helper for filaments.bin

**Files:**
- Modify: `src/services/engine/cloudLoader.ts`

The existing `loadAllClouds()` is hard-wired to the v4 PointCloud schema. Filaments use a different binary format, so we add a parallel function.

- [ ] **Step 1: Add the loader function**

Append to `/Users/rulkens/Development/js/skymap/src/services/engine/cloudLoader.ts`:

```ts
import { decodeFilaments } from '../../data/filamentBinaryFormat';
import type { FilamentCloud } from '../../@types/FilamentCloud';

/**
 * Fetch and decode the optional `filaments.bin`.  Returns null when the
 * file is missing — filaments are an optional decorative layer; the
 * renderer must work without them, so we silently fall back rather than
 * throwing.  Network errors and decode errors both collapse to null.
 *
 * The famous-galaxies sidecar pattern (see famousMetaLoader.ts) is the
 * direct precedent here — small auxiliary asset, fail-safe to "feature
 * disabled" rather than aborting startup.
 */
export async function loadFilaments(): Promise<FilamentCloud | null> {
  try {
    const res = await fetch('/data/filaments.bin');
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return decodeFilaments(buf);
  } catch (err) {
    console.warn('[cloudLoader] filaments.bin failed:', err);
    return null;
  }
}
```

Note: the format module lives at `src/data/filamentBinaryFormat.ts` (Task 2) — same directory as `pointCloudFormat.ts` — so the runtime imports it via a normal in-tree relative path with no `src/`↔`tools/` boundary crossing.

- [ ] **Step 2: Run typecheck**

Run:

```
cd /Users/rulkens/Development/js/skymap && npm run typecheck && npm test
```

Expected: clean.

- [ ] **Step 3: Commit**

```
cd /Users/rulkens/Development/js/skymap && git add src/services/engine/cloudLoader.ts && git commit -m "feat(loader): add loadFilaments() helper"
```

---

## Task 6: filaments.wgsl shader

**Files:**
- Create: `src/services/gpu/shaders/filaments.wgsl`

This is the instanced-quad line shader described at the top of this plan ("Render strategy"). One vertex stage that expands a unit-quad UV into a thick line segment between two filament vertices, plus a fragment stage that does soft-edge falloff.

- [ ] **Step 1: Implement the shader**

Create `/Users/rulkens/Development/js/skymap/src/services/gpu/shaders/filaments.wgsl`:

```wgsl
// filaments.wgsl — instanced-quad line shader for the cosmic-web skeleton.
//
// One instance per filament SEGMENT (consecutive vertex pair within a
// strip).  The instance attributes are the segment's two endpoints +
// per-endpoint density.  The vertex stage is invoked 6 times per
// instance (two triangles forming a screen-aligned thick rectangle
// between the two endpoints).
//
// Why instanced quads instead of native line topology?  WebGPU's
// `topology: 'line-list'` always renders 1-pixel-wide lines on most
// platforms (no `setLineWidth` exists, by spec).  For visible-from-
// orbit cosmic-web filaments we want anti-aliased thick lines with a
// soft edge falloff — only the instanced-quad trick gives us that.
//
// The unit-quad geometry is shared static data:
//   indices (constant, 6 per instance):  0 1 2 1 3 2
//   per-quad-vertex attribute (4 verts):  uv = (0,0), (1,0), (0,1), (1,1)
// uv.x picks startpoint vs endpoint; uv.y picks one side of the line vs
// the other (mapped to ±half-width along the screen-space perpendicular).

struct Uniforms {
  viewProj : mat4x4<f32>,
  viewport : vec2<f32>,    // [w, h] in physical pixels
  halfWidthPx : f32,       // line half-width in pixels
  pad0 : f32,
};

@group(0) @binding(0) var<uniform> u : Uniforms;

struct PerVertex {
  @location(0) uv : vec2<f32>,           // (0..1, 0..1) — quad-corner UV
  @location(1) startPos : vec3<f32>,     // segment start in world Mpc
  @location(2) startDensity : f32,       // 0..1
  @location(3) endPos : vec3<f32>,       // segment end in world Mpc
  @location(4) endDensity : f32,         // 0..1
};

struct VSOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) uv : vec2<f32>,
  @location(1) density : f32,
};

@vertex
fn vs(in : PerVertex) -> VSOut {
  // Project both endpoints to clip space.
  let aClip = u.viewProj * vec4<f32>(in.startPos, 1.0);
  let bClip = u.viewProj * vec4<f32>(in.endPos, 1.0);

  // Choose which endpoint this corner uses (uv.x = 0 → start, 1 → end).
  let endpoint = select(aClip, bClip, in.uv.x > 0.5);

  // Compute the screen-space tangent and perpendicular for THIS segment.
  // We do the math in NDC then scale to pixels — clip-space requires the
  // perspective divide first.
  let aNdc = aClip.xy / aClip.w;
  let bNdc = bClip.xy / bClip.w;
  let tangent = normalize(bNdc - aNdc);
  let perp = vec2<f32>(-tangent.y, tangent.x);

  // pixel width → NDC offset: (px / halfViewport) is the NDC-space length
  // of one pixel.  Multiplied by halfWidthPx gives the half-width in NDC.
  let halfWidthNdc = perp * (u.halfWidthPx / (u.viewport * 0.5));

  // uv.y in [0, 1] picks +halfWidth or -halfWidth.
  let sideSign = in.uv.y * 2.0 - 1.0;
  let offsetNdc = halfWidthNdc * sideSign;

  // Apply the offset to the chosen endpoint, then re-multiply by w to
  // restore clip space (perspective-correct interpolation).
  var out : VSOut;
  out.clip = vec4<f32>(
    endpoint.xy + offsetNdc * endpoint.w,
    endpoint.zw,
  );
  // Pass uv.y through for the fragment falloff; lerp density between
  // start/end based on uv.x.
  out.uv = in.uv;
  out.density = mix(in.startDensity, in.endDensity, in.uv.x);
  return out;
}

@fragment
fn fs(in : VSOut) -> @location(0) vec4<f32> {
  // Soft anti-aliased edge: uv.y ∈ [0, 1], peak at 0.5.
  // smoothstep(0, 0.1, x) and (1 - smoothstep(0.9, 1, x)) carve a soft
  // window around the centre.  Multiplied together they give a
  // perpendicular-distance falloff that fades to 0 at the line's edges.
  let edgeFade =
    smoothstep(0.0, 0.1, in.uv.y) * (1.0 - smoothstep(0.9, 1.0, in.uv.y));

  // Phase 1: ignore density (constant alpha + colour).  Phase 2 will
  // multiply by density for ridge-brightness modulation.
  let alpha = edgeFade * 0.6;
  let tint = vec3<f32>(0.65, 0.55, 0.95); // soft purple, matches the canonical
                                          // cosmic-web visual aesthetic.
  return vec4<f32>(tint * alpha, alpha);  // pre-multiplied alpha
}
```

- [ ] **Step 2: Commit (no test possible for raw WGSL)**

```
cd /Users/rulkens/Development/js/skymap && git add src/services/gpu/shaders/filaments.wgsl && git commit -m "feat(filaments): WGSL instanced-quad line shader"
```

---

## Task 7: FilamentRenderer GPU pipeline

**Files:**
- Create: `src/services/gpu/filamentRenderer.ts`
- Create: `tests/services/gpu/filamentRenderer.test.ts`

The renderer owns:
- One static index buffer `[0, 1, 2, 1, 3, 2]` (six u16).
- One static quad-corner vertex buffer (4 × vec2 = 32 bytes).
- One per-segment instance buffer (per call to `upload(cloud)`).
- One uniform buffer (32 bytes).

`draw(pass, viewProj, viewportPx, halfWidthPx)` writes the uniform, binds the pipeline, issues a single `pass.drawIndexed(6, instanceCount)`.

- [ ] **Step 1: Add a failing test for the segment-count math**

The instance buffer has one entry per segment, where segment count = `vertexCount - stripCount` (since each strip of N vertices yields N-1 segments). Test the helper:

Create `/Users/rulkens/Development/js/skymap/tests/services/gpu/filamentRenderer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildSegmentInstances } from '../../../src/services/gpu/filamentRenderer';
import type { FilamentCloud } from '../../../src/@types/FilamentCloud';

describe('buildSegmentInstances', () => {
  it('emits one instance per consecutive vertex pair within each strip', () => {
    // Two strips: A (3 verts → 2 segments), B (2 verts → 1 segment) = 3 segments
    const cloud: FilamentCloud = {
      stripCount: 2,
      vertexCount: 5,
      stripOffsets: new Uint32Array([0, 3, 5]),
      vertices: new Float32Array([
        10, 20, 30, 0.9,
        11, 21, 31, 0.8,
        12, 22, 32, 0.7,
        40, 50, 60, 0.6,
        41, 51, 61, 0.5,
      ]),
    };
    const result = buildSegmentInstances(cloud);
    expect(result.segmentCount).toBe(3);
    expect(result.data.length).toBe(3 * 8); // 8 floats per segment

    // First segment of strip A: (v0, v1)
    expect(Array.from(result.data.slice(0, 8))).toEqual([
      10, 20, 30, 0.9, 11, 21, 31, 0.8,
    ]);
    // Second segment of strip A: (v1, v2)
    expect(Array.from(result.data.slice(8, 16))).toEqual([
      11, 21, 31, 0.8, 12, 22, 32, 0.7,
    ]);
    // First (only) segment of strip B: (v3, v4)
    expect(Array.from(result.data.slice(16, 24))).toEqual([
      40, 50, 60, 0.6, 41, 51, 61, 0.5,
    ]);
  });

  it('handles zero strips', () => {
    const cloud: FilamentCloud = {
      stripCount: 0,
      vertexCount: 0,
      stripOffsets: new Uint32Array([0]),
      vertices: new Float32Array(0),
    };
    const result = buildSegmentInstances(cloud);
    expect(result.segmentCount).toBe(0);
    expect(result.data.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run:

```
npx vitest run tests/services/gpu/filamentRenderer.test.ts
```

Expected: `Cannot find module '.../filamentRenderer'`.

- [ ] **Step 3: Implement the renderer**

Create `/Users/rulkens/Development/js/skymap/src/services/gpu/filamentRenderer.ts`:

```ts
/**
 * FilamentRenderer — GPU pipeline for the cosmic-web filament skeleton
 * overlay.
 *
 * Strategy: instanced-quad line technique (see `shaders/filaments.wgsl`).
 * Each filament segment becomes one quad instance; the vertex shader
 * expands the unit-square UV into a thick screen-aligned segment between
 * the two endpoints.  This is necessary because native WebGPU line
 * topology is hardcoded to 1-pixel width.
 *
 * Buffers:
 *
 *   indexBuffer (static)        :  6 × uint16  → two-triangle quad
 *   quadVertexBuffer (static)   :  4 × vec2<f32> → corner UVs
 *   segmentInstanceBuffer       :  segmentCount × 8 × f32 → per-segment endpoints
 *   uniformBuffer               :  32 bytes (viewProj + viewport + halfWidth)
 *
 * Public API:
 *   - new FilamentRenderer(device, format)
 *   - upload(cloud: FilamentCloud)  → builds the instance buffer
 *   - draw(pass, viewProj, viewportPx, halfWidthPx)
 *   - clear()                       → drops the instance buffer
 *   - destroy()                     → releases all GPU resources
 */
import shaderSource from './shaders/filaments.wgsl?raw';
import type { FilamentCloud } from '../../@types/FilamentCloud';
import type { mat4 } from 'gl-matrix';

const FLOATS_PER_SEGMENT = 8; // startxyz + startD + endxyz + endD

// Uniform block layout (std140-ish, WGSL host-shareable):
//   viewProj    mat4   = 64 bytes
//   viewport    vec2   =  8 bytes
//   halfWidthPx f32    =  4 bytes
//   _pad        f32    =  4 bytes  (round to 16-byte alignment)
// Total: 80 bytes.  WebGPU rounds uniform-buffer sizes up to a multiple
// of 16, so 80 is already aligned — no extra padding needed.
const UNIFORM_BYTES = 80;

/**
 * Build a flat per-segment instance array from a `FilamentCloud`.  One
 * instance per consecutive (v_i, v_{i+1}) pair within each strip.
 *
 * Public so tests can exercise the layout without instantiating the
 * full GPU pipeline.
 */
export function buildSegmentInstances(cloud: FilamentCloud): {
  segmentCount: number;
  data: Float32Array;
} {
  // Total segment count = sum over strips of (verts - 1) = totalVerts - stripCount.
  const segmentCount = cloud.vertexCount - cloud.stripCount;
  if (segmentCount <= 0) {
    return { segmentCount: 0, data: new Float32Array(0) };
  }
  const data = new Float32Array(segmentCount * FLOATS_PER_SEGMENT);

  let outIdx = 0;
  for (let s = 0; s < cloud.stripCount; s++) {
    const lo = cloud.stripOffsets[s]!;
    const hi = cloud.stripOffsets[s + 1]!;
    for (let v = lo; v < hi - 1; v++) {
      const a = v * 4;
      const b = (v + 1) * 4;
      data[outIdx + 0] = cloud.vertices[a + 0]!;
      data[outIdx + 1] = cloud.vertices[a + 1]!;
      data[outIdx + 2] = cloud.vertices[a + 2]!;
      data[outIdx + 3] = cloud.vertices[a + 3]!;
      data[outIdx + 4] = cloud.vertices[b + 0]!;
      data[outIdx + 5] = cloud.vertices[b + 1]!;
      data[outIdx + 6] = cloud.vertices[b + 2]!;
      data[outIdx + 7] = cloud.vertices[b + 3]!;
      outIdx += FLOATS_PER_SEGMENT;
    }
  }
  return { segmentCount, data };
}

export class FilamentRenderer {
  private readonly pipeline: GPURenderPipeline;
  private readonly bindGroup: GPUBindGroup;
  private readonly uniformBuffer: GPUBuffer;
  private readonly indexBuffer: GPUBuffer;
  private readonly quadVertexBuffer: GPUBuffer;
  private instanceBuffer: GPUBuffer | null = null;
  private segmentCount = 0;

  constructor(
    private readonly device: GPUDevice,
    /**
     * The colour-attachment format the pipeline writes into.  In skymap
     * this is the HDR offscreen target (`rgba16float`) — see
     * `src/services/gpu/hdrTarget.ts` and the rationale in
     * `renderFrame.ts`.  Filaments accumulate additively into the same
     * float buffer the points/quads/disks write, then the tone-map pass
     * compresses everything onto the swap chain.  Drawing direct to the
     * swap chain would clip on overlap — exactly the visual cosmic-web
     * scenes need to NOT do.
     */
    hdrFormat: GPUTextureFormat,
  ) {
    const module = device.createShaderModule({ code: shaderSource });

    this.uniformBuffer = device.createBuffer({
      size: UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Static index buffer: two triangles forming the quad.
    const indices = new Uint16Array([0, 1, 2, 1, 3, 2]);
    this.indexBuffer = device.createBuffer({
      size: indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.indexBuffer, 0, indices);

    // Static quad-corner buffer: 4 vertices × vec2 = 32 bytes.
    const quadCorners = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
    this.quadVertexBuffer = device.createBuffer({
      size: quadCorners.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.quadVertexBuffer, 0, quadCorners);

    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
      ],
    });

    this.bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    });

    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [
          // Per-quad-vertex: uv vec2
          {
            arrayStride: 8,
            stepMode: 'vertex',
            attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }],
          },
          // Per-instance: startxyz + startDensity + endxyz + endDensity
          {
            arrayStride: FLOATS_PER_SEGMENT * 4,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 1, offset: 0, format: 'float32x3' }, // startPos
              { shaderLocation: 2, offset: 12, format: 'float32' },  // startDensity
              { shaderLocation: 3, offset: 16, format: 'float32x3' }, // endPos
              { shaderLocation: 4, offset: 28, format: 'float32' },  // endDensity
            ],
          },
        ],
      },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [
          {
            format: hdrFormat,
            // Additive blending — filaments glow over the existing scene
            // without occluding the point cloud below them.
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-list' },
      // Note: the HDR pass in `renderFrame.ts` does NOT attach a depth
      // texture — points/quads/disks all skip depth.  Filaments follow
      // the same convention; if a future plan adds a depth attachment
      // to the HDR pass, mirror the points-pipeline's depthStencil
      // block here.
    });
  }

  /** Upload a new filament cloud, replacing any prior buffer. */
  upload(cloud: FilamentCloud): void {
    const { segmentCount, data } = buildSegmentInstances(cloud);
    this.segmentCount = segmentCount;
    if (segmentCount === 0) {
      this.instanceBuffer?.destroy();
      this.instanceBuffer = null;
      return;
    }
    this.instanceBuffer?.destroy();
    this.instanceBuffer = this.device.createBuffer({
      size: data.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.instanceBuffer, 0, data);
  }

  /** Drop the loaded filaments without destroying the pipeline itself. */
  clear(): void {
    this.instanceBuffer?.destroy();
    this.instanceBuffer = null;
    this.segmentCount = 0;
  }

  draw(
    pass: GPURenderPassEncoder,
    viewProj: mat4,
    viewportPx: [number, number],
    halfWidthPx: number,
  ): void {
    if (this.segmentCount === 0 || !this.instanceBuffer) return;

    // Pack uniforms.  See UNIFORM_BYTES comment above for the byte layout.
    //   f32[0..15]   viewProj (mat4)
    //   f32[16..17]  viewport (vec2)
    //   f32[18]      halfWidthPx
    //   f32[19]      padding (zero)
    const buf = new ArrayBuffer(UNIFORM_BYTES);
    const f32 = new Float32Array(buf);
    f32.set(viewProj as Float32Array, 0);
    f32[16] = viewportPx[0];
    f32[17] = viewportPx[1];
    f32[18] = halfWidthPx;
    f32[19] = 0;
    this.device.queue.writeBuffer(this.uniformBuffer, 0, buf);

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.setIndexBuffer(this.indexBuffer, 'uint16');
    pass.setVertexBuffer(0, this.quadVertexBuffer);
    pass.setVertexBuffer(1, this.instanceBuffer);
    pass.drawIndexed(6, this.segmentCount);
  }

  destroy(): void {
    this.uniformBuffer.destroy();
    this.indexBuffer.destroy();
    this.quadVertexBuffer.destroy();
    this.instanceBuffer?.destroy();
  }
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run:

```
npx vitest run tests/services/gpu/filamentRenderer.test.ts
```

Expected: 2 tests pass. (The tests only exercise `buildSegmentInstances`, which is pure JS; the GPU bits aren't unit-tested here — they're verified visually in Task 11.)

- [ ] **Step 5: Commit**

```
cd /Users/rulkens/Development/js/skymap && git add src/services/gpu/filamentRenderer.ts tests/services/gpu/filamentRenderer.test.ts && git commit -m "feat(filaments): FilamentRenderer GPU pipeline (instanced-quad lines)"
```

---

## Task 8: Engine integration

**Files:**
- Modify: `src/services/engine/engine.ts`
- Modify: `src/services/engine/renderFrame.ts`
- Modify: `src/@types/EngineHandle.d.ts`

Wire `FilamentRenderer` into the per-frame draw path.

Architecture note: post-refactor, the per-frame loop lives in `renderFrame.ts` (see its docstring — points → thumbnails → tone-map). Engine.ts owns *construction* of the renderers and threads them into `renderFrame()` via the `RenderFrameInput` bag. So this task touches both files: engine.ts for instantiation + the public `setFilamentsEnabled` toggle, renderFrame.ts for the actual draw call inside the HDR pass.

- [ ] **Step 1: Extend `EngineHandle`**

In `/Users/rulkens/Development/js/skymap/src/@types/EngineHandle.d.ts`, add the new method declaration:

```ts
  /**
   * Toggle the cosmic-web filament-skeleton overlay on or off.
   *
   * No-op if `filaments.bin` failed to load (the file is optional —
   * present only after `npm run build-filaments` has been run).  When
   * the overlay is enabled but the binary is missing, the call still
   * succeeds; nothing renders, no error.
   *
   * Defaults to false at engine startup so the user opts in via the
   * Settings panel.
   */
  setFilamentsEnabled?: (enabled: boolean) => void;
```

- [ ] **Step 2: Construct the renderer + load the binary in engine.ts**

In `/Users/rulkens/Development/js/skymap/src/services/engine/engine.ts`, follow the `new PointRenderer(device, 'rgba16float')` pattern (search the file for it) — filaments draw into the same HDR target.

1. Imports near the top:
   ```ts
   import { FilamentRenderer } from '../gpu/filamentRenderer';
   import { loadFilaments } from './cloudLoader';
   ```

2. Closure state, alongside the other renderer references:
   ```ts
   let filamentRenderer: FilamentRenderer | null = null;
   let filamentsEnabled = false;
   ```

3. Inside the GPU-init block (next to where `PointRenderer` / `QuadRenderer` get constructed), add:
   ```ts
   filamentRenderer = new FilamentRenderer(device, 'rgba16float');
   loadFilaments().then((cloud) => {
     if (cloud && filamentRenderer) {
       filamentRenderer.upload(cloud);
       console.log(
         `[engine] filaments: ${cloud.stripCount} strips, ${cloud.vertexCount} verts`,
       );
       scheduler.requestRender(); // wake the render-on-demand loop so the
                                   // skeleton appears as soon as it loads
     }
   });
   ```

4. In the public-API object the engine returns, add:
   ```ts
   setFilamentsEnabled(enabled) {
     filamentsEnabled = enabled;
     scheduler.requestRender(); // toggling visibility is an event; force a redraw
   },
   ```

5. In `destroy()`, add `filamentRenderer?.destroy();`.

6. Wherever `renderFrame()` is invoked, thread the new fields through `RenderFrameInput` (added in Step 3 below):
   ```ts
   renderFrame({
     // …existing fields…
     filamentRenderer,
     filamentsEnabled,
   });
   ```

- [ ] **Step 3: Add the draw call to renderFrame.ts**

In `/Users/rulkens/Development/js/skymap/src/services/engine/renderFrame.ts`, extend `RenderFrameInput` with the new dependencies and emit the draw call inside the existing HDR `pass`, AFTER `thumbnails.runFrame(...)` and BEFORE `pass.end()`:

1. In the `RenderFrameInput` type (alongside `pointRenderer`, `thumbnails`, etc.), add:
   ```ts
   filamentRenderer: FilamentRenderer | null;
   ```
   And in the `RenderFrameSettings` type, add:
   ```ts
   filamentsEnabled: boolean;
   ```

2. Import the type at the top of the file:
   ```ts
   import type { FilamentRenderer } from '../gpu/filamentRenderer';
   ```

3. Just before `pass.end()` (inside the HDR pass, after `thumbnails.runFrame`), add:
   ```ts
   // ── Filament-skeleton overlay ──────────────────────────────────────
   //
   // Draws into the SAME HDR pass as points/thumbnails so the additive
   // contribution accumulates in float-precision before tone mapping.
   // No depth attachment in this pass (mirrors the point/quad/disk
   // convention).  Cheap to skip when toggled off — a single null check.
   if (settings.filamentsEnabled && filamentRenderer) {
     filamentRenderer.draw(
       pass,
       viewProj,
       [canvasWidth, canvasHeight],
       1.5, // half-width in pixels — empirically pleasant for cosmic-web look
     );
   }
   ```

- [ ] **Step 4: Run typecheck + tests**

Run:

```
cd /Users/rulkens/Development/js/skymap && npm run typecheck && npm test
```

Expected: clean.

- [ ] **Step 5: Commit**

```
cd /Users/rulkens/Development/js/skymap && git add src/services/engine/engine.ts src/services/engine/renderFrame.ts src/@types/EngineHandle.d.ts && git commit -m "feat(engine): wire FilamentRenderer into the HDR pass"
```

---

## Task 9: SettingsPanel toggle

**Files:**
- Modify: `src/components/SettingsPanel/SettingsPanel.tsx`
- Modify: `src/App.tsx`

Add a "Filaments" checkbox following the existing pattern (`galaxyTexturesEnabled`, `highlightFallback`, etc.).

- [ ] **Step 1: Add the prop + checkbox to SettingsPanel**

Open `/Users/rulkens/Development/js/skymap/src/components/SettingsPanel/SettingsPanel.tsx`. Find the existing `galaxyTexturesEnabled` checkbox (search for `galaxy-textures` or similar). Below it, add an analogous block:

```tsx
        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={filamentsEnabled}
            onChange={(e) => onFilamentsChange(e.target.checked)}
          />
          <span>Filaments (cosmic web overlay)</span>
        </label>
```

Add the matching props to `SettingsPanelProps`:

```tsx
  filamentsEnabled: boolean;
  onFilamentsChange: (enabled: boolean) => void;
```

- [ ] **Step 2: Wire in App.tsx**

Add a state hook (defaulting to false):

```tsx
const [filamentsEnabled, setFilamentsEnabled] = useState(false);
```

Pass the prop pair to `<SettingsPanel ...>`:

```tsx
filamentsEnabled={filamentsEnabled}
onFilamentsChange={(enabled) => {
  setFilamentsEnabled(enabled);
  handleRef.current?.setFilamentsEnabled?.(enabled);
}}
```

- [ ] **Step 3: Run typecheck + tests**

```
cd /Users/rulkens/Development/js/skymap && npm run typecheck && npm test
```

Expected: clean.

- [ ] **Step 4: Commit**

```
cd /Users/rulkens/Development/js/skymap && git add src/components/SettingsPanel/SettingsPanel.tsx src/App.tsx && git commit -m "feat(ui): SettingsPanel toggle for filament overlay"
```

---

## Task 10: README documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a section**

Add a new section under the existing data-pipeline docs (after "Loading multi-survey data"):

```markdown
### Cosmic-web filament skeleton (optional)

Renders the filament skeleton — the network of 1D ridges connecting
galaxy clusters — as an additive purple overlay on the point cloud.
Optional; the renderer works without it.

#### Build the skeleton (one-time, slow)

The skeleton is computed offline by **DisPerSE** (Sousbie 2011),
a C++ Morse-theory-based topological extractor.  Install:

```bash
git clone https://gitlab.com/florent.sousbie/disperse.git /tmp/disperse
cd /tmp/disperse
mkdir build && cd build
cmake .. && make -j 4 && sudo make install
```

Build deps: CGAL (`brew install cgal`), boost, CMake.  Build time: ~15 min.

Run order (after `npm run build-all`):

```bash
npm run build-filaments
```

Wall time: 6–12 hours on a workstation.  RAM peak: ~16 GB.  Output:
`public/data/filaments.bin` (~5 MB at the default 5σ persistence cut).

#### Run-time toggle

Enable in the Settings panel ("Filaments — cosmic web overlay").  Off
by default to avoid loading the 5 MB binary on first paint.
```

- [ ] **Step 2: Commit**

```
cd /Users/rulkens/Development/js/skymap && git add README.md && git commit -m "docs(readme): document filament-skeleton build + toggle"
```

---

## Task 11: Visual verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full type + test suites**

```
cd /Users/rulkens/Development/js/skymap && npm run typecheck && npm test
```

Expected: clean.  Total tests: baseline + ~13 (5 NDskl parser + 3 NDskl converter + 5 binary format + 2 segment-instances).

- [ ] **Step 2: Build the skeleton (requires DisPerSE installed)**

```
cd /Users/rulkens/Development/js/skymap && npm run build-filaments
```

Expected output (rough): "merged ~2.5M galaxy positions", an `mse` run lasting hours, "10,000-50,000 strips", "~300,000-1,500,000 vertices", final `wrote filaments.bin (5-25 MB)`.

If `mse` is missing, the script exits with a clear error pointing at the README install steps. Skip Steps 3+ for any verification pass run before DisPerSE is built.

- [ ] **Step 3: Browser verification**

Reload the dev server.  In the JS console, look for the `[engine] filaments: ...` log line confirming the binary loaded.  Open the Settings panel; the new "Filaments" checkbox should be present, off.  Toggle it on.

Visually verify:

1. Pale purple lines appear connecting galaxy clusters.
2. The lines have a soft glow with anti-aliased edges (not 1-pixel hard lines).
3. Toggling off cleanly removes them with no visible artefact in the point cloud.
4. Camera orbit + zoom continues to work smoothly with filaments on (no FPS catastrophe).
5. Picking still works — clicking a galaxy still selects it; the filament overlay does not steal hover/click events (filaments don't write depth and don't participate in picking).

- [ ] **Step 4: Note any issues**

If filaments look too thick or too thin, adjust the `halfWidthPx` argument to `filamentRenderer.draw(...)` in `renderFrame.ts` (currently 1.5).
If the colour is wrong, edit the `tint` constant in `filaments.wgsl`.
If the FPS drops noticeably, reduce the persistence cut (re-run with `--cut 7`) for a sparser skeleton.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| Architecture (offline build → binary → WGSL render) | T1-T10 |
| Binary format FILA v1 | T2 |
| Render strategy (instanced-quad lines) | T6, T7 |
| Render order (after disks, additive) | T8 |
| Persistence cut 5σ + 2 smoothing passes | T4 |
| Settings toggle | T9 |
| README docs | T10 |
| Visual verification | T11 |

All in-scope items mapped. Out-of-scope items (per-segment density modulation in shader; persistence slider; SDSS footprint mask; Local-Group filtering; filament picking) are explicitly listed in the Scope section and deferred to future plans.

**Placeholder scan:** No "TBD"/"TODO"/"implement later"/"similar to Task N". Every code block is complete and self-contained — including Task 7's `UNIFORM_BYTES = 80` constant + matching f32[16..19] uniform packing (the post-audit revision dropped the earlier "WAIT — fix this" call-out in favour of correct code from the start).

**Type consistency:**
- `FilamentCloud` defined T2, consumed T3, T5, T7, T8.
- `ParsedSkeleton` defined T1, consumed T3.
- `FilamentRenderer` constructor signature consistent across T7 (defined) and T8 (used).
- `setFilamentsEnabled` in `EngineHandle` (T8 Step 1) matches `App.tsx` use (T9 Step 2).
- `buildSegmentInstances` exported from `filamentRenderer.ts` (T7 Step 3) matches the test import (T7 Step 1).

All names align. Plan is internally consistent.

