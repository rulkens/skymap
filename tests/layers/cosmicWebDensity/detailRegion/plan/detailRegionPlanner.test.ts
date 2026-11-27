import { describe, it, expect, vi } from 'vitest';
import type { FrameView } from '../../../../../src/@types/engine/frame/FrameView';
import type { PassState } from '../../../../../src/@types/engine/frame/PassState';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { CosmicWebDensityRuntime } from '../../../../../src/layers/cosmicWebDensity/@types/CosmicWebDensityRuntime';
import { detailRegionPlanner } from '../../../../../src/layers/cosmicWebDensity/detailRegion/plan/detailRegionPlanner';
import { INITIAL_SETTINGS } from '../../../../../src/state/settings/initialSettings';

const SNAPSHOT = { nowMs: 0, focusBlend: 0, focusPickId: null } as unknown as ReadyFrameContext;
const STATE = { settings: INITIAL_SETTINGS, tier: 'large', frameIndex: 7 } as unknown as PassState;
const FADE = { mcpm: 1, 'polyphorm-2mrs': 0, 'mcpm-workbench': 0 };
const view = (stillFrames: number) =>
  ({ drawCamPos: [0, 0, 0], drawPxPerRad: 1020, stillFrames }) as unknown as FrameView;

describe('detailRegionPlanner', () => {
  it('a busy region holds loading only at rest', () => {
    const frame = vi.fn(() => ({ draws: {}, busy: true }));
    const committed = () => ({ kind: 'ready' });
    const runtime = {
      regions: { frame },
      slots: {
        mcpm: { committed },
        'polyphorm-2mrs': { committed },
        'mcpm-workbench': { committed },
      },
    } as unknown as CosmicWebDensityRuntime;
    const planner = detailRegionPlanner(runtime);

    const moving = planner.plan(SNAPSHOT, [view(0)], STATE, FADE);
    expect(moving).toMatchObject({ awake: true, loading: false });
    const still = planner.plan(SNAPSHOT, [view(3)], STATE, FADE);
    expect(still).toMatchObject({ awake: true, loading: true });
    // The handed-0 field and the scfd workbench cube want no region; MCPM at large's K.
    expect(frame).toHaveBeenLastCalledWith(new Map([['mcpm', 8]]), [0, 0, 0], 340, 7, 0);
  });
});
