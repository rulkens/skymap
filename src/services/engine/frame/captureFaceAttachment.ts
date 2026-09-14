/**
 * captureFaceAttachment — the one site that turns a capture key into the views
 * its face writes, so a new capture kind is an arm here, not an executor
 * branch. A sky face is one layer of a render-target row; a probe face is mip
 * 0 of its subject body's own cube, paired with that probe's depth.
 */

import type { CaptureFaceAttachment } from '../../../@types/engine/frame/CaptureFaceAttachment';
import type { CaptureFaceRef } from '../../../@types/engine/frame/CaptureFaceRef';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import { CUBEMAP_CAPTURES } from '../../../data/rendering/cubemapCaptures';

export function captureFaceAttachment(
  capture: CaptureFaceRef,
  ctx: ReadyFrameContext,
  state: EngineState,
): CaptureFaceAttachment {
  const row = CUBEMAP_CAPTURES[capture.key];
  if (row.kind === 'sky') {
    return {
      // One array LAYER: `viewOf` spans all six, which WebGPU rejects as a colour attachment.
      view: ctx.renderTargets.layerViewOf(row.target, capture.face),
      clearValue: ctx.renderTargets.specOf(row.target).clearValue,
      depthView: null,
    };
  }
  // The scheduler picked a resident body for this frame's probe faces, so a
  // missing probe here is a wiring bug, not a frame to skip.
  const subject = state.cubemapCaptures.probe.subject;
  const probe = subject === null ? null : state.gpu.meshBodyRenderer?.probeOf(subject);
  if (!probe) {
    throw new Error(`captureFaceAttachment: no probe for subject '${subject}'`);
  }
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
