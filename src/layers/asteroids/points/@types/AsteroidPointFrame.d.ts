/**
 * AsteroidPointFrame — what `asteroidPointRenderer.draw` needs per view. `vp` takes eye-relative Mpc
 * in near-plane clip units (`near0OverlayClipScale`); `sunFromCamAu` and `selectedCamRelAu` are
 * composed in f64 by the pass.
 */
import type { AsteroidClass } from '../../../../@types/asteroids/AsteroidClass';
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { AsteroidClassLook } from '../../@types/AsteroidClassLook';
import type { SampledDepthBinding } from '../../../../@types/rendering/SampledDepthBinding';

export type AsteroidPointFrame = {
  readonly vp: Float32Array;
  readonly viewportPx: readonly [number, number];
  readonly pxPerRad: number;
  readonly sunFromCamAu: Readonly<Vec3>;
  readonly windowFade: number;
  readonly classFade: Readonly<Record<AsteroidClass, number>>;
  /** Catalog row drawn at `selectedCamRelAu`; `SELECTION_NONE_SENTINEL` for none. */
  readonly selectedRow: number;
  readonly selectedCamRelAu: Readonly<Vec3>;
  /** Each class's tint and dot shape (`ASTEROID_CLASS_LOOK`, as tuned). */
  readonly classLook: Readonly<
    Record<
      AsteroidClass,
      Pick<AsteroidClassLook, 'color' | 'dotRadiusPx' | 'dotKnee' | 'sizeKneeH' | 'sizeMaxScale'>
    >
  >;
  /** False draws every dot at its class's `dotRadiusPx` (size by H off). */
  readonly sizeByH: boolean;
  /** The main belt's tint per Kirkwood band, inner to outer (`asteroidBeltColors`). */
  readonly beltColors: readonly [Vec3, Vec3, Vec3];
  /** Tint lift on the dots the brightness budget keeps (`ASTEROID_THINNING.thinGainExponent`). */
  readonly thinGain: number;
  readonly occluders: { readonly count: number; readonly spheresKm: Float32Array };
  readonly depth: SampledDepthBinding;
};
