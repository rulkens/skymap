# Engine ↔ Renderer Boundary Tightening

**Date:** 2026-05-07
**Status:** Spec
**Companion spec:** Spec B (engine internal restructure) — to be written after this lands.

## Goal

Push renderer-internal concerns that have leaked into `engine.ts` back into the renderer modules. The renderer becomes the system of record for everything related to "how points get drawn"; the engine stops duplicating that knowledge.

The expected impact on `engine.ts` is roughly 150 lines deleted, all in `setBiasMode`, the global-idx helpers, GPU construction, the click/pick wiring, and the synthetic fallback. **No structural reorganization of `engine.ts` itself** — that is the job of spec B, which targets the resulting cleaner file.

## Background

`engine.ts` currently leaks five renderer concerns:

1. **Instance numbering.** `resolveGlobalIdx` walks `renderer.loadedSources()` and subtracts counts to invert the renderer's `instanceIdOffset` bookkeeping. `selectFamous` / `selectByAlias` re-encode the same rule the other way (`instanceIdOffset(source) + localIdx`). Engine duplicates the renderer's numbering scheme.

2. **Bias-mode lazy bake.** `setBiasMode` contains 60 lines choreographing `applySchechterMode()` / `applyAngularReweightMode()`, each guarded by a transition check. The renderer keeps its own `schechterModeActive` / `angularReweightModeActive` flags that duplicate `state.bias.mode`.

3. **HDR pipeline split.** `hdrTarget` and `toneMapPass` are conceptually one stage ("post-process HDR → swap chain") but live as two engine state fields, two construction sites, two destroy sites, and two wires into `renderFrame`.

4. **PickRenderer ↔ PointRenderer coupling.** `pickRenderer.pick(...)` takes `pointRenderer.uniformBuffer` as an argument. PointRenderer exposes a public `get uniformBuffer()` solely for this consumer. The relationship is fixed at construction time but expressed through per-call argument-passing.

5. **Synthetic fallback bypass.** When all real surveys fail, bootstrap calls `state.gpu.renderer.upload(Source.Synthetic, ...)` directly, bypassing the slot machinery every other source flows through. Two code paths for "a cloud is now on the GPU".

## Architecture

### #7 — Instance numbering on PointRenderer

The renderer is the system of record for global instance IDs. Two new methods make encoding and decoding symmetric:

```ts
// pointRenderer.ts (additions)
toGlobalIdx(source: Source, localIdx: number): number
fromGlobalIdx(globalIdx: number): { source: Source; localIdx: number } | null
```

`fromGlobalIdx` returns `null` for out-of-range *and* for a `localIdx` past the cloud's current count — the bounds-check the engine added in the tier-swap fix moves here.

Engine deletes `resolveGlobalIdx` (~10 lines). `pointInfoFromGlobal` becomes a 6-line wrapper: `renderer.fromGlobalIdx(g) → buildPointInfo(...)`. `clickHandler.ts`'s resolver simplifies the same way. `selectFamous` and `selectByAlias` use `renderer.toGlobalIdx(source, localIdx)` instead of `renderer.instanceIdOffset(source) + localIdx`.

### #8 — Bias mode collapses to one source of truth

```ts
// pointRenderer.ts — replaces applySchechterMode + applyAngularReweightMode
setBiasMode(mode: BiasMode): Promise<void>
```

The renderer encapsulates:

- which modes require a per-galaxy bake (Schechter, AngularReweight)
- lazy-bake on first toggle (preserved behaviour)
- cache reuse on re-toggle (preserved behaviour)
- per-source iteration during bake

Engine's `setBiasMode` becomes:

```ts
setBiasMode(mode) {
  state.bias.mode = mode;
  cb.onBiasModeChange?.(mode);
  state.gpu.renderer?.setBiasMode(mode).then(() => {
    state.subsystems.scheduler.requestRender();
  });
  state.subsystems.scheduler.requestRender();
}
```

The private `schechterModeActive` / `angularReweightModeActive` flags stay — they still drive the eager bake when a new cloud uploads mid-mode (a real correctness requirement) — but they are set from `setBiasMode` instead of from the now-deleted `applySchechterMode` / `applyAngularReweightMode` public methods. The duplication between engine state and renderer state collapses to a write-only relationship: engine tells renderer the current mode, renderer treats that as authoritative.

`upload()`'s mode selection (`schechterModeActive ? 'with-schechter' : 'fast'`) is unchanged; that gating is renderer-internal.

### #9 — PostProcess aggregate replaces hdrTarget + toneMapPass

New module `src/services/gpu/postProcess.ts`:

```ts
type PostProcess = {
  view: GPUTextureView;
  resize(size: Size): void;
  draw(
    encoder: GPUCommandEncoder,
    swapView: GPUTextureView,
    exposure: number,
    curve: ToneMapCurve,
  ): void;
  destroy(): void;
};

createPostProcess(device: GPUDevice, format: GPUTextureFormat, size: Size): PostProcess
```

Owns the HDR rgba16float texture + view, the tone-map pipeline, the 16-byte uniform buffer, and the sampler. Replaces `hdrTarget.ts` + `toneMapPass.ts` (both deleted).

