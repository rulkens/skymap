# Galaxy Impostor Subsystem Split

**Date:** 2026-05-12
**Status:** Spec
**Related:**
- Future sibling: GPU timestamp-query debug instrumentation (to be specced after this lands). This restructure exists in part to give that work a clean architecture to attach to — three LOD-aligned passes instead of one kitchen-sink pass.
- [Scalar Volume Renderer (2026-05-09)](2026-05-09-scalar-volume-renderer-design.md) — precedent for a renderer-with-shared-infra split (renderer + per-field draws); this spec applies the same shape to galaxy impostors.

## Goal

Restructure the galaxy-rendering pipeline so its three LOD levels each have a single-responsibility home in the engine state. Replace the current `thumbnailSubsystem` — which conflates a per-frame catalog walk, a GPU texture atlas, a bitmap fetch queue, fade-state bookkeeping, and a three-way render dispatch — with three smaller subsystems aligned to what they actually do. Rename the two LOD-2 renderers (`diskRenderer`, `thumbnailRenderer`) so the disk/quad naming reads as the symmetric pair it is, not as one renderer plus a generically-named sibling.

The restructure is scoped to galaxy rendering. Filaments, volumes, and overlays/labels are not touched.

## Non-goals (this spec)

- **GPU timing instrumentation.** Each LOD pass still draws into the existing single HDR render pass. Splitting the encoder so per-pass `timestamp-query` slots can attach is a separate spec that lands on top of this one.
- **Rendering output changes.** The pixels on screen MUST be byte-identical before and after this refactor. Additive blending into the same HDR target is order-independent (`srcFactor: one, dstFactor: one`, `depthWriteEnabled: false`), so reordering draws within the pass is safe, but no parameter, threshold, or shader is changed.
- **Renderer file deletions.** The four galaxy renderers (`pointRenderer`, `proceduralDiskRenderer`, `texturedDiskRenderer`, `texturedQuadRenderer`) all survive. Their `draw()` signatures stay as-is.
- **Unifying disk and quad pipelines.** The two LOD-2 render pipelines remain distinct — same atlas, different geometry/shader. A future spec could unify them with an instance-buffer flag, but that's pipeline-implementation work, not LOD restructuring.
- **Touching the parallel TS-types consolidation.** New types land in `src/@types/` per concern; one existing types file is edited; `@types/index.d.ts` is not touched. No type renames outside the new files.
- **LOD 0 changes.** Point sprites are already structurally clean (renderer + static data + pass entry, no subsystem) and stay that way.

## Background — the LOD ladder, as it actually is

Verification pass against the code (`thumbnailSubsystem.ts:87-154`, `:688-906`, `shaders/colorFragment.wesl:74-89`) confirms three LOD levels:

| LOD | Active apparent-size band | Renderer | Per-frame inputs |
|---|---|---|---|
| **0 — point sprite** | 0 → 14 px (full alpha 0–8, smoothstep fade-out 8–14) | `pointRenderer` | Pre-loaded `PointCloud` buffers only; fade is per-fragment in WGSL |
| **1 — procedural disk** | 8 px → ∞ (smoothstep fade-in 8–14, full alpha 14+) | `proceduralDiskRenderer` | Catalog walk → per-frame `ProceduralDiskInstance[]` (position, axisRatio, PA, colourIndex, crossfade α) |
| **2 — textured impostor** | 24 px → ∞ AND bitmap loaded (smoothstep fade-in over 8 px band + load-fade over 400 ms) | `texturedDiskRenderer` OR `texturedQuadRenderer` (per-galaxy choice, see below) | Catalog walk → 2048² atlas slot → bitmap fetch → per-frame `DiskInstance[]` + `ThumbnailInstance[]` |

LOD 1 and LOD 2 **stack rather than replace**: at high zoom both render simultaneously, with LOD 1 acting as a fallback during the load-fade window and for galaxies whose bitmap fetch permanently failed. Removing the procedural-disk pass leaves visible gaps in those windows.

### Inside LOD 2 — the disk-vs-quad choice

The choice between `texturedDiskRenderer` and `texturedQuadRenderer` is **per-galaxy and metadata-based**, not zoom-based. From `thumbnailSubsystem.ts:820`:

