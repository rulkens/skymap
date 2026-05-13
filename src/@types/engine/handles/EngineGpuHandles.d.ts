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
 * `texturedQuadRenderer` / `texturedDiskRenderer` / `proceduralDiskRenderer` /
 * `milkyWayRenderer` fields exist on this bag specifically so the
 * `destroy()` chain has a reachable reference to call `.destroy()` on
 * — they are not consumed via this bag at runtime (the frame loop
 * receives them through `RunFrameDeps` for historical reasons).  When
 * adding a new GPU-resource-owning renderer, add it here so the
 * teardown path stays complete.
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
import type { PickRenderer } from '../../rendering/PickRenderer';
import type { FilamentRenderer } from '../../rendering/FilamentRenderer';
import type { LabelRenderer } from '../../rendering/LabelRenderer';
import type { MarkerLineRenderer } from '../../rendering/MarkerLineRenderer';
import type { ScalarVolumeRenderer } from '../../rendering/ScalarVolumeRenderer';
import type { TexturedQuadRenderer } from '../../rendering/TexturedQuadRenderer';
import type { TexturedDiskRenderer } from '../../rendering/TexturedDiskRenderer';
import type { ProceduralDiskRenderer } from '../../rendering/ProceduralDiskRenderer';
import type { MilkyWayRenderer } from '../../rendering/MilkyWayRenderer';
import type { GpuTimingService } from '../../gpu/timing/GpuTimingService';

export type EngineGpuHandles = {
  renderer: PointRenderer | null;
  pickRenderer: PickRenderer | null;
  /**
   * Combined HDR offscreen target + tone-map post-process.  Pre-Phase-4
   * this was two fields (`hdrTarget` + `toneMapPass`); they merged into
   * one because their lifetimes are identical and they're always used
   * together (HDR pass writes the texture, post-process samples it).
   * See `services/gpu/postProcess.ts` for the rationale.
   */
  postProcess: PostProcess | null;
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
   * Textured-quad renderer for galaxy thumbnails.  Null until `initGpu`
   * constructs it from a `GpuContext` snapshot.  Stored here purely so
   * `destroy()` can release the renderer's GPU buffers (uniform + per-
   * instance + corner) — pre-2026-05-08 this lived on the bootstrap-
   * local `phaseLocals` carrier, which `engine.ts.destroy()` had no
   * reachable reference to (PR #66 follow-up: phaseLocals goes away
   * once `startLoop` finishes, by design).  Promoting to `state.gpu.*`
   * fixes the destroy-reachability gap without rewiring any of the
   * frame-loop's existing references through `phaseLocals`.
   *
   * Excluded from `isEngineReady` — it's set during `initGpu` (the
   * first bootstrap phase, well before `wireSlots`/`wireInput`), and
   * adding fields to that predicate is the same lifecycle hazard the
   * 2026-05-08 black-screen incident exposed (bootstrap progression
   * isn't the inverse of teardown).  Read sites that run during
   * bootstrap null-check this field individually.
   */
  texturedQuadRenderer: TexturedQuadRenderer | null;
  /**
   * 3D-oriented disk renderer for large galaxies (close-approach view).
   * Same lifecycle, same reachability rationale, and same isEngineReady
   * exclusion as `texturedQuadRenderer` above — see that field's docstring
   * for the full story.
   */
  texturedDiskRenderer: TexturedDiskRenderer | null;
  /**
   * Procedural-disk renderer that bridges the visibility band between
   * point glow (~8 px) and textured disks (~24 px).  Same lifecycle,
   * same reachability rationale, and same isEngineReady exclusion as
   * `texturedQuadRenderer` above.
   */
  proceduralDiskRenderer: ProceduralDiskRenderer | null;
  /**
   * Procedural Milky-Way impostor renderer at world origin.  Same
   * lifecycle, same reachability rationale, and same isEngineReady
   * exclusion as `texturedQuadRenderer` above.
   */
  milkyWayRenderer: MilkyWayRenderer | null;
  /**
   * Multi-field 3D scalar-field volume renderer.  Null until `initGpu`
   * constructs it (same phase as the other optional renderers).
   * Excluded from the `isEngineReady` predicate — the renderer is
   * optional at runtime; the `scalarVolumePass.enabled` gate checks the
   * master `volumesEnabled` setting first and then consults
   * `hasActiveFields()`, so a null handle (pre-bootstrap or destroyed)
   * is silently a no-op.  Stored here so `destroy()` can release every
   * per-field GPU buffer (3D volume textures, palette LUTs, uniform
   * buffers, corner / index VBOs).
   */
  scalarVolumeRenderer: ScalarVolumeRenderer | null;
  /**
   * Per-pass GPU timing service.  Null when the engine is constructed
   * without the `?gpuTimings` URL gate (the common case) OR when the
   * adapter lacks the `timestamp-query` feature (the constructor's
   * own no-op short-circuit would otherwise hand us a service with
   * `available: false`, but we prefer null at this layer so the
   * destroy chain doesn't call `.destroy()` on a never-allocated
   * stub).
   *
   * Same lifecycle, same reachability rationale, and same
   * `isEngineReady` exclusion as `texturedQuadRenderer` above — see
   * that field's docstring for the full story.
   */
  timingService: GpuTimingService | null;
};
