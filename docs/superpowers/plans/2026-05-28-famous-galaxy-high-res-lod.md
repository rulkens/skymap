# Famous-Galaxy High-Resolution LOD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the camera approaches a famous galaxy that has a curated 1024 px `full.webp`, fade in a per-galaxy hi-res texture sample over the standard 128 px atlas tile so the photo stays sharp on close approach. Bounded GPU memory (≤32 MB), graceful fallback for galaxies without a `full.webp`, R2-hosted asset path mirroring the `.bin` deploy story.

**Architecture:** A single `texture_2d_array` (N=8 layers, layer side tier-aware: 1024 on medium/large, 512 on small) holds the high-resolution images. A new planner subsystem walks Famous-source galaxies each frame, gates fetches on apparent diameter, allocates layers LRU-by-recent-apparent-diameter, and emits per-instance `hiResLayerIdx` + `hiResCrossfadeAlpha` for `texturedDiskSubsystem` to fold into its instance buffer. The fragment shader samples the array layer when `hiResLayerIdx >= 0` and blends with the existing atlas sample by the crossfade alpha. A new build step copies curator output to `public/images/famous-hires/`; `tools/deploy/syncR2.ts` ships those to R2 as `data/images/famous-hires/<id>.webp`.

**Tech Stack:** TypeScript, WebGPU (`texture_2d_array`, `copyExternalImageToTexture` with `[x, y, layerIndex]` destination origin), WESL shaders, Vitest. No new external libraries.

---

## Reading order before starting

1. Spec: `docs/superpowers/specs/2026-05-28-famous-galaxy-high-res-lod-design.md`.
2. ADR: `docs/adrs/0002-tiered-thumbnail-textures.md`.
3. `docs/superpowers/conventions/plan-style.md` — this plan follows the
   *contract code yes, implementation code no* rule. Implementers READ the cited
   files; the plan only pins contracts.
4. CLAUDE.md sections "Project conventions", "Deploy workflow", and the
   `feedback_*` / `project_*` memory references it points at.
5. `~/.claude/skills/wesl-shaders/SKILL.md` — required before Task R3.

## Open questions resolved upfront

Three spec ↔ existing-code mismatches were caught during plan-write. Resolve them
as follows in the implementation; flag with the user before deviating.

**Q1. Crossfade band: 200 → 260 px (spec header) vs 100 → 160 px (spec data flow
+ testing).** The spec is internally inconsistent. Use **200 → 260 px** — it
matches the spec's introductory table, the ADR's text ("blends … across the
200 → 260 px apparent-diameter band"), and the design intent (the atlas tile
owns the disk from 40 → 200 px so the user clearly perceives the standard tile
first). Tasks below pin this. The 100 / 130 / 160 px boundary pins in the
spec's "Testing" section are typos and should be 200 / 230 / 260.

**Q2. DiskInstance stride.** The spec claims "current instance layout has
padding; these consume two of those slots without stride change," but the
current layout has only ONE unused float (`orient.w`, see
`src/@types/rendering/DiskInstance.d.ts:1-31` and the renderer pack at
`src/services/gpu/renderers/texturedDiskRenderer.ts:84-100`). Two new fields
do not fit. **Grow the instance stride** to 16 floats / 64 bytes (four `vec4`s)
and add a corresponding fourth attribute at `@location(3)`. This touches the
shared `instancedQuadRenderer` factory (Task R2) since it bakes the 12-float /
48-byte stride at
`src/services/gpu/renderers/instancedQuadRenderer.ts:115-116, 199-213`.

**Q3. `dataUrl()` always prefixes `/data/`.** See
`src/services/loading/fetchWithProgress.ts:24-27`. Therefore
`dataUrl('images/famous-hires/foo.webp')` resolves to
`<base>/data/images/famous-hires/foo.webp`, and `syncR2.ts` must upload the
files under the R2 key `data/images/famous-hires/<id>.webp`. The spec's "no
API change" note holds, but the R2 key layout is `data/images/...` (not
`images/...`). Tasks A3 and B5 pin this.

---

## File map (pre-decomposition)

### Build + deploy seam (A)

- **Create** `tools/famous/copyHiResToPublic.ts` — idempotent copy of
  `public/images/famous-curated/<id>/full.webp` →
  `public/images/famous-hires/<id>.webp`.
- **Modify** `tools/deploy/syncR2.ts` — sweep `public/images/famous-hires/`
  and upload each as `data/images/famous-hires/<id>.webp`.
- **Modify** `package.json` — `build-famous-hires` script entry.
- **Modify** `.gitignore` — add `/public/images/famous-hires/` next to the
  existing `/public/data/` line.
- **Create** `tests/tools/famous/copyHiResToPublic.test.ts`.
- **Create** `tests/tools/deploy/syncR2.test.ts` *only* for the
  hi-res image sweep — keep the test focused on the new branch.

### GPU resource + planner subsystem seam (B)

- **Modify** `src/@types/rendering/DiskInstance.d.ts` — add `hiResLayerIdx`
  and `hiResCrossfadeAlpha`.
- **Modify** `src/@types/loading/FetchGalaxyBitmapInput.d.ts` — add
  `fetchHiRes?: boolean`.
- **Modify** `src/data/sources.ts` — add `HI_RES_LAYER_COUNT` and
  `HI_RES_LAYER_SIDE_BY_TIER` constants.
- **Create** `src/services/gpu/resources/hiResFamousTexture.ts`.
- **Create** `src/@types/rendering/HiResFamousTexture.d.ts` — public type.
- **Create** `src/services/engine/subsystems/hiResFamousSubsystem.ts`.
- **Create** `src/@types/engine/subsystems/HiResFamousSubsystem.d.ts`.
- **Modify** `src/utils/network/galaxyImageFetcher.ts` — hi-res branch.
- **Create** `tests/services/gpu/resources/hiResFamousTexture.test.ts`.
- **Create** `tests/services/engine/subsystems/hiResFamousSubsystem.test.ts`.
- **Create** `tests/utils/network/galaxyImageFetcher.test.ts` (extend or
  create — check before assuming).

