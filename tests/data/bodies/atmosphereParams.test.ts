import { describe, it, expect } from 'vitest';
import { ATMOSPHERE_PARAMS } from '../../../src/data/bodies/atmosphereParams';
import { SCENE_EARTH } from '../../../src/data/bodies/sceneEarth';
import { SCENE_PLANETS } from '../../../src/data/bodies/scenePlanets';
import type { AtmosphereConstituent } from '../../../src/@types/scene/AtmosphereConstituent';

/**
 * Structural drift-catchers (spec §10). These iterate the whole table, so they
 * cover the Earth row and every new atmosphere row and won't break when a
 * legitimate row is added. They assert only what the compiler cannot: a
 * fat-fingered top below the surface, or a key that resolves to no seeded body.
 * NO numeric restatement of the eye-tuned coefficients — those are tunable data.
 */
describe('ATMOSPHERE_PARAMS', () => {
  it('keeps every row atmosphere top above its ground radius', () => {
    // A top authored below the surface would float the limb inside the ground
    // sphere — a mistake the types cannot catch.
    for (const [id, p] of Object.entries(ATMOSPHERE_PARAMS)) {
      expect(p.atmosphereTopKm, id).toBeGreaterThan(p.planetRadiusKm);
    }
  });

  it('resolves every key to a real seeded body', () => {
    // A typo'd id would silently never render (no row, no error). Seeded ids =
    // SCENE_PLANETS ids + SCENE_EARTH.id.
    const seeded = new Set<string>([SCENE_EARTH.id, ...SCENE_PLANETS.map((b) => b.id)]);
    for (const id of Object.keys(ATMOSPHERE_PARAMS)) {
      expect(seeded.has(id), id).toBe(true);
    }
  });
});

// The single-scatter source 'sum(scatter * phase)' in one channel, mirroring
// scattering.wesl's 'accumulateMedium'. Unnormalised: only channel RATIOS matter.
const phasedScatter = (
  constituents: readonly AtmosphereConstituent[],
  thetaDeg: number,
  ch: 0 | 2,
): number => {
  const cos = Math.cos((thetaDeg * Math.PI) / 180);
  return constituents.reduce((sum, c) => {
    if (c.phase.kind !== 'henyeyGreenstein') return sum + c.scatter[ch] * (1 + cos * cos) * 0.75;
    const g = typeof c.phase.g === 'number' ? c.phase.g : c.phase.g[ch];
    return sum + (c.scatter[ch] * (1 - g * g)) / (1 + g * g - 2 * g * cos) ** 1.5;
  }, 0);
};

describe('Mars dust colour', () => {
  // The blue sunset is a PHASE effect: the dust's diffraction lobe narrows toward
  // the blue, so blue out-scatters red only near the Sun. Lobes whose g is shared
  // across channels match the mean g but not the peak height, and stay red there.
  const mars = ATMOSPHERE_PARAMS['mars']?.constituents ?? [];
  const blueOverRed = (thetaDeg: number): number =>
    phasedScatter(mars, thetaDeg, 2) / phasedScatter(mars, thetaDeg, 0);

  it('scatters bluer than red at the Sun', () => {
    expect(blueOverRed(0)).toBeGreaterThan(1.2);
  });

  it('stays butterscotch across the open sky', () => {
    expect(blueOverRed(90)).toBeLessThan(0.7);
  });
});
