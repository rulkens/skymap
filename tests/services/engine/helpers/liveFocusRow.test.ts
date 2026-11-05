/**
 * liveFocusRow — verifies the epoch-divergence fix: a focused body's
 * `positionMpc` is swapped for the LIVE `deriveBodyStates(simDays)` value
 * instead of the stale CONST_J2000 snapshot `extractSelectionRow` stores, and
 * every other row shape (which is already live-resolved) passes through
 * unchanged.
 */
import { describe, it, expect } from 'vitest';

import { liveFocusRow } from '../../../../src/services/engine/helpers/liveFocusRow';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { bodyDriverGeometry } from '../../../../src/utils/scene/bodyDriverGeometry';
import type { SelectionRow } from '../../../../src/@types/engine/SelectionRow';
import { asSceneBodyId } from '../../../../src/utils/scene/asSceneBodyId';
import { bodyRowAt } from '../../../../src/utils/scene/bodyRowAt';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { MILKY_WAY_ROW } from '../../../fixtures/milkyWayRow';

// A live "now" far enough past J2000 that Earth has visibly moved along its
// orbit — the exact divergence the investigation measured (~133 deg / 26 yrs).
const LIVE_SIM_DAYS = CONST_J2000 + 9727.95;

describe('liveFocusRow', () => {
  it("swaps a focused body's positionMpc for deriveBodyStates(simDays), not the stale row value", () => {
    const stalePositionMpc = deriveBodyStates(CONST_J2000).get(asSceneBodyId('earth'))!.positionMpc;
    const focus: SelectionRow = bodyRowAt('earth', [
      stalePositionMpc[0],
      stalePositionMpc[1],
      stalePositionMpc[2],
    ]);

    const out = liveFocusRow(focus, LIVE_SIM_DAYS);

    const livePositionMpc = deriveBodyStates(LIVE_SIM_DAYS).get(
      asSceneBodyId('earth'),
    )!.positionMpc;
    expect(out).toEqual({ ...focus, positionMpc: livePositionMpc });
    expect(livePositionMpc).not.toEqual(stalePositionMpc);
  });

  it('keeps identity fields (type/id/label) untouched', () => {
    const focus: SelectionRow = bodyRowAt('earth', [0, 0, 0]);

    const out = liveFocusRow(focus, LIVE_SIM_DAYS);

    expect(out).toMatchObject({ type: 'body', id: 'earth', label: 'Earth' });
  });

  it('passes a non-body row through unchanged (already live-resolved)', () => {
    const focus: SelectionRow = MILKY_WAY_ROW;
    expect(liveFocusRow(focus, LIVE_SIM_DAYS)).toBe(focus);
  });

  it('passes null through unchanged', () => {
    expect(liveFocusRow(null, LIVE_SIM_DAYS)).toBeNull();
  });

  it('falls back to the given row if the body id is unknown to deriveBodyStates', () => {
    const focus: SelectionRow = {
      type: 'body',
      id: asSceneBodyId('not-a-real-body'),
      label: 'Ghost',
      positionMpc: [1, 2, 3],
      radiusMpc: 1 * SCALE_UNITS.M_TO_MPC,
      // Hand-built: no seed to read, which is the point of this row.
      driver: {
        poseId: asSceneBodyId('not-a-real-body'),
        boundingRadiusM: 1,
        footprintRadiusM: 1,
        groundRadiusM: 1,
        standoffRadii: 1,
      },
    };
    expect(liveFocusRow(focus, LIVE_SIM_DAYS)).toBe(focus);
  });
});
