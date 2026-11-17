import { describe, expect, it } from 'vitest';
import { zoneOfAvoidanceSelectionRow } from '../../../../src/layers/zoneOfAvoidance/selection/zoneOfAvoidanceSelectionRow';
import { unpackPick } from '../../../../src/data/selectionEncoding';
import { zoneOfAvoidancePickCode } from '../../../support/layerPickCodes';

// Codes from 40 up: a row that still packs the catalog value fails the round trip.
const row = zoneOfAvoidanceSelectionRow(zoneOfAvoidancePickCode());
const REF = { type: 'zoneOfAvoidance' } as const;

describe('zoneOfAvoidanceSelectionRow', () => {
  it('refs round-trip under allocator codes', () => {
    const pick = unpackPick(row.encodePick(REF)!)!;
    expect(row.pickSources).toEqual([pick.sourceCode]);
    expect(row.resolvePick(pick)).toEqual(REF);
  });
});
