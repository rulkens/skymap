import { describe, it, expect } from 'vitest';

import { milkyWayFieldAlpha } from '../../../../../src/layers/milkyWay/field/present/milkyWayFieldAlpha';
import { milkyWayPlanner } from '../../../../../src/layers/milkyWay/frame';
import { ZERO_FOCUS } from '../../../../../src/services/engine/subsystems/recedingFocusSubsystem';
import type { FieldPlannerValue } from '../../../../../src/layers/milkyWay/field/host/@types/FieldPlannerValue';
import type { FrameView } from '../../../../../src/@types/engine/frame/FrameView';
import type { PassState } from '../../../../../src/@types/engine/frame/PassState';
import type { MilkyWayRuntime } from '../../../../../src/layers/milkyWay/@types/MilkyWayRuntime';

const RUNTIME = {} as unknown as MilkyWayRuntime;
const PLANNER = milkyWayPlanner(RUNTIME);
const LIVE: FieldPlannerValue = {
  host: {} as never,
  plan: { encodes: ['dustMap', 'field'], composites: ['field'] },
};

// 720-px viewport, 60° fovY; framing the disc from 150 kpc, where it draws at full strength.
function makeCtx(value: FieldPlannerValue): FrameView {
  return {
    id: 'canvas',
    snapshot: {
      nowMs: 0,
      focusBlend: 0,
      focusPickId: null,
      focus: ZERO_FOCUS,
      plans: { get: () => value },
    },
    drawCamPos: [0, 0, 0.15],
    drawPxPerRad: 720 / (2 * Math.tan(Math.PI / 6)),
  } as unknown as FrameView;
}

function stateWith(disabledPasses: Record<string, boolean>): PassState {
  return { settings: { debug: { disabledPasses } } } as unknown as PassState;
}

describe('milkyWayFieldAlpha', () => {
  it('is null when the mw-field-compute toggle is off, so the composite never adds stale targets', () => {
    const ctx = makeCtx(LIVE);
    expect(milkyWayFieldAlpha(RUNTIME, PLANNER, stateWith({}), ctx, 1)).toBeGreaterThan(0);
    expect(
      milkyWayFieldAlpha(RUNTIME, PLANNER, stateWith({ 'mw-field-compute': true }), ctx, 1),
    ).toBeNull();
  });

  it('is null without a host', () => {
    expect(milkyWayFieldAlpha(RUNTIME, PLANNER, stateWith({}), makeCtx(null), 1)).toBeNull();
  });
});
