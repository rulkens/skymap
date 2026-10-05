/**
 * blackHoleSearch — the palette focuses a Layer row's `id` verbatim, so the id
 * must be one the Layer's own `focusId` claims and decodes; otherwise Enter on
 * "Sgr A*" selects nothing, with no error anywhere.
 */

import { describe, it, expect } from 'vitest';

import { blackHoleSearch } from '../../../../src/layers/blackHoles/present/blackHoleSearch';
import { blackHoleSelectionRow } from '../../../../src/layers/blackHoles/present/blackHoleSelectionRow';

describe('blackHoleSearch', () => {
  it('the search row id decodes to the hole', async () => {
    const snapshots = [];
    for await (const rows of blackHoleSearch()) snapshots.push(rows);
    expect(snapshots).toHaveLength(1);
    const [row] = snapshots[0]!;

    const focusId = blackHoleSelectionRow().focusId!;
    expect(focusId.claims(row!.id)).toBe(true);
    expect(focusId.decode(row!.id)).toEqual({ type: 'blackHole', id: 'sgr-a-star' });
    expect(row!.names).toEqual(expect.arrayContaining(['Sgr A*', 'Galactic Center']));
  });
});
