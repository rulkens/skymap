# Terrain-RGB WebP height tiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development under [`sdd-execution.md`](../conventions/sdd-execution.md). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the raw-f32 `shgt1` height tile (a fixed 66,588 B) with a lossless Terrain-RGB WebP (~7 KB on average), cutting the height tree from 1.38 GB to ~140 MB and making a global z8–10 land expansion affordable.

**Architecture:** Heights are quantised to one global 0.1 m grid and packed into 24-bit RGB; the tile header travels in a custom `SHGT` RIFF chunk of an extended (VP8X) WebP. The bake rounds every post onto the grid _before_ deriving the header values, so parent/child nesting and shared tile edges stay bit-identical. The tools decode with `sharp` and a pure TS decoder; the runtime uploads the bitmap untouched and decodes in WGSL (Task 4), because canvas readback is perturbed by fingerprinting protection.

**Tech Stack:** TS, `sharp` (bake + tool read-back), `createImageBitmap` + `copyExternalImageToTexture` + WGSL (runtime), Vitest.

**Spec:** none. The user chose a short plan after an in-session design pass (2026-09-16), so the design lives here. Measurements: scratchpad `heightcomp/` (`exp.py`, `rgb.py`, `all.py`).

## Design (ratified in session)

- **Encoding:** `code = R·65536 + G·256 + B`, `heightM = fround(HEIGHT_CODE_OFFSET_M + code · HEIGHT_CODE_STEP_M)`, with offset −32768 m and step 0.1 m. A single global step keeps shared edges bit-exact: two neighbours round the same float to the same code. A per-tile scale is what would break that.
- **Header** in a `SHGT` chunk rather than in the pixels. Mapbox ships no header, but it computes min/max client-side; ours bounds the whole _descendant subtree_ and the residual needs the children, so it must be baked. Chunk placement was checked: `sharp` decodes a VP8X + VP8L + trailing unknown chunk bit-exactly (scratchpad `heightcomp/riff.mjs`). Chrome is checked in Task 3.
- **Measured** (0.1 m, `cwebp -lossless -z 9`, 40 tiles per level): z3–7 ≈ 7–9 KB, z8–13 ≈ 8–17 KB, z14–19 ≈ 1.8–7 KB. Total ≈ 138 MB against 1,377 MB raw.
- **No source-bounds widening.** `heightTileBounds` already unions this tile's (quantised) posts with the on-disk children's quantised subtree bounds, and bands bake deepest-first. The raw source range only adds between-post peaks, so no quantised post can escape the union.

## Ground preparation

None needed, because the format already sits behind single choke points: `heightTileFormat.ts` (layout), `encodeHeightTile` (the only writer), `decodeHeightTile` (the only parser), `surfaceTilePath` (the only extension) and `TILE_PREFIX` (the only version). The change replaces each in place.

## Global Constraints

- Quantisation: offset **−32768 m**, step **0.1 m**, code range **[0, 0xFFFFFF]**; out-of-range or non-finite input throws at encode.
- `HEIGHT_POSTS_PER_TILE` stays **129**; the image is **129 × 129**, RGB, lossless.
- `TILE_PREFIX` becomes **`earth-tiles/v9`**; the height extension becomes **`.webp`**.
- One symbol per file in `utils/` (src and tools); `type` aliases only; comment budget per `comments.md`.
- Every implementer brief says: "move/rename TS files only via `npm run move-files`" (none are expected here).

## SHGT chunk layout (little-endian, 16-byte payload)

| off | size | type | field                                          |
| --- | ---- | ---- | ---------------------------------------------- |
| 0   | 2    | u16  | `HEIGHT_TILE_VERSION` = **2**                  |
| 2   | 2    | u16  | posts per edge = `HEIGHT_POSTS_PER_TILE` (129) |
| 4   | 4    | f32  | `subtreeMinM`                                  |
| 8   | 4    | f32  | `subtreeMaxM`                                  |
| 12  | 4    | f32  | `geometricResidualM`                           |

File shape: `RIFF <size> WEBP` · `VP8X` (10-byte payload, flags 0, canvas w−1 / h−1 as 24-bit LE) · the encoder's `VP8L` chunk unchanged · `SHGT` (16 bytes). An odd-sized chunk is followed by one pad byte (RIFF rule), which readers must skip.

---

### Task 1: Terrain-RGB codec, SHGT chunk, pure decoder

review: yes (binary format)

**Files:**

