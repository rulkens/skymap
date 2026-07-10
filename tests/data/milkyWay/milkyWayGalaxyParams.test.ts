import { describe, expect, it } from 'vitest';

import { classifyHubbleType } from '../../../src/services/gpu/galaxy/classifyHubbleType';
import { MILKY_WAY_GALAXY_PARAMS } from '../../../src/data/milkyWay/milkyWayGalaxyParams';

describe('MILKY_WAY_GALAXY_PARAMS', () => {
  it('classifies as barred (guards against a type-string typo silently changing morphology)', () => {
    expect(classifyHubbleType(MILKY_WAY_GALAXY_PARAMS.type)).toBe('barred');
  });
});
