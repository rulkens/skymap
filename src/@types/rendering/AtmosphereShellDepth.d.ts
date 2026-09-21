/**
 * AtmosphereShellDepth — what one shell draw needs of the sampled scene depth:
 * the texture, the frame that unprojects its texels (`null` only alongside the
 * far-cleared placeholder view), the viewport the fragment divides its pixel
 * by, and the scale that lands a reconstructed km distance in the shell's own
 * atmosphere-top units.
 */

import type { SampledDepthKmFrame } from './SampledDepthKmFrame';
import type { Vec2 } from '../math/Vec2';

export type AtmosphereShellDepth = {
  readonly frame: SampledDepthKmFrame | null;
  readonly view: GPUTextureView;
  readonly viewportPx: Vec2;
  /** `1 / atmosphereTopKm` for the body being drawn. */
  readonly kmToLocal: number;
};
