/**
 * At clumpiness 0 every complex holds exactly one child, so the placement
 * density IS the particle distribution — nothing sits between the seed point
 * and the particle. Guards against the sampler scattering that lone child
 * anyway, which would convolve the density with the intra-complex kernel;
 * against `'mapDensity'` mode that silently blurs the ISM map the tier exists
 * to follow, and no other check sees it (the field is only ever read as
 * pixels).
 */
import { describe, expect, it } from 'vitest';
import { MILKY_WAY_GALAXY_PARAMS } from '../../../../../src/data/milkyWay/milkyWayGalaxyParams';
import { describeGalaxy } from '../../../../../src/services/engine/galaxyGenerator/shared/describeGalaxy';
import {
  DISC_SIGMA_RATIOS,
  DISC_SURFACE_WEIGHTS,
} from '../../../../../src/services/engine/galaxyGenerator/v2/discSurfaceFit';
import { buildClusteredDiscPlacement } from '../../../../../src/services/engine/galaxyGenerator/v2/clusteredDiscPlacement';
import { mulberry32 } from '../../../../../src/utils/random/mulberry32';

const geometry = describeGalaxy(MILKY_WAY_GALAXY_PARAMS);

/** A stubbed `samplePoint` drawing uniformly over a narrow annulus, so a seed point CANNOT land outside it. */
const R_MIN = 2;
const R_MAX = 2.05;

function place(clumpiness: number) {
  return buildClusteredDiscPlacement<Record<string, never>>(
    {
      geometry,
      rng: mulberry32(1),
      count: 500,
      clumpiness,
      // Far wider than the annulus, so a scattered child is unmistakable.
      complexSpread: 0.5,
      elongation: 2.5,
      sigmaZComplex: 0,
      discSigmaR: (k) => DISC_SIGMA_RATIOS[k]! * geometry.diskScaleLen,
      discWeights: DISC_SURFACE_WEIGHTS,
      discWeightSum: DISC_SURFACE_WEIGHTS.reduce((sum, w) => sum + w, 0),
      placement: {
        kind: 'mapDensity',
        samplePoint: (sampleRng) => ({
          radius: R_MIN + sampleRng() * (R_MAX - R_MIN),
          angle: sampleRng() * 2 * Math.PI,
        }),
      },
    },
    () => ({}),
  );
}

describe('buildClusteredDiscPlacement', () => {
  it('leaves a lone child on its complex seed point', () => {
    for (const particle of place(0)) {
      const radius = Math.hypot(particle.center[0], particle.center[2]);
      expect(radius).toBeGreaterThanOrEqual(R_MIN - 1e-9);
      expect(radius).toBeLessThanOrEqual(R_MAX + 1e-9);
    }
  });

  it('still scatters children once a complex has siblings', () => {
    const scattered = place(1).filter((particle) => {
      const radius = Math.hypot(particle.center[0], particle.center[2]);
      return radius < R_MIN || radius > R_MAX;
    });
    expect(scattered.length).toBeGreaterThan(0);
  });
});
