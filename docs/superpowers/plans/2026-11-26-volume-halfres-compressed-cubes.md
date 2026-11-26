# Half-res compressed volume cubes

**Goal.** Ship [the spec](../specs/2026-11-26-volume-halfres-compressed-cubes-design.md): the MCPM
and Polyphorm 2MRS density volumes load from a compressed mip pyramid (`volume-pyramid/v1/`, ASTC
6×6, BC4 or r8 by device features) instead of the six tiered 16-bit `.scfd` files. Small loads
quarter res (L2), medium and large load half res (L1). GPU and CPU memory drop and the look stays
today's.

**Base.** `main` at `e41e5d89a`, branch `feat/volume-halfres-compressed-cubes`. The spec rides this
PR (commit `5630254be`, rulings recorded in its §13 with this plan).

**Pre-task questions (sdd-execution.md).** Nothing to ask. The perf gate runs: spec §12 checks 7–8
rule it, measured with #1175's wall-clock bench. Parallelism: this PR alone; the detail-region PR
waits for it.

**Ledger.** `.superpowers/sdd/2026-11-26-volume-halfres-compressed-cubes/progress.md` in the
controller's worktree; archived beside this plan at landing.

## Owner rulings this plan builds on

From the spec's §2 and §13 (2026-11-26): one file per level per format, gzip by the server; no
format step-down after a failed file (that volume is absent with one warning, as today); the
`initialState` per-field list stays; **no desktop build ships with the deploy** (old kiosk builds
lose both volumes after their next data sync, an accepted cost); 2MRS inputs to R2 and the prune of
the six old files are backlogged; prep and the three adjacent fixes ride this PR as their own
commits, first.

## Decisions the plan makes

1. **The slot takes a named bag.** `createCosmicWebDensitySlot` gains a fourth input (the fetcher,
   now built from the device), so its positional arguments become `CosmicWebDensitySlotDeps`
   (simplicity.md, "Positional factory args"). The slot test then passes a fake fetcher and drops
   its `vi.mock`.
2. **The SCFD load step lives in `src/services/loading/volume/` from the prep on.** The prep puts
   `loadScfdVolume` where the feature's dispatch table needs it, so nothing moves twice.
3. **`GpuVolume` grows `gain` and `nativeBox` before the renderer reads them** (Task 7), with SCFD
   filling 1 and the identity box. The renderer and shader then change on today's `.scfd` (Task 11),
   where the image must stay identical, before any pyramid file is drawn.
4. **The `volume-pyramid` deploy row lands with the builder** (Task 10), because
   `build-data-manifest` hashes only tracked families. The `scalar-field` regex loses MCPM and 2MRS
   with the runtime switch (Task 13).
5. **GPU error scopes wrap one synchronous call each, never an `await`** (spec §6 step 2, corrected
   by this plan): a device's error scope held open across a fetch would also catch the render
   loop's errors from the frames in between.
6. **The feature is several commits**, one per task (5–11, 13–14), each green, instead of one
   feature commit.

## Tasks

| # | Task | Spec | Dispatch |
| --- | --- | --- | --- |
| 1 | Prep: density volumes reach the renderer as a `GpuVolume` | §3 | D1 |
| 2 | SCFD version mismatch throws `FormatVersionError` | §10.1 | D1 |
| 3 | Stale docs and comments | §10.2 | D1 |
| 4 | Slots and asset priorities come from the source rows | §10.3 | D1 |
| 5 | The memory ledger sizes ASTC 6×6 and BC4 | §7 | D2 |
| 6 | Pyramid formats table, format pick, device features | §6 | D2 |
| 7 | Sidecar type, derived levels, placement and gain; `GpuVolume` grows | §4, §6 | D2 |
| 8 | `streamLevelSlabs`: a level into whole-slice writes through one slab | §6 | D3 |
| 9 | `loadVolumePyramid` and `scopedGpuCall` | §6 | D3 |
| 10 | The pyramid builder; the old builder and `--clamp` go | §4, §5, §8 | D4 |
| 11 | Renderer and shader: mips, gain, native box | §6 | D5 |
| 12 | Controller: build both pyramids on the owner's machine | §5 | controller |
| 13 | Runtime switch: `storage`, base-level table, fetcher dispatch | §6, §8 | D6 |
| 14 | Docs | §9 | D6 |
| 15 | Controller: acceptance checks 1–13 | §12 | controller |

**Dispatches** (sdd-execution.md; paste its agent protocol into every brief):

| Dispatch | Tasks | Model | Why this model |
| --- | --- | --- | --- |
| D1 | 1–4 | opus | GPU ownership move across renderer, slot and fetcher; the three fixes share its files |
| D2 | 5–7 | sonnet | pure helpers with hand-computed tests; one type growth |
| D3 | 8–9 | opus | streaming, abort and GPU error handling (`review: yes` on 9) |
| D4 | 10 | opus | binary output, basisu, container stripping, the crop guard (`review: yes`) |
| D5 | 11 | opus | shader and TS↔WGSL uniform layout (`review: yes`) |
| D6 | 13–14 | sonnet | a discriminant sweep, a deploy regex, docs |

**Order.** Strictly sequential on the one branch: D1 → D2 → D3 → D4 → D5 → D6, then Task 15. The
only overlap: **Task 12 runs while D5 works.** Task 12 writes only gitignored files (main's
`data/raw/polyphorm/` and `public/data/volume-pyramid/v1/`), and D5 touches neither. D5 and D6 have
disjoint files too, but they would share one git index; this project has lost commits that way, so
they stay sequential. Mid-branch reviews (one round each, given the diff, the task contract and the
named spec section) follow D3, D4 and D5. Controller checks follow D1 (pixels identical) and D5
(pixels identical).

Each dispatch is sized well under 350k tokens; D2 and D3 are split from one another for that reason.

---

## Task 1: Prep — density volumes reach the renderer as a `GpuVolume`

Behaviour-preserving, on today's `.scfd`: pixels identical.

**Files:**
- `src/@types/rendering/GpuVolume.d.ts` (create)
- `src/@types/rendering/VolumeFieldRenderer.d.ts` (modify: `upload`, `:27-32`)
- `src/@types/rendering/FieldEntry.d.ts` (modify: `volumeTexture` → `volume`)
- `src/@types/rendering/CubePlacement.d.ts`, `src/utils/math/buildCubeModelMatrix.ts` (modify: header
  lines that say volume call sites pass a `ScalarCube`)
- `src/services/gpu/renderers/volumeField/volumeFieldRenderer.ts` (modify: delete `uploadCube`
  `:204-218`; `upload` `:253-318`, `unload` `:319-331`, `destroy` `:438-448`)
- `src/services/loading/volume/loadScfdVolume.ts` (create)
- `src/layers/cosmicWebDensity/densityCubes/load/cosmicWebDensityFetcher.ts` → renamed to
  `createCosmicWebDensityFetcher.ts`, its test dragged along:
  `npm run move-files -- src/layers/cosmicWebDensity/densityCubes/load/cosmicWebDensityFetcher.ts src/layers/cosmicWebDensity/densityCubes/load/createCosmicWebDensityFetcher.ts`
  (`--dry` first; never `git mv`; exit 1 means the move is written, fix the findings)
- `src/layers/cosmicWebDensity/@types/CosmicWebDensitySlotDeps.d.ts` (create)
- `src/layers/cosmicWebDensity/densityCubes/load/createCosmicWebDensitySlot.ts` (modify)
- `src/layers/cosmicWebDensity/@types/CosmicWebDensityRuntime.d.ts` (modify: slot value type)
- `src/layers/cosmicWebDensity/create.ts` (modify)
- `tests/services/gpu/renderers/volumeField/volumeFieldRenderer.test.ts` (modify: 12 `upload` calls,
  `fixture`, the two lifecycle tests `:376-410`)
- `tests/services/gpu/renderers/volumeField/volumeUniformsLayout.parity.test.ts` (modify: `:22-32`,
  `:61`)
- `tests/layers/cosmicWebDensity/densityCubes/load/createCosmicWebDensitySlot.test.ts` (modify)
- `tests/layers/cosmicWebDensity/densityCubes/load/createCosmicWebDensityFetcher.test.ts` (modify,
  after the move)
- `docs/BACKLOG.md` (modify: `:93`), `docs/backlog/2026-10-13-asset-slot-value-disposal.md` (modify)

**Contract.**

```ts
// src/@types/rendering/GpuVolume.d.ts
export type GpuVolume = {
  /** 3D; its mip 0 is the base level. Owned by the renderer once `upload` runs. */
  readonly texture: GPUTexture;
  /** The stored box at base resolution, in world terms (`buildCubeModelMatrix`'s input). */
  readonly placement: CubePlacement;
};

// VolumeFieldRenderer
upload(id: Id, volume: GpuVolume,
       statics: Pick<VolumeFieldDefaults, 'paletteId' | 'contrastCenter' | 'envelope'>): void;

// src/services/loading/volume/loadScfdVolume.ts
/** `stem` is the file name under the scalar-field prefix, without `.scfd`. */
export function loadScfdVolume(
  device: GPUDevice,
  stem: string,
  signal: AbortSignal,
  onProgress: (loaded: number, total: number) => void,
): Promise<GpuVolume>;

// createCosmicWebDensityFetcher.ts
export function createCosmicWebDensityFetcher(
  device: GPUDevice,
): Fetcher<GpuVolume, CosmicWebDensityReq>;

// src/layers/cosmicWebDensity/@types/CosmicWebDensitySlotDeps.d.ts
export type CosmicWebDensitySlotDeps = {
  readonly renderer: VolumeFieldRenderer<CosmicWebDensityFieldId>;
  /** Every commit awaits it (a cube drawn before the mask marches unjittered). */
  readonly jitterMaskReady: Promise<void>;
  readonly fetch: Fetcher<GpuVolume, CosmicWebDensityReq>;
};

export function createCosmicWebDensitySlot(
  entry: (typeof COSMIC_WEB_DENSITY_SOURCE_ROWS)[number],
  deps: CosmicWebDensitySlotDeps,
): AssetSlot<GpuVolume, CosmicWebDensityReq>;
```

