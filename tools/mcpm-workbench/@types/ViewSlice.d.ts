import type { ScalarFieldPaletteId } from '../../../src/@types/data/volume/ScalarFieldPaletteId';
import type { Vec3 } from '../../../src/@types/math/Vec3';

/**
 * ViewSlice — the render mode plus the tool-local orbit camera (T10's trace
 * pass consumes camera + raymarch params via its own narrow options type,
 * not this one directly — Viewport maps between the two). `traceRaymarch`
 * and `agentSplat` render today; `pathTracer`/`previewExport` are spec §7's
 * remaining two views and Viewport falls back to the raymarch for them.
 * Path-tracer knobs are that track's own addition — not stubbed here, same
 * reasoning as the deferred `histogram` slice.
 */
export type ViewSlice = {
  readonly mode: 'traceRaymarch' | 'agentSplat' | 'pathTracer' | 'previewExport';
  /**
   * Dot the catalog points over the raymarch. A no-op in `agentSplat`, which
   * already draws them (10000x weighted) as part of the swarm.
   */
  readonly overlayGalaxies: boolean;
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
