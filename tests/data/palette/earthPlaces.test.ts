import { describe, it, expect } from 'vitest';
import { EARTH_PLACES } from '../../../src/data/palette/earthPlaces';
import { EOX_REGIONS } from '../../../tools/fetch/eoxRegions';

describe('EARTH_PLACES', () => {
  it('every place backed by a baked EOX region sits inside that region bbox', () => {
    // Søndermarken has no region of its own — it's a hand-picked point inside
    // the copenhagen bbox, captured separately for its sharper local imagery.
    for (const place of EARTH_PLACES) {
      const bbox = EOX_REGIONS[place.id as keyof typeof EOX_REGIONS];
      if (!bbox) continue;
      expect(place.lonDeg).toBeGreaterThanOrEqual(bbox.west);
      expect(place.lonDeg).toBeLessThanOrEqual(bbox.east);
      expect(place.latDeg).toBeGreaterThanOrEqual(bbox.south);
      expect(place.latDeg).toBeLessThanOrEqual(bbox.north);
    }
  });

  it('Søndermarken sits inside the copenhagen bbox', () => {
    const sondermarken = EARTH_PLACES.find((p) => p.id === 'sondermarken');
    const bbox = EOX_REGIONS.copenhagen;
    expect(sondermarken).toBeDefined();
    expect(sondermarken?.lonDeg).toBeGreaterThanOrEqual(bbox.west);
    expect(sondermarken?.lonDeg).toBeLessThanOrEqual(bbox.east);
    expect(sondermarken?.latDeg).toBeGreaterThanOrEqual(bbox.south);
    expect(sondermarken?.latDeg).toBeLessThanOrEqual(bbox.north);
  });
});
