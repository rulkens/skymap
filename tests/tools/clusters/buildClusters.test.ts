/**
 * Tests for `buildClusters.ts` exported pure functions.
 *
 * All disk-touching logic lives in `main`; the two exported functions
 * (`extractAbell`, `buildClusterEntries`) operate on in-memory data so
 * unit tests here never touch the filesystem or the real MCXC/MSCC tables.
 *
 * Fixture strategy: hand-crafted McxcRow/MsccRow/ClusterSeedEntry objects
 * supply the minimum fields each test cares about.  Only the fields under
 * test need valid values — others are set to innocuous defaults.  This keeps
 * each test small and the failure messages unambiguous.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  extractAbell,
  buildClusterEntries,
} from '../../../tools/clusters/buildClusters';
import { parseClusterSeed } from '../../../tools/parsers/parseClusterSeed';
import type { McxcRow } from '../../../tools/parsers/parseMcxc';
import type { MsccRow } from '../../../tools/parsers/parseMscc';
import type { ClusterSeedEntry } from '../../../tools/parsers/parseClusterSeed';
import { H0_KM_S_MPC } from '../../../src/utils/math/constants';

// ── Shared fixtures ──────────────────────────────────────────────────────────

/** M500 safely above the MCXC_M500_MIN threshold (2.0 × 10^14 M☉). */
const ABOVE_THRESHOLD_M500 = 5.0;
/** M500 safely below the MCXC_M500_MIN threshold. */
const BELOW_THRESHOLD_M500 = 0.5;

/** Redshift safely within Z_MAX = 0.15. */
const NEAR_Z = 0.05;
/** Redshift safely beyond Z_MAX. */
const FAR_Z = 0.20;

/** Nm safely above the MSCC_NM_MIN threshold (6). */
const ABOVE_NM = 12;

/** An MCXC row fixture with all required fields. */
function makeMcxcRow(overrides: Partial<McxcRow> = {}): McxcRow {
  return {
    id: 'J1234.5+0000',
    raDeg: 185.0,
    decDeg: 0.0,
    z: NEAR_Z,
    m500: ABOVE_THRESHOLD_M500,
    r500Mpc: 1.0,
    oName: 'RXC J1234.5+0000',
    aName: '',
    ...overrides,
  };
}

/** An MSCC row fixture with all required fields. */
function makeMsccRow(overrides: Partial<MsccRow> = {}): MsccRow {
  return {
    id: 'MSCC 42',
    raDeg: 90.0,
    decDeg: 10.0,
    z: NEAR_Z,
    nm: ABOVE_NM,
    dmaxMpc: 20.0,
    ...overrides,
  };
}

/** An empty featured seed (no curated anchors → no dedup suppression). */
const NO_SEED: readonly ClusterSeedEntry[] = [];

// ── extractAbell ─────────────────────────────────────────────────────────────

describe('extractAbell', () => {
  describe('finds Abell/ACO tokens in AName or OName', () => {
    it('returns normalized token from aName when present', () => {
      expect(extractAbell('RXC J2346.6+2821', 'A2670')).toBe('A2670');
    });

    it('strips internal spaces: " A 2670" → "A2670"', () => {
      expect(extractAbell('RXC J2346.6+2821', ' A 2670')).toBe('A2670');
    });

    it('falls back to oName when aName is blank', () => {
      expect(extractAbell('A1656', '')).toBe('A1656');
    });

    it('returns null when no Abell token present', () => {
      // UGC designation — not an Abell token
      expect(extractAbell('UGC 12890', 'UGC 12890')).toBeNull();
    });

    it('returns null when both names are blank', () => {
      expect(extractAbell('', '')).toBeNull();
    });

    it('handles ACO southern supplement prefix S', () => {
      expect(extractAbell('', 'S0805')).toBe('S805');
    });

    it('strips leading zeros: A0007 → A7', () => {
      expect(extractAbell('', 'A0007')).toBe('A7');
    });

    it('strips leading zeros: A0013 → A13', () => {
      expect(extractAbell('', 'A0013')).toBe('A13');
    });

    it('strips leading zeros for S-prefix: S0026 → S26', () => {
      expect(extractAbell('', 'S0026')).toBe('S26');
    });

    it('strips leading zeros with internal space: A 0085 → A85', () => {
      // Space between prefix and digits is absorbed; leading zeros are stripped.
      expect(extractAbell('', 'A 0085')).toBe('A85');
    });

    it('prefers aName over oName when both have an Abell token', () => {
      // aName wins — it is considered more reliable
      expect(extractAbell('A1000', 'A2000')).toBe('A2000');
    });
  });
});

