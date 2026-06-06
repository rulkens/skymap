/**
 * Tests for `resolveFocusTarget` — the pure function that maps a parsed
 * `FocusTarget` (from the URL codec) onto a concrete `(source, localIdx)`
 * pair against the engine's currently-loaded data.
 *
 * Fixtures here use 3-row synthetic clouds with hand-set objIDs and
 * positions.  The resolver only reads `count`, `objIDs`, and `positions`,
 * so we cast partial cloud objects to `GalaxyCatalog` rather than filling
 * every field.  This keeps each test compact and the contract under
 * test obvious — anything else in `GalaxyCatalog` is irrelevant to the
 * resolver and a real cloud's bytes would only obscure that.
 */
import { describe, it, expect } from 'vitest';
import { resolveFocusTarget } from '../../../../src/services/engine/camera/resolveFocusTarget';
import type { GalaxyCatalog } from '../../../../src/@types/data/GalaxyCatalog';
import { Source } from '../../../../src/data/sources';
import type { FamousMetaEntry } from '../../../../src/@types/loading/FamousMetaEntry';
import { raDecZToCartesian } from '../../../../src/utils/math/raDecZToCartesian';

/**
 * Build a minimum-viable `GalaxyCatalog` for resolver tests.  The resolver
 * only reads `count`, `objIDs`, and `positions`; every other field is
 * unused, so we cast through `unknown` rather than filling them with
 * pointless zeros.
 */
function makeCloud(count: number, objIDs: bigint[], positions: number[]): GalaxyCatalog {
  return {
    count,
    objIDs: BigUint64Array.from(objIDs),
    positions: Float32Array.from(positions),
  } as unknown as GalaxyCatalog;
}

/**
 * Convenience: build interleaved [x,y,z, x,y,z, ...] for a list of
 * (RA, Dec) sky positions at a fixed redshift.  Most pos tests only
 * need angular accuracy; using a small non-zero redshift keeps the
 * Cartesian magnitudes well away from the origin where rounding bites.
 */
function positionsFromSky(skyDegPairs: { raDeg: number; decDeg: number }[]): number[] {
  const out: number[] = [];
  for (const p of skyDegPairs) {
    const [x, y, z] = raDecZToCartesian(p.raDeg, p.decDeg, 0.01);
    out.push(x, y, z);
  }
  return out;
}

describe('resolveFocusTarget — famous', () => {
  const meta: FamousMetaEntry[] = [
    { id: 'm31', names: ['M 31'], description: '', type: 'SAb' },
    { id: 'ngc5128', names: ['NGC 5128'], description: '', type: 'S0' },
  ];

  it('resolves an id present in meta when the famous cloud is loaded', () => {
    const famous = makeCloud(2, [0n, 0n], [0, 0, 0, 0, 0, 0]);
    const out = resolveFocusTarget({
      target: { kind: 'famous', id: 'ngc5128' },
      catalogs: [{ source: Source.FamousGalaxy, catalog: famous }],
      famousMeta: meta,
      aliasMap: new Map(),
    });
    expect(out).toEqual({ resolved: true, source: Source.FamousGalaxy, localIdx: 1 });
  });

  it('returns unknown when the id is not in meta', () => {
    const famous = makeCloud(2, [0n, 0n], [0, 0, 0, 0, 0, 0]);
    const out = resolveFocusTarget({
      target: { kind: 'famous', id: 'nonsense' },
      catalogs: [{ source: Source.FamousGalaxy, catalog: famous }],
      famousMeta: meta,
      aliasMap: new Map(),
    });
    expect(out).toEqual({ resolved: false, reason: 'unknown' });
  });

  it('returns unknown when meta has the id but no famous cloud is loaded', () => {
    // Famous galaxies live only in the Famous source — there's no larger
    // tier to advise the user about, so this is unknown, not tier.
    const out = resolveFocusTarget({
      target: { kind: 'famous', id: 'm31' },
      catalogs: [],
      famousMeta: meta,
      aliasMap: new Map(),
    });
    expect(out).toEqual({ resolved: false, reason: 'unknown' });
  });
});

