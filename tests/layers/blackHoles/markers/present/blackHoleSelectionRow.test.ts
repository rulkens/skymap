/**
 * blackHoleSelectionRow — the three ways the Galactic Centre is reached (a
 * pick, a deep link, a focus) all land on this row, and each fails silently:
 * a stale pick resolves to nothing, a mis-spelled link falls through to the
 * galaxy decoder, and a wrong pose key frames empty space. (Arrival at
 * 30.4 r_s is pinned in `focusFraming.test.ts`.)
 */

import { describe, it, expect } from 'vitest';

import { blackHoleSelectionRow } from '../../../../../src/layers/blackHoles/markers/present/blackHoleSelectionRow';
import { GALACTIC_CENTRE_ANCHOR } from '../../../../../src/data/places/galacticCentre';
import { unpackPick } from '../../../../../src/data/selectionEncoding';
import { CONST_J2000 } from '../../../../../src/data/time/constJ2000';
import { blackHolePickCode } from '../../../../support/layerPickCodes';
import { fakePickCode } from '../../../../support/fakePickCode';

// Codes from 40 up: a row that still packs the catalog value fails the round trip.
const ROW = blackHoleSelectionRow(blackHolePickCode(fakePickCode()));
const SGR_A_STAR_REF = { type: 'blackHole', id: 'sgr-a-star' } as const;

describe('blackHoleSelectionRow', () => {
  it('refs round-trip under non-catalog codes', () => {
    const pick = unpackPick(ROW.encodePick(SGR_A_STAR_REF)!)!;
    expect(pick.sourceCode).toBeGreaterThanOrEqual(40);
    expect(ROW.pickSources).toContain(pick.sourceCode);
    expect(ROW.resolvePick(pick)).toEqual(SGR_A_STAR_REF);
  });

  it('focus id round-trips', () => {
    const focusId = ROW.focusId!;
    expect(focusId.encode(SGR_A_STAR_REF)).toBe('blackhole-sgr-a-star');
    expect(focusId.decode('blackhole-sgr-a-star')).toEqual(SGR_A_STAR_REF);
  });

  it('extracted row poses at the galactic centre', () => {
    const row = ROW.extractRow(SGR_A_STAR_REF, CONST_J2000)!;
    if (row.type !== 'blackHole') throw new Error('expected the blackHole arm');
    expect(row.positionMpc).toEqual(GALACTIC_CENTRE_ANCHOR.positionMpc);
    expect(row.driver.poseId).toBe(GALACTIC_CENTRE_ANCHOR.id);
  });
});
