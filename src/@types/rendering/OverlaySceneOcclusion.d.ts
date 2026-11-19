/**
 * OverlaySceneOcclusion — what a swap-target overlay is occluded by, as ONE value its
 * renderer picks a pipeline from: the sampled-depth joint read in the scene's own image,
 * or a mask already carried to the output image. Handed nothing, an overlay draws plain.
 */

import type { MaskSceneOcclusion } from './MaskSceneOcclusion';
import type { SampledDepthSceneOcclusion } from './SampledDepthSceneOcclusion';

export type OverlaySceneOcclusion = SampledDepthSceneOcclusion | MaskSceneOcclusion;
