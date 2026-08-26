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
import type { SelectionRow } from '../../../../src/@types/engine/SelectionRow';

// A live "now" far enough past J2000 that Earth has visibly moved along its
// orbit — the exact divergence the investigation measured (~133 deg / 26 yrs).
const LIVE_SIM_DAYS = CONST_J2000 + 9727.95;

describe('liveFocusRow', () => {
  it("swaps a focused body's positionMpc for deriveBodyStates(simDays), not the stale row value", () => {
    const stalePositionMpc = deriveBodyStates(CONST_J2000).get('earth')!.positionMpc;
    const focus: SelectionRow = {
      type: 'body',
      id: 'earth',
      label: 'Earth',
      positionMpc: [stalePositionMpc[0], stalePositionMpc[1], stalePositionMpc[2]],
      radiusM: 6371000,
    };

    const out = liveFocusRow(focus, LIVE_SIM_DAYS);

    const livePositionMpc = deriveBodyStates(LIVE_SIM_DAYS).get('earth')!.positionMpc;
    expect(out).toEqual({ ...focus, positionMpc: livePositionMpc });
    expect(livePositionMpc).not.toEqual(stalePositionMpc);
  });

  it('keeps identity fields (type/id/label/radiusM) untouched', () => {
    const focus: SelectionRow = {
      type: 'body',
      id: 'earth',
      label: 'Earth',
      positionMpc: [0, 0, 0],
      radiusM: 6371000,
    };

    const out = liveFocusRow(focus, LIVE_SIM_DAYS);

    expect(out).toMatchObject({ type: 'body', id: 'earth', label: 'Earth', radiusM: 6371000 });
  });

  it('passes a non-body row through unchanged (already live-resolved)', () => {
    const focus: SelectionRow = { type: 'milkyWay' };
    expect(liveFocusRow(focus, LIVE_SIM_DAYS)).toBe(focus);
  });

  it('passes null through unchanged', () => {
    expect(liveFocusRow(null, LIVE_SIM_DAYS)).toBeNull();
  });

  it('falls back to the given row if the body id is unknown to deriveBodyStates', () => {
    const focus: SelectionRow = {
      type: 'body',
      id: 'not-a-real-body',
      label: 'Ghost',
      positionMpc: [1, 2, 3],
      radiusM: 1000,
    };
    expect(liveFocusRow(focus, LIVE_SIM_DAYS)).toBe(focus);
  });
});