```ts
if (px > DISK_THRESHOLD_PX && Number.isFinite(ar) && Number.isFinite(pa)) {
  // emit DiskInstance — 3D-oriented elliptical bitmap, masked by the disk shader
} else {
  // emit ThumbnailInstance — screen-aligned flat textured quad (fallback)
}
```

`DISK_THRESHOLD_PX = 4`. In practice the `px > 4` gate is near-no-op: galaxies only get to this branch after passing the `px ≥ 24` bitmap-fetch gate, so `px > 4` is virtually always true. The deciding factor is whether `axisRatio` and `positionAngleDeg` are finite, which is a function of the source catalog:

- SDSS rows mostly have orientation data → mostly textured-disk.
- 2MRS rows have `b/a` but no PA → fall to textured-quad.
- GLADE rows rarely have orientation → mostly textured-quad.
- Synthetic-fallback rows have neither → always textured-quad.

The textured-quad pipeline is the **fallback for galaxies missing orientation data**, not a separate LOD level. There is no "LOD 3."

### Why one big subsystem grew

`thumbnailSubsystem.ts` (current name) accreted four responsibilities in one file:

1. **Per-frame catalog walk** (`runFrame`, lines 487-926) — apparent-size cull, stride decimation, sticky maps, sort.
2. **Texture atlas** — 2048² GPU texture, slot allocation, LRU eviction.
3. **Bitmap fetch queue** — priority queue, concurrency-4 limit, failure memoisation, idempotent enqueue.
4. **GPU dispatch** — three back-to-back `renderer.draw(...)` calls (`:955-991`) into the shared render pass.

The name dates from when only the textured-quad path existed (originally drawing literal SDSS "cutout" thumbnails). The procedural disk was added later as a fallback for the visibility gap between point sprite and textured impostor; the textured disk was added later as a 3D-oriented refinement of the quad. Neither addition prompted a file split or rename, so the original "thumbnail" framing now hides what the subsystem actually does — and the disk/quad renderer names hide that they're the symmetric pair of LOD-2 pipelines.

## Architecture overview

```
                    ┌──────────────────────────────────────┐
                    │  PointCloud buffers (per source)     │
                    │  Loaded once per tier; immutable     │
                    └─────┬──────────────┬─────────────────┘
                          │              │             │
              ┌───────────┘              │             └─────────────┐
              ▼                          ▼                           ▼
       ┌────────────┐         ┌──────────────────────┐    ┌────────────────────┐
       │   LOD 0    │         │       LOD 1          │    │       LOD 2        │
       │            │         │ proceduralDisk       │    │ texturedImpostor   │
       │  (no       │         │     Subsystem        │    │     Subsystem      │◀── galaxyAtlas
       │ subsystem) │         │  (CPU planner)       │    │  (CPU planner)     │   Subsystem
       └─────┬──────┘         └──────────┬───────────┘    └──────┬──────┬──────┘   (atlas + queue)
             │                           │                       │      │
             ▼                           ▼                       ▼      ▼
       pointRenderer            proceduralDiskRenderer     texturedDisk-   texturedQuad-
                                                            Renderer       Renderer
             │                           │                       │      │
             └───────────────────────────┴───────────┬───────────┴──────┘
                                                     ▼
                                             HDR render pass
```

Three subsystems aligned with where state lives:

1. **`galaxyAtlasSubsystem`** — shared infrastructure for LOD 2 only. Owns the 2048² atlas, the LRU clock, the priority-queued bitmap fetcher, failure memoisation, the eviction handler. No direct connection to per-frame planning.

2. **`proceduralDiskSubsystem`** — LOD 1 per-frame planner. Walks the catalog, applies the apparent-size + finite-orientation gates, applies stride decimation + sticky maps, emits one sorted `ProceduralDiskInstance[]` per frame. No GPU work beyond reading catalog buffers.

3. **`texturedImpostorSubsystem`** — LOD 2 per-frame planner. Walks the catalog, applies the (stricter) apparent-size gate, allocates atlas slots through the shared `galaxyAtlasSubsystem`, schedules fetches through it, applies the metadata-based disk/quad branch, computes load-fade + distance-fade multipliers, emits two sorted instance arrays (`DiskInstance[]` and `ThumbnailInstance[]`) per frame.

