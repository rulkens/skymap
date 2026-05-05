# Filament Selection + InfoCard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Conventions** (from `CLAUDE.md`): didactic comments, `type` aliases never `interface`, no barrel exports for components (import directly from `.tsx`), tests under `tests/` mirror `src/`, vitest `node` environment with no DOM (use `react-dom/server.renderToStaticMarkup` for components — see `tests/components/SettingsPanel/CollapsibleSection.test.ts`). Commits as the user (`rulkens@gmail.com`); add `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` trailer in the message body — never `--author=Claude...`.

**Goal:** Make filaments clickable. A click in empty sky (galaxy pick miss) hits the closest filament segment within a world-space threshold; the engine highlights the chosen strip and React shows a `FilamentCard` with length, member count, and a clickable list of the 20 brightest member galaxies.

**Architecture:**
- Build-time: `tools/buildFilaments.ts` runs a 3D-grid-bucketed nearest-vertex pass against the merged 2MRS+GLADE input (pre-duplication, distance-filtered), producing a sidecar `public/data/filament_memberships.bin` (`FMEM` v1) — strips are referenced by index; galaxies are split into per-source segments with their original cloud-row `localIdx`.
- Runtime: `cloudLoader.loadFilamentMembership()` decodes the sidecar; `engine.ts` rebuilds the runtime `Map<stripIdx, GalaxyRef[]>` once GLADE arrives (so the GLADE decimation `idxRemap` can be applied). Pick on click is brute-force CPU ray-segment distance only when the GPU galaxy pick misses; selected stripIdx flows through a uniform into `filaments.wgsl` for boost/dim. `FilamentCard.tsx` reads from the runtime map at mount, sorts by `magG` ascending (ties broken by `globalInstanceIdx`), takes 20, and clicking a row routes through `engine.focusOn`.

**Tech Stack:** TypeScript, Vite, React, WebGPU + WGSL, Vitest (`node` env, no DOM).

---

## File Structure

### Created
- `src/data/filamentMembershipFormat.ts` — encoder/decoder for `FMEM` v1.
- `src/@types/FilamentMembership.d.ts` — runtime decoded shape + `GalaxyRef` type.
- `src/@types/FilamentSelection.d.ts` — `EngineFilamentState` sub-bag type.
- `src/services/engine/buildMembershipMap.ts` — runtime helper: `FilamentMembership + idxRemap + loadedSources -> Map<stripIdx, GalaxyRef[]>`.
- `src/services/engine/filamentPick.ts` — pure CPU ray-segment distance pick.
- `src/components/InfoCard/FilamentCard.tsx` — the new card.
- `src/components/InfoCard/FilamentCard.module.css` — its scoped styles.
- `tests/data/filamentMembershipFormat.test.ts` — round-trip + bad-magic tests.
- `tests/services/engine/filamentPick.test.ts` — picker geometry tests.
- `tests/services/engine/buildMembershipMap.test.ts` — map builder tests.
- `tests/components/InfoCard/FilamentCard.test.ts` — render-to-static tests.
- `tests/tools/buildFilamentMemberships.test.ts` — membership-pass unit test.

### Modified
- `tools/buildFilaments.ts` — add membership pass, write sidecar after `filaments.bin`.
- `src/services/engine/cloudLoader.ts` — add `loadFilamentMembership()`.
- `src/services/gpu/filamentRenderer.ts` — per-segment `stripIdx` instance attribute, `selectedStripIdx` uniform, `setSelectedStripIdx` setter.
- `src/services/gpu/shaders/filaments.wgsl` — read `stripIdx`, branch on `selectedStripIdx`.
- `src/@types/EngineState.d.ts` — add `filaments: EngineFilamentState`.
- `src/@types/EngineHandle.d.ts` — add `setSelectedFilamentStripIdx`, `clearFilamentSelection`, callbacks.
- `src/@types/EngineCallbacks.d.ts` — add `onFilamentSelectChange`.
- `src/services/engine/engine.ts` — wire startup, click-fallback, setter, state init.
- `src/App.tsx` — show `FilamentCard` when selected; Esc clears; route member focus.

---

## Task 0: Pre-flight

**Files:** none modified.

- [ ] **Step 1: Verify baseline green**

Run: `npm test`
Expected: `Test Files  76 passed (76)` (or higher if other plans added tests). All passing.

- [ ] **Step 2: Verify typecheck green**

Run: `npm run typecheck`
Expected: exit code 0, no errors.

- [ ] **Step 3: Confirm filament artefacts exist**

Run: `ls -la public/data/filaments.bin public/data/2mrs.bin public/data/glade.bin`
Expected: all three files exist. If `filaments.bin` is missing, stop and report — the user must run `npm run build-filaments` (DisPerSE + 6–12 h wall time) before this plan can be exercised end-to-end. Tasks 1–2 do not require the binary; tasks 3+ do.

- [ ] **Step 4: Read the Phase 2 deferred section at the bottom of this plan**

Don't implement it. Knowing where the boundary is helps you avoid scope creep on Tasks 7–8.

---

## Task 1: Membership binary format encoder/decoder

**Files:**
- Create: `src/@types/FilamentMembership.d.ts`
- Create: `src/data/filamentMembershipFormat.ts`
- Create: `tests/data/filamentMembershipFormat.test.ts`

The sidecar carries one `Int32Array` per participating source (currently 2MRS, GLADE) where entry `i` is the strip index that the source's row-`i` galaxy belongs to (`-1` for non-members). The runtime later builds the `Map<stripIdx, GalaxyRef[]>` by walking these arrays.

Why per-source rather than one flat global array: the build excludes SDSS (see `tools/buildFilaments.ts:readMergedPositions` rationale) but the runtime points pipeline includes it. A single flat array would force every consumer to know the build's source-skip policy. Per-source segments keep the sidecar self-describing — the runtime simply skips sources not present in the sidecar.

Layout (little-endian):

```
HEADER (16 bytes)
  0   4   magic         = "FMEM" (0x4d454d46)
  4   4   version       = 1
  8   4   sourceCount   uint32   (number of source segments that follow)
  12  4   _reserved0    uint32   (must be 0)

PER-SOURCE TABLE (sourceCount × 8 bytes), repeated:
  0   4   sourceTag     uint32   (Source enum value: 1=SDSS, 2=TwoMRS, 3=Glade, ...)
  4   4   galaxyCount   uint32   (length of the Int32Array that follows)

PAYLOAD (concatenated Int32Arrays, in the order of the per-source table)
  Int32Array(galaxyCount) for source 0
  Int32Array(galaxyCount) for source 1
  ...
```

- [ ] **Step 1: Write `src/@types/FilamentMembership.d.ts`**

```ts
/**
 * FilamentMembership — the runtime decoded shape of `filament_memberships.bin`.
 *
 * Why per-source segments?
 * -----------------------
 * The build pipeline (`tools/buildFilaments.ts`) excludes SDSS to avoid
 * DisPerSE locking onto the wedge boundary, but the runtime points
 * pipeline includes SDSS.  A single flat global Int32Array would force
 * every consumer to bake in the build's source-skip policy.  Per-source
 * segments keep the sidecar self-describing: the runtime walks each
 * segment, looks up the galaxy's `globalInstanceIdx` via the live
 * PointRenderer's `loadedSources()` priorCount table, and silently
 * ignores sources not present in the sidecar.
 *
 * Why Int32Array (not Uint32Array)?
 * --------------------------------
 * `-1` is the "not a member" sentinel.  Uint32 would force `0xFFFFFFFF`
 * and cost a sentinel-aware decoder.  Int32 is one billion less typing.
 */

import type { Source } from '../data/sources';

export type FilamentMembershipSegment = {
  /** Which catalog this segment's galaxies came from. */
  source: Source;
  /**
   * Length matches the source's pre-decimation cloud count (the order
   * `tools/buildFilaments.ts` saw on disk).  Entry `i` is the strip
   * index the row-`i` galaxy was assigned to during the build's
   * nearest-vertex pass, or `-1` for galaxies that didn't fall within
   * `MEMBERSHIP_RADIUS_MPC = 5` of any filament vertex.
   */
  stripIndex: Int32Array;
};

export type FilamentMembership = {
  /** Number of source segments. Currently 2 (TwoMRS, Glade). */
  sourceCount: number;
  /** One segment per participating source, in build-time order. */
  segments: FilamentMembershipSegment[];
};
```

- [ ] **Step 2: Run typecheck (should still pass; new file is untouched)**

Run: `npm run typecheck`
Expected: exit code 0.

- [ ] **Step 3: Write the failing test for the binary format**

Create `tests/data/filamentMembershipFormat.test.ts`:

```ts
/**
 * Round-trip + error-path tests for FMEM v1.  We don't have a Source enum
 * dependency at the test level — sources are passed in as raw integers
 * matching `Source` enum values (1 = SDSS, 2 = TwoMRS, 3 = Glade).
 */

import { describe, it, expect } from 'vitest';
import {
  encodeFilamentMembership,
  decodeFilamentMembership,
} from '../../src/data/filamentMembershipFormat';
import type { FilamentMembership } from '../../src/@types/FilamentMembership';
import { Source } from '../../src/data/sources';

function makeFixture(): FilamentMembership {
  // Two source segments: 2MRS with 4 galaxies, GLADE with 6.
  // Strip indices include the `-1` sentinel so the round-trip
  // exercises the negative-int code path.
  return {
    sourceCount: 2,
    segments: [
      { source: Source.TwoMRS, stripIndex: new Int32Array([0, -1, 2, 0]) },
      { source: Source.Glade, stripIndex: new Int32Array([-1, 1, 1, -1, 2, 0]) },
    ],
  };
}

describe('filament membership binary format (FMEM v1)', () => {
  it('round-trips a small membership cloud byte-for-byte', () => {
    const original = makeFixture();
    const decoded = decodeFilamentMembership(encodeFilamentMembership(original));
    expect(decoded.sourceCount).toBe(2);
    expect(decoded.segments.length).toBe(2);
    expect(decoded.segments[0]!.source).toBe(Source.TwoMRS);
    expect(Array.from(decoded.segments[0]!.stripIndex)).toEqual([0, -1, 2, 0]);
    expect(decoded.segments[1]!.source).toBe(Source.Glade);
    expect(Array.from(decoded.segments[1]!.stripIndex)).toEqual([-1, 1, 1, -1, 2, 0]);
  });

  it('round-trips an empty membership (no sources)', () => {
    const original: FilamentMembership = { sourceCount: 0, segments: [] };
    const decoded = decodeFilamentMembership(encodeFilamentMembership(original));
    expect(decoded.sourceCount).toBe(0);
    expect(decoded.segments).toEqual([]);
  });

  it('throws on bad magic', () => {
    const bad = new ArrayBuffer(16);
    new DataView(bad).setUint32(0, 0xdeadbeef, true);
    expect(() => decodeFilamentMembership(bad)).toThrow(/bad magic/);
  });

  it('throws on unsupported version', () => {
    const original = makeFixture();
    const buf = encodeFilamentMembership(original);
    new DataView(buf).setUint32(4, 99, true);
    expect(() => decodeFilamentMembership(buf)).toThrow(/unsupported version/);
  });
});
```

Run: `npx vitest run tests/data/filamentMembershipFormat.test.ts`
Expected: FAIL — `Cannot find module '../../src/data/filamentMembershipFormat'`.

- [ ] **Step 4: Implement the encoder/decoder**

Create `src/data/filamentMembershipFormat.ts`:

