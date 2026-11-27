# Volume detail region: design spec

> **Status.** Approved by the owner, 2026-11-26. Owner: Alexander Rulkens. PR 4 of the volume
> effort (PR 1 #1170 prep, PR 2 #1175 progressive sampling, PR 3 #1178 half-res compressed cubes).
> Shape approved at the ground check (dash ask vxC4) and the whole spec at review, both 2026-11-26;
> the rulings are quoted in §2. Plan: `docs/superpowers/plans/2026-11-26-volume-detail-region.md`.
> **Written against** main at 45528d82f (the archive rows of §3 against 9b1bd2dad, which this branch
> merged), and against the post-prep shape of §3 as if it existed.
> **Inputs.** The box spike (worktree `volume-progressive-octree`: `spike/boxSpike.ts`, the
> `fs_box` branch of `shaders/scalarVolume/fragment.wesl`, `tools/spike/flickerFade.ts`;
> throwaway, never merged, not a code base) and its measured numbers, quoted where used. The
> ground check's facts and an independent design check made without repo access (the "greenfield
> check") are the other inputs; where they differ, §3 and §8 say which won and why.

## 1. Goal and non-goals

Near the camera, inside a volume or close outside it, the MCPM and Polyphorm 2MRS density volumes
draw at native resolution (MCPM 0.78 Mpc, 2MRS 1.22 Mpc per voxel) instead of the half-res base. A
box of full-res data, centred on the camera clamped into the volume, streams in by HTTP Range in
48³-voxel bricks and replaces the base inside it. Outside the box, and wherever a pixel is coarser
than one native voxel, the base draws as today.

| Tier   | Region (bricks per axis) | Edge, MCPM / 2MRS | GPU bytes added, both volumes (ASTC / BC4 / r8) |
| ------ | ------------------------ | ----------------- | ----------------------------------------------- |
| small  | K = 5 (240 voxels)       | 187.5 / 293.8 Mpc | 12,288,000 / 13,824,000 / 27,648,000            |
| medium | K = 5                    | 187.5 / 293.8 Mpc | 12,288,000 / 13,824,000 / 27,648,000            |
| large  | K = 8 (384 voxels)       | 300.0 / 470.1 Mpc | 50,331,648 / 56,623,104 / 113,246,208           |

Download per full region fill, ASTC, estimated (§4): MCPM 1.7 MB at K = 5, 6.9 MB at K = 8; 2MRS
0.9 / 3.5 MB. Spike cost per draw with a 384³ region over the ASTC half-res base, camera inside
MCPM: 0.48–0.50 ms, against 0.59–0.65 ms for the old large tier.

The timing checks #1178 deferred (BACKLOG.md:123) were accepted on 2026-11-27; the region's own cost
is timed on against off in acceptance (§13 check 2).

Non-goals: a region beyond the gate distance (§6.6); mips in the region; an app-side brick cache; target-centred or frozen regions; a debug panel; the dust volume; any change to the
L1–L3 files, the sidecar or the base path; a finer 2MRS export.

## 2. Rulings

Owner, 2026-11-26 (ask vxC4), binding:

1. Shape: one 3D texture per field, brick `b` placed at slot `b mod K`, the drawn region a box
   (AABB uniforms, no residency texture), streamed through the existing tile stream.
2. The brick index reuses the surface tiles' archive index format, moved to a shared home.
3. The bricks are level 0 of `volume-pyramid/v1`. The sidecar is unchanged.
4. Each brick is its own gzip member inside the pack.
5. Tiers: small and medium get the small region (K = 5), large the large region (K = 8). "Small
   should also get a small box."
6. The 2MRS native input is read from the owner's Polyphorm export folder. Mirroring it to R2
   stays on the backlog (BACKLOG.md:174).
7. Everything rides one PR; the prep commits come first.

Owner, 2026-11-26, at the spec's review, binding:

8. Fade: the spike's three boxes (§8), judged by eye on the spike and passed.
9. The region is drawn from close outside a volume too: "when we're looking at it from relatively
   close to the volume, the detail region should still be drawn, because it's right in front of
   you" (§6.2, §6.6).
10. Brick reads use the browser's HTTP cache. Acceptance measures it against `no-store` (§13 check
    6); switching is the owner's call on those numbers.
11. The region's state lives on each region object, written only by the planner. The planner
    contract does not grow.
12. Full-res brick builds run only on the owner's machine (ruling 6; §5).
13. Prep (a) runs once the terrain-shadow PR has merged, since both touch the tile files. It merged
    as #1179; this branch merged main after it, so prep (a) is an ordinary prep commit.

Carried: the region is centred on the camera, clamped into the volume; the name is "detail
region"; 2MRS works exactly like MCPM; the region is torn down on disable; nothing is deleted from the spike; the deferred #1178
timing checks open this PR (accepted 2026-11-27). Standing:
timing in ms per frame and fps first, percent after; measuring runs about 30 minutes, one pass;
the Layer contract, `ReconcileEffects` and `SagaContext` do not grow (this design grows none of
them).

## 3. Ground preparation

**Sketch.** The region is a second value per field beside the base `GpuVolume`. A once-per-frame
planner owns the streaming and publishes a numbers-only draw value per field. The accumulation
key and the renderer read that one value through the liveness bundle they already share. The
texture reaches the renderer once, through its own method. The archive format becomes a shared
module both Layers import.

| Touchpoint (main 45528d82f) | Today | Verdict | After |
| --- | --- | --- | --- |
| Archive format, decode, find + types (`src/layers/body/surfaceTiles/archive/`) | body-private; `tools/` imports across into the Layer | a second Layer would import across too | shared homes, prep (a) |
| Range read (`createArchiveTileSource.ts:75-92` at 9b1bd2dad) | inline in the tile source | no shared reader exists | `readArchiveRange`, prep (a) |
| `VolumeFieldRenderer.draw` (`VolumeFieldRenderer.d.ts:53-62`) | per field: `settingsOf`, `fadeOpacityOf`; `inputs` is per call | no per-field channel for a region | a third reader, `regionOf`, riding `VolumeFieldLiveness`, prep (b) |
| `densityAccumulationKey` (`densityAccumulationKey.ts:11-35`) | settings, opacity, cube stamp, tier | a region change would not restart the mean | region value in the key, prep (c) |
| Region texture into the renderer | no route: the draw value is numbers only and goes into a JSON key | needs one | `attachRegion`, prep (d) |
| Region bookkeeping | spike: inside `draw` | `draw` stops at the sample cap (`cosmicWebDensityPass.ts:27-29`) | a `once` planner in PRELUDE (§6.4) |
| Per-tier tables (`densityCubes/data/`) | base level, steps, cap | growth by a row | `DENSITY_REGION_BRICKS_BY_TIER` |
| Deploy rows (`dataFamilies.ts:42-49`) | L1–L3 + sidecar, gzip on the wire | growth | `.idx` joins the row; packs get their own row (§4.5) |
| Builder input (`buildVolumePyramid.ts:31-41`) | reads `_d{2,4,8}.npy` whole | no native input; `readFileSync` caps at 2 GiB, the native files are 2.5 / 3.5 GB | a separate brick builder reading slabs (§5) |

### Prep (a): the archive to shared homes, and a shared Range reader

An ordinary prep commit, cut on this branch after its merge of main, which carries the terrain-shadow
PR #1179 (ruling 13): that PR added the tile source's `landed` map and `isMissing` reader and two
importers under `tools/textures/surfaceHorizon/`, and move-files repoints them with the rest.

