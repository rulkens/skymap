import { describe, expect, it } from 'vitest';

import { ANTIQUE_REFERENCE_HEIGHT_CSS } from '../../../../src/data/rendering/antiqueLook';
import { antiquePlateTitle } from '../../../../src/utils/gpu/antiqueLook/antiquePlateTitle';

// A globe whose radius is `share` of the plate's half-height, its ground at `kmPerUnit`.
const globe = (id: string, share: number, coverage = 0.2, kmPerUnit = 50) => ({
  id,
  radiusUnits: (share * ANTIQUE_REFERENCE_HEIGHT_CSS) / 2,
  kmPerUnit,
  coverage,
});
const ground = (kmPerUnit: number) => globe('earth', 2.5, 1, kmPerUnit);
const ON = [0, 0] as const;
const AMSTERDAM = [4.9, 52.4] as const;

describe('antiquePlateTitle', () => {
  it('titles the chart by regime, blank halfway through the change', () => {
    expect(antiquePlateTitle({ cosmos: 0, globe: null, centreLonLat: null })).toEqual({
      key: 'coelum',
      weight: 1,
      frame: 1,
    });
    expect(antiquePlateTitle({ cosmos: 1, globe: null, centreLonLat: null })).toEqual({
      key: 'universe',
      weight: 1,
      frame: 1,
    });
    expect(
      antiquePlateTitle({ cosmos: 0.5, globe: null, centreLonLat: null })?.weight ?? 0,
    ).toBeCloseTo(0);
  });

  it('gives a globe its own title once it fills the plate, and never two at once', () => {
    expect(antiquePlateTitle({ cosmos: 0, globe: globe('moon', 0.6), centreLonLat: ON })).toEqual({
      key: 'luna',
      weight: 1,
      frame: 1,
    });
    expect(antiquePlateTitle({ cosmos: 0, globe: globe('moon', 0.1), centreLonLat: ON })?.key).toBe(
      'coelum',
    );
    expect(
      antiquePlateTitle({ cosmos: 0, globe: globe('moon', 0.4), centreLonLat: ON })?.weight ?? 0,
    ).toBeCloseTo(0);
    // A globe without a title of its own leaves the chart's.
    expect(
      antiquePlateTitle({ cosmos: 0, globe: globe('neptune', 3), centreLonLat: ON })?.key,
    ).toBe('coelum');
  });

  it('leaves the sky its chart title when the globe lies beside the centre', () => {
    // On the ground looking up: the globe is vast, but the centre ray misses it and it fills little.
    expect(
      antiquePlateTitle({ cosmos: 0, globe: globe('earth', 900, 0.1), centreLonLat: null })?.key,
    ).toBe('coelum');
    expect(
      antiquePlateTitle({ cosmos: 0, globe: globe('moon', 0.6, 0.15), centreLonLat: null })?.key,
    ).toBe('coelum');
  });

  it("keeps the Moon's plate from its own ground, where the Earth's sky keeps the chart", () => {
    // Earthrise: the Moon's ground across the plate's lower third, the centre ray in the sky.
    expect(
      antiquePlateTitle({ cosmos: 0, globe: globe('moon', 50, 0.3), centreLonLat: null }),
    ).toEqual({ key: 'luna', weight: 1, frame: 1 });
    expect(
      antiquePlateTitle({ cosmos: 0, globe: globe('earth', 50, 0.3), centreLonLat: null })?.key,
    ).toBe('coelum');
  });

  it("names the Earth's region under the plate's centre as the globe magnifies", () => {
    expect(
      antiquePlateTitle({ cosmos: 0, globe: globe('earth', 0.8, 0.5, 20), centreLonLat: AMSTERDAM })
        ?.key,
    ).toBe('orbis');
    expect(antiquePlateTitle({ cosmos: 0, globe: ground(4), centreLonLat: AMSTERDAM })?.key).toBe(
      'europa',
    );
    expect(antiquePlateTitle({ cosmos: 0, globe: ground(1), centreLonLat: AMSTERDAM })?.key).toBe(
      'belgium',
    );
    expect(antiquePlateTitle({ cosmos: 0, globe: ground(0.1), centreLonLat: AMSTERDAM })?.key).toBe(
      'hollandia',
    );
    expect(antiquePlateTitle({ cosmos: 0, globe: ground(4), centreLonLat: [-90, 40] })?.key).toBe(
      'americaSeptentrionalis',
    );
    // Open ocean has no region: the world map's title holds.
    expect(antiquePlateTitle({ cosmos: 0, globe: ground(4), centreLonLat: [-35, 30] })?.key).toBe(
      'orbis',
    );
    // Off the globe (the centre ray misses it) there is no region either.
    expect(
      antiquePlateTitle({ cosmos: 0, globe: globe('earth', 3, 0.8, 4), centreLonLat: null })?.key,
    ).toBe('orbis');
  });

  it('crosses a region edge through a blank cartouche rather than swapping titles', () => {
    const at = (lon: number) =>
      antiquePlateTitle({ cosmos: 0, globe: ground(4), centreLonLat: [lon, 50] });
    expect(at(10)).toEqual({ key: 'europa', weight: 1, frame: 1 });
    expect(at(38)?.weight ?? 0).toBeLessThan(0.05);
    expect(at(39.9)?.key).toBe('orbis');
  });

  it('wraps longitude, so the antimeridian side of a box still matches', () => {
    expect(
      antiquePlateTitle({ cosmos: 0, globe: ground(4), centreLonLat: [100 + 360, 40] })?.key,
    ).toBe('asia');
  });

  it('fades the cartouche itself only where its design changes', () => {
    // Sky to Moon: strapwork to tablet, so the frame passes through nothing with the title.
    const moon = (share: number) =>
      antiquePlateTitle({ cosmos: 0, globe: globe('moon', share), centreLonLat: ON });
    const swaps = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6].map(moon);
    expect(Math.min(...swaps.map((t) => t.frame))).toBeLessThan(0.05);
    for (const t of swaps) expect(t.frame).toBeCloseTo(t.weight);
    // Earth to its continent: both scrollwork, so only the title fades.
    const at = (kmPerUnit: number) =>
      antiquePlateTitle({ cosmos: 0, globe: ground(kmPerUnit), centreLonLat: AMSTERDAM });
    for (const km of [40, 30, 20, 10, 5]) expect(at(km).frame).toBe(1);
  });
});
