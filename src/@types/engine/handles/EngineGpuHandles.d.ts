/**
 * EngineGpuHandles — GPU pipelines/targets sub-bag of `EngineState`. Every
 * field: null until `initGpu` resolves, released + re-nulled by `destroy()`.
 * Assigned once, EXCEPT the 8 `rebuildOnSwapFormat` rows (reassigned on
 * every HDR toggle). Add a field here AND a row to `GPU_HANDLE_ROWS`
 * (`gpuHandles/gpuHandleRegistry.ts`) — the totality check fails `tsc` until
 * both exist — unless it belongs in `GpuHandleKey`'s Exclude list
 * (`fadeBgl`, `sourceBgl`, `focusBgl`, `fontAtlases`, `envBrdfLut`, `uiCtx`,
 * `timingService`, `memory`). `pickProgram` is a row too, built
 * from `wireInput.ts`. Flag `rebuildOnSwapFormat: true` if the new row
 * bakes the swap format, or it silently goes stale on the first HDR toggle.
 */

import type { RenderTargets } from '../../rendering/RenderTargets';
import type { PickProgram } from '../frame/PickProgram';
import type { LabelRenderer } from '../../rendering/LabelRenderer';
import type { LabelPickRenderer } from '../../rendering/LabelPickRenderer';
import type { MarkerLineRenderer } from '../../rendering/MarkerLineRenderer';
import type { DebugLineRenderer } from '../../rendering/DebugLineRenderer';
import type { SelectionRingRenderer } from '../../rendering/SelectionRingRenderer';
import type { BloomPyramid } from '../../rendering/BloomPyramid';
import type { PickDebugOverlay } from '../../rendering/PickDebugOverlay';
import type { HorizonShellRenderer } from '../../rendering/HorizonShellRenderer';
import type { Label3DRenderer } from '../../rendering/Label3DRenderer';
import type { GpuTimingService } from '../../gpu/timing/GpuTimingService';
import type { MeshBodyRenderer } from '../../rendering/MeshBodyRenderer';
import type { CubeFaceBlitRenderer } from '../../rendering/CubeFaceBlitRenderer';
import type { DomeResampleRenderer } from '../../rendering/DomeResampleRenderer';
import type { BodyPickRenderer } from '../../rendering/bodyPickRenderer/BodyPickRenderer';
import type { OrbitTrailRenderer } from '../../rendering/orbitTrailRenderer/OrbitTrailRenderer';
import type { FadeUniformsBgl } from '../../rendering/FadeUniformsBgl';
import type { SourceUniformsBgl } from '../../rendering/SourceUniformsBgl';
import type { FocusUniformsBgl } from '../../rendering/FocusUniformsBgl';
import type { FocusUniformBuffer } from '../../rendering/FocusUniformBuffer';
import type { Compositor } from '../../rendering/Compositor';
import type { LoadedFontAtlases } from '../../rendering/LoadedFontAtlases';
import type { GpuContext } from '../../rendering/GpuContext';
import type { GpuMemorySnapshot } from '../../gpu/memory/GpuMemorySnapshot';

