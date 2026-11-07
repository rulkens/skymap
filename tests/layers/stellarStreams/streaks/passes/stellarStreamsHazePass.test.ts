import { describe, expect, it, vi } from 'vitest';

import { stellarStreamsHazePass } from '../../../../../src/layers/stellarStreams/streaks/passes/stellarStreamsHazePass';
import { initialState } from '../../../../../src/layers/stellarStreams/state/stellarStreams/initialState';
import type { StellarStreamsRuntime } from '../../../../../src/layers/stellarStreams/@types/StellarStreamsRuntime';
import type { PassState } from '../../../../../src/@types/engine/frame/PassState';
import type { FrameView } from '../../../../../src/@types/engine/frame/FrameView';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';

const STATE = { settings: { stellarStreams: initialState } } as unknown as PassState;
const CTX = {
  drawPxPerRad: 1000,
  canvasSize: { width: 1280, height: 720 },
  snapshot: { nowMs: 0, renderTargets: { sizeOf: () => ({ width: 640, height: 360 }) } },
} as unknown as FrameView;
const VIEW = {
  slab: { vp: new Float64Array(16) },
  camPos: [0, 0, 0],
  viewportPx: [1280, 720],
} as unknown as SlabView;

describe('stellarStreamsHazePass', () => {
  it("draws the haze in the target's pixels: its size, and pxPerRad scaled to its height", () => {
    const draw = vi.fn();
    const runtime = { renderer: { hasData: () => true, draw } } as unknown as StellarStreamsRuntime;
    stellarStreamsHazePass(runtime).draw({} as GPURenderPassEncoder, VIEW, CTX, STATE, 1);
    const [, which, , viewportPx, pxPerRad, , , look] = draw.mock.calls[0]!;
    expect(which).toBe('haze');
    expect(viewportPx).toEqual([640, 360]);
    expect(pxPerRad).toBe(500);
    expect(look).toBe(initialState.haze);
  });
});
