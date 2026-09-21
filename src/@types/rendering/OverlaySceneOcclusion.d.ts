/**
 * OverlaySceneOcclusion — everything the shared group(1) occlusion joint binds,
 * as ONE value: a coverage colour view, the sampled scene depth, and the frame
 * that turns a depth texel into km. All three or none — an overlay renderer
 * handed this draws through its occlusion pipeline, handed nothing through its
 * plain one, and no pipeline can ever reach a half-filled joint.
 */

import type { SampledDepthKmFrame } from './SampledDepthKmFrame';

export type OverlaySceneOcclusion = {
  /** `foreground:0`'s colour — its ALPHA is the coverage `sceneTransmittance` reads. */
  readonly colorView: GPUTextureView;
  /** The sampled depth, or the far-cleared placeholder when `frame` is null. */
  readonly depthView: GPUTextureView;
  /** Null ⇒ `depthView` is the placeholder and the shader's FAR_DEPTH arm rules. */
  readonly frame: SampledDepthKmFrame | null;
};