- **Renderer.** `upload` creates no volume texture. `FieldEntry.volume` holds the value; the bind
  group's binding 1 is `volume.texture.createView()`; `buildCubeModelMatrix(volume.placement)`.
  Re-upload, `unload` and `destroy` destroy `volume.texture` exactly where they destroy today's
  texture. The module header says the renderer owns a volume from `upload` on (AssetSlot's rule: a
  committed payload belongs to the consumer).
- **`loadScfdVolume`.** `fetchWithProgress(dataUrl(`${SCALAR_FIELD_DATA_PREFIX}/${stem}.scfd`))`,
  `decodeScalarField`, then one texture: label `density-volume-${stem}`, format
  `gpuTextureFormatForChannels(cube.channels)` (`src/utils/gpu/`), `dimension: '3d'`, size = dims,
  `TEXTURE_BINDING | COPY_DST`; one `writeTexture` with `bytesPerRow = dims[0] · 2 · channels`,
  `rowsPerImage = dims[1]` (today's `uploadCube`). `placement` is a **fresh object** with the five
  `CubePlacement` fields copied: a `ScalarCube` satisfies `CubePlacement` structurally, and handing
  over the cube itself would keep its 155 MB of voxels alive.
- **Fetcher.** Computes today's stem (`<binBaseName>` or `<binBaseName>-<tier>`,
  `cosmicWebDensityFetcher.ts:21`) and returns `loadScfdVolume(device, stem, …)`.
- **Slot.** `dispose: (volume) => volume.texture.destroy()` for a fetched volume dropped before its
  commit (superseded, or landing after `release()`); `onRelease` and the commit are unchanged apart
  from the value's name.
- **`create.ts`.** Builds one fetcher, `createCosmicWebDensityFetcher(deps.ctx.device)`, and hands
  the same bag to each slot (Task 4 turns the three calls into a map).
- **Backlog.** In `BACKLOG.md:93` and its detail file, volume voxels leave the list of retained
  values; the flow cube, filaments, `ShellMesh` and the structure payload remain. The decoded cube
  no longer outlives the load.

Steps:

- [x] Move the fetcher with move-files (command above), then edit it to the factory.
- [x] Type, renderer, load step, slot, runtime type, `create.ts`.
- [x] Test `a superseded volume that never committed is destroyed exactly once`
      (`createCosmicWebDensitySlot.test.ts`):
  - A fake `fetch` returns deferred volumes A then B, each with its own `texture.destroy` mock.
  - `load` A, `load` B, resolve B, then resolve A.
  - A's `destroy` is called once; `renderer.upload` is called once, with B.
  - Regression it guards: before this commit the slot dropped a superseded cube to the GC; a
    texture is never collected.
- [x] The slot's two existing tests take the bag with a fake `fetch`; the `vi.mock` of the fetcher
      module goes.
