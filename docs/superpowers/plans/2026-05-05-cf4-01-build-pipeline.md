# CF4 sub-plan 01 — Build pipeline

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Each implementer subagent must be dispatched `run_in_background: true` per project convention.

**Goal:** Convert the three laniakea CSVs into two compact little-endian
`.bin` files plus a small palette JSON sidecar. After this plan ships, the
binaries exist on disk and round-trip cleanly through encode/decode unit
tests. Nothing renders yet — that lands in plans 02 and 03.

**Architecture:** Pure-function parsers under `tools/parsers/cf4*` read the
laniakea CSVs into typed records. A new orchestrator `tools/buildCf4.ts`
calls them, encodes via two new format modules under `src/data/`, and
writes the binaries to `public/data/`. The basin palette ships as a tiny
sidecar JSON read at runtime — small enough that hard-coding it would also
work, but a sidecar lets us re-skin without rebuilding bins.

**Tech Stack:** Node.js + tsx, vanilla TypeScript. No new runtime deps.

**Prerequisites:** none. This is the foundational plan.

**Done means:**

- Running `npm run build-cf4 -- --laniakea-root <path>` against a local
  laniakea checkout produces three artefacts under `public/data/`:
  `cf4_galaxies.bin`, `cf4_streamlines.bin`, `cf4_basins.json`.
- Unit tests cover encode/decode round-trip for both binary formats and the
  CSV parsers against tiny string fixtures.
- `npm run build` is still green.

---

## File structure

### New files

- `data/raw/cf4/README.md` — explains the laniakea pin, where to clone,
  which CSVs to copy.
- `tools/parsers/cf4Galaxies.ts` — parses `CF4_galaxies_with_basin_id.csv`
  rows → `ParsedCf4Galaxy[]`. Pure function over a string.
- `tools/parsers/cf4Streamlines.ts` — parses `CF4_streams_streamlines.csv`
  rows → `ParsedCf4Streamline[]` (one entry per strip, vertices grouped by
  `streamline_id`).
- `tools/buildCf4.ts` — CLI orchestrator. Reads three CSVs, encodes the two
  bins, writes the palette JSON.
- `src/data/cf4GalaxiesBinaryFormat.ts` — encode + decode for the `CF4G`
  format (mirrors `pointCloudFormat.ts` style).
- `src/data/cf4StreamlinesBinaryFormat.ts` — encode + decode for the
  `CF4S` format (mirrors `filamentBinaryFormat.ts` style).
- `src/@types/Cf4Cloud.d.ts` — runtime decoded shape for galaxies.
- `src/@types/Cf4StreamlineCloud.d.ts` — runtime decoded shape for strips.
- `tests/parsers/cf4Galaxies.test.ts`
- `tests/parsers/cf4Streamlines.test.ts`
- `tests/data/cf4GalaxiesBinaryFormat.test.ts`
- `tests/data/cf4StreamlinesBinaryFormat.test.ts`
- `tests/tools/buildCf4.smoke.test.ts` — end-to-end against tiny CSV
  fixtures.

### Modified files

- `package.json` — add `"build-cf4": "tsx tools/buildCf4.ts"`.
- `.gitignore` — add `data/raw/cf4/*.csv` (the 90MB streamlines CSV must
  not be committed; the README explains how to obtain it).
- `README.md` — short paragraph under "Building the data" explaining how
  to set up `data/raw/cf4/` and run `npm run build-cf4`.

---

## Binary formats

### CF4G v1 — `cf4_galaxies.bin`

Header (16 bytes), little-endian:

```
0       4     magic    = "CF4G" (0x47344643)
4       4     version  = 1
8       4     count    (uint32) — number of galaxies
12      4     reserved = 0       — keeps record array 8-byte aligned
```

Then a packed record array, **24 bytes per record**:

```
0   4   sgx       f32   supergalactic cartesian, Mpc
4   4   sgy       f32
8   4   sgz       f32
12  4   distance  f32   D_Mpc from CSV (redundant with √(sgx²+sgy²+sgz²)
                        but useful for filtering by D and saves the sqrt
                        per frame)
16  4   basinId   u32   0..N (0 = unassigned / outside CF4 volume)
20  4   reserved  u32   0
```

Total file size: `16 + 24 × count`. For ~56k galaxies: ~1.3 MB.

We deliberately do **not** store the 25-column distance-modulus-per-method
metadata from the laniakea CSV in the bin. Phase 1 doesn't surface those in
the InfoCard. A future plan can either parse the CSV at runtime for clicks
or extend the format to v2 with optional methods.

### CF4S v1 — `cf4_streamlines.bin`

Mirrors `filaments.bin` exactly — strip-offset table + flat vertex array.

Header (16 bytes), little-endian:

```
0       4     magic    = "CF4S" (0x53344643)
4       4     version  = 1
8       4     stripCount       (uint32)
12      4     vertexCount      (uint32) — total verts across all strips
```

Then:

```
stripOffsets:   uint32 × (stripCount + 1)
                stripOffsets[i] = first vertex idx of strip i
                stripOffsets[stripCount] = vertexCount

vertices:       float32 × 4 × vertexCount
                Per vertex: [sgx, sgy, sgz, basinId]
                basinId stored as f32 — exact for ids < 2²⁴; lets the
                whole vertex be one Float32Array which the GPU consumes
                as a single vec4 attribute.
```

Total file size: `16 + 4 × (stripCount + 1) + 16 × vertexCount`. The
laniakea defaults produce ~30k strips × ~75 verts avg ≈ 2.2M verts → ~36
MB. The build script gzips the bin output to ~12 MB; Vite serves it
gzip-encoded automatically.

### `cf4_basins.json`

Ships the laniakea palette (from `config/simple_CF4_plot.toml`) plus
human-readable basin names where known. Tiny JSON — committed to git.

```json
{
  "version": 1,
  "basins": [
    { "id": 0, "name": "Unassigned", "color": "#ffffff" },
    { "id": 1, "name": "Laniakea",   "color": "#e6194b" },
    { "id": 2, "name": "Perseus-Pisces", "color": "#3cb44b" },
    ...
  ]
}
```

