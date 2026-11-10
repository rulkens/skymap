import { describe, expect, it } from 'vitest';
import { describeGalaxy } from '../../../../../../src/services/engine/galaxyGenerator/shared/describeGalaxy';
import { buildArmSpurs } from '../../../../../../src/layers/milkyWay/field/arms/utils/buildArmSpurs';
import { DEFAULT_GALAXY_FIELD_TUNING } from '../../../../../../src/layers/milkyWay/field/mixture/utils/galaxyFieldMixture';
import type { GalaxyParams } from '../../../../../../src/@types/galaxy/GalaxyParams';

const PARAMS: GalaxyParams = {
  type: 'Sb',
  shared: { seed: 42, armCount: 2 },
  legacy: { starCount: 100000 },
};

describe('buildArmSpurs', () => {
  const geometry = describeGalaxy(PARAMS);
  const tuning = DEFAULT_GALAXY_FIELD_TUNING.arms.spurs;

  it('is empty when the pill is off', () => {
    expect(buildArmSpurs(geometry, { ...tuning, enabled: false }, geometry.seed)).toEqual([]);
  });

  it('is deterministic for a fixed seed', () => {
    const a = buildArmSpurs(geometry, tuning, 999);
    const b = buildArmSpurs(geometry, tuning, 999);
    expect(a).toEqual(b);
  });
});
