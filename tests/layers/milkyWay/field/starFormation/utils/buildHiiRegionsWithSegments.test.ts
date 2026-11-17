import { describe, expect, it } from 'vitest';
import { MILKY_WAY_GALAXY_PARAMS } from '../../../../../../src/data/milkyWay/milkyWayGalaxyParams';
import { describeGalaxy } from '../../../../../../src/services/engine/galaxyGenerator/shared/describeGalaxy';
import { DEFAULT_GALAXY_STAR_FORMATION_PARAMS } from '../../../../../../src/layers/milkyWay/field/starFormation/data/defaultGalaxyStarFormationParams';
import { DEFAULT_GALAXY_FIELD_TUNING } from '../../../../../../src/layers/milkyWay/field/mixture/utils/galaxyFieldMixture';
import { buildHiiRegionsWithSegments } from '../../../../../../src/layers/milkyWay/field/starFormation/utils/buildHiiRegionsWithSegments';
import type { GalaxyIsmMap } from '../../../../../../src/@types/galaxy/GalaxyIsmMap';

const geometry = describeGalaxy(MILKY_WAY_GALAXY_PARAMS);

/** Busy on every channel, so all three tiers contribute. */
function makeBusyMap(): GalaxyIsmMap {
  const az = 32;
  const rings = 16;
  const data = new Float32Array(rings * az * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 0.78;
    data[i + 1] = 0.7;
    data[i + 2] = 0.6;
  }
  return { az, rings, rMin: 0.5, rMax: geometry.outerRadius, data };
}

// The galaxy-renderer tool's timing HUD draws one sub-pass per segment via
// `firstInstance`/`instanceCount` (createGalaxyEngine.ts's `drawFrame`) — a
// gap or overlap between segments would either skip real components or draw
// some of them twice, and a short total would silently drop the tail of
// whichever tier's checkpoint drifted from what actually landed in `out`.
describe('buildHiiRegionsWithSegments', () => {
  it('segments are contiguous, non-overlapping, and sum to the assembled component count', () => {
    const map = makeBusyMap();
    // Defaults alone: `dig.fraction`/`youngStars.brightness` are both nonzero
    // out of the box (see `galaxyFieldMixture.ts`'s `DEFAULT_GALAXY_FIELD_TUNING`),
    // so all three tiers actually contribute on the MW preset.
    const { components, segments } = buildHiiRegionsWithSegments(
      geometry,
      DEFAULT_GALAXY_FIELD_TUNING,
      DEFAULT_GALAXY_STAR_FORMATION_PARAMS,
      geometry.seed,
      map,
    );

    expect(segments.map((s) => s.label)).toEqual(['hii:shells', 'hii:dig', 'hii:young']);
    // Sanity: the MW preset really exercises every tier, or the contiguity
    // assertions below would pass trivially over all-zero segments.
    for (const segment of segments) expect(segment.count).toBeGreaterThan(0);

    let expectedFirst = 0;
    for (const segment of segments) {
      expect(segment.first).toBe(expectedFirst);
      expectedFirst += segment.count;
    }
    expect(expectedFirst).toBe(components.length);
  });
});