### Renderer + shader seam (R)

- **Modify** `src/services/gpu/renderers/instancedQuadRenderer.ts` — grow
  per-instance stride to 16 floats / 64 bytes; add attribute @location(3).
  Constants `FLOATS_PER_INSTANCE` and `BYTES_PER_INSTANCE` propagate.
- **Modify** all three consumer renderers' pack loops to write 16 floats
  per instance (texturedQuad, texturedDisk, proceduralDisk). The new floats
  are zero-padding for quad + procedural consumers; only texturedDisk
  reads them in the shader.
- **Modify** `src/services/gpu/renderers/texturedDiskRenderer.ts` — encode
  `hiResLayerIdx` + `hiResCrossfadeAlpha`; pass a `bindHiResArray`
  function the engine can call once the texture exists.
- **Modify** `src/services/gpu/shaders/texturedDisks/io.wesl` — extend
  `InstanceIn` with the fourth vec4; extend `VsOut` with the two new
  varyings.
- **Modify** `src/services/gpu/shaders/texturedDisks/vertex.wesl` — plumb
  the two new fields through to `VsOut`.
- **Modify** `src/services/gpu/shaders/texturedDisks/fragment.wesl` —
  declare the new array binding + sampler, sample the layer (gated by
  `hiResLayerIdx >= 0`), blend with the existing atlas sample via the
  crossfade alpha.
- **Modify** `src/services/engine/subsystems/texturedDiskSubsystem.ts` —
  inject the hi-res subsystem as a dep; read per-galaxy state and write
  the two new instance fields.
- **Modify** `src/services/engine/phases/wireSlots.ts` — construct the
  hi-res texture + subsystem at bootstrap; bind into the renderer.
- **Modify** tests touching `texturedDiskSubsystem` to thread the new
  dep (a no-op stub by default).

---

# Section A — Build + deploy pipeline (4 tasks)

Self-contained: no runtime touch. Implementer may ship Section A as its own
sub-commit chain.

### Task A1: Copy hi-res WebPs to a flat public directory

**Files:**
- Create: `tools/famous/copyHiResToPublic.ts`
- Create: `tests/tools/famous/copyHiResToPublic.test.ts`

**Signature:**
```ts
// One module-default export OR a named `copyHiResToPublic` — pick one
// and stay consistent with the existing tools/famous/*.ts style
// (check buildFamous.ts for the convention).
export async function copyHiResToPublic(opts?: {
  sourceDir?: string; // defaults to 'public/images/famous-curated'
  destDir?: string;   // defaults to 'public/images/famous-hires'
}): Promise<{ copied: number; skipped: number; missing: string[] }>;
```

**Behaviour:**
- Iterates `<sourceDir>/<id>/full.webp` for every direct subdir of `sourceDir`.
- Writes each to `<destDir>/<id>.webp`. Skip when the dest exists AND has
  the same `mtime`/`size` as the source (idempotent rebuild — re-run is
  cheap).
- Records IDs missing a `full.webp` in the `missing[]` return so the caller
  can log them. Don't throw — graceful coverage is part of the spec.
- Creates `<destDir>` if absent.

**Steps:**

- [x] Write the failing test `copyHiResToPublic copies full.webp into a flat layout`
  using a tmpdir-backed source tree with two galaxy subdirs each holding a
  `full.webp` and asserting both files appear at `<dest>/<id>.webp`.
- [x] Write the failing test `copyHiResToPublic records IDs missing full.webp`
  asserting the `missing` array contains the ID whose subdir holds only
  `recipe.json`.
- [x] Write the failing test `copyHiResToPublic is idempotent on re-run`
  asserting that a second call with the same input copies zero files.
- [x] Implement against the existing `tools/famous/buildFamous.ts` patterns
  for path resolution + sync filesystem use (`node:fs/promises` is fine,
  pick what `fetchFamousImages.ts` already does).
- [x] `npm test -- copyHiResToPublic` → green.
- [x] Commit (specific file paths only; never `git add -A`).

### Task A2: Wire the npm script

**Files:**
- Modify: `package.json` (scripts block, ~line 33-45)

**Steps:**

- [x] Add `"build-famous-hires": "tsx tools/famous/copyHiResToPublic.ts"`
  alongside `build-famous` at `package.json:37`.
- [x] Add a thin `if (require.main === module)` style top-level invocation to
  `copyHiResToPublic.ts` so the npm script runs it (mirror the bottom of
  `tools/famous/buildFamous.ts`).
- [x] `npm run build-famous-hires` from a worktree with the curator
  output present → reports `copied: <n>`.
- [x] Commit.

### Task A3: Extend syncR2 ALLOW + uploader for hi-res images

**Files:**
- Modify: `tools/deploy/syncR2.ts` (ALLOW filter + main sweep, see lines 89-111 + 260-296)
- Modify: `tests/tools/deploy/syncR2.test.ts` (new file) OR adjacent existing test if one exists

**Design:**
- Add a parallel sweep for `public/images/famous-hires/*.webp` after the
  existing `public/data` sweep. Each becomes R2 key
  `data/images/famous-hires/<id>.webp` (preserving the `data/` prefix
  per Q3 above so `dataUrl('images/famous-hires/<id>.webp')` resolves
  cleanly).
- Reuse `uploadFile()` and `touchedKeys.push(key)` plumbing.
- Cache-Control unchanged (the shared `CACHE_CONTROL = 'public, max-age=86400'`).

**Steps:**

