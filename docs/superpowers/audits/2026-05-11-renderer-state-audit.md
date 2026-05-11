# Renderer state audit — 2026-05-11

Purpose: inform Option A/B/C decision for renderer lifecycle restructure.
TL;DR table at the end ranks each renderer by mirror-state thickness.

Audit covers the 11 modules under `src/services/gpu/renderers/`:
`pointRenderer`, `pickRenderer`, `filamentRenderer`, `thumbnailRenderer`,
`diskRenderer`, `proceduralDiskRenderer`, `milkyWayRenderer`,
`scalarVolumeRenderer`, `labelRenderer`, `markerLineRenderer`,
`instancedQuadRenderer` (shared factory).

Renderer-internal pipeline / bind-group / shader-module / uniform-buffer
identities (created at factory time, never reassigned) are deliberately
excluded.

---

## pointRenderer

**Long-lived state:**
- `clouds: Map<Source, LoadedSource>` — per-source `{ buffer, count, interleaved: Float32Array (CPU mirror, ~14 MB per SDSS deck), fade: CloudFade }`. CPU `interleaved` mirror exists so bias splices can rewrite slots 10/11 with one whole-buffer re-upload.
- `biasUploadCallback`, `biasUnloadCallback` — installed by `biasCorrectionSubsystem`.
- `CloudFade` per source — owns its own uniform buffer (opacity + sourceCode); fade-start timestamp is renderer-only animation state.

**Mutation API:**
- `upload(source, cloud)` (async; bake worker → vertex buffer)
- `unload(source)` — declared on the type but no external callers in src (only the inline empty-cloud short-circuit inside `upload`).
- `setBiasUploadCallback(cb)` / `setBiasUnloadCallback(cb)`
- `spliceSchechterRatios(source, ratios)` — splice slot 10 + full re-upload
- `spliceAngularWeights(source, weights)` — splice slot 11 + full re-upload
- `clearBiasOverlays(source?)` — zero slots 10 + 11

**Mirror state:**
- `clouds.<source>.count` — derived/baked from the loaded `PointCloud`; engine reads `pointRenderer.totalCount()` / `countOf()` rather than `state.sources.clouds.<source>.count`. Effectively redundant with `state.sources.clouds`.
- `clouds.<source>.buffer` — derived/baked from `state.sources.clouds.<source>` (the parsed cloud). Not duplicable on engine state.
- `clouds.<source>.interleaved` — renderer-only CPU mirror, exists solely for the bias splice paths.
- `clouds.<source>.fade.opacity` + start timestamp — renderer-only animation state, no engine mirror.
- `biasUpload/UnloadCallback` — renderer-only (subsystem-installed hooks).

**Draw signature:** `draw(pass: GPURenderPassEncoder, viewProj: mat4, viewportPx: [number, number], settings: PointDrawSettings): void`
(`PointDrawSettings` carries 16 fields: pointSizePx, brightness, selectedPacked, visibleSourceMask, camPosWorld, pxPerRad, highlightFallback, realOnlyMode, biasMode, absMagLimit, apparentMagLimit, schechterMStar, schechterAlpha, depthFadeEnabled, pxFadeStart, pxFadeEnd.)

**Engine sync points:**
- `services/engine/wiring/pointSourceRegistry.ts:281` — `await state.gpu.renderer.upload(source, cloud)` inside per-source slot commit.
- `services/engine/subsystems/biasCorrectionSubsystem.ts:433-434` — `r.setBiasUploadCallback(...)`, `r.setBiasUnloadCallback(...)` at `attachRenderer` time.
- `subsystems/biasCorrectionSubsystem.ts:350` — `renderer.spliceSchechterRatios(source, ratios)`
- `subsystems/biasCorrectionSubsystem.ts:361` — `renderer.spliceAngularWeights(source, weights)`
- `subsystems/biasCorrectionSubsystem.ts:374` — `renderer.clearBiasOverlays()`
- `services/engine/engine.ts:1124` — `state.gpu.renderer?.destroy()` in teardown.
- `services/engine/frame/passes/pointSpritesPass.ts` (and `renderFrame.ts`) — per-frame `draw(...)`.

---

## pickRenderer

**Long-lived state:**
- `pickTexture: GPUTexture | null`, `depthTexture: GPUTexture | null`, `texWidth`, `texHeight` — lazy-allocated on first pick at the active viewport size; re-created on viewport change.
- `inFlight: boolean` — guards mapAsync overlap; second concurrent pick returns null.
- `destroyed: boolean` — post-destroy guard.