Engine state collapses two fields (`state.gpu.hdrTarget`, `state.gpu.toneMapPass`) to one (`state.gpu.postProcess`). `renderFrame.ts` takes one input arg (`postProcess`) instead of two (`hdrTargetView`, `toneMapPass`). The resize branch in the frame body calls `postProcess.resize(...)`. `destroy()` shrinks accordingly.

### #10 — PickRenderer holds its PointRenderer reference

```ts
createPickRenderer(device: GPUDevice, pointRenderer: PointRenderer): PickRenderer
// pick() no longer takes a uniformBuffer arg
pick(
  viewport: [number, number],
  xPx: number,
  yPx: number,
  visibleSources: readonly LoadedSource[],
  pointSizePx: number,
): Promise<number>
```

PickRenderer reads `this.pointRenderer.uniformBuffer` internally each `pick()` call. The public `get uniformBuffer()` on PointRenderer becomes private — no external consumers remain.

`visibleSources` stays as a caller arg: visibility is engine state (driven by the user's source toggles + autoLOD), not renderer state. The click resolver constructor simplifies in lockstep — callers no longer thread `uniformBuffer` through.

### #11 — Synthetic fallback through the slot machinery

New fetcher `syntheticPointFetcher: Fetcher<PointCloud, { count: number }>` that resolves synchronously to `generateSyntheticCloud(req.count)`. A synthetic slot is registered in the bootstrap loop alongside the others:

```ts
for (const source of [Source.SDSS, Source.TwoMRS, Source.Glade, Source.Famous, Source.Synthetic]) {
  // existing slot construction; synthetic uses syntheticPointFetcher
}
```

The `allArrivalsPromise` excludes `Source.Synthetic` — it is not loaded at boot, only as fallback. After the gate resolves, if `pointsAnyReady === false`:

```ts
const synthSlot = state.assetSlots.points.get(Source.Synthetic);
if (synthSlot) {
  synthSlot.load({ count: 100_000 });
  await /* await ready transition */;
}
```

Removes the direct `state.gpu.renderer.upload(Source.Synthetic, synthetic)` call. One upload path for every source. Synthetic gets the same fade-in, the same dev-panel visibility, the same retry semantics for free.

## Migration strategy

Five PRs, ordered by risk:

1. **#11 synthetic-as-slot.** Additive; tested in isolation; no public API change.
2. **#7 instance numbering.** Pure addition on PointRenderer + deletion in engine. Mechanical.
3. **#10 pick coupling.** Constructor signature change on PickRenderer. Localized to test fixtures + one engine site.
4. **#9 postProcess aggregate.** New file, two deletions, six import updates. Larger diff but mechanical.
5. **#8 bias-mode collapse.** Most semantic change; lands last so the others have settled.

Each PR ships independently. Each preserves the renderer's externally-observable behaviour — verified by the existing render / picker / loading test suites — and adds one regression test for the specific contract being moved.

## Testing

- **#7:** unit test `toGlobalIdx` / `fromGlobalIdx` round-trip across multiple sources, including the empty-cloud and out-of-bounds-localIdx edge cases.
- **#8:** test that `setBiasMode(Schechter)` triggers the worker bake exactly once per first-toggle, that re-toggle hits the cache (no second worker spawn), that going back to `None` is a no-op, and that a new upload arriving mid-mode bakes eagerly with the active mode.
- **#9:** existing `renderFrame` integration test stays green; add a unit test that `resize()` + `view` access stay in sync (resize replaces the texture; `view` reflects the new texture immediately).
- **#10:** rewire existing pick tests through the new constructor; the removal of `uniformBuffer` from PointRenderer's public surface is verified by TypeScript at compile time (no runtime test needed — if the getter were still exposed, every consumer-removal site would still compile).
- **#11:** test that the all-real-surveys-fail path lands `Source.Synthetic` on the GPU via the slot's commit, observable through the existing `loadedSources()` query.

## What this spec deliberately does not do

All engine-internal restructure stays out of scope:

- Settings setter table / Settings subsystem (item 1 in the original list)
- Bootstrap IIFE → ordered phases module (item 2)
- Slot wiring registry subsystem (item 3)
- Frame body extraction to `runFrame.ts` (item 4)
- Tween-to-galaxy helper deduplication (item 5)
- Renderer aggregate (item 6) — subsumed by #9 + #10 + the existing `thumbnailSubsystem`

The original "renderer aggregate" idea (#6) is dropped: once #9 collapses HDR + toneMap and #10 binds pick to point, the remaining standalone renderers (`milkyWayRenderer`, `filamentRenderer`) do not naturally group with anything else. `thumbnailSubsystem` already aggregates the quad/disk/proceduralDisk trio.

Spec B will tackle the engine-internal restructure on the cleaner target this spec produces.

## Success criteria

- All five PRs merged.
- `engine.ts` is roughly 150 lines shorter.
- No regression in the existing test suite (590+ tests).
- One regression test added per PR for the specific contract being relocated.
- `pointRenderer.uniformBuffer` is no longer publicly accessible.
- `state.bias.mode` is the sole representation of the active bias mode (the renderer's private flags are write-only consequences of `setBiasMode` calls, not an independent source of truth).
- `Source.Synthetic` flows through the same `AssetSlot` machinery as every other source.
