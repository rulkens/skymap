import { createSelector } from '@reduxjs/toolkit';
import type { BenchState } from '../../@types/BenchState';

/** Manual `g` points down-sun (away from it), so negating turns the slider
 *  into the same "sun azimuth" the lighting-preview slider already means. */
export const selectManualG = createSelector(
  [(state: BenchState) => state.sun.manualAzDeg, (state: BenchState) => state.sun.manualStrength],
  (azDeg, strength): readonly [number, number] => {
    const az = (azDeg * Math.PI) / 180;
    return [-strength * Math.sin(az), -strength * Math.cos(az)];
  },
);