Seven files move with `npm run move-files`, then `npm run refactor rename` drops the `SurfaceTile`
prefix from each symbol. The key is already a plain number (`findSurfaceTileArchiveEntry.ts:9-12`),
so nothing else changes. The magic stays `'STAI'` (those bytes are on R2).

| From | To |
| --- | --- |
| `src/layers/body/surfaceTiles/archive/@types/SurfaceTileArchiveEntry.d.ts` | `src/@types/archive/ArchiveEntry.d.ts` |
| `…/archive/@types/SurfaceTileArchiveIndex.d.ts` | `src/@types/archive/ArchiveIndex.d.ts` |
| `…/archive/data/surfaceTileArchiveFormat.ts` | `src/data/archive/archiveFormat.ts` |
| `…/archive/utils/decodeSurfaceTileArchiveIndex.ts` | `src/utils/archive/decodeArchiveIndex.ts` |
| `…/archive/utils/findSurfaceTileArchiveEntry.ts` | `src/utils/archive/findArchiveEntry.ts` |
| `tools/utils/textures/planSurfaceTileParts.ts` | `tools/utils/archive/planArchiveParts.ts` |
| `tools/utils/textures/encodeSurfaceTileArchiveIndex.ts` | `tools/utils/archive/encodeArchiveIndex.ts` |

`SURFACE_TILE_ARCHIVE_MAX_LEVEL` (`surfaceTileArchiveFormat.ts:8`) stays body-side with
`surfaceTileMortonKey` and `surfaceTileArchivePath`: it is a 2D tile fact, extracted to its own
body-side file before the move. Twelve importers repoint (at 9b1bd2dad): two body files
(`createArchiveTileSource.ts`, `surfaceTileMortonKey.ts`), four tools files (`collectSurfaceTiles.ts`,
`packSurfaceTileLevels.ts`, and #1179's `HeightArchiveLevel.d.ts` and `readHeightPyramid.ts`) and six
tests; move-files drags `planSurfaceTileParts.test.ts`, and `surfaceTileArchiveIndex.test.ts` moves
with the decoder it tests.

The Range core of `createArchiveTileSource.ts:75-92` becomes one function:

```ts
// src/@types/archive/ArchiveRangeRead.d.ts
export type ArchiveRangeRead =
  | { readonly kind: 'bytes'; readonly bytes: Uint8Array }
  /** The server answered 200: it ignored Range. The caller warns once. */
  | { readonly kind: 'no-range' }
  | { readonly kind: 'failed' };

// src/utils/archive/readArchiveRange.ts — one single-span GET with a 10 s deadline, through the
// browser's HTTP cache. Only a 206 of exactly `entry.length` bytes is 'bytes'. Throws on length 0:
// `bytes=o-(o-1)` is not a valid Range.
export function readArchiveRange(
  url: string,
  entry: Pick<ArchiveEntry, 'offset' | 'length'>,
): Promise<ArchiveRangeRead>;

// src/data/archive/archiveFetchDeadlineMs.ts
export const ARCHIVE_FETCH_DEADLINE_MS = 10_000;
```

No cache argument: both callers read through the HTTP cache (ruling 10), and check 6's `no-store`
run is a scratch patch. The tile source keeps its warn-once and its `'missing'`/`'empty'` answers.
Behaviour is unchanged.

### Prep (b): a per-field region reader on the draw path

```ts
// src/@types/rendering/DetailRegionDraw.d.ts — §6.3 defines the members.
// src/@types/rendering/VolumeFieldLiveness.d.ts
export type VolumeFieldLiveness<Id extends string> = {
  readonly settingsOf: (id: Id) => VolumeFieldSettings;
  readonly fadeOpacityOf: (id: Id) => number;
  /** This frame's detail region for the field; null = the base alone. */
  readonly regionOf: (id: Id) => DetailRegionDraw | null;
};

// VolumeFieldRenderer.draw gains one reader, before `inputs`:
draw(pass, viewProj, viewportPx, pxPerRad, cameraPosWorld,
     settingsOf, fadeOpacityOf, regionOf: (id: Id) => DetailRegionDraw | null, inputs): void;

// deriveVolumeLiveness gains the same reader and returns it in the bundle:
deriveVolumeLiveness(renderer, fieldSettingsOf, fadeOpacityOf, regionOf): VolumeFieldLiveness<Id> | null;
```

`createScalarVolumePass.ts:40-41` hands `liveness.regionOf` on beside the other two. The prep
passes `() => null` from `deriveCosmicWebDensityLiveness`, so pixels are identical. One
production call, one implementation and 11 test calls of `draw` change, plus three stubs.

### Prep (c): the region value in the accumulation key

```ts
export function densityAccumulationKey<Id extends string>(
  ids: readonly Id[],
  settingsOf: (id: Id) => VolumeFieldSettings,
  opacityOf: (id: Id) => number,
  cubeStampOf: (id: Id) => number | null,
  regionOf: (id: Id) => DetailRegionDraw | null,
  tier: Tier,
): string;
```

Each field's row gains its region value, printed exactly like the other numbers. A change of the
drawn box or a fade step restarts the mean (`planVolumeAccumulation.ts:42-44`). Streaming outside
the drawn box changes nothing in the value, so it never restarts. One caller (`frame.ts:28-34`),
one test helper.

### Prep (d): the region texture's route into the renderer

```ts
// VolumeFieldRenderer, beside `upload`:
/**
 * Binds `texture` as `id`'s detail region; null drops the binding. Borrowed, not owned: the region
 * host (§6.4) is the one caller, and it passes null before it destroys the texture. Kept across
 * `upload` of a new base volume.
 */
attachRegion(id: Id, texture: GPUTexture | null): void;
```

The renderer keeps region bindings in their own map, apart from the field entries, so a base
re-upload (a tier switch small ↔ medium) leaves the region bound.

**Rejected shapes.**

- Region state inside `renderer.draw` (the spike's): at the sample cap the pass does not draw, so
  the bookkeeping would stop with it, and the region would freeze half-filled at rest.
- Region bookkeeping in the per-view accumulation planner: it runs once per view, five times a
  frame on the dome.
- The texture inside the per-frame value: that value is compared as JSON in the key; a GPU handle
  there braids identity into a number compare.
- A compact u32 offset index (greenfield check: 4 B per brick): about 20 KB against 75 KB for MCPM,
  for a second format, writer and decoder.
- A `volume-detail/` family with its own manifest (greenfield check): a second description of the
  same field. The sidecar already holds `dataBox` and `levelMax[0]` (`VolumePyramidSidecar.d.ts:13-15`).
- Growing the 304 B uniform block: every field would pay for region members. The region gets its
  own block in group 2 (§7).
- A version counter bumped in one module and read in another, to restart the mean: the flag
  pattern; the key compares values.
- A page-table brick atlas: measured +48–85% per draw against dense (spike 2, 2026-11-25).
- A dense native cube with mips: 2.5–3.3× today's large per draw where L0 is read.

**Packaging.** One PR (ruling 7). Order: the four prep commits, then builder and data, runtime,
shader and fade (§11).

## 4. Data format

### 4.1 Files

Level 0 joins the pyramid as an archive per format, beside the level files. Per field `<id>`:

```
volume-pyramid/v1/<id>.<astc6|bc4|r8>.L0.idx          archive index (the shared STAI format)
volume-pyramid/v1/<id>.<astc6|bc4|r8>.L0.p<N>.pack    parts, each ≤ 16 MiB
```

One path helper serves the builder and the runtime, as `surfaceTileArchivePath` does for tiles:

```ts
// src/utils/volume/volumeBrickArchivePath.ts — omit `part` for the index.
export function volumeBrickArchivePath(id: string, format: VolumePyramidFormat, part?: number): string;
```

### 4.2 The brick grid

A brick is 48³ native voxels (`src/data/volume/volumeBrickEdge.ts`, `VOLUME_BRICK_EDGE = 48`). 48
is a whole number of ASTC 6×6 and BC4 4×4 blocks. The grid starts at the sidecar's `dataBox` origin
and covers its dims, `ceil(dims / 48)` bricks per axis. Neither field's z is a multiple of 48
(MCPM 648, 2MRS 464), so the last z layer is zero-padded: MCPM by 24 voxels, 2MRS by 16. The L1–L3
files are not re-baked.

| Field | dataBox dims (vox) | Grid (bricks) | Bricks |
| --- | --- | --- | --- |
| MCPM | 672 × 1152 × 648 (`volumePyramidFields.ts:29`) | 14 × 24 × 14 | 4704 |
| 2MRS | 480 × 480 × 464 (`volumePyramidFields.ts:45`) | 10 × 10 × 10 | 1000 |

Brick id `b = bx + nx · (by + ny · bz)`. It is the archive key, so entries sort in id order and
`findArchiveEntry` finds them.

### 4.3 A brick's bytes

Exactly what one `writeTexture` of a 48³ box takes, x fastest, then y, then z; block formats in 2D
blocks per z-slice, as the level files:

| Format | Bytes per brick | `bytesPerRow` | `rowsPerImage` | Zero block |
| --- | --- | --- | --- | --- |
| `astc6` | 49,152 | 128 | 8 | `FC FD FF FF FF FF FF FF 00 00 00 00 00 00 FF FF` (void extent, value 0) |
| `bc4` | 55,296 | 96 | 12 | 8 × `00` |
| `r8` | 110,592 | 48 | 48 | `00` |

All three columns derive from `TEXTURE_BYTES_PER_TEXEL` and the format's block edge, as the loader
already computes them (`loadVolumePyramid.ts:69-80`). The only new fact per format is the zero
block, so `VolumePyramidFormatRow` gains one member:

```ts
/** One block that decodes to 0. An all-zero ASTC block is an error block, not zero. */
readonly zeroBlock: Uint8Array;
```

The encoding is the pyramid's (`log1p(v) / log1p(levelMax[0])`, 8 bit, the field's clamp
`zeroBelowRaw` first), so a region sample is on the native scale and reads with gain 1.

**Empty** means every r8 code in the brick is 0 after the clamp. It is not a contrast threshold:
the spike's deadband rule (2181 MCPM bricks occupied) would show holes when a viewer lowers the
contrast. An empty brick has a zero-length entry and no bytes in any pack. A non-empty brick is one
gzip member (level 9) of its format's bytes.

### 4.4 Sizes

The index lists every brick: 16 + 16 × count bytes, MCPM 75,280 B and 2MRS 16,016 B per format. Pack
sizes are estimates: occupied bricks × bytes per brick × the spike's sampled gzip-9 ratio (MCPM 53 /
53 / 40%, 2MRS 15 / 14 / 9% for ASTC / BC4 / r8). MCPM occupancy under the all-zero rule is about
2420 bricks (ground check, unverified); 2MRS's is unmeasured on the new grid, so the spike's 914
over its old 990-brick grid stands in.

