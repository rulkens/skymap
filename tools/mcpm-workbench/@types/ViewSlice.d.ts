import type { ScalarFieldPaletteId } from '../../../src/@types/data/volume/ScalarFieldPaletteId';

/**
 * ViewSlice — the render mode plus the tool-local orbit camera (T10's trace
 * pass consumes camera + raymarch params via its own narrow options type,
 * not this one directly — Viewport maps between the two). Only
 * `traceRaymarch` renders today; `agentSplat`/`pathTracer`/`previewExport`
 * are spec §7's other three views, landing in Track V. Path-tracer knobs
 * are that track's own addition — not stubbed here, same reasoning as the
 * deferred `histogram` slice.
 */
export type ViewSlice = {
  readonly mode: 'traceRaymarch' | 'agentSplat' | 'pathTracer' | 'previewExport';
  readonly camera: {
    readonly yaw: number;
    readonly pitch: number;
    readonly distance: number;
    readonly autoRotate: boolean;
  };
  readonly raymarch: {
    readonly opticalThickness: number;
    readonly paletteId: ScalarFieldPaletteId;
  };
};
