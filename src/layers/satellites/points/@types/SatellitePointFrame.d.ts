/**
 * SatellitePointFrame — what `satellitePointRenderer.draw` needs per view. `vp` is eye-rebased
 * in near-plane clip units (`near0OverlayClipScale`); `earthKm` and `temeToWorld` are composed
 * in f64 by the pass.
 */
import type { Mat3 } from '../../../../@types/math/Mat3';
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { SampledDepthBinding } from '../../../../@types/rendering/SampledDepthBinding';

export type SatellitePointFrame = {
  readonly vp: Float32Array;
  readonly viewportPx: readonly [number, number];
  readonly pxPerRad: number;
  readonly simMs: number;
  readonly earthKm: Readonly<Vec3>;
  readonly temeToWorld: Readonly<Mat3>;
  readonly sunDir: Readonly<Vec3>;
  readonly ambient: number;
  readonly dotRadiusPx: number;
  readonly opacity: number;
  readonly classOpacity: readonly [number, number, number];
  readonly occluders: { readonly count: number; readonly spheresKm: Float32Array };
  readonly depth: SampledDepthBinding;
};
