import { describe, expect, it } from 'vitest';
import { poiIdOf } from '../../../../src/services/engine/helpers/poiIdOf';
import { Source } from '../../../../src/data/sources';
import type { Selection } from '../../../../src/@types/engine/subsystems/Selection';

describe('poiIdOf', () => {
  it('returns null for a null selection', () => {
    expect(poiIdOf(null)).toBeNull();
  });

  it('returns the id for a POI selection', () => {
    const sel: Selection = { kind: 'poi', id: 'virgo' };
    expect(poiIdOf(sel)).toBe('virgo');
  });

  it('returns null for a non-POI (galaxy) selection', () => {
    const sel: Selection = { kind: 'galaxy', source: Source.SDSS, localIdx: 7 };
    expect(poiIdOf(sel)).toBeNull();
  });
});
