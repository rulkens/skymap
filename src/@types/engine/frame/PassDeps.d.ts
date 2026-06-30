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
import type { VolumeFieldRenderer } from '../../rendering/VolumeFieldRenderer';
import type { FlowFieldRenderer } from '../../rendering/FlowFieldRenderer';

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
  volumeFieldRenderer: VolumeFieldRenderer | null;
  /**
   * CF4++ flow-field renderer. Null before GPU init completes; `flowFieldPass`
   * null-checks this handle in `draw`, and its `enabled` gate already requires
   * `settings.flow.enabled` + `slotReady(assetSlots.flow)`, so a null state is a
   * no-op.
   */
  flowFieldRenderer: FlowFieldRenderer | null;
  /** Procedural Milky Way impostor renderer. */
  milkyWayRenderer: MilkyWayRenderer;
  /** Observable-universe horizon shell renderer. */
  horizonShellRenderer: HorizonShellRenderer;
};