- Modify (rewrite): `src/data/scene/heightTileFormat.ts`. Keep `HEIGHT_POSTS_PER_TILE`, `HEIGHT_TILE_POST_COUNT`, `HEIGHT_TILE_VERSION` (→ 2). Delete the `shgt1` offsets, `HEIGHT_TILE_MAGIC` and `HEIGHT_TILE_BYTES`. Add `HEIGHT_TILE_CHUNK_FOURCC = 'SHGT'`, `HEIGHT_TILE_CHUNK_BYTES = 16`, the five chunk offsets from the table, `HEIGHT_CODE_OFFSET_M = -32768`, `HEIGHT_CODE_STEP_M = 0.1` and `HEIGHT_CODE_MAX = 0xffffff`. The layout table above becomes its header comment.
- Create: `src/utils/scene/heightCode.ts`, `src/utils/scene/codeHeightM.ts`, `src/utils/image/readRiffChunk.ts`
- Create: `tools/utils/image/appendWebpChunk.ts`, `tools/utils/textures/quantizeHeightGrid.ts`
- Modify (rewrite): `src/utils/scene/decodeHeightTile.ts`, `tools/utils/textures/encodeHeightTile.ts`
- Test (rewrite): `tests/utils/scene/decodeHeightTile.test.ts`. Create: `tests/utils/image/readRiffChunk.test.ts`

**Interfaces (produces):**

```ts
heightCode(heightM: number): number            // Math.round((h − OFFSET)/STEP); throws if non-finite or outside [0, HEIGHT_CODE_MAX]
codeHeightM(code: number): number              // Math.fround(OFFSET + code * STEP)
readRiffChunk(bytes: Uint8Array, fourcc: string): Uint8Array | null   // null unless bytes are RIFF…WEBP and contain the chunk
appendWebpChunk(webp: Uint8Array, width: number, height: number, fourcc: string, payload: Uint8Array): Uint8Array
                                               // input must be a simple (non-VP8X) WebP; throws otherwise
quantizeHeightGrid(heightM: Float32Array): void          // in place: v ← codeHeightM(heightCode(v))
encodeHeightTile(tile: HeightTile): Promise<Uint8Array>  // sharp lossless RGB 129², then appendWebpChunk
decodeHeightTile(
  pixels: { data: ArrayLike<number>; width: number; height: number; channels: 3 | 4 },
  chunk: Uint8Array,
): HeightTile
```

`encodeHeightTile` throws on a wrong post count and on any post that is off the grid (`codeHeightM(heightCode(v)) !== v`). That refusal is the bake's guarantee that the file stores exactly what the header was computed from. `decodeHeightTile` throws on a chunk shorter than `HEIGHT_TILE_CHUNK_BYTES`, a version ≠ 2, a posts field ≠ 129, or pixel dimensions ≠ 129². It reads R, G and B per pixel at stride `channels` and never touches alpha. `HeightTile` (`src/@types/scene/HeightTile.d.ts`) keeps its shape; only its doc comment changes (`shgt1` → the Terrain-RGB WebP).

- [x] Test `heightCode inverts codeHeightM across the code range`: codes 0, 1, 2²³, `HEIGHT_CODE_MAX` and 10k seeded random codes all satisfy `heightCode(codeHeightM(c)) === c` (f32 slop stays far under half a step).
- [x] Test `heightCode rejects a height below the offset, above the range, and NaN`.
- [x] Test `round-trips a quantised tile bit-exactly through encode, sharp decode and decodeHeightTile`: posts span −430 … 8848.9 m. After `sharp(bytes).raw()` and `readRiffChunk`, every post plus `subtreeMinM`, `subtreeMaxM` and `geometricResidualM` compare `Object.is`-equal.
- [x] Test `decodes 4-channel pixels identically to 3-channel`: same tile, alpha 255 interleaved. This is the browser canvas path.
- [x] Test `encodeHeightTile refuses a post off the 0.1 m grid` (e.g. 12.34 m) and `refuses a wrong post count`.
- [x] Test `decodeHeightTile rejects a short chunk, a wrong version and a 128² image`.
- [x] Test `readRiffChunk returns null for non-RIFF bytes (an HTML error page) and for a WebP without the chunk`.
- [x] Test `readRiffChunk skips the pad byte after an odd-sized chunk`: build a file with an odd-sized chunk placed before `SHGT`.
- [x] Implement. Delete the old tests (magic, unaligned byteOffset, non-finite post); the new format makes all three impossible.
- [x] `npm run typecheck:fast` + `npx vitest run tests/utils/scene/decodeHeightTile.test.ts tests/utils/image/readRiffChunk.test.ts`. Typecheck errors at the old call sites (`fetchHeightTile`, `bakeHeightLevel`, `buildSurfaceTiles`, `bakeHeightLevel.test.ts`) are expected and belong to Task 2. Leave them failing and name them in the reply.
- [x] Commit: `feat(terrain): Terrain-RGB WebP height tile codec with SHGT header chunk`.