- [x] Write the failing test `syncR2 ALLOW accepts famous-hires images`
  asserting a function-level filter / inventory helper includes
  `c101.webp` from a fake `public/images/famous-hires/` listing.
  (Probably needs a small refactor exposing the inventory step as a
  pure function for testability — implementer decides whether to extract.)
- [x] Write the failing test `hi-res images upload with the data/images/
  famous-hires R2 key prefix` asserting the computed key for `c101.webp`
  is `data/images/famous-hires/c101.webp`.
- [x] Implement. Keep the loop body close in shape to the existing
  `for (const name of files)` block at `syncR2.ts:284-288`.
- [x] `npm test -- syncR2` → green.
- [x] Commit.

### Task A4: gitignore + repo state

**Files:**
- Modify: `.gitignore`

**Steps:**

- [x] Add `/public/images/famous-hires/` next to the existing
  `/public/data/` line at `.gitignore:125` with a one-line comment
  explaining it's a build artefact of `npm run build-famous-hires`.
- [x] `git status` after running `npm run build-famous-hires` →
  no `public/images/famous-hires/*` paths appear under "untracked".
- [x] Commit.

---

# Section B — GPU resource + planner subsystem (10 tasks)

Pure TypeScript; mockable WebGPU; unit-testable.

### Task B1: Add tier-aware constants

**Files:**
- Modify: `src/data/sources.ts`
- Modify: `tests/data/sources.test.ts`

**Contracts:**
```ts
export const HI_RES_LAYER_COUNT = 8 as const;

export const HI_RES_LAYER_SIDE_BY_TIER: Readonly<Record<Tier, number>> = {
  small: 512,
  medium: 1024,
  large: 1024,
} as const;
```

(Use the `Tier` import the file already has — see
`src/@types/data/Tier.d.ts`.)

**Steps:**

- [x] Add test `HI_RES_LAYER_SIDE_BY_TIER pegs small to 512 and medium/large to 1024`
  with three direct lookups.
- [x] Add test `HI_RES_LAYER_COUNT is 8` (one assertion — the constant is
  load-bearing for the texture allocation).
- [x] Implement the two exports near the other tier-scoped registry exports.
- [x] `npm test -- sources` → green.
- [x] Commit.

### Task B2: Extend DiskInstance type

**Files:**
- Modify: `src/@types/rendering/DiskInstance.d.ts`
- Modify: `src/@types/rendering/DiskInstance` consumers (renderer + subsystem) — they will not type-check until R1 lands; that's expected.

**Contract:** add two fields to the existing `type DiskInstance = { ... }`:
```ts
hiResLayerIdx: number;       // −1 sentinel = no hi-res slot
hiResCrossfadeAlpha: number; // [0, 1] crossfade ramp
```

Default sentinel is **−1**. Document this in the docblock alongside the
existing `fadeAlpha` note. Do NOT alter the field order of the existing
fields — only append.

**Steps:**

- [x] Edit the type with both fields + a 3-line docblock for each (see
  spec §"Approach" for the meanings).
- [x] `npm run typecheck` — expect failures at the renderer pack loop
  (`texturedDiskRenderer.ts:84-100`) and at `texturedDiskSubsystem.ts:235-247`
  which constructs `DiskInstance` literals. **Do not fix these here** —
  they are pinned in Tasks R1 + R4 with their own tests; leaving them red
  keeps the TDD signal clean.
- [x] Commit only the type change.

### Task B3: Extend FetchGalaxyBitmapInput

**Files:**
- Modify: `src/@types/loading/FetchGalaxyBitmapInput.d.ts`

**Contract:** add an optional flag:
```ts
/**
 * When true (with famousId set), fetch the hi-res WebP at
 * dataUrl('images/famous-hires/<famousId>.webp') instead of the curated
 * 128 px atlas tile at `/images/famous/<famousId>.webp`. Resizes to the
 * caller-provided dim via createImageBitmap. Returns null when the file
 * is missing (the 23/75 famous galaxies without `full.webp`).
 */
fetchHiRes?: boolean;
hiResTargetDim?: number; // pair with `fetchHiRes` — caller passes layerSide.
```

**Steps:**

- [x] Add both fields with the docblock above.
- [x] Commit.

### Task B4: Hi-res fetch branch in galaxyImageFetcher

**Files:**
- Modify: `src/utils/network/galaxyImageFetcher.ts` (extend the famous branch
  at lines 35-54).
- Modify or Create: `tests/utils/network/galaxyImageFetcher.test.ts` —
  check repo first; create if absent.

**Design:**
- When `fetchHiRes === true` AND `famousId` is set:
  - URL is `dataUrl('images/famous-hires/<famousId>.webp')` — NOT the
    relative `/images/famous/<id>.webp` path the standard branch uses.
  - `createImageBitmap(blob, { resizeWidth: hiResTargetDim, resizeHeight: hiResTargetDim })`.
  - On 404 or non-image content-type: return `null` (no DSS fallback).
- Otherwise: behaviour unchanged from current.

**Steps:**

- [x] Write the failing test `fetchHiRes loads from dataUrl + resizes to
  hiResTargetDim` using a `vi.spyOn(globalThis, 'fetch')` stub returning a
  fake `image/webp` Blob. Assert the call URL begins with the dataUrl
  prefix and that the resulting bitmap is `hiResTargetDim` square. Mock
  `createImageBitmap` if jsdom doesn't provide it (check what the existing
  test suite does for atlas tests).
- [x] Write the failing test `fetchHiRes returns null on 404` asserting
  no DSS / SDSS fallback fires.
- [x] Implement against the existing `tryFetch` + `createImageBitmap`
  pattern at `galaxyImageFetcher.ts:60-85`.
- [x] `npm test -- galaxyImageFetcher` → green.
- [x] Commit.

### Task B5: hiResFamousTexture — GPU resource class

