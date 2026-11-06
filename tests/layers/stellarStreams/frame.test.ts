import { describe, expect, it } from 'vitest';

import { stellarStreamsPlanner } from '../../../src/layers/stellarStreams/frame';
import { initialState } from '../../../src/layers/stellarStreams/state/stellarStreams/initialState';
import { stellarStreamsVisibility } from '../../../src/layers/stellarStreams/visibility';
import { createFadeRegistry } from '../../../src/services/animation/fadeRegistry';
import { gatePlannerByFade } from '../../../src/services/engine/layer/gatePlannerByFade';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import type { EngineState } from '../../../src/@types/engine/state/EngineState';
import type { FrameContentPlanner } from '../../../src/@types/engine/frame/FrameContentPlanner';
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

const LOADED = { renderer: { hasData: () => true } } as unknown as StellarStreamsRuntime;
const stateOf = (settings: StellarStreamsSettings) =>
  ({ settings: { stellarStreams: settings } }) as unknown as PassState;

function plan(fade: number, loaded: boolean, settings = DRIFTING) {
  const runtime = { renderer: { hasData: () => loaded } } as unknown as StellarStreamsRuntime;
  return stellarStreamsPlanner(runtime).plan(
    {} as ReadyFrameContext,
    [{} as FrameView],
    stateOf(settings),
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

  it('does not wake before the bin loads', () => {
    expect(plan(1, false).awake).toBe(false);
  });

  it('does not wake when switched on but near the Sun, inside the distance band', () => {
    const fades = createFadeRegistry({ requestRender: () => {} });
    fades.register({ address: 'stellarStreams' } as never, 1);
    const engine = {
      subsystems: { fades, clipPlayer: { clipOpacityOf: () => 1 } },
      visibilityEntries: stellarStreamsVisibility,
    } as unknown as Pick<EngineState, 'subsystems' | 'visibilityEntries'>;
    const gated = gatePlannerByFade(
      stellarStreamsPlanner(LOADED) as unknown as FrameContentPlanner<void>,
      engine,
    );
    if (gated.scope !== 'once') throw new Error('scope lost');
    const snapshot = { nowMs: 0, bodyStates: new Map() } as unknown as ReadyFrameContext;
    const near = {
      drawCamPos: [2 * SCALE_UNITS.KPC_TO_MPC, 0, 0],
      snapshot,
    } as unknown as FrameView;
    expect(gated.plan(snapshot, [near], stateOf(DRIFTING)).awake).toBe(false);
  });

  it('wakes while visible with data and a drifting look', () => {
    expect(plan(0.5, true)).toMatchObject({ awake: true, loading: false, settling: false });
  });
});
