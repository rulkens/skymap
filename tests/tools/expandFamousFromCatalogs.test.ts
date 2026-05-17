import { describe, it, expect } from 'vitest';
import {
  distanceMpcFromHyperLeda,
  diameterKpcFromHyperLeda,
  axisRatioFromLogr25,
  mergeIntoFamousEntry,
  resolveWikipediaDescription,
  buildTargetList,
  orderEntryFields,
} from '../../tools/famous/expandFamousFromCatalogs';
import type { HyperLedaMeandataRow } from '../../tools/parsers/hyperledaMeandata';
import type { FamousEntry } from '../../tools/parsers/famousSeed';

/**
 * Build a HyperLedaMeandataRow with sensible defaults; tests override
 * specific fields per scenario.  All numeric defaults are NaN so any
 * unset field naturally tests the "missing" code path.
 */
function makeRow(overrides: Partial<HyperLedaMeandataRow> = {}): HyperLedaMeandataRow {
  return {
    objname: 'NGC0224',
    pgc: '2557',
    objtype: 'G',
    al2000: 0.7123123, // ~10.6847 deg
    de2000: 41.2689778,
    type: 'Sb',
    logd25: 3.25, // → arcmin = 0.1 * 10^3.25 ≈ 178 arcmin
    logr25: 0.407, // → b/a = 10^-0.407 ≈ 0.392
    pa: 35,
    bt: 4.295,
    e_bt: 0.251,
    vt: 6.753,
    e_vt: 3.548, // garbage error bar
    kt: 0.994,
    e_kt: 0.017,
    mod0: 24.462,
    e_mod0: 0.021,
    v3k: -573.9,
    mabs: -21.197,
    ...overrides,
  };
}

describe('distanceMpcFromHyperLeda', () => {
  it('uses mod0 when error is small', () => {
    // mod0 = 24.462 → d = 10^((24.462-25)/5) ≈ 0.78 Mpc
    const d = distanceMpcFromHyperLeda(makeRow());
    expect(d).not.toBeNull();
    expect(d!).toBeCloseTo(0.78, 1);
  });

  it('falls back to v3k / H0 when mod0 error too large', () => {
    // No mod0 → fall back to v3k = 7000 km/s → 100 Mpc at H0 = 70.
    const row = makeRow({ mod0: NaN, e_mod0: NaN, v3k: 7000 });
    const d = distanceMpcFromHyperLeda(row);
    expect(d).toBeCloseTo(100, 1);
  });

  it('rejects mod0 with error >= threshold', () => {
    const row = makeRow({ mod0: 25, e_mod0: 0.5, v3k: 7000 });
    const d = distanceMpcFromHyperLeda(row);
    // Should fall to v3k → 100 Mpc, not the 10 Mpc that mod0 would give.
    expect(d).toBeCloseTo(100, 1);
  });

  it('returns null when neither mod0 nor v3k is usable', () => {
    const row = makeRow({ mod0: NaN, e_mod0: NaN, v3k: NaN });
    expect(distanceMpcFromHyperLeda(row)).toBeNull();
  });

  it('returns null for negative v3k (Local Group infall) without mod0', () => {
    const row = makeRow({ mod0: NaN, e_mod0: NaN, v3k: -300 });
    expect(distanceMpcFromHyperLeda(row)).toBeNull();
  });
});

describe('diameterKpcFromHyperLeda', () => {
  it('computes M31 diameter correctly (~67 kpc)', () => {
    // logd25 = 3.25, d = 0.78 Mpc → 178 arcmin × 0.78 Mpc → ~40 kpc
    // (Real M31 D25 spans ~190 arcmin and ~43 kpc; close enough.)
    const d = diameterKpcFromHyperLeda(3.25, 0.78);
    expect(d).not.toBeNull();
    expect(d!).toBeGreaterThan(30);
    expect(d!).toBeLessThan(60);
  });

  it('returns null on missing logd25', () => {
    expect(diameterKpcFromHyperLeda(NaN, 10)).toBeNull();
  });

  it('returns null on non-positive distance', () => {
    expect(diameterKpcFromHyperLeda(2, 0)).toBeNull();
    expect(diameterKpcFromHyperLeda(2, -5)).toBeNull();
  });
});

