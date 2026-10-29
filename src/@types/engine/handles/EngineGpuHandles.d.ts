/**
 * EngineGpuHandles: GPU pipelines/targets sub-bag of `EngineState`. Every field is
 * null until `initGpu` resolves and re-nulled by `destroy()`. Assigned once, EXCEPT
 * the `rebuildOnSwapFormat` rows (reassigned on every HDR toggle). Add a field here
 * AND a row to `GPU_HANDLE_ROWS` (`gpuHandles/gpuHandleRegistry.ts`; `tsc` fails
 * until both exist) unless it belongs in `GpuHandleKey`'s Exclude list. Flag
 * `rebuildOnSwapFormat: true` if the row bakes the swap format, or it goes stale
 * on the first HDR toggle.
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
import type { HorizonShellRenderer } from '../../../layers/cosmicHorizon/@types/HorizonShellRenderer';
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
   * The parallel per-slab pick program over the content-layer registry: re-rasterises
   * each pickable slab into its own r32uint target, reads back the cursor texel, folds
   * near to far. Built in `wireInput`; owns per-slab pick/depth textures and staging
   * buffers.
   */
  pickProgram: PickProgram | null;
  /**
   * Canonical FadeUniforms bind-group layout (@group(1)), shared by every fading
   * pipeline.
   */
  fadeBgl: FadeUniformsBgl | null;
  /**
   * Canonical SourceUniforms bind-group layout (@group(2), points only), shared by the
   * visual and pick point renderers.
   */
  sourceBgl: SourceUniformsBgl | null;
  /**
   * Canonical FocusUniforms bind-group layout, shared by every pipeline rendering the
   * structure-focus dim (points @group(3), impostor disks @group(1), the pick pass).
   */
  focusBgl: FocusUniformsBgl | null;
  /**
   * The single shared structure-focus uniform (buffer + bind group + packer), written
   * once per frame in `renderFrame`. Its bind group is built against `focusBgl` and
   * bound at each pipeline's own group slot; the pick pass binds the same buffer so non-
   * members of a focused structure are not hit-testable.
   */
  focusUniform: FocusUniformBuffer | null;
  /**
   * The offscreen render-target table, reconciled every frame against canvas size and
   * live state (only rows whose pixel size moved are reallocated). See
   * `services/gpu/renderTargets.ts`; Layer-owned rows are appended from each
   * `Layer.targets`.
   */
  renderTargets: RenderTargets | null;
  /**
   * The single pipeline cache every composite draw shares (tone-mapped HDR to swap,
   * foreground OVER, additive field to HDR). The blend-to-dstFormat mapping is a
   * constructor argument because a render-pass encoder cannot report its attachment
   * format. `destroy()` must reach it: it owns uniform buffers.
   */
  compositor: Compositor | null;
  /**
   * The decoded MSDF font atlas, retained so `buildSwapRenderers` can rebuild the label
   * factories on a swap-format change without re-fetching. Decoded data, never released
   * by `destroy()`.
   */
  fontAtlases: LoadedFontAtlases | null;
  /**
   * The split-sum environment BRDF (`public/lut/envBrdf.bin`), uploaded once at boot as
   * a `meshBodyRenderer` construction input. Not a `GPU_HANDLE_ROWS` row (a row's
   * `construct` is synchronous; this arrives from a fetch), but a GPU resource, so
   * `destroy()` releases it.
   */
  envBrdfLut: GPUTexture | null;
  /**
   * Live GPU-memory ledger snapshot fn (`trackGpuMemory.ts`), installed by `initGpu`
   * before any renderer allocates. `debug.gpuMemory` falls back to an empty snapshot
   * before boot.
   */
  memory: (() => GpuMemorySnapshot) | null;
  /**
   * `device` + `context` + `canvas` for swap-chain renderers, retained for
   * `buildSwapRenderers`. Omits `format` because it goes stale the instant a rebuild
   * starts; the rebuild composes `{ ...uiCtx, format }` with the live value. Never
   * released by `destroy()`.
   */
  uiCtx: Omit<GpuContext, 'format'> | null;
  /**
   * MSDF text label renderer; the atlas load is async and optional, so it is excluded
   * from `isEngineReady` and `labelsCosmoPass` null-checks it.
   */
  labelRendererCosmo: LabelRenderer | null;
  /**
   * Second MSDF label renderer for the true-scale foreground bodies. Separate from
   * `labelRendererCosmo` because scene-body captions project through the NEAR0 slab view
   * (near plane scales with `cam.distance`) and one renderer draws with one view-
   * projection. Shared by core's `sceneBodyLabels` and the star Layer's producer;
   * `labelsNearPass` re-uploads both, merged and camera-relative, each frame.
   */
  labelRendererNear: LabelRenderer | null;
  /**
   * The r32uint pick provider for COSMO text labels: one screen-space rectangle per
   * legible label stamping its subject's packed id. Separate from the Near instance
   * because the two slabs' pick targets differ in depth format and depth convention,
   * both baked into the pipeline.
   */
  labelPickRendererCosmo: LabelPickRenderer | null;
  /**
   * The NEAR0 sibling of `labelPickRendererCosmo`, for the foreground body captions.
   */
  labelPickRendererNear: LabelPickRenderer | null;
  /**
   * Leader-line sibling of `labelRendererNear`, separate from `markerLineRendererCosmo`
   * for the same one-view-projection reason. Drawn by `labelsNearPass`, which rebases
   * its connectors camera-relative each frame.
   */
  markerLineRendererNear: MarkerLineRenderer | null;
  /**
   * Thick screen-space line overlay renderer; `markerLinesPass` null-checks it.
   */
  markerLineRendererCosmo: MarkerLineRenderer | null;
  /**
   * Debug-draw thick-line renderer for the clip-path inspector overlay, decoupled from
   * the label director; `clipPathDebugPass` feeds it a fresh `DebugLine[]` each frame.
   */
  debugLineRenderer: DebugLineRenderer | null;
  /**
   * Selection-ring overlay: a white annulus around the selected galaxy on the swap-chain
   * UI overlay.
   */
  selectionRingRenderer: SelectionRingRenderer | null;
  /**
   * Cosmic-horizon shell: a translucent sphere at the comoving particle-horizon radius.
   */
  horizonShellRenderer: HorizonShellRenderer | null;
  /**
   * Shared world-geometry text renderer for arc-placed labels. Draws into HDR, not the
   * swap chain, so it is NOT a `rebuildOnSwapFormat` row.
   */
  label3DRenderer: Label3DRenderer | null;
  /**
   * Dual-filter bloom mip pyramid driving the `bloom0..bloom4` rows and the fold back
   * into HDR. Every bloom layer's `enabled` gate is `bloomPyramid !== null`, so a null
   * handle silently drops the whole bloom sub-program; `settings.bloom.enabled` gates at
   * frame-program build, not here.
   */
  bloomPyramid: BloomPyramid | null;
  /**
   * Fullscreen colour-map of the r32uint pick texture over the tone-mapped frame; debug-
   * only, null-checked with the `pick-buffer` overlay toggle.
   */
  pickDebugOverlay: PickDebugOverlay | null;
  /**
   * The shared lit triangle-mesh renderer for every mesh body: per-mesh
   * buffers/textures/uniform in a `Map` keyed by mesh id. The mesh slot family's commit
   * routes a `MeshAsset` to `setMesh` and onRelease to `clearMesh`. Same `foreground:0`
   * format invariant as the sphere bodies (`renderTargetFormats.ts`).
   */
  meshBodyRenderer: MeshBodyRenderer | null;
  /**
   * The covering-triangle cube blit `skyCubemapBlitPass` lays the sky under a probe
   * capture with; draws into a probe's own cube, whose format is `HDR_TARGET_FORMAT`.
   */
  cubeFaceBlitRenderer: CubeFaceBlitRenderer | null;
  /**
   * The fisheye resample `domeResamplePass` draws with: the five `dome-cube` faces into
   * one image, once per frame.
   */
  domeResampleRenderer: DomeResampleRenderer | null;
  /**
   * The r32uint pick provider for the NEAR0 foreground bodies (Earth, planets, scene
   * stars incl. the Sun): one body sphere per `drawSphere` call through a 256-byte-
   * aligned dynamic-offset uniform whose per-SUBMIT cursor sidesteps the
   * writeBuffer/submit race (see `bodyPickRenderer`'s header), plus the sub-pixel star
   * POINT partition as one instanced draw. Depth-tested (`depth32float`, 'greater',
   * NEAR0 reversed-Z) so the nearest wins.
   */
  bodyPickRenderer: BodyPickRenderer | null;
  /**
   * The Keplerian orbit trails as additive screen-space conics into the depthless HDR
   * target, sharing the `(hdr, NEAR0)` step with `star-points`. ONE instanced draw
   * paints every trail: `orbitTrailsPass` packs each orbit's f64-composed inverse
   * homography into a per-instance vertex record, so no mid-frame uniform exists for the
   * writeBuffer-vs-submit race to clobber.
   */
  orbitTrailRenderer: OrbitTrailRenderer | null;
  /**
   * Per-pass GPU timing. Always non-null: a no-op stub (`createDisabledGpuTimingService`)
   * until `initGpu` swaps in the device-aware one. `enabled` is true iff `?gpuTimings`
   * is set AND the adapter supports `timestamp-query`.
   */
  timingService: GpuTimingService;
};