**Mutation API:**
- None. Surface is `pick(viewportPx, x, y, sources, pointSizePx?) → Promise<{source,localIdx}|null>` + `destroy()`. State only mutates as side effects of `pick`.

**Mirror state:**
- All long-lived state is renderer-only (lazy GPU resources + concurrency latch). No engine-side mirror.

**Draw signature:** N/A — `pick(viewportPx, pickXPx, pickYPx, sources: Iterable<PickSourceDraw>, pointSizePx?): Promise<{source: Source; localIdx: number} | null>`

**Engine sync points:**
- `services/engine/interaction/clickHandler.ts:171` — `await pickRenderer.pick(...)` on click.
- `services/engine/engine.ts:1080` — destroy in teardown.

---

## filamentRenderer

**Long-lived state:**
- `instanceBuffer: GPUBuffer | null` — per-cloud vertex buffer (`null` before first upload or after `clear()`).
- `segmentCount: number` — derived from current loaded cloud.
- `fade: CloudFade | null` — lazy-minted on first upload, `restart()` on subsequent uploads.

**Mutation API:**
- `upload(cloud: FilamentCloud)` — synchronous; rebuilds segment instance buffer.
- `clear()` — drops loaded cloud.
- `isFading(): boolean`

**Mirror state:**
- `instanceBuffer` / `segmentCount` — derived/baked from the loaded `FilamentCloud` payload (which itself lives only in the asset slot; engine state has no parallel `state.filaments.cloud` field).
- `fade` — renderer-only animation state.

**Draw signature:** `draw(pass: GPURenderPassEncoder, viewProj: mat4, viewportPx: [number, number], halfWidthPx: number, intensityScale: number): void`

**Engine sync points:**
- `services/engine/phases/wireSlots.ts:155` — `await state.gpu.filamentRenderer.upload(cloud)` in slot commit.
- `services/engine/frame/runFrame.ts:484` — `state.gpu.filamentRenderer.isFading()` queried each frame for render-on-demand scheduling.
- `services/engine/frame/passes/filamentsPass.ts:79` — per-frame draw.
- `services/engine/engine.ts:1089` — destroy in teardown.
- No `clear()` callers in src today.

---

## thumbnailRenderer (was quadRenderer)

**Long-lived state:**
- Thin wrapper around `instancedQuadRenderer` — itself owns a fixed-capacity 256-instance vertex buffer + atlas-bind-group slot.
- No JS-side per-instance state (`draw` packs the caller-supplied `instances` array fresh every frame).

**Mutation API:**
- `bindAtlas(atlasView: GPUTextureView)` — called once after `atlas.initTexture()`.

**Mirror state:**
- None. Atlas view is bound from `state.subsystems.thumbnails.atlas` — derived, not mirrored.

**Draw signature:** `draw(pass, viewProj: mat4, viewportPx: [number, number], instances: ReadonlyArray<ThumbnailInstance>, camPosWorld: Readonly<[number, number, number]>, pxPerRad: number): void`

**Engine sync points:**
- `services/engine/subsystems/thumbnailSubsystem.ts:481` — `thumbnailRenderer.bindAtlas(atlas.getTextureView())` once.
- `subsystems/thumbnailSubsystem.ts:956` — per-frame `thumbnailRenderer.draw(...)`.
- `engine.ts:1101` — destroy.

---

## diskRenderer

**Long-lived state:**
- Wrapper around `instancedQuadRenderer` (fixed cap 256). No per-instance JS state.

**Mutation API:**
- `bindAtlas(atlasView: GPUTextureView)`

**Mirror state:**
- None. Same story as `thumbnailRenderer`.

**Draw signature:** `draw(pass, viewProj: mat4, viewportPx: [number, number], camPos: Readonly<[number, number, number]>, instances: ReadonlyArray<DiskInstance>): void`

**Engine sync points:**
- `subsystems/thumbnailSubsystem.ts:482` — `diskRenderer.bindAtlas(...)` once.
- `subsystems/thumbnailSubsystem.ts:966` — per-frame draw.
- `engine.ts:1103` — destroy.

---

## proceduralDiskRenderer

**Long-lived state:**
- Wrapper around `instancedQuadRenderer` with `capacity: { kind: 'grow' }` — lazily allocates, re-allocates on overflow. Buffer + capacity number live inside the shared factory's closure.