// ── buildClusterEntries — MCXC filtering ─────────────────────────────────────

describe('buildClusterEntries excludes clusters below the M500 threshold', () => {
  it('drops a row with m500 below MCXC_M500_MIN', () => {
    const mcxc = [makeMcxcRow({ m500: BELOW_THRESHOLD_M500 })];
    const entries = buildClusterEntries(mcxc, [], NO_SEED);
    expect(entries.filter((e) => e.category === 0)).toHaveLength(0);
  });

  it('keeps a row with m500 at or above MCXC_M500_MIN', () => {
    const mcxc = [makeMcxcRow({ m500: ABOVE_THRESHOLD_M500 })];
    const entries = buildClusterEntries(mcxc, [], NO_SEED);
    expect(entries.filter((e) => e.category === 0)).toHaveLength(1);
  });
});

describe('buildClusterEntries excludes structures beyond Z_MAX', () => {
  it('drops an MCXC row with z > Z_MAX', () => {
    const mcxc = [makeMcxcRow({ z: FAR_Z })];
    const entries = buildClusterEntries(mcxc, [], NO_SEED);
    expect(entries.filter((e) => e.category === 0)).toHaveLength(0);
  });

  it('drops an MSCC row with z > Z_MAX', () => {
    const mscc = [makeMsccRow({ z: FAR_Z })];
    const entries = buildClusterEntries([], mscc, NO_SEED);
    expect(entries.filter((e) => e.category === 1)).toHaveLength(0);
  });

  it('keeps an MCXC row with z exactly = Z_MAX', () => {
    const mcxc = [makeMcxcRow({ z: 0.15 })];
    const entries = buildClusterEntries(mcxc, [], NO_SEED);
    expect(entries.filter((e) => e.category === 0)).toHaveLength(1);
  });
});

// ── buildClusterEntries — apparentRadiusMpc for clusters ────────────────────

describe('buildClusterEntries sets apparentRadiusMpc = APPARENT_MULTIPLE × R500', () => {
  it('apparent = multiple × r500Mpc for a surviving cluster', () => {
    const r500 = 1.2;
    const mcxc = [makeMcxcRow({ r500Mpc: r500 })];
    const entries = buildClusterEntries(mcxc, [], NO_SEED);
    const e = entries.find((x) => x.category === 0)!;
    // physicalRadiusMpc === r500Mpc
    expect(e.physicalRadiusMpc).toBeCloseTo(r500, 5);
    // apparentRadiusMpc = APPARENT_MULTIPLE * r500Mpc — we don't import the
    // constant directly, but we know apparent > physical and apparent / physical
    // should equal APPARENT_MULTIPLE (1.5).
    expect(e.apparentRadiusMpc).toBeGreaterThan(e.physicalRadiusMpc);
    expect(e.apparentRadiusMpc / e.physicalRadiusMpc).toBeCloseTo(1.5, 5);
  });
});

// ── buildClusterEntries — supercluster physical === apparent ─────────────────

describe('buildClusterEntries collapses supercluster physical == apparent radius', () => {
  it('physicalRadiusMpc === apparentRadiusMpc for a supercluster', () => {
    const mscc = [makeMsccRow({ dmaxMpc: 30.0 })];
    const entries = buildClusterEntries([], mscc, NO_SEED);
    const e = entries.find((x) => x.category === 1)!;
    expect(e.physicalRadiusMpc).toBe(e.apparentRadiusMpc);
  });

  it('radius = dmax / h70 / 2 (with h70 = H0/70)', () => {
    // dmaxMpc is in raw h70^-1 Mpc.  Physical Mpc = dmaxMpc / h70.
    // Radius = physical / 2.
    const dmax = 40.0;
    const h70 = H0_KM_S_MPC / 70;
    const expectedRadius = dmax / h70 / 2;
    const mscc = [makeMsccRow({ dmaxMpc: dmax })];
    const entries = buildClusterEntries([], mscc, NO_SEED);
    const e = entries.find((x) => x.category === 1)!;
    expect(e.physicalRadiusMpc).toBeCloseTo(expectedRadius, 5);
  });
});

// ── buildClusterEntries — dedup against featured seed ───────────────────────

