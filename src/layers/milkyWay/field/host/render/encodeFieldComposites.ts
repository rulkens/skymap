/**
 * encodeFieldComposites — the field's reduced-resolution targets folded into
 * an already-open HDR pass, one additive upsample per `plan.composites` entry,
 * in order. The plan is the same value that gated the encode, so a target the
 * frame never cleared (last frame's content) is never summed into HDR.
 *
 * Several draws per frame are legal only because `AdditiveUpsample.draw` writes
 * no uniform buffer of its own, unlike `compositor.draw`.
 */
import type { AdditiveUpsample } from '../../../../../@types/rendering/AdditiveUpsample';
import type { FieldFramePlan } from '../../@types/FieldFramePlan';
import type { GalaxyFieldRenderTargets } from '../../@types/GalaxyFieldRenderTargets';

export function encodeFieldComposites(
  pass: GPURenderPassEncoder,
  upsample: AdditiveUpsample,
  plan: FieldFramePlan,
  targets: GalaxyFieldRenderTargets,
): void {
  for (const id of plan.composites) upsample.draw(pass, targets[id].view);
}
