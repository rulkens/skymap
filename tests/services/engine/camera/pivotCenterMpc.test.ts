/**
 * pivotCenterMpc — which focus rows give `eyeAltitudeMpc` a centre to measure
 * against, and where that centre comes from.
 *
 * The split mirrors `pivotRadiusMpc`: a body/star is a surface the camera can
 * stand off from, so it yields a centre; a galaxy, structure, or the Milky
 * Way is a volume, so it yields `null`. The body/star split itself is the
 * risk this file guards: a body's centre MUST come from the live
 * `deriveBodyStates` snapshot (it moves under the sim clock), never the
 * row's own snapshot-at-select-time `positionMpc` — getting that backwards
 * would silently re-introduce the staleness this whole migration exists to
 * fix, just one layer down.
 */

import { describe, it, expect } from 'vitest';

import { pivotCenterMpc } from '../../../../src/services/engine/camera/pivotCenterMpc';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { makeGalaxyRow } from '../../../fixtures/makeGalaxyRow';
import type { SelectionRow } from '../../../../src/@types/engine/SelectionRow';

describe('pivotCenterMpc', () => {
  it('resolves a body row to its LIVE position — not the row’s own (stale) positionMpc snapshot', () => {
    // The row's stamped positionMpc is a decoy, deliberately wrong, so a
    // regression that reads it instead of the live snapshot fails loudly.
    const row: SelectionRow = {
      type: 'body',
      id: 'earth',
      label: 'Earth',
      positionMpc: [999, 999, 999],
      radiusKm: 6371,
    };
    const expected = deriveBodyStates(CONST_J2000).get('earth')!.positionMpc;
    expect(pivotCenterMpc(row, CONST_J2000)).toEqual(expected);
  });

  it('resolves a star row to its own fixed positionMpc — a star has no live snapshot', () => {
    const row: SelectionRow = {
      type: 'star',
      index: 7,
      positionMpc: [1, 2, 3],
      absMag: 4,
      bpRp: 0.6,
      radiusKm: 696340,
    };
    expect(pivotCenterMpc(row, CONST_J2000)).toEqual([1, 2, 3]);
  });

  it('yields null for a galaxy — a volume flown into, never a pivot centre', () => {
    expect(pivotCenterMpc(makeGalaxyRow({ diameterKpc: 30 }), CONST_J2000)).toBeNull();
  });

  it('yields null for the Milky Way and for no focus at all', () => {
    expect(pivotCenterMpc({ type: 'milkyWay' }, CONST_J2000)).toBeNull();
    expect(pivotCenterMpc(null, CONST_J2000)).toBeNull();
  });
});
