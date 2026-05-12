/**
 * Pass — the per-frame draw-block abstraction.
 *
 * A `Pass` is one discrete unit of GPU work that records into the
 * in-flight HDR `GPURenderPassEncoder`.  Pre-D.2 the four HDR draw
 * blocks (point sprites, galaxy thumbnails, filament skeleton, Milky
 * Way impostor) lived as inline `if (...)` branches inside
 * `renderFrame.ts`.  After D.2 each block becomes a one-file unit
 * implementing this interface, and `renderFrame` collapses to a small
 * for-loop over a `readonly Pass[]` array.
 *
 * ### Why an interface instead of free functions
 *
 * The naive shape would be `(pass, ctx, state, settings, deps) =>
 * boolean | void` — return `false` to skip, otherwise draw.  That
 * works mechanically but loses two useful properties:
 *
 *   1. **Tests can't introspect "would this pass have drawn?"
 *      independently of "did it actually draw?"**  Splitting `enabled`
 *      from `draw` lets a unit test assert the gate predicate without
 *      stubbing a `GPURenderPassEncoder`.
 *   2. **No place to hang a stable name.**  Debug breadcrumbs (and the
 *      one ordering test) need to identify a pass without grep'ing
 *      function references.  A `name: string` field slots in
 *      naturally on the object literal.
 *
 * ### Why the tone-map pass isn't a `Pass`
 *
 * Tone-map runs OUTSIDE the HDR `beginRenderPass` block — it samples
 * the HDR target the four HDR passes wrote into and blits to the
 * swap chain.  Modelling it as a `Pass` would force a divergent
 * signature (encoder vs. pass-encoder) for one inhabitant.  Instead
 * `renderFrame` calls `postProcess.draw(...)` inline after the loop;
 * see the spec D.2 "tone-map special case" section for the rationale.
 *
 * ### Why a `const` object literal per file, not a class
 *
 * Passes are stateless across frames — every input is read fresh from
 * `state` / `ctx` / `settings` / `deps` per call.  A class adds the
 * "where do I instantiate this?" question and the inheritance escape
 * hatch that the project's `type` aliases convention (CLAUDE.md)
 * deliberately rejects.  `export const xyzPass: Pass = { ... }` is
 * the lightest shape that satisfies the type and keeps every pass a
 * grep-friendly module.
 *
 * ### Why `PassDeps` separately from `ctx`
 *
 * `ReadyFrameContext` (D.1) carries the *derived per-frame snapshot*:
 * camera, view-projection matrix, viewport size, and the three
 * GPU/subsystem handles that ride along once the bootstrap gate
 * passes.  `PassDeps` carries the *renderer references* — handles
 * that pre-D.2 were threaded through `RenderFrameInput`'s top-level
 * fields and that don't conceptually belong to "the camera's frame
 * snapshot".  Splitting the two keeps `ReadyFrameContext` lean
 * (one shape, one rationale) and lets us add a new renderer to the
 * dep bag without rewriting the frame-context derivation.
 */

import type { EngineState } from '../../../../@types';
import type { ThumbnailRenderer } from '../../../gpu/renderers/thumbnailRenderer';
import type { DiskRenderer } from '../../../gpu/renderers/diskRenderer';
import type { MilkyWayRenderer } from '../../../gpu/renderers/milkyWayRenderer';
import type { FilamentRenderer } from '../../../gpu/renderers/filamentRenderer';
import type { ScalarVolumeRenderer } from '../../../gpu/renderers/scalarVolumeRenderer';
import type { FamousMetaEntry, FamousXrefMap } from '../../../loading/fetchers/famousMetaFetcher';
import type { PointCloud } from '../../../../@types/data/PointCloud';
import type { Source } from '../../../../data/sources';
import type { ReadyFrameContext } from '../frameContext';
import type { RenderFrameSettings } from '../renderFrame';