**Mutation API:**
- None on the wrapper. (No `bindAtlas`; this renderer doesn't read a texture.)

**Mirror state:**
- None. `instances` are passed in per-frame by the thumbnail subsystem.

**Draw signature:** `draw(pass: GPURenderPassEncoder, viewProj: Float32Array, viewport: [number, number], camPosWorld: [number, number, number], pxPerRad: number, instances: ReadonlyArray<ProceduralDiskInstance>): void`

**Engine sync points:**
- Per-frame draw from `subsystems/thumbnailSubsystem.ts` (binds atlas-only renderers but proceduralDisk is invoked directly inside the same path).
- `engine.ts:1105` — destroy.

---

## milkyWayRenderer

**Long-lived state:**
- `scratchVp: mat4` — one preallocated 64-byte matrix reused per frame for the world-centering pre-bake. Pure performance scratch.

**Mutation API:**
- None.

**Mirror state:**
- None. Every per-frame input is a function argument; `scratchVp` is renderer-only scratch.

**Draw signature:** `draw(pass: GPURenderPassEncoder, viewProj: Float32Array, viewport: [number, number], fadeAlpha: number, iTimeSec: number, cameraPosWorld: [number, number, number], centerWorld?: readonly [number, number, number]): void`

**Engine sync points:**
- `services/engine/frame/passes/milkyWayPass.ts:73` — per-frame draw.
- `engine.ts:1107` — destroy.

---

## scalarVolumeRenderer

**Long-lived state:**
- `fields: Map<ScalarFieldHandle, FieldEntry>` — per-field record carrying:
  - `enabled: boolean`
  - `intensity: number` (clamped to [0,1])
  - `contrast: number` (clamped [0.05, 16])
  - `densityScale: number` (clamped ≥ 0)
  - `paletteId: ScalarFieldPaletteId`
  - `envelopeInner`, `envelopeOuter: number`
  - `modelMatrix`, `invModelMatrix: mat4` (baked from the cube's frame/origin/rotation/dims/voxelSize at `addField` time)
  - `volumeTexture: GPUTexture` (the 3D r16float, baked from `cube.voxels`)
  - `paletteTexture: GPUTexture` (1D LUT, baked from `paletteId`)
  - `uniformBuffer: GPUBuffer`, `bindGroup: GPUBindGroup`

**Mutation API:**
- `addField(handle, cube)` — uploads 3D texture, seeds entry with safe placeholders (`intensity 0.5`, `contrast 1.0`, `densityScale 1.0`, `paletteId 'viridis'`, envelope sentinel `2.0/2.0`, `enabled true`).
- `removeField(handle)` — destroys textures + uniform buffer; deletes entry.
- `setEnabled(handle, enabled)`
- `setIntensity(handle, intensity)` (clamped)
- `setContrast(handle, contrast)` (clamped)
- `setDensityScale(handle, value)` (clamped)
- `setEnvelope(handle, inner, outer)`
- `setFieldPalette(handle, id)` — `writeTexture` into the existing 1D LUT.
- `hasActiveFields()`, `listHandles()`, `getFieldPalette(handle)`
- `__getFieldEntryForTest(handle)` — test escape hatch.

**Mirror state:**
- `FieldEntry.enabled` — mirrors `state.settings.volumes.fields[handle].enabled`.
- `FieldEntry.intensity` — mirrors `state.settings.volumes.fields[handle].intensity`.
- `FieldEntry.contrast` — mirrors `state.settings.volumes.fields[handle].contrast`.
- `FieldEntry.densityScale` — mirrors `state.settings.volumes.fields[handle].densityScale`.
- `FieldEntry.paletteId` — mirrors `state.settings.volumes.fields[handle].paletteId`.
- `FieldEntry.envelopeInner/Outer` — derived/baked from `VOLUME_FIELD_DEFAULTS[handle].envelope`; per-cube static (no settings entry). Renderer is the only source of truth.
- `FieldEntry.modelMatrix` / `invModelMatrix` — derived/baked from the registered `ScalarCube` (`cube.frameKind`, `origin`, `rotation`, `dims`, `voxelSize`). Engine state has no `ScalarCube` cache; the cube is consumed in `addField` and discarded.
- `FieldEntry.volumeTexture`, `paletteTexture`, `uniformBuffer`, `bindGroup` — derived GPU resources; not mirrors.

**Draw signature:** `draw(pass: GPURenderPassEncoder, viewProj: mat4, viewportPx: [number, number], cameraPosWorld: [number, number, number]): void`

**Engine sync points:**
- `services/engine/phases/wireSlots.ts:230` (cf4Density slot commit), `:397` (synthetic slots) — `renderer.addField(handle, cube)` then `setIntensity` / `setEnabled` / `setContrast` / `setFieldPalette` / `setDensityScale` / `setEnvelope`.
- `services/engine/engine.ts:941` — `state.gpu.scalarVolumeRenderer?.addField(...)` (public-handle `addVolumeField`).
- `engine.ts:960-964` — seeded setters called immediately after addField.
- `engine.ts:970` — `removeField` (public `removeVolumeField`).
- `engine.ts:980, 988, 996, 1004, 1015` — `setEnabled`, `setIntensity`, `setContrast`, `setDensityScale`, `setFieldPalette` for the public per-field setter API.
- `services/engine/frame/passes/scalarVolumePass.ts:83` — per-frame draw.
- `engine.ts:1111` — destroy.

---

## labelRenderer

**Long-lived state:**
- `glyphBuf: ArrayBuffer`, `glyphF32`, `glyphU32` — per-glyph CPU scratch (max 4096 glyphs, ~144 KB).
- `labelBuf: Float32Array` — per-label CPU scratch (max 64 labels × 48 B).
- `currentGlyphCount`, `currentLabelCount: number` — counters last written by `setLabels`.
- GPU resources (pipeline, uniform/storage/instance/corner buffers, atlas texture, bind group) all created at factory time. `null` when `device` is null (test mode).

**Mutation API:**
- `setLabels(labels: Label[])` — repacks both scratch arrays and uploads to storage + instance buffers.
- `glyphCount()`, `labelCount()`

**Mirror state:**
- `currentGlyphCount` / `currentLabelCount` — derived from last `setLabels` argument. No engine-side mirror; the `Label[]` is constructed each frame in `youAreHereSubsystem` from `state.subsystems.youAreHere` visibility + camera state and pushed in.
- CPU scratch buffers — renderer-only.

**Draw signature:** `render(pass: GPURenderPassEncoder, viewProj: Float32Array, viewportSize: [number, number]): void`

**Engine sync points:**
- `services/engine/subsystems/youAreHereSubsystem.ts:197, 203` — `labelRenderer.setLabels(labels|[])` per frame inside the subsystem's `runFrame`.
- `services/engine/frame/passes/labelsPass.ts:55` — `state.gpu.labelRenderer.glyphCount() > 0` enables/short-circuits the pass.
- `engine.ts:1093` — destroy.

---

## markerLineRenderer

**Long-lived state:**
- `instanceBuf: Float32Array` — CPU scratch for up to 64 lines × 48 B.
- `currentLineCount: number`
- GPU resources at factory time; `null` when device is null.

**Mutation API:**
- `setLines(lines: MarkerLine[])`
- `lineCount()`

**Mirror state:**
- `currentLineCount` — derived from last `setLines`. Same shape as labelRenderer.
- CPU scratch — renderer-only.

**Draw signature:** `render(pass: GPURenderPassEncoder, viewProj: Float32Array, viewportSize: [number, number]): void`

**Engine sync points:**
- `services/engine/subsystems/youAreHereSubsystem.ts:198, 204` — `lineRenderer.setLines(lines|[])` per frame.
- `services/engine/frame/passes/markerLinesPass.ts:54` — `state.gpu.markerLineRenderer.lineCount() > 0` enable gate.
- `engine.ts:1097` — destroy.

---

## instancedQuadRenderer (shared factory; not a top-level renderer)

Owned indirectly by `thumbnailRenderer`, `diskRenderer`, `proceduralDiskRenderer`. Holds: pipeline, BGL, uniform buffer, instance vertex buffer + capacity counter (when `kind:'grow'`), optional atlas bind group. All renderer-only — capacity counter is the only "long-lived state" worth mentioning, and it's purely an allocation optimization.

---

## TL;DR — mirror-state thickness ranking

| Renderer | Mirror fields (vs `EngineState`) | Thickness | Option C cost |
|---|---|---|---|
| `scalarVolumeRenderer` | enabled, intensity, contrast, densityScale, paletteId per-field (5 mirrors × N fields); plus derived modelMatrix/textures keyed to a discarded `ScalarCube` | **HIGH** | High — engine state would need a `fields[handle].cube` cache (currently the cube is consumed and dropped at `addField`) **or** the renderer keeps owning the cube-derived bake. Per-frame `draw(state)` would read 5 mirrors × N fields. |
| `pointRenderer` | per-source `count` overlaps with `state.sources.clouds.<source>.count`; `interleaved` CPU mirror is **load-bearing** for bias splices (no engine-side equivalent); fade state is renderer-only | MEDIUM | Medium — the `interleaved` mirror exists because WebGPU has no scatter-write; moving it onto engine state is structurally feasible but doesn't simplify anything. Fade is animation state and isn't a candidate for engine-side ownership. |
| `filamentRenderer` | `segmentCount` derived from loaded `FilamentCloud`; no engine mirror today | LOW-MEDIUM | Low — uploaded once at boot; would need engine to keep the `FilamentCloud` around. Currently the slot owns it. |
| `labelRenderer` | `currentGlyphCount` / `currentLabelCount` derived from last `setLabels(labels)`; `labels` themselves not on engine state today | LOW | Low — `youAreHereSubsystem` already computes the `Label[]` per frame; push it onto `state.subsystems.youAreHere.labels` and have `draw(state)` read from there. |
| `markerLineRenderer` | identical to labelRenderer (lines instead of labels) | LOW | Low — same shape as labelRenderer. |
| `thumbnailRenderer` | none (atlas view derived; per-frame instance arrays passed by subsystem) | NONE | Trivial. |
| `diskRenderer` | none | NONE | Trivial. |
| `proceduralDiskRenderer` | none (grow-on-demand buffer is allocation strategy) | NONE | Trivial. |
| `milkyWayRenderer` | none (`scratchVp` is renderer-only scratch) | NONE | Trivial. |
| `pickRenderer` | none on the data side; lazy GPU resources are renderer-only | NONE | Trivial (no mutation API at all). |

### Surprises / counter-intuitive findings

1. **`pointRenderer.unload` is dead code in src/.** No external callers; the only "unload" happens via the inline `cloud.count === 0` short-circuit inside `upload`. Type surface advertises it, but neither `engine.ts` nor `pointSourceRegistry.ts` nor any subsystem invokes it. Same for `filamentRenderer.clear()` — declared, never called outside tests.

2. **Draw signatures are already structurally three-tier**, not arbitrary:
   - Group A — `(pass, viewProj, viewport, …extras)`: filament, scalarVolume, milkyWay, label, markerLine, thumbnail, disk, proceduralDisk.
   - Group B — `(pass, viewProj, viewport, settings: PointDrawSettings)`: pointRenderer alone.
   - Group C — `pick(...)`: pickRenderer (async, distinct shape).
   Option B's `draw(pass, ctx, settings)` is closer to what already exists than the count of distinct trailing-arg shapes suggests.

3. **`scalarVolumeRenderer` is the only renderer whose mirror fields are 1:1 user-visible settings.** Every other mirror is either a derived count, an animation timer, or a CPU-side copy of GPU bytes. That makes scalarVolume the strongest **and the only meaningful** candidate for Option C — the other renderers have so little mirror state that Option C would barely simplify them.

4. **`pointRenderer.interleaved` CPU mirror is non-trivial — ~14 MB per SDSS deck.** It exists exclusively to make `spliceSchechterRatios` / `spliceAngularWeights` a single `writeBuffer`. Removing it would require either (a) keeping per-row scatter writes (~3.5 M `writeBuffer` calls — measured slower), or (b) moving the splice into a compute shader. Option C as stated doesn't apply here — this isn't a settings mirror, it's a GPU-side staging cache.

5. **`labelRenderer` / `markerLineRenderer` take a `null` device for unit tests.** They're the only two renderers that explicitly support a null GPU device. Any uniform draw-signature refactor (Option B) needs to keep that test mode in mind, or migrate those tests off the null-device pattern.

6. **`thumbnailSubsystem` is a substantial state-owner that sits between engine and three renderers.** `bindAtlas` is the only renderer mutation it issues at setup; the bulk of its work is computing per-frame `instances` arrays from camera + atlas state and forwarding them as draw arguments. Three of the "no mirror" renderers (`thumbnail`, `disk`, `proceduralDisk`) get their entire per-frame state from this one subsystem.

7. **`pickRenderer` has no mutation API at all** — `pick()` is the only entry point. It is the cleanest fit for Option A (`{ label, destroy }`); B and C are nearly no-ops for it.

