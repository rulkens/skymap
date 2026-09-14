/**
 * captureFaceAttachment — the one site that turns a capture key into a texture,
 * so a second capture row needs a table entry, not an executor branch.
 */

import type { CaptureFaceRef } from '../../../@types/engine/frame/CaptureFaceRef';
import type { RenderTargets } from '../../../@types/rendering/RenderTargets';
import { CUBEMAP_CAPTURES } from '../../../data/rendering/cubemapCaptures';

/** The colour attachment one capture face writes: the capture row owns the texture. */
export function captureFaceAttachment(
  capture: CaptureFaceRef,
  targets: RenderTargets,
): { readonly view: GPUTextureView; readonly clearValue: GPUColor } {
  const row = CUBEMAP_CAPTURES[capture.key];
  // Only a sky row's faces are layers of a render-target row; a probe's are its
  // subject's own cube, which this table cannot name.
  if (row.kind !== 'sky') {
    throw new Error(`captureFaceAttachment: '${capture.key}' owns no render-target row`);
  }
  const { target } = row;
  return {
    // One array LAYER: `viewOf` spans all six, which WebGPU rejects as a colour attachment.
    view: targets.layerViewOf(target, capture.face),
    clearValue: targets.specOf(target).clearValue,
  };
}
