import type { ScalarFieldPaletteId } from '../../../src/@types/data/volume/ScalarFieldPaletteId';
import type { Vec3 } from '../../../src/@types/math/Vec3';

/**
 * ViewSlice — the render layers plus the tool-local orbit camera (T10's trace
 * pass consumes camera + raymarch params via its own narrow options type, not
 * this one directly — Viewport maps between the two). Spec §7's remaining
 * views (path tracer, preview export) will each add their OWN layer flag and
 * panel section here; their knobs are that track's own addition, not stubbed
 * now, same reasoning as the deferred `histogram` slice.
 */
export type ViewSlice = {
  /**
   * Independent layers, NOT a mode picker: any subset may be on, including
   * none. Viewport composites them additively over a cleared target in
   * declaration order — raymarch, agents, galaxies.
   */
  readonly layers: {
    readonly raymarch: boolean;
    readonly agents: boolean;
    readonly galaxies: boolean;
  };
  readonly galaxies: {
    readonly intensity: number;
    /** Screen-space dot radius; galaxyPoints.wesl's `radiusPx`. */
    readonly pointSizePx: number;
  };
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
};