/**
 * Per-frame dependencies that pass implementations need but which
 * don't already live on `ReadyFrameContext` or `EngineState`.  Each
 * pass file documents which fields it actually reads in its module
 * header — the bag is intentionally shared (one shape across all
 * passes) because any future pass should plumb through the same
 * site rather than introducing a parallel deps type.
 *
 * Note: `pointRenderer` is *not* here even though `pointSpritesPass`
 * draws via it.  `state.gpu.renderer` is part of the bootstrap gate
 * and rides along on `ctx.renderer` already (narrowed non-null), so
 * `pointSpritesPass.draw` reads `ctx.renderer` directly.  Same story
 * for `postProcess` and `thumbnails` — they live on `ctx`.  Putting
 * them on both `ctx` and `deps` would be redundant; we keep the
 * single canonical site.
 */
export type PassDeps = {
  /** Atlas-bound textured-billboard renderer for galaxy thumbnails. */
  thumbnailRenderer: ThumbnailRenderer;
  /** 3D-oriented procedural-disk renderer for large galaxies. */
  diskRenderer: DiskRenderer;
  /**
   * Optional cosmic-web filament-skeleton renderer.  Null when the
   * deployment doesn't ship a `filaments.bin` (or the load is in
   * flight).  `filamentsPass.enabled` returns false in that case so
   * `filamentsPass.draw` never sees a null renderer.
   */
  filamentRenderer: FilamentRenderer | null;
  /**
   * Scalar 3D volume renderer (CF-4 DM cube, MCPM, synthetic
   * fixtures, ...).  Null before GPU init completes; `scalarVolumePass`
   * optional-chains the `hasActiveFields()` call so a null handle is
   * silently a no-op — the pass returns `false` from `enabled` and
   * `draw` is never invoked.
   */
  scalarVolumeRenderer: ScalarVolumeRenderer | null;
  /** Procedural Milky Way impostor renderer. */
  milkyWayRenderer: MilkyWayRenderer;
  /**
   * Live source-cloud map.  Forwarded into `thumbnails.runFrame`
   * which iterates it back-to-front for the painter's-algorithm
   * sort.  Lives on `deps` (not `ctx`) because it isn't a derived
   * snapshot — it's a long-lived reference whose contents change
   * across frames.
   */
  clouds: Map<Source, PointCloud>;
  /** Famous-galaxy metadata — also forwarded into thumbnails. */
  famousMeta: FamousMetaEntry[];
  /** PGC/SDSS-objID → famous-galaxy index lookup. */
  famousXrefs: FamousXrefMap;
  /**
   * Animation time in seconds for the Milky Way impostor's
   * shader-clock uniform.  Already scaled by the engine's chosen
   * "slow but alive" factor (0.25× wall-clock); see `runFrame.ts`
   * for the epoch-relative calculation.
   */
  milkyWayITimeSec: number;
};

/**
 * One discrete draw operation in the per-frame HDR render flow.
 *
 * `enabled` is the gate predicate: a pure read of state + ctx +
 * settings that returns true when the pass should run this frame.
 * Tests can call it directly with stub state to assert the gate
 * logic without standing up a GPU device.
 *
 * `draw` records draw commands into the supplied HDR pass encoder.
 * Pre-condition: `enabled(...)` returned `true`.  The function MUST
 * NOT call `pass.end()` — the encoder lifetime is owned by
 * `renderFrame`, which ends the pass once the for-loop completes.
 *
 * Argument order is `(pass, ctx, state, settings, deps)` — the GPU
 * encoder first because every implementation needs it, then the
 * derived per-frame snapshot, then engine state, then settings,
 * then the catch-all renderer dep bag.
 */
export type Pass = {
  /**
   * Stable identifier for debugging and test assertions.  Kebab-
   * case by convention (matches the implicit naming in the existing
   * `renderFrame` block comments — `'point-sprites'`, `'milky-way'`,
   * etc.).
   */
  readonly name: string;
  /**
   * Whether this pass should record draw commands this frame.
   * Pure: no side effects.  Reads only from arguments.
   */
  enabled(state: EngineState, ctx: ReadyFrameContext, settings: RenderFrameSettings): boolean;
  /**
   * Issue draw calls into the open HDR render pass.  Called only
   * when `enabled` returned `true`.  Must not call `pass.end()`.
   */
  draw(
    pass: GPURenderPassEncoder,
    ctx: ReadyFrameContext,
    state: EngineState,
    settings: RenderFrameSettings,
    deps: PassDeps,
  ): void;
};
