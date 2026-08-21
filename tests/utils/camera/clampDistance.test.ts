/**
 * clampDistance — the shared zoom envelope.
 *
 * The surface stop is NOT here (it lives in `zoomedEyeStep`, in eye currency);
 * what remains is a ceiling and a positivity floor. The one case worth pinning
 * is that the floor never reaches up into galaxy-focus territory — it sits four
 * orders below the focus tween's minimum end distance, and inverting that would
 * push every galaxy focus back out again.
 */

import { describe, it, expect } from 'vitest';
import {
  clampDistance,
  MIN_DISTANCE_MPC,
  MAX_DISTANCE_MPC,
} from '../../../src/utils/camera/clampDistance';

/**
 * The galaxy-focus tween's minimum end distance (0.15 Mpc) is the lowest
 * distance `galaxyFocusDistance()` can return — see
 * `src/services/engine/camera/galaxyFocusDistance.ts: MIN_FOCUS_DISTANCE_MPC`.
 */
const GALAXY_FOCUS_MIN_MPC = 0.15;

describe('clampDistance', () => {
  it('holds the envelope and leaves the galaxy focus-on end distance alone', () => {
    expect(clampDistance(1e-30)).toBe(MIN_DISTANCE_MPC);
    expect(clampDistance(1e9)).toBe(MAX_DISTANCE_MPC);
    expect(clampDistance(GALAXY_FOCUS_MIN_MPC)).toBe(GALAXY_FOCUS_MIN_MPC);
  });
});
