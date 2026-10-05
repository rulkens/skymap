import { describe, it, expect } from 'vitest';
import { FITTED_BODIES } from '../../../tools/bodies/fittedBodies';
import { HORIZONS_BODIES } from '../../../tools/bodies/horizonsBodies';

const TODAYS_IDS = [
  'mercury',
  'venus',
  'earth',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
  'io',
  'europa',
  'ganymede',
  'callisto',
  'mimas',
  'enceladus',
  'tethys',
  'dione',
  'rhea',
  'titan',
  'iapetus',
  'triton',
  'proteus',
  'miranda',
  'ariel',
  'umbriel',
  'titania',
  'oberon',
];

describe('Horizons tables', () => {
  it('fits exactly the planets and moons fetched before spans existed', () => {
    expect(FITTED_BODIES.map((b) => b.id)).toEqual(TODAYS_IDS);
  });

  it('gives every fitted id a fetch row, each over 1900-2100 as position', () => {
    for (const f of FITTED_BODIES) {
      const row = HORIZONS_BODIES.find((b) => b.id === f.id);
      expect(row?.span).toEqual(['1900-01-01', '2100-01-01']);
      expect(row?.vectors).toBe('position');
    }
  });

  it('keeps the raw CSV path keys and steps of the original table', () => {
    const byId = Object.fromEntries(HORIZONS_BODIES.map((b) => [b.id, b]));
    expect(byId.io).toMatchObject({ target: '501', centre: '500@599', stepMinutes: 144 });
    expect(byId.mimas).toMatchObject({ target: '601', centre: '500@699', stepMinutes: 80 });
    expect(byId.mercury).toMatchObject({ target: '199', centre: '500@10', stepMinutes: 1440 });
    expect(byId.oberon).toMatchObject({ target: '704', centre: '500@799', stepMinutes: 720 });
  });
});
