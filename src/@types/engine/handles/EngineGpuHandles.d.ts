/**
 * EngineGpuHandles — the GPU pipelines / targets sub-bag of the
 * canonical `EngineState`.
 *
 * ### Why these fields start as null
 *
 * `createEngine` returns its handle synchronously, but the actual GPU
 * pipelines need an async `requestAdapter()` → `requestDevice()` chain.
 * The engine threads this through an async IIFE that runs in the
 * background after the handle has already been returned, so for one or
 * two frames at startup these handles are unavailable.  Modelling them
 * as `T | null` (rather than non-null with a separate "ready" flag)
 * makes the consumer null-check honest — every site that touches a
 * pipeline has to acknowledge the not-yet-built case, instead of relying
 * on a single boolean that someone might forget to read.
 *
 * ### Lifecycle
 *
 *   1. Sub-bag constructed with every field = null.
 *   2. Async IIFE runs: each field gets assigned exactly once after
 *      `initGpu` resolves.
 *   3. `destroy()` releases each pipeline and resets the field back to
 *      null for symmetry — this matters when the React layer remounts
 *      the canvas (StrictMode, hot-reload) and a fresh `createEngine`
 *      runs against a stale state object would otherwise see "ready"
 *      handles pointing at destroyed GPU resources.
 *
 * **Every field on this bag shares the same lifecycle rule** — null
 * before bootstrap, non-null after `initGpu` resolves, released and
 * re-nulled by `destroy()`.  That symmetry is load-bearing: the
 * `texturedDiskRenderer` / `proceduralDiskRenderer` / `milkyWayRenderer`
 * fields exist on this bag specifically so the `destroy()` chain has a
 * reachable reference to call `.destroy()` on — they are not consumed
 * via this bag at runtime (the frame loop receives them through
 * `RunFrameDeps` for historical reasons).  When adding a new GPU-
 * resource-owning renderer, add it here so the teardown path stays
 * complete.
 *
 * ### Why grouped vs. flat?
 *
 * Mirrors the original closure grouping in pre-Phase-4 `engine.ts`,
 * where these bindings sat together under one header comment.
 * Keeping the bag named lets the renderFrame helper accept just the
 * GPU bag rather than the whole `EngineState`.
 */

import type { PointRenderer } from '../../rendering/PointRenderer';
import type { PostProcess } from '../../rendering/PostProcess';
import type { VolumeOffscreen } from '../../rendering/VolumeOffscreen';
import type { PickRenderer } from '../../rendering/PickRenderer';
import type { FilamentRenderer } from '../../rendering/FilamentRenderer';
import type { LabelRenderer } from '../../rendering/LabelRenderer';
import type { MarkerLineRenderer } from '../../rendering/MarkerLineRenderer';
import type { SelectionRingRenderer } from '../../rendering/SelectionRingRenderer';
import type { ClusterMarkerRenderer } from '../../rendering/ClusterMarkerRenderer';
import type { ScalarVolumeRenderer } from '../../rendering/ScalarVolumeRenderer';
import type { VolumeUpsample } from '../../rendering/VolumeUpsample';
import type { PickDebugOverlay } from '../../rendering/PickDebugOverlay';
import type { TexturedDiskRenderer } from '../../rendering/TexturedDiskRenderer';
import type { ProceduralDiskRenderer } from '../../rendering/ProceduralDiskRenderer';
import type { MilkyWayRenderer } from '../../rendering/MilkyWayRenderer';
import type { HorizonShellRenderer } from '../../rendering/HorizonShellRenderer';
import type { GpuTimingService } from '../../gpu/timing/GpuTimingService';
import type { DiskRadiusRing } from '../../rendering/DiskRadiusRing';
import type { FadeUniformsBgl } from '../../rendering/FadeUniformsBgl';
import type { SourceUniformsBgl } from '../../rendering/SourceUniformsBgl';
import type { FocusUniformsBgl } from '../../rendering/FocusUniformsBgl';

