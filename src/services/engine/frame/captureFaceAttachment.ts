/**
 * captureFaceAttachment — the one site that turns a capture key into the views
 * its face writes, so a new capture kind is an arm here, not an executor
 * branch. A sky face is one layer of a render-target row; a probe face is mip
 * 0 of its subject body's own cube, paired with that probe's depth.
 */

import type { CaptureFaceRef } from '../../../@types/engine/frame/CaptureFaceRef';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import { APP_CUBEMAP_CAPTURE_REGISTRY } from '../../../compositions/appCubemapCaptures';
import { subjectProbe } from './subjectProbe';
import { clearValueOf } from '../../../utils/gpu/clearValueOf';

export function captureFaceAttachment(
  capture: CaptureFaceRef,
  ctx: FrameView,
  state: EngineState,
): {
  readonly view: GPUTextureView;
  readonly clearValue: GPUColor;
  /** Null for a row that draws no body; attached only on the face's body-slab steps. */
  readonly depthView: GPUTextureView | null;
} {
  const row = APP_CUBEMAP_CAPTURE_REGISTRY[capture.key];
  if (row.kind === 'sky') {
    return {
      // One array LAYER: `viewOf` spans all six, which WebGPU rejects as a colour attachment.
      view: ctx.snapshot.renderTargets.layerViewOf(row.target, capture.face),
      clearValue: clearValueOf(ctx.snapshot.renderTargets.specOf(row.target), state),
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
