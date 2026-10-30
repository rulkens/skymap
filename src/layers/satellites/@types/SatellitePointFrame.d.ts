/**
 * SatellitePointFrame — what `satellitePointRenderer.draw` needs per view. `vp` is the
 * eye-rebased view-projection in near-plane clip units (`near0OverlayClipScale`); `earthKm` is Earth's centre minus the eye in world
 * km, and `temeToWorld` the rotation of the current instant, both composed in f64 by the pass.
 */
import type { Mat3 } from '../../../@types/math/Mat3';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { SampledDepthBinding } from '../../../@types/rendering/SampledDepthBinding';

export type SatellitePointFrame = {
  readonly vp: Float32Array;
  readonly viewportPx: readonly [number, number];
  readonly pxPerRad: number;
  /** Sim instant being drawn, Unix ms; the vertex stage extrapolates the sweep to it. */
  readonly simMs: number;
  readonly earthKm: Readonly<Vec3>;
  readonly temeToWorld: Readonly<Mat3>;
  /** Distance and data-window fade, times the show toggle's master value. */
  readonly opacity: number;
  /** Each class's own toggle fade, in `SATELLITE_CLASSES` order. */
  readonly classOpacity: readonly [number, number, number];
  readonly occluders: { readonly count: number; readonly spheresKm: Float32Array };
  readonly depth: SampledDepthBinding;
};
