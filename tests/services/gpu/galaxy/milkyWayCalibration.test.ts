/**
 * milkyWayCalibration — the calibration constants are the single tuning
 * surface for the Milky Way point-cloud visual gate, so these tests pin the
 * *relationships* between them (medium equals the preset, small/large derive
 * from medium, model scale round-trips the preset's outer radius onto the
 * disk radius) rather than the tuned magnitudes themselves, which are
 * expected to move during that gate.
 */
import { describe, expect, it } from 'vitest';
import {
  MILKY_WAY_EXPOSURE,
  MILKY_WAY_MODEL_SCALE,
  MILKY_WAY_RADIUS_MPC,
  MILKY_WAY_STARS_PER_TIER,
  MILKY_WAY_STAR_PX_MAX,
  MILKY_WAY_STAR_PX_MIN,
  MILKY_WAY_STAR_SIZE_SCALE,
} from '../../../../src/services/gpu/galaxy/milkyWayCalibration';
import { outerRadiusOf } from '../../../../src/services/gpu/galaxy/outerRadiusOf';
import { MILKY_WAY_GALAXY_PARAMS } from '../../../../src/data/milkyWay/milkyWayGalaxyParams';

describe('milkyWayCalibration', () => {
  it('medium tier budget equals the preset starCount', () => {
    expect(MILKY_WAY_STARS_PER_TIER.medium).toBe(MILKY_WAY_GALAXY_PARAMS.starCount);
  });

  it('small and large derive by x0.5 and x2 from medium', () => {
    expect(MILKY_WAY_STARS_PER_TIER.small).toBe(MILKY_WAY_STARS_PER_TIER.medium * 0.5);
    expect(MILKY_WAY_STARS_PER_TIER.large).toBe(MILKY_WAY_STARS_PER_TIER.medium * 2);
  });

  it('model scale maps the preset outer radius onto MILKY_WAY_RADIUS_MPC', () => {
    const mapped = MILKY_WAY_MODEL_SCALE * outerRadiusOf(MILKY_WAY_GALAXY_PARAMS);
    expect(mapped).toBeCloseTo(MILKY_WAY_RADIUS_MPC, 10);
  });

  it('px clamp is a non-empty positive band', () => {
    expect(MILKY_WAY_STAR_PX_MIN).toBeGreaterThan(0);
    expect(MILKY_WAY_STAR_PX_MAX).toBeGreaterThan(MILKY_WAY_STAR_PX_MIN);
  });

  it('exposure is a positive finite factor', () => {
    expect(MILKY_WAY_EXPOSURE).toBeGreaterThan(0);
    expect(Number.isFinite(MILKY_WAY_EXPOSURE)).toBe(true);
  });

  it('star size scale is a positive finite factor', () => {
    expect(MILKY_WAY_STAR_SIZE_SCALE).toBeGreaterThan(0);
    expect(Number.isFinite(MILKY_WAY_STAR_SIZE_SCALE)).toBe(true);
  });
});
