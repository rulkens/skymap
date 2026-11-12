/**
 * AsteroidPointFrame — what `asteroidPointRenderer.draw` needs per view. `vp` takes eye-relative Mpc
 * in near-plane clip units (`near0OverlayClipScale`); `sunFromCamAu` and `selectedCamRelAu` are
 * composed in f64 by the pass.
 */
import type { AsteroidClass } from '../../../../@types/asteroids/AsteroidClass';
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { SampledDepthBinding } from '../../../../@types/rendering/SampledDepthBinding';

export type AsteroidPointFrame = {
  readonly vp: Float32Array;
  readonly viewportPx: readonly [number, number];
  readonly pxPerRad: number;
  readonly sunFromCamAu: Readonly<Vec3>;
  /** `asteroidExposureRamp` × the Layer's brightness. */
  readonly exposure: number;
  readonly windowFade: number;
  readonly classFade: Readonly<Record<AsteroidClass, number>>;
  /** Catalog row drawn at `selectedCamRelAu`; `SELECTION_NONE_SENTINEL` for none. */
  readonly selectedRow: number;
  readonly selectedCamRelAu: Readonly<Vec3>;
  readonly occluders: { readonly count: number; readonly spheresKm: Float32Array };
  readonly depth: SampledDepthBinding;
};
