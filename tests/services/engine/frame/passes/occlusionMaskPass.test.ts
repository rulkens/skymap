import { describe, expect, it, vi } from 'vitest';
import type { FrameView } from '../../../../../src/@types/engine/frame/FrameView';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import { makeSlab } from '../../../../fixtures/makeSlab';
import { occlusionMaskPass } from '../../../../../src/services/engine/frame/passes/occlusionMaskPass';

const COLOR_VIEW = {} as GPUTextureView;
const FAR_DEPTH_VIEW = {} as GPUTextureView;
const DEPTH_VIEW = {} as GPUTextureView;

// Another view of the frame has already drawn `foreground:0`: the frame-wide set says so
// for every view, which is the case the pass must not take as its own.
const ctx = {
  canvasSize: { width: 1280, height: 720 },
  bodyPose: () => null,
  snapshot: {
    renderedTargets: new Set(['hdr', 'foreground:0']),
    renderTargets: { viewOf: () => COLOR_VIEW, farDepthView: () => FAR_DEPTH_VIEW },
  },
} as unknown as FrameView;

const sampling = (row: Slab | null): SlabView =>
  ({ sampledDepth: { view: DEPTH_VIEW, row } }) as unknown as SlabView;

describe('occlusionMaskPass', () => {
  it('stays on but draws nothing for a view that drew no foreground:0, so the clear stands', () => {
    const renderer = { draw: vi.fn() };
    const state = { gpu: { occlusionMaskRenderer: renderer } } as unknown as EngineState;
    const untouched = sampling(null);
    // On, or `executeFrame` opens no pass and the layer keeps last frame's mask.
    expect(occlusionMaskPass.enabled(state, ctx, untouched)).toBe(true);
    occlusionMaskPass.draw({} as GPURenderPassEncoder, untouched, ctx, state);
    expect(renderer.draw).not.toHaveBeenCalled();
  });

  it('draws the joint of a view whose own foreground row cleared the sampled depth', () => {
    const renderer = { draw: vi.fn() };
    const state = { gpu: { occlusionMaskRenderer: renderer } } as unknown as EngineState;
    const pass = {} as GPURenderPassEncoder;
    // A world-frame row has no km frame (`sampledDepthKmFrame`), so the joint carries the
    // far placeholder; what matters here is that the draw happens at this view's size.
    occlusionMaskPass.draw(pass, sampling(makeSlab()), ctx, state);
    expect(renderer.draw).toHaveBeenCalledTimes(1);
    expect(renderer.draw.mock.calls[0]![0]).toBe(pass);
    expect(renderer.draw.mock.calls[0]![1].colorView).toBe(COLOR_VIEW);
    expect(renderer.draw.mock.calls[0]![2]).toEqual([1280, 720]);
  });
});
