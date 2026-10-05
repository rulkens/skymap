/**
 * MissionTrailDrawArgs — everything one `missionTrailRenderer.draw` call needs.
 * `vp` is the camera-rebased view-projection in clip metres and `camPosMpc` the
 * eye it was rebased about, in f64; the renderer splits the eye into hi/lo.
 */

import type { Vec3 } from '../../math/Vec3';
import type { SampledDepthBinding } from '../SampledDepthBinding';
import type { MissionTrailDraw } from './MissionTrailDraw';

export type MissionTrailDrawArgs = {
  readonly trails: readonly MissionTrailDraw[];
  readonly vp: Float32Array;
  readonly camPosMpc: Readonly<Vec3>;
  readonly viewportPx: readonly [number, number];
  readonly pxPerRad: number;
  readonly occluders: { readonly count: number; readonly spheresKm: Float32Array };
  readonly depth: SampledDepthBinding;
};
