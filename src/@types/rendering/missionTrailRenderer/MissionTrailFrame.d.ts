/**
 * MissionTrailFrame — what `missionTrailRenderer.beginFrame` needs once per view:
 * `vp` is the camera-rebased view-projection in clip metres and `camPosMpc` the
 * eye it was rebased about, in f64; the renderer splits the eye into hi/lo.
 */

import type { Vec3 } from '../../math/Vec3';
import type { SampledDepthBinding } from '../SampledDepthBinding';

export type MissionTrailFrame = {
  readonly vp: Float32Array;
  readonly camPosMpc: Readonly<Vec3>;
  readonly viewportPx: readonly [number, number];
  readonly pxPerRad: number;
  readonly occluders: { readonly count: number; readonly spheresKm: Float32Array };
  readonly depth: SampledDepthBinding;
};
