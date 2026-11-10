import { describe, expect, it } from 'vitest';
import { MILKY_WAY_DISC_RADIUS_KPC } from '../../../../../../src/data/milkyWay/galacticCenter';
import { MILKY_WAY_GALAXY_PARAMS } from '../../../../../../src/data/milkyWay/milkyWayGalaxyParams';
import { pcToUnits } from '../../../../../../src/layers/milkyWay/field/mixture/utils/pcToUnits';
import { describeGalaxy } from '../../../../../../src/services/engine/galaxyGenerator/shared/describeGalaxy';

describe('pcToUnits', () => {
  it('lands the real disc edge on the outerRadius the cloud is generated at', () => {
    expect(pcToUnits(MILKY_WAY_DISC_RADIUS_KPC * 1000)).toBeCloseTo(
      describeGalaxy(MILKY_WAY_GALAXY_PARAMS).outerRadius,
      9,
    );
  });
});