Three pass entries replacing the current single `galaxyThumbnailsPass`:

- `pointSpritesPass` (unchanged)
- `proceduralDisksPass` (new — one draw call, reads `state.subsystems.proceduralDisks.lastOutput`)
- `texturedImpostorsPass` (new — two draw calls in the same render pass, reads `state.subsystems.texturedImpostors.lastOutput.{disks, quads}`)

## Renderer renames

Two LOD-2 renderer files are renamed for symmetry. The renderer types (`type XRenderer = {...}`) are renamed to match the files.

| Before | After | Why |
|---|---|---|
| `src/services/gpu/renderers/diskRenderer.ts` | `src/services/gpu/renderers/texturedDiskRenderer.ts` | Symmetric with `proceduralDiskRenderer`. The current name reads as "the canonical disk", which is wrong — the procedural and textured versions are peers. |
| `src/services/gpu/renderers/thumbnailRenderer.ts` | `src/services/gpu/renderers/texturedQuadRenderer.ts` | "Thumbnail" doesn't distinguish it from `texturedDiskRenderer` (which also samples thumbnails). "Quad" is the geometric distinction; "textured" matches the sibling. |

Renderer scheme after renames is `{fill}{shape}Renderer`:

- `point` — single primitive, no fill/shape decomposition
- `proceduralDisk` — shader-synthesised fill, ellipse geometry (LOD 1)
- `texturedDisk` — atlas-sampled fill, ellipse geometry (LOD 2 primary)
- `texturedQuad` — atlas-sampled fill, screen-aligned quad geometry (LOD 2 fallback)

The exported type names follow:
- `type DiskRenderer = { ... }` → `type TexturedDiskRenderer = { ... }`
- `type ThumbnailRenderer = { ... }` → `type TexturedQuadRenderer = { ... }`

The instance struct types (`ThumbnailInstance`, `DiskInstance`, `ProceduralDiskInstance`) are **not** renamed — they describe GPU vertex-buffer layouts, not concepts, and the parallel TS-types consolidation effort would clash with a rename. The renderer constructor names (`createThumbnailRenderer`, `createDiskRenderer`) are renamed to match their renderer types (`createTexturedQuadRenderer`, `createTexturedDiskRenderer`).

## File layout (after refactor)

```
src/services/gpu/renderers/
  pointRenderer.ts                (unchanged)
  proceduralDiskRenderer.ts       (unchanged)
  texturedDiskRenderer.ts         (renamed from diskRenderer.ts; type DiskRenderer → TexturedDiskRenderer)
  texturedQuadRenderer.ts         (renamed from thumbnailRenderer.ts; type ThumbnailRenderer → TexturedQuadRenderer)

src/services/engine/subsystems/
  galaxyAtlasSubsystem.ts         (new)
  proceduralDiskSubsystem.ts      (new)
  texturedImpostorSubsystem.ts    (new)
  thumbnailSubsystem.ts           DELETED

src/services/engine/frame/passes/
  pointSpritesPass.ts             (unchanged)
  proceduralDisksPass.ts          (new)
  texturedImpostorsPass.ts        (new)
  galaxyThumbnailsPass.ts         DELETED

src/services/engine/frame/passes/index.ts
                                  (HDR_PASSES list updated — replace galaxyThumbnailsPass with the two new entries)

src/@types/
  GalaxyAtlasSubsystem.d.ts       (new)
  ProceduralDiskSubsystem.d.ts    (new)
  TexturedImpostorSubsystem.d.ts  (new)
  EngineSubsystemHandles.d.ts     (edited — `thumbnails` slot replaced with three new slots)
  index.d.ts                      (NOT touched — no new barrel re-exports)
```

## Subsystem API contracts

All new types live in `src/@types/`, one per file, with no barrel re-export. Consumers import directly: `import type { GalaxyAtlasSubsystem } from '../../../@types/GalaxyAtlasSubsystem'`.

### `galaxyAtlasSubsystem`

Pure shared infrastructure. No catalog awareness; no per-frame planning. Provides slot allocation, fetch scheduling, and atlas texture view.

