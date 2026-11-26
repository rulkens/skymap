/**
 * overlaySceneOcclusion — which occlusion a step's overlays bind, read off the step alone.
 * The case that matters is the mask step: on the dome `foreground:0` holds the last face
 * only, so a mask step must never fall back to it, whatever the frame has drawn.
 */
import { describe, expect, it, vi } from 'vitest';

import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { SlabView } from '../../../../src/@types/engine/frame/SlabView';
import { overlaySceneOcclusion } from '../../../../src/services/engine/frame/overlaySceneOcclusion';

const FOREGROUND_VIEW = { id: 'foreground:0' } as unknown as GPUTextureView;
const FAR_DEPTH_VIEW = { id: 'far' } as unknown as GPUTextureView;
const MASK_VIEW = { id: 'mask' } as unknown as GPUTextureView;

function makeCtx(rendered: readonly string[]) {
  const viewOf = vi.fn(() => FOREGROUND_VIEW);
  const ctx = {
    bodyPose: () => null,
    snapshot: {
      renderedTargets: new Set(rendered),
      renderTargets: { viewOf, farDepthView: () => FAR_DEPTH_VIEW },
    },
  } as unknown as FrameView;
  return { ctx, viewOf };
}

describe('overlaySceneOcclusion', () => {
  it('a step that samples depth gets the sampled-depth joint once foreground:0 is drawn', () => {
    const view = { sampledDepth: { view: {}, row: null } } as unknown as SlabView;
    expect(overlaySceneOcclusion(makeCtx([]).ctx, view)).toBeUndefined();
    expect(overlaySceneOcclusion(makeCtx(['foreground:0']).ctx, view)).toEqual({
      kind: 'sampled-depth',
      colorView: FOREGROUND_VIEW,
      depthView: FAR_DEPTH_VIEW,
      frame: null,
    });
  });

  it('a step that samples a mask gets the mask, and never reads foreground:0', () => {
    const { ctx, viewOf } = makeCtx(['foreground:0']);
    const view = { sampledMask: { view: MASK_VIEW } } as unknown as SlabView;
    expect(overlaySceneOcclusion(ctx, view)).toEqual({ kind: 'mask', maskView: MASK_VIEW });
    expect(viewOf).not.toHaveBeenCalled();
  });

  it('a mask step whose mask was not written this frame gets nothing, not foreground:0', () => {
    const { ctx, viewOf } = makeCtx(['foreground:0']);
    const view = { sampledMask: { view: null } } as unknown as SlabView;
    expect(overlaySceneOcclusion(ctx, view)).toBeUndefined();
    expect(viewOf).not.toHaveBeenCalled();
  });
});