describe('resolveFocusTarget — pgc', () => {
  it('resolves a PGC found in a GLADE cloud', () => {
    const glade = makeCloud(3, [100n, 200n, 300n], new Array(9).fill(0));
    const out = resolveFocusTarget({
      target: { kind: 'pgc', pgc: 200n },
      catalogs: [{ source: Source.Glade, catalog: glade }],
      famousMeta: [],
      aliasMap: new Map(),
    });
    expect(out).toEqual({ resolved: true, source: Source.Glade, localIdx: 1 });
  });

  it('resolves a PGC found only in 2MRS', () => {
    const glade = makeCloud(2, [100n, 200n], new Array(6).fill(0));
    const twoMrs = makeCloud(2, [555n, 999n], new Array(6).fill(0));
    const out = resolveFocusTarget({
      target: { kind: 'pgc', pgc: 999n },
      catalogs: [
        { source: Source.Glade, catalog: glade },
        { source: Source.TwoMRS, catalog: twoMrs },
      ],
      famousMeta: [],
      aliasMap: new Map(),
    });
    expect(out).toEqual({ resolved: true, source: Source.TwoMRS, localIdx: 1 });
  });

  it('returns tier when the PGC is in the alias map but not in any loaded cloud', () => {
    const glade = makeCloud(2, [100n, 200n], new Array(6).fill(0));
    const aliasMap = new Map<bigint, readonly string[]>([[42n, ['NGC 7']]]);
    const out = resolveFocusTarget({
      target: { kind: 'pgc', pgc: 42n },
      catalogs: [{ source: Source.Glade, catalog: glade }],
      famousMeta: [],
      aliasMap,
    });
    expect(out).toEqual({ resolved: false, reason: 'tier' });
  });

  it('returns unknown when the PGC is in no loaded cloud and absent from alias map', () => {
    const glade = makeCloud(2, [100n, 200n], new Array(6).fill(0));
    const out = resolveFocusTarget({
      target: { kind: 'pgc', pgc: 9999n },
      catalogs: [{ source: Source.Glade, catalog: glade }],
      famousMeta: [],
      aliasMap: new Map(),
    });
    expect(out).toEqual({ resolved: false, reason: 'unknown' });
  });

  it('does not match SDSS clouds (PGC vs SDSS objID namespace mismatch)', () => {
    // SDSS objIDs are 19-digit ints; PGCs are small.  Even on a numeric
    // collision we must skip SDSS to avoid false positives, since SDSS
    // doesn't store PGC in its objIDs slot.
    const sdss = makeCloud(1, [42n], [0, 0, 0]);
    const aliasMap = new Map<bigint, readonly string[]>([[42n, ['x']]]);
    const out = resolveFocusTarget({
      target: { kind: 'pgc', pgc: 42n },
      catalogs: [{ source: Source.SDSS, catalog: sdss }],
      famousMeta: [],
      aliasMap,
    });
    expect(out).toEqual({ resolved: false, reason: 'tier' });
  });
});

describe('resolveFocusTarget — sdss', () => {
  const objID = 1237660024523456789n;

  it('resolves an objID found in an SDSS cloud', () => {
    const sdss = makeCloud(2, [123n, objID], new Array(6).fill(0));
    const out = resolveFocusTarget({
      target: { kind: 'sdss', objID },
      catalogs: [{ source: Source.SDSS, catalog: sdss }],
      famousMeta: [],
      aliasMap: new Map(),
    });
    expect(out).toEqual({ resolved: true, source: Source.SDSS, localIdx: 1 });
  });

  it('returns tier when no SDSS cloud is loaded', () => {
    // The user might have SDSS toggled off, or be on a tier where SDSS
    // isn't yet loaded.  We can't know which, so "tier" (UI: "load a
    // larger tier or enable SDSS") is the helpful nudge.
    const glade = makeCloud(1, [100n], [0, 0, 0]);
    const out = resolveFocusTarget({
      target: { kind: 'sdss', objID },
      catalogs: [{ source: Source.Glade, catalog: glade }],
      famousMeta: [],
      aliasMap: new Map(),
    });
    expect(out).toEqual({ resolved: false, reason: 'tier' });
  });

  it('returns tier when SDSS is loaded but the objID is missing — conservative choice', () => {
    // Without an oracle that says "this objID exists in SDSS at all",
    // we can't distinguish "user typed garbage" from "the row lives in
    // a larger SDSS tier".  We prefer 'tier' so the user sees an
    // actionable nudge instead of a dead-end "unknown".
    const sdss = makeCloud(1, [111n], [0, 0, 0]);
    const out = resolveFocusTarget({
      target: { kind: 'sdss', objID },
      catalogs: [{ source: Source.SDSS, catalog: sdss }],
      famousMeta: [],
      aliasMap: new Map(),
    });
    expect(out).toEqual({ resolved: false, reason: 'tier' });
  });
});