```ts
// @types/GalaxyAtlasSubsystem.d.ts
import type { Destroyable } from './Destroyable';

export type GalaxyAtlasFetchInput = {
  readonly key: string;
  readonly priority: number;
  readonly fetcher: () => Promise<ImageBitmap | null>;
  readonly onResult: (bitmap: ImageBitmap | null) => void;
};

export type GalaxyAtlasSubsystem = Destroyable & {
  /** Allocate or refresh an LRU slot.  Returns slot index, or null when
   *  every slot is in use AND none can be evicted.  Bumps the LRU clock
   *  for an existing key. */
  allocate(key: string, atFrame: number): number | null;

  /** UV rect (u0, v0, u1, v1) for a slot — feeds the renderer instance buffer. */
  slotUv(slot: number): readonly [number, number, number, number];

  /** Frame the slot was last allocate()-touched, or undefined if evicted.
   *  Lets fetchers detect "my slot got reassigned during the network round-trip". */
  lastSeenFrame(key: string): number | undefined;

  /** Upload a bitmap into a previously-allocated slot. */
  uploadBitmap(slot: number, bitmap: ImageBitmap): void;

  /** Idempotent — re-enqueueing an in-flight key only refreshes priority. */
  enqueueFetch(input: GalaxyAtlasFetchInput): void;

  /** Reports whether the bitmap has landed in the atlas / failed to fetch. */
  isLoaded(key: string): boolean;
  isFailed(key: string): boolean;

  /** Number of in-flight fetches.  Read by the engine's render-on-demand
   *  predicate (still-animating until all fetches settle). */
  inFlightCount(): number;

  /** Texture view bound by the LOD-2 renderers (called once during wireSlots). */
  getTextureView(): GPUTextureView;

  /** Optional handler called when LRU evicts a slot.  The
   *  texturedImpostorSubsystem subscribes to clear its bitmapReady /
   *  bitmapFailed / bitmapReadyTime entries for the ousted key. */
  setEvictHandler(handler: ((key: string) => void) | undefined): void;
};
```

Constructor lives in `galaxyAtlasSubsystem.ts`:

```ts
export type GalaxyAtlasDeps = {
  readonly device: GPUDevice;
  readonly requestRender: () => void;
};

export function createGalaxyAtlasSubsystem(deps: GalaxyAtlasDeps): GalaxyAtlasSubsystem;
```

### `proceduralDiskSubsystem`

LOD 1 per-frame planner. No GPU work, no atlas dependency.

```ts
// @types/ProceduralDiskSubsystem.d.ts
import type { Destroyable } from './Destroyable';
import type { PointCloud } from './PointCloud';
import type { ProceduralDiskInstance } from './ProceduralDiskInstance';
import type { OrbitCamera } from './OrbitCamera';
import type { Source } from '../data/sources';

export type ProceduralDiskFrameInput = {
  readonly cam: OrbitCamera;
  readonly clouds: ReadonlyMap<Source, PointCloud>;
  readonly visibleSourceMask: number;
  readonly pxPerRad: number;
};

export type ProceduralDiskFrameOutput = {
  /** Back-to-front sorted; consumer ships this array directly to the renderer. */
  readonly instances: readonly ProceduralDiskInstance[];
};

export type ProceduralDiskSubsystem = Destroyable & {
  /** Pure CPU step.  Walks the catalog under stride decimation, applies
   *  the px > 8 + finite-orientation gate, computes crossfade α via
   *  maybeEmitProceduralDisk(), updates sticky maps, sorts back-to-front,
   *  returns the output and stashes it on `lastOutput`. */
  runFrame(input: ProceduralDiskFrameInput): ProceduralDiskFrameOutput;

  /** Latest output — read by `proceduralDisksPass.draw()` without
   *  re-running.  Reset to empty arrays on construction so the pass
   *  reads valid (empty) data before the first frame. */
  readonly lastOutput: ProceduralDiskFrameOutput;
};
```

Constructor:

```ts
export type ProceduralDiskDeps = {
  /** Rolling cursor advance per frame.  Defaults to 8 (matches current
   *  thumbnailSubsystem decimationFactor).  Tests pass 1 to disable. */
  readonly decimationFactor?: number;
};

export function createProceduralDiskSubsystem(deps?: ProceduralDiskDeps): ProceduralDiskSubsystem;
```

### `texturedImpostorSubsystem`

LOD 2 per-frame planner. Depends on `galaxyAtlasSubsystem` (constructor injection).

