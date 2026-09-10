# Scene Workbench 2/4 — Gaussian splats

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a second, alpha-blended render pass shows Søndermarken's Brush-trained Gaussian-splat radiance field over the same LiDAR point cloud, in the same metre frame — the whole path from `fetchSkraafoto` through pose recovery, COLMAP staging, `brush-cli`, and `splats.bin` to pixels, with a working splat-scale/opacity display panel and a CPU depth sort.

**Architecture:** Same two-halves shape as plan 1. Offline: `tools/fetch/fetchSkraafoto.ts` pulls STAC items + downsampled JPEGs into `data/raw/skraafoto/`; `tools/scene-recon/bakeSplats.ts` recovers each photo's pose (`topocentricPositionsM` + `photoPoseFromStacItem`), stages a COLMAP known-pose model (`writeColmapModel`, seeded from the already-baked `points.bin`), shells out to `brush-cli`, and packs the trained `.ply` into `public/data/geo3d/groups/soendermarken/assets/splats/splats.bin` via `readGaussianPly` + `packSplats`. Online: a second GPU asset kind (`gaussianSplat`) flows through the ground-prep'd `ASSET_LOADERS` table into a `SplatGpuAsset`; `splatRenderer` draws it as view-aligned Gaussian quads with per-splat covariance projected into screen space, blended over the LiDAR pass's depth buffer; `watchSplatSortSaga` keeps each asset's draw order back-to-front on the main thread.

**Tech Stack:** Same as plan 1 (`@reduxjs/toolkit`, `redux-saga`/`typed-redux-saga`, `react-redux`, Vite + `wesl-plugin`, `tsx` CLIs), plus PROJ's `cct` (already installed, plan 1 task 1) and `brush-cli` (Rust, installed via `cargo install --git https://github.com/ArthurBrussee/brush brush-cli`, new to this plan).

**Spec:** [`docs/superpowers/specs/2026-09-10-scene-workbench-2-splats-design.md`](../specs/2026-09-10-scene-workbench-2-splats-design.md). Parent: [`docs/superpowers/specs/completed/2026-09-02-scene-workbench-design.md`](../specs/completed/2026-09-02-scene-workbench-design.md) §§1–12. As-built precedent: [`docs/superpowers/plans/completed/2026-09-03-scene-workbench-1-lidar-end-to-end.md`](completed/2026-09-03-scene-workbench-1-lidar-end-to-end.md).

**Ground preparation:** spec §3. **Already landed on `main`** as PR #672 (`refactor(scene-workbench): ground prep for the splat layer`, squashed onto `d62fdfc89`) — the `GpuAsset` union + `dispose()` contract, the per-kind `ASSET_LOADERS` table (one row today, `pointCloud: loadPointCloud`), and the device-lifetime `SceneCameraUniform` owned by `Viewport`. Verified as-built against `tools/scene-workbench/src/render/{renderResources,sceneCameraUniform}.ts` and `src/scene/loaders/{assetLoaders,loadPointCloud}.ts` while writing this plan — nothing further to do there. No prep tasks below.

## A necessary resequencing, flagged up front

`SceneAsset` is consumed by two **exhaustive** mapped types that already exist on `main`: `ASSET_LOADERS: Record<SceneAsset['kind'], AssetLoader>` (`tools/scene-workbench/src/scene/loaders/assetLoaders.ts:6`) and this plan's own new `assetCount` table (spec §7.2). `npm run typecheck` runs both the `src` and `tools` tsconfigs together (`CLAUDE.md`), so the **moment** `SceneAsset` grows a `gaussianSplat` member — in _any_ task — `assetLoaders.ts`'s existing one-row object literal stops satisfying its `Record` type and the whole typecheck run goes red, regardless of which file triggered the growth. `bakeSplats` (offline, Node) also needs `GaussianSplatAsset` to be a `SceneAsset` member before it can hand one to the unmodified, kind-agnostic `nextManifest`/`upsertAsset` helpers (spec §6 step 5).

Net effect: the type growth and its loader row cannot be split across tasks the way the brief's task list orders them (type growth _after_ `bakeSplats`, per the brief's "then viewer: (7) GaussianSplatAsset/SceneAsset union…") — `bakeSplats` needs the grown type, and growing the type without the loader row breaks the build. **Task 6 below (originally two later brief items) is moved to sit right before `bakeSplats`**, and folds in everything that must land atomically with the type growth: `GaussianSplatAsset`/`SceneAsset`, `SplatGpuAsset`/`GpuAsset`, `loadGaussianSplat` + its `ASSET_LOADERS` row, `assetCount`, and the `LayerList` swap. Every other task keeps the brief's stated order. See the self-review at the end for the full spec-coverage table.

## Global constraints

- `type` aliases only, never `interface`. One type per file under `tools/scene-workbench/@types/` and `tools/scene-recon/@types/`; one function per file under `tools/utils/**`, `tools/scene-recon/**`, and any `utils/`-shaped folder created here.
- RTK reducer parameters are never named `s` / `a`.
- Every file move/rename goes through `npm run move-files -- <from> <to>` (`-- --manifest <moves.json>` for batches, `--dry` first) — never `git mv` plus hand-edited imports.
- **Secrets.** The skråfoto token lives in the login keychain under service `skymap-dataforsyningen-apikey` (a **separate** credential from `skymap-datafordeler-apikey`, which the DHM/LiDAR bake uses — spec §6). It travels as a `token:` request header for `fetch`/`fetch`-based calls and as the `GDAL_HTTP_HEADERS` environment variable for any `gdal_translate` subprocess — **never** in a URL, a query string, or a log line. Every catch site that might carry the token in an error message or a logged URL passes it through `redactSecret` first (`tools/utils/io/redactSecret.ts`, `tools/fetch/fetchDhm.ts`'s call sites are the precedent).
- No WGSL backticks, no brace-list imports, imports at the top of the file, `package::` prefix — `.claude/skills/wesl-shaders/SKILL.md`.
- Suite + `npm run typecheck` green after every task; `npm run format` over touched files before each commit.
- Baked artifacts stay gitignored (`data/raw/**`, `/public/data/**` already covered). `data/raw/skraafoto/README.md` is committed; `data/raw/skraafoto/<collection>/colmap-<groupId>/` (the bake workdir) is not.
- Byte layouts, WGSL struct offsets, and bind-group tables below are copied verbatim from spec §5/§7.3/§7.4 — treat them as the literal contract, not a paraphrase.

---

### Task 1: `splats.bin` — format, packer, parser

**Files:**

- Create: `tools/scene-recon/pack/splatFormat.ts`, `tools/scene-recon/pack/packSplats.ts`
- Create: `tools/scene-workbench/src/scene/parseSplats.ts`
- Test: `tests/tools/scene-recon/pack/packSplats.test.ts`

**Byte layout (spec §5, verbatim):**

16-byte header:

| Field               | Bytes  | Notes                                         |
| ------------------- | ------ | --------------------------------------------- |
| magic `'SPL3'`      | 4      |                                               |
| `formatVersion` = 1 | u32, 4 |                                               |
| `splatCount`        | u32, 4 |                                               |
| `shDegree` (0 or 1) | u32, 4 | selects whether the trailing block is present |

Then `splatCount` **28-byte core records**, little-endian:

| Field      | Bytes     | Notes                                                                                                                                                                |
| ---------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `x, y, z`  | 3×f32, 12 | metres, asset frame                                                                                                                                                  |
| `rotation` | 4×i8, 4   | unit quaternion `[x,y,z,w]` / 127, `unpack4x8snorm`. Byte-offset **12** — its own u32 word                                                                           |
| `logScale` | 3×f16, 6  | natural log of the Gaussian's axis half-lengths. `.xy` at bytes 16–19 (`unpack2x16float(w4)`); `.z` at bytes 20–21, the low half of word 5 (`unpack2x16float(w5).x`) |
| `opacity`  | u8, 1     | byte 22, within word 5. Post-sigmoid probability × 255, `unpack4x8unorm(w5).z`                                                                                       |
| pad        | 1         | byte 23 — keeps `dcColor` starting a fresh word                                                                                                                      |
| `dcColor`  | 3×u8, 3   | bytes 24–26, word 6. SH degree-0 term evaluated to RGB, × 255, `unpack4x8unorm(w6).xyz`                                                                              |
| pad        | 1         | byte 27                                                                                                                                                              |

Then, **only when `shDegree = 1`**, a trailing block of `splatCount × 12` bytes, never interleaved:

| Field   | Bytes            | Notes                                                                                                            |
| ------- | ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| `fRest` | 9×i8 + 3 pad, 12 | channel-major: `R[0..2], pad`, `G[0..2], pad`, `B[0..2], pad` — three u32 words, each `unpack4x8snorm(word).xyz` |

**Contract:**

```ts
// tools/scene-recon/pack/splatFormat.ts
export const SPLATS_MAGIC = 'SPL3';
export const SPLATS_FORMAT_VERSION = 1;
export const SPLATS_HEADER_BYTES = 16;
export const SPLATS_RECORD_BYTES = 28;
export const SPLATS_SH1_RECORD_BYTES = 12;

// tools/scene-recon/pack/packSplats.ts
export type GaussianSplatRecord = {
  readonly xM: number;
  readonly yM: number;
  readonly zM: number;
  readonly rotation: Vec4; // [x, y, z, w]
  readonly logScale: Vec3;
  readonly opacity: number; // 0..1
  readonly dcColor: readonly [number, number, number]; // 0..255
  readonly fRest: readonly number[] | null; // 9 values (R,G,B × 3) or null at deg 0
};
export function packSplats(splats: readonly GaussianSplatRecord[], shDegree: 0 | 1): Uint8Array;

// tools/scene-workbench/src/scene/parseSplats.ts
export type ParsedGaussianSplats = {
  readonly splatCount: number;
  readonly shDegree: 0 | 1;
  readonly records: Uint8Array; // view onto the downloaded buffer, stride 28
  readonly sh1: Uint8Array | null; // view, stride 12, present iff shDegree === 1
  readonly positionsM: Float32Array; // decoded ONCE here — the sort's per-splat read path
};
export function parseSplats(buffer: ArrayBuffer): ParsedGaussianSplats;
```

`GaussianSplatRecord` lives in `packSplats.ts` (not `readGaussianPly.ts`) — mirrors `packPoints.ts` owning `ScenePoint`; task 2's `readGaussianPly` imports it from here. `records`/`sh1` are views, uploaded verbatim (mirrors `parsePoints`'s no-copy contract). `positionsM` is the one field actually **decoded** into a fresh `Float32Array(3 * splatCount)`: the stride is 28 bytes, not 12, so the xyz floats aren't contiguous, and the sort (task 12) needs them dense every frame — decoding once at parse time is cheaper than re-deriving it per sort.