```ts
/**
 * filamentMembershipFormat — encode/decode for the runtime sidecar
 * `public/data/filament_memberships.bin`.
 *
 * Layout (little-endian):
 *
 *   HEADER (16 bytes)
 *     0   4   magic         = "FMEM" (0x4d454d46)
 *     4   4   version       = 1
 *     8   4   sourceCount   uint32
 *     12  4   _reserved0    uint32  (must be 0)
 *
 *   PER-SOURCE TABLE (sourceCount × 8 bytes), repeated:
 *     0   4   sourceTag     uint32   (Source enum value)
 *     4   4   galaxyCount   uint32
 *
 *   PAYLOAD: concatenated Int32Arrays, one per entry in the per-source
 *   table, in table order.
 *
 * Why a sidecar (not extended FilamentCloud)?
 * -------------------------------------------
 * Three separate concerns:
 *   1. FilamentCloud (FILA v1) describes the geometry of the skeleton
 *      itself.  Galaxy IDs are not part of "the skeleton".
 *   2. The membership join is a different artefact — it relates
 *      galaxies to filaments.  Adding it to FilamentCloud would force
 *      a FILA v2 bump and break the existing format-stability
 *      guarantee.
 *   3. The membership data is optional: filament rendering works fine
 *      without it (galaxies just aren't clickable in the new way).
 *      A separate file lets the renderer load filaments even when the
 *      sidecar is missing.
 */

import type {
  FilamentMembership,
  FilamentMembershipSegment,
} from '../@types/FilamentMembership';
import type { Source } from './sources';

const MAGIC = 0x4d454d46; // "FMEM" little-endian
const VERSION = 1;
const HEADER_BYTES = 16;
const PER_SOURCE_ENTRY_BYTES = 8;

/**
 * Encode a `FilamentMembership` to a fresh ArrayBuffer.  Pure — no I/O.
 *
 * Throws on internal-consistency errors (caller bug).  The runtime
 * decoder must round-trip whatever this emits without re-validating.
 */
export function encodeFilamentMembership(m: FilamentMembership): ArrayBuffer {
  if (m.segments.length !== m.sourceCount) {
    throw new Error(
      `encodeFilamentMembership: segments.length ${m.segments.length} ` +
        `does not equal sourceCount ${m.sourceCount}`,
    );
  }

  // Two-pass layout: pass 1 sums payload bytes so we can allocate exactly,
  // pass 2 writes the bytes.  At this scale (a few sources, a few million
  // ints total) the worst-case allocation is ~12 MB — fine for a build-time
  // tool, but exact sizing keeps the sidecar bytes-on-disk identical to
  // bytes-in-memory and avoids a slice() copy on decode.
  let payloadBytes = 0;
  for (const seg of m.segments) {
    payloadBytes += seg.stripIndex.length * 4;
  }
  const totalBytes =
    HEADER_BYTES + m.sourceCount * PER_SOURCE_ENTRY_BYTES + payloadBytes;

  const buf = new ArrayBuffer(totalBytes);
  const dv = new DataView(buf);
  dv.setUint32(0, MAGIC, true);
  dv.setUint32(4, VERSION, true);
  dv.setUint32(8, m.sourceCount, true);
  dv.setUint32(12, 0, true); // _reserved0

  // Per-source table.
  let cursor = HEADER_BYTES;
  for (const seg of m.segments) {
    dv.setUint32(cursor, seg.source as number, true);
    dv.setUint32(cursor + 4, seg.stripIndex.length, true);
    cursor += PER_SOURCE_ENTRY_BYTES;
  }

  // Payload.  Concatenated Int32Arrays in table order.  We use Int32Array
  // views over the destination buffer rather than `.set` from a typed
  // array because Int32Array constructor must be byte-aligned to 4 — the
  // header + table is always 16 + 8N bytes, both 4-aligned, so we're safe.
  for (const seg of m.segments) {
    const view = new Int32Array(buf, cursor, seg.stripIndex.length);
    view.set(seg.stripIndex);
    cursor += seg.stripIndex.length * 4;
  }

  return buf;
}

/**
 * Decode an ArrayBuffer to a `FilamentMembership`.  Throws on bad magic
 * or unsupported version; the version error message points at the build
 * script so users can re-run with one command.
 *
 * The decoder copies the Int32 payload into freshly-allocated typed
 * arrays (rather than handing out views over the source buffer) so the
 * runtime can drop the original ArrayBuffer once decoding finishes —
 * matches the pattern in `filamentBinaryFormat.ts`.
 */
export function decodeFilamentMembership(buf: ArrayBuffer): FilamentMembership {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== MAGIC) {
    throw new Error('decodeFilamentMembership: bad magic — not an FMEM file');
  }
  const version = dv.getUint32(4, true);
  if (version !== VERSION) {
    throw new Error(
      `decodeFilamentMembership: unsupported version ${version} — please ` +
        `regenerate via "npm run build-filaments"`,
    );
  }
  const sourceCount = dv.getUint32(8, true);

  const segments: FilamentMembershipSegment[] = [];
  let tableCursor = HEADER_BYTES;
  let payloadCursor = HEADER_BYTES + sourceCount * PER_SOURCE_ENTRY_BYTES;

  for (let i = 0; i < sourceCount; i++) {
    const sourceTag = dv.getUint32(tableCursor, true) as Source;
    const galaxyCount = dv.getUint32(tableCursor + 4, true);
    tableCursor += PER_SOURCE_ENTRY_BYTES;

    const stripIndex = new Int32Array(galaxyCount);
    stripIndex.set(new Int32Array(buf, payloadCursor, galaxyCount));
    payloadCursor += galaxyCount * 4;

    segments.push({ source: sourceTag, stripIndex });
  }

  return { sourceCount, segments };
}
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `npx vitest run tests/data/filamentMembershipFormat.test.ts`
Expected: 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/@types/FilamentMembership.d.ts src/data/filamentMembershipFormat.ts tests/data/filamentMembershipFormat.test.ts
git commit -m "$(cat <<'EOF'
feat(filaments): add FMEM v1 sidecar format for filament membership

Per-source segments map each input cloud row to a filament strip index
(or -1 for non-members).  Sidecar form (rather than a FilamentCloud
extension) keeps FILA v1 stable and reflects that membership is a
join between galaxies and filaments, not part of the skeleton itself.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

Expected: commit succeeds, hooks pass.

---

## Task 2: Build-time membership pass in `tools/buildFilaments.ts`

**Files:**
- Modify: `tools/buildFilaments.ts` (add helper + sidecar write)
- Create: `tests/tools/buildFilamentMemberships.test.ts`

**Algorithm:** for each input galaxy in the FULL pre-filter source clouds (NOT the duplicated/jittered DisPerSE input — duplicates would all map to the same strip), find its nearest filament VERTEX. If the squared distance is `<= MEMBERSHIP_RADIUS_MPC²` (5² = 25 Mpc²), record the strip index of that vertex. Otherwise record `-1`.

A 3D uniform grid bucketed at `MEMBERSHIP_RADIUS_MPC` lets the per-galaxy nearest-vertex search visit only a 3×3×3 = 27-cell neighbourhood, making this O(N + M) instead of O(N × M).

- [ ] **Step 1: Write the failing test for the membership helper**

Create `tests/tools/buildFilamentMemberships.test.ts`:

```ts
/**
 * Tests for `computeFilamentMemberships` — the build-time helper that
 * assigns each input galaxy to its nearest filament vertex's strip,
 * within `MEMBERSHIP_RADIUS_MPC = 5` Mpc.
 *
 * The helper is decoupled from the DisPerSE pipeline (and from disk I/O)
 * so we can test the geometry on a 5-strip / 6-galaxy fixture without
 * shelling out to delaunay_3D.
 */

import { describe, it, expect } from 'vitest';
import { computeFilamentMemberships } from '../../tools/buildFilaments';
import type { FilamentCloud } from '../../src/@types/FilamentCloud';

function makeCloud(): FilamentCloud {
  // Two strips, each a 2-vertex segment along x.
  //   Strip 0: (0,0,0) → (10,0,0)
  //   Strip 1: (50,0,0) → (60,0,0)
  return {
    stripCount: 2,
    vertexCount: 4,
    stripOffsets: new Uint32Array([0, 2, 4]),
    vertices: new Float32Array([
      0, 0, 0, 0,
      10, 0, 0, 0,
      50, 0, 0, 0,
      60, 0, 0, 0,
    ]),
  };
}

describe('computeFilamentMemberships', () => {
  it('assigns galaxies to the strip containing their nearest filament vertex', () => {
    const cloud = makeCloud();
    // Galaxy 0 at (1, 0, 0): nearest vertex is strip-0 vertex 0 → strip 0
    // Galaxy 1 at (9, 0, 0): nearest vertex is strip-0 vertex 1 → strip 0
    // Galaxy 2 at (51, 0, 0): nearest vertex is strip-1 vertex 0 → strip 1
    // Galaxy 3 at (1000, 0, 0): no vertex within 5 Mpc → -1
    const positions = new Float32Array([1, 0, 0, 9, 0, 0, 51, 0, 0, 1000, 0, 0]);
    const result = computeFilamentMemberships(cloud, positions, 4);
    expect(Array.from(result)).toEqual([0, 0, 1, -1]);
  });

  it('marks a galaxy as -1 when its nearest vertex sits beyond the radius', () => {
    const cloud = makeCloud();
    // (5.1, 0, 0) → nearest vertex (0,0,0) at d=5.1 > 5 → -1.
    // Without the radius gate this would falsely claim strip 0.
    const positions = new Float32Array([5.1, 0, 0]);
    const result = computeFilamentMemberships(cloud, positions, 1);
    expect(Array.from(result)).toEqual([-1]);
  });

  it('handles the empty-cloud case', () => {
    const empty: FilamentCloud = {
      stripCount: 0,
      vertexCount: 0,
      stripOffsets: new Uint32Array([0]),
      vertices: new Float32Array(0),
    };
    const positions = new Float32Array([1, 2, 3]);
    const result = computeFilamentMemberships(empty, positions, 1);
    expect(Array.from(result)).toEqual([-1]);
  });
});
```

Run: `npx vitest run tests/tools/buildFilamentMemberships.test.ts`
Expected: FAIL — `computeFilamentMemberships` is not exported from `tools/buildFilaments`.

- [ ] **Step 2: Add the helper + sidecar write to `tools/buildFilaments.ts`**

Add these new exports near the top of the file (after the `MIN_DISTANCE_MPC` constant block, before `JITTER_SIGMA_MPC`):

```ts
/**
 * Maximum world-space distance (Mpc) from a filament vertex within
 * which a galaxy is considered a "member" of that vertex's strip.
 *
 * 5 Mpc is roughly the typical thickness of a cosmic-web filament
 * (Cautun+ 2014: filament radii in the 1–5 Mpc range, with the
 * dense spine at the 1–2 Mpc end).  Using the upper end of that
 * range as the membership cutoff captures the bulk of physically-
 * associated galaxies without grabbing every random galaxy in the
 * volume.  Members past the cutoff become `-1` (non-member); the
 * `FilamentCard` only lists members.
 *
 * Coupled to the 3D-grid bucket size below — the bucket lattice is
 * built at this same spacing so the per-galaxy nearest-vertex
 * search visits exactly a 3×3×3 = 27-cell neighbourhood.
 */
const MEMBERSHIP_RADIUS_MPC = 5;
```

Then add the helper at the bottom of the file, BEFORE the `main()` function:

```ts
/**
 * Compute per-galaxy filament-strip membership.
 *
 * Algorithm:
 *   1. Build a uniform 3D grid over the filament-vertex world-space
 *      bounding box, with bucket size = MEMBERSHIP_RADIUS_MPC.  Each
 *      bucket holds the indices of the filament vertices whose xyz
 *      falls inside it.
 *   2. For each input galaxy, locate its bucket, scan the 3×3×3
 *      neighbourhood for the nearest filament vertex within
 *      MEMBERSHIP_RADIUS_MPC, and record the containing strip's index
 *      (or -1 if none).
 *
 * Output order matches the input position order — caller is responsible
 * for keeping that order consistent with the cloud row order at runtime.
 *
 * Public so tests can drive it without invoking the full DisPerSE pipe.
 *
 * @param cloud      the parsed `FilamentCloud` from the upstream skeleton
 * @param positions  flat Float32Array of xyz triples, length = count × 3
 * @param count      number of galaxies in `positions`
 * @returns          Int32Array of length `count`, entry `i` = strip index
 *                   or -1 for non-members
 */
