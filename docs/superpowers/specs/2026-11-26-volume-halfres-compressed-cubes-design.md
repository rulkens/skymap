# Half-res compressed volume cubes: design spec

> **Status.** Approved 2026-11-26. Owner: Alexander Rulkens. PR 3 of the volume effort (PR 1 #1170
> prep, PR 2 #1175 progressive sampling). Shape approved at the ground check the same day; the
> owner's rulings are quoted in §2 and §13. Plan:
> `docs/superpowers/plans/2026-11-26-volume-halfres-compressed-cubes.md`.
> **Written against** main at e41e5d89a, and against the post-prep shape of §3 as if it existed.
> **Inputs.** The half-res spike (worktree `volume-progressive-octree`, `spike/` folders and
> `tools/spike/build-scripts/{dense-mips,twomrs}/`; throwaway, not a code base) and its data in
> `data/raw/volume-spike/cubes/` (`FULL.json`, `TWOMRS.json`). Spike numbers are quoted where used.

## 1. Goal and non-goals

The MCPM and Polyphorm 2MRS density volumes load from a compressed mip pyramid instead of today's
tiered 16-bit `.scfd` files. Every tier gets sharper data, GPU and CPU memory drop, and the look
stays today's.

| Tier   | Base level today | Base level after          | Both volumes, GPU bytes today | After (ASTC / BC4 / r8)            |
| ------ | ---------------- | ------------------------- | ----------------------------- | ---------------------------------- |
| small  | d8 (eighth res)  | L2 (quarter res)          | 5,813,700                     | 4,754,304 / 5,348,592 / 10,697,184 |
| medium | d4               | L1 (half res = today's large) | 46,509,600                | 38,562,688 / 43,383,024 / 86,766,048 |
| large  | d2               | L1 (equals medium until PR 4) | 372,076,800               | 38,562,688 / 43,383,024 / 86,766,048 |

Non-goals: the full-res detail region (PR 4), HTTP Range requests, own chunk compression, any new
field, any look change. The dust volume, the flow field, `mcpm-workbench.scfd` and the test fixture
keep SCFD v3, untouched.

PR 4 streams a camera-centred native-resolution region in 48³ bricks. It attaches without
reshaping anything here: level 0 (native) is reserved for it, and it shares this design's origin,
voxel size, encoding scale (`levelMax[0]`) and format enum. 48 is a whole number of ASTC 6×6 and
BC4 4×4 blocks.

## 2. Rulings

Owner, 2026-11-26, binding:

1. One file per level per GPU format, gzip on the wire by the server as today. No Range, no own
   chunk compression. Per field: one JSON sidecar plus 3 formats × 3 levels.
2. Small loads level 2 as its base; medium and large load level 1. Large equals medium until the
   detail region lands.
3. The six tiered files (`mcpm-{small,medium,large}.scfd`, `polyphorm-2mrs-{…}.scfd`) are
   replaced outright: their builders, deploy allow-list entries and loader path are deleted.
4. The shape of §3–§7.
5. Prep rides the same PR, as its own commit sequenced first.
6. Adjacent findings are fixed in this branch, as their own commits (§10).

Standing: 2MRS works exactly like MCPM; the look must match today; about 10% moving-cost
regression is acceptable; timing is reported in ms per frame and fps first; measuring runs are
short (about 30 minutes, one pass); the Layer contract, `ReconcileEffects` and `SagaContext` do not
grow (this design grows none of them).

## 3. Ground preparation

**Sketch.** A density row names how its data is stored. A load step per storage kind turns a
request into one value, a `GpuVolume`: a finished texture plus where it sits and how bright to read
it. The renderer only draws values. The tier picks a base level from a table, beside the existing
steps and cap tables.

| Touchpoint (main e41e5d89a) | Today | Verdict | After |
| --- | --- | --- | --- |
| `VolumeFieldRenderer.upload` (`VolumeFieldRenderer.d.ts:28`) | takes a decoded `ScalarCube`; the renderer creates an `'r16float'` texture (`volumeFieldRenderer.ts:207,214`) | bolt-on: format knowledge in the drawer | takes a `GpuVolume`; **the prep commit** |
| Slot value (`createCosmicWebDensitySlot.ts:27`) | the decoded cube, 155 MB at MCPM large, kept until release | bolt-on (backlog: asset-slot value disposal) | the `GpuVolume`, with `dispose` for a dropped one; prep |
| `CosmicWebDensitySourceEntry.tiered` (`.d.ts:28`) | boolean, branched in `cosmicWebDensityAssetRows.ts:29` and `cosmicWebDensityFetcher.ts:21` | growth by a row value | `storage: 'pyramid' \| 'scfd'`, one discriminant, dispatched by table |
| Tier → resolution | encoded in file names | growth | `DENSITY_BASE_LEVEL_BY_TIER` beside `densityMarchStepsByTier.ts` |
| Uniform block (272 B) | no gain, one level | growth | 304 B, §6 |
| `initGpu` features | `[DUAL_SOURCE_FEATURE]` | growth | plus the formats table's features |
| Memory ledger rows | no block formats; 4 B/texel fallback | growth | two rows, §7 |
| Deploy families | field names enumerated in the `scalar-field` regex | growth | one `volume-pyramid` row matched by folder |
| Builders | `buildMcpmVolume.ts`; 2MRS by hand, `buildRhizomeVolume --clamp` | bolt-on | one `buildVolumePyramid.ts`, a row per field |

**The prep commit** (behaviour-preserving, on today's `.scfd`):

```ts
// src/@types/rendering/GpuVolume.d.ts
export type GpuVolume = {
  /** 3D; its mip 0 is the base level. Owned by the renderer once `upload` runs. */
  readonly texture: GPUTexture;
  /** The stored box at base resolution, in world terms (`buildCubeModelMatrix`'s input). */
  readonly placement: CubePlacement;
};
```

- `upload(id, volume: GpuVolume, statics)`: the renderer creates no texture. It takes ownership
  and destroys the texture on re-upload, `unload` and `destroy`, as it does today. That matches
  `AssetSlot`'s rule that a committed payload belongs to the consumer.
- The fetcher becomes `createCosmicWebDensityFetcher(device)` (`npm run move-files` renames
  `cosmicWebDensityFetcher.ts` and drags its test). It fetches, decodes, creates the texture with
  `gpuTextureFormatForChannels` (`src/utils/gpu/`, the flow field's existing format helper) and
  returns a `GpuVolume`. The decoded cube is garbage once the function returns, so `placement` is a
  fresh object: a `ScalarCube` satisfies `CubePlacement` structurally and would keep its voxels
  alive.
- The slot passes `dispose: (v) => v.texture.destroy()` for a fetched volume it drops before
  commit (superseded, or landing after release).
- One caller and 13 test calls of `upload` change. Pixels are identical.

**Rejected shapes.**

- SCFD v4 with formats and levels: re-bakes four unrelated files and adds branches to a codec that
  is 16-bit only.
- Linear-density decode with a gain measured per level and format: changes the look.
- Padding the whole native grid to multiples of 96: +13% memory for nothing a crop doesn't give.
- One pyramid file read by byte range: ruling 1.
- A second upload method on the renderer: two ways in for one value.
- Stepping down ASTC → BC4 → r8 after a failed file: a missing file is a deploy bug. Stepping
  down would hide it behind three code paths.
- Per-format, per-level `{file, bytes}` in the sidecar, and a separate `encodeMax`: both are
  derivable (names by rule, bytes from dims and block size, `encodeMax` is `levelMax[0]`).
- The spike's `envOffset`, `envScale` and `alphaScale` as three members: they are one fact, the
  stored box's place in the native grid (§6).
- A LOD-bias uniform: 0 in every spike run, a knob nobody sets.
- Reusing coarse mips across a tier switch with `copyTextureToTexture`: the hashed files are
  immutable, so the HTTP cache already serves the shared levels.

**Packaging.** One PR. Order: the prep commit, then the adjacent fixes (§10), each its own
commit, then the feature commits.

## 4. Data format

Family `volume-pyramid/v1/` (the folder carries the version, per DATA.md). Per field `<id>` (the
row's `binBaseName`):

```
volume-pyramid/v1/<id>.json                      sidecar
volume-pyramid/v1/<id>.<astc6|bc4|r8>.L<1..3>.bin  headerless GPU bytes of one level
```

A level file holds exactly what `writeTexture` takes: x fastest, then y, then z. Block formats
use 2D blocks per z-slice (ASTC 6×6, 16 B per block; BC4 4×4, 8 B per block). Its length is
derived, never stored: `w·h·d` × the format's bytes per texel (16/36, 1/2, 1).

```ts
// src/@types/data/volume/VolumePyramidSidecar.d.ts
export type VolumePyramidSidecar = {
  /** Native grid, voxels (x, y, z). Level k's voxel is 2^k native voxels on a side. */
  readonly gridDims: Vec3;
  /** Native voxel edge, Mpc. */
  readonly voxelMpc: number;
  /** World position of native voxel (0,0,0)'s low corner, in `frame`, Mpc. */
  readonly originMpc: Vec3;
  readonly frame: ScalarFieldFrameKind;
  /** The stored box inside the native grid, native voxels. */
  readonly dataBox: { readonly originVox: Vec3; readonly dims: Vec3 };
  /** Raw peak of each whole block-mean level; index = level, 0 = native. [0] is the encoding scale. */
  readonly levelMax: readonly [number, number, number, number];
};

// src/@types/data/volume/VolumePyramidFormat.d.ts
export type VolumePyramidFormat = 'astc6' | 'bc4' | 'r8';
```

**Encoding, every level.** 2×2×2 block mean of raw density, then `log1p(v) / log1p(levelMax[0])`,
quantised to 8 bit with rounding. Mean first, log second: the spike's mean-of-encoded chain kept
0.069 of the light at L3 against 0.612.

**Brightness.** The shader reads `min(sample × gain, 1)` with
`gain = log1p(levelMax[0]) / log1p(levelMax[base])`. At base L1 that is today's per-tier stretch of
the large file exactly: MCPM 1.0440, 2MRS 1.0706. At base L2: MCPM 1.1131, 2MRS 1.1807.

**2MRS clamp.** Today's `--clamp 0.2` at d2 becomes one raw threshold,
`expm1(0.2 · log1p(6090)) = 4.71397`. Voxels below it are zeroed at every level after the block
mean. Both fields go through the same step: MCPM's threshold is 0.

**The crop rule, both fields.** The box origin is a multiple of 8 native voxels, so every level's
voxels are the native grid's own d2/d4/d8 blocks. x and y dims are multiples of 96 and z a multiple
of 8. Every level 1–3 is then a whole number of ASTC and BC4 blocks (96 = lcm(6, 4) × 2³) and has
integer dims. WebGPU requires a compressed base to be block multiples. With them, the ledger and
the byte lengths are exact (no partial blocks) and no level is padded.

| Field | `levelMax` | Box origin (vox) | Box dims (vox) | Visible voxels outside (L0 / L1) |
| --- | --- | --- | --- | --- |
| MCPM, grid 712×1200×728 @ 0.78131 Mpc | 134143.296875, 81543.546875, 40429.76953125, 12616.5263671875 | 40, 40, 40 | 672 × 1152 × 648 | none: every non-zero r8 voxel is inside |
| 2MRS, grid 1200×752×960 @ 1.22420848 Mpc | 11272, 6090, 2702.28, 1187.88 | 352, 120, 208 | 480 × 480 × 464 | 0.095% / 0.035% |

`levelMax[1..3]` are read from the `.npy` files at build time; the values above are the spike's.
MCPM's d4 and d8 `.npy` maxima differ from them in the seventh digit (40429.7734375 and
12616.5234375, today's `mcpm-medium` and `mcpm-small` headers). The 2MRS voxel is the mean of the
export's three per-axis edges, as today's import collapsed them (today's large header: 2.44841695 / 2).

MCPM keeps the spike's origin and grows x and y to the next multiple of 96 (+5.9% texels; the
spike's 648×1128×648 is a sub-box, so its r8 levels match byte for byte where they overlap). For
2MRS, a search under the new rule found a box 2.4% *smaller* than the spike's 480×432×528, at the
same bound (L0 visible voxels outside ≤ 1e-3, "visible" = L0 code > 86). Its origin is also on the
8-grid, so the overlap with the spike's levels is byte-identical too.

**Bytes per level (exact).**

| Field | Level | Dims | ASTC 6×6 | BC4 | r8 |
| --- | --- | --- | --- | --- | --- |
| MCPM | L1 | 336×576×324 | 27,869,184 | 31,352,832 | 62,705,664 |
| MCPM | L2 | 168×288×162 | 3,483,648 | 3,919,104 | 7,838,208 |
| MCPM | L3 | 84×144×81 | 435,456 | 489,888 | 979,776 |
| MCPM | **base L1** (L1–L3) | | **31,788,288** | **35,761,824** | **71,523,648** |
| MCPM | **base L2** (L2–L3) | | **3,919,104** | **4,408,992** | **8,817,984** |
| 2MRS | L1 | 240×240×232 | 5,939,200 | 6,681,600 | 13,363,200 |
| 2MRS | L2 | 120×120×116 | 742,400 | 835,200 | 1,670,400 |
| 2MRS | L3 | 60×60×58 | 92,800 | 104,400 | 208,800 |
| 2MRS | **base L1** | | **6,774,400** | **7,621,200** | **15,242,400** |
| 2MRS | **base L2** | | **835,200** | **939,600** | **1,879,200** |

For reference, today's GPU bytes (r16float): MCPM 2,429,700 / 19,437,600 / 155,500,800 and 2MRS
3,384,000 / 27,072,000 / 216,576,000 (small / medium / large). Hosted per field: every level of
every format, MCPM 139.1 MB, 2MRS 29.6 MB before gzip. On the wire the spike's gzip-6 sums for
levels 1–3 were MCPM 10.6 / 12.2 / 20.1 MB and 2MRS 1.0 / 0.98 / 1.37 MB (ASTC / BC4 / r8); the
new boxes add mostly zeros.

## 5. Build pipeline

`tools/volumes/buildVolumePyramid.ts <field>`, one row per field:

```ts
// tools/@types/volumes/VolumePyramidFieldRow.d.ts
export type VolumePyramidFieldRow = {
  readonly id: string;                         // read from the source row (MCPM_ENTRY.binBaseName), never retyped
  /** `<rawDataPath(dir)>/<stem>_d{2,4,8}.npy`, C-order (x slowest); both extractors name them so. */
  readonly npy: { readonly dir: RawDataKey; readonly stem: string };
  readonly nativePeak: number;                 // levelMax[0]; the d2 file cannot know it
  readonly gridDims: Vec3;
  readonly voxelMpc: number;
  readonly originMpc: Vec3;
  readonly frame: ScalarFieldFrameKind;
  readonly dataBox: { readonly originVox: Vec3; readonly dims: Vec3 };
  readonly zeroBelowRaw: number;               // MCPM 0, 2MRS 4.71397
};
```

- **Inputs.** Both fields read whole-grid block-mean `.npy` files through `rawDataRegistry`'s
  directory keys (its rule for tier variants: a directory key, file names joined). MCPM: today's
  `mcpm_sdss_d{2,4,8}.npy` (`mcpm.dir`). 2MRS: `polyphorm_2mrs_d{2,4,8}.npy` from the native
  Polyphorm export (1200×752×960 f16, folder `2026-08-13_13-33-58`), written by the existing
  `extractPolyphormExport.py` into `polyphorm.dir`. Its d2 is today's large file (the spike's
  `t00_verify.py`). The native peaks are recorded in the rows because a d2 file cannot know them.
  `extractMcpmCube.py` prints MCPM's; `extractPolyphormExport.py` prints only the d2/d4/d8 maxima, so
  it gains one line printing the native stats (2MRS's 11272 is the spike's measurement). The grid
  constants move from `buildMcpmVolume.ts` into the MCPM row.
- **Per level k = 1..3.** Take `levelMax[k]` as the whole level's peak (so the gain reproduces
  today's per-tier stretch by construction), cut the box `>> k`, zero below `zeroBelowRaw`, encode
  (§4) into an r8 level. That pure step is `tools/volumes/utils/encodeVolumeLevel.ts`.
- **Guard.** The builder refuses a box that leaves more than 0.1% of L1's visible voxels
  (code > 86) outside, or that breaks the crop rule. It prints the loss. A data refresh therefore
  cannot silently cut structure.
- **Compression.** `basisu` v2.50.0 (Homebrew formula `basis_universal`) gets each level as a 2D
  array of grey slices. BC4:
  `-dds -dds_format BC4 -linear -tex_type 2darray`. ASTC: `-ldr_6x6 -tl -ktx2_no_zstandard
  -tex_type 2darray`, effort 3. The builder strips the containers (DDS header 148 B; KTX2 level
  index at byte 80) to headerless blocks and checks each length against §4. Spike timings for the
  MCPM half-res chain: ASTC about 67 s, BC4 under 2 s. basisu writes a valid block everywhere; an
  all-zero ASTC block is an error block, so never hand-fill one.
- **Scripts.** `build-mcpm` (now the pyramid) and `build-2mrs` (new; 2MRS had none), each ending in
  `build-data-manifest`. `buildMcpmVolume.ts` and its tests go. `buildRhizomeVolume.ts` stays for
  `promote-mcpm-workbench`, and its `--clamp` (2MRS only) goes with its test.

## 6. Load path, renderer and shader

**Rows and requests.**

```ts
// CosmicWebDensitySourceEntry: `tiered: boolean` becomes
readonly storage: 'pyramid' | 'scfd';   // mcpm, polyphorm-2mrs: 'pyramid'; mcpm-workbench: 'scfd'

// src/layers/cosmicWebDensity/densityCubes/@types/CosmicWebDensityReq.d.ts
export type CosmicWebDensityReq =
  | { readonly storage: 'pyramid'; readonly binBaseName: string; readonly baseLevel: 1 | 2 }
  | { readonly storage: 'scfd'; readonly binBaseName: string };

// densityCubes/data/densityBaseLevelByTier.ts
export const DENSITY_BASE_LEVEL_BY_TIER = { small: 2, medium: 1, large: 1 } as const satisfies Record<Tier, 1 | 2>;
```

The asset row builds the request from the row and the tier. The fetcher dispatches through a
`Record<storage, load>` table. Medium and large make equal requests, so switching between them
reloads nothing (`reevaluateDemand`'s `sameRequest`). Eight files change for the discriminant: the
three source rows, the entry type, the request type, the asset rows, the fetcher, two tests.

**`GpuVolume` after the feature** gains two members:

```ts
  /** Multiplies the sample before the clamp to 1: log1p(levelMax[0]) / log1p(levelMax[base]); SCFD 1. */
  readonly gain: number;
  /** The stored box in the native grid's [0,1]³ per axis: originVox / gridDims and dims / gridDims; SCFD (0,0,0), (1,1,1). */
  readonly nativeBox: { readonly offset: Vec3; readonly scale: Vec3 };
```

The level count is the texture's `mipLevelCount`; the base voxel size is `placement.voxelSize`.

**Format choice.** One table, `src/data/volume/volumePyramidFormats.ts`, in preference order:

| Format | GPU format | Block edge | Features (both required) |
| --- | --- | --- | --- |
| `astc6` | `astc-6x6-unorm` | 6 | `texture-compression-astc`, `texture-compression-astc-sliced-3d` |
| `bc4` | `bc4-r-unorm` | 4 | `texture-compression-bc`, `texture-compression-bc-sliced-3d` |
| `r8` | `r8unorm` | 1 | none |

Bytes come from `TEXTURE_BYTES_PER_TEXEL[gpuFormat]` (§7), not from this table: a level's length
is texels × that value (exact for block multiples), so the loader's length check, the builder's and
the ledger read one number. `rowsPerImage` is `h / edge`, `bytesPerRow` is `w · edge · bytesPerTexel`.
`initGpu` requests every feature in the table; `device.ts` already drops what the adapter lacks.
The loader takes the first row whose features are all on `device.features`. A plain
`texture-compression-*` without its `-sliced-3d` partner does not allow a 3D texture: the landmine.

**Pyramid load** (`src/services/loading/volume/loadVolumePyramid.ts`):

1. Fetch the sidecar. Derive the placement (origin `originMpc + originVox·voxelMpc`, voxel
   `voxelMpc·2^base`, dims `dataBox.dims >> base`, identity rotation), the gain and the native box.
2. Create the texture: base dims, `mipLevelCount = 4 − base`, the chosen format,
   `TEXTURE_BINDING | COPY_DST`, labelled `density-volume-<id>` for the Memory panel. Creation and
   each write run inside a validation and an out-of-memory error scope; an error throws, so an
   invalid texture never reaches a bind group (that would drop whole frames). Each scope wraps one
   synchronous call and is popped before the next `await`: error scopes belong to the device, so a
   scope held open across a fetch would also catch, and hide, the render loop's errors from the
   frames drawn in between. Creation's scope is awaited at once; the writes' are awaited together
   before step 4 returns.
3. Fetch the levels coarse to fine, one at a time, each streamed through a reader into one
   8 MiB slab of whole z-slices. A full slab goes out as one `writeTexture` at its z offset and mip,
   then the buffer is reused (spike: 10.46 MB held at peak, 52 ms on localhost for MCPM ASTC). A
   length other than the derived one throws.
4. Return the `GpuVolume` only after every level is written: no frame samples a level still being
   filled. Dawn zero-clears a whole 3D mip level through one staging buffer before its first
   partial write. The largest level here is MCPM r8 L1 at 62.7 MB, under the 256 MiB default
   `maxBufferSize`, so no limit is raised. PR 4's native level would not fit and writes its own
   texture.

On abort or any error the loader destroys its texture and rethrows. Progress counts decoded bytes
against the derived total.

**Failure.** No format step-down. A failed file goes through the existing retry policy (two
retries on network and 5xx; a 404 gives up at once). After that the slot is in error, that field
draws nothing, the other draws on, and the console carries one warning. That is today's behaviour
for a missing `.scfd`.

**Tier switch.** Small ↔ medium changes `baseLevel`. The slot loads in place while the old
volume keeps drawing (L2 and L3 come from the HTTP cache), the commit hands the new volume to the
renderer, and the renderer destroys the old one. The accumulation key already restarts on the new
`loadedAtMs`.

**Renderer.** The sampler gains `mipmapFilter: 'linear'`. `draw` writes the new members from the
value. The renderer knows no format and holds no CPU copy.

**Shader** (`fragment.wesl`), per sample:

```wgsl
let lod = clamp(log2(max(t, 1e-6)) + lodOffset, 0.0, u.maxLod);  // lodOffset per ray
let sampleValue = min(textureSampleLevel(volume, volumeSampler, samplePos, lod).r * u.gain, 1.0);
```

Here `lodOffset = log2(length(M · dir) / (pxPerRad · baseVoxelMpc))` is computed once per ray, with
`pxPerRad` already the 1/3-scale target's. The envelope reads `nativeBoxOffset + samplePos ·
nativeBoxScale`, and per-step opacity is multiplied by `length(nativeBoxScale · dir)`. Both keep
today's native-grid units, so a cropped box looks like the whole grid. The ray marches only the
stored box (its back faces), so 128 steps now span the cropped chord.

**Price of the added terms** (feedback rule: count reads):

| Per step | Today | After |
| --- | --- | --- |
| Texture sample calls | 2 (volume, palette) | 2 |
| Volume texel taps | 8 (one level) | 8; 16 where `lod` falls between levels |
| ALU | — | + `log2`, add, clamp, mul, `min` |

Per ray: one jitter `textureLoad`, as today, plus two `length` and one `log2`. Spike cost of the LOD,
MCPM ASTC, per draw on vs off: inside 0.400 / 0.375 ms, outside 600 Mpc 0.575 / 0.450, far
2000 Mpc 0.125 / 0.80.

**Uniforms.** 272 → 304 bytes; offsets 0–259 unchanged:

| Offset | Member | Type | SCFD value |
| --- | --- | --- | --- |
| 260 | `gain` | f32 | 1 |
| 264 | `maxLod` | f32 (`mipLevelCount − 1`) | 0 |
| 268 | `baseVoxelMpc` | f32 | header voxel size |
| 272 | `nativeBoxOffset` | vec3<f32> | (0, 0, 0) |
| 284 | pad | f32 | 0 |
| 288 | `nativeBoxScale` | vec3<f32> | (1, 1, 1) |
| 300 | pad to 304 | | |

`volumeUniformsLayout.parity.test.ts` pins the layout against the WGSL struct.

## 7. Memory

- **GPU.** §1 and §4. Known costs: a device with neither compressed 3D feature runs r8, which holds
  86.8 MB for both volumes at medium (today 46.5 MB) and 10.7 MB at small (today 5.8 MB). ASTC holds
  38.6 MB at medium and large (today 46.5 and 372.1 MB) and 4.75 MB at small.
- **Ledger.** `src/data/gpu/textureBytesPerTexel.ts` gains `'astc-6x6-unorm': 16 / 36` and
  `'bc4-r-unorm': 8 / 16`. One helper, `src/utils/gpu/memory/levelByteLength.ts` (texels × that
  value, rounded to whole bytes, since 16/36 is not exact in floating point), sizes a level for
  `textureByteSize`, the loader's length check and the builder alike. That is exact because every shipped level is a block multiple
  (§4's crop rule); a partial-block level would be undercounted, and the builder refuses one. Without
  the rows the ledger falls back to 4 B/texel and reads MCPM as 257.6 MiB (the spike saw it).
- **CPU.** No decoded cube survives a load (today 155 MB at MCPM large stays resident). Peak JS
  bytes during a pyramid load are one slab plus the reader's chunk in flight.

## 8. Deploy

- `DATA_FAMILIES` gains `{ label: 'volume-pyramid', dir: 'volume-pyramid/v1', fileName:
  /^[a-z0-9-]+\.(?:json|(?:astc6|bc4|r8)\.L[1-3]\.bin)$/, transport: 'wrangler', gzipOnWire: true }`.
  It matches by folder, so the regex names no field. The `scalar-field` regex keeps
  `edenhofer-dust-*` and `mcpm-workbench` only.
- Names are content-hashed by `build-data-manifest`; `sync-r2-secure` uploads them. The largest
  file (62.7 MB) is far under wrangler's 300 MiB cap.
- The desktop mirror needs no code: every family's group is `offline`. The syncing machine must
  have built both pyramids, or the inventory build throws (DEPLOY.md).
- The old six files stay on R2 (sync never deletes), so tabs opened before the deploy keep their
  manifest and their volumes. Pruning them is a manual step a month after the deploy (§13).
- The app deploy follows `sync-r2-secure` at once: the new manifest no longer names the old files,
  so a fresh visit between the two gets the old app with the new manifest and draws no volume.
- **Accepted known cost (owner, 2026-11-26).** A kiosk running a desktop build from before this PR
  loses both volumes after its next data sync: the new manifest no longer names the old files. No
  desktop build ships with this deploy; such a kiosk draws no density volume until it runs a newer
  build.

## 9. Docs to update

- `docs/DATA.md`: a format-table row for the volume pyramid (sidecar plus headerless levels,
  version by folder); `volume-pyramid/v1/` in the layout list, `mcpm-*` and `polyphorm-2mrs-*` out
  of `scalar-field/v3/`; the Cosmic-web volumes section rewritten (inputs, crop rule, clamp, both
  scripts, basisu as a maintainer tool with its install and flags).
- `docs/RENDERER.md`: a density-volume bullet (the value, format choice, per-sample LOD) and the
  landmines: `-sliced-3d` features, block-multiple bases, Dawn's whole-level clear, ASTC error
  blocks, never sampling a partly written level.
- `data/raw/mcpm/README.md`, `ATTRIBUTIONS.md:911-913` (the 2MRS route), `docs/science.md:43`
  ("three tiers", `buildMcpmVolume.ts`).
- Website: `packages/website/src/content/docs/data/pipeline.mdx:93,131` ("reduced to three sizes",
  "a cube of numbers with a header"), copy through the `copy` skill. `docsRenderingFacts.ts` reads the step table and
  is unchanged.

## 10. Adjacent fixes

Own commits, after the prep and before the feature. Each verified on main e41e5d89a.

1. **SCFD version error is typed.** `decodeScalarField` throws a plain `Error` on a version
   mismatch (`scalarFieldFormat.ts:211-215`), so the retry policy downloads a stale file three
   times and `installFormatVersionAlert` never fires. It throws `FormatVersionError`, as
   `galaxyCatalogFormat.ts:243` does. A failing test first (the policy gives up on attempt 0).
2. **Stale docs and comments**, those still standing after the feature's deletions:
   `data/raw/mcpm/README.md:40,46` (`tools/extractMcpmCube.py` path, plain `sync-r2` →
   `sync-r2-secure`); `extractMcpmCube.py:11-12` (`tools/syncR2.ts EXTRA_FILES` →
   `tools/deploy/r2/collectExtraFiles.ts`); `VolumeFieldDefaults.d.ts:5` ("SCFD v2");
   `vertex.wesl:22` (cites `ScalarCube.densityScale`, which does not exist);
   `VolumeFieldSettings.d.ts:24-39` (a gamma remap and a `1 − exp` alpha the shader does not use);
   `scalarFieldFormat.ts:82-85` and the same claim in `docs/DATA.md:40` (`max-age=86400`; hashed
   data files are immutable, DEPLOY.md:162).
3. **Per-field hand lists beside the rows tuple.** The slots record in `create.ts:35-45` becomes a
   map over `COSMIC_WEB_DENSITY_SOURCE_ROWS`. `PRIORITY` (`cosmicWebDensityAssetRows.ts:13-17`) moves onto
   the rows as `priority` (the entry type grows by one member; no Layer contract). The
   `initialState.ts:14-27` list is not moved: see §13.

## 11. Tests

Only what can break (testing.md):

- **Sidecar → derived levels.** For the MCPM sidecar, the derived level dims and byte lengths per
  format equal §4's table (hand-computed). A format-contract test.
- **Format pick.** ASTC only with both ASTC features; BC4 only with both BC4 features; r8 otherwise;
  ASTC wins when both are present. Catches the `-sliced-3d` landmine.
- **Gain.** Hand-computed: MCPM 1.0440 (L1), 1.1131 (L2); 2MRS 1.0706, 1.1807.
- **Slab streaming.** Chunks arriving at arbitrary boundaries produce whole-slice `writeTexture`
  calls with the right z offsets and mips; a short or long stream throws; the held bytes never
  exceed one slab; an abort mid-level destroys the texture.
- **Slot ownership.** A superseded, uncommitted volume's texture is destroyed exactly once
  (prep commit). The renderer's existing re-upload and unload tests carry over with a fake
  `GpuVolume`.
- **Ledger.** MCPM base L1 ASTC → 31,788,288 B and BC4 → 35,761,824 B, with no fallback warning.
- **Uniform parity** at 304 B (existing test, updated).
- **`encodeVolumeLevel`.** A tiny hand-computed grid: the crop offset, the C-order → x-fastest
  reorder, the log against `levelMax[0]` (not the level's own peak), the clamp zeroing below the
  threshold, rounding. Its input is already a block mean of the raw trace (the extractors average
  before anything is logged), so "mean first, log second" holds by construction, not in this step.
- **`dataFamilyOf`.** A hashed level file and the sidecar are tracked; `mcpm-medium.scfd` no longer
  is. (Existing cases updated.)
- **SCFD `FormatVersionError`** (§10.1).
- Deleted: `buildMcpmVolume.smoke.test.ts`, `tests/data/mcpmAnchors.test.ts`, the `--clamp` case in
  `buildRhizomeVolume.smoke.test.ts:246`, the tiered-name case in the fetcher test.

basisu is not in CI; the compressed bytes are checked by acceptance.

## 12. Acceptance

Measured against the spike (its own server, `?vbase=today&tier=large&vcube=FULL@<fmt>&vtop=1&vnorm=tier&vcube2=TWOMRS@<fmt>&vtop2=1&vnorm2=tier`)
and against main, at the spike's poses with
`layers=-survey,-structureRing,-cosmicWebFilaments,-zoneOfAvoidance,-starCatalog,-milkyWayDisk,-label`:
MCPM inside `#pose=a,-239.45,-16.5,201.3,0.5,0.3,30,0`, outside and far at distance 600 and 2000,
knot `a,-132.82,18.99,67.28,0.5,0.3,20,0`; 2MRS inside `a,21.27,21.07,36.88,0.5,0.3,30,0`, dense
`a,43.3,38.2,44.2,0.5,0.3,60,0`. Main's tier is switched in Settings (`?tier=` does not stick).
Timing uses #1175's wall-clock bench (scratch patch drawing each field K times, never committed;
no-op floor, K-doubling within 15%, ≥ 5 rounds), reported as ms per frame and fps first. Each
measuring run is time-boxed to about 30 minutes, one pass.

1. **GPU bytes** per field and format equal §4 exactly, and the ledger shows the same figure.
2. **Payload.** r8 levels equal the spike's `FULL.r8.bin` / `TWOMRS.r8.bin` byte for byte on the
   overlapping region. Decoded ASTC and BC4 against r8 stay within the spike's codec numbers:
   `rms_visible` ≤ 4.0 (ASTC) and ≤ 3.5 (BC4).
3. **Image vs main's large** at inside and dense (and MCPM inside and knot, a new measurement):
   ASTC and BC4 mean shift within −1.2..+0.5 of 255 and RMS ≤ 4.6; r8 RMS ≤ 0.6.
4. **Image vs the spike**, same format and pose: RMS ≤ F + 0.2, where F is the measured floor of
   the spike's own tier path against main.
5. **2MRS crop.** Against the uncropped field at outside and far: RMS ≤ 0.2 and ≤ 0.05.
6. **Far brightness.** At 600 and 2000 Mpc, the luminance ratio against main's large is measured and
   shown to the owner as a dash check. The spike never measured it and expects it dimmer (coarse
   levels average before the transfer function). No guessed threshold; the owner's eye rules.
7. **Per-draw cost** ≤ 1.10× the spike's rows (MCPM ASTC inside 0.400, outside 0.575, far 0.125,
   knot 0.375 ms; BC4 0.400, 1.25, 0.15, 0.425; 2MRS ASTC 0.375, 0.363, 0.163).
8. **Medium and small vs today.** Medium now draws half res, so it is measured against today's
   medium on the Mac, and small against today's small on the OnePlus (`npm run phone`), moving.
   Pass ≤ 1.10×; a breach halts and goes to the owner. Record which format the phone picks.
9. **Load time.** `npm run loadtime` on 4G, cold boot to first volume, before and after; shown to
   the owner (medium downloads L1–L3 where it downloaded d4).
10. **CPU.** Peak JS bytes held during a load ≤ 10.5 MB; no `ScalarCube` retained by any slot.
11. **Fallback.** With the ASTC features dropped (scratch patch), BC4 loads and passes 3. With both
    dropped, r8 loads. With one level file missing, one warning, that field absent, the other drawn,
    no frame lost.
12. **Headless.** Whether SwiftShader (`npm run shot`, CI) exposes the compressed 3D features is
    recorded; shots work on whatever format it picks, r8 included.
13. **Tier switch** small → medium → large → small in the app: no flash to empty, no texture leaked
    in the Memory panel.

## 13. Rulings on open questions

Owner, 2026-11-26:

1. **The spec is approved.**
2. **A failed file after retries:** that volume is absent, with one console warning, as today for a
   missing `.scfd`. No format step-down (§6 "Failure").
3. **`initialState`'s per-field list** (`enabled`, `intensity`) stays in the Layer's `initialState`:
   the entry type records that boot visibility lives there, not on rows.
4. **No desktop build ships with the deploy.** Kiosks on an older desktop build lose both volumes
   after their next data sync; the owner accepts that as a known cost (§8).
5. **2MRS build inputs on R2:** not in this PR (the d2 file is about 430 MB, over wrangler's cap).
   A backlog line records it, added with the builder (§14).
6. **The six old `.scfd` come off R2 a month after the deploy.** A dated backlog line records it,
   added when the runtime stops reading them (§14).

## 14. Backlog

- Deleted: "`createTieredScfdFetcher` factory" (`BACKLOG.md:111`). Its premise, a tiered SCFD
  fetcher to share, is gone; the dust Layer picks its loader when its slice starts.
- Edited: "`AssetSlot` keeps committed values nothing re-reads" (`BACKLOG.md:93` and
  `docs/backlog/2026-10-13-asset-slot-value-disposal.md`): volume voxels leave its list. The flow
  cube, filaments, `ShellMesh` and the structure payload remain.
- Added: "Mirror the 2MRS volume inputs to R2" (ruling 5) and "Prune the six tiered volume `.scfd`
  from R2", dated a month after the deploy (ruling 6).
- Untouched, related: "Large tier switch fails in headless" (`BACKLOG.md:273`). Medium ↔ large no
  longer reloads the density cubes, which may hide the repro; it is not fixed here.