- [x] Renderer tests: `fixture()` returns a fake `GpuVolume` (`texture` with `createView` and
      `destroy` mocks; the placement fields of today's fixture). The unload and re-upload tests
      assert on the fixture's own `texture.destroy` (once), and `upload` now creates one texture
      (the palette).
- [x] Fetcher test: keep both file-name cases. Add to the tiered case, with a mock device: one
      `createTexture` with `format: 'r16float'`, `dimension: '3d'` and size = the cube's dims, and
      one `writeTexture` with `bytesPerRow` = dims[0] · 2 (the bytes today's renderer wrote).
- [x] `npm run typecheck:fast`; `npm test -- volumeField cosmicWebDensity`.

**Commit:** `Prep: density volumes reach the renderer as a GpuVolume`

**Done when:** no density cube stays in JS memory after its load, the renderer creates no volume
texture, and the controller's shot at the MCPM inside pose matches main (Task 15's servers; RMS 0
expected, ≤ 0.1 of 255 accepted).

---

## Task 2: SCFD version mismatch throws `FormatVersionError`

**Files:**
- `src/data/volume/scalarFieldFormat.ts` (modify: `:211-215`)
- `tests/data/volume/scalarFieldFormat.test.ts` (modify: `:219-228`; delete `:176-181`)

**Contract.** `throw new FormatVersionError('scalar field', version, VERSION, <today's message>)`,
as `galaxyCatalogFormat.ts:243` does. The message keeps its regenerate hint.

Steps:

- [x] **Failing test first.** Extend `decodeScalarField rejects a v2 header with a regenerate-hint
      error`:
  - the thrown error is a `FormatVersionError` with `found` 2 and `expected` 3;
  - its message matches `/regenerat/`;
  - `defaultRetryPolicy(0, error)` is `'give-up'`. The bug it pins: a plain `Error` made the
    policy download a stale cube three times, and `installFormatVersionAlert` never fired.
- [x] Run it: it fails on the class assertion.
- [x] Throw the typed error. The test passes.
- [x] Delete `rejects unsupported version with regenerate hint` (`:176-181`): it checks the same
      branch with version 99 and adds nothing the extended test misses.
- [x] `npm test -- scalarFieldFormat retryPolicy`.

**Commit:** `SCFD version mismatch throws FormatVersionError, so a stale cube is fetched once`

**Done when:** a stale `.scfd` gives up on attempt 0 and raises the format-version alert.

---

## Task 3: Stale docs and comments

Each fix stands after the feature's deletions. No test.

**Files and the change:**
- `data/raw/mcpm/README.md:40`: `tools/extractMcpmCube.py` → `tools/volumes/extractMcpmCube.py`;
  `:46` `npm run sync-r2` → `npm run sync-r2-secure`.
- `tools/volumes/extractMcpmCube.py:11-12`: `tools/syncR2.ts EXTRA_FILES` →
  `tools/deploy/r2/collectExtraFiles.ts`; `:28` (usage) gets the `tools/volumes/` path too. Line 38
  (`tools/buildMcpmVolume.ts`) is Task 10's: that file goes there.
- `src/@types/data/volume/VolumeFieldDefaults.d.ts:5`: "SCFD v2 is data-only" → a format-neutral
  sentence: a field's data file carries only data (dims, frame, voxels, range); the look lives on
  the source row.
- `src/services/gpu/shaders/scalarVolume/vertex.wesl:22`: drop the citation of
  `ScalarCube.densityScale` (no such field); the scale comes from the source row's settings.
- `src/@types/settings/VolumeFieldSettings.d.ts:24-39`: `contrast` is the deadband-and-stretch
  window (`applyContrastWindow` in `fragment.wesl`), not a gamma remap; `densityScale` multiplies
  per-step alpha `lut.a · intensity · densityScale · stepLength`, not `1 − exp(…)`.
- `src/data/volume/scalarFieldFormat.ts:82-85` and the same claim in `docs/DATA.md:40`: hashed
  data files are `immutable` (`DEPLOY.md`, "Cache-Control + CORS"), so no CDN pairs stale bytes
  with new code. The folder carries the version so a bump writes new logical names, and the old
  files stay on R2 for tabs still on the old manifest.

Steps:

- [x] Edit as above, within the comment budget (comments.md).
- [x] `npm run typecheck:fast`; `npm test -- volumeUniformsLayout` (the vertex struct is parsed).

**Commit:** `Volume docs and comments: right paths, the secure sync, the shader's real maths`

---

## Task 4: Slots and asset priorities come from the source rows

**Files:**
- `src/@types/data/volume/CosmicWebDensitySourceEntry.d.ts` (modify: one member)
- `src/layers/cosmicWebDensity/sources/mcpm.ts`, `polyphorm-2mrs.ts`, `mcpm-workbench.ts` (modify)
- `src/layers/cosmicWebDensity/densityCubes/load/cosmicWebDensityAssetRows.ts` (modify: delete
  `PRIORITY` `:13-17`)
- `src/layers/cosmicWebDensity/create.ts` (modify: the slots record)

**Contract.**

```ts
// CosmicWebDensitySourceEntry gains
/** Asset-queue rank of this row's cube (`AssetWiringRow.priority`). */
readonly priority: number;   // mcpm 70, polyphorm-2mrs 82, mcpm-workbench 82 (today's values)
```

- The asset row reads `priority: entry.priority`. MCPM's comment moves with its value.
- `create.ts` builds `slots` by mapping `COSMIC_WEB_DENSITY_SOURCE_ROWS` to
  `[entry.id, createCosmicWebDensitySlot(entry, slotDeps)]`. `Object.fromEntries` widens keys to
  `string`, so the record type comes from a cast with one comment line, as `sourceRecordOf.ts`
  does.
- `initialState.ts`'s per-field list is not moved (spec §13, ruling 3).
- No new test: constant plumbing; the existing Layer tests cover the slots.

Steps:

- [x] As above. `npm run typecheck:fast`; `npm test -- cosmicWebDensity`.

**Commit:** `Density slots and asset priorities come from the source rows`

---

## Task 5: The memory ledger sizes ASTC 6×6 and BC4

**Files:**
- `src/data/gpu/textureBytesPerTexel.ts` (modify)
- `src/utils/gpu/memory/levelByteLength.ts` (create)
- `src/utils/gpu/memory/textureByteSize.ts` (modify: the mip walk `:38-43`)
- `tests/utils/gpu/memory/textureByteSize.test.ts` (modify)

**Contract.**

```ts
// TEXTURE_BYTES_PER_TEXEL gains
'astc-6x6-unorm': 16 / 36,  // one 16 B block per 6×6 texels of a slice
'bc4-r-unorm': 8 / 16,      // one 8 B block per 4×4

// src/utils/gpu/memory/levelByteLength.ts
/** One mip level's bytes. Rounded because 16/36 is not exact in f64; exact for the block-multiple
 *  dims every shipped level has, and an undercount for a partial-block level (none ships). */
export function levelByteLength(width: number, height: number, depth: number, bytesPerTexel: number): number;
```

`textureByteSize` sums `levelByteLength` per mip. The loader's length check (Task 9) and the
builder's (Task 10) call the same helper, so the three read one number.

Steps:

- [x] Tests, `console.warn` spied and never called:
  - `sizes MCPM's half-res ASTC 6×6 base and its mips exactly`: 336×576×324, `'3d'`, 3 mips,
    `astc-6x6-unorm` → 31,788,288.
  - `sizes MCPM's half-res BC4 base and its mips exactly`: same, `bc4-r-unorm` → 35,761,824.
  - Without the rows, the fallback reads 4 B/texel (MCPM showed as 257.6 MiB in the spike).
- [x] Implement. `npm test -- textureByteSize trackGpuMemory`.

**Commit:** `GPU memory ledger sizes ASTC 6×6 and BC4 textures`

---

## Task 6: Pyramid formats table, format pick, device features

**Files:**
- `src/@types/data/volume/VolumePyramidFormat.d.ts` (create)
- `src/@types/data/volume/VolumePyramidFormatRow.d.ts` (create)
- `src/data/volume/volumePyramidFormats.ts` (create)
- `src/utils/volume/pickVolumePyramidFormat.ts` (create)
- `src/services/engine/phases/initGpu.ts` (modify: `:46-48`)
- `tests/utils/volume/pickVolumePyramidFormat.test.ts` (create)

**Contract.**

```ts
export type VolumePyramidFormat = 'astc6' | 'bc4' | 'r8';   // the file-name token

export type VolumePyramidFormatRow = {
  readonly format: VolumePyramidFormat;
  readonly gpuFormat: GPUTextureFormat;
  /** Texels per block side in x and y; blocks are 2D, one z-slice deep. */
  readonly blockEdge: 1 | 4 | 6;
  /** All required before a 3D texture of this format may be created. */
  readonly features: readonly GPUFeatureName[];
};

/** Preference order: the first row whose features the device has wins. */
export const VOLUME_PYRAMID_FORMATS: readonly VolumePyramidFormatRow[];

export function pickVolumePyramidFormat(features: ReadonlySet<string>): VolumePyramidFormatRow;
```

| `format` | `gpuFormat` | `blockEdge` | `features` |
| --- | --- | --- | --- |
| `astc6` | `astc-6x6-unorm` | 6 | `texture-compression-astc`, `texture-compression-astc-sliced-3d` |
| `bc4` | `bc4-r-unorm` | 4 | `texture-compression-bc`, `texture-compression-bc-sliced-3d` |
| `r8` | `r8unorm` | 1 | none |

- Bytes per texel are not in this table: they come from `TEXTURE_BYTES_PER_TEXEL[gpuFormat]`
  (Task 5).
- One comment line on the table: a plain `texture-compression-*` without its `-sliced-3d` partner
  does not allow a 3D texture.
- `initGpu` requests `[DUAL_SOURCE_FEATURE, ...every row's features]`; `device.ts:88-91` already
  drops what the adapter lacks. Its comment line covers both.

Steps:

- [x] Tests:
  - `ASTC needs both ASTC features`: `{astc, astc-sliced-3d}` → `astc6`; `{astc}` alone → `r8`.
  - `BC4 needs both BC4 features`: `{bc, bc-sliced-3d}` → `bc4`; `{bc}` alone → `r8`.
  - `ASTC wins when both families are present`.
  - `no features picks r8`.
- [x] Implement. `npm run typecheck:fast`; `npm test -- pickVolumePyramidFormat initGpu`.

**Commit:** `Volume pyramid formats: ASTC 6×6, BC4 and r8, picked by device features`

---

## Task 7: Sidecar type, derived levels, placement and gain; `GpuVolume` grows

**Files:**
- `src/@types/data/volume/VolumePyramidSidecar.d.ts` (create)
- `src/@types/data/volume/VolumePyramidLevel.d.ts` (create)
- `src/data/volume/volumePyramidDataPrefix.ts` (create)
- `src/utils/volume/volumePyramidLevelPath.ts` (create)
- `src/utils/volume/volumePyramidLevels.ts` (create)
- `src/utils/volume/volumePyramidPlacement.ts` (create)
- `src/@types/rendering/GpuVolume.d.ts` (modify: two members)
- `src/services/loading/volume/loadScfdVolume.ts` (modify: gain 1, identity box)
- test fixtures typed `GpuVolume` (modify): `volumeFieldRenderer.test.ts`,
  `volumeUniformsLayout.parity.test.ts`, `createCosmicWebDensitySlot.test.ts`
- `tests/utils/volume/volumePyramidLevels.test.ts` (create)
- `tests/utils/volume/volumePyramidPlacement.test.ts` (create)

**Contract.**

```ts
// src/@types/data/volume/VolumePyramidSidecar.d.ts (the JSON file, spec §4)
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

// src/@types/data/volume/VolumePyramidLevel.d.ts
export type VolumePyramidLevel = {
  readonly level: 1 | 2 | 3;
  /** level − baseLevel: the texture mip this level fills. */
  readonly mip: number;
  /** dataBox.dims >> level. */
  readonly dims: Vec3;
  /** levelByteLength(dims, TEXTURE_BYTES_PER_TEXEL[gpuFormat]): the file's exact length. */
  readonly byteLength: number;
};

// GpuVolume gains (SCFD: gain 1, offset (0,0,0), scale (1,1,1))
/** Multiplies the sample before the clamp to 1: log1p(levelMax[0]) / log1p(levelMax[base]). */
readonly gain: number;
/** The stored box in the native grid's [0,1]³: originVox / gridDims and dims / gridDims. */
readonly nativeBox: { readonly offset: Vec3; readonly scale: Vec3 };

export const VOLUME_PYRAMID_DATA_PREFIX = 'volume-pyramid/v1';
/** `${VOLUME_PYRAMID_DATA_PREFIX}/${id}.${format}.L${level}.bin`; the sidecar is `${prefix}/${id}.json`. */
export function volumePyramidLevelPath(id: string, format: VolumePyramidFormat, level: 1 | 2 | 3): string;
/** Levels base first (finest). The loader fetches them in reverse, coarse to fine. */
export function volumePyramidLevels(
  sidecar: VolumePyramidSidecar, baseLevel: 1 | 2, gpuFormat: GPUTextureFormat,
): readonly VolumePyramidLevel[];
export function volumePyramidPlacement(
  sidecar: VolumePyramidSidecar, baseLevel: 1 | 2,
): Pick<GpuVolume, 'placement' | 'gain' | 'nativeBox'>;
```

- **Placement:** origin `originMpc + dataBox.originVox · voxelMpc`, voxel `voxelMpc · 2^base`,
  dims `dataBox.dims >> base`, identity rotation, `frameKind = frame`.
- `loadScfdVolume` returns `gain: 1` and the identity box; the renderer ignores both until Task 11.

Steps:

- [x] `volumePyramidLevels.test.ts`, on the MCPM sidecar of spec §4 (gridDims 712×1200×728, box
      origin 40,40,40, dims 672×1152×648); hand values:

  | Level | Dims | `astc-6x6-unorm` | `bc4-r-unorm` | `r8unorm` |
  | --- | --- | --- | --- | --- |
  | L1 | 336×576×324 | 27,869,184 | 31,352,832 | 62,705,664 |
  | L2 | 168×288×162 | 3,483,648 | 3,919,104 | 7,838,208 |
  | L3 | 84×144×81 | 435,456 | 489,888 | 979,776 |

  - `MCPM at base 1: three levels, mips 0–2, dims and bytes per format as built`.
  - `base 2 starts at L2 as mip 0` (two levels).
- [x] `volumePyramidPlacement.test.ts`, hand values (`toBeCloseTo`, 4 decimals for the gain):
  - `gain restores today's per-tier stretch`: MCPM 1.0440 at base 1, 1.1131 at base 2 (levelMax
    134143.296875, 81543.546875, 40429.76953125, 12616.5263671875); 2MRS 1.0706, 1.1807 (11272,
    6090, 2702.28, 1187.88).
  - `placement moves to the box and doubles the voxel per level`: MCPM originMpc
    (−517.61536, −485.3478, −83.12184) → origin (−486.36296, −454.0954, −51.86944); voxel 1.56262
    at base 1 and 3.12524 at base 2; dims 336×576×324 and 168×288×162.
  - `the native box is the stored box over the grid`: MCPM offset (40/712, 40/1200, 40/728), scale
    (672/712, 1152/1200, 648/728).
- [x] Implement; grow `GpuVolume`; SCFD fills the identity; fixtures gain the two members.
- [x] `npm run typecheck:fast`; `npm test -- volumePyramid volumeField cosmicWebDensity`.

**Commit:** `Volume pyramid sidecar: derived levels, placement and brightness gain`

---

## Task 8: `streamLevelSlabs` — a level into whole-slice writes through one slab

**Files:**
- `src/data/volume/volumeUploadSlabBytes.ts` (create)
- `src/utils/volume/streamLevelSlabs.ts` (create)
- `tests/utils/volume/streamLevelSlabs.test.ts` (create)

**Contract.**

```ts
// src/data/volume/volumeUploadSlabBytes.ts: the one CPU buffer a pyramid load holds (spike: 10.46 MB
// at peak with the reader's chunk in flight).
export const VOLUME_UPLOAD_SLAB_BYTES = 8 * 1024 * 1024;

/**
 * Streams one level's headerless bytes into whole-z-slice writes through `slab`, reused.
 * Throws when the stream ends short of, or runs past, sliceBytes · depth.
 */
export function streamLevelSlabs(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  level: { readonly sliceBytes: number; readonly depth: number },
  slab: Uint8Array,
  writeSlices: (bytes: Uint8Array, zOffset: number, sliceCount: number) => void,
  onBytes: (byteCount: number) => void,
): Promise<void>;
```

- The usable slab is `floor(slab.length / sliceBytes) · sliceBytes`; fewer than one slice throws.
- `bytes` is a view into the slab. That is safe because `writeTexture` copies its data at call time,
  so the slab is refilled at once (one comment line; it reads like a bug otherwise).
- A full slab goes out at once; the tail goes out when the stream ends.

Steps:

- [x] Tests (slice 6 B, depth 5, so 30 B; slab 13 B, so 12 usable):
  - `chunks at arbitrary boundaries become whole-slice writes in z order`: chunks of 1, 7, 4, 11
    and 7 B give writes (12 B, z 0, 2 slices), (12 B, z 2, 2), (6 B, z 4, 1), with the source
    bytes in order and no write longer than 12 B.
  - `a short stream throws` (29 B); `a long stream throws` (31 B).
  - `onBytes sums to the level's length`.
- [x] Implement. `npm test -- streamLevelSlabs`.

**Commit:** `Stream a pyramid level into whole-slice texture writes through one slab`

---

## Task 9: `loadVolumePyramid` and `scopedGpuCall`

**review: yes** (binary format reader; GPU validation errors; a landmine-named area)

**Files:**
- `src/utils/gpu/scopedGpuCall.ts` (create)
- `src/services/loading/volume/loadVolumePyramid.ts` (create)
- `tests/services/loading/volume/loadVolumePyramid.test.ts` (create)

**Contract.**

```ts
// src/utils/gpu/scopedGpuCall.ts
/**
 * Runs `call` synchronously inside a validation and an out-of-memory error scope and pops both
 * before returning; the promise rejects with the first error. Never hold a scope across an await:
 * scopes belong to the device and would catch the render loop's errors from frames in between.
 */
export function scopedGpuCall(device: GPUDevice, call: () => void): Promise<void>;

// src/services/loading/volume/loadVolumePyramid.ts
export function loadVolumePyramid(
  device: GPUDevice,
  req: { readonly binBaseName: string; readonly baseLevel: 1 | 2 },
  signal: AbortSignal,
  onProgress: (loaded: number, total: number) => void,
): Promise<GpuVolume>;
```

Behaviour, in order:

1. `fetch(dataUrl(`${VOLUME_PYRAMID_DATA_PREFIX}/${binBaseName}.json`), { signal })`; a non-2xx
   throws `HttpError` (so `defaultRetryPolicy` gives up on a 404 at once, retries a 5xx twice).
2. `pickVolumePyramidFormat(device.features)`, `volumePyramidLevels`, `volumePyramidPlacement`.
3. Create the texture inside `await scopedGpuCall(...)`: base dims, `mipLevelCount = 4 − base`,
   `dimension: '3d'`, the row's `gpuFormat`, `TEXTURE_BINDING | COPY_DST`, label
   `density-volume-${binBaseName}`.
4. Levels **coarse to fine**, one at a time: fetch the level file (`HttpError` on non-2xx; a
   missing `body` throws), then `streamLevelSlabs` with one `new Uint8Array(VOLUME_UPLOAD_SLAB_BYTES)`
   allocated per load. Each `writeSlices` pushes `scopedGpuCall(device, () => writeTexture(...))`
   onto a list without awaiting it:
   - destination `{ texture, mipLevel: mip, origin: { x: 0, y: 0, z: zOffset } }`;
   - layout `bytesPerRow = w · blockEdge · bytesPerTexel`, `rowsPerImage = h / blockEdge`;
   - size `{ width: w, height: h, depthOrArrayLayers: sliceCount }`;
   - `sliceBytes = levelByteLength(w, h, 1, bytesPerTexel)`.
5. `onProgress(loaded, total)` counts decoded bytes; `total` is the sum of the levels'
   `byteLength`.
6. `await Promise.all(writeChecks)`, then return `{ texture, placement, gain, nativeBox }`. No frame
   can sample a level still being filled, because the slot commits only what this returns.
7. On any throw, abort included: destroy the texture if it exists, rethrow.

The largest write target is MCPM r8 L1 (62.7 MB); Dawn clears a whole 3D level through one staging
buffer of that size before its first partial write, under the 256 MiB default `maxBufferSize`, so no
limit is raised (one comment line).

Steps:

- [x] Tests, with `fetch` stubbed per URL (a `ReadableStream` body), `dataUrl` mocked, and a mock
      device whose `features` is empty (so r8) and whose `popErrorScope` resolves `null` unless a
      test says otherwise. Tiny sidecar: box dims 16×16×8 at base 1, so L1 8×8×4, L2 4×4×2,
      L3 2×2×1.
  - `levels arrive coarse to fine, each into its own mip, and the volume returns after every write
    check`: fetch order sidecar, L3, L2, L1; `writeTexture` mips 2, 1, 0; texture created with
    `mipLevelCount` 3 and label `density-volume-<id>`; the promise is still pending while one
    write's `popErrorScope` is unresolved.
  - `a level of the wrong length throws and destroys the texture`.
  - `an abort mid-level destroys the texture and rethrows the AbortError`.
  - `a validation error on one write throws and destroys the texture`.
  - `a 404 sidecar throws HttpError before any texture exists`.
- [x] Implement. `npm run typecheck:fast`; `npm test -- loadVolumePyramid streamLevelSlabs`.

**Commit:** `loadVolumePyramid: a sidecar, one texture, levels streamed coarse to fine`

**Done when:** a pyramid loads into one finished texture or throws with nothing left on the GPU.

---

## Task 10: The pyramid builder; the old builder and `--clamp` go

**review: yes** (binary output format, the crop guard)

**Files:**
- `tools/@types/volumes/VolumePyramidFieldRow.d.ts` (create)
- `tools/volumes/data/volumePyramidFields.ts` (create)
- `tools/volumes/utils/encodeVolumeLevel.ts` (create)
- `tools/volumes/utils/basisuEncodeLevel.ts` (create)
- `tools/volumes/buildVolumePyramid.ts` (create)
- `tests/tools/volumes/utils/encodeVolumeLevel.test.ts` (create)
- `package.json` (modify: `build-mcpm` `:46`; add `build-2mrs`)
- `tools/deploy/r2/dataFamilies.ts` (modify: add the `volume-pyramid` row)
- `tests/tools/deploy/r2/dataFamilyOf.test.ts` (modify: add cases)
- `tools/utils/io/rawDataRegistry.ts` (modify: `polyphorm.dir` description names the new consumer)
- `tools/volumes/extractPolyphormExport.py` (modify: print the native stats once, before the cascade)
- `tools/volumes/extractMcpmCube.py` (modify: `:38` names `buildVolumePyramid.ts`)
- `tools/volumes/buildRhizomeVolume.ts` (modify: delete `zeroBelowThreshold` `:26-36`, the `clamp`
  argument `:55-63`, `:143-145`, the CLI flag `:203-211` and its usage text `:177`; reword the
  comments that cite `buildMcpmVolume` at `:8`, `:27`, `:82`, `:141`)
- `tests/tools/buildRhizomeVolume.smoke.test.ts` (modify: delete the `--clamp` case `:246`; header
  `:3-5`), `tests/tools/buildDustVolume.smoke.test.ts` (modify: header `:3-5`)
- delete: `tools/volumes/buildMcpmVolume.ts`, `tests/tools/buildMcpmVolume.smoke.test.ts`,
  `tests/data/mcpmAnchors.test.ts`
- `docs/BACKLOG.md` (modify: one line added, below)

**Contract.**

```ts
// tools/@types/volumes/VolumePyramidFieldRow.d.ts
export type VolumePyramidFieldRow = {
  /** The source row's `binBaseName`, read from it (MCPM_ENTRY.binBaseName), never retyped. */
  readonly id: string;
  /** `<rawDataPath(dir)>/<stem>_d{2,4,8}.npy`, C-order (x slowest). */
  readonly npy: { readonly dir: RawDataKey; readonly stem: string };
  /** levelMax[0]: the d2 file cannot know the native peak. */
  readonly nativePeak: number;
  readonly gridDims: Vec3;
  readonly voxelMpc: number;
  readonly originMpc: Vec3;
  readonly frame: ScalarFieldFrameKind;
  readonly dataBox: { readonly originVox: Vec3; readonly dims: Vec3 };
  readonly zeroBelowRaw: number;
};

// tools/volumes/utils/encodeVolumeLevel.ts
/** One r8 level: crop `box` out of a whole block-mean level (C-order, x slowest), zero raw values
 *  below `zeroBelowRaw`, code round(255 · log1p(v) / log1p(encodeMax)) clamped to 0..255, x fastest. */
export function encodeVolumeLevel(
  values: Float32Array | Float64Array,
  levelDims: Vec3,
  box: { readonly originVox: Vec3; readonly dims: Vec3 },
  encodeMax: number,
  zeroBelowRaw: number,
): Uint8Array;

// tools/volumes/utils/basisuEncodeLevel.ts
/** One r8 level through basisu as a 2D array of grey z-slices; returns the headerless blocks. */
export function basisuEncodeLevel(
  r8: Uint8Array, dims: Vec3, format: 'astc6' | 'bc4',
): Promise<Uint8Array>;
```

`VOLUME_PYRAMID_FIELDS: Readonly<Record<'mcpm' | 'polyphorm-2mrs', VolumePyramidFieldRow>>`, keyed
by the CLI argument:

| Member | `mcpm` | `polyphorm-2mrs` |
| --- | --- | --- |
| `id` | `MCPM_ENTRY.binBaseName` | `POLYPHORM_2MRS_ENTRY.binBaseName` |
| `npy` | `{ dir: 'mcpm.dir', stem: 'mcpm_sdss' }` | `{ dir: 'polyphorm.dir', stem: 'polyphorm_2mrs' }` |
| `nativePeak` | 134143.296875 | 11272 |
| `gridDims` | 712, 1200, 728 | 1200, 752, 960 |
| `voxelMpc` | 0.78131 | mean of 1469.05/1200, 920.605/752, 1175.24/960 (= today's large header 2.44841695 / 2) |
| `originMpc` | centre (−239.469, −16.5618, 201.275) − ½ · gridDims · voxel (`buildMcpmVolume.ts:56-60`) | centre (21.2736, 21.0657, 36.8793) − ½ · size (1469.05, 920.605, 1175.24) |
| `frame` | `'equatorial-cartesian'` | `'equatorial-cartesian'` |
| `dataBox` | origin 40, 40, 40; dims 672, 1152, 648 | origin 352, 120, 208; dims 480, 480, 464 |
| `zeroBelowRaw` | 0 | `Math.expm1(0.2 * Math.log1p(6090))` = 4.71397 |

Keep each derivation in code (the expression, one comment line naming its source: the export's
`export_metadata.txt`, and today's `--clamp 0.2` on the d2 tier normalised by its own peak 6090).

**`buildVolumePyramid.ts <field>`**, in order:

1. Read the three `.npy` through `rawDataPath(row.npy.dir)`; each shape must be `gridDims >> k`.
   `levelMax[k]` (k = 1..3) is the whole level's peak; `levelMax[0] = nativePeak`.
2. **Guard**, before any encode; a failure throws and prints the numbers:
   - crop rule: `originVox` a multiple of 8; x and y dims multiples of 96, z a multiple of 8; the box
     inside the grid;
   - loss: of L1's voxels with code > 86 over the whole grid, at most 0.1% outside the box (print
     the loss either way; spec: MCPM none, 2MRS 0.035%).
3. Per level k = 1..3: `encodeVolumeLevel(level k, gridDims >> k, box >> k, nativePeak,
   zeroBelowRaw)` → the r8 bytes.
4. ASTC and BC4 through `basisuEncodeLevel`: grey PNG per z-slice (pngjs, as `renderCubeMips.ts`
   uses), file names zero-padded so the shell order is z order, into an `mkdtemp` folder removed
   afterwards. Flags verbatim:
   - BC4: `basisu -dds -dds_format BC4 -linear -tex_type 2darray <slices…> -output_file <f>.dds`;
     payload from byte 148 (the DX10 DDS header).
   - ASTC: `basisu -ldr_6x6 -tl -effort 3 -ktx2_no_zstandard -tex_type 2darray <slices…>
     -output_file <f>.ktx2`; level 0's byte offset and length are the u64 pair at byte 80 of the
     KTX2 level index.
   - basisu writes a valid block everywhere; never hand-fill a block (an all-zero ASTC block is an
     error block).
   - basisu missing: throw with "install with `brew install basis_universal` (v2.50.0)"; print the
     version line it reports.
5. Every level of every format: its length must equal
   `levelByteLength(dims, TEXTURE_BYTES_PER_TEXEL[gpuFormat])`, or throw.
6. Write `public/data/${volumePyramidLevelPath(id, format, k)}` and the sidecar
   `public/data/${VOLUME_PYRAMID_DATA_PREFIX}/${id}.json` (a `VolumePyramidSidecar`).
7. Print one table: per level, dims and bytes per format; levelMax; the guard's loss; seconds per
   encode.

**Scripts.** `"build-mcpm": "tsx tools/volumes/buildVolumePyramid.ts mcpm && npm run build-data-manifest"`,
`"build-2mrs": "tsx tools/volumes/buildVolumePyramid.ts polyphorm-2mrs && npm run build-data-manifest"`.

**Deploy row** (`dataFamilies.ts`, after `scalar-field`):

```ts
{ label: 'volume-pyramid', dir: 'volume-pyramid/v1',
  fileName: /^[a-z0-9-]+\.(?:json|(?:astc6|bc4|r8)\.L[1-3]\.bin)$/,
  transport: 'wrangler', gzipOnWire: true },
```

It matches by folder, so the regex names no field. The `scalar-field` regex is Task 13's.

**Backlog line** (Rendering, beside "Surface-tile archive leftovers"; true from this commit, which
makes `build-2mrs` depend on files only the owner's machine holds):

`- [ ] **Mirror the 2MRS volume inputs to R2** \`needs-design\` — \`build-2mrs\` reads
\`polyphorm_2mrs_d{2,4,8}.npy\`, which only the owner's machine has (the native Polyphorm export
lives outside the repo); the d2 file (~430 MB) is over wrangler's cap, so MCPM's Extra-files route
does not fit as it is.`

Steps:

- [x] `encodeVolumeLevel.test.ts`, hand-computed, `encodeMax = e − 1` so `log1p(encodeMax) = 1`
      and a code is `round(255 · log1p(v))`:
  - `crops the box and reorders C-order to x fastest`: a 3×2×2 level, box origin (1,0,0) dims
    (2,2,2); output index `x + 2·(y + 2·z)` holds input `[(x+1)·4 + y·2 + z]`.
  - `codes against encodeMax, not the level's own peak`: a level whose own peak is `e^0.4 − 1`
    codes that peak 102 (255 · 0.4), not 255.
  - `rounds to nearest`: `v = e^0.2494 − 1` → 64 (255 · 0.2494 = 63.6; truncation would give 63).
  - `zeroes raw values below the threshold, keeps the rest`: threshold 0.1; 0.05 → 0 (it would
    code 12), 0.2214 (`e^0.2 − 1`) → 51.
  - `clamps above encodeMax to 255`.
- [x] `dataFamilyOf.test.ts`: `volume-pyramid/v1/mcpm.astc6.L1.1a2b3c4d.bin` and
      `volume-pyramid/v1/polyphorm-2mrs.json` are tracked as `volume-pyramid`; a level name outside
      that folder is not.
- [x] Row type, rows, `encodeVolumeLevel`, `basisuEncodeLevel`, the builder, scripts, deploy row,
      registry text, the extractor's print line.
- [x] Delete the old builder and its two tests; strip `--clamp` from `buildRhizomeVolume.ts` and
      its test; reword the comments named above. Grep `buildMcpmVolume`, `MCPM_TIER_FILENAME`,
      `mcpmTierAnchors`, `--clamp`: nothing outside `completed/`, `docs/research/` and
      `docs/grill-sessions/` (history stays).
- [x] Do **not** run the builder: it needs the owner's data and basisu (Task 12).
- [x] `npm run typecheck`; `npm test -- encodeVolumeLevel dataFamilyOf buildRhizomeVolume buildDustVolume`.

**Commit:** `buildVolumePyramid: MCPM and 2MRS as ASTC, BC4 and r8 level files; the tiered builder goes`

**Done when:** `npm run build-mcpm` and `npm run build-2mrs` are the pyramid, nothing builds a
tiered density `.scfd`, and the manifest step will hash the new files.

---

## Task 11: Renderer and shader — mips, gain, native box

**review: yes** (shader; TS↔WGSL uniform layout)

On today's `.scfd` this changes no pixel (gain 1, one mip, identity box), so it lands before the
runtime switch and is checked alone.

**Files:**
- `src/services/gpu/renderers/volumeField/volumeFieldRenderer.ts` (modify: `UNIFORM_BYTES` `:32`,
  the sampler `:92-98`, the layout comment `:359-377`, the scratch writes `:378-428`)
- `src/services/gpu/shaders/scalarVolume/fragment.wesl` (modify: the struct `:32-93`, the march
  `:197-323`)
- `tests/services/gpu/renderers/volumeField/volumeUniformsLayout.parity.test.ts` (modify)

**Uniforms: 272 → 304 bytes; offsets 0–259 unchanged.**

| Offset | Member (WGSL) | Type | Scratch index | Value |
| --- | --- | --- | --- | --- |
| 260 | `gain` | f32 | 65 | `volume.gain` |
| 264 | `maxLod` | f32 | 66 | `volume.texture.mipLevelCount − 1` |
| 268 | `baseVoxelMpc` | f32 | 67 | `volume.placement.voxelSize` |
| 272 | `nativeBoxOffset` | vec3<f32> | 68–70 | `volume.nativeBox.offset` |
| 284 | (implicit pad) | | 71 | 0 |
| 288 | `nativeBoxScale` | vec3<f32> | 72–74 | `volume.nativeBox.scale` |
| 300 | (implicit pad to 304) | | 75 | 0 |

No explicit pad members in WGSL: vec3 alignment puts the two vectors at 272 and 288 by itself,
and the parity test demands a sentinel for every declared member. `vertex.wesl`'s prefix is
unchanged.

**Shader, per ray** (after `intersectUnitAabb`, outside the step loop):

```wgsl
let lodOffset = log2(length((uniforms.modelMatrix * vec4<f32>(rayDirLocal, 0.0)).xyz)
                     / (uniforms.cam.pxPerRad * uniforms.baseVoxelMpc));
let stepScale = length(uniforms.nativeBoxScale * rayDirLocal);
```

**Per step:**

```wgsl
let lod = clamp(log2(max(rayDistance, 1e-6)) + lodOffset, 0.0, uniforms.maxLod);
let sampleValue = min(textureSampleLevel(volume, volumeSampler, samplePos, lod).r * uniforms.gain, 1.0);
// envelope at uniforms.nativeBoxOffset + samplePos * uniforms.nativeBoxScale; alpha *= stepScale
```

- Both keep today's native-grid units, so a cropped box looks like the whole grid; the march spans
  only the stored box, so 128 steps now cover the cropped chord.
- `rayDistance` is local distance from the camera along the normalised local direction, so
  `rayDistance · length(M · dir)` is world distance; `pxPerRad` is already the 1/3-scale target's.
- Price (feedback: count reads): texture sample calls per step stay 2 (volume, palette); volume
  taps 8, or 16 where `lod` falls between levels; added ALU per step `log2`, add, clamp, mul,
  `min`; per ray two `length` and one `log2`. No added fetch.
- The sampler gains `mipmapFilter: 'linear'`.
- The comment at `fragment.wesl:226-233` ("our 3D texture has only one mip level anyway") is
  rewritten: the LOD is now the pixel footprint in base voxels. Bring the comments you touch under
  budget (comments.md); the file is over it today.

Steps:

- [ ] Parity test: the fake volume's texture has `mipLevelCount: 4` (sentinel 3 for `maxLod`), the
      placement's `voxelSize` 7 is `baseVoxelMpc`'s sentinel, `gain` 417, offset (411, 412, 413),
      scale (414, 415, 416); `struct.size` is 304.
- [ ] Renderer, shader, sampler.
- [ ] No other new test: the image checks are the controller's.
- [ ] `npm run typecheck:fast`; `npm test -- volumeField volumeUniformsLayout`.
- [ ] Controller, after the commit: the MCPM inside pose on today's `.scfd` matches main (RMS ≤ 0.1
      of 255), with no WGSL error in the console.

**Commit:** `Volume march reads mips by pixel footprint, scales by the level gain, keeps native units`

---

## Task 12 (controller): build both pyramids on the owner's machine

No commit: every output is gitignored. Runs while D5 works. **Stop and report on any missing tool
or input; never fake, synthesise or substitute data.** In particular, never use the owner's newer
export `/Users/rulkens/Polyphorm/export/2026-11-25_16-14-57/` (a different stochastic run).

**Needs the owner's machine** (checked 2026-11-26, all present):

| Need | Where | Check |
| --- | --- | --- |
| `basisu` v2.50.0 | Homebrew `basis_universal`, `/opt/homebrew/bin/basisu` | `basisu -version` prints v2.50.0; installing it is the owner's step |
| Python 3 with numpy | system `python3` (numpy 2.4.4) or the repo `.venv` | `python3 -c "import numpy"` |
| MCPM inputs | main checkout `/Users/rulkens/Development/js/skymap/data/raw/mcpm/mcpm_sdss_d{2,4,8}.npy` | 311,001,728 / 38,875,328 / 4,859,528 B |
| 2MRS native export | `/Users/rulkens/Development/vendor/cpp/Polyphorm/bin/export/2026-08-13_13-33-58/` | `trace.bin` 1,732,608,000 B and `export_metadata.txt` (1200 × 752 × 960) |

Steps:

1. `caffeinate -dims` in the background for the run.
2. **2MRS inputs, into main's raw folder** (a worktree's `data/raw/` real files are deleted with the
   worktree), from the feature worktree so Task 10's print line runs:
   `python3 tools/volumes/extractPolyphormExport.py /Users/rulkens/Development/vendor/cpp/Polyphorm/bin/export/2026-08-13_13-33-58 /Users/rulkens/Development/js/skymap/data/raw/polyphorm/polyphorm_2mrs`.
   About 3.5 GB of RAM; writes about 495 MB (d2 433 MB). The printed maxima must read native 11272,
   d2 6090, d4 2702.28, d8 1187.88; otherwise stop.
3. **Reach the inputs from the worktree** with per-file symlinks (DATA.md: never a directory
   symlink, the READMEs stay committable): `data/raw/mcpm/mcpm_sdss_d{2,4,8}.npy` and
   `data/raw/polyphorm/polyphorm_2mrs_d{2,4,8}.npy`, each pointing at main's file.
4. **`public/data`:** the worktree links main's (`/link-data`), so the feature server has today's
   `.scfd` (Tasks 1 and 11 checks) and the new files. The builder writes into main's
   `public/data/volume-pyramid/v1/` under logical names; `build-data-manifest` skips a linked
   folder, and the dev server serves the unhashed names (the manifest's identity fallback). Main's
   app never reads them; the owner's post-merge build replaces them.
5. `npm run build-mcpm`, then `npm run build-2mrs`, in the feature worktree. Record the printed
   tables in the ledger. Every byte count must equal the spec's §4 table and the guard must pass
   (MCPM loss 0, 2MRS about 0.035%); a mismatch stops the run.
6. `ls -l` the 20 files: lengths as §4; the sidecars' `levelMax[0]` read 134143.296875 and 11272.

**Done when:** `public/data/volume-pyramid/v1/` holds `mcpm.json`, `polyphorm-2mrs.json` and 18
level files whose lengths match §4.

---

## Task 13: Runtime switch — `storage`, base-level table, fetcher dispatch

**Files:**
- `src/@types/data/volume/CosmicWebDensitySourceEntry.d.ts` (modify: `tiered` → `storage`, and
  the header's "each loaded from its own `.scfd` file")
- `src/layers/cosmicWebDensity/sources/mcpm.ts`, `polyphorm-2mrs.ts`, `mcpm-workbench.ts` (modify)
- `src/layers/cosmicWebDensity/densityCubes/@types/CosmicWebDensityReq.d.ts` (modify)
- `src/layers/cosmicWebDensity/densityCubes/data/densityBaseLevelByTier.ts` (create)
- `src/layers/cosmicWebDensity/densityCubes/load/cosmicWebDensityAssetRows.ts` (modify: `req`
  `:26-31`)
- `src/layers/cosmicWebDensity/densityCubes/load/createCosmicWebDensityFetcher.ts` (modify)
- `tests/layers/cosmicWebDensity/densityCubes/load/cosmicWebDensityAssetRows.test.ts` (modify)
- `tests/layers/cosmicWebDensity/densityCubes/load/createCosmicWebDensityFetcher.test.ts` (modify:
  delete the tiered case)
- `tools/deploy/r2/dataFamilies.ts` (modify: the `scalar-field` regex `:38-39`)
- `tests/tools/deploy/r2/dataFamilyOf.test.ts` (modify: `:40-41`)
- `docs/BACKLOG.md` (modify: delete one line, add one)

**Contract.**

```ts
// CosmicWebDensitySourceEntry: `tiered: boolean` becomes
/** 'pyramid': `volume-pyramid/v1/` sidecar + level files, base level by tier.
 *  'scfd': one SCFD v3 cube at every tier. */
readonly storage: 'pyramid' | 'scfd';   // mcpm, polyphorm-2mrs: 'pyramid'; mcpm-workbench: 'scfd'

// CosmicWebDensityReq.d.ts
export type CosmicWebDensityReq =
  | { readonly storage: 'pyramid'; readonly binBaseName: string; readonly baseLevel: 1 | 2 }
  | { readonly storage: 'scfd'; readonly binBaseName: string };

// densityBaseLevelByTier.ts
export const DENSITY_BASE_LEVEL_BY_TIER = { small: 2, medium: 1, large: 1 } as const satisfies Record<Tier, 1 | 2>;
```

- The asset row builds the request from the row and the tier. Medium and large make equal
  requests, so a switch between them reloads nothing (`sameRequest`, flat values only).
- The fetcher dispatches through a `Record` keyed by `storage`:
  `pyramid → loadVolumePyramid(device, req, …)`, `scfd → loadScfdVolume(device, req.binBaseName, …)`.
  It typechecks without `as` (a mapped record over the request union plus a generic dispatch
  function, the standard correlated-union pattern).
- `scalar-field` regex: `/^(?:edenhofer-dust-(small|medium|large)\.scfd|mcpm-workbench\.scfd)$/`.
- **Backlog**: delete "`createTieredScfdFetcher` factory" (`BACKLOG.md:111`): its premise, a tiered
  SCFD fetcher to share, is gone. Add beside "Surface-tile archive leftovers":

  `- [ ] **Prune the six tiered volume \`.scfd\` from R2** \`process\` — not before
  <deploy date + 1 month>: delete every hashed \`mcpm-{small,medium,large}\` and
  \`polyphorm-2mrs-{small,medium,large}\` \`.scfd\` under \`scalar-field/v3/\`; sync never deletes,
  and tabs opened before the deploy read them until then.`

  The date stays the placeholder until the landing step writes it.

Steps:

- [ ] Asset-rows test, replacing today's case:
  - `medium and large ask for the same pyramid level; small asks for level 2`: MCPM's `req` gives
    `{ storage: 'pyramid', binBaseName: 'mcpm', baseLevel: 1 }` at medium and large and
    `baseLevel: 2` at small.
  - `the workbench row asks for its .scfd at every tier`: `{ storage: 'scfd', binBaseName:
    'mcpm-workbench' }`, no other key.
- [ ] Fetcher test: the scfd case stays (URL `…/mcpm-workbench.scfd`); delete the tiered case.
- [ ] `dataFamilyOf.test.ts`: `mcpm-small.scfd` and `polyphorm-2mrs-medium.a3f19c2e.scfd` are no
      longer tracked; `mcpm-workbench.scfd` and an `edenhofer-dust-*` name still are.
- [ ] Grep `tiered`, `binBaseName}-${`: no density path is left.
- [ ] `npm run typecheck:fast`; `npm test -- cosmicWebDensity dataFamilyOf`.

**Commit:** `MCPM and 2MRS load from the volume pyramid; the tiered density path goes`

---

## Task 14: Docs

**Files:** `docs/DATA.md`, `docs/RENDERER.md`, `data/raw/mcpm/README.md`, `ATTRIBUTIONS.md`
(`:911-913`), `docs/science.md` (`:43`). No test.

- **`docs/DATA.md`:**
  - format table: a row for the volume pyramid: JSON sidecar plus headerless level files, version
    by folder, authority `VolumePyramidSidecar.d.ts` and `volumePyramidFormats.ts`;
  - layout list: `volume-pyramid/v1/` (`<id>.json`, `<id>.<astc6|bc4|r8>.L<1..3>.bin`); `mcpm-*` and
    `polyphorm-2mrs-*` out of `scalar-field/v3/`;
  - "Cosmic-web volumes" rewritten: the inputs (`mcpm_sdss_d*`, `polyphorm_2mrs_d*` from the export
    folder `2026-08-13_13-33-58`), mean first then log against the native peak, the crop rule and
    its guard, the 2MRS raw threshold, `build-mcpm` and `build-2mrs`, basisu as a maintainer tool
    (`brew install basis_universal`, v2.50.0, the two flag sets), and that the 2MRS inputs exist
    only on the owner's machine (backlogged);
  - the refresh-orders table gains a row for each volume.
- **`docs/RENDERER.md`:** a density-volume bullet (the `GpuVolume` value and who owns it, the
  format choice, per-sample LOD and gain, the native box), and the landmines: the `-sliced-3d`
  features; block-multiple base dims; Dawn's whole-level clear through one staging buffer;
  all-zero ASTC blocks are error blocks; never sample a partly written level; error scopes per
  synchronous call, never across an `await`.
- **`data/raw/mcpm/README.md`:** step 4 builds the pyramid; the outputs are
  `volume-pyramid/v1/mcpm.*`.
- **`ATTRIBUTIONS.md:911-913`:** the 2MRS route is `extractPolyphormExport.py` →
  `data/raw/polyphorm/` → `buildVolumePyramid.ts`.
- **`docs/science.md:43`:** "downsampled into three tiers … (buildMcpmVolume.ts)" → stored as a
  half-res compressed mip pyramid, log-compressed at build time (`buildVolumePyramid.ts`).
- **Website** (`packages/website/src/content/docs/data/pipeline.mdx:93,131`): not this task. The
  controller writes options through the `copy` skill, the owner picks, the controller applies the
  pick inline (one commit, `Docs: the density field is a mip pyramid`).

Steps:

- [ ] Edit as above; plain sentences, the file's own density.
- [ ] Grep the docs for `mcpm-small`, `three tiers`, `buildMcpmVolume`, `--clamp 0.2`: only
      history (`completed/`, `docs/research/`, `docs/grill-sessions/`) keeps them.

**Commit:** `Docs: the volume pyramid, its build and its landmines`

---

## Task 15 (controller): acceptance checks 1–13

No commit except the ledger. Every scratch patch is local, **never committed**, and carries
`// delete when Task 15 is done`.

**Servers** (every tool call passes `--url` for its server; a worktree run without it measures
another branch):

| Server | What | Notes |
| --- | --- | --- |
| Spike | `http://localhost:5175` | the owner's running dev server, worktree `volume-progressive-octree`. **Read-only: never edit, restart or patch it.** URL: `?vbase=today&tier=large&vcube=FULL@<fmt>&vtop=1&vnorm=tier&vcube2=TWOMRS@<fmt>&vtop2=1&vnorm2=tier` |
| Main | a scratch `git worktree add --detach … e41e5d89a`, `node_modules` and `public/data` symlinked to main's, its own port | today's tiers; switch tier in Settings (`?tier=` does not stick) |
| Feature | this branch's worktree, its own `npm run dev` port | `public/data` linked as in Task 12 |

**Poses**, with `layers=-survey,-structureRing,-cosmicWebFilaments,-zoneOfAvoidance,-starCatalog,-milkyWayDisk,-label`:

| Name | Pose |
| --- | --- |
| MCPM inside | `#pose=a,-239.45,-16.5,201.3,0.5,0.3,30,0` |
| MCPM outside / far | `#pose=a,-239.45,-16.5,201.3,0.5,0.3,600,0` / `…,2000,0` |
| MCPM knot | `#pose=a,-132.82,18.99,67.28,0.5,0.3,20,0` |
| 2MRS inside | `#pose=a,21.27,21.07,36.88,0.5,0.3,30,0` |
| 2MRS dense | `#pose=a,43.3,38.2,44.2,0.5,0.3,60,0` |
| 2MRS outside / far | `#pose=a,21.27,21.07,36.88,0.5,0.3,600,0` / `…,2000,0` |

**Run rules.** `caffeinate -dims` for every run. Each measuring run is time-boxed to about 30
minutes, one pass; a run that overruns stops and reports what it has. Captures (shots, heap
snapshots, traces) stay under 200 MB in total across all runs, deleted once their numbers are in
the ledger. Timing is reported in ms per frame and fps first, percent only after. Measuring agents
may take groups (1, 2, 5, 12 · 3, 4, 6, 11 · 7, 8 · 9, 10); 13 is the owner's.

**Formats.** ASTC is native on the Mac. BC4 and r8 come from one scratch patch in
`loadVolumePyramid` that filters the feature set it passes to `pickVolumePyramidFormat` (drop
ASTC → BC4; drop both → r8).

**Timing rig (#1175's wall-clock bench).** A scratch patch draws each field `K` times inside the
renderer's field loop; boot `?perf`, `setStrategy('merged')`, `setPose`, 240 rAF deltas per run.
Controls before any number is quoted: the no-op floor (`layers=-cosmicWebDensity`), K-doubling
(`T(16) − T(off) ≈ 2·(T(8) − T(off))` within 15%), ≥ 5 rounds with median and spread. Per-draw cost
is `(T(K) − T(off)) / K`. Paired A/B, alternating, never all-A then all-B.

| # | Check | How it is measured | Pass bar | Kind |
| --- | --- | --- | --- | --- |
| 1 | GPU bytes | DebugPanel Memory rows `density-volume-mcpm` and `density-volume-polyphorm-2mrs` at medium (base L1) and small (base L2), per format; and `ls -l` of each level file | equal to spec §4 to the byte (MCPM base L1: ASTC 31,788,288, BC4 35,761,824, r8 71,523,648; base L2: 3,919,104 / 4,408,992 / 8,817,984; 2MRS base L1: 6,774,400 / 7,621,200 / 15,242,400; base L2: 835,200 / 939,600 / 1,879,200), and no fallback warning | number |
| 2 | Payload | r8: a scratch script compares each of our L1–L3 with the spike's `data/raw/volume-spike/cubes/FULL.r8.bin` / `TWOMRS.r8.bin` (offsets from `FULL.json` / `TWOMRS.json`) on the overlapping region. ASTC and BC4: a scratch patch keeps basisu's containers; decode with `basisu -unpack` and score `rms_visible` against r8 exactly as the spike's `tools/spike/build-scripts/dense-mips/d06_codec_eval.py` (the reference definition) | r8 byte for byte on the overlap; `rms_visible` ≤ 4.0 (ASTC), ≤ 3.5 (BC4). A byte mismatch halts and goes to the owner with the count and whether every one is ±1 at an f32/f64 rounding boundary | number |
| 3 | Image vs main's large | shots, feature vs main at large, MCPM inside and knot, 2MRS inside and dense, each format | ASTC and BC4: mean shift within −1.2..+0.5 of 255, RMS ≤ 4.6; r8 RMS ≤ 0.6 | number (pairs kept for the owner's set) |
| 4 | Image vs the spike | same format and pose, feature vs spike; F = RMS of the spike's tier path vs main at that pose | RMS ≤ F + 0.2 | number |
| 5 | 2MRS crop | a scratch r8-only 2MRS build with the box = the whole grid (1200 × 752 × 960 is a multiple of 8, so r8 needs no padding; crop guard patched off), served under a scratch id; shots at 2MRS outside and far vs the cropped r8 | RMS ≤ 0.2 (outside) and ≤ 0.05 (far) | number |
| 6 | Far brightness | MCPM outside and far, feature vs main's large: mean-luminance ratio | no threshold; the owner rules on the pair | both (ratio + dash check) |
| 7 | Per-draw cost | the timing rig, feature at large, MCPM inside / outside / far / knot and 2MRS inside / outside / far, ASTC and BC4. The spike cannot take the bench patch (read-only), so the bar is the spec's rows; main's large is measured in the same rounds as the rig's control and must land within 15% of the spike session's own "today" numbers (inside 0.59–0.65 ms), or the comparison goes to the owner instead of pass/fail | ≤ 1.10 × the spike rows: MCPM ASTC 0.400 / 0.575 / 0.125 / 0.375 ms; BC4 0.400 / 1.25 / 0.15 / 0.425; 2MRS ASTC 0.375 / 0.363 / 0.163 | number |
| 8 | Medium and small vs today | timing rig while moving (auto-rotate): medium feature vs main's medium on the Mac; small feature vs main's small on the OnePlus (`npm run phone`, HTTPS dev server per its README); `npm run phone -- net` records which format's files the phone fetched | ≤ 1.10 ×; a breach halts and goes to the owner. Phone not attached: owed, in the ledger and the PR body | number |
| 9 | Load time | `npm run loadtime -- --profile slow-4g --profile fast-4g --link '<MCPM inside pose + layers>'`, main vs feature, `loaded` in s; plus medium's gzip-6 wire bytes, L1–L3 of both fields vs today's two `-medium.scfd` (loadtime's phone viewport only reaches small) | no bar; shown to the owner | both |
| 10 | CPU | a scratch CDP script on the feature server: cold load at medium, `Runtime.getHeapUsage` every 10 ms during the volume loads (the pre-load level subtracted); then one heap snapshot after the load | peak ≤ 10.5 MB held; no `Uint16Array` ≥ 1 MB and no `voxels`-bearing object reachable from the density slots | number |
| 11 | Fallback | ASTC dropped: BC4 loads and passes check 3. Both dropped: r8 loads (check 1's r8 bytes). One level file missing: a Playwright `page.route` answers `polyphorm-2mrs.astc6.L2*` with 404 (no file is touched) | one console warning, 2MRS absent, MCPM drawn, the frame counter never stalls, no GPU validation error | number |
| 12 | Headless | `npm run shot` at MCPM inside on the feature server, through the shot tool's SwiftShader path (`tools/shot/README.md`); a scratch log of `device.features` and the level files fetched | the format SwiftShader picks is recorded; the shot shows the volume, r8 included | number (recorded fact) |
| 13 | Tier switch | small → medium → large → small in the app (Settings), at MCPM inside | no flash to empty between tiers; after the return to small the Memory rows show only small's bytes (no leaked texture) | both (Memory numbers + dash check) |

**Owner set** (one dash ask, one check per item, before LEFT and after RIGHT, one section or a 1:1
crop each): check 3's MCPM inside and 2MRS dense pairs at ASTC, check 6's two far pairs, check 13,
and the website copy options of Task 14.

**Results** go into the ledger, a "Results" section at the end of this plan, and the PR body.

---

## Risks

- **r8 devices hold more than today.** A device with neither compressed 3D feature runs r8: 86.8 MB
  for both volumes at medium (today 46.5 MB), 10.7 MB at small (today 5.8 MB). Check 12 shows
  whether headless is one of them.
- **Medium now draws half res.** Its per-draw cost can rise; check 8 is the gate (≤ 1.10 ×, else
  the owner rules).
- **Far views may read dimmer.** Coarse levels average before the transfer function. Check 6 shows
  the owner; no threshold is guessed.
- **The large-tier headless switch bug** (`BACKLOG.md:273`) may stop reproducing, since medium ↔
  large no longer reloads the density cubes. It is not fixed here; the backlog line stays.
- **One-machine rebuild of 2MRS.** Until the inputs are mirrored (backlogged), only the owner can
  rebuild `polyphorm-2mrs`.

## Landing and deploy notes (also in the PR body)

- **Before the merge ask:** `/comment-audit`, `deletion-audit`, `/feature-done`; plan, spec and the
  ledger move to `completed/` in the PR (feature-done before merge).
- **At the merge ask:** the controller writes the deploy date + 1 month into the "Prune the six
  tiered volume `.scfd`" backlog line (a placeholder until then) and says so in the PR body.
- **After the merge, the owner, in the main checkout** (agents never run R2 sync):
  1. `npm run build-mcpm` and `npm run build-2mrs` (main already holds `data/raw/polyphorm/` from
     Task 12; each script ends in `build-data-manifest`, which hashes the new files);
  2. `npm run sync-r2-secure`;
  3. the app deploy at once after the sync: until it lands, a fresh visit gets the old app with the
     new manifest and draws no volume. Tabs already open keep their manifest and their volumes.
- **No desktop build ships** (owner, 2026-11-26): kiosks on an older desktop build lose both
  volumes after their next data sync. Accepted known cost.
- **Old files:** the six `.scfd` stay on R2 for a month, then come off by hand (the dated backlog
  line).

## Definition of Done

**Deliverable inventory**
- Types: `GpuVolume` (`texture`, `placement`, `gain`, `nativeBox`), `VolumePyramidSidecar`,
  `VolumePyramidFormat`, `VolumePyramidFormatRow`, `VolumePyramidLevel`,
  `CosmicWebDensitySlotDeps`, `VolumePyramidFieldRow`; `CosmicWebDensityReq` as the two-kind union;
  `CosmicWebDensitySourceEntry.storage` and `.priority`, no `tiered`.
- Data and helpers: `VOLUME_PYRAMID_FORMATS`, `VOLUME_PYRAMID_DATA_PREFIX`,
  `VOLUME_UPLOAD_SLAB_BYTES`, `DENSITY_BASE_LEVEL_BY_TIER`; `levelByteLength`,
  `pickVolumePyramidFormat`, `volumePyramidLevels`, `volumePyramidPlacement`,
  `volumePyramidLevelPath`, `streamLevelSlabs`, `scopedGpuCall`; the ledger rows for
  `astc-6x6-unorm` and `bc4-r-unorm`.
- Loading: `loadScfdVolume`, `loadVolumePyramid`, `createCosmicWebDensityFetcher(device)`; slots
  that dispose a dropped volume's texture; `VolumeFieldRenderer.upload(id, GpuVolume, statics)`
  creating no texture.
- Renderer: 304 B uniforms with `gain`, `maxLod`, `baseVoxelMpc`, `nativeBoxOffset`,
  `nativeBoxScale`; a linear mip filter; per-sample LOD in `fragment.wesl`.
- Initialisation: `initGpu` requests the four compression features.
- Build: `buildVolumePyramid.ts`, `encodeVolumeLevel`, `basisuEncodeLevel`, the two field rows,
  `npm run build-mcpm` (the pyramid) and `npm run build-2mrs`; the native-stats print in
  `extractPolyphormExport.py`.
- Deletions: `buildMcpmVolume.ts` and its two tests; `buildRhizomeVolume --clamp` and its test;
  the tiered fetch path; `PRIORITY`; the hand-listed slots record.
- Deploy: the `volume-pyramid` family row; `scalar-field` without MCPM and 2MRS.
- Docs: spec §9 done (DATA.md, RENDERER.md, `data/raw/mcpm/README.md`, ATTRIBUTIONS.md, science.md,
  the website's `pipeline.mdx` via the owner's pick).
- Backlog: "`createTieredScfdFetcher` factory" deleted; the asset-slot retention item without
  volume voxels; "Mirror the 2MRS volume inputs to R2" and the dated "Prune the six tiered volume
  `.scfd`" added.
- Task 15's results in the ledger, this plan's Results section and the PR body.

**Smoke pass** (the owner's, through the dash; shot with `npm run shot -- '<link>' --url <feature
server>`)
- MCPM inside and knot at large read like main's large (same filaments, same brightness).
- 2MRS inside and dense read like main's large; nothing is missing at the crop's edge from outside.
- MCPM at 600 and 2000 Mpc: the far views' brightness against main's large is acceptable (check 6).
- Tier switch small → medium → large → small: no flash to empty; medium ↔ large loads nothing.
- DebugPanel Memory: `density-volume-mcpm` and `density-volume-polyphorm-2mrs` show §4's bytes.
- One level file missing: that volume is absent with one warning; the other draws.
- `mcpm-workbench` (promoted SCFD) still loads and draws when enabled.

**Deferral boundary (out of scope).** The full-res detail region (PR 4) and anything of its own
(bricks, level 0, camera-centred streaming, fades); HTTP Range requests; own chunk compression; a
format step-down after a failed file; a desktop build; mirroring the 2MRS inputs to R2; pruning the
old files; the dust volume, the flow field, `mcpm-workbench.scfd` and the SCFD test fixture (all
SCFD v3, untouched); the large-tier headless switch bug; any spike panel row or URL knob.
