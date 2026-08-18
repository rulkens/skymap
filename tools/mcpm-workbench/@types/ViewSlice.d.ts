import type { ScalarFieldPaletteId } from '../../../src/@types/data/volume/ScalarFieldPaletteId';
import type { Vec3 } from '../../../src/@types/math/Vec3';

/**
 * ViewSlice — the render layers plus the tool-local orbit camera (T10's trace
 * pass consumes camera + raymarch params via its own narrow options type, not
 * this one directly — Viewport maps between the two). Spec §7's remaining
 * view (preview export) will add its own layer flag and panel section here;
 * its knobs are that track's own addition, not stubbed now, same reasoning
 * as the deferred `histogram` slice.
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
  /** Viewport's rAF-loop EMA, throttled to the store at most every 500ms; 0 = not measured yet. */
  readonly fps: number;
  readonly camera: {
    readonly yaw: number;
    readonly pitch: number;
    readonly distance: number;
    readonly autoRotate: boolean;
    /** Right/middle-drag pan, as an offset from the grid-box centre the orbit target defaults to. */
    readonly targetOffsetMpc: Vec3;
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
  };
};
