/**
 * milkyWayPlanner — reconciles the cloud against the live `starCount` every
 * plan, not gated on `settings.milkyWay.enabled`, so re-enabling after a
 * tier change never draws a stale cloud.
 */
import { describe, it, expect, vi } from 'vitest';
import { milkyWayPlanner } from '../../../src/layers/milkyWay/frame';
import type { MilkyWayRuntime } from '../../../src/layers/milkyWay/@types/MilkyWayRuntime';
import type { PassState } from '../../../src/@types/engine/frame/PassState';
import type { ReadyFrameContext } from '../../../src/@types/engine/frame/ReadyFrameContext';
import type { FrameView } from '../../../src/@types/engine/frame/FrameView';

function makeRuntime(reconcile = vi.fn()): MilkyWayRuntime {
  return { cloud: { reconcile } } as unknown as MilkyWayRuntime;
}

function stateStub(enabled: boolean, starCount: number): PassState {
  return { settings: { milkyWay: { enabled, starCount } } } as unknown as PassState;
}

const snapshotStub = {} as ReadyFrameContext;
const viewsStub = [{} as FrameView];

describe('milkyWay frame planner', () => {
  it('reconciles even while the Milky Way is disabled', () => {
    const reconcile = vi.fn();
    const runtime = makeRuntime(reconcile);
    const state = stateStub(false, 100000);
    milkyWayPlanner(runtime).plan(snapshotStub, viewsStub, state);
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(reconcile).toHaveBeenCalledWith(100000);
  });
});
