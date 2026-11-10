/**
 * milkyWayPlanner — reconciles the cloud against the live `starCount` every
 * plan, not gated on `settings.milkyWay.enabled`, so re-enabling after a
 * tier change never draws a stale cloud; and carries the field's one plan.
 */
import { describe, it, expect, vi } from 'vitest';
import { milkyWayPlanner } from '../../../src/layers/milkyWay/frame';
import type { MilkyWayRuntime } from '../../../src/layers/milkyWay/@types/MilkyWayRuntime';
import type { MilkyWayRenderer } from '../../../src/layers/milkyWay/@types/MilkyWayRenderer';
import type { GalaxyFieldHost } from '../../../src/layers/milkyWay/field/host/@types/GalaxyFieldHost';
import type { FieldFramePlan } from '../../../src/layers/milkyWay/field/@types/FieldFramePlan';
import type { PassState } from '../../../src/@types/engine/frame/PassState';
import type { ReadyFrameContext } from '../../../src/@types/engine/frame/ReadyFrameContext';
import type { FrameView } from '../../../src/@types/engine/frame/FrameView';
import { createFieldHostSlot } from '../../../src/layers/milkyWay/field/host/subsystems/createFieldHostSlot';
import type { FieldHostTuning } from '../../../src/layers/milkyWay/field/host/@types/FieldHostTuning';

const PLAN: FieldFramePlan = { encodes: ['dustMap', 'field'], composites: ['field'] };

function makeRuntime(reconcile = vi.fn()) {
  const host = {
    setTuning: vi.fn(),
    ensureFresh: vi.fn(),
    destroy: vi.fn(),
    plan: vi.fn(() => PLAN),
  } as unknown as GalaxyFieldHost;
  const fieldHost = createFieldHostSlot({
    create: () => host,
    tuningFor: () => ({}) as FieldHostTuning,
  });
  return { runtime: { cloud: { reconcile }, fieldHost } as unknown as MilkyWayRuntime, host };
}

function stateStub(enabled: boolean, starCount: number, renderer: MilkyWayRenderer = 'v1') {
  return {
    settings: { milkyWay: { enabled, renderer, cloud: { starCount }, field: { dust: true } } },
  } as unknown as PassState;
}

const snapshotStub = {} as ReadyFrameContext;
const viewsStub = [{} as FrameView];

describe('milkyWay frame planner', () => {
  it('reconciles even while the Milky Way is disabled', () => {
    const reconcile = vi.fn();
    const { runtime } = makeRuntime(reconcile);
    const state = stateStub(false, 100000);
    milkyWayPlanner(runtime).plan(snapshotStub, viewsStub, state);
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(reconcile).toHaveBeenCalledWith(100000);
  });

  it('the planner value carries the host and its plan only while the field part is on', () => {
    const { runtime, host } = makeRuntime();
    const planner = milkyWayPlanner(runtime);
    expect(planner.plan(snapshotStub, viewsStub, stateStub(true, 1, 'v1')).value).toBeNull();
    expect(planner.plan(snapshotStub, viewsStub, stateStub(true, 1, 'v2')).value).toEqual({
      host,
      plan: PLAN,
    });
    expect(planner.plan(snapshotStub, viewsStub, stateStub(true, 1, 'both')).value?.host).toBe(
      host,
    );
    expect(planner.plan(snapshotStub, viewsStub, stateStub(true, 1, 'v1')).value).toBeNull();
    expect(host.destroy).toHaveBeenCalledTimes(1);
  });
});