```ts
// @types/TexturedImpostorSubsystem.d.ts
import type { Destroyable } from './Destroyable';
import type { PointCloud } from './PointCloud';
import type { ThumbnailInstance } from './ThumbnailInstance';
import type { DiskInstance } from '../services/gpu/renderers/texturedDiskRenderer'; // see deferred-type note below
import type { OrbitCamera } from './OrbitCamera';
import type { FamousMetaEntry } from '../services/loading/fetchers/famousMetaFetcher';
import type { Source } from '../data/sources';

export type TexturedImpostorFrameInput = {
  readonly cam: OrbitCamera;
  readonly clouds: ReadonlyMap<Source, PointCloud>;
  readonly visibleSourceMask: number;
  readonly pxPerRad: number;
  readonly famousMeta: readonly FamousMetaEntry[];
};

export type TexturedImpostorFrameOutput = {
  /** LOD-2 primary pipeline — galaxies with finite orientation. */
  readonly disks: readonly DiskInstance[];
  /** LOD-2 fallback pipeline — galaxies missing orientation. */
  readonly quads: readonly ThumbnailInstance[];
};

export type TexturedImpostorSubsystem = Destroyable & {
  /** Per-frame planner.  Walks the catalog under stride decimation,
   *  applies the px ≥ 24 fetch gate, allocates atlas slots, schedules
   *  fetches, branches disk-vs-quad per the metadata gate at line 820
   *  of the legacy thumbnailSubsystem, applies load-fade + distance-fade
   *  multipliers, sorts back-to-front. */
  runFrame(input: TexturedImpostorFrameInput): TexturedImpostorFrameOutput;

  readonly lastOutput: TexturedImpostorFrameOutput;

  /** OR'd into the engine's render-on-demand predicate.  True while any
   *  bitmap is mid-fetch OR a recently-landed bitmap is still in its
   *  400 ms load-fade window. */
  hasInFlightWork(): boolean;
};
```

Constructor:

```ts
export type TexturedImpostorDeps = {
  readonly device: GPUDevice;
  readonly atlas: GalaxyAtlasSubsystem;
  readonly requestRender: () => void;
  /** For tests.  Defaults to fetchGalaxyBitmap. */
  readonly fetcher?: (args: { ra: number; dec: number; famousId?: string })
    => Promise<ImageBitmap | null>;
  readonly decimationFactor?: number;
};

export function createTexturedImpostorSubsystem(deps: TexturedImpostorDeps): TexturedImpostorSubsystem;
```

### Deferred type note — `DiskInstance`

`DiskInstance` is currently declared inline at `src/services/gpu/renderers/diskRenderer.ts:50` (soon `texturedDiskRenderer.ts` after rename), not in `@types/`. This violates the project convention but is pre-existing drift, not new drift created by this spec. The parallel TS-types consolidation will relocate it; this spec imports it from its current location, then the import path in `@types/TexturedImpostorSubsystem.d.ts` is the single line the consolidation will need to update.

## Pass implementations

All three new/changed pass entries draw into the **same single HDR render pass** as today. The `Pass.draw(pass: GPURenderPassEncoder, ...)` signature is unchanged. This spec is purely about restructure — the encoder split (so each pass opens its own render pass for timestamp-query attachment) is the follow-up timing spec's responsibility.

```ts
// src/services/engine/frame/passes/proceduralDisksPass.ts
export const proceduralDisksPass: Pass = {
  name: 'procedural-disks',
  enabled(state, _ctx, settings) {
    return (
      settings.galaxyTexturesEnabled &&
      state.subsystems.proceduralDisks !== null &&
      state.subsystems.proceduralDisks.lastOutput.instances.length > 0
    );
  },
  draw(pass, ctx, state, _settings, deps) {
    deps.proceduralDiskRenderer.draw(
      pass,
      ctx.vp as Float32Array,
      [ctx.canvasSize.width, ctx.canvasSize.height],
      [ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]],
      ctx.drawPxPerRad,
      state.subsystems.proceduralDisks!.lastOutput.instances,
    );
  },
};
```

