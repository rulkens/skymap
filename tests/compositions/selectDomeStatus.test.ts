import { describe, expect, it } from 'vitest';

import { selectDomeStatus } from '../../src/compositions/selectDomeStatus';
import { stateAfter } from '../fixtures/stateAfter';
import { setSelectionRow } from '../../src/state/selectionRows/selectionRowsSlice';
import { takeoverStarted } from '../../src/state/takeover/takeoverActions';
import { beatChanged, setPaused } from '../../src/state/tour/tourSlice';
import { setSimDays } from '../../src/state/time/timeSlice';
import { tourRegistry } from '../../src/data/animation/tours/tourRegistry';
import { bodyDriverGeometry } from '../../src/utils/scene/bodyDriverGeometry';
import type { ToggleRow } from '../../src/@types/settings/ToggleRow';

const NO_ROWS: readonly ToggleRow[] = [];

describe('selectDomeStatus', () => {
  it('reports no tour when none runs', () => {
    expect(selectDomeStatus(stateAfter(), NO_ROWS, 0).tour).toBeNull();
    const clip = stateAfter(takeoverStarted({ kind: 'clip', id: 'flyout' }));
    expect(selectDomeStatus(clip, NO_ROWS, 0).tour).toBeNull();
  });

  it("reports the running tour's beat and count", () => {
    const state = stateAfter(
      takeoverStarted({ kind: 'tour', id: 'grandTour' }),
      beatChanged(3),
      setPaused(true),
    );
    expect(selectDomeStatus(state, NO_ROWS, 0).tour).toEqual({
      id: 'grandTour',
      beatIndex: 3,
      beatCount: tourRegistry.grandTour.beats.length,
      paused: true,
    });
  });

  it("reports a focused body's id, Earth included", () => {
    const state = stateAfter(
      setSelectionRow({
        slot: 'focus',
        row: {
          type: 'body',
          id: 'earth',
          label: 'Earth',
          positionMpc: [0, 0, 0],
          driver: bodyDriverGeometry('earth'),
        },
      }),
    );
    expect(selectDomeStatus(state, NO_ROWS, 0).focus).toEqual({ id: 'body-earth' });
  });

  it('derives simDays at the nowMs it is handed', () => {
    const state = stateAfter(setSimDays({ simDays: 2451545, nowMs: 1000 }));
    expect(selectDomeStatus(state, NO_ROWS, 1000).time.simDays).toBe(2451545);
    expect(selectDomeStatus(state, NO_ROWS, 61_000).time.simDays).toBeGreaterThan(2451545);
  });
});
