/**
 * Unit tests for `galaxyInfoBuilder` — the pure data → display path that the
 * engine uses on every hover/select event.
 *
 * Three exported helpers are exercised:
 *
 *   - `niceRound`    — axis-ticker style {1,2,5}×10^k floor (used by the
 *                      scale-bar legend).
 *   - `maxAbsCoord`  — bounding-box heuristic used at startup framing.
 *   - `buildGalaxyInfo` — turns a (cloud, idx) pair into a fully-derived
 *                      `GalaxyInfo` value.  The bulk of these tests pin the
 *                      per-source dispatch (SDSS / 2MRS / GLADE / Famous /
 *                      Synthetic) end-to-end so any cross-cut regression in
 *                      thumbnails, explorer URLs, IAU names, orientation
 *                      provenance, or the famous-meta block is caught here.
 */

import { describe, it, expect } from 'vitest';
import {
  buildGalaxyInfo,
  maxAbsCoord,
  niceRound,
} from '../../../../src/services/engine/helpers/galaxyInfoBuilder';
import { Source } from '../../../../src/data/sources';
import type { GalaxyCatalog } from '../../../../src/@types/data/GalaxyCatalog';
import { fallbackOrientation } from '../../../../src/utils/random/fallbackOrientation';
import { cartesianToRaDecZ } from '../../../../src/utils/math/cartesianToRaDecZ';
import type { FamousMetaEntry } from '../../../../src/@types/loading/FamousMetaEntry';

// ─── Test helpers ───────────────────────────────────────────────────────────

/**
 * Build a synthetic `GalaxyCatalog` of `count` rows, all zeroed except objIDs
 * (sequential 1..N so catalogUrl is well-defined for SDSS rows).  Mirrors
 * the helper in `tests/services/gpu/computeSchechterRatios.test.ts` so future
 * readers can copy-paste between test files without pattern-matching surprises.
 */
function makeCloud(count: number): GalaxyCatalog {
  return {
    count,
    objIDs: BigUint64Array.from({ length: count }, (_, i) => BigInt(i + 1)),
    positions: new Float32Array(count * 3),
    magU: new Float32Array(count),
    magG: new Float32Array(count),
    magR: new Float32Array(count),
    magI: new Float32Array(count),
    magZ: new Float32Array(count),
    axisRatio: new Float32Array(count).fill(0.7),
    positionAngleDeg: new Float32Array(count).fill(45),
    diameterKpc: new Float32Array(count).fill(30),
    classByte: new Uint8Array(count),
    parentSurveyByte: new Uint8Array(count),
    spectroscopicZ: new Float32Array(count),
  };
}

// ─── niceRound ──────────────────────────────────────────────────────────────

describe('niceRound', () => {
  it('returns 2 for 3.7 (mantissa 3.7 → 2)', () => {
    // Mantissa 3.7 falls into the [2, 5) bucket, so it rounds down to 2.
    expect(niceRound(3.7)).toBe(2);
  });

  it('returns 20 for 47 (mantissa 4.7 → 2 × 10¹)', () => {
    // 47 = 4.7 × 10¹ → nice mantissa 2 → 20.
    expect(niceRound(47)).toBe(20);
  });

  it('returns 500 for 800 (mantissa 8 → 5 × 10²)', () => {
    // 800 = 8 × 10² → nice mantissa 5 → 500.
    expect(niceRound(800)).toBe(500);
  });

  it('returns 0.05 for 0.07 (mantissa 7 → 5 × 10⁻²)', () => {
    // Sub-unit values are handled by the same Math.log10 / Math.pow logic.
    // 0.07 → mantissa 7 → 5 × 10⁻² = 0.05.
    expect(niceRound(0.07)).toBeCloseTo(0.05, 10);
  });

  it('returns 0 for 0 (degenerate input)', () => {
    // The function explicitly guards x ≤ 0 because Math.log10(0) is -∞.
    expect(niceRound(0)).toBe(0);
  });

  it('returns 0 for negative inputs (the contract is "round positive values")', () => {
    // Negative values fall into the same x ≤ 0 guard.  The scale bar never
    // passes a negative — but the function's documented behaviour is to
    // return 0 so callers don't get a NaN downstream.
    expect(niceRound(-5)).toBe(0);
  });

  it('returns the value itself when it is already a nice power of ten', () => {
    // Powers of 10 (mantissa = 1) sit at the bucket boundary and pass through.
    expect(niceRound(100)).toBe(100);
  });
});