| Field | Format | Raw bytes of occupied bricks | Packed, estimate | Parts |
| --- | --- | --- | --- | --- |
| MCPM | astc6 | 118,947,840 | 63.0 MB | 4 |
| MCPM | bc4 | 133,816,320 | 70.9 MB | 5 |
| MCPM | r8 | 267,632,640 | 107.1 MB | 7 |
| 2MRS | astc6 | 44,924,928 | 6.7 MB | 1 |
| 2MRS | bc4 | 50,540,544 | 7.1 MB | 1 |
| 2MRS | r8 | 101,081,088 | 9.1 MB | 1 |

Hosted in all: about 264 MB. The builder prints the real numbers; the estimates are not a bar.

### 4.5 Deploy rows

```ts
// The existing volume-pyramid row: the index is small, a GET, gzip on the wire as before.
fileName: /^[a-z0-9-]+\.(?:json|(?:astc6|bc4|r8)\.(?:L[1-3]\.bin|L0\.idx))$/,

// New row, after it:
{
  label: 'volume-bricks',
  dir: 'volume-pyramid/v1',
  fileName: /^[a-z0-9-]+\.(?:astc6|bc4|r8)\.L0\.p\d+\.pack$/,
  transport: 'wrangler',
  // Range-read: Content-Encoding would break the byte offsets, and each brick is already a gzip member.
  gzipOnWire: false,
}
```

The regexes are disjoint, so `dataFamilyOf`'s first-match rule cannot misfile a file. The packs are
content-hashed by `build-data-manifest` like every other data file, so a re-bake writes new names:
the immutability the surface tiles enforce with `refuseOverwrite` comes free here. The edge answers
a Range on a raw object with 206 from its cache (DEPLOY.md:171); the desktop's local server answers
a single-span Range with 206 (DESKTOP.md:169).

## 5. Build pipeline

**Native inputs.** Both extractors already write `<stem>_d<f>.npy` (C-order, x slowest); each
gains factor 1:

- MCPM: `extractMcpmCube.py:57` `FACTORS = (8, 4, 2)` becomes `(8, 4, 2, 1)`. `write_tier` already
  handles factor 1 (`:129-130`). Output `data/raw/mcpm/mcpm_sdss_d1.npy`, 712 × 1200 × 728 f32,
  2.49 GB, from the SAS `trace.bin` (2.3 GB).
- 2MRS: `extractPolyphormExport.py` writes the native tier before its cascade (`:154-158`), with
  `write_tier(current, 1, …)`. Run as today: `python3 tools/volumes/extractPolyphormExport.py
  <the owner's Polyphorm export folder 2026-08-13_13-33-58> data/raw/polyphorm/polyphorm_2mrs`.
  Output `polyphorm_2mrs_d1.npy`, 1200 × 752 × 960 f32, 3.47 GB.

Neither d1 file fits wrangler's 300 MiB cap, so neither is mirrored to R2. The L0 build runs on the
owner's machine for both fields; BACKLOG.md:174 widens to name MCPM's d1 too.

**The brick builder.** `tools/volumes/buildVolumeBricks.ts <field>`, scripts `npm run
build-mcpm-bricks` and `build-2mrs-bricks`, each ending in `build-data-manifest`. It reads the same
`VOLUME_PYRAMID_FIELDS` row as the pyramid builder; the pyramid builder is untouched (its
`readLevel` reads whole files, and `readFileSync` refuses files over 2 GiB).

1. Read the `.npy` header only (`tools/parsers/readNpyHeader.ts`: dtype, shape, data offset) and
   check the shape against the row's `gridDims`.
2. For each x-slab of 48 voxels inside the dataBox: one positioned read of its rows (x is slowest,
   so a slab is contiguous: MCPM 167.7 MB, 2MRS 138.6 MB). `encodeVolumeLevel` (unchanged) crops it
   to the dataBox in y and z and encodes it to r8; the builder pads z with zeros to the grid.
3. Track the slab's raw peak. After the last slab, a peak other than the row's `nativePeak` throws:
   the encoding scale would be wrong.
4. `basisuEncodeLevel` (unchanged) encodes the slab once per block format, as a 2D array of z-slices
   48 wide. A slice is exactly one brick wide, so brick `(by, bz)` of the slab is, per z-slice, one
   contiguous run of block rows: the builder cuts each brick's bytes straight into §4.3's layout.
5. A brick whose r8 codes are all 0 gets a zero-length entry. Every other brick is gzipped.
6. `planArchiveParts` (16 MiB cap) and `encodeArchiveIndex` write the parts and the index per format.
   Each brick's length before gzip is checked against §4.3.