export type EngineGpuHandles = {
  /**
   * The parallel per-slab pick program over the content-layer registry.
   * Owns the hover / click / debug-overlay pick path: it filters the registry
   * by `drawPick` presence + `enabled`, re-rasterises each pickable slab into
   * its own r32uint target, reads back the cursor texel, and folds the results
   * near→far. Constructed in `wireInput` once the registry + GPU handles
   * exist; null until then. Destroyed in teardown alongside the other pick
   * providers — it owns per-slab pick + depth textures and staging buffers.
   */
  pickProgram: PickProgram | null;
  /**
   * Canonical FadeUniforms bind-group layout (@group(1)). Constructed
   * once in `initGpu` and shared by every renderer pipeline that fades.
   * Null until `initGpu` resolves; see EngineGpuHandles docblock on the
   * staged-construction pattern.
   */
  fadeBgl: FadeUniformsBgl | null;
  /**
   * Canonical SourceUniforms bind-group layout (@group(2), points
   * only). Constructed once in `initGpu` and shared between the
   * visual GalaxyPointRenderer and the offscreen GalaxyPickRenderer. Null until
   * `initGpu` resolves.
   */
  sourceBgl: SourceUniformsBgl | null;
  /**
   * Canonical FocusUniforms bind-group layout. Constructed once in
   * `initGpu` and shared by every pipeline that renders the structure-focus
   * dim — points (@group(3)), the impostor disks (@group(1)), and the
   * pick pass. Null until `initGpu` resolves.
   */
  focusBgl: FocusUniformsBgl | null;
  /**
   * The single shared structure-focus uniform (buffer + bind group + packer).
   * Only one structure is focused at a time, so one buffer serves the whole
   * engine: written once per frame in `renderFrame`, and its bind group —
   * built against `focusBgl` — is bound by every focus-aware pipeline at
   * its own group slot (a bind group is tied to a layout, not a group
   * number). The pick pass binds this same live buffer so non-members of a
   * focused structure are excluded from hit-testing. Null until `initGpu`
   * resolves; released and re-nulled by `destroy()`.
   */
  focusUniform: FocusUniformBuffer | null;
  /**
   * The offscreen render-target table — one owner for every offscreen row's
   * (`hdr`, `bloom0`, …) texture lifecycle, reconciled every frame against the
   * canvas size and the live state — only the rows whose pixel size moved are
   * reallocated.  See `services/gpu/renderTargets.ts` for the target table +
   * the per-row rationale (why the HDR offscreen exists); Layer-owned rows
   * are appended from each `Layer.targets`.
   */
  renderTargets: RenderTargets | null;
  /**
   * Unified 'merge offscreen texture into target' primitive — the single
   * pipeline cache every composite draw (tone-mapped HDR→swap, foreground
   * OVER, additive field→HDR) shares. Constructed once in `initGpu`
   * alongside the render targets; the blend→dstFormat mapping baked in
   * at construction is a constructor argument rather than a per-draw one
   * because a render-pass encoder cannot be queried for its own colour-
   * attachment format. Null until `initGpu` resolves; released and
   * re-nulled by `destroy()`, which must reach it because it owns the
   * cached pipelines' uniform buffers.
   */
  compositor: Compositor | null;
  /**
   * The decoded MSDF font atlas (BMFont JSON + bitmap), retained here (not a
   * local in `initGpu`) so `buildSwapRenderers` can re-run the label
   * factories on a swap-format rebuild without re-fetching. Null until
   * `initGpu` resolves the fetch; never released by `destroy()` — decoded
   * data, not a GPU resource.
   */
  fontAtlases: LoadedFontAtlases | null;
  /**
   * The split-sum environment BRDF (`public/lut/envBrdf.bin`), uploaded once at
   * boot and handed to `meshBodyRenderer` as a construction input. Not a
   * `GPU_HANDLE_ROWS` row for the same reason as `fontAtlases` — a row's
   * `construct` is synchronous, this arrives from a fetch — but unlike
   * `fontAtlases` it IS a GPU resource, so `destroy()` releases it.
   */
  envBrdfLut: GPUTexture | null;
  /**
   * Live GPU-memory ledger snapshot fn — see `trackGpuMemory.ts`. Installed
   * by `initGpu` right after the device resolves (before any renderer
   * allocates), so every `device.createBuffer`/`createTexture` call across
   * the whole boot is tracked. Not a `GPU_HANDLE_ROWS` row (nothing to
   * destroy — see `GpuHandleKey`'s Exclude list); `destroy()` re-nulls it for
   * lifecycle symmetry. `engine.ts`'s `debug.gpuMemory` reads it with an
   * empty-snapshot fallback for the pre-boot window.
   */
  memory: (() => GpuMemorySnapshot) | null;
  /**
   * `device` + `context` + `canvas` for every renderer that targets the swap
   * chain, retained here for the same reason as `fontAtlases`:
   * `buildSwapRenderers` rebuilds those renderers from it on a format swap.
   * Omits `format` (unlike `GpuContext`) because that's the one field that
   * goes stale the instant a rebuild starts: `initGpu` constructs this field
   * from its own format-less object literal (not the full `GpuContext` it
   * builds for other constructors), so no stale format exists to leak, and
   * `buildSwapRenderers` composes `{ ...uiCtx, format }` with the live value.
   * Null until `initGpu` constructs it; never released by `destroy()` — no
   * GPU resource of its own.
   */
  uiCtx: Omit<GpuContext, 'format'> | null;
  /**
   * MSDF text label renderer.  Null until `initGpu` completes the
   * `loadFontAtlas()` fetch and constructs the renderer against the
   * decoded atlas bitmap.  Excluded from the `isEngineReady` predicate:
   * the atlas load is async and optional from the engine's perspective;
   * the `labelsCosmoPass` null-checks this field at point of use.  Stored here
   * so `destroy()` can release the GPU buffers (uniform + storage +
   * instance + corner + atlas texture).
   */
  labelRendererCosmo: LabelRenderer | null;
  /**
   * Second MSDF label renderer for the true-scale foreground bodies
   * (zoom-to-Earth).  Separate from `labelRendererCosmo` because the scene-body
   * captions project through the NEAR0 slab view — whose near plane scales
   * with `cam.distance` so it always contains the bodies — rather than the
   * galaxy-scale `vp` the main labels use, and one renderer draws with one
   * view-projection.  Shared by core's `sceneBodyLabels` set (Earth, the
   * planets, the mesh bodies) and the star Layer's own producer (the
   * curated map, the Sun); `labelsNearPass` re-uploads both, merged,
   * camera-relative each frame.  Null until
   * `initGpu` builds it against the font atlas; excluded from
   * `isEngineReady` and null-checked at use, like `labelRendererCosmo`.
   * Released and re-nulled by `destroy()`.
   */
  labelRendererNear: LabelRenderer | null;
  /**
   * The r32uint pick provider for the COSMO text labels — one screen-space
   * rectangle per legible label, stamping its subject's packed id so clicking
   * a name selects the thing it names. A SEPARATE instance from
   * `labelPickRendererNear` for the reason the two label renderers are
   * separate, plus one more: the two slabs' pick targets carry different depth
   * formats and opposite depth conventions, both baked into the pipeline.
   * Null until `initGpu` builds it; `labelsCosmoPass.drawPick` null-checks at use.
   */
  labelPickRendererCosmo: LabelPickRenderer | null;
  /**
   * The NEAR0 sibling of `labelPickRendererCosmo`, for the foreground body
   * captions. Same lifecycle and rationale; `labelsNearPass.drawPick`
   * null-checks at use.
   */
  labelPickRendererNear: LabelPickRenderer | null;
  /**
   * Second thick screen-space line renderer, the leader-line sibling of
   * `labelRendererNear`.  A SEPARATE instance from `markerLineRendererCosmo`
   * for the same reason `labelRendererNear` is separate from
   * `labelRendererCosmo`: the scene-body leader lines project through the NEAR0
   * slab (whose near plane scales with `cam.distance` so it always contains
   * the AU-scale bodies), while `markerLineRendererCosmo`'s director-driven lines
   * project through the galaxy-scale COSMO `vp` that would clip the bodies
   * away — and one renderer draws with one view-projection.  Drawn by
   * `labelsNearPass`, which rebases its connectors into the
   * camera-relative frame each frame exactly as it rebases the captions.
   * Null until `initGpu` builds it (same UI ctx / swap-chain format as the
   * caption renderer, no atlas dep); excluded from `isEngineReady` and
   * null-checked at use.  Released and re-nulled by `destroy()`.
   */
  markerLineRendererNear: MarkerLineRenderer | null;
  /**
   * Thick screen-space line overlay renderer.  Null until `initGpu`
   * constructs it alongside `labelRendererCosmo` (same phase, no atlas dep).
   * Excluded from the `isEngineReady` predicate for the same reason as
   * `labelRendererCosmo`.  The `markerLinesPass` null-checks this field at
   * point of use.  Stored here so `destroy()` can release the GPU
   * buffers (uniform + instance + corner).
   */
  markerLineRendererCosmo: MarkerLineRenderer | null;
  /**
   * Dedicated debug-draw thick-line renderer — the substrate for the clip-path
   * inspector overlay (speed-coloured route + scrub gizmo). Constructed
   * alongside `markerLineRendererCosmo` (same UI ctx, swap-chain format, no atlas
   * dep), but decoupled from the label director: the `clipPathDebugPass`
   * null-checks it and feeds it a freshly built `DebugLine[]` each frame.
   * Excluded from `isEngineReady`. Stored here so `destroy()` releases its GPU
   * buffers (uniform + instance + corner).
   */
  debugLineRenderer: DebugLineRenderer | null;
  /**
   * Selection-ring overlay renderer — draws a white annulus around the
   * currently-selected galaxy on the swap-chain UI overlay. Null until
   * `initGpu` constructs it; `selectionRingPass` null-checks at point
   * of use. Stored here so `destroy()` can release the renderer's
   * two uniform buffers and bind group.
   */
  selectionRingRenderer: SelectionRingRenderer | null;
  /**
   * Cosmic-horizon shell renderer — translucent sphere at the
   * comoving particle-horizon radius.  Same lifecycle as the other
   * optional renderers (null until `initGpu` constructs it; nulled
   * back out during teardown).
   */
  horizonShellRenderer: HorizonShellRenderer | null;
  /**
   * Shared world-geometry text renderer (spec §9.1) — any number of
   * arc-placed labels, each with its own font/placement/repeat count. Draws
   * into HDR (not the swap chain), so it is NOT one of the
   * `rebuildOnSwapFormat` rows. Null until `initGpu` constructs it; nulled
   * back out during teardown.
   */
  label3DRenderer: Label3DRenderer | null;
  /**
   * Dual-filter bloom mip pyramid — owns the bright / downsample / upsample /
   * fold pipelines that drive the `bloom0..bloom4` render-target rows and the
   * strength-scaled fold back into HDR. Null until `initGpu` constructs it
   * (same phase as the other optional renderers). Excluded from
   * `isEngineReady` — every bloom content layer's `enabled` gate is exactly the
   * `bloomPyramid !== null` handle-ready check, so a null handle silently drops
   * the whole bloom sub-program. The `settings.bloom.enabled` toggle gates at
   * frame-program build, not here. Stored so `destroy()` can release the small
   * per-level + fold uniform buffers.
   */
  bloomPyramid: BloomPyramid | null;
  /**
   * Pick-buffer debug overlay — fullscreen colour-map of the r32uint
   * pick texture over the tone-mapped frame.  Null until `initGpu`
   * constructs it.  Excluded from `isEngineReady`: it's a debug-only
   * pass, and the per-frame consumer null-checks the field along with
   * the `state.settings.debug.overlays['pick-buffer']` toggle.  Stored here so
   * `destroy()` can release the pipeline + bind-group-layout via the
   * pass's no-op destroy method (symmetry with the other GPU-resource
   * owners).
   */
  pickDebugOverlay: PickDebugOverlay | null;
  /**
   * The shared lit triangle-mesh renderer for every mesh body — real authored
   * geometry in metres, per-mesh buffers/textures/uniform behind a `Map` keyed by
   * mesh id. Every mesh pass (`drawMeshBodiesOnRow`) draws the resident mesh bodies attached to the
   * current body slab's host through it; the mesh slot family's commit routes a
   * decoded `MeshAsset` to `setMesh` and its onRelease to `clearMesh`. Same
   * `foreground:0` format invariant as the sphere bodies (see
   * `renderTargetFormats.ts`); excluded from `isEngineReady` and null-checked at
   * use. Null until `initGpu` constructs it; released and re-nulled by `destroy()`.
   */
  meshBodyRenderer: MeshBodyRenderer | null;
  /**
   * The covering-triangle cube blit `skyCubemapBlitPass` lays the solar-system
   * sky under a probe capture with. Draws into a probe's own cube, whose
   * format is `HDR_TARGET_FORMAT` (`meshBodyRenderer`'s `mintProbe`). Null
   * until `initGpu` constructs it; excluded from `isEngineReady` and
   * null-checked at use.
   */
  cubeFaceBlitRenderer: CubeFaceBlitRenderer | null;
  /**
   * The fisheye resample `domeResamplePass` draws with: the five `dome-cube`
   * faces into one image, once per frame. Null until `initGpu` constructs it;
   * excluded from `isEngineReady` and null-checked at use.
   */
  domeResampleRenderer: DomeResampleRenderer | null;
  /**
   * The r32uint pick provider for the NEAR0 foreground bodies (Earth, the
   * planets, and the ~25 seeded scene stars incl. the Sun) — the body-family
   * analogue of the starCatalog Layer's pick renderer.  Records ONE body sphere
   * per `drawSphere` call (via a 256-byte-aligned dynamic-offset uniform whose
   * per-SUBMIT cursor sidesteps the writeBuffer/submit race — see
   * `bodyPickRenderer`'s header) and the sub-pixel scene-star POINT partition
   * as one instanced pick-billboard draw.  Depth-tested (`depth32float`,
   * 'greater', the NEAR0 reversed-Z convention) so overlapping bodies resolve
   * nearest-wins.  Constructed in `initGpu`; the body layers' `drawPick` rows
   * (Task 11) drive it.  Excluded from
   * `isEngineReady` and null-checked at use.  Released and re-nulled by
   * `destroy()` (its sphere mesh VBO/IBO, the sphere dynamic-offset + point
   * camera uniforms, and the grow-only point instance buffer).
   */
  bodyPickRenderer: BodyPickRenderer | null;
  /**
   * The accurate Keplerian orbit trails (Earth / Jupiter around the Sun, the
   * Moon around Earth) as additive screen-space conics into the depthless HDR
   * target — the `orbit-trails` layer, sharing the frame program's
   * `(hdr, NEAR0)` render step with `star-points`.  No depth format: the hdr
   * row has no depth attachment.  ONE instanced draw paints every trail:
   * `orbitTrailsPass` packs each orbit's f64-composed inverse homography
   * `Ginv` + trail params into a per-instance vertex record, so no per-orbit
   * bind or mid-frame uniform exists for the writeBuffer-vs-submit race to
   * clobber.  `orbitTrailsPass` derives the conic geometry per frame from the
   * current body snapshot, so the renderer needs no bootstrap data delivery at
   * all.  Excluded from `isEngineReady` and null-checked at use.
   * Null until `initGpu` constructs it; released and re-nulled by `destroy()`
   * (releases the instance buffer).
   */
  orbitTrailRenderer: OrbitTrailRenderer | null;
  /**
   * Per-pass GPU timing service.  Always non-null — the engine state
   * is initialized with a no-op stub (see `createDisabledGpuTimingService`)
   * and `initGpu` replaces it with the device-aware service once the
   * GPU device is available.  Consumers gate work behind one check:
   * `if (state.gpu.timingService.enabled) { ... }`.
   *
   * `enabled` is true iff `?gpuTimings` is set AND the adapter
   * supports `timestamp-query`.  False covers both "user opted out"
   * and "feature missing"; the DebugPanel shows one combined
   * "unavailable" message in either case.
   *
   * No GPU resources are allocated in the disabled path, so always-
   * non-null carries no perf cost.
   */
  timingService: GpuTimingService;
};
