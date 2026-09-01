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
  /**
   * Set once by `watchSceneSaga`'s device-lost watcher (a real loss, never the
   * intentional-`destroy()` case) and never cleared — the frame driver reads it
   * to stop the rAF loop instead of drawing onto a dead device. No reload-and-
   * retry path exists; the maintainer reloads the page.
   */
  readonly deviceLost: boolean;
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
     * On demand, never per frame: true marches the packed export cube (the real
     * `packLogTraceVoxels`, same call as the `.scfd` leg) instead of the live trace
     * buffer — a structure check for a transpose/shift regression, not a brightness
     * match (packed values are log-transfer). `watchPreviewPackedSaga` packs once on
     * the false→true edge and flips this back once `sim.stepCount` moves past the
     * packed snapshot (`previewPackedAtStep`, below).
     */
    readonly previewPacked: boolean;
    /**
     * The `sim.stepCount` at the moment `previewPacked`'s pack landed, or `null`
     * while nothing is packed. Viewport's frame driver reads this as a pure
     * value (`previewPackedAtStep === sim.stepCount`) to decide whether the
     * packed cube is still fresh enough to draw; `watchPreviewPackedSaga` owns
     * every write.
     */
    readonly previewPackedAtStep: number | null;
  };
  /**
   * The volumetric path tracer's own knobs — field names match `VolpathParams`
   * (volpathPass.ts) verbatim so a slice snapshot can be passed straight to `draw()`
   * with no remapping. `trimDensity`/`sampleWeight` duplicate the raymarch layer's own
   * pair rather than sharing them: both layers must agree on the trace→density
   * transfer, but are independently tunable here.
   */
  readonly pathTracer: {
    /**
     * Emission palette — its own copy, not `raymarch.paletteId`, same reasoning
     * as the trim/sampleWeight pair above. Unlike its siblings this is a pass
     * CONSTRUCTION input (the LUT is baked into the pass's bind group), so
     * Viewport re-attaches the pass when it moves rather than writing a uniform.
     */
    readonly paletteId: ScalarFieldPaletteId;
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
    /**
     * Task FLE→CAPSLIDER: once the progressive accumulator reaches this many
     * samples, frameNeedsRender.ts stops forcing a render on its own — Monte
     * Carlo noise falls as 1/sqrt(N), and 512 samples (~23x the 1-sample noise
     * floor) reads as converged at the tool's default divisor. Deliberately
     * excluded from `volpathKeyFor` — raising it wakes the loop and RESUMES
     * accumulation, lowering it just goes clean; neither resets the count.
     */
    readonly sampleCap: number;
  };
};