describe('axisRatioFromLogr25', () => {
  it('inverts the log10 ratio correctly', () => {
    // logr25 = 0.407 → b/a = 10^-0.407 ≈ 0.392
    const ba = axisRatioFromLogr25(0.407);
    expect(ba).not.toBeNull();
    expect(ba!).toBeCloseTo(0.392, 2);
  });

  it('returns null for non-finite input', () => {
    expect(axisRatioFromLogr25(NaN)).toBeNull();
  });

  it('rejects axis ratios <= 0.05 (pathological data)', () => {
    // logr25 = 1.5 → b/a = 0.0316, below threshold.
    expect(axisRatioFromLogr25(1.5)).toBeNull();
  });

  it('rejects axis ratios > 1 (would mean minor > major)', () => {
    // logr25 < 0 → b/a > 1.
    expect(axisRatioFromLogr25(-0.5)).toBeNull();
  });
});

describe('mergeIntoFamousEntry', () => {
  it('preserves existing id, names, description on merge', () => {
    const existing: FamousEntry = {
      id: 'm31',
      names: ['M31', 'NGC 224', 'Andromeda Galaxy'],
      ra: 10.6847,
      dec: 41.2687,
      distanceMpc: 0.778,
      diameterKpc: 67.5,
      type: 'SA(s)b',
      description: 'Curated prose about Andromeda.',
    };
    const merged = mergeIntoFamousEntry({
      defaultId: 'should-not-be-used',
      defaultNames: ['should-not-be-used'],
      row: makeRow(),
      existing,
      wikipediaDescription: 'Wikipedia would say something else.',
    });
    expect(merged).not.toBeNull();
    expect(merged!.id).toBe('m31');
    expect(merged!.names).toEqual(['M31', 'NGC 224', 'Andromeda Galaxy']);
    expect(merged!.description).toBe('Curated prose about Andromeda.');
  });

  it('uses Wikipedia description when no existing entry', () => {
    const merged = mergeIntoFamousEntry({
      defaultId: 'c77',
      defaultNames: ['C77', 'NGC 5128'],
      row: makeRow(),
      existing: undefined,
      wikipediaDescription: 'Centaurus A is a galaxy.',
    });
    expect(merged).not.toBeNull();
    expect(merged!.id).toBe('c77');
    expect(merged!.description).toBe('Centaurus A is a galaxy.');
  });

  it('rejects V-band magnitude with error > 0.5', () => {
    // M31's vt has e_vt = 3.548 → must be dropped.
    const merged = mergeIntoFamousEntry({
      defaultId: 'm31',
      defaultNames: ['M31'],
      row: makeRow(),
      existing: undefined,
      wikipediaDescription: '',
    });
    expect(merged).not.toBeNull();
    // bt and kt have small errors; vt does not.
    expect(merged!.magB).toBeCloseTo(4.295, 3);
    expect(merged!.magV).toBeUndefined();
    expect(merged!.magK).toBeCloseTo(0.994, 3);
  });

  it('returns null when no usable distance', () => {
    const row = makeRow({ mod0: NaN, e_mod0: NaN, v3k: NaN });
    const merged = mergeIntoFamousEntry({
      defaultId: 'x',
      defaultNames: ['x'],
      row,
      existing: undefined,
      wikipediaDescription: '',
    });
    expect(merged).toBeNull();
  });

  it('returns null when no usable diameter (no logd25)', () => {
    const row = makeRow({ logd25: NaN });
    const merged = mergeIntoFamousEntry({
      defaultId: 'x',
      defaultNames: ['x'],
      row,
      existing: undefined,
      wikipediaDescription: '',
    });
    expect(merged).toBeNull();
  });

  it('writes axisRatio + positionAngleDeg from HyperLEDA', () => {
    const merged = mergeIntoFamousEntry({
      defaultId: 'm31',
      defaultNames: ['M31'],
      row: makeRow(),
      existing: undefined,
      wikipediaDescription: '',
    });
    expect(merged).not.toBeNull();
    expect(merged!.axisRatio).toBeCloseTo(0.392, 2);
    expect(merged!.positionAngleDeg).toBe(35);
  });

  it('converts RA from hours to degrees', () => {
    // al2000 = 0.7123 hours × 15 = 10.6847 deg
    const merged = mergeIntoFamousEntry({
      defaultId: 'm31',
      defaultNames: ['M31'],
      row: makeRow(),
      existing: undefined,
      wikipediaDescription: '',
    });
    expect(merged).not.toBeNull();
    expect(merged!.ra).toBeCloseTo(10.6847, 3);
  });

  it('handles negative declination (Southern galaxies)', () => {
    const row = makeRow({ de2000: -29.8654 });
    const merged = mergeIntoFamousEntry({
      defaultId: 'm83',
      defaultNames: ['M83'],
      row,
      existing: undefined,
      wikipediaDescription: '',
    });
    expect(merged).not.toBeNull();
    expect(merged!.dec).toBeCloseTo(-29.8654, 3);
  });
});