// ─── maxAbsCoord ────────────────────────────────────────────────────────────

describe('maxAbsCoord', () => {
  it('returns the largest absolute coordinate component across all points', () => {
    // Place 3 points at (1, 2, 3), (4, 5, 6), (7, 8, 9).  The maximum
    // absolute component is 9.
    const cloud = makeCloud(3);
    cloud.positions.set([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(maxAbsCoord(cloud)).toBe(9);
  });

  it('considers negative components by their absolute value', () => {
    // A negative component can dominate if its magnitude is largest.  We
    // verify by placing a -100 in the middle of otherwise-small coords.
    const cloud = makeCloud(2);
    cloud.positions.set([1, 2, 3, -100, 0, 0]);
    expect(maxAbsCoord(cloud)).toBe(100);
  });

  it('returns 0 for an all-zero cloud', () => {
    // An empty / zero cloud (e.g. count=1 with default fill) has max-abs = 0.
    const cloud = makeCloud(1);
    expect(maxAbsCoord(cloud)).toBe(0);
  });
});

// ─── buildGalaxyInfo — common helpers ────────────────────────────────────────

/**
 * Place a single point at a given (RA, Dec, z) by computing the matching
 * cartesian coordinates, then writing them into `cloud.positions[0..3]`.
 *
 * We do this rather than computing positions from `raDecZToCartesian` inside
 * each `it()` because most tests only care about the round-trip behaviour
 * (RA/Dec recovered from xyz), not the input → xyz conversion itself.
 */
function setPosition(cloud: GalaxyCatalog, idx: number, x: number, y: number, z: number): void {
  cloud.positions[idx * 3 + 0] = x;
  cloud.positions[idx * 3 + 1] = y;
  cloud.positions[idx * 3 + 2] = z;
}

// ─── buildGalaxyInfo — SDSS branch ───────────────────────────────────────────

describe('buildGalaxyInfo — SDSS source', () => {
  it('returns a GalaxyInfo with sdss-specific fields populated', () => {
    // Place the point at a known (RA, Dec, z) so we can verify the round-trip.
    // Cartesian (100, 0, 0) Mpc lies on the +x axis at z = 100/HUBBLE_DISTANCE
    // ≈ 0.0233.  RA recovers to 0°, Dec to 0°.
    const cloud = makeCloud(1);
    setPosition(cloud, 0, 100, 0, 0);
    cloud.magU[0] = 18.5;
    cloud.magG[0] = 17.8;
    cloud.magR[0] = 17.0;
    cloud.magI[0] = 16.7;
    cloud.magZ[0] = 16.5;
    // Spectroscopic z — same value the cartesian inversion would produce for
    // this position. The build pipeline writes it into the .bin from the
    // parser-supplied catalog value (see local-volume-distances spec); the
    // InfoCard reads from here rather than re-inverting position, so the
    // fixture has to set it explicitly.
    const [, , czForPosition] = cartesianToRaDecZ(100, 0, 0);
    cloud.spectroscopicZ[0] = czForPosition;
    // axisRatio / pa default to (0.7, 45) which is *not* the deterministic
    // fallback for objID=1, so provenance should resolve to "SDSS exp+deV blend".

    const info = buildGalaxyInfo(cloud, 0, Source.SDSS);

    // Index + objID round-trip from the cloud arrays.
    expect(info.index).toBe(0);
    expect(info.objID).toBe(1n);

    // World coords are passed through unchanged (no recomputation).
    expect(info.x).toBe(100);
    expect(info.y).toBe(0);
    expect(info.z).toBe(0);

    // Sky coords recovered from cartesian — RA wraps to [0, 360), so the
    // +x axis is RA = 0.  Dec at z=0 is exactly 0.
    const [ra, dec, redshift] = cartesianToRaDecZ(100, 0, 0);
    expect(info.ra).toBeCloseTo(ra, 6);
    expect(info.dec).toBeCloseTo(dec, 6);
    expect(info.redshift).toBeCloseTo(redshift, 6);

    // Source attribution.
    expect(info.source).toBe(Source.SDSS);
    expect(info.sourceLabel).toBe('SDSS');

    // SDSS prefix on the IAU name; coords match the rounded-down truncation.
    expect(info.iauName.startsWith('SDSS J')).toBe(true);

    // catalogUrl points to the SDSS Quick Look page for SDSS rows with a
    // valid objID (> 0n).
    expect(info.catalogUrl).not.toBeNull();
    expect(info.catalogUrl).toContain('skyserver.sdss.org');
    expect(info.catalogUrl).toContain('objId=1');

    // SDSS rows use the SDSS thumbnail URL (not DSS).
    expect(info.thumbnailUrl).toContain('skyserver.sdss.org');

    // The colours array should contain all four SDSS adjacent pairs (u−g, g−r,
    // r−i, i−z) — none of the band labels are '—' for SDSS.
    expect(info.colours).toHaveLength(4);
    expect(info.colours[0]!.label).toBe('u−g');
    // Float32 storage rounds the inputs to the nearest representable float
    // before the subtraction, so 18.5 - 17.8 ≈ 0.7000007 in f32.  3 decimals
    // is enough to confirm the right band pair was picked.
    expect(info.colours[0]!.value).toBeCloseTo(18.5 - 17.8, 3);

    // Orientation provenance should be the SDSS-specific tag because (0.7, 45)
    // doesn't match the deterministic fallback for this objID/RA/Dec.
    expect(info.orientation.provenance).toBe('SDSS exp+deV blend');

    // Diameter equal to DEFAULT_GALAXY_DIAMETER_KPC = 30 → fallback provenance.
    expect(info.diameterProvenance).toBe('fallback (30 kpc)');

    // Famous block is absent for SDSS rows.
    expect(info.famous).toBeUndefined();
  });

  it('falls back to a NED coord-search URL when objID is 0n (synthetic-style ID)', () => {
    // Synthetic-style sequential IDs starting at 0 don't resolve to a real
    // SDSS Explorer page, so for that edge case we fall back to a NED
    // near-position search at the row's RA/Dec.  Keeps the catalog link
    // non-null in tests so the InfoCard's link path stays exercised.
    const cloud = makeCloud(1);
    cloud.objIDs[0] = 0n;
    setPosition(cloud, 0, 100, 0, 0);
    const info = buildGalaxyInfo(cloud, 0, Source.SDSS);
    expect(info.catalogUrl).not.toBeNull();
    expect(info.catalogUrl).toContain('ned.ipac.caltech.edu');
    expect(info.catalogUrl).toContain('Near+Position+Search');
  });

  it('flags orientation provenance as "deterministic fallback" when ar/pa match the hash', () => {
    // Replay the deterministic fallback for this objID / ra / dec, write the
    // result back into the cloud, and confirm provenance comes back as
    // "deterministic fallback".  Float32 round-trip via the cloud arrays
    // matches the source's own Float32Array trick.
    const cloud = makeCloud(1);
    setPosition(cloud, 0, 100, 0, 0);
    const [ra, dec] = cartesianToRaDecZ(100, 0, 0);
    const fb = fallbackOrientation(cloud.objIDs[0]!, ra, dec);
    cloud.axisRatio[0] = fb.axisRatio;
    cloud.positionAngleDeg[0] = fb.positionAngleDeg;
    const info = buildGalaxyInfo(cloud, 0, Source.SDSS);
    expect(info.orientation.provenance).toBe('deterministic fallback');
  });
});

// ─── buildGalaxyInfo — TwoMRS branch ─────────────────────────────────────────

describe('buildGalaxyInfo — TwoMRS source', () => {
  it('uses the 2MASX prefix and DSS thumbnail (not SDSS)', () => {
    // 2MRS rows live in J/H/K bands (g/r/i slots; u/z slots are '—').  The
    // function uses DSS for thumbnails because SDSS only covers 1/3 of the sky.
    const cloud = makeCloud(1);
    setPosition(cloud, 0, 50, 50, 0);
    cloud.magG[0] = 12.0; // J
    cloud.magR[0] = 11.5; // H
    cloud.magI[0] = 11.0; // K

    const info = buildGalaxyInfo(cloud, 0, Source.TwoMRS);

    expect(info.source).toBe(Source.TwoMRS);
    expect(info.sourceLabel).toBe('2MRS');
    expect(info.iauName.startsWith('2MASX J')).toBe(true);

    // 2MRS rows resolve via NED's near-position search rather than a
    // 2MASX byname lookup — NED's name index has coverage gaps for
    // 2MASX even when the underlying object is present in NED under a
    // different catalogue name.  See galaxyInfoBuilder.ts for why.
    expect(info.catalogUrl).not.toBeNull();
    expect(info.catalogUrl).toContain('ned.ipac.caltech.edu');
    expect(info.catalogUrl).toContain('Near+Position+Search');

    // Thumbnail comes from the CDS hips2fits DSS proxy, not SDSS ImgCutout.
    expect(info.thumbnailUrl).toContain('alasky.cds.unistra.fr');

    // Bands record the 2MRS layout: u/z slots are '—', others are J/H/K.
    expect(info.bands).toEqual({ u: '—', g: 'J', r: 'H', i: 'K', z: '—' });

    // colours must skip pairs where either band is '—'.  For 2MRS, u−g and
    // i−z are excluded (one side is '—'), leaving J−H and H−K.
    expect(info.colours.map((c) => c.label)).toEqual(['J−H', 'H−K']);

    // Orientation provenance for non-fallback values resolves to the
    // 2MRS-specific tag.
    expect(info.orientation.provenance).toBe('2MASS XSC sup_phi');
  });

  it('uses `PGC <n>` as displayName when the row has a real PGC', () => {
    // The build-time GLADE→2MRS cross-match populates objID with the
    // matching PGC for ~30 % of 2MRS rows.  When present, the headline
    // should prefer `PGC <n>` over the coord-based 2MASX designation
    // because PGC numbers are NED-indexed and shorter to read.
    const cloud = makeCloud(1);
    cloud.objIDs[0] = 2789n; // NGC 253's PGC
    setPosition(cloud, 0, 50, 50, 0);
    const info = buildGalaxyInfo(cloud, 0, Source.TwoMRS);
    expect(info.displayName).toBe('PGC 2789');
    // The IAU name still comes through unchanged for callers that need
    // the coord-based form (it's not the headline anymore but other
    // code paths may consume it).
    expect(info.iauName.startsWith('2MASX J')).toBe(true);
  });

  it('falls back to iauName as displayName when objID is 0n (no cross-match)', () => {
    const cloud = makeCloud(1);
    cloud.objIDs[0] = 0n;
    setPosition(cloud, 0, 50, 50, 0);
    const info = buildGalaxyInfo(cloud, 0, Source.TwoMRS);
    expect(info.displayName).toBe(info.iauName);
    expect(info.displayName.startsWith('2MASX J')).toBe(true);
  });
});

// ─── buildGalaxyInfo — Glade branch ──────────────────────────────────────────

describe('buildGalaxyInfo — Glade source', () => {
  it('uses the GLADE prefix, DSS thumbnail, and HyperLEDA orientation tag', () => {
    // GLADE rows: B/J/H/K in g/r/i/z slots; u-slot is '—'.
    const cloud = makeCloud(1);
    // makeCloud seeds objIDs[i] = i+1; for GLADE rows the SDSS-shaped
    // objID slot now carries the row's HyperLEDA PGC.  Force it to 0n
    // here so this test exercises the "no PGC, fall back to coord
    // search" branch.  The real-PGC branch has its own test below.
    cloud.objIDs[0] = 0n;
    setPosition(cloud, 0, 0, 0, 200);
    cloud.magG[0] = 14.0; // B
    cloud.magR[0] = 13.0; // J
    cloud.magI[0] = 12.5; // H
    cloud.magZ[0] = 12.0; // K

    const info = buildGalaxyInfo(cloud, 0, Source.Glade);

    expect(info.source).toBe(Source.Glade);
    expect(info.sourceLabel).toBe('GLADE');
    expect(info.iauName.startsWith('GLADE J')).toBe(true);
    // GLADE row with PGC = 0n → NED coord-search URL.
    expect(info.catalogUrl).not.toBeNull();
    expect(info.catalogUrl).toContain('ned.ipac.caltech.edu');
    expect(info.catalogUrl).toContain('Near+Position+Search');
    expect(info.thumbnailUrl).toContain('alasky.cds.unistra.fr');

    expect(info.bands).toEqual({ u: '—', g: 'B', r: 'J', i: 'H', z: 'K' });

    // GLADE pairs: u−g excluded (u is '—'), so we get B−J, J−H, H−K.
    expect(info.colours.map((c) => c.label)).toEqual(['B−J', 'J−H', 'H−K']);

    // Non-fallback orientation values get the HyperLEDA tag.
    expect(info.orientation.provenance).toBe('HyperLEDA PGC');
  });

  it('builds a NED byname URL with PGC<n> when objID encodes a real PGC', () => {
    // The GLADE parser persists the row's HyperLEDA PGC number into the
    // SDSS-shaped objID slot when one is present (`tools/parsers/glade.ts`).
    // The InfoCard builder reads it back and produces a clean
    // ?objname=PGC+<n> link, which resolves directly to the catalogue page.
    const cloud = makeCloud(1);
    setPosition(cloud, 0, 0, 0, 200);
    cloud.objIDs[0] = 12345n;
    const info = buildGalaxyInfo(cloud, 0, Source.Glade);
    expect(info.catalogUrl).toContain('ned.ipac.caltech.edu/byname');
    expect(info.catalogUrl).toContain('PGC+12345');
  });
});

// ─── buildGalaxyInfo — Synthetic branch ──────────────────────────────────────

describe('buildGalaxyInfo — Synthetic source', () => {
  it('uses the Synth prefix and DSS thumbnail; orientation falls back', () => {
    // Synthetic data carries SDSS-shaped band labels but the catalog link is
    // null (synthetic coords don't correspond to real objects).  Orientation
    // provenance is always "deterministic fallback" for synthetic — synthetic
    // data skips the real-data fetch entirely.
    const cloud = makeCloud(1);
    setPosition(cloud, 0, 0, 100, 0);
    // Use deterministic-fallback values so provenance lands on the synthetic
    // tag.  (Even non-fallback values land on "deterministic fallback" for
    // Source.Synthetic per the source's else branch — but using the actual
    // fallback is a stronger spec match.)
    const [ra, dec] = cartesianToRaDecZ(0, 100, 0);
    const fb = fallbackOrientation(cloud.objIDs[0]!, ra, dec);
    cloud.axisRatio[0] = fb.axisRatio;
    cloud.positionAngleDeg[0] = fb.positionAngleDeg;

    const info = buildGalaxyInfo(cloud, 0, Source.Synthetic);

    expect(info.source).toBe(Source.Synthetic);
    expect(info.sourceLabel).toBe('Synthetic');
    expect(info.iauName.startsWith('Synth J')).toBe(true);
    expect(info.catalogUrl).toBeNull();
    expect(info.thumbnailUrl).toContain('alasky.cds.unistra.fr');
    expect(info.orientation.provenance).toBe('deterministic fallback');
  });
});

// ─── buildGalaxyInfo — Famous branch ─────────────────────────────────────────

describe('buildGalaxyInfo — Famous source', () => {
  it('attaches the famous metadata block when the sidecar supplies an entry', () => {
    // Famous rows come from a curated catalogue.  When the sidecar has
    // matching metadata for the local index, the returned GalaxyInfo carries
    // a `famous` block with id/names/description pulled from the sidecar.
    const cloud = makeCloud(1);
    setPosition(cloud, 0, 1, 0, 0); // M31-like nearby position
    const meta: FamousMetaEntry[] = [
      {
        id: 'm31',
        names: ['M31', 'Andromeda Galaxy'],
        description: 'Nearest large spiral.',
        type: 'SBb',
      },
    ];

    const info = buildGalaxyInfo(cloud, 0, Source.Famous, meta);

    expect(info.source).toBe(Source.Famous);
    expect(info.iauName.startsWith('Famous J')).toBe(true);
    // Famous rows prefer the curated, non-deprojected tile; the DSS sky cutout
    // becomes the fallback shown if the curated tile is missing.
    expect(info.thumbnailUrl).toBe('/images/famous-thumb/m31.webp');
    expect(info.thumbnailFallbackUrl).toContain('alasky.cds.unistra.fr');

    // famous block is populated from the sidecar entry.
    expect(info.famous).toBeDefined();
    expect(info.famous!.id).toBe('m31');
    expect(info.famous!.names).toEqual(['M31', 'Andromeda Galaxy']);
    expect(info.famous!.description).toBe('Nearest large spiral.');
  });

  it('omits the famous block when the sidecar is undefined (graceful degradation)', () => {
    // If the sidecar fetch hasn't resolved yet (or 404'd), buildGalaxyInfo must
    // not crash — the InfoCard simply renders the generic layout for that hover.
    const cloud = makeCloud(1);
    setPosition(cloud, 0, 1, 0, 0);
    const info = buildGalaxyInfo(cloud, 0, Source.Famous);
    expect(info.famous).toBeUndefined();
  });
});

// ─── buildGalaxyInfo — diameter provenance dispatch ──────────────────────────

describe('buildGalaxyInfo — diameter provenance', () => {
  it('credits the SDSS petroR50_r parser when diameter ≠ default fallback', () => {
    // Any non-30-kpc diameter for an SDSS row is credited to the SDSS catalog
    // measurement — there's no per-row provenance flag in the bin format, so
    // this is the best heuristic the function can offer.
    const cloud = makeCloud(1);
    setPosition(cloud, 0, 100, 0, 0);
    cloud.diameterKpc[0] = 25; // not the 30 kpc fallback
    const info = buildGalaxyInfo(cloud, 0, Source.SDSS);
    expect(info.diameterProvenance).toBe('SDSS petroR50_r');
  });

  it('credits 2MRS Riso for non-default 2MRS diameters', () => {
    const cloud = makeCloud(1);
    setPosition(cloud, 0, 100, 0, 0);
    cloud.diameterKpc[0] = 22;
    const info = buildGalaxyInfo(cloud, 0, Source.TwoMRS);
    expect(info.diameterProvenance).toBe('2MRS Riso');
  });

  it('credits GLADE Tully for non-default GLADE diameters', () => {
    const cloud = makeCloud(1);
    setPosition(cloud, 0, 100, 0, 0);
    cloud.diameterKpc[0] = 18;
    const info = buildGalaxyInfo(cloud, 0, Source.Glade);
    expect(info.diameterProvenance).toBe('GLADE Tully');
  });
});

// ─── buildGalaxyInfo — Milliquas branch ──────────────────────────────────────

describe('buildGalaxyInfo — Milliquas source', () => {
  it('reconstructs "<PARENT> J<RA><Dec>" when parentSurveyByte is set', () => {
    const cloud = makeCloud(1);
    setPosition(cloud, 0, 100, 0, 0);
    // 1 = SDSS — see MILLIQUAS_PARENT_SURVEY_BYTE.SDSS.
    cloud.parentSurveyByte[0] = 1;
    // 1 = Quasar — see MILLIQUAS_CLASS_BYTE.Q.
    cloud.classByte[0] = 1;
    const info = buildGalaxyInfo(cloud, 0, Source.Milliquas);
    expect(info.displayName.startsWith('SDSS J')).toBe(true);
    // The suffix portion must be byte-identical to iauName's
    // (`MQ J…`) suffix — the whole point of iauRaDecSuffix is that
    // the two strings only differ by the prefix.
    expect(info.displayName.slice(5)).toBe(info.iauName.slice(3));
    expect(info.agnClass).toBe('Quasar');
  });

  it('falls back to the IAU "MQ J<RA><Dec>" headline when parentSurveyByte is 0', () => {
    // Literature designation row (3C 273, M 87, …) — both bytes
    // stay at the zero-fill default.
    const cloud = makeCloud(1);
    setPosition(cloud, 0, 100, 0, 0);
    const info = buildGalaxyInfo(cloud, 0, Source.Milliquas);
    expect(info.displayName).toBe(info.iauName);
    expect(info.displayName.startsWith('MQ J')).toBe(true);
    expect(info.agnClass).toBeUndefined();
  });

  it('emits each parent-survey prefix correctly', () => {
    const cases: Array<[number, string]> = [
      [1, 'SDSS'],
      [2, '2MASX'],
      [3, 'GAIA'],
      [4, 'WISEA'],
      [5, 'NVSS'],
      [6, 'FIRST'],
      [7, '6dFGS'],
    ];
    for (const [byte, prefix] of cases) {
      const cloud = makeCloud(1);
      setPosition(cloud, 0, 100, 0, 0);
      cloud.parentSurveyByte[0] = byte;
      const info = buildGalaxyInfo(cloud, 0, Source.Milliquas);
      expect(info.displayName.startsWith(`${prefix} J`)).toBe(true);
    }
  });

  it('exposes the human AGN class label for each Milliquas class byte', () => {
    const cases: Array<[number, string]> = [
      [1, 'Quasar'],
      [2, 'AGN type-1'],
      [3, 'BL Lac'],
      [4, 'Seyfert-1 narrow'],
      [5, 'Seyfert-1 broad'],
      [6, 'Candidate'],
    ];
    for (const [byte, expected] of cases) {
      const cloud = makeCloud(1);
      setPosition(cloud, 0, 100, 0, 0);
      cloud.classByte[0] = byte;
      const info = buildGalaxyInfo(cloud, 0, Source.Milliquas);
      expect(info.agnClass).toBe(expected);
    }
  });

  it('leaves agnClass undefined for non-Milliquas sources even with classByte set', () => {
    const cloud = makeCloud(1);
    setPosition(cloud, 0, 100, 0, 0);
    cloud.classByte[0] = 1; // Would mean "Quasar" if source were Milliquas.
    const info = buildGalaxyInfo(cloud, 0, Source.SDSS);
    expect(info.agnClass).toBeUndefined();
  });
});