describe('resolveFocusTarget — pos', () => {
  it('resolves to the nearest galaxy within 30 arcsec', () => {
    // Target sits 5 arcsec (≈ 0.00139°) east in RA from row 1.
    const targets = [
      { raDeg: 10, decDeg: 20 }, // far away
      { raDeg: 100, decDeg: 30 }, // the match
      { raDeg: 200, decDeg: -10 }, // far away
    ];
    const cloud = makeCloud(3, [0n, 0n, 0n], positionsFromSky(targets));
    const out = resolveFocusTarget({
      target: { kind: 'pos', raDeg: 100 + 5 / 3600, decDeg: 30 },
      catalogs: [{ source: Source.Glade, catalog: cloud }],
      famousMeta: [],
      aliasMap: new Map(),
    });
    expect(out).toEqual({ resolved: true, source: Source.Glade, localIdx: 1 });
  });

  it('returns unknown when the nearest galaxy is beyond 30 arcsec', () => {
    // 60 arcsec offset — well beyond the threshold.
    const cloud = makeCloud(1, [0n], positionsFromSky([{ raDeg: 100, decDeg: 30 }]));
    const out = resolveFocusTarget({
      target: { kind: 'pos', raDeg: 100 + 60 / 3600, decDeg: 30 },
      catalogs: [{ source: Source.Glade, catalog: cloud }],
      famousMeta: [],
      aliasMap: new Map(),
    });
    expect(out).toEqual({ resolved: false, reason: 'unknown' });
  });

  it('handles the RA wrap-around at 0/360 boundary', () => {
    // Galaxy at RA = 359.999°, target at RA = 0.001° — true separation
    // is 0.002°  ≈ 7.2 arcsec, well inside the threshold.
    const cloud = makeCloud(1, [0n], positionsFromSky([{ raDeg: 359.999, decDeg: 0 }]));
    const out = resolveFocusTarget({
      target: { kind: 'pos', raDeg: 0.001, decDeg: 0 },
      catalogs: [{ source: Source.Glade, catalog: cloud }],
      famousMeta: [],
      aliasMap: new Map(),
    });
    expect(out).toEqual({ resolved: true, source: Source.Glade, localIdx: 0 });
  });

  it('picks the closest match when multiple galaxies are inside 30 arcsec', () => {
    // Two galaxies near (50°, 0°): row 0 at 10 arcsec, row 1 at 3 arcsec.
    // Resolver should prefer row 1.
    const cloud = makeCloud(
      2,
      [0n, 0n],
      positionsFromSky([
        { raDeg: 50 + 10 / 3600, decDeg: 0 },
        { raDeg: 50 + 3 / 3600, decDeg: 0 },
      ]),
    );
    const out = resolveFocusTarget({
      target: { kind: 'pos', raDeg: 50, decDeg: 0 },
      catalogs: [{ source: Source.Glade, catalog: cloud }],
      famousMeta: [],
      aliasMap: new Map(),
    });
    expect(out).toEqual({ resolved: true, source: Source.Glade, localIdx: 1 });
  });

  it('searches across multiple loaded clouds and picks the global closest', () => {
    const glade = makeCloud(1, [0n], positionsFromSky([{ raDeg: 50 + 20 / 3600, decDeg: 0 }]));
    const twoMrs = makeCloud(1, [0n], positionsFromSky([{ raDeg: 50 + 5 / 3600, decDeg: 0 }]));
    const out = resolveFocusTarget({
      target: { kind: 'pos', raDeg: 50, decDeg: 0 },
      catalogs: [
        { source: Source.Glade, catalog: glade },
        { source: Source.TwoMRS, catalog: twoMrs },
      ],
      famousMeta: [],
      aliasMap: new Map(),
    });
    expect(out).toEqual({ resolved: true, source: Source.TwoMRS, localIdx: 0 });
  });
});