**Files:**
- Create: `src/services/gpu/resources/hiResFamousTexture.ts`
- Create: `src/@types/rendering/HiResFamousTexture.d.ts`
- Create: `tests/services/gpu/resources/hiResFamousTexture.test.ts`

**Public type** (in the `.d.ts`, `type` alias only — never `interface`):
```ts
export type HiResFamousTexture = {
  initTexture(): void;                                    // creates the GPUTexture
  /** Returns layer index for `key`, allocating LRU if absent. -1 if full + cannot evict. */
  allocate(key: string, recentApparentDiameterPx: number): number;
  touch(key: string, recentApparentDiameterPx: number): void;
  release(key: string): void;
  /** Has a bitmap been uploaded into the layer? */
  isLoaded(key: string): boolean;
  /** Did the fetch fail permanently for this key? */
  isFailed(key: string): boolean;
  markFailed(key: string): void;
  /** Layer index for an existing key, undefined if not present. */
  layerForKey(key: string): number | undefined;
  /** Upload via copyExternalImageToTexture into the given layer. */
  uploadBitmap(layerIdx: number, bitmap: ImageBitmap): void;
  getTextureView(): GPUTextureView;
  setEvictHandler(handler: ((evictedKey: string) => void) | undefined): void;
  destroy(): void;
};

export type CreateHiResFamousTextureArgs = {
  device: GPUDevice;
  layerSide: number;   // 512 or 1024 from sources.ts
  layerCount: number;  // pass HI_RES_LAYER_COUNT
};
```

**Factory:**
```ts
export function createHiResFamousTexture(args: CreateHiResFamousTextureArgs): HiResFamousTexture;
```

**Implementation notes (no code in plan):**
- Mirror `src/services/gpu/resources/textureAtlas.ts` in shape — LRU
  bookkeeping is a port (the eviction recency signal is the
  recent-apparent-diameter, not `lastSeenFrame`; pick the LRU entry with
  the SMALLEST recorded diameter, per ADR 0002 + spec edge case "LRU
  eviction during crossfade"). Use a `Map<string, { layerIdx: number;
  recentPx: number; loaded: boolean; failed: boolean }>` plus a free-list.
- `initTexture()` calls `device.createTexture({ dimension: '2d', size:
  [layerSide, layerSide, layerCount], format: 'rgba8unorm-srgb', usage:
  TEXTURE_BINDING | COPY_DST })`.
- `uploadBitmap(layerIdx, bitmap)` uses
  `copyExternalImageToTexture({ source: bitmap, flipY: false }, { texture,
  origin: [0, 0, layerIdx] }, [layerSide, layerSide, 1])`.
- `getTextureView()` returns `texture.createView({ dimension: '2d-array' })`
  — the `'2d-array'` dimension on the view is what makes the WGSL
  `texture_2d_array<f32>` binding resolve.

**Tests** (use the same `FakeGPUDevice` pattern the existing
`tests/services/gpu/resources/textureAtlas.test.ts` uses; do NOT exercise
real WebGPU — just verify slot bookkeeping and the device-call shape):

- [x] Test `allocate returns sequential layers under capacity` — allocate 3
  distinct keys, expect indices 0, 1, 2.
- [x] Test `allocate returns the existing layer for a repeat key` —
  duplicate-key allocate hits the same layer.
- [x] Test `allocate evicts the LRU-by-recent-apparent-diameter layer when full` —
  fill 8 layers with diameters 250, 240, 230, 220, 210, 290, 280, 270; a
  9th allocate evicts the layer holding diameter 210.
- [x] Test `release frees the layer for re-allocation`.
- [x] Test `markFailed + isFailed survive multiple ticks`.
- [x] Test `setEvictHandler is fired BEFORE the slot is overwritten`
  (same invariant as `TextureAtlas`; see `textureAtlas.ts:184-194`).
- [x] Test `uploadBitmap on a real (mocked) device dispatches
  copyExternalImageToTexture with [0,0,layerIdx] origin`.
- [x] Test `getTextureView is built with dimension '2d-array'` —
  assert the spied `createView` call's first arg.
- [x] Implement.
- [x] `npm test -- hiResFamousTexture` → green.
- [x] Commit.

### Task B6: HiResFamousSubsystem public type

**Files:**
- Create: `src/@types/engine/subsystems/HiResFamousSubsystem.d.ts`

**Contract:**
```ts
export type HiResFamousFrameInput = {
  cam: OrbitCamera;
  catalogs: ReadonlyMap<SourceType, GalaxyCatalog>;
  visibleSourceMask: number;
  pxPerRad: number;
  famousMeta: ReadonlyArray<FamousMetaEntry>;
};

export type HiResFamousPerGalaxyState = {
  hiResLayerIdx: number;       // −1 if no hi-res
  hiResCrossfadeAlpha: number; // [0, 1]
};

export type HiResFamousFrameOutput = {
  /** Per-Famous-source local index → state. Missing keys default to
   *  { hiResLayerIdx: -1, hiResCrossfadeAlpha: 0 } at the consumer. */
  byFamousIdx: ReadonlyMap<number, HiResFamousPerGalaxyState>;
};

export type HiResFamousSubsystem = {
  runFrame(input: HiResFamousFrameInput): HiResFamousFrameOutput;
  lastOutput: HiResFamousFrameOutput;
  destroy(): void;
};
```

(Use `Vec3` from `src/@types/math/Vec3` if any future field needs it.
Never raw tuples.)

**Steps:**

- [x] Create the file with the four types + a docblock summarising the
  subsystem's job (mirror the docblock at the top of
  `src/@types/engine/subsystems/ProceduralDiskSubsystem.d.ts` — find via
  grep, the file already exists).
- [x] Commit.

### Task B7: hiResFamousSubsystem — planner

**Files:**
- Create: `src/services/engine/subsystems/hiResFamousSubsystem.ts`
- Create: `tests/services/engine/subsystems/hiResFamousSubsystem.test.ts`

**Factory signature:**
```ts
export type HiResFamousDeps = {
  readonly texture: HiResFamousTexture;
  readonly requestRender: () => void;
  /** For tests — defaults to fetchGalaxyBitmap. */
  readonly fetcher?: (args: FetchGalaxyBitmapInput) => Promise<ImageBitmap | null>;
  /** For tests — defaults to performance.now. */
  readonly now?: () => number;
};

