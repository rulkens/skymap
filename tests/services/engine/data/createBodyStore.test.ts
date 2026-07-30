import { describe, it, expect } from 'vitest';
import { createBodyStore } from '../../../../src/services/engine/data/createBodyStore';
import type { StarBody } from '../../../../src/@types/scene/StarBody';
import type { PlanetBody } from '../../../../src/@types/scene/PlanetBody';
import type { EarthBody } from '../../../../src/@types/scene/EarthBody';

const star = (id: string): StarBody => ({
  id,
  label: id,
  absMag: 4.83,
  color: [1, 1, 1],
  radiusKm: 696340,
});

const planet = (id: string): PlanetBody => ({
  id,
  label: id,
  radiusKm: 6371,
  albedo: [0.3, 0.3, 0.3],
});

const earthRecord: EarthBody = {
  id: 'earth',
  label: 'Earth',
  radiusKm: 6371,
};

describe('createBodyStore', () => {
  it('starts with empty stars/planets and null earth', () => {
    const s = createBodyStore();
    expect(s.stars).toEqual([]);
    expect(s.planets).toEqual([]);
    expect(s.earth).toBeNull();
  });

  it('setEarth then earth getter returns the record', () => {
    const s = createBodyStore();
    s.setEarth(earthRecord);
    expect(s.earth).toBe(earthRecord);
  });

  it('setStars / setPlanets round-trip with identity preserved', () => {
    const s = createBodyStore();
    const stars = [star('sun')];
    const planets = [planet('mars')];
    s.setStars(stars);
    s.setPlanets(planets);
    expect(s.stars).toBe(stars);
    expect(s.planets).toBe(planets);
  });

  it('setEarth(null) clears the earth', () => {
    const s = createBodyStore();
    s.setEarth(earthRecord);
    s.setEarth(null);
    expect(s.earth).toBeNull();
  });
});