Spike timing for the half-res ASTC level (62.7 M texels) was about 67 s; the MCPM native box is
about 8× that, so roughly 9 minutes for ASTC, under a minute for BC4 (estimate).

```ts
// tools/@types/volumes/VolumePyramidFieldRow.d.ts: the `npy` doc names `_d1` too; no new member.
```

## 6. Runtime

### 6.1 Types

```ts
// src/layers/cosmicWebDensity/detailRegion/@types/BrickBox.d.ts
/** A box of whole bricks, brick coordinates; `hi` exclusive. */
export type BrickBox = { readonly lo: Vec3; readonly hi: Vec3 };

// …/@types/DetailRegionFade.d.ts — the spike's fade (§8); `into` and `out` both contain the
// settled box and meet only in it.
// A side with nothing to fade is null: `out` on a first fill, `into` after a far jump.
export type DetailRegionFade = { readonly into: BrickBox | null; readonly out: BrickBox | null; readonly w: number };

// …/@types/DetailRegionState.d.ts
export type DetailRegionState = {
  /** K bricks per axis centred on the centre, inside the grid; null before the first frame in reach. */
  readonly target: BrickBox | null;
  /** Every brick inside is in the texture; drawn at weight 1. */
  readonly settled: BrickBox | null;
  readonly fade: DetailRegionFade | null;
};

// …/@types/DetailRegionPlanInput.d.ts
export type DetailRegionPlanInput = {
  readonly grid: Vec3;                          // bricks per axis
  readonly dims: Vec3;                          // the dataBox, native voxels
  readonly bricksPerAxis: number;               // K, from the tier
  /** The eye in native voxels from the dataBox origin, inside the box or not. The region centre
   *  is this point clamped into [0, dims]: the eye itself inside, the nearest point outside. */
  readonly eyeVox: Vec3;
  /** The gate distance in native voxels: the largest target pxPerRad of the frame's views. A pixel
   *  d voxels away spans d / pxPerRad voxels, so beyond pxPerRad none is finer than one voxel. */
  readonly gateVox: number;
  readonly held: (brick: number) => boolean;    // the stream's isLoaded
  readonly failed: (brick: number) => boolean;  // the stream's isFailed
  /** This frame's fade advance: max(dt / 200 ms, eye travel / half a brick) (spike). */
  readonly rampStep: number;
};

// …/@types/DetailRegionPlan.d.ts
export type DetailRegionPlan = {
  readonly state: DetailRegionState;
  /** Target bricks not held, nearest first: Chebyshev shell, then Euclidean, from the centre's brick. */
  readonly wanted: readonly number[];
  /** Boxes drawn this frame (settled, or into and out while fading): their slots must not be reused. */
  readonly shown: readonly BrickBox[];
  /** Bricks wanted, a fade running or an admission pending. */
  readonly busy: boolean;
};

// …/plan/planDetailRegion.ts — pure.
export function planDetailRegion(prev: DetailRegionState, input: DetailRegionPlanInput): DetailRegionPlan;
```

### 6.2 The plan, in order

1. **Target.** The region centre is the eye clamped into the dataBox: the eye itself inside, the
   nearest point of the box outside. The target is K bricks per axis centred on it:
   `lo = round(centre / 48 − K/2)` per axis, clamped to `[0, grid − K]`, `hi = min(lo + K, grid)`
   (owner's ruling, 2026-11-27, the spike's rule: the eye stays within half a brick of the target's
   middle for even K too). Clamped inside the grid, from outside it sits against the nearest face,
   K bricks deep, and slides along that face as the camera moves. **Reach:** a ray marches only inside the stored box,
   and the target's part there contains the centre, the stored box's nearest point to the eye; so
   when `|eyeVox − centre| ≥ gateVox` no sample of the region can pass the per-ray gate (§7).
   Then the target stays where it was, nothing is wanted, the held bricks stay and the draw value
   is null (§6.6).
2. **Settled.** Last frame's settled box clipped to the new target (the spike's flicker fix:
   regrowing from the eye's brick collapsed the region to 36–50% for 3–6 frames after a shift). It
   then grows one whole brick layer per face, and only by a layer whose every brick is held and none
   failed. Before anything is held it starts as the centre's brick.
3. **Fade.** A change of the settled box does not draw at once: §8 turns it into a fade, and the
   new box settles when the fade ends. One fade runs at a time.
4. **Wanted.** Target bricks not held and not failed, nearest first.

The draw value derives from the state in one more pure step,
`detailRegionDraw(state, geometry): DetailRegionDraw | null`: boxes to the stored box's local
[0,1]³, the settled box inset half a native voxel so the linear filter never reads past it, its
high face clamped to the data first so it never reaches into the last z layer's zero padding.

### 6.3 The per-field draw value

```ts
// src/@types/rendering/DetailRegionDraw.d.ts — numbers only: it goes into the accumulation key.
export type DetailRegionDraw = {
  /** Read at weight 1. The stored box's local [0,1]³, inset half a native voxel. */
  readonly settledLo: Vec3;
  readonly settledHi: Vec3;
  /** Local [0,1]³ to region texture coordinates (repeat-sampled): dataBox.dims / (K · 48). */
  readonly texScale: Vec3;
  /** Native voxel edge, Mpc: the region is read only where a pixel spans less. */
  readonly voxelMpc: number;
  /** null = the steady pipeline. Boxes in the same local frame. */
  readonly fade: {
    readonly intoLo: Vec3; readonly intoHi: Vec3;
    readonly outLo: Vec3; readonly outHi: Vec3;
    readonly w: number;
  } | null;
};
```

### 6.4 Store, stream, host and planner

**The toroidal brick store** (`detailRegion/load/createBrickTextureStore.ts`) implements `SlotStore`
(`SlotStore.d.ts:10-19`) over one 3D texture of `(K · 48)³` texels, labelled
`density-region-<id>`, in the format the base picked (`pickVolumePyramidFormat`). A brick's slot is
fixed by its coordinates: `(bx mod K, by mod K, bz mod K)`, so a world voxel never moves inside the
texture and a shift rewrites only the entering slab.

