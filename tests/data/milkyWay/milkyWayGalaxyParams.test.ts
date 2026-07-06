import { describe, expect, it } from 'vitest';

import { classifyHubbleType } from '../../../src/services/gpu/galaxy/classifyHubbleType';
import {
  MILKY_WAY_GALAXY_PARAMS,
  MILKY_WAY_GENERATION_SEED,
} from '../../../src/data/milkyWay/milkyWayGalaxyParams';

describe('MILKY_WAY_GALAXY_PARAMS', () => {
  it('is an SBb with 4 arms and the explicit seed', () => {
    expect(MILKY_WAY_GALAXY_PARAMS.type).toBe('SBb');
    expect(MILKY_WAY_GALAXY_PARAMS.armCount).toBe(4);
    expect(MILKY_WAY_GALAXY_PARAMS.seed).toBe(MILKY_WAY_GENERATION_SEED);
    expect(MILKY_WAY_GALAXY_PARAMS.starCount).toBe(200_000);
  });

  it('classifies as barred (guards against a type-string typo silently changing morphology)', () => {
    expect(classifyHubbleType(MILKY_WAY_GALAXY_PARAMS.type)).toBe('barred');
  });
});
