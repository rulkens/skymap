/**
 * Unit tests for `buildGalaxyInfo` — the pure data → display path that the
 * engine uses on every hover/select event.
 *
 * `buildGalaxyInfo` takes a `GalaxyRow` and returns a fully-derived
 * `GalaxyInfo` value. These tests compose
 * `extractGalaxyRow(cloud, idx, source)` → `buildGalaxyInfo(row)` to exercise
 * the per-source dispatch (SDSS / 2MRS / GLADE / Famous / Synthetic /
 * Milliquas / DESI Deep) end-to-end
 * so any cross-cut regression in thumbnails, explorer URLs, IAU names,
 * orientation provenance, or the famous-galaxies-meta block is caught here.
 */

import { describe, it, expect } from 'vitest';
import { buildGalaxyInfo } from '../../../../src/services/engine/helpers/buildGalaxyInfo';
import { extractGalaxyRow } from '../../../../src/services/engine/helpers/extractGalaxyRow';
import { Source } from '../../../../src/data/sources';
import { DESI_TRACER_CLASS } from '../../../../src/data/galaxyCatalog/sourceClass';
import type { GalaxyCatalog } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import { fallbackOrientation } from '../../../../src/utils/random/fallbackOrientation';
import { cartesianToRaDecZ } from '../../../../src/utils/math/cartesianToRaDecZ';
import type { FamousGalaxyMetaEntry } from '../../../../src/@types/loading/FamousGalaxyMetaEntry';
import { makeGalaxyCatalog } from '../../../fixtures/makeGalaxyCatalog';

// ─── Test helpers ───────────────────────────────────────────────────────────

/**
 * Build a synthetic `GalaxyCatalog` of `count` rows via the shared factory,
 * with the orientation/diameter fields seeded to non-fallback-shaped values
 * (0.7 axis ratio, 45° PA, 30 kpc diameter) — every test in this file relies
 * on that baked-in shape, so it stays a thin local wrapper rather than
 * repeating the overrides at each call site.
 */
function makeCloud(count: number): GalaxyCatalog {
  return makeGalaxyCatalog(count, {
    axisRatio: new Float32Array(count).fill(0.7),
    positionAngleDeg: new Float32Array(count).fill(45),
    diameterKpc: new Float32Array(count).fill(30),
  });
}