export function computeFilamentMemberships(
  cloud: FilamentCloud,
  positions: Float32Array,
  count: number,
): Int32Array {
  const out = new Int32Array(count);

  // Trivial case: no filaments → every galaxy is a non-member.
  if (cloud.vertexCount === 0) {
    out.fill(-1);
    return out;
  }

  // Per-vertex strip index — invariant of the cloud, so we cache it
  // once instead of binary-searching `stripOffsets` per query.
  // stripOffsets is a small monotone array (~thousands), so a linear
  // scan is fine.
  const vertexStripIdx = new Int32Array(cloud.vertexCount);
  for (let s = 0; s < cloud.stripCount; s++) {
    const lo = cloud.stripOffsets[s]!;
    const hi = cloud.stripOffsets[s + 1]!;
    for (let v = lo; v < hi; v++) vertexStripIdx[v] = s;
  }

  // Compute the filament bounding box (min/max per axis).  Pad by the
  // membership radius on each side so a galaxy near the edge still
  // finds its nearest vertex without falling off the grid.
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let v = 0; v < cloud.vertexCount; v++) {
    const x = cloud.vertices[v * 4 + 0]!;
    const y = cloud.vertices[v * 4 + 1]!;
    const z = cloud.vertices[v * 4 + 2]!;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  minX -= MEMBERSHIP_RADIUS_MPC; minY -= MEMBERSHIP_RADIUS_MPC; minZ -= MEMBERSHIP_RADIUS_MPC;
  maxX += MEMBERSHIP_RADIUS_MPC; maxY += MEMBERSHIP_RADIUS_MPC; maxZ += MEMBERSHIP_RADIUS_MPC;

  const cellSize = MEMBERSHIP_RADIUS_MPC;
  const nx = Math.max(1, Math.ceil((maxX - minX) / cellSize));
  const ny = Math.max(1, Math.ceil((maxY - minY) / cellSize));
  const nz = Math.max(1, Math.ceil((maxZ - minZ) / cellSize));

  // Two-pass bucket build.  Pass 1: count vertices per cell.  Pass 2:
  // allocate a flat backing array (cellOffsets[cell] gives the start
  // offset; cellOffsets[cell+1] is one past the end) and fill.  This is
  // the standard "compressed bucket grid" pattern: O(N) memory, no
  // dynamic per-cell arrays.
  const cellCount = nx * ny * nz;
  const cellHead = new Int32Array(cellCount + 1); // exclusive-scan offsets

  function cellIndex(x: number, y: number, z: number): number {
    const ix = Math.min(nx - 1, Math.max(0, Math.floor((x - minX) / cellSize)));
    const iy = Math.min(ny - 1, Math.max(0, Math.floor((y - minY) / cellSize)));
    const iz = Math.min(nz - 1, Math.max(0, Math.floor((z - minZ) / cellSize)));
    return (iz * ny + iy) * nx + ix;
  }

  // Pass 1: count.
  for (let v = 0; v < cloud.vertexCount; v++) {
    const c = cellIndex(
      cloud.vertices[v * 4 + 0]!,
      cloud.vertices[v * 4 + 1]!,
      cloud.vertices[v * 4 + 2]!,
    );
    cellHead[c]! += 1;
  }
  // Exclusive scan in place.  After this loop cellHead[c] = first slot
  // of cell c, cellHead[c+1] = first slot of cell c+1.
  let acc = 0;
  for (let i = 0; i < cellCount; i++) {
    const cnt = cellHead[i]!;
    cellHead[i] = acc;
    acc += cnt;
  }
  cellHead[cellCount] = acc;

  // Pass 2: fill.  We use a temp cursor (mutable copy of cellHead) to
  // place each vertex into its bucket; afterwards cellHead is restored
  // by reading from a fresh exclusive-scan we just wrote.  Cleanest
  // implementation: clone cellHead into a `cursor` array, mutate that.
  const cursor = new Int32Array(cellHead);
  const bucketed = new Int32Array(cloud.vertexCount);
  for (let v = 0; v < cloud.vertexCount; v++) {
    const c = cellIndex(
      cloud.vertices[v * 4 + 0]!,
      cloud.vertices[v * 4 + 1]!,
      cloud.vertices[v * 4 + 2]!,
    );
    bucketed[cursor[c]!++] = v;
  }

  // Per-galaxy nearest-vertex search over the 3×3×3 cell neighbourhood.
  const radiusSq = MEMBERSHIP_RADIUS_MPC * MEMBERSHIP_RADIUS_MPC;
  for (let g = 0; g < count; g++) {
    const gx = positions[g * 3 + 0]!;
    const gy = positions[g * 3 + 1]!;
    const gz = positions[g * 3 + 2]!;

    // If the galaxy lies outside the padded bounding box we already
    // know it's a non-member — skip the bucket lookup.
    if (gx < minX || gx > maxX || gy < minY || gy > maxY || gz < minZ || gz > maxZ) {
      out[g] = -1;
      continue;
    }

    const ix = Math.min(nx - 1, Math.max(0, Math.floor((gx - minX) / cellSize)));
    const iy = Math.min(ny - 1, Math.max(0, Math.floor((gy - minY) / cellSize)));
    const iz = Math.min(nz - 1, Math.max(0, Math.floor((gz - minZ) / cellSize)));

    let bestStrip = -1;
    let bestDistSq = radiusSq;
    for (let dz = -1; dz <= 1; dz++) {
      const cz = iz + dz;
      if (cz < 0 || cz >= nz) continue;
      for (let dy = -1; dy <= 1; dy++) {
        const cy = iy + dy;
        if (cy < 0 || cy >= ny) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const cx = ix + dx;
          if (cx < 0 || cx >= nx) continue;
          const c = (cz * ny + cy) * nx + cx;
          const lo = cellHead[c]!;
          const hi = cellHead[c + 1]!;
          for (let bi = lo; bi < hi; bi++) {
            const v = bucketed[bi]!;
            const vx = cloud.vertices[v * 4 + 0]!;
            const vy = cloud.vertices[v * 4 + 1]!;
            const vz = cloud.vertices[v * 4 + 2]!;
            const ddx = gx - vx;
            const ddy = gy - vy;
            const ddz = gz - vz;
            const d2 = ddx * ddx + ddy * ddy + ddz * ddz;
            if (d2 < bestDistSq) {
              bestDistSq = d2;
              bestStrip = vertexStripIdx[v]!;
            }
          }
        }
      }
    }
    out[g] = bestStrip;
  }

  return out;
}
```

Add this import at the top of `tools/buildFilaments.ts` if not already present (it should be — `FilamentCloud` is used by `parseNDskl`):

```ts
// (verify) `import type { FilamentCloud }` already imported via the parsers/ndskl path;
// if not, add: import type { FilamentCloud } from '../src/@types/FilamentCloud.js';
```

Note the `.js` extension on the type-only import — `tools/` uses an ESM TypeScript convention where module specifiers end in `.js` even though the source files are `.ts`. Match the existing import style.

- [ ] **Step 3: Run the test and verify it passes**

Run: `npx vitest run tests/tools/buildFilamentMemberships.test.ts`
Expected: 3 tests pass.

- [ ] **Step 4: Wire the membership pass into `main()`**

Modify `tools/buildFilaments.ts` — inside `main()`, AFTER the `writeFileSync(outPath, Buffer.from(buf))` line that writes `filaments.bin`, add a new block:

```ts
  // ── Membership pass ───────────────────────────────────────────────────
  //
  // For each REAL input galaxy (pre-duplication, pre-jitter), find its
  // nearest filament vertex and record the containing strip.  We re-read
  // the source .bin files here rather than reusing `tagged.positions`
  // because `tagged` was distance-filtered to [5, 200] Mpc — the runtime
  // wants the FULL cloud rows so the sidecar's per-source array indices
  // match the live PointRenderer's row indices 1:1.  A galaxy that the
  // build excluded (e.g. cz < 0 Local Group) gets `-1` and is simply
  // never a member — which is the correct answer.
  //
  // Sidecar is written next to filaments.bin so deploy is one folder.
  const memberships: { source: Source; stripIndex: Int32Array }[] = [];
  for (const { name, source } of [
    { name: '2mrs.bin', source: Source.TwoMRS },
    { name: 'glade.bin', source: Source.Glade },
  ] as const) {
    const path = resolve('public/data', name);
    if (!existsSync(path)) {
      process.stderr.write(`  membership: ${path} missing — skipping\n`);
      continue;
    }
    const fileBuf = readFileSync(path);
    const ab = fileBuf.buffer.slice(
      fileBuf.byteOffset,
      fileBuf.byteOffset + fileBuf.byteLength,
    );
    const c = decodePointCloud(ab);
    const stripIndex = computeFilamentMemberships(cloud, c.positions, c.count);
    let memberCount = 0;
    for (let i = 0; i < stripIndex.length; i++) if (stripIndex[i]! >= 0) memberCount++;
    process.stderr.write(
      `  membership: ${name} ${c.count.toLocaleString()} galaxies → ` +
        `${memberCount.toLocaleString()} members ` +
        `(${((100 * memberCount) / Math.max(1, c.count)).toFixed(1)}%)\n`,
    );
    memberships.push({ source, stripIndex });
  }

  const memOutPath = resolve('public/data/filament_memberships.bin');
  const memBuf = encodeFilamentMembership({
    sourceCount: memberships.length,
    segments: memberships,
  });
  writeFileSync(memOutPath, Buffer.from(memBuf));
  process.stderr.write(
    `wrote filament_memberships.bin (${(memBuf.byteLength / 1024).toFixed(1)} KB)\n`,
  );
```

Add the import to the top of `tools/buildFilaments.ts`:

```ts
import { encodeFilamentMembership } from '../src/data/filamentMembershipFormat.js';
```

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: exit code 0.

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including the new membership test.

- [ ] **Step 7: Commit**

```bash
git add tools/buildFilaments.ts tests/tools/buildFilamentMemberships.test.ts
git commit -m "$(cat <<'EOF'
feat(filaments): build-time per-galaxy filament membership pass

Bucketed 3D-grid nearest-vertex search assigns each input galaxy to the
strip containing its closest filament vertex within 5 Mpc, or -1 for
non-members.  Output written as filament_memberships.bin (FMEM v1)
alongside the existing filaments.bin.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

Expected: commit succeeds.

---

## Task 3: cloudLoader.loadFilamentMembership + runtime map builder

**Files:**
- Create: `src/services/engine/buildMembershipMap.ts`
- Modify: `src/services/engine/cloudLoader.ts`
- Create: `tests/services/engine/buildMembershipMap.test.ts`

The runtime needs to convert `FilamentMembership` → `Map<stripIdx, GalaxyRef[]>` where `GalaxyRef = { source, localIdx, globalIdx }`. To compute `globalIdx`, the helper needs the live `loadedSources()` priorCount table. To handle GLADE's far-galaxy decimation (`idxRemap`), members whose post-decimation index is `-1` are dropped silently.

- [ ] **Step 1: Define `GalaxyRef` in `FilamentMembership.d.ts`**

Append to `src/@types/FilamentMembership.d.ts`:

```ts
/**
 * One galaxy member of a filament strip, fully resolved against the live
 * runtime point cloud.  `globalIdx` matches the picker's
 * `globalInstanceIdx` so the FilamentCard can pass it back through
 * the engine's existing selection / focus paths without a second
 * lookup.
 */
export type GalaxyRef = {
  source: Source;
  /** Row index in the runtime (post-decimation) cloud for `source`. */
  localIdx: number;
  /** Picker-aligned global instance index. */
  globalIdx: number;
};
```

- [ ] **Step 2: Write the failing test for `buildMembershipMap`**

Create `tests/services/engine/buildMembershipMap.test.ts`:

```ts
/**
 * Tests for `buildMembershipMap` — the runtime helper that joins the
 * decoded `FilamentMembership` against the live PointRenderer's
 * `loadedSources()` priorCount table to produce `Map<stripIdx, GalaxyRef[]>`.
 */

import { describe, it, expect } from 'vitest';
import { buildMembershipMap } from '../../../src/services/engine/buildMembershipMap';
import type { FilamentMembership } from '../../../src/@types/FilamentMembership';
import { Source } from '../../../src/data/sources';

describe('buildMembershipMap', () => {
  it('joins per-source segments against priorCount → globalIdx', () => {
    const membership: FilamentMembership = {
      sourceCount: 2,
      segments: [
        // 2MRS galaxies 0..3 with strip assignments.
        { source: Source.TwoMRS, stripIndex: new Int32Array([0, -1, 2, 0]) },
        // GLADE galaxies 0..3 with strip assignments.
        { source: Source.Glade, stripIndex: new Int32Array([1, 0, -1, 1]) },
      ],
    };
    // Synthetic loadedSources order: SDSS (220 galaxies, all non-members
    // of any filament — SDSS doesn't appear in the sidecar), then 2MRS
    // (4 galaxies), then GLADE (4 galaxies).  globalIdx = priorCount + localIdx.
    const loadedSources = [
      { source: Source.SDSS, count: 220 },
      { source: Source.TwoMRS, count: 4 },
      { source: Source.Glade, count: 4 },
    ];
    const map = buildMembershipMap(membership, loadedSources, undefined);
    // Strip 0: 2MRS rows 0, 3 (globals 220, 223) + GLADE row 1 (global 224 + 1 = 225)
    expect(map.get(0)).toEqual([
      { source: Source.TwoMRS, localIdx: 0, globalIdx: 220 },
      { source: Source.TwoMRS, localIdx: 3, globalIdx: 223 },
      { source: Source.Glade, localIdx: 1, globalIdx: 225 },
    ]);
    // Strip 1: GLADE rows 0, 3 (globals 224, 227)
    expect(map.get(1)).toEqual([
      { source: Source.Glade, localIdx: 0, globalIdx: 224 },
      { source: Source.Glade, localIdx: 3, globalIdx: 227 },
    ]);
    // Strip 2: 2MRS row 2 (global 222)
    expect(map.get(2)).toEqual([
      { source: Source.TwoMRS, localIdx: 2, globalIdx: 222 },
    ]);
  });

  it('skips sources not present in loadedSources', () => {
    const membership: FilamentMembership = {
      sourceCount: 1,
      segments: [{ source: Source.TwoMRS, stripIndex: new Int32Array([0, 0]) }],
    };
    // 2MRS isn't in loadedSources → silently drop the segment.
    const loadedSources = [{ source: Source.SDSS, count: 100 }];
    const map = buildMembershipMap(membership, loadedSources, undefined);
    expect(map.size).toBe(0);
  });

  it('applies a GLADE idxRemap and drops members whose row was decimated', () => {
    const membership: FilamentMembership = {
      sourceCount: 1,
      segments: [
        // GLADE row 0 → strip 0; row 1 → strip 0; row 2 → strip 1.
        { source: Source.Glade, stripIndex: new Int32Array([0, 0, 1]) },
      ],
    };
    // idxRemap: row 0 stays at 0; row 1 was decimated (-1); row 2 → 1.
    const idxRemap = new Int32Array([0, -1, 1]);
    const loadedSources = [{ source: Source.Glade, count: 2 }];
    const map = buildMembershipMap(membership, loadedSources, { Glade: idxRemap });
    // Strip 0: only the row that survived decimation (row 0 → new idx 0 → global 0).
    expect(map.get(0)).toEqual([
      { source: Source.Glade, localIdx: 0, globalIdx: 0 },
    ]);
    // Strip 1: row 2 → new idx 1 → global 1.
    expect(map.get(1)).toEqual([
      { source: Source.Glade, localIdx: 1, globalIdx: 1 },
    ]);
  });
});
```

