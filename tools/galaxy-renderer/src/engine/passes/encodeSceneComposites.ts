/**
 * encodeSceneComposites — the reduced-resolution offscreens folded into the
 * already-open HDR scene pass, in list order, through the shared 4-tap
 * additive upsample. The CALLER filters the list: each view's gate also gates
 * the pass that filled it, and splitting the two would composite a target on a
 * frame it was never cleared — last frame's content summed into HDR.
 *
 * Several draws per frame are legal only because `AdditiveUpsample.draw` writes
 * no uniform buffer of its own, unlike `compositor.draw`.
 */
import type { AdditiveUpsample } from '../../../../../src/@types/rendering/AdditiveUpsample';

export function encodeSceneComposites(
  pass: GPURenderPassEncoder,
  aggregateUpsample: AdditiveUpsample,
  views: readonly GPUTextureView[],
): void {
  for (const view of views) aggregateUpsample.draw(pass, view);
}
