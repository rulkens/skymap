import { describe, expect, it } from 'vitest';
import { detailCardTable } from '../../../src/components/InfoCard/detailCardTable';
import { APP_COMPOSITION } from '../../../src/compositions/app';
import { SELECTION_KINDS } from '../../../src/data/selection/selectionKinds';

describe('detailCardTable', () => {
  it('every FocusableTargetType has a card once the app composition is folded', () => {
    const table = detailCardTable(APP_COMPOSITION.layers);

    for (const type of SELECTION_KINDS) {
      expect(table[type]).toBeDefined();
      // A component is a function OR a memo/exotic object (BodyDetailCardContainer
      // is `memo(...)`'d) — assert it's set rather than pin one runtime shape.
      expect(table[type].Detail).toBeDefined();
      expect(table[type].Compact).toBeDefined();
    }
  });

  it('a composition missing an arm throws naming the arm', () => {
    expect(() => detailCardTable([])).toThrow(/zoneOfAvoidance/);
  });
});