### Task 2: Wire the codec through bake, tool read-back, runtime fetch and docs

**Files:**

- Create: `tools/utils/textures/readHeightTileFile.ts`: `readHeightTileFile(path: string): Promise<HeightTile | null>` (null when the file is absent; otherwise `sharp(path).raw()` plus `readRiffChunk`, and throws when the chunk is missing, because a tool-side file without its header is a broken bake, not a 404).
- Modify: `tools/textures/bakeHeightLevel.ts`. `readTileIfPresent` (`:144-148`) is replaced by `readHeightTileFile` (await the four children). Call `quantizeHeightGrid(own)` after the finite-post check (`:265-270`) and before `heightTileBounds`/`residualAgainstChildren`, then `await encodeHeightTile(tile)` (`:287`).
- Modify: `tools/textures/buildSurfaceTiles.ts`. Delete `readHeightTile` (`:373-378`) in favour of `readHeightTileFile` (`printWaterDiagnostics` becomes await-per-tile). Set `TILE_PREFIX` (`:170`) → `v9`.
- Modify: `src/utils/scene/surfaceTilePath.ts`: `EXT.height` → `'webp'`, and fix the doc comment.
- Modify: `src/utils/network/fetchHeightTile.ts`. The steps are: bytes → `readRiffChunk` (null → return null) → `createImageBitmap(new Blob([bytes], { type: 'image/webp' }), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })` → `OffscreenCanvas(129, 129)`, 2d context `{ willReadFrequently: true }` → `getImageData` → `decodeHeightTile({ …, channels: 4 }, chunk)`. `bitmap.close()` runs in a `finally`. Any failure still degrades to `null`; update the doc comment (the magic check is replaced by the missing chunk / failed image decode). No unit test: jsdom has no `createImageBitmap`, and Task 3's browser check covers it.
- Modify (comment-only sweep of `shgt1`): `src/@types/scene/HeightTile.d.ts`, `src/@types/engine/subsystems/SurfaceTileSubsystem.d.ts:55`, `src/services/engine/subsystems/surfaceTileSubsystem.ts:81,261`, `tools/textures/voidFilledHeightSource.ts:4`, `tests/utils/scene/cutSurfaceTiles.test.ts:938`.
- Modify: `tests/tools/textures/bakeHeightLevel.test.ts`. The `:74` read helper becomes `readHeightTileFile`; existing assertions stand (adjacent columns bit-equal, parent = child posts, subtree bounds, north row first, skip existing).
- Modify: `docs/DATA.md:194,198` (v9; `height/<z>/<x>/<y>.webp`, the encoding formula, the SHGT chunk, and the quantise-before-header rule as a third crack-free rule). `docs/DEPLOY.md:47` (v9) plus a v8 → v9 release-order paragraph: server-side copy `v8/albedo` → `v9/albedo`, bulk-upload `v9/height`, manifest last.

- [x] Test (new, in `bakeHeightLevel.test.ts`) `quantises every post before deriving the header`. The analytic field is off-grid by construction. Assert every decoded post is on the grid, and that `subtreeMinM`/`subtreeMaxM` equal the min/max of the decoded posts plus children, using a variant of `analyticSource` whose `boundsInBox` returns `null`. Without the quantise call the encoder throws, so this test guards the call's _placement_ (header derived after rounding).
- [x] Wire everything above; the existing bake tests pass unchanged apart from the read helper.
- [x] `npm run typecheck:fast` + `npx vitest run tests/tools/textures tests/utils/scene tests/services/engine/subsystems/surfaceTileSubsystem.test.ts`.
- [x] Commit: `feat(terrain): bake and fetch height tiles as Terrain-RGB WebP under earth-tiles/v9`.

### Task 3 (controller): browser check, v9 bake, eye-check

**Files:** none committed (data only). Scratchpad scripts only.

