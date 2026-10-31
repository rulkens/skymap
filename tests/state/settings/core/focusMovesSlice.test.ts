import { describe, it, expect } from 'vitest';

import {
  focusMovesSlice,
  setEasedDuration,
  setGeodesicTuning,
} from '../../../../src/state/settings/core/focusMovesSlice';
import { DEFAULT_GEODESIC_TUNING } from '../../../../src/data/camera/focusMoveDefaults';

describe('focusMovesSlice', () => {
  it('setGeodesicTuning merges one knob without touching the others', () => {
    const before = focusMovesSlice.getInitialState();
    const next = focusMovesSlice.reducer(before, setGeodesicTuning({ rho: 0.5 }));

    expect(next.geodesic).toEqual({ ...DEFAULT_GEODESIC_TUNING, rho: 0.5 });
    expect(next.eased).toBe(before.eased);
    expect(next.style).toBe(before.style);
  });

  it('setEasedDuration floors a zero duration at 1 ms', () => {
    const next = focusMovesSlice.reducer(focusMovesSlice.getInitialState(), setEasedDuration(0));
    expect(next.eased.durationMs).toBe(1);
  });
});
