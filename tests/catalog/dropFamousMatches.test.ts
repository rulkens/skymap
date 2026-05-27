import { describe, it, expect } from 'vitest';
import { dropFamousMatches } from '../../tools/catalog/dropFamousMatches';
import { Source } from '../../src/data/sources';
import type { ParsedRecord } from '../../tools/parsers/common';

function rec(ra: number, dec: number): ParsedRecord {
  return {
    source: Source.TwoMRS,
    objID: 0n,
    ra,
    dec,
    z: 0,
    spectroscopicZ: 0,
    magU: NaN,
    magG: NaN,
    magR: NaN,
    magI: NaN,
    magZ: NaN,
    axisRatio: null,
    positionAngleDeg: null,
    diameterKpc: null,
    classByte: 0,
    parentSurveyByte: 0,
  };
}

describe('dropFamousMatches', () => {
  it('drops records within the threshold of a famous galaxy', () => {
    const famous = [{ ra: 10.6847, dec: 41.2687 }]; // M31
    const records = [
      rec(10.6847, 41.2687), // exact match → drop
      rec(10.6849, 41.2685), // ~1 arcsec away → drop at 30" threshold
      rec(180, 0), // far away → keep
    ];
    const { kept, dropped } = dropFamousMatches(records, famous, 30);
    expect(dropped).toBe(2);
    expect(kept).toHaveLength(1);
    expect(kept[0]!.ra).toBe(180);
  });

  it('keeps records just outside the threshold', () => {
    const famous = [{ ra: 10.6847, dec: 41.2687 }];
    // 60 arcsec north of M31 — outside a 30" threshold
    const records = [rec(10.6847, 41.2687 + 60 / 3600)];
    const { kept, dropped } = dropFamousMatches(records, famous, 30);
    expect(dropped).toBe(0);
    expect(kept).toHaveLength(1);
  });

  it('returns input unchanged when no famous positions are supplied', () => {
    const records = [rec(10.6847, 41.2687), rec(180, 0)];
    const { kept, dropped } = dropFamousMatches(records, [], 30);
    expect(dropped).toBe(0);
    expect(kept).toBe(records);
  });

  it('handles multiple famous positions correctly', () => {
    const famous = [
      { ra: 10.6847, dec: 41.2687 }, // M31
      { ra: 8.3004, dec: 48.5087 }, // NGC 147
    ];
    const records = [
      rec(10.6847, 41.2687), // M31 → drop
      rec(8.3005, 48.5088), // NGC 147 → drop
      rec(9.7417, 48.3372), // NGC 185 not in famous → keep
    ];
    const { kept, dropped } = dropFamousMatches(records, famous, 30);
    expect(dropped).toBe(2);
    expect(kept).toHaveLength(1);
  });

  it('compresses RA separation by cos(dec) for high-latitude matches', () => {
    // At dec = 80°, 1° of RA spans only cos(80°) ≈ 0.174° on the sky.
    // A record 0.05° east in RA at dec=80 should be ~31" away on the sky,
    // just outside a 30" threshold.
    const famous = [{ ra: 100, dec: 80 }];
    // Inside: 0.04° east → ~25" → drop
    const insideRec = rec(100.04, 80);
    // Outside: 0.06° east → ~38" → keep
    const outsideRec = rec(100.06, 80);
    const { kept, dropped } = dropFamousMatches([insideRec, outsideRec], famous, 30);
    expect(dropped).toBe(1);
    expect(kept).toHaveLength(1);
    expect(kept[0]!.ra).toBeCloseTo(100.06, 4);
  });
});