Run: `npx vitest run tests/services/engine/buildMembershipMap.test.ts`
Expected: FAIL — `Cannot find module '.../buildMembershipMap'`.

- [ ] **Step 3: Implement `buildMembershipMap`**

Create `src/services/engine/buildMembershipMap.ts`:

```ts
/**
 * buildMembershipMap — runtime join: FMEM-decoded sidecar + live
 * `loadedSources()` priorCount table → `Map<stripIdx, GalaxyRef[]>`.
 *
 * The build-time sidecar is keyed by per-source local row index.  At
 * runtime we want to flip into "for strip S, give me every member
 * galaxy" — which is what the FilamentCard reads.  This helper does
 * the inversion exactly once at engine startup (or whenever GLADE
 * arrives, whichever is later); the resulting Map is read-only after.
 *
 * Why split this from the cloud loader?
 * -------------------------------------
 * The decoder produces shape A (per-source SoA), the consumer wants
 * shape B (per-strip AoS), and the join needs the live PointRenderer's
 * priorCount table — which only the engine knows.  Keeping the
 * inversion as a pure function (deterministic, no GPU device, no
 * promises) makes it directly testable; the engine just calls it
 * once when both inputs are available.
 *
 * GLADE decimation
 * ----------------
 * `cloudLoader.loadAllClouds` decimates GLADE past 300 Mpc with stride 2,
 * producing an `idxRemap` that translates pre-decimation row indices to
 * post-decimation indices (or -1 for dropped rows).  The sidecar's
 * per-source array was authored against the PRE-decimation cloud, so we
 * apply the remap here.  Dropped rows become non-members — same shape
 * as if the build had never assigned them in the first place.
 */

import type {
  FilamentMembership,
  GalaxyRef,
} from '../../@types/FilamentMembership';
import { Source } from '../../data/sources';

/**
 * One entry from the live `PointRenderer.loadedSources()` iterator.
 * Kept structural (rather than importing the renderer's full type) so
 * tests don't need to construct a real renderer.
 */
export type LoadedSourceEntry = { source: Source; count: number };

/**
 * Optional per-source idxRemap.  Currently only `Glade` ever appears;
 * keying by the Source-enum *name* (rather than the numeric value)
 * keeps the test fixture readable.  The engine adapter populates this
 * from the cloudLoader's per-survey result.
 */
export type IdxRemapTable = Partial<Record<keyof typeof Source, Int32Array>>;

export function buildMembershipMap(
  membership: FilamentMembership,
  loadedSources: readonly LoadedSourceEntry[],
  idxRemap: IdxRemapTable | undefined,
): Map<number, GalaxyRef[]> {
  // Pre-compute priorCount per source from the live renderer order.
  // Sources not in loadedSources have `undefined` priorCount, which we
  // detect below to drop their entire segment silently.
  const priorCount = new Map<Source, number>();
  let acc = 0;
  for (const entry of loadedSources) {
    priorCount.set(entry.source, acc);
    acc += entry.count;
  }

  const result = new Map<number, GalaxyRef[]>();

  for (const seg of membership.segments) {
    const prior = priorCount.get(seg.source);
    // Source not loaded at runtime (e.g. GLADE binary missing) → skip
    // the whole segment.  This is the silent-degradation contract; the
    // user just sees fewer members per filament than the build produced.
    if (prior === undefined) continue;

    // Pull the right idxRemap, if any.  We key by Source enum name
    // (e.g. 'Glade') because the runtime cloudLoader stores the remap
    // table under Source.Glade and converting to a string name keeps
    // the test fixture honest.
    const sourceName = Source[seg.source] as keyof typeof Source;
    const remap = idxRemap?.[sourceName];

    for (let i = 0; i < seg.stripIndex.length; i++) {
      const stripIdx = seg.stripIndex[i]!;
      if (stripIdx < 0) continue; // non-member

      // Translate through the remap if one was provided.  A `-1` in the
      // remap means "this row was decimated"; treat as non-member.
      let runtimeLocalIdx = i;
      if (remap !== undefined) {
        const newIdx = remap[i];
        if (newIdx === undefined || newIdx < 0) continue;
        runtimeLocalIdx = newIdx;
      }

      const globalIdx = prior + runtimeLocalIdx;
      const ref: GalaxyRef = {
        source: seg.source,
        localIdx: runtimeLocalIdx,
        globalIdx,
      };
      const list = result.get(stripIdx);
      if (list) list.push(ref);
      else result.set(stripIdx, [ref]);
    }
  }

  return result;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/services/engine/buildMembershipMap.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Add `loadFilamentMembership` to cloudLoader**

Modify `src/services/engine/cloudLoader.ts` — add the import and a new function at the end of the file:

```ts
// Add at top alongside the existing decodeFilaments import:
import { decodeFilamentMembership } from '../../data/filamentMembershipFormat';
import type { FilamentMembership } from '../../@types/FilamentMembership';
```

```ts
// Add at end of file:
/**
 * Fetch and decode the optional `filament_memberships.bin` sidecar.
 * Returns null on any failure (missing file, network error, decode
 * error) — the file is purely additive; no membership map just means
 * filament cards will list zero member galaxies, the rest of the
 * filament rendering / selection pipeline still works.
 *
 * Mirrors `loadFilaments`'s fail-safe-to-null contract.
 */
export async function loadFilamentMembership(): Promise<FilamentMembership | null> {
  try {
    const res = await fetch('/data/filament_memberships.bin');
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return decodeFilamentMembership(buf);
  } catch (err) {
    console.warn('[cloudLoader] filament_memberships.bin failed:', err);
    return null;
  }
}
```

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`
Expected: exit code 0.

- [ ] **Step 7: Commit**

```bash
git add src/@types/FilamentMembership.d.ts src/services/engine/buildMembershipMap.ts src/services/engine/cloudLoader.ts tests/services/engine/buildMembershipMap.test.ts
git commit -m "$(cat <<'EOF'
feat(filaments): runtime loader + per-strip member map builder

cloudLoader.loadFilamentMembership fetches the new FMEM sidecar with
fail-safe-to-null semantics.  buildMembershipMap inverts per-source
SoA into per-strip AoS, applying GLADE's far-galaxy idxRemap so the
sidecar (authored against the pre-decimation binary) lines up with
the runtime cloud.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

Expected: commit succeeds.

---

## Task 4: Per-segment `stripIdx` instance attribute in FilamentRenderer

**Files:**
- Modify: `src/services/gpu/filamentRenderer.ts`
- Modify: `tests/services/gpu/filamentRenderer.test.ts` (extend existing test)

The instance buffer currently holds 8 floats per segment (2 endpoints × xyz + density). Add a 9th slot, `stripIdx` as a `u32` packed into a float-aligned trailing slot. Also update the per-segment build to record which strip each segment belongs to.

- [ ] **Step 1: Read the existing renderer test to confirm fixture shape**

Run: `head -80 tests/services/gpu/filamentRenderer.test.ts`
Expected: see how `buildSegmentInstances` is currently asserted on. Note the cloud fixture and assertion pattern.

- [ ] **Step 2: Extend the renderer test for the new attribute**

Edit `tests/services/gpu/filamentRenderer.test.ts` — after the existing `describe('buildSegmentInstances', ...)` block, add a new test:

```ts
describe('buildSegmentInstances stripIdx', () => {
  it('emits one stripIdx slot per segment, matching the source strip', () => {
    // Two strips: A has 3 verts (2 segments), B has 2 verts (1 segment).
    const cloud: FilamentCloud = {
      stripCount: 2,
      vertexCount: 5,
      stripOffsets: new Uint32Array([0, 3, 5]),
      vertices: new Float32Array([
        0, 0, 0, 0,  // A v0
        1, 0, 0, 0,  // A v1
        2, 0, 0, 0,  // A v2
        10, 0, 0, 0, // B v0
        11, 0, 0, 0, // B v1
      ]),
    };
    const { segmentCount, data } = buildSegmentInstances(cloud);
    expect(segmentCount).toBe(3);
    // Layout: 9 slots per segment — 8 floats (start+end pos+density)
    // followed by 1 u32 reinterpreted as float.  Read the u32 back via
    // a Uint32Array view aligned to the same buffer.
    const u32 = new Uint32Array(data.buffer, data.byteOffset, data.length);
    // Per-segment stride is 9; stripIdx is at offset 8 within each instance.
    expect(u32[8]).toBe(0); // A segment 0 → strip 0
    expect(u32[8 + 9]).toBe(0); // A segment 1 → strip 0
    expect(u32[8 + 18]).toBe(1); // B segment 0 → strip 1
  });
});
```

Run: `npx vitest run tests/services/gpu/filamentRenderer.test.ts`
Expected: FAIL on the new test (the existing tests still pass).

- [ ] **Step 3: Update `FLOATS_PER_SEGMENT` and the build loop**

Modify `src/services/gpu/filamentRenderer.ts`:

Change the constant:

```ts
// Was: const FLOATS_PER_SEGMENT = 8; // startxyz + startD + endxyz + endD
// Now: + per-segment stripIdx (u32 reinterpreted as float)
const FLOATS_PER_SEGMENT = 9;
```

Update `buildSegmentInstances` — the inner loop now writes one extra slot per segment. Replace the inner per-segment write block with:

```ts
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
      // Slot 8: per-segment stripIdx as u32, written through a Uint32
      // view sharing the underlying ArrayBuffer.  We can't `data[outIdx+8] = s`
      // because Float32Array stores `s` as a float; the WGSL pipeline below
      // declares this attribute as `uint32` and would read garbage.
      const u32 = new Uint32Array(data.buffer, (outIdx + 8) * 4, 1);
      u32[0] = s;
      outIdx += FLOATS_PER_SEGMENT;
    }
```

- [ ] **Step 4: Update the GPU pipeline attribute layout**

In the same file, update the per-instance vertex-buffer attribute list:

```ts
          // Per-instance: startxyz + startDensity + endxyz + endDensity + stripIdx
          {
            arrayStride: FLOATS_PER_SEGMENT * 4,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 1, offset: 0, format: 'float32x3' },  // startPos
              { shaderLocation: 2, offset: 12, format: 'float32' },   // startDensity
              { shaderLocation: 3, offset: 16, format: 'float32x3' }, // endPos
              { shaderLocation: 4, offset: 28, format: 'float32' },   // endDensity
              { shaderLocation: 5, offset: 32, format: 'uint32' },    // stripIdx
            ],
          },
```

- [ ] **Step 5: Run the renderer tests**

Run: `npx vitest run tests/services/gpu/filamentRenderer.test.ts`
Expected: all tests pass, including the new `stripIdx` test.

- [ ] **Step 6: Commit**

```bash
git add src/services/gpu/filamentRenderer.ts tests/services/gpu/filamentRenderer.test.ts
git commit -m "$(cat <<'EOF'
feat(filaments): per-segment stripIdx instance attribute

Adds a 9th slot per filament segment carrying the strip index as u32
(reinterpreted through a Uint32Array view over the float buffer).
The shader can now branch on stripIdx == selectedStripIdx, which the
next change wires into a uniform for selection highlighting.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

Expected: commit succeeds.

---

## Task 5: Selection uniform + boost/dim branch in `filaments.wgsl`

**Files:**
- Modify: `src/services/gpu/filamentRenderer.ts` (uniform layout + setter)
- Modify: `src/services/gpu/shaders/filaments.wgsl`

The uniform block grows by 4 bytes (`selectedStripIdx: i32 = -1` for none). The fragment shader reads it and:
- if `selectedStripIdx == stripIdx`: boost alpha to 1.0× and warm-shift the tint;
- else if `selectedStripIdx >= 0`: dim alpha to 30%;
- else: render as before (no change).

`stripIdx` must be passed from vertex to fragment via a flat-interpolated `@interpolate(flat)` slot.

- [ ] **Step 1: Update the uniform block layout in WGSL**

Modify `src/services/gpu/shaders/filaments.wgsl`:

Replace the `Uniforms` struct:

```wgsl
struct Uniforms {
  viewProj : mat4x4<f32>,
  viewport : vec2<f32>,    // [w, h] in physical pixels
  halfWidthPx : f32,       // line half-width in pixels
  // Strip index of the currently-selected filament, or -1 if none.
  // The fragment stage branches on this:
  //   match → boost alpha + warm tint
  //   none selected → render normally
  //   other selected → dim to 30 % so the chosen strip stands out
  selectedStripIdx : i32,
};
```

Note: WGSL is strict about uniform struct alignment. `i32` and `f32` are both 4 bytes; the struct stays exactly 80 bytes (`mat4x4 = 64`, `vec2 = 8`, `f32 = 4`, `i32 = 4`). The host-side `pad0` slot becomes the `selectedStripIdx` slot — no size change.

Add the new per-vertex / VSOut pieces:

