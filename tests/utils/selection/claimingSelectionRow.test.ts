import { describe, expect, it } from 'vitest';

import { claimingSelectionRow } from '../../../src/utils/selection/claimingSelectionRow';
import type { SelectionKindRow } from '../../../src/@types/engine/layer/SelectionKindRow';

const rowClaiming = (type: string, prefix: string) =>
  ({
    type,
    focusId: {
      claims: (id: string) => id.startsWith(prefix),
      decode: () => null,
      encode: () => null,
    },
  }) as unknown as SelectionKindRow;

describe('claimingSelectionRow', () => {
  const rows = [rowClaiming('galaxyCatalog', 'pgc-'), rowClaiming('starCatalog', 'star-')];

  it('returns the one claiming row, or null when none claims', () => {
    expect(claimingSelectionRow(rows, 'pgc-2')?.type).toBe('galaxyCatalog');
    expect(claimingSelectionRow(rows, 'nope')).toBeNull();
  });

  it('throws when two rows claim the same id', () => {
    expect(() => claimingSelectionRow([...rows, rowClaiming('other', 'pgc')], 'pgc-2')).toThrow(
      /claimed by more than one row \(galaxyCatalog, other\)/,
    );
  });
});
