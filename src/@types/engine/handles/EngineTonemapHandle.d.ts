import type { ToneMapCurve } from '../../../data/toneMapCurve';

/**
 * EngineTonemapHandle — HDR tone-mapping pass controls.
 *
 * Two knobs: the exposure multiplier applied before the curve, and the
 * curve itself (linear / Reinhard / asinh / gamma2 / ACES).  Both flow
 * into the post-process pass's per-frame uniform; the cluster exists so
 * future curve-shape parameters (e.g. ACES knee/toe) have an obvious home.
 */
export type EngineTonemapHandle = {
  /** Set the tone-map exposure multiplier (clamped to [0.05, 16]). */
  setExposure: (value: number) => void;
  /** Switch the HDR tone-mapping curve at runtime (no pipeline rebuild). */
  setCurve: (curve: ToneMapCurve) => void;
};