```ts
// src/services/engine/frame/passes/texturedImpostorsPass.ts
export const texturedImpostorsPass: Pass = {
  name: 'textured-impostors',
  enabled(state, _ctx, settings) {
    if (!settings.galaxyTexturesEnabled) return false;
    if (state.subsystems.texturedImpostors === null) return false;
    const { disks, quads } = state.subsystems.texturedImpostors.lastOutput;
    return disks.length > 0 || quads.length > 0;
  },
  draw(pass, ctx, state, _settings, deps) {
    const { disks, quads } = state.subsystems.texturedImpostors!.lastOutput;
    // Quad pipeline first, then disk pipeline.  Order is cosmetic only —
    // additive blending into the HDR target is commutative; matching the
    // legacy order keeps the visual baseline test exact.
    if (quads.length > 0) {
      deps.texturedQuadRenderer.draw(
        pass, ctx.vp, [ctx.canvasSize.width, ctx.canvasSize.height],
        quads, ctx.drawCamPos, ctx.drawPxPerRad,
      );
    }
    if (disks.length > 0) {
      deps.texturedDiskRenderer.draw(
        pass, ctx.vp, [ctx.canvasSize.width, ctx.canvasSize.height], ctx.drawCamPos, disks,
      );
    }
  },
};
```

## Frame loop wiring

`renderFrame` gains two planner calls before the HDR_PASSES loop:

```ts
// Compute step — populate per-frame impostor instance lists.
// Both are pure CPU; no GPU encoder interaction.  Either can run first.
state.subsystems.proceduralDisks?.runFrame({ cam, clouds, visibleSourceMask, pxPerRad });
state.subsystems.texturedImpostors?.runFrame({ cam, clouds, visibleSourceMask, pxPerRad, famousMeta });

// HDR_PASSES loop — unchanged shape; each pass reads from its subsystem's lastOutput.
for (const pass of HDR_PASSES) {
  if (pass.enabled(state, ctx, settings)) pass.draw(renderPass, ctx, state, settings, deps);
}
```

The atlas subsystem doesn't appear in this snippet — it's owned by `texturedImpostors` and only mutated through that subsystem's `runFrame`. The atlas's `inFlightCount()` is still queried by the engine's render-on-demand predicate, but through `texturedImpostors.hasInFlightWork()` rather than directly.

## State / handle wiring

`EngineSubsystemHandles.d.ts` is the one existing types file edited. The `thumbnails` slot is replaced with three new slots:

```diff
// src/@types/EngineSubsystemHandles.d.ts
- thumbnails: ThumbnailSubsystem | null;
+ galaxyAtlas: GalaxyAtlasSubsystem | null;
+ proceduralDisks: ProceduralDiskSubsystem | null;
+ texturedImpostors: TexturedImpostorSubsystem | null;
```

The `EngineThumbnailsHandle` type (settings-side: on/off toggle for the impostor pass) is unchanged — it refers to the user-facing setting, not the subsystem. The corresponding settings key `state.settings.thumbnails.enabled` is unchanged.

Bootstrap order in `wireSlots.ts`:

1. `galaxyAtlas = createGalaxyAtlasSubsystem({ device, requestRender })`
2. `texturedImpostors = createTexturedImpostorSubsystem({ device, atlas: galaxyAtlas, requestRender, fetcher })`
3. `proceduralDisks = createProceduralDiskSubsystem()` (independent — could run in parallel with steps 1–2)
4. `texturedQuadRenderer.bindAtlas(galaxyAtlas.getTextureView())`
5. `texturedDiskRenderer.bindAtlas(galaxyAtlas.getTextureView())`
6. Store all three on `state.subsystems`.

The current `bindToRenderers` step on `thumbnailSubsystem` collapses into the atlas's `getTextureView()` returning a stable view — the binding is just two `renderer.bindAtlas(...)` calls in wireSlots.

The engine's render-on-demand predicate (current `state.subsystems.thumbnails.hasInFlightFetches()`) migrates to `state.subsystems.texturedImpostors.hasInFlightWork()`. The procedural-disk subsystem has no fetches and never contributes to the predicate.

## Catalog walk — one or two walks?

The two planner subsystems each walk the catalog every frame. The walks have overlapping shape (apparent-size cull on every row) but disjoint emission logic (procedural disks above 8 px with finite orientation; textured impostors above 24 px with bitmap-loaded gate). Three options were considered:

