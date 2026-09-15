import { describe, it, expect } from 'vitest';
import { assertSelectionRowsDisjoint } from '../../../src/utils/selection/assertSelectionRowsDisjoint';
import type { SelectionKindRow } from '../../../src/@types/engine/layer/SelectionKindRow';
import { Source } from '../../../src/data/source';

function row(
  type: string,
  pickSources: readonly (typeof Source)[keyof typeof Source][],
): SelectionKindRow {
  return {
    type,
    pickSources,
    resolvePick: () => null,
    extractRow: () => null,
  } as unknown as SelectionKindRow;
}

describe('assertSelectionRowsDisjoint', () => {
  it('passes over an empty row set', () => {
    expect(() => assertSelectionRowsDisjoint([])).not.toThrow();
  });

  it('passes when types and pick sources are all distinct', () => {
    expect(() =>
      assertSelectionRowsDisjoint([row('galaxy', [Source.SDSS]), row('star', [Source.GaiaStars])]),
    ).not.toThrow();
  });

  it('throws on a repeated pick source code', () => {
    expect(() =>
      assertSelectionRowsDisjoint([row('galaxy', [Source.SDSS]), row('star', [Source.SDSS])]),
    ).toThrow(/SDSS|1/);
  });

  it('throws on a repeated type', () => {
    expect(() =>
      assertSelectionRowsDisjoint([row('galaxy', [Source.SDSS]), row('galaxy', [Source.Glade])]),
    ).toThrow(/galaxy/);
  });
});
