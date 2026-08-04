/**
 * The dust cloud's size knob is a SIZE knob. It once also scaled the
 * complex child scatter, which made every particle's centre an exact
 * homothety about its complex's seed point — sprites slid across the disc as
 * the slider moved instead of growing in place. Nothing else sees it: the
 * field is drawn from `center` + inverse covariance, so a moving centre is
 * only visible on screen.
 */
import { describe, expect, it } from 'vitest';
import { MILKY_WAY_GALAXY_PARAMS } from '../../../../../src/data/milkyWay/milkyWayGalaxyParams';
import { describeGalaxy } from '../../../../../src/services/engine/galaxyGenerator/shared/describeGalaxy';
import { DEFAULT_GALAXY_DUST_PARAMS } from '../../../../../src/services/engine/galaxyGenerator/v2/defaultGalaxyDustParams';
import { buildDustParticleCloud } from '../../../../../src/services/engine/galaxyGenerator/v2/dustParticleCloud';
import { DEFAULT_GALAXY_FIELD_TUNING } from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyFieldMixture';

const geometry = describeGalaxy(MILKY_WAY_GALAXY_PARAMS);

/** Clumpiness deliberately non-zero: at 0 a lone child has no scatter to be scaled, so the coupling would hide. */
function buildAtSizeScale(sizeScale: number) {
  const dust = {
    ...DEFAULT_GALAXY_DUST_PARAMS,
    cloud: { ...DEFAULT_GALAXY_DUST_PARAMS.cloud, count: 400, clumpiness: 0.5, sizeScale },
  };
  return buildDustParticleCloud(geometry, dust, DEFAULT_GALAXY_FIELD_TUNING, 1, null, null);
}

describe('buildDustParticleCloud', () => {
  it('resizes clouds in place — sizeScale moves no particle centre', () => {
    const base = buildAtSizeScale(1);
    const doubled = buildAtSizeScale(2);
    expect(doubled.length).toBe(base.length);

    for (let i = 0; i < base.length; i++) {
      expect(doubled[i]!.center).toEqual(base[i]!.center);
      expect(doubled[i]!.boundRadius).toBeCloseTo(base[i]!.boundRadius * 2, 10);
    }
  });
});