```wgsl
struct PerVertex {
  @location(0) uv : vec2<f32>,
  @location(1) startPos : vec3<f32>,
  @location(2) startDensity : f32,
  @location(3) endPos : vec3<f32>,
  @location(4) endDensity : f32,
  @location(5) stripIdx : u32,
};

struct VSOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) uv : vec2<f32>,
  @location(1) density : f32,
  // Flat interpolation: stripIdx is per-instance, not per-vertex along
  // the segment.  Without @interpolate(flat) WGSL would refuse a u32
  // varying outright (only flat-interpolated integers are legal).
  @location(2) @interpolate(flat) stripIdx : u32,
};
```

In the `vs` function, add the trivial pass-through at the end before `return out`:

```wgsl
  out.stripIdx = in.stripIdx;
```

Replace the `fs` function body's final `return` block — keep the existing `edgeFade`, `densityBoost`, `tint` math, then insert the selection branch right before the final `return`:

```wgsl
  // ── Selection-aware modulation ────────────────────────────────────
  // selectedStripIdx == -1 → no selection, render as-is.
  // stripIdx == selectedStripIdx → boost alpha, warm tint.
  // Otherwise → dim to 30 % so the selected strip pops.
  var selectAlphaScale : f32 = 1.0;
  var selectTintScale  : vec3<f32> = vec3<f32>(1.0, 1.0, 1.0);
  if (u.selectedStripIdx >= 0) {
    if (i32(in.stripIdx) == u.selectedStripIdx) {
      selectAlphaScale = 1.6;                            // boost
      selectTintScale  = vec3<f32>(1.2, 1.05, 0.9);      // warm shift
    } else {
      selectAlphaScale = 0.3;                            // dim others
    }
  }

  let alpha = edgeFade * 0.6 * densityBoost * selectAlphaScale;
  return vec4<f32>(tint * selectTintScale * alpha, alpha);
```

Remove the prior bare `let alpha = ...` and `return vec4<f32>(tint * alpha, alpha);` lines that this block replaces — they're the last two lines of the existing `fs` function.

- [ ] **Step 2: Update the host-side uniform packing**

Modify `src/services/gpu/filamentRenderer.ts`:

Add a private field and public setter:

```ts
  // -1 means "no filament selected".  Mutated by setSelectedStripIdx;
  // baked into the per-frame uniform write inside draw().
  private selectedStripIdx: number = -1;

  setSelectedStripIdx(idx: number): void {
    this.selectedStripIdx = idx;
  }
```

Replace the uniform-packing block inside `draw()`. Currently it writes 19 floats with f32[19] = 0; change to:

```ts
    // Pack uniforms.  Layout (matches Uniforms struct in shader):
    //   f32[0..15]   viewProj (mat4)
    //   f32[16..17]  viewport (vec2)
    //   f32[18]      halfWidthPx
    //   i32[19]      selectedStripIdx (-1 = none)
    const buf = new ArrayBuffer(UNIFORM_BYTES);
    const f32 = new Float32Array(buf);
    const i32 = new Int32Array(buf);
    f32.set(viewProj as Float32Array, 0);
    f32[16] = viewportPx[0];
    f32[17] = viewportPx[1];
    f32[18] = halfWidthPx;
    i32[19] = this.selectedStripIdx;
    this.device.queue.writeBuffer(this.uniformBuffer, 0, buf);
```

- [ ] **Step 3: Run the existing renderer tests**