/** Convenience: extractGalaxyRow then buildGalaxyInfo in one call. */
function buildInfo(
  cloud: GalaxyCatalog,
  idx: number,
  source: Parameters<typeof extractGalaxyRow>[2],
  famousGalaxiesMeta?: readonly FamousGalaxyMetaEntry[],
) {
  return buildGalaxyInfo(extractGalaxyRow(cloud, idx, source, famousGalaxiesMeta)!);
}

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
    // diameterKpc defaults to the flat 30-kpc fallback (see makeCloud) — stamp
    // the matching authoritative flag so diameterProvenance resolves to
    // "fallback (30 kpc)" below.
    cloud.diameterIsFallback[0] = 1;

    const info = buildInfo(cloud, 0, Source.SDSS);

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

    // The primary catalogue link points to the SDSS Quick Look page, labelled
    // "SDSS Explorer", for SDSS rows with a valid objID (> 0n).
    expect(info.catalogues[0]!.label).toBe('SDSS Explorer');
    expect(info.catalogues[0]!.href).toContain('skyserver.sdss.org');
    expect(info.catalogues[0]!.href).toContain('objId=1');

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
    const info = buildInfo(cloud, 0, Source.SDSS);
    expect(info.catalogues[0]!.label).toBe('NED');
    expect(info.catalogues[0]!.href).toContain('ned.ipac.caltech.edu');
    expect(info.catalogues[0]!.href).toContain('Near+Position+Search');
  });

  it('flags orientation provenance as "deterministic fallback" when the persisted flag is set', () => {
    // Provenance now reads the authoritative persisted `orientationIsFallback`
    // byte (threaded through the row), NOT a re-hash of position.  Setting the
    // flag directly is the whole contract.
    const cloud = makeCloud(1);
    setPosition(cloud, 0, 100, 0, 0);
    cloud.orientationIsFallback[0] = 1;
    const info = buildInfo(cloud, 0, Source.SDSS);
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

    const info = buildInfo(cloud, 0, Source.TwoMRS);

    expect(info.source).toBe(Source.TwoMRS);
    expect(info.sourceLabel).toBe('2MRS');
    expect(info.iauName.startsWith('2MASX J')).toBe(true);

    // 2MRS rows resolve via NED's near-position search rather than a
    // 2MASX byname lookup — NED's name index has coverage gaps for
    // 2MASX even when the underlying object is present in NED under a
    // different catalogue name.  See galaxyInfoBuilder.ts for why.
    expect(info.catalogues[0]!.label).toBe('NED');
    expect(info.catalogues[0]!.href).toContain('ned.ipac.caltech.edu');
    expect(info.catalogues[0]!.href).toContain('Near+Position+Search');

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
    const info = buildInfo(cloud, 0, Source.TwoMRS);
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
    const info = buildInfo(cloud, 0, Source.TwoMRS);
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

    const info = buildInfo(cloud, 0, Source.Glade);

    expect(info.source).toBe(Source.Glade);
    expect(info.sourceLabel).toBe('GLADE');
    expect(info.iauName.startsWith('GLADE J')).toBe(true);
    // GLADE row with PGC = 0n → NED coord-search URL.
    expect(info.catalogues[0]!.label).toBe('NED');
    expect(info.catalogues[0]!.href).toContain('ned.ipac.caltech.edu');
    expect(info.catalogues[0]!.href).toContain('Near+Position+Search');
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
    const info = buildInfo(cloud, 0, Source.Glade);
    expect(info.catalogues[0]!.label).toBe('NED');
    expect(info.catalogues[0]!.href).toContain('ned.ipac.caltech.edu/byname');
    expect(info.catalogues[0]!.href).toContain('PGC+12345');
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

    const info = buildInfo(cloud, 0, Source.Synthetic);

    expect(info.source).toBe(Source.Synthetic);
    expect(info.sourceLabel).toBe('Synthetic');
    expect(info.iauName.startsWith('Synth J')).toBe(true);
    expect(info.catalogues).toEqual([]);
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
    const meta: FamousGalaxyMetaEntry[] = [
      {
        id: 'm31',
        names: ['M31', 'Andromeda Galaxy'],
        description: 'Nearest large spiral.',
        type: 'SBb',
      },
    ];

    const info = buildInfo(cloud, 0, Source.FamousGalaxy, meta);

    expect(info.source).toBe(Source.FamousGalaxy);
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

    // The curated morphology is exposed on its own field (the colour
    // classifier yields "Unknown galaxy type" for a row with no photometry).
    expect(info.morphology).toBe('Barred spiral (SBb)');

    // Famous rows carry a NED + Wikipedia catalogue pair.
    expect(info.catalogues.map((c) => c.label)).toEqual(['NED', 'Wikipedia']);
  });

  it('omits the famous block when the sidecar is undefined (graceful degradation)', () => {
    // If the sidecar fetch hasn't resolved yet (or 404'd), buildGalaxyInfo must
    // not crash — the InfoCard simply renders the generic layout for that hover.
    const cloud = makeCloud(1);
    setPosition(cloud, 0, 1, 0, 0);
    const info = buildInfo(cloud, 0, Source.FamousGalaxy);
    expect(info.famous).toBeUndefined();
  });
});

// ─── buildGalaxyInfo — diameter provenance dispatch ──────────────────────────

describe('buildGalaxyInfo — diameter provenance', () => {
  it('credits the SDSS petroR50_r parser when diameterIsFallback is unset', () => {
    // Provenance reads the authoritative persisted `diameterIsFallback` byte
    // (threaded through the row), not a `diameterKpc === 30` heuristic — a
    // genuinely measured 30-kpc galaxy would compare equal to the fallback
    // constant and get mislabeled. makeCloud defaults the flag to 0.
    const cloud = makeCloud(1);
    setPosition(cloud, 0, 100, 0, 0);
    cloud.diameterKpc[0] = 25;
    const info = buildInfo(cloud, 0, Source.SDSS);
    expect(info.diameterProvenance).toBe('SDSS petroR50_r');
  });

  it('credits 2MRS Riso for non-fallback 2MRS diameters', () => {
    const cloud = makeCloud(1);
    setPosition(cloud, 0, 100, 0, 0);
    cloud.diameterKpc[0] = 22;
    const info = buildInfo(cloud, 0, Source.TwoMRS);
    expect(info.diameterProvenance).toBe('2MRS Riso');
  });

  it('credits GLADE Tully for non-fallback GLADE diameters', () => {
    const cloud = makeCloud(1);
    setPosition(cloud, 0, 100, 0, 0);
    cloud.diameterKpc[0] = 18;
    const info = buildInfo(cloud, 0, Source.Glade);
    expect(info.diameterProvenance).toBe('GLADE Tully');
  });

  it('flags diameter provenance as "fallback (30 kpc)" when the persisted flag is set', () => {
    // Mirrors the orientation-provenance flagged-fallback test above: setting
    // the authoritative byte directly is the whole contract, independent of
    // the actual diameterKpc value.
    const cloud = makeCloud(1);
    setPosition(cloud, 0, 100, 0, 0);
    cloud.diameterKpc[0] = 25; // not the flat 30-kpc default
    cloud.diameterIsFallback[0] = 1;
    const info = buildInfo(cloud, 0, Source.SDSS);
    expect(info.diameterProvenance).toBe('fallback (30 kpc)');
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
    const info = buildInfo(cloud, 0, Source.Milliquas);
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
    const info = buildInfo(cloud, 0, Source.Milliquas);
    expect(info.displayName).toBe(info.iauName);
    expect(info.displayName.startsWith('MQ J')).toBe(true);
    expect(info.agnClass).toBeUndefined();
  });

  it('leaves agnClass undefined for non-Milliquas sources even with classByte set', () => {
    const cloud = makeCloud(1);
    setPosition(cloud, 0, 100, 0, 0);
    cloud.classByte[0] = 1; // Would mean "Quasar" if source were Milliquas.
    const info = buildInfo(cloud, 0, Source.SDSS);
    expect(info.agnClass).toBeUndefined();
  });
});

