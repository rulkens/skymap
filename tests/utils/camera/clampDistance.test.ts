import { describe, it, expect, vi } from 'vitest';
import {
  clampDistance,
  MIN_DISTANCE_MPC,
  MAX_DISTANCE_MPC,
} from '../../../src/utils/camera/clampDistance';

/**
 * The galaxy-focus tween's minimum end distance (0.15 Mpc) is the lowest
 * distance `galaxyFocusDistance()` can return — see
 * `src/services/engine/camera/galaxyFocusDistance.ts: MIN_FOCUS_DISTANCE_MPC`.
 * A sub-floor wheel-zoom input must not ratchet that distance outward;
 * `clampDistance(GALAXY_FOCUS_MIN_MPC)` must return the value unchanged.
 */
const GALAXY_FOCUS_MIN_MPC = 0.15;

describe('clampDistance', () => {
  it('clampDistance floors at MIN_DISTANCE_MPC', () => {
    // 1e-30 is well below the default 0.05 floor (the ?deepZoom gate lowers
    // it to 1e-17; either way 1e-30 clamps up to the floor).
    expect(clampDistance(1e-30)).toBe(MIN_DISTANCE_MPC);
  });

  it('clampDistance caps at MAX_DISTANCE_MPC', () => {
    // A distance beyond the observable-universe limit is clamped to MAX.
    expect(clampDistance(1e9)).toBe(MAX_DISTANCE_MPC);
  });

  it('the focus-on end distance is not ratcheted', () => {
    // The galaxy-focus tween's minimum end distance (0.15 Mpc,
    // galaxyFocusDistance.ts: MIN_FOCUS_DISTANCE_MPC) must pass through
    // clampDistance unchanged — both the default 0.05 floor and the
    // ?deepZoom 1e-17 floor sit far below it.
    expect(clampDistance(GALAXY_FOCUS_MIN_MPC)).toBe(GALAXY_FOCUS_MIN_MPC);
  });

  it('a value within bounds is returned unchanged', () => {
    const mid = 10; // 10 Mpc — squarely inside [0.05, 30000]
    expect(clampDistance(mid)).toBe(mid);
  });

  it('the ?deepZoom URL gate lowers the floor to Earth-surface scale', async () => {
    vi.resetModules();
    vi.doMock('../../../src/utils/url/hasUrlGate', () => ({
      hasUrlGate: (name: string) => name === 'deepZoom',
    }));
    const gated = await import('../../../src/utils/camera/clampDistance');
    expect(gated.MIN_DISTANCE_MPC).toBe(1e-17);
    expect(gated.clampDistance(1e-30)).toBe(1e-17);
    vi.doUnmock('../../../src/utils/url/hasUrlGate');
    vi.resetModules();
  });
});