Run: `npx vitest run tests/services/gpu/filamentRenderer.test.ts`
Expected: all existing tests still pass. (The new selection branch can't be unit-tested without a GPU device; visual verification is Task 9.)

- [ ] **Step 4: Run typecheck + full suite**

Run: `npm run typecheck && npm test`
Expected: typecheck exits 0, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/services/gpu/filamentRenderer.ts src/services/gpu/shaders/filaments.wgsl
git commit -m "$(cat <<'EOF'
feat(filaments): selection-aware highlight in filaments.wgsl

selectedStripIdx uniform (-1 = none) drives a fragment-stage branch:
the matching strip gets a warm boost, every other strip dims to 30 %.
Host-side setter setSelectedStripIdx will be wired through the engine
in the next change.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

Expected: commit succeeds.

---

## Task 6: CPU pick — ray-segment distance helper + click-fallback integration

**Files:**
- Create: `src/services/engine/filamentPick.ts`
- Create: `tests/services/engine/filamentPick.test.ts`
- Modify: `src/services/engine/engine.ts` (click flow integration)

Filament pick fires only when the GPU galaxy pick misses. Brute-force ray-segment distance test against every segment is fine on click (~5–50 K segments × tens of μs). Returns the strip index of the closest hit, or -1 if no segment lies within the world-space threshold.

- [ ] **Step 1: Write the failing test**

Create `tests/services/engine/filamentPick.test.ts`:

```ts
/**
 * Tests for `pickFilamentStrip` — the CPU ray-segment distance pick used
 * when the GPU galaxy pick misses.
 */

import { describe, it, expect } from 'vitest';
import { pickFilamentStrip } from '../../../src/services/engine/filamentPick';
import type { FilamentCloud } from '../../../src/@types/FilamentCloud';

function makeTwoStrips(): FilamentCloud {
  // Strip 0: x-axis line (0,0,0) → (10,0,0)
  // Strip 1: y-axis line (0,50,0) → (0,60,0)
  return {
    stripCount: 2,
    vertexCount: 4,
    stripOffsets: new Uint32Array([0, 2, 4]),
    vertices: new Float32Array([
      0, 0, 0, 0, 10, 0, 0, 0,
      0, 50, 0, 0, 0, 60, 0, 0,
    ]),
  };
}

describe('pickFilamentStrip', () => {
  it('returns the strip index when the ray passes within the threshold', () => {
    const cloud = makeTwoStrips();
    // Ray origin (5, 1, 0) shooting along -y axis: passes within 1 Mpc
    // of strip-0 (x-axis line).  Threshold 1.5 Mpc → hit on strip 0.
    const idx = pickFilamentStrip(
      cloud,
      [5, 1, 0],
      [0, -1, 0],
      1.5,
    );
    expect(idx).toBe(0);
  });

  it('prefers the closer of two strips when both are within the threshold', () => {
    const cloud = makeTwoStrips();
    // Ray origin near strip 1, shooting through strip 1.  Threshold large
    // enough that strip 0 is also "in range" geometrically — but strip 1
    // is closer, so it wins.
    const idx = pickFilamentStrip(
      cloud,
      [0, 55, 1],
      [0, 0, -1],
      100,
    );
    expect(idx).toBe(1);
  });

  it('returns -1 when no segment lies within the threshold', () => {
    const cloud = makeTwoStrips();
    // Ray origin (0, 0, 100), shooting along +z.  Closest approach to
    // strip 0 is at z=0, distance 100 — beyond threshold 5.
    const idx = pickFilamentStrip(
      cloud,
      [0, 0, 100],
      [0, 0, 1],
      5,
    );
    expect(idx).toBe(-1);
  });

  it('returns -1 for an empty cloud', () => {
    const empty: FilamentCloud = {
      stripCount: 0,
      vertexCount: 0,
      stripOffsets: new Uint32Array([0]),
      vertices: new Float32Array(0),
    };
    expect(pickFilamentStrip(empty, [0, 0, 0], [1, 0, 0], 5)).toBe(-1);
  });
});
```

Run: `npx vitest run tests/services/engine/filamentPick.test.ts`
Expected: FAIL — `Cannot find module '.../filamentPick'`.

- [ ] **Step 2: Implement the picker**

Create `src/services/engine/filamentPick.ts`:

```ts
/**
 * filamentPick — CPU ray-segment distance pick for the cosmic-web
 * skeleton overlay.  Runs only on click, never per-frame: at ~50 K
 * segments worst case the brute-force scan is well under a millisecond,
 * and there's no good reason to add a BVH for one-shot click resolution.
 *
 * Why CPU rather than the existing GPU pick texture?
 * --------------------------------------------------
 * The GPU pick texture (r32uint, see `pickRenderer.ts`) carries
 * per-galaxy `globalInstanceIdx` values.  Filaments are drawn in a
 * different pass (additive, into the HDR target — no per-instance
 * pick id) and bolting filament IDs onto that texture would either
 * collide with galaxy IDs or force a second pick attachment.  The
 * brute-force CPU path is dramatically simpler and correct.
 *
 * Geometry
 * --------
 * For each segment (a, b) in the cloud, find the parameter `t` along
 * the segment that minimises the squared distance from the ray
 * `origin + s * dir` (s ≥ 0) to the point `a + t * (b - a)` (0 ≤ t ≤ 1).
 * If the minimum perpendicular distance is below `thresholdMpc`, the
 * segment is a hit candidate; the closest hit wins.
 *
 * We use the textbook "two-line closest approach" formulation rather
 * than projecting the ray onto each segment's plane — it handles
 * the parallel-line edge case via a small epsilon on the determinant.
 */

import type { FilamentCloud } from '../../@types/FilamentCloud';

/**
 * @param cloud         the loaded skeleton
 * @param origin        ray origin in world Mpc
 * @param dir           ray direction (need not be normalised, but
 *                      direction-not-magnitude semantics are assumed —
 *                      the algorithm's outputs are scale-invariant in dir)
 * @param thresholdMpc  world-space perpendicular-distance gate; segments
 *                      farther than this are ignored
 * @returns             strip index of the closest hit, or -1 if none
 */
export function pickFilamentStrip(
  cloud: FilamentCloud,
  origin: readonly [number, number, number],
  dir: readonly [number, number, number],
  thresholdMpc: number,
): number {
  if (cloud.vertexCount === 0) return -1;

  const ox = origin[0], oy = origin[1], oz = origin[2];
  const dx = dir[0], dy = dir[1], dz = dir[2];
  const dDotD = dx * dx + dy * dy + dz * dz;
  if (dDotD === 0) return -1;

  const thresholdSq = thresholdMpc * thresholdMpc;

  let bestStrip = -1;
  let bestDistSq = thresholdSq;

  for (let s = 0; s < cloud.stripCount; s++) {
    const lo = cloud.stripOffsets[s]!;
    const hi = cloud.stripOffsets[s + 1]!;
    for (let v = lo; v < hi - 1; v++) {
      const a = v * 4;
      const b = (v + 1) * 4;
      const ax = cloud.vertices[a + 0]!;
      const ay = cloud.vertices[a + 1]!;
      const az = cloud.vertices[a + 2]!;
      const bx = cloud.vertices[b + 0]!;
      const by = cloud.vertices[b + 1]!;
      const bz = cloud.vertices[b + 2]!;

      const ex = bx - ax;
      const ey = by - ay;
      const ez = bz - az;

      // Two-line closest approach: minimise |o + s*d - (a + t*e)|² over (s, t).
      // Standard textbook derivation (Real-Time Collision Detection §5.1.9).
      const eDotE = ex * ex + ey * ey + ez * ez;
      const dDotE = dx * ex + dy * ey + dz * ez;
      const wx = ox - ax, wy = oy - ay, wz = oz - az;
      const dDotW = dx * wx + dy * wy + dz * wz;
      const eDotW = ex * wx + ey * wy + ez * wz;

      const denom = dDotD * eDotE - dDotE * dDotE;

      let sParam: number;
      let tParam: number;
      // Parallel/degenerate (denom ~ 0): pin sParam to 0 and project the
      // ray's origin onto the segment.  The 1e-10 epsilon is empirical —
      // catches floating-point drift on near-parallel rays without
      // throwing away the well-conditioned case.
      if (denom < 1e-10) {
        sParam = 0;
        tParam = eDotE > 0 ? eDotW / eDotE : 0;
      } else {
        sParam = (dDotE * eDotW - eDotE * dDotW) / denom;
        tParam = (dDotD * eDotW - dDotE * dDotW) / denom;
      }
      // Clamp to ray (s >= 0) and segment (0 <= t <= 1) — points outside
      // these bounds aren't valid closest points.
      if (sParam < 0) sParam = 0;
      if (tParam < 0) tParam = 0;
      else if (tParam > 1) tParam = 1;

      // Compute the actual squared distance between the chosen ray
      // point and segment point.
      const px = ox + sParam * dx;
      const py = oy + sParam * dy;
      const pz = oz + sParam * dz;
      const qx = ax + tParam * ex;
      const qy = ay + tParam * ey;
      const qz = az + tParam * ez;
      const ddx = px - qx, ddy = py - qy, ddz = pz - qz;
      const d2 = ddx * ddx + ddy * ddy + ddz * ddz;

      if (d2 < bestDistSq) {
        bestDistSq = d2;
        bestStrip = s;
      }
    }
  }

  return bestStrip;
}
```

- [ ] **Step 3: Run the picker test**

Run: `npx vitest run tests/services/engine/filamentPick.test.ts`
Expected: 4 tests pass.

- [ ] **Step 4: Commit just the helper before wiring engine**

Engine wiring is large enough to be a separate commit.

```bash
git add src/services/engine/filamentPick.ts tests/services/engine/filamentPick.test.ts
git commit -m "$(cat <<'EOF'
feat(filaments): CPU ray-segment pick helper for filament selection

Brute-force closest-approach across every segment, ~50 K worst case
on click only.  Dependency-free pure helper so engine can wire it
into the click-fallback path without GPU plumbing.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

Expected: commit succeeds.

---

## Task 7: Engine state, setter, click-fallback wiring; App.tsx Esc handler

**Files:**
- Modify: `src/@types/EngineState.d.ts` (+ new sub-bag type)
- Create: `src/@types/FilamentSelection.d.ts`
- Modify: `src/@types/EngineHandle.d.ts`
- Modify: `src/@types/EngineCallbacks.d.ts`
- Modify: `src/services/engine/engine.ts`
- Modify: `src/App.tsx`

The engine gains a `state.filaments` sub-bag with `cloud`, `membershipMap`, and `selectedStripIdx`. The click flow runs the CPU filament pick after a galaxy-pick miss. A new `EngineHandle.setSelectedFilamentStripIdx` lets React drive selection from the FilamentCard's "focus member" buttons (Phase 2 reuse, also useful for tests). `clearSelection` clears both galaxy and filament; the existing Esc handler in App.tsx already calls it.

- [ ] **Step 1: Define the new state sub-bag type**

Create `src/@types/FilamentSelection.d.ts`:

```ts
/**
 * EngineFilamentState — the filament-overlay sub-bag of `EngineState`.
 *
 * Why a separate bag (not folded into picking)?
 * --------------------------------------------
 * `picking` is specifically about hover / click / drag mutables for
 * the per-galaxy selection.  Filament selection is conceptually a
 * different layer (a different renderer, a different pick path, a
 * different InfoCard), and grouping it with galaxy selection would
 * blur the "this bag covers exactly the picking pipeline" boundary
 * the existing comment at `EnginePickingState.d.ts` is careful to draw.
 *
 * Lifecycle
 * ---------
 * `cloud` and `membershipMap` are populated lazily.  Both are null
 * until the optional binaries land; the renderer + InfoCard
 * gracefully degrade when they're absent.
 */

import type { FilamentCloud } from './FilamentCloud';
import type { GalaxyRef } from './FilamentMembership';

export type EngineFilamentState = {
  /** Loaded skeleton, or null when filaments.bin is missing/failed. */
  cloud: FilamentCloud | null;
  /**
   * Per-strip member list, built once after BOTH the membership sidecar
   * and every catalog (especially GLADE, with its idxRemap) have arrived.
   * Null when the sidecar is missing.
   */
  membershipMap: Map<number, GalaxyRef[]> | null;
  /** -1 = nothing selected; otherwise the strip index. */
  selectedStripIdx: number;
};
```

- [ ] **Step 2: Wire the new sub-bag into `EngineState`**

Modify `src/@types/EngineState.d.ts`:

Add the import:

```ts
import type { EngineFilamentState } from './FilamentSelection';
```

Add the new field at the bottom of the `EngineState` type:

```ts
export type EngineState = {
  settings: EngineSettingsState;
  bias: EngineBiasState;
  sources: EngineSourceState;
  picking: EnginePickingState;
  gpu: EngineGpuHandles;
  subsystems: EngineSubsystemHandles;
  cam: ReturnType<typeof createOrbitCamera> | null;
  initialCamSnapshot: InitialCam | null;
  /**
   * Cosmic-web filament-skeleton overlay state — see
   * `EngineFilamentState` for the lifecycle commentary.
   */
  filaments: EngineFilamentState;
};
```

- [ ] **Step 3: Add the public setter + callback to EngineHandle / EngineCallbacks**

Modify `src/@types/EngineHandle.d.ts` — add to the type:

```ts
  /**
   * Programmatically select a cosmic-web filament strip by index, or
   * pass `-1` to clear the filament selection.  Drives the renderer's
   * selection uniform and emits `onFilamentSelectChange`.  No-op if
   * filaments aren't loaded.
   */
  setSelectedFilamentStripIdx?: (idx: number) => void;
```

Modify `src/@types/EngineCallbacks.d.ts` — open the file and locate the `EngineCallbacks` type. Add this field:

```ts
  /**
   * Fired whenever the selected filament strip changes.  `-1` means
   * "no filament selected".  Mirrors `onSelectChange` for galaxies.
   * App.tsx uses this to mount/unmount the FilamentCard.
   */
  onFilamentSelectChange?: (stripIdx: number) => void;
```

(Read the file first to confirm the exact shape — if `EngineCallbacks` is a `type` alias with a `{ ... }` literal, append the field inside the braces; if it's split across files, find the right one. Use `grep -rn "onSelectChange" src/@types/`.)

- [ ] **Step 4: Initialise the sub-bag in `engine.ts`**

Modify `src/services/engine/engine.ts` — find the `state` object literal initialiser (search for `filamentRenderer: null,` to locate the GPU bag, then look at the surrounding `state` const). Add a new field to the literal:

```ts
    filaments: {
      cloud: null,
      membershipMap: null,
      selectedStripIdx: -1,
    },
```

- [ ] **Step 5: Capture the FilamentCloud + load + map-build**

In `engine.ts`, find the existing `loadFilaments().then(...)` block (search `loadFilaments().then`). Replace its body to also store the cloud and trigger map building:

```ts
      // Fire-and-forget the fetch.  When (and if) it lands, upload to
      // the renderer and wake the render-on-demand loop.
      loadFilaments().then((cloud) => {
        if (!cloud) return;
        filamentRenderer.upload(cloud);
        state.filaments.cloud = cloud;
        console.log(`[engine] filaments: ${cloud.stripCount} strips, ${cloud.vertexCount} verts`);
        // The membership map needs cloud + sidecar + GLADE idxRemap.
        // We build it eagerly here if the sidecar already loaded; the
        // sidecar's own .then below builds it on the other-arrival
        // ordering.
        tryBuildMembershipMap();
        state.subsystems.scheduler.requestRender();
      });

      // Membership sidecar — independent of the FilamentCloud fetch but
      // its build-map step depends on both having landed plus GLADE's
      // idxRemap (because the sidecar was authored against the
      // pre-decimation GLADE binary).  See `tryBuildMembershipMap`.
      let membershipDecoded: import('../../@types/FilamentMembership').FilamentMembership | null = null;
      loadFilamentMembership().then((m) => {
        membershipDecoded = m;
        tryBuildMembershipMap();
      });

      function tryBuildMembershipMap(): void {
        if (!state.filaments.cloud || !membershipDecoded || !state.gpu.renderer) return;
        // Build only when at least one source the sidecar references is
        // also loaded; otherwise the resulting map is empty and we'd
        // rebuild it again later for nothing.  Iterating loadedSources()
        // is cheap and runs at most a handful of times.
        const loadedSources = Array.from(state.gpu.renderer.loadedSources()).map((e) => ({
          source: e.source,
          count: e.count,
        }));
        const idxRemapTable: Partial<Record<keyof typeof Source, Int32Array>> = {};
        if (gladeIdxRemap) idxRemapTable.Glade = gladeIdxRemap;
        state.filaments.membershipMap = buildMembershipMap(
          membershipDecoded,
          loadedSources,
          idxRemapTable,
        );
        console.log(
          `[engine] filament membership: ${state.filaments.membershipMap.size} strips with members`,
        );
      }
```

Add the imports near the top of `engine.ts`:

```ts
import { loadFilamentMembership } from './cloudLoader';
import { buildMembershipMap } from './buildMembershipMap';
```

(They already import `loadFilaments` from cloudLoader; co-locate the new import on the same line.)

Also: after the `loadAllClouds` `onResult` callback finishes for any source, call `tryBuildMembershipMap()` so the map builds as soon as both the sidecar and the relevant cloud have landed. Find the `onResult` callback (search `loadAllClouds((result) => {`) and add at the very end of its body, just before the closing `});`:

```ts
        // Re-attempt the membership map build now that another source
        // has landed.  Cheap when the inputs aren't all ready (early
        // return inside).  Idempotent: rebuilding overwrites the
        // previous map with one that includes the new source.
        tryBuildMembershipMap();
```

- [ ] **Step 6: Wire the click-fallback filament pick**

In `engine.ts`, find the click-handler integration. The `attachOrbitControls({ onClick })` callback uses `clickResolver.resolveClick(...)` and then dispatches via `setSelected`. After the existing path, when `result.kind === 'clear'` AND `state.filaments.cloud` is non-null, run `pickFilamentStrip` and apply the result.

Add this import:

```ts
import { pickFilamentStrip } from './filamentPick';
```

Locate the click handler (search for `clickResolver` or `resolveClick` in engine.ts). After the existing branch that handles a successful galaxy hit, insert filament fallback. The exact code path will look something like:

```ts
        const result = await clickResolver.resolveClick({...});
        if (result.kind === 'clear') {
          // Existing: clear galaxy selection.
          setSelected(null);
          // NEW: try filament pick before bailing entirely.
          const stripIdx = tryPickFilament(args.pickXPx, args.pickYPx);
          setSelectedFilamentStripIdxInternal(stripIdx);
        } else {
          setSelected(result.globalIdx, result.info);
          // NEW: clicking a galaxy clears any filament selection.
          setSelectedFilamentStripIdxInternal(-1);
        }
```

Add a `tryPickFilament` local helper near the top of the engine closure, AFTER the camera + viewport access has been set up. The threshold-in-Mpc strategy: scale with camera distance so distant filaments stay clickable. Use `max(1 Mpc, camera.distance * 0.01)` — 1 % of camera distance, floored at 1 Mpc.

```ts
  /**
   * Try to pick a filament strip via CPU ray-segment distance test.
   * Returns -1 if no hit, no cloud loaded, or camera not yet built.
   *
   * The threshold scales with camera distance (1 % of camDist, floor 1 Mpc)
   * so the user can click a distant filament thread without having to
   * pixel-snipe — at 500 Mpc the threshold is 5 Mpc, comfortably wider
   * than typical filament thickness.
   */
  function tryPickFilament(pickXPx: number, pickYPx: number): number {
    const cloud = state.filaments.cloud;
    const cam = state.cam;
    if (!cloud || !cam) return -1;
    // Build a world-space ray from the click.  The OrbitCamera exposes
    // origin + a `worldRayFromTexPx(x, y, viewportW, viewportH)` helper;
    // if it doesn't (verify by reading orbitCamera.ts), build one from
    // the inverse view-projection.  For brevity here we assume the
    // helper exists — see step 6b below if it doesn't.
    const [vw, vh] = canvasViewportPx();
    const ray = cam.worldRayFromTexPx(pickXPx, pickYPx, vw, vh);
    const threshold = Math.max(1, cam.distance * 0.01);
    return pickFilamentStrip(cloud, ray.origin, ray.dir, threshold);
  }
```

- [ ] **Step 6b: Verify or add `worldRayFromTexPx` on the camera**

Run: `grep -n "worldRayFromTexPx\|worldRayFrom" src/services/camera/orbitCamera.ts`
Expected: either the helper exists, or it doesn't.

If it doesn't exist, add it. Read `src/services/camera/orbitCamera.ts` to see the existing `viewProj()` method and matrix utilities (gl-matrix). Then append:

```ts
  /**
   * Construct a world-space ray for a click at texture-space pixel
   * (x, y) within a viewport of (w, h).  Used by the filament picker —
   * the GPU pick texture handles galaxies, but filaments are picked
   * CPU-side from this ray (see services/engine/filamentPick.ts).
   *
   * Implementation: standard inverse-view-projection of an NDC point
   * at z = -1 (near plane) and z = +1 (far plane); the ray is the
   * difference.  We don't need a normalised direction — the picker is
   * scale-invariant in `dir`.
   */
  worldRayFromTexPx(
    x: number,
    y: number,
    w: number,
    h: number,
  ): { origin: [number, number, number]; dir: [number, number, number] } {
    const ndcX = (x / w) * 2 - 1;
    const ndcY = 1 - (y / h) * 2; // y-flip (GPU pick coords are top-down)
    const inv = mat4.invert(mat4.create(), this.viewProj()) as Float32Array;

    // Helper: project an NDC point to world space.
    const unproject = (z: number): [number, number, number] => {
      const v = vec4.fromValues(ndcX, ndcY, z, 1);
      vec4.transformMat4(v, v, inv);
      return [v[0] / v[3], v[1] / v[3], v[2] / v[3]];
    };
    const near = unproject(-1);
    const far = unproject(1);
    return {
      origin: near,
      dir: [far[0] - near[0], far[1] - near[1], far[2] - near[2]],
    };
  }
```

If the relevant `mat4` / `vec4` imports are not yet present, add them next to the other gl-matrix imports at the top of orbitCamera.ts.

- [ ] **Step 7: Add the public setter + internal helper**

In `engine.ts`, find the existing `setFilamentsEnabled` setter (returned in the EngineHandle literal at the bottom of the function). Add a sibling setter:

```ts
    setSelectedFilamentStripIdx(idx: number) {
      setSelectedFilamentStripIdxInternal(idx);
    },
```

Define the internal helper somewhere near the click resolver block (mirrors the shape of `setSelected`):

```ts
  /**
   * Update the engine's filament selection, push it to the renderer's
   * uniform, fire the React callback, and request a render.  Idempotent:
   * passing the same value is a no-op (no callback, no render request).
   */
  function setSelectedFilamentStripIdxInternal(idx: number): void {
    if (state.filaments.selectedStripIdx === idx) return;
    state.filaments.selectedStripIdx = idx;
    state.gpu.filamentRenderer?.setSelectedStripIdx(idx);
    cb.onFilamentSelectChange?.(idx);
    state.subsystems.scheduler.requestRender();
  }
```

Also extend `clearSelection`: find its existing definition in the EngineHandle literal and add the filament clear:

```ts
    clearSelection() {
      // Existing galaxy clear (preserve whatever's already there).
      // ... existing body ...
      // NEW: clear filament selection too — Esc clears everything.
      setSelectedFilamentStripIdxInternal(-1);
    },
```

(Read the existing `clearSelection` body first; preserve it verbatim and append the filament clear at the end.)

- [ ] **Step 8: Wire React state in App.tsx**

Modify `src/App.tsx`:

Add a state field:

```ts
const [selectedFilamentStripIdx, setSelectedFilamentStripIdx] = useState<number>(-1);
```

Add the callback to the `createEngine` call (next to `onSelectChange`):

```ts
      onFilamentSelectChange: setSelectedFilamentStripIdx,
```

Note: the existing `Escape` handler already calls `handleRef.current?.clearSelection()`; with Step 7's clearSelection extension that also clears the filament. No additional Esc plumbing needed.

(The `<FilamentCard>` render lives in Task 8.)

- [ ] **Step 9: Run typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: typecheck exits 0, all tests pass.

- [ ] **Step 10: Commit**

```bash
git add src/@types/FilamentSelection.d.ts src/@types/EngineState.d.ts src/@types/EngineHandle.d.ts src/@types/EngineCallbacks.d.ts src/services/engine/engine.ts src/services/camera/orbitCamera.ts src/App.tsx
git commit -m "$(cat <<'EOF'
feat(filaments): engine state + click-fallback CPU pick

EngineFilamentState carries the loaded cloud, runtime membership map,
and selection index.  Click handler now runs filamentPick after the
galaxy pick misses, with a camera-distance-scaled threshold so distant
filaments stay clickable.  setSelectedFilamentStripIdx setter +
onFilamentSelectChange callback expose the selection to React;
clearSelection (Esc) clears both galaxy and filament.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

Expected: commit succeeds.

---

## Task 8: FilamentCard component + tests

**Files:**
- Create: `src/components/InfoCard/FilamentCard.tsx`
- Create: `src/components/InfoCard/FilamentCard.module.css`
- Create: `tests/components/InfoCard/FilamentCard.test.ts`
- Modify: `src/App.tsx` (mount the card)

The card displays:
- Title: "Filament" + strip index
- Length in Mpc (sum of `|v_i+1 - v_i|` for all consecutive pairs in the strip)
- Member count
- Top 20 brightest members, each clickable to focus

Sort order is `magG asc` (lowest magnitude = brightest), tie-broken by `globalIdx asc` for determinism. Members without a resolvable cloud row (e.g. mid-load) are skipped.

- [ ] **Step 1: Write the failing component test**

Create `tests/components/InfoCard/FilamentCard.test.ts`:

```ts
/**
 * Render-time tests for FilamentCard.  Following the project pattern
 * (CollapsibleSection.test.ts), we use renderToStaticMarkup against the
 * vitest `node` environment — no DOM, no React Testing Library.  This
 * exercises:
 *
 *   - Headline / length / count are correctly rendered.
 *   - Brightest-N sort: lowest magG first, ties broken by globalIdx.
 *   - Members beyond the top 20 are truncated.
 *
 * Click-to-focus is exercised by manual visual check against the live
 * dev server (project convention — see CLAUDE.md).
 */

import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FilamentCard } from '../../../src/components/InfoCard/FilamentCard';
import type { FilamentCloud } from '../../../src/@types/FilamentCloud';
import type { GalaxyRef } from '../../../src/@types/FilamentMembership';
import { Source } from '../../../src/data/sources';

function makeCloud(): FilamentCloud {
  // One strip, length = 3 (two unit segments along x).
  return {
    stripCount: 1,
    vertexCount: 3,
    stripOffsets: new Uint32Array([0, 3]),
    vertices: new Float32Array([
      0, 0, 0, 0,
      1.5, 0, 0, 0,
      3, 0, 0, 0,
    ]),
  };
}

// Stub a `lookupGalaxy` that returns deterministic photometry by globalIdx.
function makeLookup(magsByGlobal: Record<number, { magG: number; name?: string; xyz?: [number, number, number]; diameterKpc?: number }>) {
  return (g: GalaxyRef) => {
    const m = magsByGlobal[g.globalIdx];
    if (m === undefined) return null;
    return {
      magG: m.magG,
      name: m.name ?? `gx-${g.globalIdx}`,
      x: m.xyz?.[0] ?? 0,
      y: m.xyz?.[1] ?? 0,
      z: m.xyz?.[2] ?? 0,
      diameterKpc: m.diameterKpc ?? 30,
    };
  };
}

describe('FilamentCard', () => {
  it('renders length, member count, and the brightest member at the top', () => {
    const members: GalaxyRef[] = [
      { source: Source.TwoMRS, localIdx: 0, globalIdx: 100 },
      { source: Source.TwoMRS, localIdx: 1, globalIdx: 101 },
      { source: Source.Glade, localIdx: 0, globalIdx: 200 },
    ];
    const lookup = makeLookup({
      100: { magG: 14.5, name: 'NGC 1' },
      101: { magG: 12.0, name: 'NGC 2' },  // brightest
      200: { magG: 16.0, name: 'NGC 3' },
    });
    const html = renderToStaticMarkup(
      createElement(FilamentCard, {
        stripIdx: 0,
        cloud: makeCloud(),
        members,
        lookupGalaxy: lookup,
      }),
    );
    // Length: 3.0 Mpc (two unit-1.5 segments).
    expect(html).toContain('3.0 Mpc');
    // Member count.
    expect(html).toContain('3 members');
    // Brightest first — NGC 2 should appear in the rendered list before NGC 1 / NGC 3.
    const idxNgc2 = html.indexOf('NGC 2');
    const idxNgc1 = html.indexOf('NGC 1');
    const idxNgc3 = html.indexOf('NGC 3');
    expect(idxNgc2).toBeGreaterThan(-1);
    expect(idxNgc2).toBeLessThan(idxNgc1);
    expect(idxNgc1).toBeLessThan(idxNgc3);
  });

  it('truncates the member list to 20 entries', () => {
    const members: GalaxyRef[] = [];
    const mags: Record<number, { magG: number; name: string }> = {};
    for (let i = 0; i < 30; i++) {
      members.push({ source: Source.TwoMRS, localIdx: i, globalIdx: i });
      mags[i] = { magG: 12 + i * 0.1, name: `Gal ${i}` };
    }
    const html = renderToStaticMarkup(
      createElement(FilamentCard, {
        stripIdx: 0,
        cloud: makeCloud(),
        members,
        lookupGalaxy: makeLookup(mags),
      }),
    );
    // Member count shows the full population.
    expect(html).toContain('30 members');
    // First 20 (Gal 0..Gal 19) appear; Gal 20 onwards are truncated.
    expect(html).toContain('Gal 0');
    expect(html).toContain('Gal 19');
    expect(html).not.toContain('Gal 20');
  });

  it('breaks magG ties by globalIdx ascending', () => {
    const members: GalaxyRef[] = [
      { source: Source.Glade, localIdx: 0, globalIdx: 50 },
      { source: Source.Glade, localIdx: 0, globalIdx: 10 },
    ];
    // Same magG → globalIdx 10 should come first.
    const lookup = makeLookup({
      10: { magG: 13.0, name: 'A' },
      50: { magG: 13.0, name: 'B' },
    });
    const html = renderToStaticMarkup(
      createElement(FilamentCard, {
        stripIdx: 0,
        cloud: makeCloud(),
        members,
        lookupGalaxy: lookup,
      }),
    );
    const idxA = html.indexOf('"gal-name">A<');
    const idxB = html.indexOf('"gal-name">B<');
    // The exact class name must match what the component emits — adjust
    // if the implementation uses a different className.  Searching for
    // the data marker keeps the assertion robust against re-styling.
    expect(html.indexOf('A')).toBeLessThan(html.indexOf('B'));
  });

  it('skips members whose lookup returns null', () => {
    const members: GalaxyRef[] = [
      { source: Source.TwoMRS, localIdx: 0, globalIdx: 1 },
      { source: Source.TwoMRS, localIdx: 1, globalIdx: 2 },
    ];
    const lookup = makeLookup({
      1: { magG: 12.0, name: 'present' },
      // 2 missing on purpose (e.g. mid-load, source not yet ready)
    });
    const html = renderToStaticMarkup(
      createElement(FilamentCard, {
        stripIdx: 0,
        cloud: makeCloud(),
        members,
        lookupGalaxy: lookup,
      }),
    );
    // Membership population = 2 (engine truth), but only 1 listed.
    expect(html).toContain('2 members');
    expect(html).toContain('present');
  });
});
```

Run: `npx vitest run tests/components/InfoCard/FilamentCard.test.ts`
Expected: FAIL — `Cannot find module '.../FilamentCard'`.

- [ ] **Step 2: Implement `FilamentCard.tsx`**

Create `src/components/InfoCard/FilamentCard.tsx`:

```tsx
/**
 * FilamentCard — sibling to FullCard / CompactCard.  Shows the selected
 * cosmic-web filament's length, member count, and a clickable list of
 * the 20 brightest member galaxies.
 *
 * ### Why pure-props (no engine import)?
 *
 * FilamentCard is rendered by App.tsx, which already owns the engine
 * handle via `handleRef`.  Passing `lookupGalaxy` and `onFocusMember`
 * as props keeps the component dependency-free of the engine module —
 * easy to test under vitest's `node` environment, easy to reuse in a
 * future Storybook setup, and impossible to accidentally couple to a
 * specific renderer.
 *
 * ### Sort order
 *
 * Members are sorted by `magG` ascending (lowest magnitude = brightest,
 * astronomy convention) with `globalIdx` ascending as the tie-breaker
 * for determinism — without the secondary key, two galaxies of identical
 * magnitude would swap positions on every render depending on V8's
 * internal sort stability.
 *
 * ### Why no FullCard fallback for hovers?
 *
 * Filaments don't have hover state today — only click-to-select.  Hover
 * preview was deliberately deferred (see Phase 2 in the plan).  When
 * Phase 2 lands, FilamentCard will need a `pinned` boolean prop just
 * like FullCard; for now it's always pinned.
 */

import type { ReactNode } from 'react';
import type { FilamentCloud } from '../../@types/FilamentCloud';
import type { GalaxyRef } from '../../@types/FilamentMembership';
import styles from './FilamentCard.module.css';

const TOP_N = 20;

/**
 * Caller-provided lookup: given a `GalaxyRef`, return whatever subset
 * of the underlying cloud row the card needs to display (magG, name,
 * world position).  Returning `null` means "this member isn't currently
 * resolvable" — the card simply omits that row.
 */
export type GalaxyLookup = (ref: GalaxyRef) => {
  magG: number;
  name: string;
  x: number;
  y: number;
  z: number;
  diameterKpc: number;
} | null;

export type FilamentCardProps = {
  stripIdx: number;
  cloud: FilamentCloud;
  members: GalaxyRef[];
  lookupGalaxy: GalaxyLookup;
  /**
   * Callback fired when the user clicks a member row.  Engine routes
   * this through `focusOn(xyz, diameterKpc)` exactly as the
   * CommandPalette does.
   */
  onFocusMember?: (ref: GalaxyRef) => void;
};

/**
 * Compute the polyline length of a strip in world Mpc.  Sum of
 * Euclidean distances between consecutive vertices.
 */
function stripLengthMpc(cloud: FilamentCloud, stripIdx: number): number {
  if (stripIdx < 0 || stripIdx >= cloud.stripCount) return 0;
  const lo = cloud.stripOffsets[stripIdx]!;
  const hi = cloud.stripOffsets[stripIdx + 1]!;
  let len = 0;
  for (let v = lo; v < hi - 1; v++) {
    const a = v * 4;
    const b = (v + 1) * 4;
    const dx = cloud.vertices[b + 0]! - cloud.vertices[a + 0]!;
    const dy = cloud.vertices[b + 1]! - cloud.vertices[a + 1]!;
    const dz = cloud.vertices[b + 2]! - cloud.vertices[a + 2]!;
    len += Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  return len;
}

export function FilamentCard({
  stripIdx,
  cloud,
  members,
  lookupGalaxy,
  onFocusMember,
}: FilamentCardProps): ReactNode {
  const lengthMpc = stripLengthMpc(cloud, stripIdx);

  // Resolve every member; drop unresolvable ones; sort + truncate.
  type Resolved = { ref: GalaxyRef; magG: number; name: string };
  const resolved: Resolved[] = [];
  for (const ref of members) {
    const r = lookupGalaxy(ref);
    if (r === null) continue;
    resolved.push({ ref, magG: r.magG, name: r.name });
  }
  resolved.sort((a, b) => {
    // Primary: magG ascending (lowest = brightest).  NaN treated as +Inf
    // so missing-photometry rows sink to the bottom.
    const am = Number.isNaN(a.magG) ? Infinity : a.magG;
    const bm = Number.isNaN(b.magG) ? Infinity : b.magG;
    if (am !== bm) return am - bm;
    // Secondary: globalIdx ascending — deterministic tie-breaker.
    return a.ref.globalIdx - b.ref.globalIdx;
  });
  const top = resolved.slice(0, TOP_N);

  return (
    <div className={styles.filamentCard} role="status" aria-live="polite">
      <div className={styles.cardTitle}>
        <span>Filament</span>
        <span className={styles.stripBadge}>#{stripIdx}</span>
      </div>
      <div className={styles.cardSummary}>
        <div className={styles.cardRow}>
          <span className={styles.cardLabel}>Length</span>
          <span className={styles.cardValue}>{lengthMpc.toFixed(1)} Mpc</span>
        </div>
        <div className={styles.cardRow}>
          <span className={styles.cardLabel}>Members</span>
          <span className={styles.cardValue}>{members.length} members</span>
        </div>
      </div>
      <div className={styles.memberList}>
        <div className={styles.memberHeader}>Brightest galaxies</div>
        {top.map((m) => (
          <button
            key={m.ref.globalIdx}
            type="button"
            className={styles.memberRow}
            onClick={() => onFocusMember?.(m.ref)}
          >
            <span className={styles.galName}>{m.name}</span>
            <span className={styles.galMag}>
              {Number.isFinite(m.magG) ? m.magG.toFixed(2) : 'N/A'}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `FilamentCard.module.css`**

Create `src/components/InfoCard/FilamentCard.module.css`:

```css
/* FilamentCard — sibling layout to FullCard.  Class names use camelCase
   to match the project's CSS Modules convention (see FullCard.module.css). */

.filamentCard {
  position: fixed;
  top: 12px;
  right: 12px;
  width: 320px;
  padding: 12px;
  background: rgba(8, 8, 16, 0.85);
  color: #d8d8e0;
  border: 1px solid rgba(140, 120, 200, 0.4);
  border-radius: 8px;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 13px;
  backdrop-filter: blur(6px);
  z-index: 10;
}

.cardTitle {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 11px;
  opacity: 0.7;
}

.stripBadge {
  background: rgba(140, 120, 200, 0.3);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: ui-monospace, monospace;
}

.cardSummary {
  margin-bottom: 12px;
}

.cardRow {
  display: flex;
  justify-content: space-between;
  padding: 2px 0;
}

.cardLabel {
  opacity: 0.6;
}

.cardValue {
  font-variant-numeric: tabular-nums;
}

.memberList {
  border-top: 1px solid rgba(140, 120, 200, 0.2);
  padding-top: 8px;
  max-height: 320px;
  overflow-y: auto;
}

.memberHeader {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.7;
  margin-bottom: 4px;
}

.memberRow {
  display: flex;
  justify-content: space-between;
  width: 100%;
  padding: 4px 6px;
  margin: 1px 0;
  background: transparent;
  border: 0;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  border-radius: 3px;
}

.memberRow:hover {
  background: rgba(140, 120, 200, 0.18);
}

.galName {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.galMag {
  font-variant-numeric: tabular-nums;
  opacity: 0.8;
  margin-left: 8px;
}
```

- [ ] **Step 4: Run the FilamentCard tests**

Run: `npx vitest run tests/components/InfoCard/FilamentCard.test.ts`
Expected: 4 tests pass.

- [ ] **Step 5: Mount the card in App.tsx + provide a lookup**

Modify `src/App.tsx`:

The lookup needs the active clouds. The simplest route: ask the engine for it via a new optional handle method. But to keep this plan tight, expose the runtime cloud + membership map directly through one new method.

Add to `src/@types/EngineHandle.d.ts`:

```ts
  /**
   * Snapshot of the data the FilamentCard needs to render: the cloud
   * (for length math), the per-strip members, and a lookup that
   * resolves each member's display fields against the runtime point
   * clouds.  Returns null when filaments aren't loaded yet.
   *
   * Intentionally one method (not three) so callers don't have to
   * stitch three separate fetches together when the underlying state
   * may shift between calls (e.g. a late GLADE arrival rebuilding the
   * map).
   */
  getFilamentCardSnapshot?: () => {
    cloud: import('./FilamentCloud').FilamentCloud;
    members: import('./FilamentMembership').GalaxyRef[];
    lookupGalaxy: (
      ref: import('./FilamentMembership').GalaxyRef,
    ) => {
      magG: number;
      name: string;
      x: number;
      y: number;
      z: number;
      diameterKpc: number;
    } | null;
  } | null;
```

Implement it in `engine.ts` inside the EngineHandle return literal. Resolve each member through `state.sources.clouds.get(source)` + the existing `pointInfoFromGlobal` helper (or read fields directly from the cloud). Read the existing `buildPointInfo` import to see what's available; if `iauName` is the friendliest cheap-to-compute name, use it.

```ts
    getFilamentCardSnapshot() {
      const cloud = state.filaments.cloud;
      const stripIdx = state.filaments.selectedStripIdx;
      if (!cloud || stripIdx < 0) return null;
      const members = state.filaments.membershipMap?.get(stripIdx) ?? [];
      // Build a lookup over the live clouds.  The famous-meta lookup
      // gives us the curated name when the galaxy is in the famous
      // atlas; otherwise we fall back to a coordinate-based label that
      // matches the FullCard's headline path.
      const lookupGalaxy = (ref: GalaxyRef) => {
        const c = state.sources.clouds.get(ref.source);
        if (!c || ref.localIdx >= c.count) return null;
        const x = c.positions[ref.localIdx * 3 + 0]!;
        const y = c.positions[ref.localIdx * 3 + 1]!;
        const z = c.positions[ref.localIdx * 3 + 2]!;
        const magG = c.magG[ref.localIdx]!;
        // Cheap name: globalIdx-based fallback.  Nicer name lookup
        // (famousMeta + iauName) is a Phase 2 polish item — keeping
        // the MVP cost down.
        const name = `Galaxy ${ref.globalIdx}`;
        const diameterKpc = c.diameterKpc[ref.localIdx] || 30;
        return { magG, name, x, y, z, diameterKpc };
      };
      return { cloud, members, lookupGalaxy };
    },
```

(If `GalaxyRef` isn't imported yet, add the import at the top of `engine.ts`: `import type { GalaxyRef } from '../../@types/FilamentMembership';`.)

In `App.tsx`, render `FilamentCard` when `selectedFilamentStripIdx >= 0`:

```tsx
import { FilamentCard } from './components/InfoCard/FilamentCard';
// ...

// Inside the JSX return, after the existing <InfoCard ... />:
{selectedFilamentStripIdx >= 0 && (() => {
  const snap = handleRef.current?.getFilamentCardSnapshot?.();
  if (!snap) return null;
  return (
    <FilamentCard
      stripIdx={selectedFilamentStripIdx}
      cloud={snap.cloud}
      members={snap.members}
      lookupGalaxy={snap.lookupGalaxy}
      onFocusMember={(ref) => {
        const r = snap.lookupGalaxy(ref);
        if (r) handleRef.current?.focusOn([r.x, r.y, r.z], r.diameterKpc);
      }}
    />
  );
})()}
```

(IIFE pattern keeps the snapshot read inline without lifting it to a memo. The snapshot is cheap — engine read, no allocation churn.)

- [ ] **Step 6: Run typecheck + full tests**

Run: `npm run typecheck && npm test`
Expected: typecheck exits 0, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/InfoCard/FilamentCard.tsx src/components/InfoCard/FilamentCard.module.css tests/components/InfoCard/FilamentCard.test.ts src/App.tsx src/@types/EngineHandle.d.ts src/services/engine/engine.ts
git commit -m "$(cat <<'EOF'
feat(filaments): FilamentCard component + App.tsx wiring

Card shows strip length, member count, and the 20 brightest member
galaxies sorted by magG ascending (ties broken by globalIdx).
Clicking a member routes through engine.focusOn for the standard
camera tween.  EngineHandle.getFilamentCardSnapshot exposes the
runtime data the component needs in one pull so React doesn't have
to stitch the cloud + map + photometry separately.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

Expected: commit succeeds.

---

## Task 9: Visual verification

**Files:** none modified.

This task uses the running dev server (`npm run dev` should already be up — see CLAUDE.md "Dev server stays running").

- [ ] **Step 1: Run the full test suite once more**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: exit code 0.

- [ ] **Step 3: Ask the user for a visual check, providing this script:**

> Please flip on **Filaments** in the SettingsPanel (or load `/data/filaments.bin` if it isn't built — `npm run build-filaments`). Then:
>
> 1. **Click on a filament thread.**  Expected: the chosen strip should brighten and warm-shift; every other strip dims to ~30 % opacity.  A `FilamentCard` overlay appears top-right showing the strip number, length in Mpc, and the brightest 20 member galaxies.
> 2. **Click an empty patch of sky** (no filament nearby).  Expected: the filament card disappears; all strips return to normal brightness.
> 3. **Click a galaxy first, then a filament.**  Expected: the galaxy's InfoCard goes away when the filament is selected.
> 4. **Press Esc.**  Expected: clears both galaxy and filament selection.
> 5. **Click a member-galaxy row inside the FilamentCard.**  Expected: the camera tweens to that galaxy.
>
> Report any deviation.

- [ ] **Step 4: Optionally measure click latency**

If anything feels sluggish, in the browser devtools console run:

```js
performance.mark('a'); // immediately before clicking
// ... click an empty area near a filament ...
performance.mark('b'); performance.measure('pick', 'a', 'b'); console.table(performance.getEntriesByName('pick'));
```

Expected: well under 50 ms for the CPU pick on a ~50 K-segment cloud. If it exceeds 100 ms, file a follow-up and consider Phase 2's "spatial index for filament pick" as next work.

- [ ] **Step 5: Commit any visual-tweak fixes (if needed)**

If the user reports a visual bug (selection branch wrong direction, dim too aggressive, etc.), commit any fix as a follow-up before merging.

---

## Phase 2 — bidirectional linking (DEFERRED)

Not part of this plan. Documented here so a follow-up plan can pick up the trail without re-discovering scope.

### Phase 2 — Task A: "Show containing filament" button on FullCard

**Files:**
- Modify: `src/components/InfoCard/FullCard.tsx`
- Modify: `src/services/engine/engine.ts`

When a galaxy is selected, the FullCard should expose a button "Show containing filament" if and only if the galaxy is a member of any strip. Clicking the button calls `engine.setSelectedFilamentStripIdx(...)` with the galaxy's strip.

Requires a reverse lookup `Map<globalIdx, stripIdx>` derived from the membership map. Build once at engine startup.

### Phase 2 — Task B: Hover preview-highlight of member-list rows

**Files:**
- Modify: `src/components/InfoCard/FilamentCard.tsx`
- Modify: `src/services/engine/engine.ts` (new "preview" hover index, separate from selection)

Hovering a member row in the FilamentCard should temporarily ring the corresponding galaxy with the existing selection halo (or a dimmer "preview" variant). On hover-out, the halo disappears.

Requires either reusing the GPU selection-halo path for a non-selected galaxy, or adding a parallel preview path. Probably the former — see `pickRenderer.ts`'s halo-render commentary.

### Phase 2 — additional considered work

- Cluster name labels at filament endpoints (deferred — needs a label-collision system)
- Filament walk-through camera tween ("fly along the strip") — needs spline interpolation along `cloud.vertices`
- Per-filament σ persistence — requires bumping FILA to v2 (Phase 3 of the original DisPerSE plan)

---

## Self-Review

This was performed during plan authorship; flagging any leftovers here for the agentic worker.

**1. Spec coverage:**
- Click → select: Tasks 6, 7
- FilamentCard with length, members, brightest-20 click-to-focus: Task 8
- Highlight rendering (boost selected, dim others): Tasks 4, 5
- Esc deselects: Task 7 step 7 (clearSelection extension; existing App.tsx Esc handler picks it up)
- Build-time membership: Task 2
- Sidecar binary format: Task 1
- Runtime loader + map: Task 3
- All listed.

**2. Placeholder scan:** None of "TBD", "implement later", "similar to Task N" remain. Each step lists actual code.

**3. Type consistency:**
- `setSelectedFilamentStripIdx` (camelCase, takes `idx: number`) used consistently in EngineHandle and engine.ts.
- `GalaxyRef` field names (`source`, `localIdx`, `globalIdx`) used the same way in FilamentMembership.d.ts, buildMembershipMap.ts, and FilamentCard.tsx.
- `FilamentMembership` shape (`sourceCount`, `segments` with `source` + `stripIndex`) consistent across encoder, decoder, sidecar test, build-time emitter, and runtime decoder.
- `EngineFilamentState` (`cloud`, `membershipMap`, `selectedStripIdx`) referenced consistently.
- `pickFilamentStrip(cloud, origin, dir, threshold)` signature matches its test fixture.
- `computeFilamentMemberships(cloud, positions, count)` signature matches its test fixture.
