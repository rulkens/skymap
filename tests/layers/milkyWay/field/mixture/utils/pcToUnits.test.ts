import { describe, expect, it } from 'vitest';
import { MILKY_WAY_DISC_RADIUS_KPC } from '../../../../../../src/data/milkyWay/galacticCenter';
import { MILKY_WAY_GALAXY_PARAMS } from '../../../../../../src/data/milkyWay/milkyWayGalaxyParams';
import { pcToUnits } from '../../../../../../src/layers/milkyWay/field/mixture/utils/pcToUnits';
import { describeGalaxy } from '../../../../../../src/services/engine/galaxyGenerator/shared/describeGalaxy';
import { MILKY_WAY_MODEL_SCALE } from '../../../../../../src/services/engine/galaxyGenerator/v1/milkyWayCalibration';

describe('pcToUnits', () => {
  it('the field and the cloud share one kpc-per-unit scale', () => {
    // 1 kpc of field length is 1 kpc in the scene once the placement scales it.
    expect(pcToUnits(1000) * MILKY_WAY_MODEL_SCALE).toBeCloseTo(1e-3, 15);
    // The real disc edge lands on the outerRadius the cloud is generated at.
    expect(pcToUnits(MILKY_WAY_DISC_RADIUS_KPC * 1000)).toBeCloseTo(
      describeGalaxy(MILKY_WAY_GALAXY_PARAMS).outerRadius,
      9,
    );
  });
});
