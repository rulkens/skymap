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

import type { TexturedDiskRenderer } from '../../rendering/TexturedDiskRenderer';
import type { ProceduralDiskRenderer } from '../../rendering/ProceduralDiskRenderer';
import type { MilkyWayRenderer } from '../../rendering/MilkyWayRenderer';
import type { HorizonShellRenderer } from '../../rendering/HorizonShellRenderer';
import type { FilamentRenderer } from '../../rendering/FilamentRenderer';
import type { ScalarVolumeRenderer } from '../../rendering/ScalarVolumeRenderer';
import type { FamousMetaEntry } from '../../loading/FamousMetaEntry';
import type { GalaxyCatalog } from '../../data/GalaxyCatalog';
import type { SourceType } from '../../data/SourceType';

export type PassDeps = {
  /** Atlas-bound 3D-oriented disk renderer for large galaxy thumbnails. */
  texturedDiskRenderer: TexturedDiskRenderer;
  /**
   * Procedural-disk renderer for the LOD-1 pass.  Reads its instance
   * array from `state.subsystems.proceduralDisks.lastOutput` rather
   * than from a `runFrame` invocation inside the pass — the subsystem
   * runs its planner step before the HDR_PASSES loop opens.
   */
  proceduralDiskRenderer: ProceduralDiskRenderer;
  /**
   * Optional cosmic-web filament-skeleton renderer.  Null when the
   * deployment doesn't ship a `filaments.bin` (or the load is in
   * flight).  `filamentsPass.enabled` returns false in that case so
   * `filamentsPass.draw` never sees a null renderer.
   */
  filamentRenderer: FilamentRenderer | null;
  /**
   * Scalar 3D volume renderer (CF-4 DM cube, MCPM, synthetic
   * fixtures, ...).  Null before GPU init completes; `encodeVolumes`
   * (the pre-HDR half-res raymarch step) and `volumeUpsamplePass.enabled`
   * both null-check this handle so a null state is silently a no-op
   * (no render pass opened, no draw invoked).
   */
  scalarVolumeRenderer: ScalarVolumeRenderer | null;
  /** Procedural Milky Way impostor renderer. */
  milkyWayRenderer: MilkyWayRenderer;
  /** Observable-universe horizon shell renderer. */
  horizonShellRenderer: HorizonShellRenderer;
  /**
   * Live source-catalog map.  Forwarded into `thumbnails.runFrame`
   * which iterates it back-to-front for the painter's-algorithm
   * sort.  Lives on `deps` (not `ctx`) because it isn't a derived
   * snapshot — it's a long-lived reference whose contents change
   * across frames.
   */
  catalogs: ReadonlyMap<SourceType, GalaxyCatalog>;
  /** Famous-galaxy metadata — also forwarded into thumbnails. */
  famousMeta: FamousMetaEntry[];
  /**
   * Animation time in seconds for the Milky Way impostor's
   * shader-clock uniform.  Already scaled by the engine's chosen
   * "slow but alive" factor (0.25× wall-clock); see `runFrame.ts`
   * for the epoch-relative calculation.
   */
  milkyWayITimeSec: number;
};
