import { describe, expect, it } from 'vitest';

import { stellarStreamsPlanner } from '../../../src/layers/stellarStreams/frame';
import { initialState } from '../../../src/layers/stellarStreams/state/stellarStreams/initialState';
import type { StellarStreamsRuntime } from '../../../src/layers/stellarStreams/@types/StellarStreamsRuntime';
import type { StellarStreamsSettings } from '../../../src/layers/stellarStreams/@types/StellarStreamsSettings';
import type { PassState } from '../../../src/@types/engine/frame/PassState';
import type { ReadyFrameContext } from '../../../src/@types/engine/frame/ReadyFrameContext';
import type { FrameView } from '../../../src/@types/engine/frame/FrameView';

const DRIFTING = initialState;
const STILL: StellarStreamsSettings = {
  ...initialState,
  streak: { ...initialState.streak, flow: 0 },
  haze: { ...initialState.haze, flow: 0 },
};

function plan(fade: number, loaded: boolean, settings = DRIFTING) {
  const runtime = { renderer: { hasData: () => loaded } } as unknown as StellarStreamsRuntime;
  const state = { settings: { stellarStreams: settings } } as unknown as PassState;
  return stellarStreamsPlanner(runtime).plan(
    {} as ReadyFrameContext,
    [{} as FrameView],
    state,
    fade,
  );
}

describe('stellarStreams planner', () => {
  it('does not wake at fade 0', () => {
    expect(plan(0, true)).toMatchObject({ awake: false, loading: false });
  });

  it("does not wake when both looks' flow are 0", () => {
    expect(plan(1, true, STILL).awake).toBe(false);
  });

  it('does not wake before the bin loads, and reports loading only while visible', () => {
    expect(plan(1, false)).toMatchObject({ awake: false, loading: true });
    expect(plan(0, false).loading).toBe(false);
  });

  it('wakes while visible with data and a drifting look', () => {
    expect(plan(0.5, true)).toMatchObject({ awake: true, loading: false, settling: false });
  });
});