| `SlotStore` member | Meaning here |
| --- | --- |
| `allocate(key, frame, liveSince)` | The brick's slot. Free, or held by the same brick: claim it. Held by another brick touched at or after `liveSince`: null, try next frame. Otherwise evict the occupant (the handler runs) and claim. |
| `liveSince` | The planner touches every brick inside `shown` at frame F, then allocates at `liveSince = F`. So a slab still on screen, fading out included, is never overwritten: the fade's slot lock is the contract's own rule, no second mechanism. |
| evict handler | A brick left the target and an entering brick took its slot. The tile stream clears its loaded and failed marks (`tileStreamSubsystem.ts:48-53`); the region needs nothing more, since `held` reads the stream. |
| `touch`, `slotOf`, `occupiedCount` | As in `SlotPool`. |
| `destroy` | Destroys the texture (the stream's owner calls it, `SlotStore.d.ts:17-18`). |

It adds `write(slot, bytes)`: one `writeTexture` at origin `48 · slot`, layout from §4.3.
`TextureAtlas` is no fit (2D bitmaps), nor is `SlotPool` (LRU picks the slot).

**The stream.** `createTileStreamSubsystem` and `PriorityQueue`, unchanged, with this store,
`concurrency: 8`, `upload: (store, slot, bytes) => store.write(slot, bytes)` and a no-op `release`.
The fetcher reads one brick: `readArchiveRange(pack url, entry)`, through the HTTP cache (§10.1), then
`DecompressionStream('gzip')` (precedent: `starBinCodec.ts`), then a length check against §4.3.
Anything else is a failed brick.

**Upload budget.** Two paths fill a slot, both through `stream.upload`:

- An empty brick (zero-length entry) needs no fetch. The planner writes the zero brick (the format's
  `zeroBlock` repeated) itself, at most 4 per frame (`DETAIL_REGION_ZERO_BRICKS_PER_FRAME`), so a
  first fill does not write 25 MB of zeros in one frame.
- A non-empty brick uploads when its fetch lands, as every tile stream does. At most 8 are in
  flight, so at most 8 land per frame.

Worst case per frame: 12 writes, 0.6 MB ASTC, 1.3 MB r8. Each frame the planner allocates every
wanted miss and enqueues those that got a slot; the queue dedups and re-prioritises
(`priorityQueue.ts:49-63`).

**The region host** (`detailRegion/load/createDetailRegionHost.ts`) holds at most one region per
pyramid field and is the renderer's one `attachRegion` caller.

```ts
// …/@types/DetailRegionHost.d.ts
export type DetailRegionHost = {
  /**
   * One frame: create, keep or tear down each field's region against `wanted` (field id → K), then
   * plan and apply each live one. A region whose sidecar or index is still loading draws null.
   */
  frame(
    wanted: ReadonlyMap<CosmicWebDensityFieldId, number>,
    eye: Readonly<Vec3>,
    /** The largest target pxPerRad of the frame's views: each region's `gateVox` (§6.1). */
    gatePxPerRad: number,
    frameIndex: number,
    nowMs: number,
  ): DetailRegionFrame;
  destroy(): void;
};

// …/@types/DetailRegionFrame.d.ts — the planner's value.
export type DetailRegionFrame = {
  readonly draws: Readonly<Record<CosmicWebDensityFieldId, DetailRegionDraw | null>>;
  readonly busy: boolean;
};
```

A new region fetches the sidecar (an HTTP-cache hit after the base load) and its format's index
(75 KB for MCPM). An index whose entry count is not the grid's brick count is a broken deploy: the
region stays empty, with one warning. `CosmicWebDensityRuntime` (`CosmicWebDensityRuntime.d.ts:14-23`)
gains `regions: DetailRegionHost`, built in `create.ts` and destroyed in `destroy.ts`. The region
state lives in each region object and only the planner writes it; every other reader sees the
published value (ruling 11). The host maps the eye into each field's native voxels through the
inverse of the base's model matrix (`buildCubeModelMatrix(placement)` gives the stored box's local
[0,1]³; times `dataBox.dims`), so a rotated frame would need no second path.

**The planner** (`detailRegion/plan/detailRegionPlanner.ts`):

```ts
export function detailRegionPlanner(
  runtime: CosmicWebDensityRuntime,
): Extract<FrameContentPlanner<DetailRegionFrame, 'cosmicWebDensity'>, { scope: 'once' }>;
// name 'cosmic-web-density-region', fade 'cosmicWebDensity'
```