The actual basin names corresponding to ids 1-9 must be confirmed against
the laniakea README / the source paper before shipping; see Open Questions
in the index.

---

## Tasks

### Task 0: Pre-flight

- [ ] **Step 0.1: Verify baseline.**

```
cd /Users/rulkens/Development/js/skymap && npm run typecheck && npm test
```

Expected: typecheck clean, all 590+ tests pass. Record the count for the
self-review at the end.

- [ ] **Step 0.2: Set up `data/raw/cf4/` with README.**

Create `data/raw/cf4/README.md`:

```markdown
# CF4 raw data

This directory stores CSVs produced by the
[laniakea](https://github.com/) pipeline (Tully+ 2023 + Dupuy 2026).

## What to put here

Copy three CSVs from a local laniakea checkout (pinned to commit
`v1.0.0` or later):

- `1_CF4_galaxies_table/CF4_galaxies_with_basin_id.csv`  (~10 MB)
- `2_CF4_streamlines/CF4_streams_streamlines.csv`         (~90 MB)
- `2_CF4_streamlines/CF4_streams_seeds.csv`               (optional, ~0.2 MB)

The 90 MB streamlines CSV is gitignored. The build pipeline derives a
~12 MB binary from it that ships in `public/data/cf4_streamlines.bin`.

## Why not commit the CSVs directly?

The streamlines file is too large for git, and re-running laniakea (or
even re-pulling the CSVs) is rare enough that pinning the **derived
binaries** (which we DO commit under `public/data/`) is the right
trade-off.

## How to regenerate

1. Clone laniakea: `git clone <url> ~/laniakea && cd ~/laniakea`
2. Either (a) follow laniakea's README to regenerate the CSVs from
   FITS, or (b) download the pre-built CSVs from the project release.
3. Copy the three CSVs into this directory.
4. Run `npm run build-cf4` from the skymap root.
```

Append to `.gitignore`:

```
# CF4 raw data — sourced from the laniakea pipeline; binaries are
# rebuilt via `npm run build-cf4` and committed under public/data/.
data/raw/cf4/*.csv
```

Then:

```
git status
```

Expected: `data/raw/cf4/README.md` is untracked, `.gitignore` is modified,
no `.csv` files appear.

- [ ] **Step 0.3: Commit the directory + gitignore.**

```
git add data/raw/cf4/README.md .gitignore
git commit -m "chore(cf4): set up data/raw/cf4 with laniakea pin instructions"
```

---

### Task 1: CF4 galaxies parser

**Files:**

- Create: `tools/parsers/cf4Galaxies.ts`
- Create: `tests/parsers/cf4Galaxies.test.ts`

The CSV header is:

```
pgc,1PGC,T17,Vcmb,DM,eDM,DMsnIa,eDMsn1,DMtf,eDMtf,DMfp,eDMfp,DMsbf,eDMsbf,DMsnII,eDMsn2,DMtrgb,eDMt,DMcep,eDMcep,DMmas,eDMmas,RA,DE,glon,glat,sgl,sgb,D_Mpc,SGX,SGY,SGZ,basin_id
```

We only consume **5 columns**: `D_Mpc, SGX, SGY, SGZ, basin_id`. Missing
fields are common in `DM*sn*` columns but not in the five we care about.

- [ ] **Step 1.1: Failing test for the parser.**

Write `tests/parsers/cf4Galaxies.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseCf4Galaxies } from '../../tools/parsers/cf4Galaxies';

describe('parseCf4Galaxies', () => {
  it('parses a two-row fixture extracting only the columns we need', () => {
    const fixture =
      'pgc,1PGC,T17,Vcmb,DM,eDM,DMsnIa,eDMsn1,DMtf,eDMtf,DMfp,eDMfp,DMsbf,eDMsbf,DMsnII,eDMsn2,DMtrgb,eDMt,DMcep,eDMcep,DMmas,eDMmas,RA,DE,glon,glat,sgl,sgb,D_Mpc,SGX,SGY,SGZ,basin_id\n' +
      '4,120,0,4109,33.5,0.4,,,33.5,0.4,,,,,,,,,,,,,0.01,23.1,107.8,-38.3,316.1,18.5,49.7,-32.7,33.97,15.74,6\n' +
      '12,12,0,6195,35.0,0.4,,,35.0,0.4,,,,,,,,,,,,,0.04,-6.4,90.2,-65.9,286.4,11.4,99.2,-93.3,27.5,19.5,3\n';
    const out = parseCf4Galaxies(fixture);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      sgx: -32.7,
      sgy: 33.97,
      sgz: 15.74,
      distance: 49.7,
      basinId: 6,
    });
    expect(out[1].basinId).toBe(3);
  });

  it('throws on missing required columns', () => {
    const fixture = 'sgx,sgy\n1,2\n';
    expect(() => parseCf4Galaxies(fixture)).toThrow(/SGX|SGY|SGZ|D_Mpc|basin_id/);
  });

  it('skips rows with empty SGX/SGY/SGZ', () => {
    const fixture =
      'D_Mpc,SGX,SGY,SGZ,basin_id\n' +
      '50,1,2,3,1\n' +
      '60,,2,3,1\n';
    const out = parseCf4Galaxies(fixture);
    expect(out).toHaveLength(1);
  });
});
```

