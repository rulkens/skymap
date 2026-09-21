/**
 * OrbitTrailDrawArgs — everything one `orbitTrailRenderer.draw` call needs.
 */

import type { SampledDepthBinding } from '../SampledDepthBinding';

export type OrbitTrailDrawArgs = {
  /** Packed 46-float record per orbit; `count` must not exceed `instances.length / 46`. */
  readonly instances: Float32Array;
  readonly count: number;
  readonly occluders: { readonly count: number; readonly spheresKm: Float32Array };
  readonly depth: SampledDepthBinding;
  /** The `debug.overlays['orbit-trail-impostor']` lens; default false. */
  readonly showImpostor?: boolean;
};