export function createHiResFamousSubsystem(deps: HiResFamousDeps): HiResFamousSubsystem;
```

**Per-frame behaviour pinned by tests below:**
- **Gate:** only the Famous source is examined. Other source codes
  skipped entirely. (Source code from `src/data/sources.ts:43` — `Source.Famous`.)
- **Trigger threshold:** ignore galaxies with `apparentSizePx < 200`.
- **Crossfade alpha:**
  - `< 200`: `0`.
  - `200 → 260`: smoothstep `t * t * (3 - 2t)` over the band.
  - `> 260`: `1`.
- **LRU allocation:** on entering the gate, `texture.allocate(key, px)`;
  on subsequent frames within the gate, `texture.touch(key, px)`. Key is
  the FAMOUS-source local index encoded as a string (e.g. `String(idx)`),
  NOT the `ra,dec` key used for the atlas — the array is famous-only and
  the catalog row index is stable + unique.
- **Fetch enqueue:** when `!texture.isLoaded(key) && !texture.isFailed(key)`,
  call `fetcher({ ra, dec, famousId, fetchHiRes: true, hiResTargetDim: layerSide })`.
  On resolve: bitmap null → `markFailed`; bitmap not null → `uploadBitmap(layerIdx, bitmap)`
  and `requestRender()`. (Layer side is read from the texture — implementer
  may add a `getLayerSide()` accessor in Task B5 if it makes this cleaner.)
- **Output:** populate `byFamousIdx` map with the gated galaxies. Galaxies
  whose layer is allocated but bitmap not yet loaded should emit
  `hiResLayerIdx: -1, hiResCrossfadeAlpha: 0` (consumer treats this as
  "atlas tile only" — see Q1 for why the band starts at 200 px, well above
  the atlas tile's existing 24 → 40 px fade-in).

**Tests** (mirror `tests/services/engine/subsystems/proceduralDiskSubsystem.test.ts`
for the `makeDenseCloud` / `makeCam` / `makeInput` helper shape — keep
the catalog stubbed, gate the apparent size via cam.distance):

- [x] Test `runFrame emits hiResLayerIdx -1 for famous galaxies below the trigger band`
  (camera far enough that apparent diameter < 200 px) — assert
  `byFamousIdx.get(0)?.hiResLayerIdx ?? -1 === -1`.
- [x] Test `runFrame allocates a layer and emits the smoothstep alpha mid-band`
  — apparent diameter pinned to 230 px (camera distance tuned via the
  helper); after a stub-resolved fetch that fires the upload, the next
  frame's output has `hiResLayerIdx = 0` and `hiResCrossfadeAlpha ≈ 0.5`
  (smoothstep at midpoint). Allow ±1e-5 tolerance.
- [x] Test `crossfade alpha pinpoints` — three sub-tests at 200 / 230 /
  260 px asserting 0 / 0.5 / 1 (within tolerance).
- [x] Test `runFrame ignores non-Famous sources` — populate SDSS-source cloud,
  expect empty `byFamousIdx`.
- [x] Test `N=9 distinct famous galaxies in the band evict the smallest-recent layer`
  — feed 9 galaxies with descending diameters (300, 290, 280, ..., 220);
  after layer 8 (diameter 220), expect the LRU eviction to drop the
  diameter-220 layer (NOT a random one). Note: this targets the
  hiResFamousTexture's LRU policy from Task B5 — the subsystem just
  feeds it.
- [x] Test `fetcher null result calls markFailed and skips re-enqueue` —
  spy on `texture.markFailed`.
- [x] Test `destroy clears subscriptions` — texture's evict handler is
  reset.
- [x] Test `lastOutput mirrors the most recent runFrame return`.
- [x] Implement against the patterns in
  `src/services/engine/subsystems/texturedDiskSubsystem.ts` (camera-walk
  shape; squared-distance early-out; sticky-map handling). Famous source
  count is small (~75) so no decimation is needed — walk every row
  every frame.
- [x] `npm test -- hiResFamousSubsystem` → green.
- [x] Commit.

### Task B8: Integration sanity tests for the Section B seam

**Files:** wherever the existing engine-subsystem integration tests live (grep `tests/services/engine`).

This task is a CHECKPOINT, not a code task. After Section B is committed,
run the full suite and confirm no test outside the new files turned red.
If any did, fix in the same commit chain — Section B has no behavioural
fan-out beyond its own files, so any regression is a real bug.

- [x] `npm test` (full suite) → green.
- [x] Commit any fixes.

---

# Section R — Renderer + WESL shader (8 tasks)

The riskiest seam. WESL changes are the meticulous task — re-read
`~/.claude/skills/wesl-shaders/SKILL.md` first.

### Task R1: Grow per-instance stride to 16 floats / 64 bytes

**Files:**
- Modify: `src/services/gpu/renderers/instancedQuadRenderer.ts:115-116, 199-213`
- Modify: `src/services/gpu/renderers/texturedQuadRenderer.ts` (pack loop)
- Modify: `src/services/gpu/renderers/proceduralDiskRenderer.ts` (pack loop)
- Modify: `src/services/gpu/renderers/texturedDiskRenderer.ts:84-100` (pack loop)
- Modify: tests that snapshot the byte size, if any

**Contracts:**
- `FLOATS_PER_INSTANCE = 16` (was 12).
- `BYTES_PER_INSTANCE = 64` (was 48).
- Add a fourth attribute in the pipeline vertex layout:
  `{ shaderLocation: 3, offset: 48, format: 'float32x4' }`.
- All three consumers' pack loops grow to write 16 floats; the trailing 4
  are `0, 0, 0, 0` for quad + procedural; texturedDisk fills slot 12 with
  `hiResLayerIdx` and slot 13 with `hiResCrossfadeAlpha` (slots 14-15
  remain zero pad).

**Steps:**

- [x] Test (new or extended at the proceduralDiskRenderer + texturedQuadRenderer test
  sites) `pack writes 16 floats per instance — last 4 are zero for
  quads + procedural`. If those renderers don't yet have a pack-loop
  unit test, this is a no-op for them; the change is mechanical and the
  shader still reads the first 12 floats only, so visual behaviour is
  unchanged.
- [x] Update `FLOATS_PER_INSTANCE` + add the @location(3) attribute to
  the shared pipeline layout in `instancedQuadRenderer.ts`.
- [x] Update the three consumers' pack loops to write 16 floats (the new
  trailing 4 default to zero; texturedDisk writes its two hi-res floats
  per Task R4).
- [x] `npm run typecheck` + `npm test` → green.
- [x] Visual smoke (optional at this task): start the dev server, confirm
  rendering is unchanged — no shader yet reads the new attribute, so
  this should be a no-op visually.
- [x] Commit.

### Task R2: Extend the shared bind-group layout for the array binding

**Files:**
- Modify: `src/services/gpu/renderers/instancedQuadRenderer.ts:160-172` (BGL block)

**Design decision:** the array-texture binding is texturedDisk-specific
— quads + procedural don't need it. Two paths:

- **Path A (preferred):** extend `InstancedQuadConfig.atlas` with an
  optional `hiResArray?: true` flag; when set, the BGL adds bindings 3
  (array texture) and 4 (sampler). Atlas-less consumers and atlas-only
  consumers (quads) are unaffected.
- **Path B (fallback):** build a parallel BGL inside
  `texturedDiskRenderer.ts` and use a custom pipeline layout. More code
  duplication but isolates blast radius.

Pick Path A unless the diff feels worse on inspection. The
`feedback_generalize_repeated_fixes` memory tilts toward A.

**Steps:**

- [x] Test (new) `instancedQuadRenderer BGL includes hi-res array bindings when atlas.hiResArray is true`
  — assert via a `vi.spyOn(device, 'createBindGroupLayout')` that the
  `entries` array length grows from 3 to 5 when the flag is set.
- [x] Test `bindHiResArray` factory method only exists when the flag is set
  (same `if (atlas) {…}` discipline as the existing `bindAtlas`).
- [x] Implement extending the BGL builder + add a `bindHiResArray(view,
  sampler)` method on the returned `InstancedQuadRenderer`. The
  bindGroup recomposition happens at bind time, same shape as `bindAtlas`.
- [x] `npm test -- instancedQuadRenderer` → green.
- [x] Commit.

### Task R3: WESL shader updates (the meticulous task)

**Files:**
- Modify: `src/services/gpu/shaders/texturedDisks/io.wesl`
- Modify: `src/services/gpu/shaders/texturedDisks/vertex.wesl`
- Modify: `src/services/gpu/shaders/texturedDisks/fragment.wesl`

**Apply the wesl-shaders skill before editing.** Specifically watch for:
- No backticks in comments (single quotes for identifier refs).
- Imports stay at the top of each file.
- `package::` literal prefix.
- No brace-list imports.

**Contracts:**

`io.wesl` `InstanceIn` grows a fourth attribute:
```wgsl
struct InstanceIn {
  @location(0) posSize:  vec4<f32>,
  @location(1) uvRect:   vec4<f32>,
  @location(2) orient:   vec4<f32>,
  // x: hiResLayerIdx (cast to i32 in fragment; -1 = no hi-res slot)
  // y: hiResCrossfadeAlpha
  // z, w: reserved padding
  @location(3) hiRes:    vec4<f32>,
};
```

`io.wesl` `VsOut` grows two varyings (both flat-interpolated — the
layer-index discriminant CANNOT be linearly interpolated):
```wgsl
struct VsOut {
  @builtin(position) clipPos:             vec4<f32>,
  @location(0)       atlasUv:             vec2<f32>,
  @location(1)       cornerUv:            vec2<f32>,
  @location(2)       fadeAlpha:           f32,
  @location(3) @interpolate(flat) hiResLayerIdx:       i32,
  @location(4)                    hiResCrossfadeAlpha: f32,
};
```

`vertex.wesl`: pass `i32(instance.hiRes.x)` and `instance.hiRes.y`
through to `VsOut`.

`fragment.wesl`:
- Add the two new bindings AFTER the existing atlas binding pair
  (matches the BGL slot order from Task R2):
  ```wgsl
  @group(0) @binding(3) var hiResTex: texture_2d_array<f32>;
  @group(0) @binding(4) var hiResSmp: sampler;
  ```
- Sample the atlas tile as today (`rgba` variable).
- If `in.hiResLayerIdx >= 0`: sample the array layer with
  `textureSample(hiResTex, hiResSmp, in.cornerUv, in.hiResLayerIdx)` and
  `mix(rgba, hiResRgba, in.hiResCrossfadeAlpha)` to produce the final
  colour. Otherwise: use `rgba` unchanged.
- The luminance gate + circular mask + `fadeAlpha` multiplication chain
  stays as today, applied to the blended result.

A tiny before/after sketch for the fragment-stage colour line:
```wgsl
// before:
let lum = max(rgba.r, max(rgba.g, rgba.b));
let alpha = lumAlpha(lum, 0.05, 0.30) * mask * in.fadeAlpha;
// after:
var c = rgba;
if (in.hiResLayerIdx >= 0) {
  let hi = textureSample(hiResTex, hiResSmp, in.cornerUv, in.hiResLayerIdx);
  c = mix(c, hi, in.hiResCrossfadeAlpha);
}
let lum = max(c.r, max(c.g, c.b));
let alpha = lumAlpha(lum, 0.05, 0.30) * mask * in.fadeAlpha;
return vec4<f32>(c.rgb * alpha, alpha);
```
(See the existing fragment body at
`src/services/gpu/shaders/texturedDisks/fragment.wesl:42-60` for the
full surrounding context.)

**Steps:**

- [x] Apply wesl-shaders skill's pre-edit checklist.
- [x] Edit `io.wesl`: add the fourth `InstanceIn` attribute + the two
  `VsOut` varyings. Confirm comments use single quotes; no backticks.
- [x] Edit `vertex.wesl`: assign the two new varyings from `instance.hiRes.xy`.
  No other change — the disk-plane orientation math is unchanged.
- [x] Edit `fragment.wesl`: add the two new bindings; insert the
  conditional `mix` per the sketch above. (Smoke uncovered the WGSL
  uniformity rule — `textureSample` requires uniform control flow.
  Fixed by switching to unconditional `textureSampleLevel(..., 0.0)`
  with a `select`-gated mix factor; semantically equivalent.)
- [x] `npm run typecheck` → green (the `.wesl` is plugin-resolved at
  build time; TS sees it as `string`, so no surface here). Only the
  pre-existing B2-induced error at `texturedDiskSubsystem.ts:235`
  remains, slated for R5.
- [x] `npm run build` → WESL linker accepts the new shader (vitest
  pipeline tests exercise the `?static` link path). Full `npm run
  build` still blocks on the B2-induced typecheck until R5.
- [x] Visual smoke (dev server): the textured-disk thumbnails are
  intentionally missing in the interim — R3 flipped `hiResArray: true`
  on the inner factory so the BGL matches the shader's @binding(3,4),
  and R2's bind-group composition is gated on both `bindAtlas` AND
  `bindHiResArray` being called. R6 wires the latter; until then the
  bind group never composes and no textured disks draw. End-to-end
  smoke happens at R8.
- [x] Commit.

### Task R4: texturedDiskRenderer — wire bindHiResArray + pack the new fields

**Files:**
- Modify: `src/services/gpu/renderers/texturedDiskRenderer.ts`
- Modify: `src/@types/rendering/TexturedDiskRenderer.d.ts` — add
  `bindHiResArray(view: GPUTextureView): void`.

**Steps:**

- [x] Test (new or extend the existing renderer test if any) `pack writes
  hiResLayerIdx + hiResCrossfadeAlpha into slots 12 and 13` — feed a
  fake DiskInstance with `hiResLayerIdx: 3, hiResCrossfadeAlpha: 0.7`
  and inspect the packed Float32Array at offsets 12 + 13. (Done in
  R1's commit `feded7c`.)
- [x] Test `bindHiResArray forwards to the inner renderer's
  bindHiResArray` (spy pattern).
- [x] Implement: extend the pack loop at
  `texturedDiskRenderer.ts:84-100` to write 16 floats per instance; expose
  `bindHiResArray` on the returned `TexturedDiskRenderer`. Pass
  `atlas: { hiResArray: true }` in the `createInstancedQuadRenderer` call.
  (Pack loop in R1, forwarder + flag in R3 fix `c43d55f` to unblock the
  shader pipeline.)
- [x] `npm test -- texturedDiskRenderer` → green.
- [x] Commit.

### Task R5: texturedDiskSubsystem — fold hi-res state into instances

**Files:**
- Modify: `src/services/engine/subsystems/texturedDiskSubsystem.ts`
- Modify: `tests/services/engine/subsystems/texturedDiskSubsystem.test.ts`

**Dep extension:**
```ts
export type TexturedDiskDeps = {
  // existing fields...
  /** Optional. When provided, the planner reads hi-res state per
   *  Famous-source galaxy and folds hiResLayerIdx + hiResCrossfadeAlpha
   *  into the emitted DiskInstance. When omitted, both default to
   *  −1 / 0 for every instance — preserving pre-hi-res behaviour exactly. */
  readonly hiResFamous?: HiResFamousSubsystem;
};
```

**Behaviour:**
- The factory accepts the optional dep.
- Inside the per-instance emission at
  `texturedDiskSubsystem.ts:234-248`, after computing `fadeAlpha`, look
  up `hiResFamous?.lastOutput.byFamousIdx.get(i)` ONLY when
  `cloudSource === Source.Famous`. Default to `{ hiResLayerIdx: -1,
  hiResCrossfadeAlpha: 0 }` when missing. Write both into the emitted
  `DiskInstance` literal.
- Non-Famous sources unconditionally emit `hiResLayerIdx: -1,
  hiResCrossfadeAlpha: 0` — defensive, even though the new fields are
  never sampled for them.

**Steps:**

- [ ] Test `texturedDiskSubsystem emits hiResLayerIdx -1 by default` — no
  hi-res dep, no changes from current behaviour.
- [ ] Test `with hiResFamous dep, Famous-source DiskInstance gets the
  per-galaxy hi-res state` — stub a `HiResFamousSubsystem` whose
  `lastOutput.byFamousIdx` has `{0: {hiResLayerIdx: 2, hiResCrossfadeAlpha: 0.7}}`;
  assert the emitted DiskInstance for index 0 carries those values.
- [ ] Test `with hiResFamous dep, non-Famous source DiskInstance still
  defaults to -1 / 0` — sanity guard.
- [ ] Implement the dep extension + the per-emission lookup.
- [ ] `npm test -- texturedDiskSubsystem` → green.
- [ ] Commit.

### Task R6: wireSlots — bootstrap the texture + subsystem

**Files:**
- Modify: `src/services/engine/phases/wireSlots.ts` (the impostor-subsystem
  construction block at lines 266-294 is the right neighbour)

**Behaviour:**
- After `createGalaxyAtlasSubsystem` and before
  `createTexturedDiskSubsystem`, instantiate the hi-res texture at the
  tier-derived `layerSide`:
  ```ts
  const layerSide = HI_RES_LAYER_SIDE_BY_TIER[state.sources.tier];
  const hiResFamousTexture = createHiResFamousTexture({
    device,
    layerSide,
    layerCount: HI_RES_LAYER_COUNT,
  });
  hiResFamousTexture.initTexture();
  ```
- Construct the subsystem:
  ```ts
  const hiResFamous = createHiResFamousSubsystem({
    texture: hiResFamousTexture,
    requestRender: () => state.subsystems.scheduler.requestRender(),
  });
  ```
- Pass `hiResFamous` into `createTexturedDiskSubsystem` as the new dep.
- Bind the array view into the renderer:
  ```ts
  texturedDiskRenderer.bindHiResArray(hiResFamousTexture.getTextureView());
  ```
- Stash on `state.subsystems.hiResFamous` and
  `state.subsystems.hiResFamousTexture` (extend the EngineState type as
  needed — see `src/@types/engine/EngineState.d.ts` for the existing
  subsystems block).

**Steps:**

- [ ] Extend the `EngineState.subsystems` type with the two new handles.
- [ ] Add the construction block.
- [ ] Add a fade-handle registration if the renderer's master gate uses
  one — check whether `texturedDisks` has one already; if so, the hi-res
  array follows along under it (no separate gate needed per the ADR's
  single-bind-group + single-draw stance).
- [ ] `npm run build` → green.
- [ ] `npm test` → green (no test should fail at this seam if Tasks R1-R5
  are clean).
- [ ] Commit.

### Task R7: Tier-change teardown + recreate

**Files:**
- Modify: wherever `engine.setTier` lives (grep for `setTier` in
  `src/services/engine/`); often `runFrame.ts` or a sibling phase.
- Modify: `wireSlots.ts` may already host a tier-change hook; extend
  there if so.

**Behaviour (per spec § Edge cases):**
- On tier change: `hiResFamous.destroy()`, `hiResFamousTexture.destroy()`,
  then re-instantiate at the new `layerSide` and re-bind the renderer's
  hi-res view.
- All in-flight layer slots are discarded. The user perceives a brief
  loss of high-res on visible famous galaxies; they refetch + reload
  in the new dim.

**Steps:**

- [ ] Test (find the existing tier-change test surface; likely in
  `tests/services/engine/`) `tier change destroys + recreates the hi-res
  famous texture at the new layerSide`.
- [ ] Implement against the existing tier-change call graph. Match
  whatever pattern the cf4 / mcpm volumes use — they have analogous
  per-tier resources (`mcpm-<tier>.scfd`). See
  `src/services/loading/fetchers/mcpmFetcher.ts:21-30` and its consumers
  for the precedent.
- [ ] `npm test` → green.
- [ ] Commit.

### Task R8: Visual smoke attestation (manual)

**No code.** Required to claim Definition of Done.

- [ ] `npm run dev` from a worktree.
- [ ] Fly to M31 (search bar → "M31" or "Andromeda"). As apparent diameter
  crosses ~200 px, the photo visibly sharpens; the transition is smooth
  across the 200 → 260 px band; no pop at fetch-ready.
- [ ] Fly away. Confirm the atlas tile resumes ownership at smaller
  apparent size.
- [ ] Fly to an SDSS-only galaxy (any non-famous large galaxy). Confirm
  rendering is unchanged from main — hi-res tier is famous-only.
- [ ] Pick a famous galaxy known to be missing `full.webp` (cross-check
  against `public/images/famous-curated/`'s 17 directories that lack a
  `full.webp` — `find public/images/famous-curated -maxdepth 2 -name
  recipe.json | xargs -I{} dirname {} | while read d; do test ! -f
  "$d/full.webp" && basename "$d"; done`). Fly to one of those. Confirm
  the atlas tile keeps rendering normally — no shader fallback artefact.
- [ ] (DevTools network tab) Confirm the hi-res WebP fetches go to the
  R2-prefixed URL in production builds and to the relative
  `/data/images/famous-hires/<id>.webp` path in dev. (`npm run build &&
  npm run preview` lets you check both.)
- [ ] Add a one-paragraph attestation to the plan's commit message OR
  the PR body summarising what you saw.

---

# Definition of Done

This plan is **done** when ALL of the following hold:

- [ ] Every checkbox above is ticked (Sections A + B + R, all tasks).
- [ ] `npm test` is green — full suite, not just the new files.
- [ ] `npm run typecheck` is green for both `src` and `tools`.
- [ ] `npm run build` is green.
- [ ] The Task R8 visual smoke attestation is written down (commit
  message or PR body — pick one, don't duplicate).
- [ ] No new `TODO` comments without an owner + tracking item. `grep -rn
  'TODO\|FIXME' src/services/engine/subsystems/hiResFamousSubsystem.ts
  src/services/gpu/resources/hiResFamousTexture.ts
  src/services/gpu/shaders/texturedDisks/` returns zero rows unless the
  TODO references a follow-up GitHub issue.
- [ ] `git status` after a `npm run build-famous-hires` shows no
  `public/images/famous-hires/*` paths under "untracked" (Task A4 check).
- [ ] The R2 sync was verified end-to-end in a staging push: `npm run
  build-famous-hires && npm run sync-r2-secure` (from the main worktree,
  per `project_worktree_data_isolation`) lists the hi-res image keys in
  its purge call.