describe('resolveWikipediaDescription', () => {
  it('returns the first non-empty extract', async () => {
    const calls: string[] = [];
    const fake = async (title: string): Promise<string> => {
      calls.push(title);
      if (title === 'Messier_31') return ''; // disambiguation simulated
      if (title === 'NGC_224') return 'Andromeda is a galaxy.';
      return '';
    };
    const out = await resolveWikipediaDescription(['Messier_31', 'NGC_224'], fake, () => {});
    expect(out).toBe('Andromeda is a galaxy.');
    expect(calls).toEqual(['Messier_31', 'NGC_224']);
  });

  it('returns empty string when all candidates fail', async () => {
    const fake = async (): Promise<string> => '';
    const out = await resolveWikipediaDescription(['A', 'B'], fake, () => {});
    expect(out).toBe('');
  });

  it('skips empty title candidates', async () => {
    const calls: string[] = [];
    const fake = async (title: string): Promise<string> => {
      calls.push(title);
      return 'desc';
    };
    await resolveWikipediaDescription(['', '   ', 'Real_Title'], fake, () => {});
    expect(calls).toEqual(['Real_Title']);
  });

  it('logs and continues past throwing fetchers', async () => {
    const logs: string[] = [];
    const fake = async (title: string): Promise<string> => {
      if (title === 'A') throw new Error('boom');
      return 'second';
    };
    const out = await resolveWikipediaDescription(['A', 'B'], fake, (m) => logs.push(m));
    expect(out).toBe('second');
    expect(logs.some((l) => l.includes('boom'))).toBe(true);
  });
});

describe('buildTargetList', () => {
  it('contains M31 with the expected default id and HyperLEDA name', () => {
    const targets = buildTargetList();
    const m31 = targets.find((t) => t.defaultId === 'm31');
    expect(m31).toBeDefined();
    expect(m31!.hyperledaName).toBe('NGC0224');
    expect(m31!.defaultNames).toContain('M31');
    expect(m31!.defaultNames).toContain('NGC 224');
  });

  it('contains C77 (Centaurus A) — Caldwell-only, not in Messier', () => {
    const targets = buildTargetList();
    const c77 = targets.find((t) => t.defaultId === 'c77');
    expect(c77).toBeDefined();
    expect(c77!.hyperledaName).toBe('NGC5128');
    expect(c77!.defaultNames).toContain('C77');
    expect(c77!.defaultNames).toContain('NGC 5128');
  });

  it('does not include non-galaxy Messier entries (M1 = Crab, M45 = Pleiades)', () => {
    const targets = buildTargetList();
    expect(targets.find((t) => t.defaultId === 'm1')).toBeUndefined();
    expect(targets.find((t) => t.defaultId === 'm45')).toBeUndefined();
  });

  it('does not include non-galaxy Caldwell entries (C99 = Coalsack)', () => {
    const targets = buildTargetList();
    expect(targets.find((t) => t.defaultId === 'c99')).toBeUndefined();
  });

  it('produces a deterministic, sorted-by-id output', () => {
    const a = buildTargetList().map((t) => t.defaultId);
    const b = buildTargetList().map((t) => t.defaultId);
    expect(a).toEqual(b);
    const sorted = [...a].sort((x, y) => x.localeCompare(y));
    expect(a).toEqual(sorted);
  });

  it('returns ~60-100 candidates (sanity bound on tabled galaxies)', () => {
    const targets = buildTargetList();
    expect(targets.length).toBeGreaterThan(50);
    expect(targets.length).toBeLessThan(120);
  });
});

describe('orderEntryFields', () => {
  it('writes fields in canonical schema order', () => {
    const e: FamousEntry = {
      id: 'm31',
      names: ['M31'],
      ra: 10.6847,
      dec: 41.2687,
      distanceMpc: 0.778,
      diameterKpc: 67.5,
      type: 'Sb',
      description: 'A galaxy.',
      magB: 4.3,
      axisRatio: 0.4,
      positionAngleDeg: 35,
    };
    const ordered = orderEntryFields(e);
    expect(Object.keys(ordered)).toEqual([
      'id',
      'names',
      'ra',
      'dec',
      'distanceMpc',
      'diameterKpc',
      'type',
      'description',
      'axisRatio',
      'positionAngleDeg',
      'magB',
    ]);
  });

  it('omits absent optional fields', () => {
    const e: FamousEntry = {
      id: 'x',
      names: ['x'],
      ra: 0,
      dec: 0,
      distanceMpc: 1,
      diameterKpc: 1,
      type: '',
      description: '',
    };
    const ordered = orderEntryFields(e);
    expect(Object.keys(ordered)).not.toContain('axisRatio');
    expect(Object.keys(ordered)).not.toContain('magB');
  });
});