// ─── buildGalaxyInfo — DESI Deep branch ──────────────────────────────────────

describe('buildGalaxyInfo — DESI Deep source', () => {
  it('DESI row shows the IAU-style DESI J designation', () => {
    const cloud = makeCloud(1);
    setPosition(cloud, 0, 100, 0, 0);
    cloud.classByte[0] = DESI_TRACER_CLASS.BGS;
    const info = buildInfo(cloud, 0, Source.DesiDeep);
    expect(info.iauName.startsWith('DESI J')).toBe(true);
    // No famous / Milliquas / PGC rung applies to DESI rows, so the headline
    // falls through the displayName ladder to the coord-based IAU name —
    // the registry's iauPrefix does the work, no DESI-specific branch exists.
    expect(info.displayName).toBe(info.iauName);
    expect(info.sourceLabel).toBe('DESI Deep Field');
  });

  it('DESI row surfaces the tracer population from classByte', () => {
    const cloud = makeCloud(1);
    setPosition(cloud, 0, 100, 0, 0);
    cloud.classByte[0] = DESI_TRACER_CLASS.QSO;
    const info = buildInfo(cloud, 0, Source.DesiDeep);
    expect(info.agnClass).toBe('Quasar (QSO)');
  });

  it('DESI BGS row band labels come from the registry (g/r/z in the G/R/I slots)', () => {
    const cloud = makeCloud(1);
    setPosition(cloud, 0, 100, 0, 0);
    cloud.classByte[0] = DESI_TRACER_CLASS.BGS;
    cloud.magG[0] = 19.0; // g
    cloud.magR[0] = 18.2; // r
    cloud.magI[0] = 17.6; // z — DESI's z-band flux rides in the i slot
    const info = buildInfo(cloud, 0, Source.DesiDeep);
    expect(info.bands).toEqual({ u: '—', g: 'g', r: 'r', i: 'z', z: '—' });
    // BGS photometry is real (Legacy Surveys fluxes) — mags pass through.
    expect(info.magG).toBeCloseTo(19.0, 3);
    expect(info.photometryNote).toBeUndefined();
    // Colour pairs skip the '—' slots, leaving g−r and r−z.
    expect(info.colours.map((c) => c.label)).toEqual(['g−r', 'r−z']);
  });

  it('DESI LRG/ELG/QSO rows suppress magnitudes and show the no-photometry note', () => {
    for (const byte of [DESI_TRACER_CLASS.LRG, DESI_TRACER_CLASS.ELG, DESI_TRACER_CLASS.QSO]) {
      const cloud = makeCloud(1);
      setPosition(cloud, 0, 100, 0, 0);
      cloud.classByte[0] = byte;
      // Simulate the baked-in per-tracer synthetic display constants — the
      // .bin carries these for renderer brightness, but they are NOT
      // measurements and must never reach the InfoCard as photometry.
      cloud.magG[0] = 20.5;
      cloud.magR[0] = 20.0;
      cloud.magI[0] = 19.5;
      const info = buildInfo(cloud, 0, Source.DesiDeep);
      expect(Number.isNaN(info.magG)).toBe(true);
      expect(Number.isNaN(info.absoluteMagG)).toBe(true);
      expect(info.colours).toEqual([]);
      expect(info.photometryNote).toBe('no photometry in source catalog');
    }
  });
});