- [x] **Bake from the MAIN checkout's cwd with the worktree's code** (`rawDataPath`/`outDir` are cwd-relative):
  1. Clone the albedo tree: `cp -Rc public/data/images/earth-tiles/v8/albedo public/data/images/earth-tiles/v9/albedo` (APFS clone, no extra disk). The bake's per-tile `existsSync` skip then leaves albedo untouched.
  2. `npx tsx .claude/worktrees/terrain-rgb-webp-height-tiles/tools/textures/buildSurfaceTiles.ts` (full run, not `--only`: a prefix bump makes `--only` illegal).
  3. `npm run build-data-manifest`.
- [x] **Verify the bake** with a scratchpad script over every v9 height tile against its v8 `.bin`: same tile set (20,684); max |post Δ| ≤ 0.05 m + f32 slop; `subtreeMin ≤ every post ≤ subtreeMax`; residual within 0.1 m of v8. Report total bytes (expect ≈ 140 MB).
- [x] **Chrome decode check:** worktree dev server (`/link-data`, then `/dev`). In devtools, run `fetchHeightTile` on 3 tiles (z7, z13, z19) and compare to the Node decode of the same files (checksum of `heightM` bytes). They must be identical. (Done against the Task 2 canvas path: 252 tiles identical in Chrome, perturbed in Brave, which led to Task 4. Superseded by Task 4's browser check.)
- [x] **User eye-check** (hard reload): relief over Søndermarken (z19), Everest and Grand Canyon (z13), and a global z5 view looks the same as v8. No cracks at tile seams or level steps, and no height-fetch errors in the console.
- [x] Ask about the perf gate (per `sdd-execution.md`; user: no perf gate); if yes, `npm run perf --url <worktree server>` before and after, watching main-thread decode cost during a fly-in.

### Task 4: Decode heights in the shader, not through a canvas

review: yes (shaders, TS↔WGSL contract)

**Why (found in Task 3):** Brave's fingerprinting protection perturbs `getImageData`. In the user's Brave tab, tile 19/280352/50000 decoded with 313 spike posts while Chrome was byte-identical. The same perturbation hits Safari (fingerprinting protection) and Firefox (`resistFingerprinting`), and Brave also perturbs WebGL `readPixels`, so the fix is to never read decoded pixels back. The bitmap goes straight to the GPU with `copyExternalImageToTexture`, and the shader turns RGB into metres. The CPU only needs the `SHGT` header, which it reads from the raw fetched bytes.

**Files:**

- Create: `src/utils/scene/decodeHeightTileHeader.ts`, `src/@types/scene/HeightTileHeader.d.ts`, `src/@types/scene/HeightTileImage.d.ts`
- Modify: `src/utils/scene/decodeHeightTile.ts` (header parsing delegates to `decodeHeightTileHeader`), `src/@types/scene/HeightTile.d.ts` (`HeightTileHeader & { heightM }`)
- Modify: `src/utils/network/fetchHeightTile.ts` → returns `HeightTileImage | null`. `createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })`; if the bitmap isn't 129 × 129, close it and return null. No canvas, no `decodeHeightTile`.
- Modify: `src/services/engine/subsystems/surfaceTileSubsystem.ts`:
  - `HEIGHT_ATLAS_FORMAT` (`:58`) → `'rgba8unorm'` (never `-srgb`: the bytes are codes, not colour).
  - The height stream becomes `TileStreamSubsystem<HeightTileImage>`. Upload is `uploadBitmapToAtlas(atlas, slot, image.bitmap)`, release is `image.bitmap.close()`, and `subtreeRangeM` comes from the header.
  - Its doc comments also update.
- Delete: `TextureAtlas.uploadTexels` (`src/services/gpu/resources/textureAtlas.ts:183-200`), which has no caller left, plus any test of it.
- Modify: `src/services/gpu/shaders/bodies/earthSurfaceTile/lattice.wesl`. Add `fn postHeightM(tex: texture_2d<f32>, coord: vec2<u32>) -> f32` and route all eight `textureLoad(...).r` reads (`:14-17`, `:32-35`) through it. Update the height-atlas comments in `fragment.wesl:19-20`, `io.wesl:54` and `docs/RENDERER.md:28` (`r32float` → `rgba8unorm` Terrain-RGB).
- Modify: the WGSL constant source the renderer already shares with TS (see `tests/services/gpu/shaders/constants.parity.test.ts` for how constants are mirrored) to carry `HEIGHT_CODE_OFFSET_M` and `HEIGHT_CODE_STEP_M`, and add them to that parity test.
- Modify: `tests/services/engine/subsystems/surfaceTileSubsystem.test.ts` (height fetch mocks return `HeightTileImage`) and `tests/utils/scene/decodeHeightTile.test.ts` (the header-offset test targets `decodeHeightTileHeader`).

**Interfaces (produces):**

```ts
type HeightTileHeader = { readonly subtreeMinM: number; readonly subtreeMaxM: number; readonly geometricResidualM: number };
type HeightTileImage = HeightTileHeader & { readonly bitmap: ImageBitmap };
decodeHeightTileHeader(chunk: Uint8Array): HeightTileHeader   // same throws as today: short chunk, version ≠ 2, posts ≠ 129
fetchHeightTile(tile: SurfaceTileId, prefix: string): Promise<HeightTileImage | null>
```

```wgsl
// Terrain-RGB: exact bytes via textureLoad (never a sampler), then
// OFFSET + code * STEP; code < 2^24 is exact in f32.
fn postHeightM(tex: texture_2d<f32>, coord: vec2<u32>) -> f32
```

Contract notes for the implementer:

- Decode with `round(texel.rgb * 255.0)`, never truncate, and build the code from integers (`(r << 16) | (g << 8) | b`) before the single `f32` multiply. Two tiles sharing an edge then decode that post to the same `f32`, which keeps seams closed.
- The result may differ from the CPU's `codeHeightM` by about one f32 ulp. That is accepted; say so in the helper's comment, in one line.
- Bilinear blending (`latticeHeightM`) must stay on decoded heights, never on encoded bytes. It already is if only the loads change.
- Read `.claude/skills/wesl-shaders/SKILL.md` and `docs/RENDERER.md` first. WGSL comments contain no backticks. Explicit bind-group layouts stay explicit (no `'auto'`). Never pass a storage struct by value to a WGSL fn (an Adreno landmine). If the atlas `texture_2d<f32>` binding's `sampleType` is declared `'unfilterable-float'`, change it to `'float'`, or leave it if still valid for `rgba8unorm`, and name which one you did.
- No new unit test for `postHeightM`: there is no WGSL runner in the suite, the constants parity test pins the numbers, and the controller verifies the formula visually in Brave and Chrome.

- [x] Implement the above. `npm run typecheck:fast` + `npx vitest run tests/utils/scene tests/services/engine/subsystems tests/services/gpu tests/tools/textures`.
- [x] Commit: `fix(terrain): decode Terrain-RGB heights in the shader, not via canvas readback`.
- [x] Controller: hard-reload in Brave (Shields on) and Chrome. Relief matches with no spikes. The height atlas shows no WebGPU validation errors in the console.

## Execution

- Dispatch A = Task 1 (Opus, `review: yes`, one mid-branch review against the Design + chunk table above).
- Dispatch B = Task 2 (Sonnet).
- Task 3 is controller-run.
- One final whole-branch review; CI is the gate.
- The fresh worktree has no `node_modules`: run `npm ci` once before Dispatch A.

## Definition of Done

- **Deliverables:**
  - `heightCode`, `codeHeightM`, `readRiffChunk`, `appendWebpChunk`, `quantizeHeightGrid` and `readHeightTileFile` exist, one per file.
  - `encodeHeightTile` is async and writes WebP with an SHGT chunk.
  - `decodeHeightTile` takes pixels + chunk.
  - `TILE_PREFIX` is `earth-tiles/v9`; height paths end in `.webp`.
  - No `shgt1` / `HEIGHT_TILE_MAGIC` / `HEIGHT_TILE_BYTES` references remain outside `*/completed/` and the per-planet terrain spec.
- **Observable behaviours:**
  - v9 height tree ≈ 140 MB with the same 20,684 tiles as v8.
  - Browser-decoded posts are byte-identical to the Node decode.
  - No spikes in Brave with Shields on (heights decode on the GPU; no canvas readback anywhere on the height path).
  - Relief at Søndermarken, Everest, Grand Canyon and the global view matches v8 by eye, with no seam or level-step cracks and no height-fetch console errors.
- **Deferred:**
  - Global z8–10 EOX albedo/height expansion (the reason for this change; its own plan).
  - R2 sync of v9: after merge, from main, per the new DEPLOY.md order, on the user's go.
  - Deleting local v8 / R2 v8 prune.
  - iOS Safari and Adreno device checks.