1. **One shared walk producing both outputs** — keeps current `thumbnailSubsystem.runFrame`'s shape. Rejected: re-creates the kitchen-sink concern this spec exists to eliminate. The two planners would still need separate sticky-map and stride-cursor state, so the "shared" walk is just an outer loop wrapping two independent inner bodies.
2. **Two walks, each with its own cursor and sticky map** *(chosen)* — clean ownership. Per-row cost is dominated by the squared-distance compare which the iterator can't be made any cheaper than already; the second walk over rejected-by-LOD-1 rows is essentially a chain of no-op `continue`s.
3. **One walk producing tagged output, two readers** — would force a tagged-union output shape that both readers slice. Coordination overhead outweighs CPU savings.

Worst-case CPU is roughly 4/3× the current loop (`large` tier: 3.5M rows × two cheap walks vs. one walk-with-two-emissions), dominated by no-op iterations. Stride decimation (factor 8) applies to each walk independently, so each completes one full sweep per ~133 ms (8 frames at 60 fps), same as today.

## Testing

The current `thumbnailSubsystem` tests (`tests/services/engine/subsystems/thumbnailSubsystem.test.ts`) split three ways:

- `tests/services/engine/subsystems/galaxyAtlasSubsystem.test.ts` — atlas + queue + eviction handler. Test fixtures use the current atlas test helpers; no new mocks.
- `tests/services/engine/subsystems/proceduralDiskSubsystem.test.ts` — sticky maps, stride decimation, apparent-size gate, orientation guard, `maybeEmitProceduralDisk` integration (the helper itself stays where it is — it's exported from the new subsystem module, same as today).
- `tests/services/engine/subsystems/texturedImpostorSubsystem.test.ts` — atlas-slot allocation flow, fetch enqueue/result/failure paths, load-fade timing, disk-vs-quad branch, render-on-demand predicate.

The new pass entries get small smoke tests:

- `tests/services/engine/frame/passes/proceduralDisksPass.test.ts` — enabled gate fires correctly given empty / non-empty `lastOutput`; draw() forwards to the renderer.
- `tests/services/engine/frame/passes/texturedImpostorsPass.test.ts` — enabled gate, two-draw dispatch (quads first, then disks), correct `lastOutput` slice forwarded to each.

**Visual baseline** — a `tests/visual/baseline-frame.test.ts` (or equivalent harness) must produce byte-identical output pre- and post-refactor at a fixed camera + tier + cloud fixture. Additive blending into the same HDR target makes the cosmetic draw order irrelevant for correctness, but the test pins it anyway so accidental reorderings of the disk/quad pair are caught.

## Migration

Single PR. The change is structural (rename, split, re-wire) but doesn't alter rendered output, per-frame logic, threshold values, or shader bodies. An incremental migration would mean two parallel impostor systems live simultaneously, which is more dangerous than the one-shot cut.

Rename + split sequencing inside the PR (so reviewer's diff reads top-down):

1. Rename `diskRenderer.ts` → `texturedDiskRenderer.ts`, `thumbnailRenderer.ts` → `texturedQuadRenderer.ts`. Update renderer factory + type names. Update every import. No logic changes.
2. Extract `galaxyAtlasSubsystem.ts` from the atlas + queue portions of `thumbnailSubsystem.ts`.
3. Extract `proceduralDiskSubsystem.ts` from the LOD-1 portions of `thumbnailSubsystem.ts`.
4. Extract `texturedImpostorSubsystem.ts` from the remaining LOD-2 portions of `thumbnailSubsystem.ts`.
5. Add `proceduralDisksPass.ts` and `texturedImpostorsPass.ts`. Update `HDR_PASSES`.
6. Delete `thumbnailSubsystem.ts` and `galaxyThumbnailsPass.ts`.
7. Update `EngineSubsystemHandles.d.ts` and `wireSlots.ts` wiring.
8. Add new type files in `@types/` (one per concern, no barrel re-export).
9. Split and migrate tests.

## Open questions

None at spec time. The brainstorming pass settled the LOD model (3 levels, no LOD 3), the subsystem split (atlas + 2 planners), the renderer renames, the file layout, and the types-consolidation discipline (new types in `@types/` per concern, one existing types file edited, no barrel touches).
