import { describe, expect, it, vi } from 'vitest';

import { stellarStreamsPass } from '../../../../../src/layers/stellarStreams/streaks/passes/stellarStreamsPass';
import { initialState } from '../../../../../src/layers/stellarStreams/state/stellarStreams/initialState';
import type { StellarStreamsRuntime } from '../../../../../src/layers/stellarStreams/@types/StellarStreamsRuntime';
import type { PassState } from '../../../../../src/@types/engine/frame/PassState';
import type { FrameView } from '../../../../../src/@types/engine/frame/FrameView';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';

const STATE = { settings: { stellarStreams: initialState } } as unknown as PassState;
const CTX = { drawPxPerRad: 1000, snapshot: { nowMs: 0 } } as unknown as FrameView;
const VIEW = {
  slab: { vp: new Float64Array(16) },
  camPos: [0, 0, 0],
  viewportPx: [8, 8],
} as unknown as SlabView;

function runtimeOf() {
  const renderer = { hasData: () => true, draw: vi.fn(), drawPick: vi.fn() };
  return { runtime: { renderer } as unknown as StellarStreamsRuntime, renderer };
}

describe('stellarStreamsPass picking', () => {
  it('drawPick draws the streak look only', () => {
    const { runtime, renderer } = runtimeOf();
    stellarStreamsPass(runtime).drawPick!({} as GPURenderPassEncoder, VIEW, CTX, STATE, 1);
    expect(renderer.drawPick).toHaveBeenCalledTimes(1);
    expect(renderer.drawPick.mock.calls[0]![6]).toBe(initialState.streak);
    expect(renderer.draw).not.toHaveBeenCalled();
  });
});