- [ ] Test `packSplats → parseSplats round-trips a shDegree-0 record set` — 5 splats (not a power of two), every field varying per record, decoded in the test via a hand-written `DataView` per the byte table above (never by re-calling the packer): `getFloat32` for xyz, `getInt8`/127 for rotation, hand-computed `f16` decode for `logScale` (`tests/tools/scene-workbench` has no existing f16 decode helper to reuse — decode inline from the raw 16 bits, e.g. via `src/utils/math/f16BitsToFloat.ts`, which is a _different_ function than whatever `packSplats` uses to encode, so this stays a round-trip check, not a mirror), `getUint8`/255 for opacity, `getUint8` ×3 for `dcColor`. Assert `sh1` is `null` and the total buffer length matches `SPLATS_HEADER_BYTES + count * SPLATS_RECORD_BYTES` (no trailing block).
- [ ] Test `packSplats → parseSplats round-trips a shDegree-1 record set` — same 5 splats, each with a distinct 9-value `fRest`, asserting the trailing block's byte length (`count * SPLATS_SH1_RECORD_BYTES`) and every `fRest` coefficient decoded via `getInt8`/127.
- [ ] Test `parseSplats rejects a wrong magic` and `parseSplats rejects a splatCount that disagrees with the buffer length` — mirrors `parsePoints`'s two negative tests (`tests/tools/scene-recon/pack/packPoints.test.ts:51-71`) for the same reason: a truncated download must not render as silent garbage.
- [ ] Implement `packSplats` (per-field quantization from the table's Notes column) and `parseSplats` (magic/version/count validation, view construction, the one `positionsM` decode loop).
- [ ] `npx vitest run tests/tools/scene-recon/pack tests/tools/scene-workbench/scene`; `npm run format`; commit `tools/scene-recon/pack/splatFormat.ts`, `tools/scene-recon/pack/packSplats.ts`, `tools/scene-workbench/src/scene/parseSplats.ts`, `tests/tools/scene-recon/pack/packSplats.test.ts` as:

  ```
  feat(scene-recon): splats.bin format, packSplats, parseSplats

  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  ```

### Task 2: `readGaussianPly`

**Files:**

- Create: `tools/scene-recon/splats/readGaussianPly.ts`
- Create fixture: `tests/fixtures/skraafoto/tiny.ply` (or inline binary in the test — implementer's call, see step 1)
- Test: `tests/tools/scene-recon/splats/readGaussianPly.test.ts`

**Contract:**

```ts
export function readGaussianPly(buffer: ArrayBuffer): {
  readonly splats: readonly GaussianSplatRecord[];
  readonly shDegree: 0 | 1;
};
```

Reads Brush's binary little-endian PLY export (`x y z scale_0..2 opacity rot_0..3 f_dc_0..2 [f_rest_0..N]`) and undoes Brush's storage conventions:

- `scale_0..2` stay **log** (`splats.bin` also stores log) — copied through unconverted.
- `opacity` is pre-sigmoid in the PLY; apply the sigmoid so the record carries a plain `0..1` probability.
- `rot_0..3` is scalar-first (`w,x,y,z`); reorder to `[x,y,z,w]` (`Vec4`, matching `SimilarityTransform.rotation`'s convention).
- `f_dc_0..2` is SH0-evaluated to `0..255` RGB via `0.5 + 0.28209479 · f_dc`, clamped — the same formula `splats.bin`'s `dcColor` stores.
- `f_rest_0..N` (channel-major, INRIA convention) copied through **unconverted** at `shDegree = 1`; keep only the first 3 coefficients per channel, drop higher orders — `packSplats` (task 1) owns the final i8 quantization, not this reader.

`shDegree` is inferred from the PLY header's property list: an `f_rest_0` property present means degree 1.

A PLY file's ASCII header (`ply`, `format binary_little_endian 1.0`, `element vertex N`, one `property float <name>` line per field, `end_header`) precedes the binary body — the reader must parse the header to find `N` and the field order/offsets rather than assume Brush's field order is fixed forever.

- [ ] Build a tiny hand-crafted binary PLY (2–3 vertices) with known `scale_0..2`, pre-sigmoid `opacity`, scalar-first `rot_0..3`, and `f_dc_0..2` values — write it via a `DataView` in the test (or as a committed fixture file, implementer's call; if a file, it belongs under `tests/fixtures/skraafoto/` per the repo's `tests/fixtures/<source>/` convention).
- [ ] Test `readGaussianPly applies the sigmoid to opacity` — hand-compute `1/(1+e^-x)` for the fixture's pre-sigmoid value, assert against the decoded record's `opacity` (not against `readGaussianPly`'s own sigmoid expression).
- [ ] Test `readGaussianPly evaluates f_dc to 0..255 RGB via the SH0 formula` — hand-compute `0.5 + 0.28209479 * f_dc`, clamped to `[0,255]`, for at least one channel that would clamp (a large negative `f_dc`) to prove the clamp fires.
- [ ] Test `readGaussianPly reorders rot_0..3 from scalar-first to [x,y,z,w]` — assert the decoded `rotation` array order directly against the fixture's raw `w,x,y,z` values, permuted by hand in the assertion.
- [ ] Test `readGaussianPly reports shDegree 0 for a PLY with no f_rest properties and 1 for one that has them` — two small fixtures (or one PLY built both ways).
- [ ] Implement; `npx vitest run tests/tools/scene-recon/splats`; `npm run format`; commit `tools/scene-recon/splats/readGaussianPly.ts`, its test, and any fixture file as:

  ```
  feat(scene-recon): readGaussianPly — decode Brush's PLY export

  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  ```

### Task 3: `SkraafotoStacItem` type, registry rows, README, `fetchSkraafoto`

**Files:**

- Create: `tools/scene-recon/@types/SkraafotoStacItem.d.ts`
- Create: `tools/fetch/fetchSkraafoto.ts`
- Create: `data/raw/skraafoto/README.md` (committed)
- Modify: `tools/scene-recon/groups/soendermarken.ts`, `tools/utils/io/rawDataRegistry.ts`, `package.json`

**Contract:**

```ts
// tools/scene-recon/@types/SkraafotoStacItem.d.ts — only the fields this pipeline reads
export type SkraafotoStacItem = {
  readonly id: string;
  readonly properties: {
    readonly 'pers:omega': number; // degrees
    readonly 'pers:phi': number; // degrees
    readonly 'pers:kappa': number; // degrees
    readonly 'pers:perspective_center': readonly [number, number, number]; // [E, N, H], EPSG:25832 + DVR90
    readonly 'pers:interior_orientation': {
      readonly focal_length: number; // mm
      readonly pixel_spacing: number; // mm
      readonly principal_point_offset: readonly [number, number]; // mm [ppx, ppy]
    };
    readonly 'proj:shape': readonly [number, number]; // full-resolution COG pixel dimensions
  };
  readonly assets: { readonly data: { readonly href: string } };
};
```

`tools/scene-recon/groups/soendermarken.ts`: `SceneGroupDefinition` gains `readonly skraafoto: { readonly collection: string }`; `SOENDERMARKEN` sets it to `{ collection: 'skraafotos2025' }`.

`tools/utils/io/rawDataRegistry.ts`: two rows following the `'dhm.dir'`/`'dhm.readme'` pair (`rawDataRegistry.ts:959-974`), same shape:

- `'skraafoto.dir'` → `path: 'data/raw/skraafoto'`, `kind: 'directory'`, `source: 'gitignored'`, `fetcher: 'tools/fetch/fetchSkraafoto.ts'`, `readme: 'skraafoto.readme'`.
- `'skraafoto.readme'` → `path: 'data/raw/skraafoto/README.md'`, `kind: 'file'`, `source: 'committed'`.

`tools/fetch/fetchSkraafoto.ts` — follows `fetchDhm.ts`'s shape (keychain read, per-item try/catch that records a failure without aborting the run, `redactSecret` on every logged error/URL, `invokedDirectly` CLI entry):

1. `readKeychainSecret('skymap-dataforsyningen-apikey')`.
2. `POST https://api.dataforsyningen.dk/rest/skraafoto_api/v1.0/search`, header `token: <apiKey>`, body `{ collections: [group.skraafoto.collection], bbox: [w,s,e,n] from group.bounds, limit: 1000 }`. Parse the returned STAC `FeatureCollection`'s `features` as `SkraafotoStacItem[]`.
3. Per item, resume-skip if **both** `<destDir>/<itemId>.json` and `<itemId>.jpg` already exist (no separate completeness check needed — unlike LAS tiles, a failed `gdal_translate` never leaves a renamed file behind, so presence alone is trustworthy). Otherwise:
   - Write `<itemId>.json` verbatim (`JSON.stringify`, pretty-printed).
   - Compute `scale = 1920 / Math.max(...item.properties['proj:shape'])`, `outW`/`outH` from `item.properties['proj:shape'] * scale` (rounded).
   - Spawn `gdal_translate /vsicurl/<item.assets.data.href> -outsize <outW> <outH> -of JPEG <dest>.tmp` with env `GDAL_HTTP_HEADERS: 'token: <apiKey>'` merged into `process.env` — **never** the key in the URL or the argv the process logs.
   - On exit code 0, rename `.tmp` → `<itemId>.jpg` (bakeLidar's temp-file+rename idiom). On non-zero, delete the `.tmp`, record the item as failed, continue to the next item — one bad frame must not lose the other ~300.
4. Report `<ok>/<total>` to stderr; non-zero `process.exitCode` if any item failed (mirrors `fetchDhm.ts`'s summary).

`data/raw/skraafoto/README.md` (committed): the endpoint + collection (`skraafotos2025`, forår-2025, 306 items over the Søndermarken bbox per the spec's live-confirmed research), the **two separate keychain credentials** (`skymap-dataforsyningen-apikey` here vs. `skymap-datafordeler-apikey` for DHM), the `token:`-header rule, and the licence/attribution text. **Look up the current wording at dataforsyningen.dk/Vilkaar for skråfoto before writing this section** — the parent spec's README convention requires the real text before the fetcher ships (spec §10 open question 4); do not invent it.

**No test** — `SkraafotoStacItem` is a type declaration (`tsc` proves it, `testing.md`'s no-runtime-type-test rule); the two registry rows are a constant restatement (plan 1 task 3's precedent); `fetchSkraafoto`'s download plumbing is the same "no test on `spawn`/`fetch` + exit code" exclusion as `fetchDhm.ts` (plan 1 task 8).

- [ ] Add `package.json`'s `"fetch-skraafoto": "tsx tools/fetch/fetchSkraafoto.ts"`, alongside the existing `"fetch-dhm"` line.
- [ ] Add the type, the group field, the two registry rows, the README (with the real, looked-up licence wording), and the fetcher.
- [ ] `npm run typecheck`; `npm run format`; commit `tools/scene-recon/@types/SkraafotoStacItem.d.ts`, `tools/fetch/fetchSkraafoto.ts`, `data/raw/skraafoto/README.md`, `tools/scene-recon/groups/soendermarken.ts`, `tools/utils/io/rawDataRegistry.ts`, `package.json` as:

  ```
  feat(scene-recon): fetchSkraafoto — skråfoto STAC + downsampled JPEG harvest

  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  ```

### Task 4: `topocentricPositionsM` + `photoPoseFromStacItem`

**Files:**

- Create: `tools/scene-workbench/@types/PhotoPose.d.ts`
- Create: `tools/scene-recon/poses/topocentricPositionsM.ts`, `tools/scene-recon/poses/photoPoseFromStacItem.ts`
- Create fixture: `tests/fixtures/skraafoto/<realItemId>.json` (see step 3)
- Test: `tests/tools/scene-recon/poses/topocentricPositionsM.test.ts`, `tests/tools/scene-recon/poses/photoPoseFromStacItem.test.ts`

**Contract:**

```ts
// tools/scene-workbench/@types/PhotoPose.d.ts — parent spec §4, verbatim
export type PhotoPose = {
  readonly id: string;
  readonly positionM: Vec3; // camera centre, group frame, metres
  readonly rotation: Vec4; // group frame ← camera frame; camera looks +Z, +Y down (CV convention)
  readonly focalLengthPx: number;
  readonly principalPointPx: Vec2;
  readonly imageWidthPx: number;
  readonly imageHeightPx: number;
  readonly imageUrl: string;
};
```

```ts
// tools/scene-recon/poses/topocentricPositionsM.ts
export type CctRunner = (inputLines: readonly string[]) => Promise<readonly string[]>;
export async function topocentricPositionsM(
  anchor: GroupAnchor,
  pointsUtm: readonly Vec3[], // [E, N, H], EPSG:25832 + DVR90-as-ellipsoidal
  deps: { readonly runCct: CctRunner },
): Promise<Vec3[]>; // group-frame ENU metres
```

**Author's call, flagged:** the spec's own signature for `topocentricPositionsM` is 2-arg with no injected dependency (§6). This plan adds a `deps: { runCct }` parameter, mirroring `bakeLidar`'s `PdalRunner` injection (`bakeLidar.ts:48-53`), so the function is unit-testable without a `cct` subprocess — consistent with every other offline-pipeline wrapper in this codebase (`lidarPipelineStages`, `bakeLidar`, `bakeSplats` below). The CLI wires the real `spawnSync`-based runner; the shape (batch every point through **one** `cct` call over stdin/stdout, one line per point) is unchanged from the spec.

The composed pipeline, one `cct` invocation for every camera centre in the batch (spec §6):

```
+proj=pipeline +step +inv +proj=utm +zone=32 +ellps=GRS80 +step +proj=cart +ellps=GRS80 +step +proj=topocentric +lat_0=<anchor.latDeg> +lon_0=<anchor.lonDeg> +h_0=<anchor.heightMDvr90> +ellps=GRS80
```

No leading `unitconvert` stage — PROJ's inverse UTM already emits radians (unlike `lidarPipelineStages.ts`'s forward pipeline, which starts from degrees and needs one). DVR90 heights are fed to `cart` as if ellipsoidal, matching the LiDAR bake's same approximation (spec §6) — not a bug, a consistent shared bias that cancels when comparing the two reconstructions.

```ts
// tools/scene-recon/poses/photoPoseFromStacItem.ts
export function photoPoseFromStacItem(
  item: SkraafotoStacItem,
  anchor: GroupAnchor,
  positionM: Vec3, // already converted (topocentricPositionsM's output for this item)
  downsampleScale: number,
): PhotoPose;
```

Builds the ω/φ/κ rotation matrix `D` (SDFIdk/saul reference implementation, MIT), converts it to `PhotoPose.rotation` via `matrixToQuaternion` (`src/utils/math/matrixToQuaternion.ts`) composed with the grid-convergence correction `Rz(γ)`, `γ ≈ (lonDeg − 9) · sin(latDeg)` (≈2.9° at Søndermarken). `focalLengthPx = focal_length / pixel_spacing × downsampleScale`. `principalPointPx = (outW/2 + ppx/pixel_spacing, outH/2 ± ppy/pixel_spacing) × downsampleScale` — the sign on the `ppy` term follows the saul formula's own convention. **The composition order and the `ppy` sign are exactly what step 3's fixture test settles — this spec names the formula, not a verified sign** (spec §6, §10 open question 3).

- [ ] Test `topocentricPositionsM batches every camera centre through one cct call` — 3 fake UTM points, a stub `CctRunner` capturing its input, asserting it was called **once** with 3 lines.
- [ ] Test `topocentricPositionsM composes the inverse-UTM32 → cart → topocentric pipeline string with the anchor's lat/lon/height` — assert the pipeline string argument the stub `CctRunner` receives contains `+inv +proj=utm +zone=32`, no leading `unitconvert` stage, and the anchor's `lat_0`/`lon_0`/`h_0` values.
- [ ] Manually verify the pipeline lands the anchor's own coordinates near `(0,0,0)` (the same sanity check plan 1 task 1 ran for the LiDAR pipeline): forward-project `SOENDERMARKEN.anchor`'s lat/lon to UTM32 (`echo "<lonDeg> <latDeg> <heightMDvr90>" | cct +proj=utm +zone=32 +ellps=GRS80`), then feed that UTM triple through the pipeline string above via `cct` — the three output metre values must be within 0.01 of `0`. Record the result in this task's commit message or the README; do not skip it before trusting the pipeline on real camera centres.
- [ ] Obtain one real 2025 skråfoto STAC item whose footprint contains the Søndermarken anchor (55.67°N, 12.53°E) roughly centred in frame — via `curl` against the search endpoint (task 3's fetcher isn't run for real until task 8, but the endpoint is public) or by running `npm run fetch-skraafoto` early if convenient. Trim it to exactly the fields `SkraafotoStacItem` reads and commit it as `tests/fixtures/skraafoto/<itemId>.json`.
- [ ] By hand (a scratch script or spreadsheet — never `photoPoseFromStacItem`'s own code path): run the fixture item's `pers:perspective_center` through the verified pipeline above to get the camera's real group-frame `positionM`, then project the group anchor (`[0,0,0]` in the group frame) through the pinhole model `pixel = principalPointPx + focalLengthPx · (R · (anchorM − positionM)).xy / (R · (anchorM − positionM)).z`, using the ω/φ/κ rotation and the `Rz(γ)` correction from the contract above. Record the resulting `(u, v)` pixel pair.
- [ ] Add the test `photoPoseFromStacItem projects the group anchor to the independently hand-computed pixel` — call `photoPoseFromStacItem` with the fixture item, `SOENDERMARKEN.anchor`, the hand-derived `positionM`, and the fetcher's `downsampleScale`; project `[0,0,0]` through the **returned pose's own fields** using the same pinhole formula (re-implemented once in the test file, not imported from the source); assert the result is within a few pixels of the hand-computed `(u, v)`. This is the test that settles the `Rz(γ)` composition-order/sign question (spec §9, §10 open question 3) rather than leaving it asserted.
- [ ] Implement both functions.
- [ ] `npx vitest run tests/tools/scene-recon/poses`; `npm run typecheck`; `npm run format`; commit `tools/scene-workbench/@types/PhotoPose.d.ts`, `tools/scene-recon/poses/topocentricPositionsM.ts`, `tools/scene-recon/poses/photoPoseFromStacItem.ts`, both tests, and the fixture as:

  ```
  feat(scene-recon): topocentricPositionsM + photoPoseFromStacItem

  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  ```

### Task 5: `writeColmapModel` golden

**Files:**

- Create: `tools/scene-recon/splats/writeColmapModel.ts`
- Test: `tests/tools/scene-recon/splats/writeColmapModel.test.ts`

**Contract:**

```ts
export async function writeColmapModel(spec: {
  readonly poses: readonly PhotoPose[];
  readonly pointsBinPath: string;
  readonly pointSampleTarget: number;
  readonly outDir: string;
}): Promise<void>;
```

Writes three text files into `spec.outDir` (COLMAP's known-pose text format) plus an `images/` directory of copied or symlinked JPEGs:

- **`cameras.txt`** — one line per image (one `PINHOLE` camera per image, not shared): `<cameraId> PINHOLE <imageWidthPx> <imageHeightPx> <fx> <fy> <cx> <cy>`, where `fx = fy = pose.focalLengthPx` (spec's symmetric-camera convention) and `cx, cy = pose.principalPointPx`. `cameraId` runs 1..N in `spec.poses` order.
- **`images.txt`** — two lines per image: `<imageId> <qw> <qx> <qy> <qz> <tx> <ty> <tz> <cameraId> <name>` followed by an empty line (the `POINTS2D` list, empty — Brush's COLMAP loader doesn't need observations). `imageId` matches `cameraId`. `qw,qx,qy,qz` is the **conjugate** of `pose.rotation` (camera→world) reordered to COLMAP's scalar-first convention, i.e. the world→camera rotation; `tx,ty,tz = -R_world→camera · pose.positionM`. `name` is `pose.id` (or a derived filename matching the copied JPEG).
- **`points3D.txt`** — one line per sampled point: `<pointId> <x> <y> <z> <r> <g> <b> 0` (error hardcoded 0, empty track). Points come from `pointsBinPath`, read via the **existing** `parsePoints.ts` (pure TS, reused as-is in this Node context — no second reader), subsampled deterministically: `N = Math.floor(pointCount / spec.pointSampleTarget)`, keep every `N`th point (`N = 1` when `pointCount <= pointSampleTarget`).
- `images/<name>` — each pose's `imageUrl` copied (or symlinked) into `outDir/images/`, named to match `images.txt`'s `NAME` column.

No COLMAP `#`-comment header lines are required — COLMAP's text-format readers skip `#`-prefixed lines but don't require them, and Brush's loader inherits that reader. Keep the files header-free; simpler to golden-test.

- [ ] Build a small fixture: 2 `PhotoPose`s with deliberately simple rotations (identity quaternion for one, a clean 90°-about-Z quaternion for the other) so the expected `qw..tz` values in the golden text are exact hand arithmetic, not a re-derivation of the source's own conjugate/matrix code. Write a temporary `points.bin` via `packPoints` (task 1's sibling `pointCloudFormat`/`packPoints`, already on `main`) containing exactly 10 hand-picked `ScenePoint`s, in a `mkdtempSync` tmpdir (mirrors `tests/tools/scene-recon/ortho/orthoVrtXml.test.ts`'s tmpdir pattern).
- [ ] Test `writeColmapModel writes cameras.txt with one PINHOLE entry per image at the downsampled size` — call with `pointSampleTarget: 10` (keeps all 10 fixture points, `N = 1`), assert the full `cameras.txt` text against the hand-composed expected string.
- [ ] Test `writeColmapModel writes images.txt with the world→camera conjugate quaternion and translation` — assert the full `images.txt` text, including the empty POINTS2D lines.
- [ ] Test `writeColmapModel writes points3D.txt sampling every Nth point of points.bin` — assert the full `points3D.txt` text against the 10 fixture points, `ERROR` column literally `0`, no track columns.
- [ ] Test `writeColmapModel copies each pose's image into outDir/images, named to match images.txt` — assert the two files exist under `<outDir>/images/` with the names `images.txt` uses.
- [ ] Implement.
- [ ] `npx vitest run tests/tools/scene-recon/splats`; `npm run format`; commit `tools/scene-recon/splats/writeColmapModel.ts` and its test as:

  ```
  feat(scene-recon): writeColmapModel — known-pose COLMAP staging for Brush

  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  ```

### Task 6: `GaussianSplatAsset` growth + splat asset loading (moved ahead of `bakeSplats` — see the resequencing note above)

**Files:**

- Create: `tools/scene-workbench/@types/GaussianSplatAsset.d.ts`
- Modify: `tools/scene-workbench/@types/SceneAsset.d.ts`
- Modify: `tools/scene-workbench/src/render/renderResources.ts` (add `SplatGpuAsset`, grow `GpuAsset`)
- Create: `tools/scene-workbench/src/render/uploadGaussianSplat.ts`, `tools/scene-workbench/src/scene/loaders/loadGaussianSplat.ts`
- Modify: `tools/scene-workbench/src/scene/loaders/assetLoaders.ts` (second `ASSET_LOADERS` row)
- Create: `tools/scene-workbench/src/scene/assetCount.ts`
- Modify: `tools/scene-workbench/src/ui/LayerList/LayerList.tsx` (`assetCount` swap), `tools/scene-workbench/src/ui/Viewport/Viewport.tsx` (`visibleAssets` kind-narrowed — see below)
- Test: `tests/tools/scene-workbench/scene/assetCount.test.ts`
- Test: extend `tests/tools/scene-workbench/ui/LayerList.test.tsx`

**Contract:**

```ts
// tools/scene-workbench/@types/GaussianSplatAsset.d.ts
import type { AssetCommon } from './AssetCommon';

export type GaussianSplatAsset = AssetCommon & {
  readonly kind: 'gaussianSplat';
  readonly splatCount: number;
  readonly shDegree: 0 | 1;
  readonly artifactUrl: string; // splats.bin
};

// tools/scene-workbench/@types/SceneAsset.d.ts
export type SceneAsset = PointCloudAsset | GaussianSplatAsset;
```

```ts
// tools/scene-workbench/src/render/renderResources.ts — GpuAsset union member
export type SplatGpuAsset = {
  readonly kind: 'gaussianSplat';
  readonly data: GPUBuffer; // STORAGE | COPY_DST, array<u32>, 7 words/record
  readonly sh1: GPUBuffer | null; // STORAGE | COPY_DST, array<u32>, 3 words/record
  readonly order: GPUBuffer; // VERTEX | COPY_DST, u32, instance-step
  readonly positionsM: Float32Array;
  readonly splatCount: number;
  readonly shDegree: 0 | 1;
  dispose(): void;
};
export type GpuAsset = LidarGpuAsset | SplatGpuAsset;
```

```ts
// tools/scene-workbench/src/render/uploadGaussianSplat.ts — mirrors uploadPointCloud.ts's shape
export function uploadGaussianSplat(gpu: GpuContext, parsed: ParsedGaussianSplats): SplatGpuAsset;

// tools/scene-workbench/src/scene/loaders/loadGaussianSplat.ts — the ASSET_LOADERS['gaussianSplat'] row
export function loadGaussianSplat(gpu: GpuContext, buffer: ArrayBuffer): GpuAsset;
```

`uploadGaussianSplat` creates the three buffers (`data`, `sh1` only when `parsed.shDegree === 1`, `order`), writes `parsed.records`/`parsed.sh1` verbatim, and writes `order` as the identity permutation `[0, 1, ..., splatCount-1]` (`Uint32Array`) — so the first frame draws in on-disk order before task 12's sort ever runs, never empty. `loadGaussianSplat` wraps `parseSplats` (task 1) + `uploadGaussianSplat`, mirroring `loadPointCloud.ts`'s exact two-line shape.

`assetLoaders.ts` grows to:

```ts
export const ASSET_LOADERS: Record<SceneAsset['kind'], AssetLoader> = {
  pointCloud: loadPointCloud,
  gaussianSplat: loadGaussianSplat,
};
```

```ts
// tools/scene-workbench/src/scene/assetCount.ts
export type AssetCountDisplay = { readonly count: number; readonly unit: string };
export function assetCount(asset: SceneAsset): AssetCountDisplay;
```

Tag + table dispatch (`simplicity.md` §7's N-way form), the exhaustive `{ [K in SceneAsset['kind']]: ... }` table from spec §7.2: `pointCloud → { count: asset.pointCount, unit: 'pts' }`, `gaussianSplat → { count: asset.splatCount, unit: 'splats' }`.

`LayerList.tsx:39` (currently `{asset.pointCount.toLocaleString()} pts`, a field access that only ever worked because `SceneAsset` had one member) becomes `{assetCount(asset).count.toLocaleString()} {assetCount(asset).unit}`.

**`Viewport.tsx`'s existing `visibleAssets` helper must narrow by kind now that `GpuAsset` is a union** — before/after (`Viewport.tsx:82-88`):

```ts
// before
const visibleAssets = (hiddenAssetIds: readonly string[]): LidarGpuAsset[] => {
  const drawn: LidarGpuAsset[] = [];
  for (const [id, asset] of resources.gpuAssets) {
    if (!hiddenAssetIds.includes(id)) drawn.push(asset);
  }
  return drawn;
};

// after — task 11 generalizes this further for the splat draw call; for now it
// only needs to keep compiling and keep drawing exactly the LiDAR assets it did before
const visibleAssets = (hiddenAssetIds: readonly string[]): LidarGpuAsset[] => {
  const drawn: LidarGpuAsset[] = [];
  for (const [id, asset] of resources.gpuAssets) {
    if (asset.kind === 'pointCloud' && !hiddenAssetIds.includes(id)) drawn.push(asset);
  }
  return drawn;
};
```

A `gaussianSplat` asset that reaches `resources.gpuAssets` after this task loads onto the GPU and shows `ready` in the layer list, but draws nothing yet — no renderer consumes it until task 11. This mirrors plan 1 task 12's own intermediate state ("the layer statuses reaching `ready` — nothing is drawn until task 14").

- [ ] Test `assetCount reports pts for a pointCloud asset and splats for a gaussianSplat asset` — one hand-built asset of each kind, asserting `{count, unit}` against hand-picked values (`tsc` already proves the table exhaustive; this test is for the dispatch itself).
- [ ] Extend `LayerList.test.tsx`: add the test `LayerList shows a gaussianSplat asset's count in splats` — render with a manifest containing one `gaussianSplat` asset (`splatCount: 42_000`, `shDegree: 0`), assert the row's text includes `42,000 splats`.
- [ ] Implement the two new types, `renderResources.ts`'s growth, `uploadGaussianSplat`, `loadGaussianSplat`, the `ASSET_LOADERS` row, `assetCount`, the `LayerList` swap, and the `Viewport.tsx` narrowing.
- [ ] `npx vitest run tests/tools/scene-workbench`; `npm run typecheck`; `npm run format`; commit all of the above as:

  ```
  feat(scene-workbench): GaussianSplatAsset — type, GPU asset kind, loader row

  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  ```

### Task 7: `bakeSplats` orchestration + npm scripts

**Files:**

- Create: `tools/scene-recon/bakeSplats.ts`
- Modify: `package.json`

**Contract:**

```ts
export type BrushRunner = (colmapDir: string) => Promise<void>;
export async function bakeSplats(
  group: SceneGroupDefinition,
  deps: { readonly runBrush: BrushRunner; readonly brushVersion: () => string },
): Promise<GaussianSplatAsset>;
```

Follows `bakeLidar.ts`'s injected-dependency shape (`bakeLidar.ts:50-53`) exactly:

1. **Precondition:** `public/data/geo3d/groups/<group.id>/assets/lidar/points.bin` must already exist (the LiDAR asset id is `'lidar'`, `bakeLidar.ts:37`). If missing, throw with the `npm run bake-lidar` hint — `writeColmapModel`'s `points3D` seed reads this file.
2. Read every fetched `SkraafotoStacItem` under `rawDataPath('skraafoto.dir')/<group.skraafoto.collection>/` (glob `*.json`, excluding `README.md`).
3. `topocentricPositionsM(group.anchor, items.map(i => i.properties['pers:perspective_center']), { runCct })` (one batched call) → per-item `positionM`; `photoPoseFromStacItem(item, group.anchor, positionM, downsampleScale)` per item → `PhotoPose[]`. `downsampleScale` is the same `1920 / max(proj:shape)` fetchSkraafoto computed per item (task 3) — recompute it here from `proj:shape` rather than storing it, since it's a pure function of data already on the `SkraafotoStacItem`.
4. `writeColmapModel({ poses, pointsBinPath: '.../lidar/points.bin', pointSampleTarget: 200_000, outDir: rawDataPath('skraafoto.dir') + '/<collection>/colmap-<groupId>' })`.
5. `deps.runBrush(colmapDir)` — spawns:

   ```
   brush-cli <colmapDir> --sh-degree 1 --total-train-iters 30000 --export-path <colmapDir> --export-name final.ply --max-resolution 1920
   ```

   (`--with-viewer` defaults `false` once a source path is given — no flag needed.) Missing `brush-cli` fails fast with an install hint **before** spawning, the same `spawnSync`-probe-then-throw shape as `bakeLidar.ts`'s `pdalVersion()` (`bakeLidar.ts:157-170`): `rustup update && cargo install --git https://github.com/ArthurBrussee/brush brush-cli` — the error names the locally-detected Rust toolchain version (if any) so a stale one is visible.

6. `readGaussianPly(<colmapDir>/final.ply)` → `packSplats` → write `public/data/geo3d/groups/<groupId>/assets/splats/splats.bin`.
7. Build the `GaussianSplatAsset` (`id: 'splats'`, `provenance.pipeline = [{ step: 'fetchSkraafoto', version: group.skraafoto.collection }, { step: 'brush-cli', version: deps.brushVersion() }]`, `transform` identity — spec §4/§11).
8. `writeJsonAtomic` the group's `manifest.json` through `nextManifest` (reused unmodified — task 6 already widened `SceneAsset`, so this compiles) and `writeJsonAtomic` `scenes.json` through `upsertGroup` — the same two calls `bakeLidar.ts:128-139` makes.

`--total-train-iters` stays at Brush's default (30000) — spec §10 open question 2, an operator judgement deferred to the real bake. `--max-frames`/per-direction subsampling is **not built** in v1 (spec §6) — 306 frames measured fine for Brush in research; add only if a real bake's wall time is a problem.

**No new unit test** — every decision `bakeSplats` makes is already covered by tasks 1–6; what remains is orchestration plus a subprocess (`bakeLidar.ts`'s own precedent, plan 1 task 9).

- [ ] Add `package.json`'s `"bake-splats": "tsx tools/scene-recon/bakeSplats.ts"`, alongside `"bake-lidar"`.
- [ ] Implement `bakeSplats.ts` (the function plus a `main()` wiring the real `spawnSync`-based `runBrush`/`brushVersion`/`runCct`, following `bakeLidar.ts`'s `spawnPdal`/`pdalVersion`/`main` tail exactly).
- [ ] `npm run typecheck`; `npm run format`; commit `tools/scene-recon/bakeSplats.ts` and `package.json` as:

  ```
  feat(scene-recon): bakeSplats — photo pose recovery, COLMAP staging, brush-cli, splats.bin

  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  ```

### Task 8 (OPERATOR): run `fetch-skraafoto` + `bake-splats` for real

No code changes. This is the multi-hour step the earlier ordering exists to unblock as early as possible — it can run **in the background while tasks 9–13 proceed**, since they need no baked data (the synthetic probe scene, task 12, covers viewer development and the probe).

- [ ] Confirm the `skymap-dataforsyningen-apikey` keychain entry exists (`security find-generic-password -a "$USER" -s skymap-dataforsyningen-apikey -w | wc -c` → non-zero) and is entitled to the skråfoto self-service API on dataforsyningen.dk. Register/subscribe if not — this is the one step that can block a fresh checkout, same caveat as plan 1 task 1's Datafordeler key.
- [ ] Install Brush: `rustup update && cargo install --git https://github.com/ArthurBrussee/brush brush-cli`. Verify `brush-cli --version` (or whatever flag the installed build honours) runs.
- [ ] Run `npm run fetch-skraafoto`. Verify: ~306 `<itemId>.json` + `<itemId>.jpg` pairs land under `data/raw/skraafoto/skraafotos2025/`, and re-running skips the completed ones.
- [ ] Run `npm run bake-splats`. This trains for a real, possibly multi-hour session. Verify on completion: `public/data/geo3d/groups/soendermarken/assets/splats/splats.bin` exists with `splatCount > 0`; `manifest.json` parses and contains an asset with `kind: 'gaussianSplat', id: 'splats'`; `scenes.json` still lists the one `soendermarken` group (no duplicate).
- [ ] Note the real `splatCount`, `shDegree`, and wall-clock training time somewhere durable (this plan's own progress ledger, or the SDD workspace) — task 10's open question 1 (the SH1 i8 scale factor) and open question 2 (training-time budget) both get their first real data point here.

No commit — the baked artifacts are gitignored.

### Task 9: `SceneCamera` uniform growth

**Files:**

- Create: `tools/scene-workbench/src/render/shaders/lib/sceneCamera.wesl`
- Modify: `tools/scene-workbench/src/render/shaders/lidarPoint.wesl` (struct → import), `tools/scene-workbench/src/render/writeSceneCamera.ts`, `tools/scene-workbench/src/render/sceneCameraUniform.ts`, `tools/scene-workbench/src/ui/Viewport/Viewport.tsx`
- Modify: `tests/tools/scene-workbench/render/sceneCamera.parity.test.ts`

**Author's call, flagged:** the spec doesn't mention a shared lib module — it says `lidarPoint.wesl`'s struct "gains the same two fields" and that `splatRenderer` (task 11) binds "the SAME uniform... shared with `lidarPointRenderer`" (spec §7.3–7.4). The existing parity test (`sceneCamera.parity.test.ts`) only ever parses `lidarPoint.wesl`'s copy of the struct — if `splat.wesl` (task 11) re-declares its own copy of the same struct text, nothing catches the two drifting apart from each other, only from the writer. Per `.claude/skills/wesl-shaders/SKILL.md`'s "CameraUniforms shared-prefix pattern" (already the convention in the main app's `src/services/gpu/shaders/lib/camera.wesl`), this task extracts `SceneCamera` into `tools/scene-workbench/src/render/shaders/lib/sceneCamera.wesl` and both `lidarPoint.wesl` and (task 11's) `splat.wesl` import it — one struct, one place it can drift from the writer, not two.

**`SceneCamera` layout — grows from 112 to 192 bytes, two new fields appended after the existing seven (every existing float offset unchanged):**

| Field          | Type          | Float offset | Byte offset | Notes                                                                   |
| -------------- | ------------- | ------------ | ----------- | ----------------------------------------------------------------------- |
| `viewProj`     | `mat4x4<f32>` | 0            | 0           | unchanged                                                               |
| `rightM`       | `vec3<f32>`   | 16           | 64          | unchanged                                                               |
| `pointSizePx`  | `f32`         | 19           | 76          | unchanged                                                               |
| `upM`          | `vec3<f32>`   | 20           | 80          | unchanged                                                               |
| `viewportH`    | `f32`         | 23           | 92          | unchanged                                                               |
| `eyeM`         | `vec3<f32>`   | 24           | 96          | unchanged                                                               |
| `metresPerPx`  | `f32`         | 27           | 108         | unchanged                                                               |
| `view`         | `mat4x4<f32>` | 28           | 112         | **new** — plain view (no projection); camera-space covariance transport |
| `splatScale`   | `f32`         | 44           | 176         | **new** — `view.display.gaussianSplat.splatScale`                       |
| `opacityScale` | `f32`         | 45           | 180         | **new** — `view.display.gaussianSplat.opacityScale`                     |

184 bytes of fields, rounded up to `SCENE_CAMERA_BYTES = 192` (floats 46–47 trailing pad, unread). **No `focalPx` field** — the splat shader derives focal-length-in-pixels inline as `1 / cam.metresPerPx` (a symmetric perspective camera has `fx = fy`), so a stored field would be surplus (spec §7.3, §11).

**Contract:**

```ts
// writeSceneCamera.ts
export const SCENE_CAMERA_BYTES = 192;
export function writeSceneCamera(
  out: Float32Array,
  view: SceneCameraView,
  pointSizePx: number,
  splatScale: number,
  opacityScale: number,
): void;
```

`sceneCameraUniform.ts`'s `SceneCameraUniform.write` grows the same two parameters: `write(view: SceneCameraView, pointSizePx: number, splatScale: number, opacityScale: number): void`. It also needs to compute and write the plain `view` matrix (`mat4.lookAt(view.eyeM, view.targetM, view.upM, ...)`, the same computation `writeSceneCamera` already does internally for `viewProj` — reuse that intermediate rather than recomputing `lookAt` twice).

`Viewport.tsx`'s call site (`Viewport.tsx:107`, `cameraUniform.write(view, state.view.display.pointCloud.pointSizePx)`) grows to pass **hardcoded `1, 1`** for `splatScale`/`opacityScale` — `view.display.gaussianSplat` doesn't exist in the store until task 10, and hardcoding the spec's own defaults (`{splatScale: 1, opacityScale: 1}`, spec §7.6) keeps this task self-contained and typecheck-green without inventing a store shape a task early. Task 10 replaces the two literals with the real store reads.

- [ ] Create `lib/sceneCamera.wesl` with the 10-field struct (7 existing + 3 new) above.
- [ ] Modify `lidarPoint.wesl`: replace its inline `struct SceneCamera {...}` with `import package::lib::sceneCamera::SceneCamera;` at the top of the file (gotcha #3 — imports must be hoisted).
- [ ] Modify `sceneCamera.parity.test.ts`: read `lib/sceneCamera.wesl` instead of `lidarPoint.wesl`, add `view`/`splatScale`/`opacityScale` to the `WGSL_TYPE`-driven layout parse (already generic — `mat4x4<f32>` and `f32` are both already in the map), and extend the sentinel-value assertions: a distinct `SPLAT_SCALE`/`OPACITY_SCALE` sentinel per new scalar field, plus an assertion that `view`'s 16 floats are finite and non-zero (mirrors the existing `viewProj` block check at `sceneCamera.parity.test.ts:116-124`) and that `struct size equals SCENE_CAMERA_BYTES` now asserts `192`.
- [ ] Implement `writeSceneCamera`'s two new parameters and the `view` matrix write; `sceneCameraUniform.ts`'s grown `write()`; `Viewport.tsx`'s call-site literals.
- [ ] `npx vitest run tests/tools/scene-workbench/render`; `npm run typecheck`; `npm run format`; commit `tools/scene-workbench/src/render/shaders/lib/sceneCamera.wesl`, `tools/scene-workbench/src/render/shaders/lidarPoint.wesl`, `tools/scene-workbench/src/render/writeSceneCamera.ts`, `tools/scene-workbench/src/render/sceneCameraUniform.ts`, `tools/scene-workbench/src/ui/Viewport/Viewport.tsx`, and the parity test as:

  ```
  feat(scene-workbench): grow SceneCamera to 192 bytes — view, splatScale, opacityScale

  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  ```

### Task 10: `view.display.gaussianSplat` + `DisplayPanel` + `viewSlice`

**Files:**

- Modify: `tools/scene-workbench/src/state/view/viewSlice.ts`, `tools/scene-workbench/src/ui/DisplayPanel/DisplayPanel.tsx`, `tools/scene-workbench/src/ui/Viewport/Viewport.tsx` (call-site literals → store reads)
- Modify: `tests/tools/scene-workbench/ui/DisplayPanel.test.tsx`

**Contract:**

`ViewSlice.display` grows from `{ pointCloud: { pointSizePx: number } }` to:

```ts
export type ViewSlice = {
  // ...unchanged fields
  display: {
    pointCloud: { pointSizePx: number };
    gaussianSplat: { splatScale: number; opacityScale: number };
  };
};
```

`defaultViewSlice.display.gaussianSplat = { splatScale: 1, opacityScale: 1 }` (spec §7.6). Two new reducers, same shape as the existing `setPointCloudPointSize` (`viewSlice.ts:53-55`): `setSplatScale`, `setOpacityScale`.

`DisplayPanel.tsx` gains a sibling `CollapsibleSection` — "Gaussian splats" — next to "Point cloud" (`DisplayPanel.tsx:28-43`), with two `Slider`s wired to the new reducers. **Author's call, ranges not pinned by the spec:** `splatScale` 0.1–3, step 0.05; `opacityScale` 0–2, step 0.05 — both centred on the spec's default of 1, wide enough to cover "smaller than trained" and "double opacity" without inventing an arbitrary huge range.

`Viewport.tsx`'s call site (task 9's hardcoded `1, 1`) becomes `state.view.display.gaussianSplat.splatScale`, `state.view.display.gaussianSplat.opacityScale`.

- [ ] Following the existing `DisplayPanel.test.tsx` pattern (`fireEvent.keyDown(slider, { key: 'ArrowRight' })` against a real store, no `viewSlice` reducer unit test — the as-built tree tests these reducers through the UI, not in isolation, per `tests/tools/scene-workbench/ui/DisplayPanel.test.tsx:9-22`), add the test `DisplayPanel drives the gaussianSplat splat-scale slice through its slider` (`getByRole('slider', { name: /splat scale/i })`, one `ArrowRight`, assert `store.getState().view.display.gaussianSplat.splatScale` moved by one step).
- [ ] Add the test `DisplayPanel drives the gaussianSplat opacity-scale slice through its slider`, same shape.
- [ ] Implement the slice growth, the two reducers, the `DisplayPanel` section, and the `Viewport.tsx` call-site swap.
- [ ] `npx vitest run tests/tools/scene-workbench/ui`; `npm run typecheck`; `npm run format`; commit `tools/scene-workbench/src/state/view/viewSlice.ts`, `tools/scene-workbench/src/ui/DisplayPanel/DisplayPanel.tsx`, `tools/scene-workbench/src/ui/Viewport/Viewport.tsx`, and the test as:

  ```
  feat(scene-workbench): gaussianSplat display knobs — splatScale, opacityScale

  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  ```

### Task 11: `splat.wesl` + `splatRenderer` + Viewport wiring

**Files:**

- Create: `tools/scene-workbench/src/render/shaders/splat.wesl`, `tools/scene-workbench/src/render/splatRenderer.ts`
- Modify: `tools/scene-workbench/src/ui/Viewport/Viewport.tsx`

**Bind groups (spec §7.4, verbatim):**

| Group | Binding | Resource                         | Notes                                  |
| ----- | ------- | -------------------------------- | -------------------------------------- |
| 0     | 0       | `SceneCamera` uniform            | shared with `lidarPointRenderer`       |
| 1     | 0       | `data` storage buffer, read-only | `array<u32>`, 7 words/record           |
| 1     | 1       | `sh1` storage buffer, read-only  | deg-1 pipeline variant only            |
| 1     | 2       | **reserved (plan 3)**            | `AssetXform` uniform — not built in v1 |

**Two pipeline variants** (`shDegree` 0 / 1), sharing bind-group-0's layout but differing bind-group-1's — not one pipeline with a dummy `sh1` buffer. `splatRenderer.draw` selects the variant per asset from `asset.shDegree`.

**Vertex buffer** — `order` bound as the sole per-instance vertex attribute: `arrayStride: 4, stepMode: 'instance', format: 'uint32'`. Instance index `i` reads `order[i]` → splat index `idx`, then decodes `data[idx*7 .. idx*7+6]` (28 bytes, spec §5's word layout: `w0..2` = xyz f32, `w3` = rotation i8x4, `w4` = logScale.xy f16x2, `w5` = logScale.z f16 + opacity u8 + pad, `w6` = dcColor u8x3 + pad) and, at deg 1, `sh1[idx*3 .. idx*3+2]`.

Per instance:

1. World position = `position` (the record's xyz — **no** asset-transform multiply; every asset this plan bakes is identity, spec §7.4). `cam.viewProj` as usual. Convert the per-splat rotation quaternion to `Mat3` inline in WGSL.
2. World covariance `Σ = Rsplat · diag(exp(2·logScale)) · Rsplatᵀ`, transported to camera space via `cam.view`'s upper 3×3, then to 2D screen-space covariance via the projection Jacobian — focal length in pixels `1 / cam.metresPerPx` (computed inline, no stored field), divided by depth. Standard 3DGS EWA-splatting reduction. Quad half-extent `3σ` from its eigenvalues, **× `cam.splatScale`**.
3. At deg 1: evaluate the SH1 term from the view direction (eye → splat) against `sh1`'s three unpacked coefficient triples, added to `dcColor` before the fragment stage.

**Fragment stage:** Gaussian falloff `exp(-0.5 · dᵀ Σ2D⁻¹ d)` at the quad-local offset `d`, × `(opacity/255) × cam.opacityScale`, × the (possibly SH1-corrected) colour. Blend `src-alpha`/`one-minus-src-alpha` on both colour and alpha; `depthCompare: 'less'`, `depthWriteEnabled: false` — tests against the depth `lidarPointRenderer` already wrote in the same pass, never overwrites it.

**The covariance-projection maths is cribbed from Brush's Apache-2.0 WGSL kernels** (same substrate, compatible licence, the trainer that produced the data) — attribute this in `splat.wesl`'s header per the licence, not re-derived from scratch.

**Contract:**

```ts
export type SplatRenderer = {
  draw(pass: GPURenderPassEncoder, assets: readonly SplatGpuAsset[]): void;
};
export function createSplatRenderer(
  gpu: GpuContext,
  targetFormat: GPUTextureFormat,
  cameraLayout: GPUBindGroupLayout,
): SplatRenderer;
```

Mirrors `createLidarPointRenderer`'s exact 3-arg shape (`lidarPointRenderer.ts:21-25`). **Per-asset bind group 1 is owned by `splatRenderer`**, not the loader: a `WeakMap<SplatGpuAsset, GPUBindGroup>` built lazily on first draw for each asset (`data`/`sh1` already exist by then, per task 6). Bind groups hold references and need no explicit teardown — the asset's own `dispose()` destroys the buffers, and the `WeakMap` entry is simply unreachable afterward.

`Viewport.tsx` wiring: build `splat: SplatRenderer | null` alongside `lidar` in the `initGpu().then(...)` block (`Viewport.tsx:140-157`), device-lifetime like `lidar` and `cameraUniform`. Generalize task 6's `visibleAssets` into a kind-filtered pair (or a single `visibleAssetsOfKind<K extends GpuAsset['kind']>` helper) so the frame body (`Viewport.tsx:127-129`) becomes: `pass.setBindGroup(0, cameraUniform.bindGroup); lidar.draw(pass, visiblePointCloudAssets(...)); splat.draw(pass, visibleSplatAssets(...)); pass.end();` — back-to-front over the pass's persisted bind-group-0 state, `pass.end()` still called once by `Viewport` itself.

**No new automated test.** Per spec §9's explicit exclusion: no CPU-side shadow implementation exists to check the covariance/EWA maths against; the GPU probe's `uncapturederror` capture (task 12) is the automated gate, visual judgement is the operator's.

- [ ] Write `splat.wesl` (licence header, `lib/sceneCamera.wesl` import, the two-variant bind-group-1 layout expressed as two `@group(1)` declarations behind... — WESL has no preprocessor, so this is two **separate pipelines built from the same module with a compile-time constant or two near-identical entry points**; decide the mechanism while implementing and note it in the file's own header comment, budget ≤10 lines).
- [ ] Implement `splatRenderer.ts` (pipeline creation ×2, the `WeakMap` bind-group cache, `draw`).
- [ ] Wire `Viewport.tsx`.
- [ ] `npm run typecheck`; `npm run format`. If task 8's real bake has already landed, do a manual visual check now (`npm run scene-workbench`, select `soendermarken`, confirm the splat layer draws without a GPU validation error in the console) — otherwise defer visual verification to task 12's probe and task 13's operator check.
- [ ] Commit `tools/scene-workbench/src/render/shaders/splat.wesl`, `tools/scene-workbench/src/render/splatRenderer.ts`, `tools/scene-workbench/src/ui/Viewport/Viewport.tsx` as:

  ```
  feat(scene-workbench): splatRenderer — covariance-projected Gaussian splats

  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  ```

### Task 12: `sortSplatOrder` + `watchSplatSortSaga`

**Files:**

- Create: `tools/scene-workbench/src/scene/sortSplatOrder.ts`
- Create: `tools/scene-workbench/src/state/commands.ts` (new file — plan 1 shipped with none; `fps`/`setFps`/`reloadRegistryRequested` were all removed as unused, per plan 1's as-built note)
- Create: `tools/scene-workbench/src/state/splat/watchSplatSortSaga.ts`
- Modify: `tools/scene-workbench/src/store/rootSaga.ts`
- Test: `tests/tools/scene-workbench/scene/sortSplatOrder.test.ts`

**Contract:**

```ts
// sortSplatOrder.ts — pure, testable in isolation
export function sortSplatOrder(positionsM: Float32Array, eyeM: Vec3, forwardM: Vec3): Uint32Array;

// commands.ts
export const splatOrderWritten = createAction<string>('splatOrderWritten'); // payload: assetId
```

`splatOrderWritten` is a bare one-shot, the `tools/mcpm-workbench/src/state/commands.ts` idiom (`createAction`, no reducer handles it) — its only job is to be **dispatched**, so `Viewport.tsx`'s existing `store.subscribe(() => dirty = true)` (`Viewport.tsx:136-138`) fires on it like any other action. Nothing reads its payload back out of state; the sorted order lives in GPU memory (`asset.order`), not Redux.

`watchSplatSortSaga` — `takeLatest` on an array pattern: `commitCameraPose` (the existing gesture-boundary commit) **or** any `assetStatusChanged` whose payload is `{ status: 'ready' }` for an asset id whose `state.group.manifest.assets` entry has `kind: 'gaussianSplat'` (the action itself carries only `assetId`/`status`, so the match predicate does a `select`-free lookup against the manifest snapshot already in scope, or runs the check inside the worker after a `select`). On trigger:

1. `getContext<SceneSagaContext['resources']>('resources')`; if absent, return (mirrors `watchGroupSaga`'s own guard, `watchGroupSaga.ts:56-57`).
2. `select` `state.view.camera`; compute `eyeM`/`forwardM` via the existing `sceneCameraView` (any placeholder viewport size — eye/forward don't depend on it).
3. For **every** `SplatGpuAsset` currently in `resources.gpuAssets` (not just the one that triggered): `sortSplatOrder(asset.positionsM, eyeM, forwardM)`, then `resources.gpu.device.queue.writeBuffer(asset.order, 0, sorted)`, then `put(splatOrderWritten(assetId))`.

**No staleness/cancellation guard.** The sort is synchronous on the main thread — no `await` between reading `positionsM` and calling `queue.writeBuffer` — so nothing can land mid-flight for an epoch check to guard against. An asset disposed by a group switch between the trigger firing and the saga running is simply absent from `resources.gpuAssets` by the time the saga reads it live, and is skipped.

`rootSaga.ts`'s `mainSaga` grows to `yield* all([watchRegistrySaga(), watchGroupSaga(), watchSplatSortSaga()])`.

- [ ] Test `sortSplatOrder returns far-to-near order` — 5 hand-placed positions at known distances along a fixed `forwardM` from a fixed `eyeM`, asserting the returned index order is farthest-first.
- [ ] Test `sortSplatOrder handles a splat behind the eye` — one position with negative depth along `forwardM`, asserting it still sorts (no NaN/crash) — the one case a naive "sort by dot product" implementation could get subtly wrong at the boundary.
- [ ] Implement `sortSplatOrder`, `commands.ts`, `watchSplatSortSaga`, and the `rootSaga.ts` wiring. **No saga integration test** — pure IO shell, plan 1's own precedent (spec §9, "no saga integration test").
- [ ] `npx vitest run tests/tools/scene-workbench/scene`; `npm run typecheck`; `npm run format`; commit `tools/scene-workbench/src/scene/sortSplatOrder.ts`, `tools/scene-workbench/src/state/commands.ts`, `tools/scene-workbench/src/state/splat/watchSplatSortSaga.ts`, `tools/scene-workbench/src/store/rootSaga.ts`, and the test as:

  ```
  feat(scene-workbench): watchSplatSortSaga — main-thread camera-relative depth sort

  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  ```

### Task 13: Synthetic probe splat asset + probe selector fix

**Files:**

- Modify: `tools/scene-workbench/src/scene/syntheticProbeScene.ts`, `tools/scene-workbench/probeGpuErrors.ts`

**Contract:**

`syntheticProbeScene.ts` gains a second synthetic asset alongside the existing ground+box point cloud (`syntheticProbeScene.ts:82-116`): a small, deterministic `gaussianSplat` set (a few hundred splats scattered near the origin, `shDegree: 0` — deg-1 coverage comes from the real bake's operator check in task 14, not the synthetic scene) built with `packSplats` (task 1, pure, runs fine in the browser) and served via the same `Blob` + `URL.createObjectURL` pattern the point cloud uses (`syntheticProbeScene.ts:85-89`). Label it `'Probe splats'` — distinct from the existing `'Probe point cloud'` label, so name-scoped locators can tell them apart.

`probeGpuErrors.ts`'s three bare `page.getByRole('checkbox')` calls (`probeGpuErrors.ts:221` boot visibility wait, `:257` `layer:off`, `:264` `layer:on`) match exactly one checkbox today and two once the probe scene carries two assets — Playwright's strict mode throws on the second match. All three become name-scoped: `page.getByRole('checkbox', { name: /point cloud/i })`. The `layer:off`/`layer:on` steps keep toggling only that one checkbox — the splat asset stays visible throughout, which is itself useful coverage (its buffers stay bound across a sibling layer's visibility change).

**Additional fix beyond the spec's literal three-call list, flagged as an author's call:** the boot step's readiness wait (`probeGpuErrors.ts:222`, `page.getByText('ready', { exact: true }).waitFor(...)`) is a **different** locator than the three the spec names, but it has the same two-asset collision risk once both assets reach `ready`. Left as `getByText(...).waitFor(...)` it would also throw under Playwright's strict mode. Change it to `await expect(page.getByText('ready', { exact: true })).toHaveCount(2);` (`expect(locator).toHaveCount(n)` doesn't require single-element resolution, unlike `.waitFor()`) — this both fixes the latent strict-mode risk and strengthens the assertion (both assets' full round trip, not just one).

- [ ] Add the synthetic splat asset to `syntheticProbeScene.ts`'s returned manifest.
- [ ] Fix the three checkbox locators and the boot readiness check in `probeGpuErrors.ts`.
- [ ] Run `npm run scene-workbench:probe` — must exit 0 with no GPU, page, or console errors.
- [ ] `npm run format`; commit `tools/scene-workbench/src/scene/syntheticProbeScene.ts` and `tools/scene-workbench/probeGpuErrors.ts` as:

  ```
  test(scene-workbench): synthetic splat asset in the GPU probe scene

  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  ```

### Task 14 (OPERATOR): visual check with the real bake + README update

**Files:**

- Modify: `tools/scene-workbench/README.md`

No other code changes.

- [ ] Confirm task 8's real bake has landed (`public/data/geo3d/groups/soendermarken/assets/splats/splats.bin` exists). If not, wait for it now.
- [ ] `npm run scene-workbench`, select `soendermarken`. Named observable behaviours to check:
  - The splat layer renders recognizable geometry over the same ground the LiDAR layer occupies — facades, canopy, specular highlights read as "the place," not noise.
  - Toggling the splat layer off/on in `LayerList` removes and restores it; the LiDAR layer is unaffected.
  - The two `DisplayPanel` sliders (splat scale, opacity) visibly change the render.
  - Orbiting the camera keeps the splat draw order coherent — no visible sorting popping past what a per-gesture-commit sort implies (the sort only re-runs at `commitCameraPose`, spec §7.5 — this is the expected, not a bug).
  - No console GPU validation errors during normal use.
- [ ] Update `tools/scene-workbench/README.md`: the splat pipeline's place in the prerequisite chain (`npm run fetch-skraafoto` → `npm run bake-splats`, after `fetch-dhm`/`bake-lidar`), the two keychain credentials, and the new `Display` panel section.
- [ ] Record the real `splatCount`/`shDegree`/training time (task 8) and the fRest i8 scale factor's real-data plausibility (spec §10 open question 1) in the README or this plan's own record, whichever the operator prefers.
- [ ] Commit `tools/scene-workbench/README.md` as:

  ```
  docs(scene-workbench): document the splat pipeline and display panel

  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  ```

## Definition of Done

**Deliverable inventory**

- `tools/fetch/fetchSkraafoto.ts`, `tools/scene-recon/{bakeSplats.ts, pack/{splatFormat,packSplats}.ts, splats/{readGaussianPly,writeColmapModel}.ts, poses/{topocentricPositionsM,photoPoseFromStacItem}.ts, @types/SkraafotoStacItem.d.ts}`, `data/raw/skraafoto/README.md`, `skraafoto.dir`/`skraafoto.readme` registry rows, the grown `soendermarken.ts` group definition.
- `tools/scene-workbench/`: `@types/{GaussianSplatAsset,PhotoPose}.d.ts`, the grown `SceneAsset.d.ts`; `src/render/{shaders/splat.wesl, shaders/lib/sceneCamera.wesl, splatRenderer.ts, uploadGaussianSplat.ts}`; the grown `renderResources.ts`, `writeSceneCamera.ts`, `sceneCameraUniform.ts`, `lidarPoint.wesl`; `src/scene/{parseSplats.ts, assetCount.ts, sortSplatOrder.ts, loaders/loadGaussianSplat.ts}`; the grown `assetLoaders.ts`, `viewSlice.ts`, `DisplayPanel.tsx`, `LayerList.tsx`, `Viewport.tsx`, `syntheticProbeScene.ts`, `probeGpuErrors.ts`; `src/state/{commands.ts, splat/watchSplatSortSaga.ts}`; the grown `rootSaga.ts`.
- npm scripts: `fetch-skraafoto`, `bake-splats`.
- On disk (gitignored): `data/raw/skraafoto/skraafotos2025/*.json`/`*.jpg`, `data/raw/skraafoto/skraafotos2025/colmap-soendermarken/` (bake workdir), `public/data/geo3d/groups/soendermarken/assets/splats/splats.bin`, a `manifest.json` with a `gaussianSplat` asset entry.

**Named observable behaviours** (manual smoke on :5600, task 14)

- The splat layer renders over the LiDAR cloud in the same metre frame, alpha-blended, reading as photoreal detail rather than noise.
- The layer toggle and the two `DisplayPanel` sliders (splat scale, opacity) visibly affect the splat render without touching the LiDAR layer.
- Camera orbit re-sorts the splat draw order at each gesture-boundary commit; no console GPU validation errors.
- `npm run scene-workbench:probe` exits 0 with two assets in the synthetic scene.

**Deferral boundary** — out of scope for this plan, and for a reviewer to leave alone: the `cameraPoseSet` manifest asset and `poseOverlayRenderer` (frusta, click-to-project, opacity slider — plan 3), the nudge API and `SimilarityTransform` application in the splat renderer (plan 3 — every asset this plan bakes stays identity), `MeshAsset`/`meshRenderer`/`bakeMesh.ts` (plan 3), capture ingest (plan 4), a sort Worker (only if a real 1–2M-splat measurement shows a >50ms main-thread stall), `--max-frames`/per-direction subsampling in `fetchSkraafoto`, and the exact SH1 i8 scale factor / training-iteration budget (both operator judgements pending the real bake, spec §10).

---

## Self-review

### Spec-coverage table

| Spec section                                                                     | Plan task(s)                                                                                                                   |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| §3 Ground preparation                                                            | Already landed (#672) — cited in the header, no task                                                                           |
| §4 Data model delta (`GaussianSplatAsset`, `SceneAsset`, `PhotoPose`)            | Task 6 (`GaussianSplatAsset`/`SceneAsset`), Task 4 (`PhotoPose`)                                                               |
| §5 `splats.bin` byte layout                                                      | Task 1                                                                                                                         |
| §6 `fetchSkraafoto`                                                              | Task 3                                                                                                                         |
| §6 `groups/soendermarken.ts` field, `rawDataRegistry.ts` rows                    | Task 3                                                                                                                         |
| §6 `photoPoseFromStacItem`                                                       | Task 4                                                                                                                         |
| §6 `topocentricPositionsM`                                                       | Task 4                                                                                                                         |
| §6 `writeColmapModel`                                                            | Task 5                                                                                                                         |
| §6 `readGaussianPly`                                                             | Task 2                                                                                                                         |
| §6 `packSplats`                                                                  | Task 1                                                                                                                         |
| §6 `bakeSplats` orchestration                                                    | Task 7                                                                                                                         |
| §7.1 Asset loading (`ASSET_LOADERS` row, `SplatGpuAsset`, `parseSplats`)         | Task 1 (`parseSplats`), Task 6 (everything else)                                                                               |
| §7.2 `assetCount`                                                                | Task 6                                                                                                                         |
| §7.3 `SceneCamera` uniform growth                                                | Task 9                                                                                                                         |
| §7.4 `splatRenderer` and `splat.wesl`                                            | Task 11                                                                                                                        |
| §7.5 `watchSplatSortSaga`, `sortSplatOrder`                                      | Task 12                                                                                                                        |
| §7.6 UI (`DisplayPanel`, `LayerList`, `syntheticProbeScene`, probe selector fix) | Task 10 (`DisplayPanel`), Task 6 (`LayerList`), Task 13 (probe scene + selector fix)                                           |
| §8 Build wiring (npm scripts)                                                    | Task 3 (`fetch-skraafoto`), Task 7 (`bake-splats`)                                                                             |
| §9 Testing strategy                                                              | Distributed per-task above; "deliberately not tested" items honoured in Tasks 7, 11, 12                                        |
| §10 Open questions                                                               | Recorded as operator follow-ups in Task 8 (training budget, SH1 scale factor) and Task 3 (licence wording) — none block a task |
| §11 Decisions this spec made                                                     | Carried through verbatim into the relevant tasks' contracts (Tasks 1, 6, 9, 11, 5, 2)                                          |

### Placeholder scan

No `TBD`, `similar to task N`, or unfilled-in code stubs anywhere above. Two places require the _implementer_ to go get real external data before a value can be pinned (Task 3's licence wording, Task 4's fixture STAC item + hand-computed pixel) — both are given the exact procedure to derive the real value, matching plan 1 task 1's precedent (the DVR90 anchor height, also "read once" rather than invented).

### Type-name consistency

`GaussianSplatAsset`, `SceneAsset`, `SplatGpuAsset`, `GpuAsset`, `GaussianSplatRecord`, `ParsedGaussianSplats`, `PhotoPose`, `SkraafotoStacItem`, `CctRunner`, `BrushRunner`, `AssetCountDisplay`, `SceneCameraUniform` (existing) all used identically across every task that references them, matching the spec's own names except where explicitly flagged as an author's call (`CctRunner`/injected-dependency shape on `topocentricPositionsM`).

### Author's calls, collected

1. **Resequencing** (flagged prominently above the task list): the brief's items "(7) GaussianSplatAsset/SceneAsset union + assetCount + LayerList" and "(8) SplatGpuAsset + loadGaussianSplat + ASSET_LOADERS row + parseSplats" are merged into one task and moved to sit immediately before `bakeSplats` (this plan's Task 6, before Task 7) — required because `Record<SceneAsset['kind'], AssetLoader>` (already on `main`) and this plan's own `assetCount` table are both exhaustive over `SceneAsset['kind']`, and `npm run typecheck` spans both tsconfigs in one run.
2. `topocentricPositionsM` gains an injected `CctRunner` dependency not in the spec's literal 2-arg signature, for the same testability reason every other offline wrapper in this codebase (`PdalRunner`, `BrushRunner`) has one.
3. `SceneCamera`'s struct is extracted into a shared `lib/sceneCamera.wesl` module (Task 9) rather than duplicated verbatim into `splat.wesl` (Task 11) — the spec says the two renderers share the uniform but doesn't specify the WESL mechanism; duplicating the struct text would leave the parity test blind to `splat.wesl` drifting from `lidarPoint.wesl`.
4. `Viewport.tsx`'s `visibleAssets` helper needs a kind-narrowing fix the moment `GpuAsset` grows (Task 6), independent of the splat renderer existing — otherwise `GpuAsset` growth alone breaks the existing LiDAR draw path's typecheck.
5. `GaussianSplatRecord` is placed in `packSplats.ts` (mirroring `ScenePoint`'s home in `packPoints.ts`), not in `readGaussianPly.ts` where the spec's own prose introduces it.
6. `uploadGaussianSplat.ts` + `loadGaussianSplat.ts` split mirrors the existing `uploadPointCloud.ts`/`loadPointCloud.ts` split — the spec describes `loadGaussianSplat` as a single wrapper without naming this split.
7. `DisplayPanel`'s new slider ranges (`splatScale` 0.1–3, `opacityScale` 0–2) are not pinned by the spec.
8. Task 13's probe fix goes one call beyond the spec's literal "three checkbox calls" — the boot step's `getByText('ready').waitFor()` has the same two-match strict-mode risk once a second asset exists, and the task's own acceptance bar (`npm run scene-workbench:probe` exits 0) requires it.
9. `splat.wesl`'s two-pipeline-variant mechanism (how a single WESL module expresses two `@group(1)` layouts) is left as an implementation decision for Task 11's own file-header comment — WESL has no preprocessor, and the spec doesn't prescribe the mechanism, only the outcome.