- **Wanted fields.** A pyramid field whose opacity (the handed fade times the Layer's emphasis) and
  intensity are above 0 and whose base slot has committed, at `K = DENSITY_REGION_BRICKS_BY_TIER[tier]`.
  The opacity term moves into one helper, `densityFadeOpacityOf(snapshot, fade)`, read by this
  planner and by `deriveCosmicWebDensityLiveness`, so the planner never builds a liveness bundle
  whose `regionOf` would read its own unpublished value.
- **Eye.** `views[0].drawCamPos`, the anchor view. A dome's faces share the eye, so one region
  serves every face.
- **Gate.** `gatePxPerRad` is the largest `view.drawPxPerRad / COSMIC_WEB_DENSITY_TARGET_SCALE`
  over `views`: the target pxPerRad the march is handed (`createScalarVolumePass.ts:36-38` scales
  by the target's height, which differs from this by under one target row). The constant is the
  density target's `scale: 3` (`layer.ts:36`), moved to `densityCubes/data/` so the row and the
  planner read one number.
- **Votes.** `awake: busy`, so the loop keeps ticking while bricks arrive or a fade runs.
  `loading: busy && views[0].stillFrames > 0`, as `planVolumeAccumulation` does: motion never
  holds `settled()`, and a shot at rest waits for the region.
- **Value.** `DetailRegionFrame`. `deriveCosmicWebDensityLiveness` builds
  `regionOf = (id) => ctx.snapshot.plans.get(<region planner>).draws[id]`, so the accumulation key
  and the march read the same value (`FramePlannerResultStore.d.ts:4-6`: a `once` result is filed
  by name, readable from every view).

Wiring, both plain additions:

```ts
// layer.ts:44
planners: (runtime) => [cosmicWebDensityAccumulationPlanner(runtime), detailRegionPlanner(runtime)],

// src/data/rendering/frameSections.ts, PRELUDE, after `surface-tiles`:
// Once for every view: a dome's faces share one detail region, keyed by the anchor eye.
{ kind: 'plan', name: 'cosmic-web-density-region' },
```

PRELUDE runs before SCENE, so the per-view `cosmic-web-density-accumulation` row (frameSections.ts:104)
always finds this frame's value.

### 6.5 Failure

- A brick fails (non-206, wrong length, bad gzip, timeout): the tile stream marks it failed and
  never refetches it while it stays in the target. The settled box cannot grow across it, so the
  failure costs that face's slab, not one brick, and the base shows there. One warning per field.
  An eviction clears the mark, so a later visit tries again.
- A pack answers 200: one warning per field ("ignored Range"), the brick fails as above.
- The sidecar or index fails or is missing: no region for that field until it is torn down and
  created again (a tier switch, a toggle). The base draws on. One warning.
- In-flight fetches are not aborted on a shift (`priorityQueue.ts:10`); a payload with no slot left
  is released. The waste is bounded by the 8 in flight.

### 6.6 Teardown, the stored box, and tiers

- **Teardown.** A field leaves `wanted` (switched off once its fade-out tail ends, intensity 0, base
  released, or a tier switch that changes K), or the Layer is destroyed: the host calls
  `attachRegion(id, null)`, then the stream's `destroy`, which destroys the store and its texture.
  Payloads that land later are released (`tileStreamSubsystem.ts:90-93`).
- **Outside the stored box** the region sits against the nearest face (§6.2) and is drawn while it
  is in reach (ruling 9). Reach ends where the eye is `gateVox` native voxels from the box: at
  ~340 px/rad (the 1/3-scale target of a 1080p canvas) about 265 Mpc for MCPM and 415 Mpc for
  2MRS, twice that on a 2× display. Beyond it the region draws null and fetches nothing; its
  bricks stay, so coming back is instant. The acceptance poses at 600 Mpc lie 250–300 Mpc from
  their box, so 2MRS is in reach there and MCPM at the edge of it; at 2000 Mpc both are out. The
  spike measured a region drawn from 600 Mpc at 0.66 ms per draw against the base's 0.45 (MCPM,
  per-step box test); this design pays that band's cost by intent, and check 2 bars it.
- **Tiers.**

```ts
// src/layers/cosmicWebDensity/densityCubes/data/densityRegionBricksByTier.ts
export const DENSITY_REGION_BRICKS_BY_TIER = { small: 5, medium: 5, large: 8 } as const satisfies Record<Tier, number>;
```

Small ↔ medium keeps the region (same K; only the base level changes, and the region reads at gain
1 with no tie to the base). Medium ↔ large rebuilds it at the new K and reads its bricks again,
from the HTTP cache where they were read before.

## 7. Shader and renderer

**Bindings.** Group 2 holds the region: a uniform block, the texture, and a sampler with
`addressMode: 'repeat'` on all three axes, linear, no mips (the base sampler is clamp-to-edge,
`volumeFieldRenderer.ts:91-98`). Groups 0 and 1 and the 304 B block are unchanged.

```wgsl
struct RegionUniforms {
  settledLo: vec3<f32>, voxelMpc: f32,
  settledHi: vec3<f32>, fadeW: f32,
  texScale: vec3<f32>, _pad0: f32,
  intoLo: vec3<f32>, _pad1: f32,
  intoHi: vec3<f32>, _pad2: f32,
  outLo: vec3<f32>, _pad3: f32,
  outHi: vec3<f32>, _pad4: f32,
};
@group(2) @binding(0) var<uniform> region: RegionUniforms;
@group(2) @binding(1) var regionTex: texture_3d<f32>;
@group(2) @binding(2) var regionSampler: sampler;
override REGION: u32 = 0u;   // 0 base only, 1 steady, 2 fading
```

| Offset | Member | Type | From `DetailRegionDraw` |
| --- | --- | --- | --- |
| 0 | `settledLo` | vec3<f32> | `settledLo` |
| 12 | `voxelMpc` | f32 | `voxelMpc` |
| 16 | `settledHi` | vec3<f32> | `settledHi` |
| 28 | `fadeW` | f32 | `fade.w` (0 when steady) |
| 32 | `texScale` | vec3<f32> | `texScale` |
| 44 | pad | f32 | 0 |
| 48 | `intoLo` | vec3<f32> | `fade.intoLo` |
| 64 | `intoHi` | vec3<f32> | `fade.intoHi` |
| 80 | `outLo` | vec3<f32> | `fade.outLo` |
| 96 | `outHi` | vec3<f32> | `fade.outHi` |
| 108 | pad to 112 | | |

112 bytes per field. `volumeUniformsLayout.parity.test.ts` pins this block too.

**Three pipelines, one module, one layout.** `REGION` picks the variant per field per draw:
`regionOf(id)` null → 0, `fade` null → 1, else 2. Variant 0 compiles the region code out, so it
costs what main costs today (the spike measured an empty-region branch at +0.1 ms, which is why
the region pipeline is never bound without a region). WGSL counts a binding as used by the entry
point whatever an override's value, so all three pipelines share the layout `[group0, fade, group2]`
and a field without a region binds a renderer-owned placeholder group 2 (a 1³ r8 texture and a
zeroed block).

**Per ray** (variants 1 and 2): one ray–box intersection with the settled box, capped at the gate
distance `tGate = pxPerRad · voxelMpc / |M · dir|`. Beyond `tGate` a pixel spans more than one native
voxel, so the base serves it: the spike's "Early" gate, written as a distance. `|M · dir|` is
already computed for the LOD (`fragment.wesl:227-228`). Variant 2 adds the same intersection for
`into` and `out`.

**Per step, steady.** One interval test on `rayDistance`, then exactly one volume read: inside, the
region at level 0, `textureSampleLevel(regionTex, regionSampler, samplePos · texScale, 0)`, at gain
1 and with no clamp to 1; outside, today's base read (`fragment.wesl:239-240`). The spike tested the
box per step in voxel space. The ray-interval form reads the same texels with less arithmetic; its
cost is covered by §13 check 2.

| Variant | Where in the ray | Volume reads | Palette reads | Volume texel taps | Extra ALU per step |
| --- | --- | --- | --- | --- | --- |
| 0 (today) | everywhere | 1 | 1 | 8, or 16 between levels | none |
| 1 steady | settled, before `tGate` | 1 (region) | 1 | 8 (one level) | 2 compares |
| 1 steady | elsewhere | 1 (base) | 1 | 8 or 16 | 2 compares |
| 2 fading | settled | 1 (region) | 1 | 8 | 2 compares |
| 2 fading | fading shell (`into` or `out`, not settled) | 2 (region + base), mixed by `w` or `1 − w` | 1 | 16–24 | up to 6 compares, 1 mix |
| 2 fading | elsewhere | 1 (base) | 1 | 8 or 16 | up to 6 compares |

Per ray: variant 1 adds one ray–box intersection and one division; variant 2 three intersections.
The jitter `textureLoad` per ray is unchanged.

**Seen from outside.** A region against a face (§6.2) runs the same variants: its box is a box in
the same local frame, the ray–box intersection already starts where the ray enters it, and `tGate`
already caps it. The clamped centre adds no shader term: the steady pipeline stays one interval
test and exactly one volume read per step, the fading pipeline as in the table.

**Renderer.** `draw` writes the region block from `regionOf(id)` beside the base block, sets
group 2 and picks the pipeline. A field whose region value is non-null but has no attached texture
draws variant 0.

## 8. Fade

The spike's three boxes, passed by the owner's eye on the spike (ruling 8):

- **Boxes.** `settled` at weight 1; `into` at `w`; `out` at `1 − w`. `into` and `out` both contain
  the settled box and meet only in it, so one fade in and one fade out run at complementary
  weights.
- **Ramp.** One `w`, advanced each frame by max(dt / 200 ms, eye travel / half a brick).
- **Slots.** An entering slab takes the leaving slab's slots, so on one axis the leaving slab fades
  out, then the entering slab uploads, then it fades in: ~0.45 s per shift (out 0.2 s, upload, in
  0.2 s; measured). A true cross-fade would need a spare slab per axis (33–49% of the texture).
- **Cost.** 112 uniform bytes; per ray while fading three ray–box intersections; per step in the
  fading shell two interval tests, two volume reads and one mix (§7). The steady variant is
  untouched, and at rest a fade is pixel-identical to none.
- **Measured** on the spike: 2MRS orbit at 200 Mpc, pops over 0.5 from 5 to 0 and the largest jump
  2.80 → 0.47; the tour path 2.55 → 0.24; cost while fading MCPM +1–4%, 2MRS +7–13% per draw.
- **From outside** (§6.2) the box slides along the face as the camera moves, and each brick-layer
  shift fades exactly as inside.

Rejected: six face weights over an outer and a core box (the greenfield check); the three-box form
is measured and passed by eye.

**Accumulation during a fade.** Every fade frame changes `w`, so the key changes and the mean
restarts each frame (prep (c)). While moving that changes nothing (motion restarts anyway). At rest
it means: during a shift, about 0.45 s of single-sample grain (27 frames at 60 fps, 54 at 120),
then the tier's cap to converge (16 frames medium and large, 8 small). During a first fill every
admitted layer fades, so a K = 8 fill shows grain for its whole fill time (512 bricks at the
budget is about 2.1 s at 60 fps when the network keeps up, more otherwise) and then converges in
16 frames.

## 9. Memory

- **GPU.** §1 per tier; per field: K = 5 ASTC 6,144,000 / BC4 6,912,000 / r8 13,824,000 B; K = 8
  25,165,824 / 28,311,552 / 56,623,104 B. Exact: 240 and 384 are block multiples.

| Tier | Both volumes after #1178 (ASTC / BC4 / r8) | With the region |
| --- | --- | --- |
| small | 4,754,304 / 5,348,592 / 10,697,184 | 17,042,304 / 19,172,592 / 38,345,184 |
| medium | 38,562,688 / 43,383,024 / 86,766,048 | 50,850,688 / 57,207,024 / 114,414,048 |
| large | 38,562,688 / 43,383,024 / 86,766,048 | 88,894,336 / 100,006,128 / 200,012,256 |

  Small grows 3.6×; the phone cost is unmeasured (§10.3).
- **Ledger.** Two new rows, `density-region-mcpm` and `density-region-polyphorm-2mrs`, registered
  by `trackGpuMemory` from the texture label; the bytes come from the `astc-6x6-unorm` and
  `bc4-r-unorm` rows #1178 added (`textureBytesPerTexel.ts:28-29`), so no ledger code changes. The
  placeholder group 2 adds one row of 1 B.
- **Dawn's lazy clear.** The first partial write clears the whole level through one staging buffer
  of its size: 25.2 MB (ASTC K = 8) to 56.6 MB (r8 K = 8), under the 256 MiB `maxBufferSize`. A
  one-off allocation per region; its hitch is unmeasured.
- **CPU.** No copy of the region is kept. At most 8 brick payloads in flight (0.9 MB r8), plus the
  index (75 KB) and the sidecar per region.

## 10. Risks

1. **Range reads queue in the browser cache** (BACKLOG.md:179). Chrome lets one request at a time
   work on a cache entry, so concurrent Range reads into one pack part finish one after another:
   12 reads of one part took 375–460 ms by default against ~70 ms with `cache: 'no-store'`, on the
   live edge. A region fill is the case that backlog item waits for: nearest-first bricks are
   neighbours, and neighbours share a part. **Handling:** brick reads go through the HTTP cache like
   the tiles (ruling 10), so a refill after a toggle, a medium ↔ large switch or a return to an
   evicted spot is served from disk instead of downloading again (MCPM K = 5 about 1.7 MB, K = 8
   about 6.9 MB). **Cost:** a cold fill may queue as above. Smaller parts do not help: neighbouring
   bricks stay in one part. Acceptance check 6 measures fill time against production with the
   cache and with `no-store` (a scratch patch), plus the 12-concurrent-reads case, in ms; switching
   is the owner's call on those numbers.
2. **The unexplained ~7% raster cost.** With the region on, the spike's back-face raster path was
   about 7% slower than its deleted full-screen pass (MCPM inside 39.2 → 41.8 ms per 64 draws,
   2MRS 600 Mpc 34.9 → 37.3); with the region off, equal. **Handling** (owner, 2026-11-27): no
   separate study; §13 check 2 times the built region on against off and halts above 10%.
3. **Small tier: a region over a quarter-res base on the phone.** There the region voxel is 4×
   finer than the base's; the cost, the visual step at the box edge and the format the phone picks
   are all unmeasured. **Handling:** acceptance check 3 on the OnePlus; a breach halts and goes to
   the owner, whose options are K = 4 on small or no region on small.
4. **No mips in the region.** A region voxel read where a pixel spans more would alias. **Handling:**
   the gate distance sends every such sample to the base, so the region is never minified. The
   spike's mips on the box gave no speed-up for +14% memory.
5. **Overlap with the terrain-shadow PR.** #1179 edited `createArchiveTileSource.ts` (a `landed`
   map and an `isMissing` reader that calls `findSurfaceTileArchiveEntry`) and added two importers
   of the decoder under `tools/textures/surfaceHorizon/`. **Handling:** it merged before prep (a)
   (ruling 13) and this branch merged main, so move-files repoints all of it in one commit.
