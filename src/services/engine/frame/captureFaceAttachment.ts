/**
 * captureFaceAttachment — the one site that turns a capture key into the views
 * its face writes, so a new capture kind is an arm here, not an executor
 * branch. A sky face is one layer of a render-target row; a probe face is mip
 * 0 of its subject body's own cube, paired with that probe's depth.
 */

import type { CaptureFaceRef } from '../../../@types/engine/frame/CaptureFaceRef';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import { CUBEMAP_CAPTURES } from '../../../data/rendering/cubemapCaptures';
import { subjectProbe } from './subjectProbe';

export function captureFaceAttachment(
  capture: CaptureFaceRef,
  ctx: ReadyFrameContext,
  state: EngineState,
): {
  readonly view: GPUTextureView;
  readonly clearValue: GPUColor;
  /** Null for a row that draws no body; attached only on the face's body-slab steps. */
  readonly depthView: GPUTextureView | null;
} {
  const row = CUBEMAP_CAPTURES[capture.key];
  if (row.kind === 'sky') {
    return {
      // One array LAYER: `viewOf` spans all six, which WebGPU rejects as a colour attachment.
      view: ctx.renderTargets.layerViewOf(row.target, capture.face),
      clearValue: ctx.renderTargets.specOf(row.target).clearValue,
      depthView: null,
    };
  }
  const probe = subjectProbe(state);
  return {
    view: probe.cube.createView({
      dimension: '2d',
      baseMipLevel: 0,
      mipLevelCount: 1,
      baseArrayLayer: capture.face,
      arrayLayerCount: 1,
    }),
    clearValue: { r: 0, g: 0, b: 0, a: 0 },
    depthView: probe.depth.createView(),
  };
}
