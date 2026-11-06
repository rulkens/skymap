import { describe, expect, it } from 'vitest';
import { milkyWaySelectionRow } from '../../../../../src/layers/milkyWay/card/present/milkyWaySelectionRow';
import { unpackPick } from '../../../../../src/data/selectionEncoding';
import { fakePickCode } from '../../../../support/fakePickCode';
import { milkyWayPickCode } from '../../../../support/layerPickCodes';

// Codes from 40 up: a row that still packs the catalog value fails the round trip.
const row = milkyWaySelectionRow(milkyWayPickCode(fakePickCode()));
const REF = { type: 'milkyWay' } as const;

describe('milkyWaySelectionRow', () => {
  it('refs round-trip under non-catalog codes', () => {
    const pick = unpackPick(row.encodePick(REF)!)!;
    expect(pick.sourceCode).toBeGreaterThanOrEqual(40);
    expect(row.pickSources).toEqual([pick.sourceCode]);
    expect(row.resolvePick(pick)).toEqual(REF);
  });
});