6. **Production sync.** On 2026-11-26 `sync-r2-secure` aborted at the Mars tiles group (immutable
   `mars-tiles/v2/horizon` files re-baked) before the data manifest went up. This deploy needs a
   clean sync, so that must be resolved first.

## 11. Order of work

1. **Timing deferred from #1178** (no code; BACKLOG.md:123). The K-draw bench at medium and large
   at inside, outside 600, far 2000 and knot, branch against main before #1178; the small tier on
   the OnePlus (`npm run phone`), moving, and the format it picks; volume arrival on throttled 4G
   (cold boot to the slot's commit, read from a scratch hook: the loadtime tool has no volume
   milestone). Bars from the half-res spec's acceptance 7–9. Accepted 2026-11-27: 120 fps in every
   case; per draw at MCPM inside, large 0.56 → 0.49 ms, medium 0.42 → 0.48 ms; the phone and load
   time were not run.
2. **The 7% investigation**: dropped (owner, 2026-11-27); §13 check 2 replaces it.
3. **Prep commits** (b), (c), (d), then (a), each behaviour-neutral, each its own commit.
4. **Builder and data:** extractor lines, `readNpyHeader`, `buildVolumeBricks`, the format row's
   zero block, the deploy rows; run both fields on the owner's machine.
5. **Runtime:** store, fetcher, plan, host, planner, wiring; the region draws as variant 1 with the
   fade off (no visible change until step 6 binds it).
6. **Shader and fade:** group 2, the three variants, the three-box fade (§8).
7. **Acceptance** (§13), then `/feature-done`.

## 12. Tests

Only what can break (testing.md):

- **Toroidal store.** Slot equals brick mod K per axis; `allocate` refuses while the occupant was
  touched at or after `liveSince`, evicts otherwise and runs the handler once; `write` places a brick
  at origin `48 · slot` with §4.3's layout.
- **`planDetailRegion`.** The target clamps inside the grid at every face; settled grows only by a
  whole layer with every brick held; a failed brick blocks its layer; a shift clips settled to the
  new target and keeps what it can (the flicker fix); an eye outside the box but in reach gets a
  target against the nearest face, and moving parallel to that face slides it; an eye out of reach
  draws null, wants nothing and keeps the target; a change of settled becomes a fade, and an
  entering brick's slot stays refused until the leaving slab's fade ends.
- **Draw value.** Boxes in local [0,1]³ with the half-voxel inset; `texScale` for MCPM at K = 5.
- **Brick fetcher.** A 206 with a gzip member yields the bytes; a 200 fails and warns once; a wrong
  inflated length fails; a zero-length entry is never fetched.
- **`readArchiveRange`.** The tile source's existing Range cases move with it.
- **Index guard.** An entry count other than the grid's leaves the region empty with one warning.
- **Key.** The same region value gives the same key; a fade step gives a new one.
- **Renderer.** Pipeline per field: null → variant 0 with the placeholder group 2, no fade → 1,
  fade → 2; `attachRegion(id, null)` drops the binding; a base re-upload keeps it.
- **Uniform parity** for the 112 B region block (existing test, second block).
- **Builder.** On a tiny `.npy` fixture: the header reader; a slab's positioned read; the z padding;
  the brick cut out of a slab's ASTC-shaped block rows; all-zero bricks get zero-length entries;
  a peak other than `nativePeak` throws.
- **`dataFamilyOf`.** A hashed `.L0.idx` lands in `volume-pyramid`, a hashed `.L0.p0.pack` in
  `volume-bricks`.

basisu and the GPU are not in CI; the zero block and the compressed bricks are checked by
acceptance.

## 13. Acceptance

Poses as the half-res spec's §12, with
`layers=-survey,-structureRing,-cosmicWebFilaments,-zoneOfAvoidance,-starCatalog,-milkyWayDisk,-label`:
MCPM inside `#pose=a,-239.45,-16.5,201.3,0.5,0.3,30,0` and knot `a,-132.82,18.99,67.28,0.5,0.3,20,0`;
2MRS inside `a,21.27,21.07,36.88,0.5,0.3,30,0` and dense `a,43.3,38.2,44.2,0.5,0.3,60,0`; just
outside at 350 Mpc (the inside pose's target, `…,0.5,0.3,350,0`: 40–60 Mpc outside the MCPM box,
60–75 Mpc outside 2MRS's), outside and far at 600 and 2000 Mpc. **Measuring rule:** tiers are forced with `?perf` and
`__skymapPerf.setTier()` (the `?tier=` switch does not stick), and each shot asserts the files it
fetched (the base level file, and `.L0.p*.pack` reads when a region is expected). Timing uses
#1175's wall-clock bench (scratch patch, never committed; no-op floor, K-doubling within 15%, ≥ 5
rounds), ms per frame and fps first, then the ratio. Each run is time-boxed to about 30 minutes,
one pass. A breach halts and goes to the owner.

