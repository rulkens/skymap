import type { ScalarFieldPaletteId } from '../../../src/@types/data/volume/ScalarFieldPaletteId';
import type { Vec3 } from '../../../src/@types/math/Vec3';

/**
 * ViewSlice — the render layers plus the tool-local orbit camera (T10's trace
 * pass consumes camera + raymarch params via its own narrow options type, not
 * this one directly — Viewport maps between the two). Spec §7's last view
 * (preview export, T18) is `raymarch.previewPacked` below, not a fifth
 * `layers` entry: it swaps the raymarch layer's own data source rather than
 * adding an independent draw, so its ControlsPanel control lives in the
 * Raymarch section — see Viewport for the pack-once/go-stale mechanics.
 */
export type ViewSlice = {
  /**
   * Independent layers, NOT a mode picker: any subset may be on, including
   * none. Viewport composites them additively over a cleared target in
   * declaration order — raymarch, agents, galaxies, pathTracer.
   */
  readonly layers: {
    readonly raymarch: boolean;
    readonly agents: boolean;
    readonly galaxies: boolean;
    /** Off by default: worst case is bounces×512 tracking steps per pixel. */
    readonly pathTracer: boolean;
  };
  readonly galaxies: {
    readonly intensity: number;
    /** Screen-space dot radius; galaxyPoints.wesl's `radiusPx`. */
    readonly pointSizePx: number;
  };
  readonly agents: {
    /** Brightness multiplier on the resolved splat, splatBlit.wesl's `intensity`. */
    readonly intensity: number;
    /** Per-agent footprint side in pixels, splatTransform.wesl's `pointSizePx`. */
    readonly pointSizePx: number;
  };
  /** Viewport's rAF-loop EMA, throttled to the store at most every 500ms; 0 = not measured yet. */
  readonly fps: number;
  readonly camera: {
    readonly yaw: number;
    readonly pitch: number;
    readonly distance: number;
    readonly autoRotate: boolean;
    /**
     * Orbit target in absolute world Mpc — deliberately NOT box-relative, so
     * dragging the grid-box centre sliders doesn't drag the camera with it.
     * Right/middle-drag pan writes here directly.
     */
    readonly targetMpc: Vec3;
  };
  readonly raymarch: {
    readonly opticalThickness: number;
    readonly paletteId: ScalarFieldPaletteId;
    readonly trimDensity: number;
    readonly sampleWeight: number;
    readonly stepVoxels: number;
    /**
     * Composite the march as pure emission instead of the fork's front-to-back
     * 'over'. Fork parity is `false`; the workbench defaults it on because the
     * per-slab alpha goes opaque a few voxels in and buries the interior.
     */
    readonly additive: boolean;
    /**
     * Integer 1-8, default 3 (main-app volume-row parity — renderTargets.ts's
     * `scale: 3`, which this reproduces). 1 is the exact original behaviour
     * (no offscreen target); >1 marches into a `floor(size/divisor)` offscreen
     * target instead and bilinear-upsamples it in. Fragment cost falls with
     * the square of the divisor.
     */
    readonly divisor: number;
    /**
     * On demand, never per frame: true means the raymarch layer marches the
     * PACKED export cube (the real `packLogTraceVoxels`, same call as the
     * `.scfd` leg) instead of the live trace buffer — a structure check for a
     * transpose/shift regression, not a brightness match (packed values are
     * log-transfer). Viewport packs once on the false→true edge and flips
     * this back to `false` itself once `sim.stepCount` moves past the
     * snapshot it packed, rather than repacking automatically.
     */
    readonly previewPacked: boolean;
  };
  /**
   * The volumetric path tracer's own knobs — field names match `VolpathParams`
   * (volpathPass.ts) verbatim so a slice snapshot can be passed straight to
   * `draw()` with no remapping. `trimDensity`/`sampleWeight` duplicate the
   * raymarch layer's own pair rather than sharing them (both layers must
   * agree on Polyphorm's trace→density transfer, but are independently
   * tunable here) — keep the spelling identical to the raymarch layer's so a
   * future "same transfer for both layers" toggle stays possible.
   */
  readonly pathTracer: {
    readonly sigmaT: number;
    readonly albedo: number;
    readonly sigmaE: number;
    /** Henyey-Greenstein mean cosine, UNSIGNED 0..0.99 — see volpathPass.ts's MAX_ANISOTROPY. */
    readonly anisotropy: number;
    readonly ambientTrace: number;
    readonly bounces: number;
    readonly traceMax: number;
    readonly exposure: number;
    readonly compressive: boolean;
    readonly trimDensity: number;
    readonly sampleWeight: number;
    /**
     * Integer 1-4, default 2 — sibling to `raymarch.divisor`: the accumulator
     * sizes to `floor(size/divisor)` and the resolve bilinear-upsamples it in.
     * The EFFECTIVE divisor drawn each frame also boosts to 4 while the camera
     * moves (Viewport.tsx, effectiveVolpathDivisor.ts) — this field is always
     * the user's own setting, never the boosted value.
     */
    readonly divisor: number;
  };
};
