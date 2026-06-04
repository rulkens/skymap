import { describe, expect, it } from 'vitest';
import { seedEntryFromMeandata } from '../../../tools/famous/famousSeedFromHyperleda';
import type { HyperLedaMeandataRow } from '../../../tools/parsers/hyperledaMeandata';

// Two real HyperLEDA rows (NGC 3166 + NGC 3169) drive these cases: 3166 has no
// redshift-independent modulus so distance falls back to v3k/H0, and 3169's
// V-band error is large enough that the band must be dropped.  Both exercise
// the exact pipeline formulas the script reuses (mergeIntoFamousEntry).

const NGC3166: HyperLedaMeandataRow = {
  objname: 'NGC3166',
  pgc: '29814',
  objtype: 'G',
  al2000: 153.4404105 / 15,
  de2000: 3.4248246,
  type: 'S0-a',
  logd25: 1.65,
  logr25: 0.2,
  pa: 87.2,
  bt: 11.42,
  e_bt: 0.13,
  vt: 10.62,
  e_vt: 0.13,
  kt: 7.22,
  e_kt: 0.06,
  mod0: NaN,
  e_mod0: NaN,
  v3k: 1685,
  mabs: -20.3,
};

const NGC3169: HyperLedaMeandataRow = {
  objname: 'NGC3169',
  pgc: '29855',
  objtype: 'G',
  al2000: 153.5616667 / 15,
  de2000: 3.4665278,
  type: 'Sa',
  logd25: 1.64,
  logr25: 0.21,
  pa: 48.7,
  bt: 11.25,
  e_bt: 0.09,
  vt: 10.9,
  e_vt: 0.84, // > 0.5 → magV must be dropped
  kt: 7.29,
  e_kt: 0.05,
  mod0: 31.52,
  e_mod0: 0.03,
  v3k: 1584,
  mabs: -20.62,
};

describe('seedEntryFromMeandata', () => {
  it('derives id/names and the canonical field order, distance via v3k fallback', () => {
    const entry = seedEntryFromMeandata('NGC3166', NGC3166)!;
    expect(entry).not.toBeNull();
    expect(entry.id).toBe('ngc3166');
    expect(entry.names).toEqual(['NGC 3166']);
    expect(entry.type).toBe('S0-a');
    // No mod0 → Hubble flow v3k / 70.
    expect(entry.distanceMpc as number).toBeCloseTo(1685 / 70, 3);
    expect(entry.magV as number).toBeCloseTo(10.62, 2);
    // Canonical order from orderEntryFields.
    expect(Object.keys(entry).slice(0, 8)).toEqual([
      'id',
      'names',
      'ra',
      'dec',
      'distanceMpc',
      'diameterKpc',
      'type',
      'description',
    ]);
    // Description is left blank for the human to fill from Wikipedia.
    expect(entry.description).toBe('');
  });

  it('uses mod0 when present and drops a magnitude band with error > 0.5', () => {
    const entry = seedEntryFromMeandata('NGC 3169', NGC3169)!;
    expect(entry.id).toBe('ngc3169');
    // mod0 = 31.52 → 10^((31.52-25)/5).
    expect(entry.distanceMpc as number).toBeCloseTo(Math.pow(10, (31.52 - 25) / 5), 3);
    expect(entry).not.toHaveProperty('magV'); // e_vt = 0.84 rejected
    expect(entry.magB as number).toBeCloseTo(11.25, 2);
    expect(entry.magK as number).toBeCloseTo(7.29, 2);
  });
});
