/**
 * milkyWaySearch — the palette focuses a Layer row's `id` verbatim, so it must be
 * one the Layer's own `focusId` claims; otherwise Enter on "Milky Way" selects nothing.
 */

import { describe, it, expect } from 'vitest';

import { milkyWaySearch } from '../../../../../src/layers/milkyWay/card/present/milkyWaySearch';
import { milkyWaySelectionRow } from '../../../../../src/layers/milkyWay/card/present/milkyWaySelectionRow';
import { MILKY_WAY_NAMES } from '../../../../../src/layers/milkyWay/card/data/milkyWayNames';

describe('milkyWaySearch', () => {
  it('yields one primary row whose id the selection row decodes, named as before', async () => {
    const snapshots = [];
    for await (const rows of milkyWaySearch()) snapshots.push(rows);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toHaveLength(1);
    const [row] = snapshots[0]!;

    expect(row!.class).toBe('primary');
    expect(row!.names).toEqual(MILKY_WAY_NAMES);
    const focusId = milkyWaySelectionRow().focusId!;
    expect(focusId.claims(row!.id)).toBe(true);
    expect(focusId.decode(row!.id)).toEqual({ type: 'milkyWay' });
  });
});
