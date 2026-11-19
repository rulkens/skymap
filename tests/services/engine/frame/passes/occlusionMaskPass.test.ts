import { describe, expect, it, vi } from 'vitest';
import type { FrameView } from '../../../../../src/@types/engine/frame/FrameView';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import { occlusionMaskPass } from '../../../../../src/services/engine/frame/passes/occlusionMaskPass';

const COLOR_VIEW = {} as GPUTextureView;
const FAR_DEPTH_VIEW = {} as GPUTextureView;
const VIEW = {} as SlabView;

const ctxWith = (renderedTargets: ReadonlySet<string>): FrameView =>
  ({
    canvasSize: { width: 1280, height: 720 },
    bodyPose: () => null,
    snapshot: {
      renderedTargets,
      renderTargets: { viewOf: () => COLOR_VIEW, farDepthView: () => FAR_DEPTH_VIEW },
    },
  }) as unknown as FrameView;

describe('occlusionMaskPass', () => {
  it('the mask pass is off until foreground:0 has been drawn this frame', () => {
    const renderer = { draw: vi.fn() };
    const state = { gpu: { occlusionMaskRenderer: renderer } } as unknown as EngineState;
    expect(occlusionMaskPass.enabled(state, ctxWith(new Set(['hdr'])), VIEW)).toBe(false);

    const drawn = ctxWith(new Set(['hdr', 'foreground:0']));
    expect(occlusionMaskPass.enabled(state, drawn, VIEW)).toBe(true);
    const pass = {} as GPURenderPassEncoder;
    occlusionMaskPass.draw(pass, VIEW, drawn, state);
    // No sampled depth on the step: the joint carries the far placeholder and no frame.
    expect(renderer.draw).toHaveBeenCalledWith(
      pass,
      { colorView: COLOR_VIEW, depthView: FAR_DEPTH_VIEW, frame: null },
      [1280, 720],
    );
  });
});
