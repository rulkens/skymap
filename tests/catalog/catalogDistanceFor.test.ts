import { describe, it, expect } from 'vitest';
import { catalogDistanceFor } from '../../tools/catalog/catalogDistanceFor';
import type {
  Cf4CatalogIndex,
  Cf4Record,
} from '../../tools/parsers/cosmicflows4';
import type { HyperLedaShapeMap } from '../../tools/parsers/glade';
import type { ParsedRecord } from '../../tools/parsers/common';
import { Source } from '../../src/data/sources';

/** Minimal ParsedRecord-shaped fixture; unused fields default to NaN/0/null. */
function rec(partial: Partial<ParsedRecord>): ParsedRecord {
  return {
    source: Source.TwoMRS,
    objID: 0n,
    ra: 0,
    dec: 0,
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
    ...partial,
  };
}

function cf4Index(records: ReadonlyArray<Cf4Record>): Cf4CatalogIndex {
  const byPgc = new Map<number, Cf4Record>();
  for (const r of records) {
    if (r.pgc !== null) byPgc.set(r.pgc, r);
  }
  return { byPgc };
}

describe('catalogDistanceFor — CF4 by PGC', () => {
  it('returns the CF4 distance when the record carries a PGC CF4 lists', () => {
    const record = rec({ objID: 2557n }); // PGC 2557 = M31
    const cf4 = cf4Index([
      { pgc: 2557, distMpc: 0.785, eDistMpc: 0.04, raDeg: 10.68, deDeg: 41.27 },
    ]);
    const out = catalogDistanceFor(record, cf4, new Map());
    expect(out).not.toBeNull();
    expect(out!.distMpc).toBeCloseTo(0.785, 3);
    expect(out!.source).toBe('cf4');
  });

  it('does NOT consult byMassId — CF4 has no 2MASS XSC column (PGC-only by design)', () => {
    // The record carries a 2MASS XSC ID but no PGC. CF4 should miss
    // because there is no 2MASS index. Per the parser docstring, the
    // 2MASS branch from the original plan was always dead code; this
    // test pins that design decision so a future refactor can't
    // silently re-introduce a phantom byMassId lookup.
    const record = rec({ objID: 0n, massId: '00424433+4116075' });
    const cf4 = cf4Index([
      { pgc: 2557, distMpc: 0.785, eDistMpc: 0.04, raDeg: 10.68, deDeg: 41.27 },
    ]);
    const out = catalogDistanceFor(record, cf4, new Map());
    expect(out).toBeNull();
  });
});

describe('catalogDistanceFor — HyperLEDA fallback', () => {
  it('uses HyperLEDA mod0 when CF4 has no match for the PGC', () => {
    const record = rec({ objID: 12345n });
    const hyperLeda: HyperLedaShapeMap = new Map([
      [
        '12345',
        { pa: 0, axisRatio: 1, mod0: 28.0, e_mod0: 0.3 },
      ],
    ]);
    const out = catalogDistanceFor(record, cf4Index([]), hyperLeda);
    expect(out).not.toBeNull();
    // d = 10^((28-25)/5) = 10^0.6 ≈ 3.98 Mpc
    expect(out!.distMpc).toBeCloseTo(3.98, 1);
    expect(out!.source).toBe('hyperleda');
  });

  it('skips HyperLEDA rows where mod0 is NaN (the common sparse case)', () => {
    const record = rec({ objID: 12345n });
    const hyperLeda: HyperLedaShapeMap = new Map([
      ['12345', { pa: 0, axisRatio: 1, mod0: NaN, e_mod0: NaN }],
    ]);
    const out = catalogDistanceFor(record, cf4Index([]), hyperLeda);
    expect(out).toBeNull();
  });

  it('returns null when both CF4 and HyperLEDA miss', () => {
    const record = rec({ objID: 999999n });
    const out = catalogDistanceFor(record, cf4Index([]), new Map());
    expect(out).toBeNull();
  });

  it('prefers CF4 over HyperLEDA when both have the PGC', () => {
    const record = rec({ objID: 2557n });
    const cf4 = cf4Index([
      { pgc: 2557, distMpc: 0.785, eDistMpc: 0.04, raDeg: 10.68, deDeg: 41.27 },
    ]);
    const hyperLeda: HyperLedaShapeMap = new Map([
      ['2557', { pa: 0, axisRatio: 1, mod0: 30.0, e_mod0: 0.5 }],
    ]);
    const out = catalogDistanceFor(record, cf4, hyperLeda);
    expect(out!.source).toBe('cf4');
    expect(out!.distMpc).toBeCloseTo(0.785, 3);
  });
});

describe('catalogDistanceFor — no-PGC records', () => {
  it('returns null when objID is 0n (no PGC) and no other key available', () => {
    const record = rec({ objID: 0n });
    const cf4 = cf4Index([
      { pgc: 2557, distMpc: 0.785, eDistMpc: 0.04, raDeg: 10.68, deDeg: 41.27 },
    ]);
    const out = catalogDistanceFor(record, cf4, new Map());
    expect(out).toBeNull();
  });
});
