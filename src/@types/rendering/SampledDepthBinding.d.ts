/**
 * SampledDepthBinding — the pair every sampled-depth consumer binds. The
 * null-frame/placeholder rule is enforced by `sampledDepthBinding`, nowhere
 * else.
 */

import type { SampledDepthKmFrame } from './SampledDepthKmFrame';

export type SampledDepthBinding = {
  /** Null ⇒ `view` is the far-cleared placeholder and the shader's FAR_DEPTH arm rules. */
  readonly frame: SampledDepthKmFrame | null;
  readonly view: GPUTextureView;
};
