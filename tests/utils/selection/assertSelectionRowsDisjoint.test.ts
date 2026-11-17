import { describe, it, expect } from 'vitest';
import { assertSelectionRowsDisjoint } from '../../../src/utils/selection/assertSelectionRowsDisjoint';
import type { SelectionKindRow } from '../../../src/@types/engine/layer/SelectionKindRow';

function row(type: string, pickSources: readonly number[]): SelectionKindRow {
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
    expect(() => assertSelectionRowsDisjoint([row('galaxy', [1]), row('star', [2])])).not.toThrow();
  });

  it('throws on a repeated pick source code', () => {
    expect(() => assertSelectionRowsDisjoint([row('galaxy', [1]), row('star', [1])])).toThrow(
      /"1"/,
    );
  });

  it('throws on a repeated type', () => {
    expect(() => assertSelectionRowsDisjoint([row('galaxy', [1]), row('galaxy', [3])])).toThrow(
      /galaxy/,
    );
  });
});