Run: `npm test -- cf4Galaxies`. Expect failure (file doesn't exist).

- [ ] **Step 1.2: Implement the parser.**

Write `tools/parsers/cf4Galaxies.ts`. Use a streaming-friendly hand-rolled
CSV split rather than a dependency — the laniakea CSV has no embedded
commas, no quoted fields, no escapes. Stay strict so a future format change
fails loudly:

```ts
/**
 * CF4 galaxies parser — reads laniakea's CF4_galaxies_with_basin_id.csv.
 *
 * Why a hand-rolled parser? The laniakea CSV is plain comma-separated
 * with no quoting and no embedded commas. Pulling in a CSV library for
 * a one-off build script is overkill. Strictness here pays off because a
 * silent column-rename in laniakea would otherwise produce nonsense
 * binaries.
 *
 * We extract only 5 columns out of 33 because Phase 1 doesn't surface
 * the per-method distance moduli in the InfoCard. Extending later means
 * bumping the binary format to v2.
 */
export type ParsedCf4Galaxy = {
  sgx: number;     // supergalactic cartesian X, Mpc
  sgy: number;     // supergalactic cartesian Y, Mpc
  sgz: number;     // supergalactic cartesian Z, Mpc
  distance: number; // D_Mpc — redundant with √(sgx²+sgy²+sgz²) but ships
                    // alongside so runtime distance filters skip the sqrt
  basinId: number;  // 0..N (0 = outside CF4 volume; ids 1..9 in the
                    // laniakea palette correspond to named attractors)
};

const REQUIRED_COLS = ['SGX', 'SGY', 'SGZ', 'D_Mpc', 'basin_id'] as const;

export function parseCf4Galaxies(csv: string): ParsedCf4Galaxy[] {
  const lines = csv.split('\n');
  if (lines.length < 2) return [];
  const header = lines[0]!.split(',');
  const idx: Record<(typeof REQUIRED_COLS)[number], number> = {} as never;
  for (const col of REQUIRED_COLS) {
    const i = header.indexOf(col);
    if (i < 0) throw new Error(`parseCf4Galaxies: missing required column "${col}"`);
    idx[col] = i;
  }
  const out: ParsedCf4Galaxy[] = [];
  for (let l = 1; l < lines.length; l++) {
    const line = lines[l]!.trim();
    if (line.length === 0) continue;
    const cells = line.split(',');
    const sgx = cells[idx.SGX]!;
    const sgy = cells[idx.SGY]!;
    const sgz = cells[idx.SGZ]!;
    if (sgx === '' || sgy === '' || sgz === '') continue;
    out.push({
      sgx: Number.parseFloat(sgx),
      sgy: Number.parseFloat(sgy),
      sgz: Number.parseFloat(sgz),
      distance: Number.parseFloat(cells[idx.D_Mpc]!),
      basinId: Number.parseInt(cells[idx.basin_id]!, 10),
    });
  }
  return out;
}
```

Run: `npm test -- cf4Galaxies`. Expect green.

- [ ] **Step 1.3: Commit.**

```
git add tools/parsers/cf4Galaxies.ts tests/parsers/cf4Galaxies.test.ts
git commit -m "feat(cf4): parse CF4 galaxies+basin CSV from laniakea"
```

---

### Task 2: CF4 streamlines parser

**Files:**

- Create: `tools/parsers/cf4Streamlines.ts`
- Create: `tests/parsers/cf4Streamlines.test.ts`

CSV header: `streamline_id,basin_id,vertex_idx,SGX,SGY,SGZ`. Vertices are
grouped by `streamline_id` and ordered by `vertex_idx`. The CSV is sorted
by `(streamline_id, vertex_idx)` already (verified by sampling laniakea
output) but the parser does **not** rely on that — it groups defensively.

- [ ] **Step 2.1: Failing test.**

Write `tests/parsers/cf4Streamlines.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseCf4Streamlines } from '../../tools/parsers/cf4Streamlines';

describe('parseCf4Streamlines', () => {
  it('groups vertices by streamline_id preserving vertex_idx order', () => {
    const fixture =
      'streamline_id,basin_id,vertex_idx,SGX,SGY,SGZ\n' +
      '0,1,0,1,2,3\n' +
      '0,1,1,4,5,6\n' +
      '1,2,0,7,8,9\n' +
      '0,1,2,10,11,12\n'; // out-of-order — we re-sort
    const strips = parseCf4Streamlines(fixture);
    expect(strips).toHaveLength(2);
    expect(strips[0]).toEqual({
      basinId: 1,
      vertices: [1, 2, 3, 4, 5, 6, 10, 11, 12],
    });
    expect(strips[1]).toEqual({ basinId: 2, vertices: [7, 8, 9] });
  });

  it('throws on missing required columns', () => {
    const fixture = 'streamline_id,SGX\n0,1\n';
    expect(() => parseCf4Streamlines(fixture)).toThrow();
  });

  it('drops strips with fewer than 2 vertices (degenerate)', () => {
    const fixture =
      'streamline_id,basin_id,vertex_idx,SGX,SGY,SGZ\n' +
      '0,1,0,1,2,3\n' + // singleton
      '1,1,0,4,5,6\n' +
      '1,1,1,7,8,9\n';
    const strips = parseCf4Streamlines(fixture);
    expect(strips).toHaveLength(1);
    expect(strips[0]!.vertices).toHaveLength(6);
  });
});
```

Run: `npm test -- cf4Streamlines`. Expect failure.

- [ ] **Step 2.2: Implement.**

Write `tools/parsers/cf4Streamlines.ts`:

```ts
/**
 * CF4 streamlines parser — reads CF4_streams_streamlines.csv.
 *
 * The CSV is one row per streamline-vertex with grouping key
 * `streamline_id` and intra-group order `vertex_idx`. We don't trust the
 * file is pre-sorted (even though laniakea's writer happens to be) — the
 * cost of an O(n log n) sort per strip is negligible vs. the I/O.
 *
 * Output is a flat per-strip array; the build orchestrator concatenates
 * all strips into the strip-offset table format.
 */
export type ParsedCf4Streamline = {
  basinId: number;
  vertices: number[]; // [x0,y0,z0, x1,y1,z1, …] flattened
};

const REQUIRED = ['streamline_id', 'basin_id', 'vertex_idx', 'SGX', 'SGY', 'SGZ'] as const;

type Row = { sid: number; bid: number; vidx: number; x: number; y: number; z: number };

export function parseCf4Streamlines(csv: string): ParsedCf4Streamline[] {
  const lines = csv.split('\n');
  if (lines.length < 2) return [];
  const header = lines[0]!.split(',');
  const idx: Record<(typeof REQUIRED)[number], number> = {} as never;
  for (const col of REQUIRED) {
    const i = header.indexOf(col);
    if (i < 0) throw new Error(`parseCf4Streamlines: missing column "${col}"`);
    idx[col] = i;
  }
  const groups = new Map<number, Row[]>();
  for (let l = 1; l < lines.length; l++) {
    const line = lines[l]!;
    if (line.length === 0) continue;
    const cells = line.split(',');
    const sid = Number.parseInt(cells[idx.streamline_id]!, 10);
    const row: Row = {
      sid,
      bid: Number.parseInt(cells[idx.basin_id]!, 10),
      vidx: Number.parseInt(cells[idx.vertex_idx]!, 10),
      x: Number.parseFloat(cells[idx.SGX]!),
      y: Number.parseFloat(cells[idx.SGY]!),
      z: Number.parseFloat(cells[idx.SGZ]!),
    };
    let arr = groups.get(sid);
    if (!arr) {
      arr = [];
      groups.set(sid, arr);
    }
    arr.push(row);
  }
  const sortedSids = [...groups.keys()].sort((a, b) => a - b);
  const out: ParsedCf4Streamline[] = [];
  for (const sid of sortedSids) {
    const rows = groups.get(sid)!;
    rows.sort((a, b) => a.vidx - b.vidx);
    if (rows.length < 2) continue; // degenerate — skip
    const verts: number[] = [];
    for (const r of rows) verts.push(r.x, r.y, r.z);
    out.push({ basinId: rows[0]!.bid, vertices: verts });
  }
  return out;
}
```

Run: `npm test -- cf4Streamlines`. Expect green.

- [ ] **Step 2.3: Commit.**

```
git add tools/parsers/cf4Streamlines.ts tests/parsers/cf4Streamlines.test.ts
git commit -m "feat(cf4): parse CF4 streamlines CSV grouping vertices by id"
```

---

### Task 3: Galaxies binary format (encode/decode)

**Files:**

- Create: `src/data/cf4GalaxiesBinaryFormat.ts`
- Create: `src/@types/Cf4Cloud.d.ts`
- Create: `tests/data/cf4GalaxiesBinaryFormat.test.ts`

- [ ] **Step 3.1: Type alias.**

Write `src/@types/Cf4Cloud.d.ts`:

```ts
/**
 * Decoded shape of `cf4_galaxies.bin` (CF4G v1).
 *
 * Why interleave SoA arrays instead of a single Float32Array view of
 * mixed types? Because `basinId` is an integer and packing it as f32
 * (the precedent in `filaments.bin`) wastes bits at this scale — 56k
 * galaxies × 4 wasted bytes = 224 KB we'd rather not ship.
 *
 * Type aliases (no `interface`) per project convention.
 */
export type Cf4Cloud = {
  count: number;
  positions: Float32Array; // length 3*count, [x0,y0,z0, x1,y1,z1, ...]
  distances: Float32Array; // length count
  basinIds: Uint32Array;   // length count
};
```

- [ ] **Step 3.2: Failing round-trip test.**

Write `tests/data/cf4GalaxiesBinaryFormat.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  encodeCf4Galaxies,
  decodeCf4Galaxies,
  CF4G_MAGIC,
  CF4G_VERSION,
} from '../../src/data/cf4GalaxiesBinaryFormat';
import type { Cf4Cloud } from '../../src/@types/Cf4Cloud';

describe('cf4GalaxiesBinaryFormat', () => {
  it('round-trips a 3-galaxy cloud', () => {
    const cloud: Cf4Cloud = {
      count: 3,
      positions: new Float32Array([1, 2, 3, 4, 5, 6, -7, -8, -9]),
      distances: new Float32Array([10, 20, 30]),
      basinIds: new Uint32Array([0, 1, 9]),
    };
    const buf = encodeCf4Galaxies(cloud);
    const decoded = decodeCf4Galaxies(buf);
    expect(decoded.count).toBe(3);
    expect(Array.from(decoded.positions)).toEqual([1, 2, 3, 4, 5, 6, -7, -8, -9]);
    expect(Array.from(decoded.distances)).toEqual([10, 20, 30]);
    expect(Array.from(decoded.basinIds)).toEqual([0, 1, 9]);
  });

  it('writes magic + version into the header', () => {
    const cloud: Cf4Cloud = {
      count: 0,
      positions: new Float32Array(0),
      distances: new Float32Array(0),
      basinIds: new Uint32Array(0),
    };
    const buf = encodeCf4Galaxies(cloud);
    const dv = new DataView(buf);
    expect(dv.getUint32(0, true)).toBe(CF4G_MAGIC);
    expect(dv.getUint32(4, true)).toBe(CF4G_VERSION);
  });

  it('throws on bad magic', () => {
    const buf = new ArrayBuffer(16);
    expect(() => decodeCf4Galaxies(buf)).toThrow(/magic/i);
  });

  it('throws with rebuild hint on unknown version', () => {
    const buf = new ArrayBuffer(16);
    const dv = new DataView(buf);
    dv.setUint32(0, CF4G_MAGIC, true);
    dv.setUint32(4, 999, true);
    expect(() => decodeCf4Galaxies(buf)).toThrow(/build-cf4/);
  });
});
```

Run: `npm test -- cf4GalaxiesBinaryFormat`. Expect failure.

- [ ] **Step 3.3: Implement.**

Write `src/data/cf4GalaxiesBinaryFormat.ts`:

```ts
/**
 * cf4GalaxiesBinaryFormat — encode/decode for `cf4_galaxies.bin` (CF4G v1).
 *
 * Layout (little-endian):
 *
 *   ── HEADER (16 bytes) ───────────────────────────────────────────────
 *   0       4     magic    = "CF4G" (0x47344643)
 *   4       4     version  = 1
 *   8       4     count    (uint32)
 *   12      4     reserved = 0
 *
 *   ── RECORD ARRAY (count × 24 bytes) ─────────────────────────────────
 *   0  4  sgx        f32  supergalactic cartesian X, Mpc
 *   4  4  sgy        f32
 *   8  4  sgz        f32
 *   12 4  distance   f32  D_Mpc
 *   16 4  basinId    u32
 *   20 4  reserved   u32  0
 *
 * Why a separate format from PointCloud v4? CF4 has no per-galaxy
 * magnitude, no colour index, no kpc-diameter. Reusing v4 would mean
 * 64 bytes/record where 24 suffice — 56k records × 40 wasted bytes ≈
 * 2.2 MB of zero padding shipped to every browser. A bespoke format
 * with the right slot count is the right trade.
 */
import type { Cf4Cloud } from '../@types/Cf4Cloud';

export const CF4G_MAGIC = 0x47344643; // "CF4G" little-endian
export const CF4G_VERSION = 1;
const HEADER_BYTES = 16;
const RECORD_BYTES = 24;

export function encodeCf4Galaxies(cloud: Cf4Cloud): ArrayBuffer {
  if (cloud.positions.length !== 3 * cloud.count) {
    throw new Error(`encodeCf4Galaxies: positions length ${cloud.positions.length} ≠ 3*count`);
  }
  if (cloud.distances.length !== cloud.count) {
    throw new Error(`encodeCf4Galaxies: distances length ${cloud.distances.length} ≠ count`);
  }
  if (cloud.basinIds.length !== cloud.count) {
    throw new Error(`encodeCf4Galaxies: basinIds length ${cloud.basinIds.length} ≠ count`);
  }
  const buf = new ArrayBuffer(HEADER_BYTES + cloud.count * RECORD_BYTES);
  const dv = new DataView(buf);
  dv.setUint32(0, CF4G_MAGIC, true);
  dv.setUint32(4, CF4G_VERSION, true);
  dv.setUint32(8, cloud.count, true);
  dv.setUint32(12, 0, true);
  for (let i = 0; i < cloud.count; i++) {
    const off = HEADER_BYTES + i * RECORD_BYTES;
    dv.setFloat32(off + 0, cloud.positions[i * 3 + 0]!, true);
    dv.setFloat32(off + 4, cloud.positions[i * 3 + 1]!, true);
    dv.setFloat32(off + 8, cloud.positions[i * 3 + 2]!, true);
    dv.setFloat32(off + 12, cloud.distances[i]!, true);
    dv.setUint32(off + 16, cloud.basinIds[i]!, true);
    dv.setUint32(off + 20, 0, true);
  }
  return buf;
}

export function decodeCf4Galaxies(buf: ArrayBuffer): Cf4Cloud {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== CF4G_MAGIC) {
    throw new Error('decodeCf4Galaxies: bad magic — not a CF4G file');
  }
  const version = dv.getUint32(4, true);
  if (version !== CF4G_VERSION) {
    throw new Error(
      `decodeCf4Galaxies: unsupported version ${version} — please regenerate via "npm run build-cf4"`,
    );
  }
  const count = dv.getUint32(8, true);
  const positions = new Float32Array(3 * count);
  const distances = new Float32Array(count);
  const basinIds = new Uint32Array(count);
  for (let i = 0; i < count; i++) {
    const off = HEADER_BYTES + i * RECORD_BYTES;
    positions[i * 3 + 0] = dv.getFloat32(off + 0, true);
    positions[i * 3 + 1] = dv.getFloat32(off + 4, true);
    positions[i * 3 + 2] = dv.getFloat32(off + 8, true);
    distances[i] = dv.getFloat32(off + 12, true);
    basinIds[i] = dv.getUint32(off + 16, true);
  }
  return { count, positions, distances, basinIds };
}
```

Run: `npm test -- cf4GalaxiesBinaryFormat`. Expect green.

- [ ] **Step 3.4: Commit.**

```
git add src/data/cf4GalaxiesBinaryFormat.ts src/@types/Cf4Cloud.d.ts tests/data/cf4GalaxiesBinaryFormat.test.ts
git commit -m "feat(cf4): CF4G v1 binary format with encode/decode round-trip tests"
```

---

### Task 4: Streamlines binary format

**Files:**

- Create: `src/data/cf4StreamlinesBinaryFormat.ts`
- Create: `src/@types/Cf4StreamlineCloud.d.ts`
- Create: `tests/data/cf4StreamlinesBinaryFormat.test.ts`

This mirrors `filamentBinaryFormat.ts` very closely — same strip-offset
table, same flat vertex array, just 4 floats/vertex (xyz + basinId) instead
of 4 floats/vertex (xyz + density).

- [ ] **Step 4.1: Type alias.**

`src/@types/Cf4StreamlineCloud.d.ts`:

```ts
/**
 * Decoded shape of `cf4_streamlines.bin` (CF4S v1).
 *
 * Mirrors `FilamentCloud` exactly — same strip-offset-table technique
 * for variable-length polylines. The only schematic difference is the
 * trailing per-vertex scalar: filaments carry density (DTFE), CF4
 * streamlines carry basin ID.
 */
export type Cf4StreamlineCloud = {
  stripCount: number;
  vertexCount: number;
  stripOffsets: Uint32Array;  // length stripCount + 1
  vertices: Float32Array;     // length 4 * vertexCount, [x,y,z,basinId, ...]
};
```

- [ ] **Step 4.2: Failing round-trip test.**

`tests/data/cf4StreamlinesBinaryFormat.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  encodeCf4Streamlines,
  decodeCf4Streamlines,
  CF4S_MAGIC,
  CF4S_VERSION,
} from '../../src/data/cf4StreamlinesBinaryFormat';
import type { Cf4StreamlineCloud } from '../../src/@types/Cf4StreamlineCloud';

describe('cf4StreamlinesBinaryFormat', () => {
  it('round-trips a 2-strip, 5-vertex cloud', () => {
    const cloud: Cf4StreamlineCloud = {
      stripCount: 2,
      vertexCount: 5,
      stripOffsets: new Uint32Array([0, 3, 5]),
      vertices: new Float32Array([
        1, 2, 3, 1,   // strip 0 v0  basin 1
        4, 5, 6, 1,   // strip 0 v1
        7, 8, 9, 1,   // strip 0 v2
        10, 11, 12, 2, // strip 1 v0  basin 2
        13, 14, 15, 2, // strip 1 v1
      ]),
    };
    const buf = encodeCf4Streamlines(cloud);
    const decoded = decodeCf4Streamlines(buf);
    expect(decoded.stripCount).toBe(2);
    expect(decoded.vertexCount).toBe(5);
    expect(Array.from(decoded.stripOffsets)).toEqual([0, 3, 5]);
    expect(Array.from(decoded.vertices)).toEqual(Array.from(cloud.vertices));
  });

  it('writes magic + version into header', () => {
    const cloud: Cf4StreamlineCloud = {
      stripCount: 0,
      vertexCount: 0,
      stripOffsets: new Uint32Array([0]),
      vertices: new Float32Array(0),
    };
    const buf = encodeCf4Streamlines(cloud);
    const dv = new DataView(buf);
    expect(dv.getUint32(0, true)).toBe(CF4S_MAGIC);
    expect(dv.getUint32(4, true)).toBe(CF4S_VERSION);
  });

  it('throws on bad magic and on unknown version with rebuild hint', () => {
    const bad = new ArrayBuffer(16);
    expect(() => decodeCf4Streamlines(bad)).toThrow(/magic/i);
    const dv = new DataView(bad);
    dv.setUint32(0, CF4S_MAGIC, true);
    dv.setUint32(4, 999, true);
    expect(() => decodeCf4Streamlines(bad)).toThrow(/build-cf4/);
  });
});
```

Run: `npm test -- cf4StreamlinesBinaryFormat`. Expect failure.

- [ ] **Step 4.3: Implement.**

`src/data/cf4StreamlinesBinaryFormat.ts`:

```ts
/**
 * cf4StreamlinesBinaryFormat — encode/decode for `cf4_streamlines.bin`
 * (CF4S v1).
 *
 * Format mirrors `filamentBinaryFormat.ts` (FILA v1):
 *
 *   ── HEADER (16 bytes) ───────────────────────────────────────────────
 *   0       4     magic    = "CF4S" (0x53344643)
 *   4       4     version  = 1
 *   8       4     stripCount       (uint32)
 *   12      4     vertexCount      (uint32)
 *
 *   ── STRIP-OFFSET TABLE (stripCount+1 × u32) ─────────────────────────
 *   ── VERTEX ARRAY (vertexCount × 16 bytes) ───────────────────────────
 *   per vertex:  [x, y, z, basinId] : f32 × 4
 *
 * Why basinId as f32?  Round-tripping integers up to 2²⁴ via f32 is
 * exact, and a single Float32Array maps cleanly to one WebGPU vertex
 * attribute. Splitting into a separate u32 buffer would cost a second
 * vertex-buffer slot for no end-user benefit.
 */
import type { Cf4StreamlineCloud } from '../@types/Cf4StreamlineCloud';

export const CF4S_MAGIC = 0x53344643; // "CF4S" little-endian
export const CF4S_VERSION = 1;
const HEADER_BYTES = 16;
const FLOATS_PER_VERTEX = 4;
const BYTES_PER_VERTEX = FLOATS_PER_VERTEX * 4;

export function encodeCf4Streamlines(cloud: Cf4StreamlineCloud): ArrayBuffer {
  if (cloud.stripOffsets.length !== cloud.stripCount + 1) {
    throw new Error(
      `encodeCf4Streamlines: stripOffsets length ${cloud.stripOffsets.length} ≠ stripCount+1`,
    );
  }
  if (cloud.vertices.length !== cloud.vertexCount * FLOATS_PER_VERTEX) {
    throw new Error(
      `encodeCf4Streamlines: vertices length ${cloud.vertices.length} ≠ vertexCount × 4`,
    );
  }
  const offsetTableBytes = (cloud.stripCount + 1) * 4;
  const vertexBytes = cloud.vertexCount * BYTES_PER_VERTEX;
  const buf = new ArrayBuffer(HEADER_BYTES + offsetTableBytes + vertexBytes);
  const dv = new DataView(buf);
  dv.setUint32(0, CF4S_MAGIC, true);
  dv.setUint32(4, CF4S_VERSION, true);
  dv.setUint32(8, cloud.stripCount, true);
  dv.setUint32(12, cloud.vertexCount, true);

  new Uint32Array(buf, HEADER_BYTES, cloud.stripCount + 1).set(cloud.stripOffsets);
  new Float32Array(
    buf,
    HEADER_BYTES + offsetTableBytes,
    cloud.vertexCount * FLOATS_PER_VERTEX,
  ).set(cloud.vertices);
  return buf;
}

export function decodeCf4Streamlines(buf: ArrayBuffer): Cf4StreamlineCloud {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== CF4S_MAGIC) {
    throw new Error('decodeCf4Streamlines: bad magic — not a CF4S file');
  }
  const version = dv.getUint32(4, true);
  if (version !== CF4S_VERSION) {
    throw new Error(
      `decodeCf4Streamlines: unsupported version ${version} — please regenerate via "npm run build-cf4"`,
    );
  }
  const stripCount = dv.getUint32(8, true);
  const vertexCount = dv.getUint32(12, true);
  const offsetTableBytes = (stripCount + 1) * 4;
  const stripOffsets = new Uint32Array(stripCount + 1);
  stripOffsets.set(new Uint32Array(buf, HEADER_BYTES, stripCount + 1));
  const vertices = new Float32Array(vertexCount * FLOATS_PER_VERTEX);
  vertices.set(
    new Float32Array(buf, HEADER_BYTES + offsetTableBytes, vertexCount * FLOATS_PER_VERTEX),
  );
  return { stripCount, vertexCount, stripOffsets, vertices };
}
```

Run: `npm test -- cf4StreamlinesBinaryFormat`. Expect green.

- [ ] **Step 4.4: Commit.**

```
git add src/data/cf4StreamlinesBinaryFormat.ts src/@types/Cf4StreamlineCloud.d.ts tests/data/cf4StreamlinesBinaryFormat.test.ts
git commit -m "feat(cf4): CF4S v1 streamline format mirroring FILA v1 layout"
```

---

### Task 5: Build orchestrator

**Files:**

- Create: `tools/buildCf4.ts`
- Create: `tests/tools/buildCf4.smoke.test.ts`
- Modify: `package.json`

- [ ] **Step 5.1: Failing smoke test using tiny fixtures.**

`tests/tools/buildCf4.smoke.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runBuildCf4 } from '../../tools/buildCf4';
import { decodeCf4Galaxies } from '../../src/data/cf4GalaxiesBinaryFormat';
import { decodeCf4Streamlines } from '../../src/data/cf4StreamlinesBinaryFormat';

describe('buildCf4 (smoke)', () => {
  let tmp: string;
  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), 'cf4-'));
    const raw = join(tmp, 'raw');
    const out = join(tmp, 'out');
    writeFileSync(join(tmp, '__layout__'), `${raw}\n${out}\n`);
    // structure mirrors laniakea
    const galTbl = join(raw, '1_CF4_galaxies_table');
    const stTbl  = join(raw, '2_CF4_streamlines');
    require('node:fs').mkdirSync(galTbl, { recursive: true });
    require('node:fs').mkdirSync(stTbl,  { recursive: true });
    require('node:fs').mkdirSync(out, { recursive: true });
    writeFileSync(
      join(galTbl, 'CF4_galaxies_with_basin_id.csv'),
      'D_Mpc,SGX,SGY,SGZ,basin_id\n50,1,2,3,1\n60,4,5,6,2\n',
    );
    writeFileSync(
      join(stTbl, 'CF4_streams_streamlines.csv'),
      'streamline_id,basin_id,vertex_idx,SGX,SGY,SGZ\n0,1,0,0,0,0\n0,1,1,1,1,1\n1,2,0,2,2,2\n1,2,1,3,3,3\n',
    );
  });
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  it('writes both binaries and a basin palette JSON that round-trip', async () => {
    const layout = readFileSync(join(tmp, '__layout__'), 'utf8').trim().split('\n');
    const [raw, out] = layout;
    await runBuildCf4({ laniakeaRoot: raw!, outDir: out! });
    const gBuf = readFileSync(join(out!, 'cf4_galaxies.bin'));
    const decoded = decodeCf4Galaxies(gBuf.buffer.slice(gBuf.byteOffset, gBuf.byteOffset + gBuf.byteLength));
    expect(decoded.count).toBe(2);
    expect(Array.from(decoded.basinIds)).toEqual([1, 2]);
    const sBuf = readFileSync(join(out!, 'cf4_streamlines.bin'));
    const sd = decodeCf4Streamlines(sBuf.buffer.slice(sBuf.byteOffset, sBuf.byteOffset + sBuf.byteLength));
    expect(sd.stripCount).toBe(2);
    expect(sd.vertexCount).toBe(4);
    const palette = JSON.parse(readFileSync(join(out!, 'cf4_basins.json'), 'utf8'));
    expect(palette.basins).toHaveLength(10); // 0..9
  });
});
```

Run: `npm test -- buildCf4`. Expect failure.

- [ ] **Step 5.2: Implement the orchestrator with an exported `runBuildCf4`.**

`tools/buildCf4.ts`:

```ts
#!/usr/bin/env node
/**
 * buildCf4 — read laniakea CSVs, emit skymap binary assets.
 *
 * Pipeline:
 *   1. Read three CSVs from the supplied --laniakea-root (or
 *      data/raw/cf4 by default — see the README in that directory).
 *   2. Parse via the pure functions in tools/parsers/cf4*.ts.
 *   3. Pack into the on-disk record/strip-offset layouts.
 *   4. Write public/data/cf4_galaxies.bin + cf4_streamlines.bin
 *      + cf4_basins.json.
 *
 * Why an orchestrator AND a runnable export? The CLI shape lets the
 * user run `npm run build-cf4`. The exported `runBuildCf4` lets the
 * smoke test drive the whole pipeline against tmpdir fixtures without
 * mocking process.argv — same pattern as buildFilaments.ts.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCf4Galaxies } from './parsers/cf4Galaxies.js';
import { parseCf4Streamlines } from './parsers/cf4Streamlines.js';
import { encodeCf4Galaxies } from '../src/data/cf4GalaxiesBinaryFormat.js';
import { encodeCf4Streamlines } from '../src/data/cf4StreamlinesBinaryFormat.js';
import type { Cf4Cloud } from '../src/@types/Cf4Cloud';
import type { Cf4StreamlineCloud } from '../src/@types/Cf4StreamlineCloud';

/**
 * Default basin palette mirroring laniakea's `simple_CF4_plot.toml`.
 * Names beyond "Laniakea" are TENTATIVE and must be confirmed against
 * the source paper before plan 04 ships colour-coded basins to users.
 */
const DEFAULT_PALETTE = [
  { id: 0, name: 'Unassigned',     color: '#ffffff' },
  { id: 1, name: 'Laniakea',       color: '#e6194b' },
  { id: 2, name: 'Perseus-Pisces', color: '#3cb44b' },
  { id: 3, name: 'Coma',           color: '#ffe119' },
  { id: 4, name: 'Hercules',       color: '#4363d8' },
  { id: 5, name: 'Shapley',        color: '#f58231' },
  { id: 6, name: 'Great Attractor', color: '#fabed4' },
  { id: 7, name: 'Pavo-Indus',     color: '#f032e6' },
  { id: 8, name: 'Bootes',         color: '#42d4f4' },
  { id: 9, name: 'Other',          color: '#dcbeff' },
];

export type RunBuildCf4Args = {
  laniakeaRoot: string;
  outDir: string;
};

export async function runBuildCf4(args: RunBuildCf4Args): Promise<void> {
  const { laniakeaRoot, outDir } = args;
  mkdirSync(outDir, { recursive: true });

  // --- galaxies ---
  const galCsv = readFileSync(
    join(laniakeaRoot, '1_CF4_galaxies_table', 'CF4_galaxies_with_basin_id.csv'),
    'utf8',
  );
  const parsedGals = parseCf4Galaxies(galCsv);
  const cloud: Cf4Cloud = {
    count: parsedGals.length,
    positions: new Float32Array(parsedGals.length * 3),
    distances: new Float32Array(parsedGals.length),
    basinIds: new Uint32Array(parsedGals.length),
  };
  for (let i = 0; i < parsedGals.length; i++) {
    const g = parsedGals[i]!;
    cloud.positions[i * 3 + 0] = g.sgx;
    cloud.positions[i * 3 + 1] = g.sgy;
    cloud.positions[i * 3 + 2] = g.sgz;
    cloud.distances[i] = g.distance;
    cloud.basinIds[i] = g.basinId;
  }
  const gBuf = encodeCf4Galaxies(cloud);
  writeFileSync(join(outDir, 'cf4_galaxies.bin'), Buffer.from(gBuf));
  console.log(`cf4_galaxies.bin: ${parsedGals.length} galaxies, ${gBuf.byteLength} bytes`);

  // --- streamlines ---
  const stCsv = readFileSync(
    join(laniakeaRoot, '2_CF4_streamlines', 'CF4_streams_streamlines.csv'),
    'utf8',
  );
  const strips = parseCf4Streamlines(stCsv);
  let totalVerts = 0;
  for (const s of strips) totalVerts += s.vertices.length / 3;
  const stripOffsets = new Uint32Array(strips.length + 1);
  const verts = new Float32Array(totalVerts * 4);
  let cursor = 0;
  for (let s = 0; s < strips.length; s++) {
    stripOffsets[s] = cursor;
    const strip = strips[s]!;
    const vc = strip.vertices.length / 3;
    for (let v = 0; v < vc; v++) {
      verts[(cursor + v) * 4 + 0] = strip.vertices[v * 3 + 0]!;
      verts[(cursor + v) * 4 + 1] = strip.vertices[v * 3 + 1]!;
      verts[(cursor + v) * 4 + 2] = strip.vertices[v * 3 + 2]!;
      verts[(cursor + v) * 4 + 3] = strip.basinId;
    }
    cursor += vc;
  }
  stripOffsets[strips.length] = cursor;
  const sCloud: Cf4StreamlineCloud = {
    stripCount: strips.length,
    vertexCount: totalVerts,
    stripOffsets,
    vertices: verts,
  };
  const sBuf = encodeCf4Streamlines(sCloud);
  writeFileSync(join(outDir, 'cf4_streamlines.bin'), Buffer.from(sBuf));
  console.log(
    `cf4_streamlines.bin: ${strips.length} strips, ${totalVerts} verts, ${sBuf.byteLength} bytes`,
  );

  // --- palette ---
  writeFileSync(
    join(outDir, 'cf4_basins.json'),
    JSON.stringify({ version: 1, basins: DEFAULT_PALETTE }, null, 2),
  );
}

// CLI entry-point — only runs when invoked via `tsx tools/buildCf4.ts`.
const isMain = process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  let laniakeaRoot = resolve(process.cwd(), 'data/raw/cf4');
  let outDir = resolve(process.cwd(), 'public/data');
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--laniakea-root') laniakeaRoot = resolve(argv[++i]!);
    else if (argv[i] === '--out') outDir = resolve(argv[++i]!);
  }
  runBuildCf4({ laniakeaRoot, outDir }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
```

- [ ] **Step 5.3: Add the npm script.**

In `package.json`, under `scripts`, add:

```
"build-cf4": "tsx tools/buildCf4.ts"
```

Run: `npm test -- buildCf4`. Expect green. Then:

```
npm run typecheck
```

Expect clean.

- [ ] **Step 5.4: Commit.**

```
git add tools/buildCf4.ts tests/tools/buildCf4.smoke.test.ts package.json
git commit -m "feat(cf4): build orchestrator emits cf4_galaxies/streamlines/basins"
```

---

### Task 6: Document and produce the real binaries

- [ ] **Step 6.1: Update README.**

Add a short section to `/Users/rulkens/Development/js/skymap/README.md`
explaining the CF4 build dependency. One paragraph: clone laniakea, copy
the three CSVs into `data/raw/cf4/`, run `npm run build-cf4`. Link to
`data/raw/cf4/README.md` for details.

- [ ] **Step 6.2: Run the build against a real laniakea checkout.**

If laniakea is at `/tmp/laniakea`:

```
npm run build-cf4 -- --laniakea-root /tmp/laniakea
```

Expected console output:

```
cf4_galaxies.bin: ~55000 galaxies, ~1.3 MB
cf4_streamlines.bin: ~30000 strips, ~2200000 verts, ~36 MB
```

Verify the three files exist under `public/data/`:

```
ls -lh public/data/cf4_galaxies.bin public/data/cf4_streamlines.bin public/data/cf4_basins.json
```

- [ ] **Step 6.3: Commit the binaries.**

```
git add public/data/cf4_galaxies.bin public/data/cf4_streamlines.bin public/data/cf4_basins.json README.md
git commit -m "build(cf4): bake initial CF4 binaries from laniakea v1.0.0"
```

---

## Self-review

- [ ] `npm run typecheck` clean.
- [ ] `npm test` green; new test count is at least previous + 5 (parsers ×2,
      formats ×2, build smoke ×1).
- [ ] `public/data/cf4_galaxies.bin`, `public/data/cf4_streamlines.bin`,
      `public/data/cf4_basins.json` are committed and sized as expected
      (~1.3 MB / ~36 MB / ~1 KB respectively).
- [ ] No CSVs are committed to `data/raw/cf4/` (gitignore working).
- [ ] All didactic comments explain *why*, not just *what* — e.g. why a
      bespoke binary format vs. extending PointCloud v4.
- [ ] All TS types are `type` aliases, never `interface`.

After this plan ships: nothing renders yet, but the data pipeline is
production-ready and the binaries can be inspected by any decoder. Plan
02 reads `cf4_galaxies.bin` and draws the first dots.