describe('buildClusterEntries drops a bulk entry near a featured seed anchor', () => {
  it('suppresses an MCXC entry near Coma and keeps one far away', () => {
    // Read Coma's real seed coordinates.  Using the real file means the test
    // stays honest — if the seed changes the test fails rather than silently
    // diverging from reality.
    const seedJson = readFileSync(resolve('data/cluster_anchors.seed.json'), 'utf8');
    const seed = parseClusterSeed(seedJson);
    const coma = seed.find((e) => e.id === 'coma-a1656')!;
    expect(coma).toBeDefined();

    // Convert Coma seed raHours→raDeg for the MCXC fixture (MCXC RA is degrees).
    const comaRaDeg = coma.raHours * 15;

    // Cluster at Coma's exact position → should be suppressed.
    // Use z that puts it at ~Coma's distMpc via approximation (H0=70).
    const comaDist = coma.distMpc;
    // Approximate z ≈ d * H0 / c (linear) — fine for test purposes; the test
    // checks dedup, not cosmological precision.
    const comaZ = (comaDist * H0_KM_S_MPC) / 299792.458;

    const nearComa = makeMcxcRow({
      raDeg: comaRaDeg,
      decDeg: coma.decDeg,
      z: Math.min(comaZ, 0.14), // keep within Z_MAX for a valid MCXC fixture
      m500: ABOVE_THRESHOLD_M500,
    });

    // Cluster in the southern sky, far from Coma.
    const farRow = makeMcxcRow({
      id: 'J1234.5-6000',
      raDeg: 185.0,
      decDeg: -60.0,
      z: 0.05,
      m500: ABOVE_THRESHOLD_M500,
    });

    const entries = buildClusterEntries([nearComa, farRow], [], seed);
    const clusterEntries = entries.filter((e) => e.category === 0);

    // The far cluster must survive.
    const farSurvived = clusterEntries.some((e) => e.id.includes('j1234') || e.worldPos[2] < -50);
    expect(farSurvived).toBe(true);

    // The near-Coma cluster must be suppressed (Coma's apparentRadiusMpc = 6 Mpc).
    // Verify by checking total count: only farRow should survive from these two.
    expect(clusterEntries.length).toBeLessThan(2);
  });
});

// ── buildClusterEntries — Abell designation and name priority ────────────────

describe('buildClusterEntries prefers the Abell designation for the name', () => {
  it('uses Abell designation as names[0] when aName contains Abell token', () => {
    const mcxc = [makeMcxcRow({ aName: 'A2199', oName: 'RXC J1643.7+3906' })];
    const entries = buildClusterEntries(mcxc, [], NO_SEED);
    const e = entries.find((x) => x.category === 0)!;
    expect(e.names[0]).toBe('A2199');
    expect(e.abell).toBe('A2199');
  });

  it('falls back to oName as names[0] when no Abell token and aName is blank', () => {
    const mcxc = [makeMcxcRow({ aName: '', oName: 'RXC J1234.5+0000' })];
    const entries = buildClusterEntries(mcxc, [], NO_SEED);
    const e = entries.find((x) => x.category === 0)!;
    expect(e.names[0]).toBe('RXC J1234.5+0000');
    expect(e.abell).toBeNull();
  });

  it('falls back to MCXC id as names[0] when both oName and aName are blank', () => {
    const id = 'J9999.9+0000';
    const mcxc = [makeMcxcRow({ id, aName: '', oName: '' })];
    const entries = buildClusterEntries(mcxc, [], NO_SEED);
    const e = entries.find((x) => x.category === 0)!;
    // names[0] slug of MCXC id
    expect(e.names[0]).toBeTruthy();
    expect(e.abell).toBeNull();
  });
});

// ── buildClusterEntries — abell null for superclusters ───────────────────────

describe('buildClusterEntries sets abell null for superclusters', () => {
  it('abell is always null for MSCC entries', () => {
    const mscc = [makeMsccRow({ nm: ABOVE_NM })];
    const entries = buildClusterEntries([], mscc, NO_SEED);
    const e = entries.find((x) => x.category === 1)!;
    expect(e).toBeDefined();
    expect(e.abell).toBeNull();
  });
});

// ── buildClusterEntries — category byte ──────────────────────────────────────

describe('buildClusterEntries tags category 0 for MCXC, 1 for MSCC', () => {
  it('MCXC entries have category 0', () => {
    const entries = buildClusterEntries([makeMcxcRow()], [], NO_SEED);
    expect(entries[0]?.category).toBe(0);
  });

  it('MSCC entries have category 1', () => {
    const entries = buildClusterEntries([], [makeMsccRow()], NO_SEED);
    expect(entries[0]?.category).toBe(1);
  });
});