1. **Memory.** The ledger shows exactly §9's bytes per region texture, per format seen, at each
   tier.
2. **Region on against off, Mac** (owner, 2026-11-27). MCPM at the medium tier (base volume
   medium, region K = 5), two cases: camera inside the region and camera just outside the volume (350 Mpc; the run records that the region drew). Bar:
   on ≤ 1.10× off at each; above it, halt and ask the owner.
3. **Phone, small tier.** Moving at the MCPM inside pose on the OnePlus: ms per frame with the
   region on ≤ 1.10× off (step 1's phone run was not made). The picked format is recorded.
4. **Image: sharper.** Converged at rest (the tier's cap), the region against today's main at the
   same tier, at MCPM inside and 2MRS dense. Measure: the mean Sobel gradient
   magnitude of luminance (8-bit output) inside the region's screen footprint. Bar: ≥ 1.25× main's.
   (The owner's value test saw 1.56× "detail" with brightness matched; its metric is not known to
   be this one, so the bar sits below it.)
5. **Image: never dimmer.** In the same footprint, mean luminance ≥ main's − 0.5 of 255.
6. **Fill time after a jump.** From arrival at the MCPM inside pose (cold HTTP cache, production
   R2) to the planner's `busy` going false: K = 8 ≤ 4 s on the Mac, with the shipped HTTP-cache
   reads and again with `no-store` (a scratch patch), each in ms; plus 12 concurrent Range reads
   into one pack part both ways (BACKLOG.md:179's case). These are first guesses; the numbers go to the owner, who rules on switching
   (ruling 10).
7. **No seam line at rest.** At the knot pose with the box edge in view, converged: in the image of
   region-on minus region-off, no pixel row along the projected box edge is brighter or darker than
   both its neighbours across the edge by more than 2 of 255. Then a dash check pair, region off
   left, on right, judged by the owner.
8. **Pops.** The spike's metric (`tools/spike/flickerFade.ts:139-155`
   in its worktree): D_i is the RMS luminance difference of frame i against a region-off run of the
   same path; a jump is |D_i − D_(i−1)|, a pop |D_i − mean(D_(i−1), D_(i+1))|. Bars at the spike's
   measured values with a little room: 2MRS 90° orbit at 200 Mpc, no pop over 0.5 and largest jump
   ≤ 0.5 (spike 0.47); the tour path, largest jump ≤ 0.3 (spike 0.24).
9. **Failure paths** (scratch patches): the index 404, one pack part 404, a pack answering 200, a
   corrupt gzip member. Each: one warning, the base draws, the other field unaffected, no WebGPU
   validation error, no lost frame, and memory back to the base after teardown.
10. **Dome.** In `?dome`, the region shows in all five faces with no seam at the face joins (a dash
    check), and all faces restart together: the key is equal across the views every frame.
11. **Tier switching** small → medium → large → small: small ↔ medium fetches no brick and shows no
    flash; medium → large rebuilds at K = 8 and the old texture leaves the ledger; no validation
    error; the ledger matches check 1 after each step.
12. **Teardown.** Switching a field off: after its fade-out tail, its region row leaves the ledger
    and no upload follows. Destroying the Layer frees both regions and the placeholder.
13. **Zero block.** A readback (scratch patch) of a slot written with the zero brick reads 0 in all
    three formats.
14. **From just outside.** At each volume's just-outside pose, converged at large: the shot
    asserts `.L0.p*.pack` reads (the region is drawn), check 5's never-dimmer bar holds in its
    footprint, and a dash check pair per volume (main left, branch right, the box's outline in
    view) is judged by the owner, seam included.

## 14. Deploy

1. On the PR branch, checked out in the **main checkout** (a worktree's linked `public/data` is
   skipped by the manifest pass): `npm run build-mcpm-bricks`, then `npm run build-2mrs-bricks`
   (owner's machine: the d1 inputs are only there), each ending in `build-data-manifest`.
2. `npm run sync-r2-secure`, **before the merge**: a merge to main is the app deploy (Workers
   Assets builds on push). The syncing machine must have built the bricks: on any other machine
   `buildGroups()` returns no `volume-bricks` group, so the sync does not throw but quietly
   publishes a data manifest and offline inventory with no bricks. The proof is a 206 to a Range
   request for one hashed `.L0.p0.pack` path from `manifest.json` (DEPLOY.md, "Volume bricks").
3. Then merge.

**Gap: none.** The files are additive. The sidecars and L1–L3 files keep their bytes and hashed
names, so the sync skips them, and the manifest only gains entries. An old app with the new
manifest ignores the new entries. A new app with an old manifest (only if the merge ran first)
finds no index: the region is absent with one warning and the base draws. Data first is still the
order, so the new app has its bricks from the first visit. Nothing leaves R2; no prune follows.

The kiosk mirrors the new packs (about 264 MB more on disk, estimate); its local server already
answers Range. A kiosk on an older desktop build ignores them.

## 15. Docs to update

- `docs/DATA.md`: `volume-pyramid/v1/` layout gains the L0 index and packs (line 48); the Cosmic-web
  volumes section (line 195) gains the brick grid, the d1 inputs and `build-mcpm-bricks` / `build-2mrs-bricks`.
- `docs/RENDERER.md`: the density-volume bullet (line 53) gains the region (once planner, borrowed
  texture, group 2, gate distance); landmines: the ASTC zero block, the placeholder group 2, region
  samples at gain 1.
- `docs/DEPLOY.md`: one line that volume bricks are Range-read raw and immutable by content hash.
- `data/raw/mcpm/README.md`: the d1 output and its size.

## 16. Deliberately left out

- **Debug panel rows** (size, follows, takeover, budget): knobs nobody sets; the spike's panel stays
  in the spike. The Memory panel shows the region.
- **Target-centred or frozen regions:** the owner ruled camera.
- **A region beyond the gate distance:** no pixel there is finer than a native voxel (§6.6).
- **An app-side brick cache:** the HTTP cache serves revisits (§10.1); a Cache Storage layer is new
  code for a measured few MB.
- **Aborting in-flight fetches:** the tile stream does not, and 8 in flight bounds the waste.
- **Mirroring the native inputs to R2:** backlog (ruling 6).
- **A finer 2MRS export** (a grid fitted to the galaxies, about 0.5 Mpc voxels): a data effort of
  its own.
- **The dust volume:** later, on the same machinery.
- **The workbench cube:** an SCFD with no level 0.
- **Deleting spike code:** the owner keeps it until told otherwise.
- **A volume-arrival milestone in `tools/loadtime`:** step 1 reads a scratch hook; the tool grows
  only if the owner wants the milestone kept.

## 17. Open questions

The owner's rulings of §2 settle the fade, the region state's home, the cache mode, the region
from outside and the build machine. Left to measurement:

1. **Ray-interval test** (§7): not compared against the spike's per-step test; check 2 prices it.
2. **Fill-time bars** (check 6): first guesses.
3. **2MRS brick occupancy and pack sizes** on the new grid: estimates only until the builder runs.

## 18. Backlog

- Deleted when the PR starts: "Density volume timing acceptance" (BACKLOG.md:123), picked up as
  step 1.
- Edited: "Mirror the 2MRS volume inputs to R2" (BACKLOG.md:174) names MCPM's `d1` too.
- Untouched, related: "Surface-tile Range reads queue in the HTTP cache" (BACKLOG.md:179). Check
  6's two runs are the measurement its "revisit when" waits for; it stays until the owner rules on
  them (ruling 10).