export type EngineGpuHandles = {
  renderer: PointRenderer | null;
  pickRenderer: PickRenderer | null;
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
   * visual PointRenderer and the offscreen PickRenderer. Null until
   * `initGpu` resolves.
   */
  sourceBgl: SourceUniformsBgl | null;
  /**
   * Canonical FocusUniforms bind-group layout (@group(3), points +
   * pick). Constructed once in `initGpu` and shared between the visual
   * PointRenderer (binds the live focus buffer) and the offscreen
   * PickRenderer (binds a zeroed dummy so its explicit layout matches).
   * Null until `initGpu` resolves.
   */
  focusBgl: FocusUniformsBgl | null;
  /**
   * Combined HDR offscreen target + tone-map post-process.  Pre-Phase-4
   * this was two fields (`hdrTarget` + `toneMapPass`); they merged into
   * one because their lifetimes are identical and they're always used
   * together (HDR pass writes the texture, post-process samples it).
   * See `services/gpu/postProcess.ts` for the rationale.
   */
  postProcess: PostProcess | null;
  /**
   * Half-resolution intermediate render target consumed by the scalar-
   * volume pass.  Volume fields raymarch into this target at 1/4 the
   * fragment count (floor(canvas/2) on each axis), then the upsample
   * pass bilinearly samples it and additively blends into the HDR
   * target.  Resized in lockstep with `postProcess`, but kept as a
   * separate module because conceptually it has nothing to do with
   * the tone-map (postProcess only ever reads the HDR view).  See
   * `services/gpu/passes/volumeOffscreen.ts` for the full rationale.
   */
  volumeOffscreen: VolumeOffscreen | null;
  /**
   * Cosmic-web filament-skeleton renderer.  Constructed unconditionally
   * during GPU init (the pipeline is cheap), stays empty-segment until
   * the optional `loadFilaments()` resolves with a non-null cloud.
   * Stored on the GPU bag so `destroy()` can release the per-instance
   * buffer + uniform buffer + quad VBO without needing the construction-
   * time closure to outlive the public handle.
   */
  filamentRenderer: FilamentRenderer | null;
  /**
   * MSDF text label renderer.  Null until `initGpu` completes the
   * `loadFontAtlas()` fetch and constructs the renderer against the
   * decoded atlas bitmap.  Excluded from the `isEngineReady` predicate
   * — same rationale as `filamentRenderer`: the atlas load is async and
   * optional from the engine's perspective; the `labelsPass` null-checks
   * this field at point of use.  Stored here so `destroy()` can release
   * the GPU buffers (uniform + storage + instance + corner + atlas texture).
   */
  labelRenderer: LabelRenderer | null;
  /**
   * Thick screen-space line overlay renderer.  Null until `initGpu`
   * constructs it alongside `labelRenderer` (same phase, no atlas dep).
   * Excluded from the `isEngineReady` predicate for the same reason as
   * `labelRenderer`.  The `markerLinesPass` null-checks this field at
   * point of use.  Stored here so `destroy()` can release the GPU
   * buffers (uniform + instance + corner).
   */
  markerLineRenderer: MarkerLineRenderer | null;
  /**
   * Selection-ring overlay renderer — draws a white annulus around the
   * currently-selected galaxy on the swap-chain UI overlay. Null until
   * `initGpu` constructs it; `selectionRingPass` null-checks at point
   * of use. Stored here so `destroy()` can release the renderer's
   * two uniform buffers and bind group.
   */
  selectionRingRenderer: SelectionRingRenderer | null;
  /**
   * Cluster-marker renderer — draws halo + ring overlays for POI clusters
   * (one renderer for all POI source categories; per-source bind groups
   * live inside the renderer).  Null until `initGpu` constructs it
   * (task 13 of cluster-viz sub-plan 2).  Excluded from the
   * `isEngineReady` predicate for the same reason as `markerLineRenderer`
   * — null-checked at point of use by the cluster-marker frame pass
   * (task 14).  Stored here so `destroy()` can release the renderer's
   * GPU buffers (per-category bind groups + per-instance buffer +
   * corner VBO).
   */
  clusterMarkerRenderer: ClusterMarkerRenderer | null;
  /**
   * Atlas-bound 3D-oriented disk renderer for large galaxy thumbnails
   * (close-approach view).  Null until `initGpu` constructs it from a
   * `GpuContext` snapshot.  Stored here purely so `destroy()` can
   * release the renderer's GPU buffers (uniform + per-instance + corner)
   * — pre-2026-05-08 this lived on the bootstrap-local `phaseLocals`
   * carrier, which `engine.ts.destroy()` had no reachable reference to
   * (PR #66 follow-up: phaseLocals goes away once `startLoop` finishes,
   * by design).  Promoting to `state.gpu.*` fixes the destroy-
   * reachability gap without rewiring the frame-loop's existing
   * references through `phaseLocals`.
   *
   * Excluded from `isEngineReady` — it's set during `initGpu` (the
   * first bootstrap phase, well before `wireSlots`/`wireInput`), and
   * adding fields to that predicate is the same lifecycle hazard the
   * 2026-05-08 black-screen incident exposed (bootstrap progression
   * isn't the inverse of teardown).  Read sites that run during
   * bootstrap null-check this field individually.
   */
  texturedDiskRenderer: TexturedDiskRenderer | null;
  /**
   * Procedural-disk renderer that bridges the visibility band between
   * point glow (~8 px) and textured disks (~24 px).  Same lifecycle,
   * same reachability rationale, and same isEngineReady exclusion as
   * `texturedDiskRenderer` above.
   */
  proceduralDiskRenderer: ProceduralDiskRenderer | null;
  /**
   * Procedural Milky-Way impostor renderer at world origin.  Same
   * lifecycle, same reachability rationale, and same isEngineReady
   * exclusion as `texturedDiskRenderer` above.
   */
  milkyWayRenderer: MilkyWayRenderer | null;
  /**
   * Cosmic-horizon shell renderer — translucent sphere at the
   * comoving particle-horizon radius.  Same lifecycle as the other
   * optional renderers (null until `initGpu` constructs it; nulled
   * back out during teardown).
   */
  horizonShellRenderer: HorizonShellRenderer | null;
  /**
   * Multi-field 3D scalar-field volume renderer.  Null until `initGpu`
   * constructs it (same phase as the other optional renderers).
   * Excluded from the `isEngineReady` predicate — the renderer is
   * optional at runtime; the `volumeUpsamplePass.enabled` gate checks
   * the master `volumesEnabled` setting first and then consults
   * `hasActiveFields()`, so a null handle (pre-bootstrap or destroyed)
   * is silently a no-op.  Stored here so `destroy()` can release every
   * per-field GPU buffer (3D volume textures, palette LUTs, uniform
   * buffers, corner / index VBOs).
   */
  scalarVolumeRenderer: ScalarVolumeRenderer | null;
  /**
   * Half-res-to-HDR volume upsample pass.  Null until `initGpu`
   * constructs it (same phase as the other optional renderers).
   * Excluded from the `isEngineReady` predicate — when null, the
   * `volumeUpsamplePass` skips its draw (so a null handle is a silent
   * no-op).  Stored here so `destroy()` can release the pipeline +
   * sampler + bind-group-layout.
   */
  volumeUpsample: VolumeUpsample | null;
  /**
   * Pick-buffer debug overlay — fullscreen colour-map of the r32uint
   * pick texture over the tone-mapped frame.  Null until `initGpu`
   * constructs it.  Excluded from `isEngineReady`: it's a debug-only
   * pass, and the per-frame consumer null-checks the field along with
   * the `state.settings.debug.showPickBuffer` toggle.  Stored here so
   * `destroy()` can release the pipeline + bind-group-layout via the
   * pass's no-op destroy method (symmetry with the other GPU-resource
   * owners).
   */
  pickDebugOverlay: PickDebugOverlay | null;
  /**
   * Disk-radius debug ring — a world-space line-strip drawn in the disk
   * plane around the selected galaxy at its catalog disk radius.  Null
   * until `initGpu` constructs it.  Excluded from `isEngineReady`: a
   * debug-only overlay, null-checked together with the
   * `state.settings.debug.showDiskRadiusRing` toggle.  Unlike
   * `pickDebugOverlay` (which owns no GPU buffers), this pass owns two
   * uniform buffers, so the `destroy()` chain must release it.
   */
  diskRadiusRing: DiskRadiusRing | null;
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
