import { describe, expect, it } from 'vitest';
import { detailCardTable } from '../../../src/components/InfoCard/detailCardTable';
import { APP_COMPOSITION } from '../../../src/compositions/app';

describe('detailCardTable', () => {
  it('every FocusableTargetType has a card once the app composition is folded', () => {
    const table = detailCardTable(APP_COMPOSITION.layers);
    const known = [
      'galaxyCatalog',
      'structure',
      'milkyWay',
      'zoneOfAvoidance',
      'body',
      'starCatalog',
    ] as const;

    for (const type of known) {
      expect(table[type]).toBeDefined();
      expect(typeof table[type].Detail).toBe('function');
      expect(typeof table[type].Compact).toBe('function');
    }
  });

  it('a composition missing an arm throws naming the arm', () => {
    expect(() => detailCardTable([])).toThrowError(/zoneOfAvoidance/);
  });
});
