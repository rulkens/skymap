#!/usr/bin/env node
/**
 * buildAllBins — cross-match three real catalogues and write one .bin per source.
 *
 * Usage:
 *   npm run build-all -- \
 *     --sdss    path/to/sdss.csv \
 *     --twomrs  path/to/2mrs_table3.dat \
 *     --glade   path/to/glade2.3.dat \
 *     --out-dir public/data
 *
 * Output files: sdss.bin, 2mrs.bin, glade.bin (one per source).
 *
 * Cross-match dedup:
 *   - Priority: SDSS > 2MRS > GLADE > DESI patches. See `tools/crossMatch.ts`
 *     for the full algorithm and tolerances.
 *   - GLADE is itself a pre-merged catalogue (2MPZ + 2MASS XSC + HyperLEDA
 *     + GWGC + 6dFGS + SDSS-DR12Q), so we only need to dedup it against
 *     SDSS and against 2MRS — not against its own constituents.
 *   - The DESI patches (deep cone, dec-band wedge) are lowest priority: their
 *     rows are the same galaxies the other three surveys already catalogue, so
 *     they're fed through the same dedup pass rather than bypassing it the way
 *     Milliquas does below. Each patch dedups against the base surveys and its
 *     own rows, but NOT against sibling patches (see `loadDesiPatch` /
 *     `crossMatch.ts`).
 *
 * Why are `crossMatch` and the CLI in different files?
 *   This wrapper imports `node:fs`, `node:path`, `node:url`. The main
 *   `tsconfig.json` deliberately excludes `tools/` and does not pull in
 *   `@types/node`, so a test under `tests/` that transitively imported
 *   Node APIs would fail typecheck. Keeping the dedup logic in
 *   `tools/crossMatch.ts` (Node-free) lets `tests/crossMatch.test.ts`
 *   exercise it without dragging Node types into the browser-side build.
 *   This module re-exports `crossMatch` so callers (and the test) can
 *   import it from the `buildAllBins` path.
 */
import {
  createReadStream,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import type { SourceType } from '../../src/@types/data/SourceType';

import { parseSdssCsv } from '../parsers/sdssCsv';
import { parseTwoMrs, parseXscShapeCsv } from '../parsers/twoMrs';
import type { XscShapeMap } from '../parsers/twoMrs';
import { parseGladeLine, parseGlade2masxPgcLine, parseHyperLedaCsv } from '../parsers/glade';
import type { HyperLedaShapeMap } from '../parsers/glade';
import { parseMilliquas } from '../parsers/milliquas';
import type { MilliquasParseResult } from '../parsers/milliquas';
import { parseDesiClustering } from '../parsers/desiFits';
import type { DesiTracer } from '../parsers/desiFits';
import type { ParsedRecord } from '../parsers/common';
import { crossMatch } from './crossMatch';
import { dropFamousMatches } from './dropFamousMatches';
import type { FamousSkyPosition } from './dropFamousMatches';
import { parseFamousSeed } from '../parsers/famousSeed';
import { DESI_PATCHES, DESI_TRACER_FILE_KEYS } from './desiPatches';
import type { DesiPatch } from './desiPatches';

import { encodeGalaxyCatalog } from '../../src/data/galaxyCatalog/galaxyCatalogFormat';
import { raDecZToCartesian } from '../../src/utils/math/index';
import { raDecDistToCartesian } from '../../src/utils/math/raDecDistToCartesian';
import { redshiftToDistanceMpc } from '../../src/utils/math/redshiftToDistanceMpc';
import { fallbackOrientation } from '../../src/utils/random/fallbackOrientation';
import { catalogDistanceFor } from './catalogDistanceFor';
import type { LocalVolumeDistanceSeed } from './catalogDistanceFor';
import { loadLocalVolumeDistanceSeed } from './loadLocalVolumeDistanceSeed';
import { arcsecToKpc } from '../../src/utils/math/arcsecToKpc';
import { CUTOFF_MPC } from './localVolumeCutoff';
import type { Cf4CatalogIndex } from '../parsers/cosmicflows4';
import { loadCf4CatalogIndex } from '../parsers/cosmicflows4';
import { DEFAULT_GALAXY_DIAMETER_KPC } from '../../src/utils/math/defaultGalaxyDiameterKpc';
import { Source, SOURCE_REGISTRY } from '../../src/data/sources';
import type { GalaxyCatalog } from '../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import {
  tierTarget,
  tierFilenameForSource,
  fluxSupplementMagLimitFor,
} from '../../src/data/tierTargets';
import type { Tier } from '../../src/@types/data/Tier';
import { selectTierRecords } from './selectTierRecords';
import { rawDataPath } from '../utils/io/rawDataRegistry';
import { estimateLog10StellarMass } from './estimateLog10StellarMass';

// Re-export so `tests/crossMatch.test.ts` and any other consumer can keep
// using the documented `tools/buildAllBins` import path.
export { crossMatch } from './crossMatch';
export type { CrossMatchInputs } from './crossMatch';

// ─── GalaxyCatalog assembly + write ──────────────────────────────────────────

/**
 * Pre-built catalog indices for the local-volume distance override.
 *
 * Both maps are pre-computed (per call to runCli, once for the whole
 * build) so the per-record lookup in `recordsToCloud` is O(1) — see the
 * `catalogDistanceFor` docstring for the precedence rules.
 */
export type LocalVolumeOverrides = {
  cf4: Cf4CatalogIndex;
  hyperLeda: HyperLedaShapeMap;
  /**
   * Curated redshift-independent distances for galaxies CF4 and the partial
   * HyperLEDA cache both miss — chiefly the blueshifted 2MRS rows. Checked
   * first in `catalogDistanceFor`. Empty map when the seed file is absent.
   */
  blueshiftSeed: LocalVolumeDistanceSeed;
};

/**
 * Materialise a survey-specific subset of merged records into the SoA
 * `GalaxyCatalog` shape the binary encoder expects.
 *
 * Allocating each typed array exactly once at the known final size keeps
 * the hot fill loop tight — no per-row push() overhead, no hidden
 * reallocations, and the resulting buffers are GPU-upload-ready.
 *
 * `overrides`: when provided, every record's position is replaced with
 * the CF4 / HyperLEDA measured distance if (a) the catalog match returns
 * a distance and (b) the matched distance is below `CUTOFF_MPC`. The
 * catalogued spectroscopic z stays on `cloud.spectroscopicZ` regardless,
 * so the InfoCard displays the published value even when the override
 * fires (e.g. M31's z = −0.001 stays visible while the position sits at
 * 0.78 Mpc). When `overrides` is null the cz-only path runs for every
 * record — used by unit tests that exercise the SoA fill loop in
 * isolation.
 */
export function recordsToCloud(
  records: ParsedRecord[],
  overrides: LocalVolumeOverrides | null = null,
): GalaxyCatalog {
  const count = records.length;
  const cloud: GalaxyCatalog = {
    count,
    objIDs: new BigUint64Array(count),
    positions: new Float32Array(count * 3),
    magU: new Float32Array(count),
    magG: new Float32Array(count),
    magR: new Float32Array(count),
    magI: new Float32Array(count),
    magZ: new Float32Array(count),
    axisRatio: new Float32Array(count),
    positionAngleDeg: new Float32Array(count),
    diameterKpc: new Float32Array(count),
    classByte: new Uint8Array(count),
    parentSurveyByte: new Uint8Array(count),
    spectroscopicZ: new Float32Array(count),
    orientationIsFallback: new Uint8Array(count),
    diameterIsFallback: new Uint8Array(count),
    log10StellarMass: new Float32Array(count),
  };
  let overridesApplied = 0;
  for (let i = 0; i < count; i++) {
    // `records[i]` is `ParsedRecord | undefined` under noUncheckedIndexedAccess.
    // We loop with i < count === records.length, so the `!` is safe.
    const r = records[i]!;
    let x: number;
    let y: number;
    let z: number;
    const overrideHit =
      overrides !== null
        ? catalogDistanceFor(r, overrides.cf4, overrides.hyperLeda, overrides.blueshiftSeed)
        : null;
    if (overrideHit !== null && overrideHit.distMpc < CUTOFF_MPC) {
      // Inside-cutoff catalog match: use the measured distance for the
      // cartesian position. The catalogued z still lands on
      // cloud.spectroscopicZ[i] below, so the InfoCard's "Redshift z"
      // line keeps showing the published value.
      [x, y, z] = raDecDistToCartesian(r.ra, r.dec, overrideHit.distMpc);
      overridesApplied++;
    } else if (r.z < 0) {
      // Blueshifted row with no redshift-independent distance. The cz path
      // (raDecZToCartesian) would run a negative Hubble distance and mirror
      // the galaxy through the origin to an antipodal position — wrong
      // hemisphere, not just wrong distance. Place it in its TRUE direction at
      // |distance| instead: a wrong distance is far less wrong than a wrong
      // patch of sky, and it still avoids stacking on the origin. The
      // local-volume seed already fixes the ones we have real distances for;
      // this is the safety net for those we don't (heavily-extincted
      // Zone-of-Avoidance dwarfs with no measured distance anywhere).
      [x, y, z] = raDecDistToCartesian(r.ra, r.dec, Math.abs(redshiftToDistanceMpc(r.z)));
    } else {
      // No catalog match, or the match is past the cutoff (in which case
      // the Hubble-flow distance is good enough that the extra dependency
      // isn't worth it — see CUTOFF_MPC docstring).
      [x, y, z] = raDecZToCartesian(r.ra, r.dec, r.z);
    }
    cloud.objIDs[i] = r.objID;
    cloud.positions[i * 3 + 0] = x;
    cloud.positions[i * 3 + 1] = y;
    cloud.positions[i * 3 + 2] = z;
    // Adopted distance — the one the position above just used (override,
    // blueshift-safety, or Hubble flow) — feeds both the angular-diameter
    // re-derivation below and the stellar-mass estimator.
    const adoptedDistMpc = Math.hypot(x, y, z);
    cloud.magU[i] = r.magU;
    cloud.magG[i] = r.magG;
    cloud.magR[i] = r.magR;
    cloud.magI[i] = r.magI;
    cloud.magZ[i] = r.magZ;
    // Orientation: prefer the parser-supplied real value (SDSS PhotoObj for
    // SDSS, 2MASS XSC for 2MRS, HyperLEDA for GLADE). When the parser
    // emitted `null` for either field — meaning the survey simply doesn't
    // have a measurement for that galaxy — fall back to the deterministic
    // hash-based orientation so every encoded point has a finite (axisRatio,
    // PA) pair. The hash uses (objID, ra, dec) so reload yields the same
    // tilt every time.
    //
    // This branch is the ONE place that knows real-vs-fallback for certain,
    // so it stamps `orientationIsFallback` here (the single source of truth).
    // Persisting the byte spares the load side from re-deriving the flag by
    // re-hashing the baked f32 position and comparing floats — a lossy
    // round-trip that misclassified ~10 % of fallback rows.
    if (r.axisRatio !== null && r.positionAngleDeg !== null) {
      cloud.axisRatio[i] = r.axisRatio;
      cloud.positionAngleDeg[i] = r.positionAngleDeg;
      cloud.orientationIsFallback[i] = 0;
    } else {
      const fb = fallbackOrientation(r.objID, r.ra, r.dec);
      cloud.axisRatio[i] = fb.axisRatio;
      cloud.positionAngleDeg[i] = fb.positionAngleDeg;
      cloud.orientationIsFallback[i] = 1;
    }
    // Diameter: prefer the parser-supplied real measurement (2MRS Riso,
    // GLADE Tully(Bmag), SDSS petroR50_r).  When the parser couldn't
    // extract a real value, fall back to DEFAULT_GALAXY_DIAMETER_KPC = 30
    // so the encoded cloud always carries a finite, positive diameter.
    //
    // Why apply the fallback here rather than inside each parser?  Three
    // reasons: (1) a single source-of-truth for the default value, (2)
    // swapping the fallback to a pgc-keyed lookup (e.g. HyperLEDA logd25)
    // wouldn't touch every parser, and (3) the null/finite distinction at
    // the parser boundary doubles as the provenance signal for the
    // InfoCard's "real / Tully / fallback" chip.
    // Diameter precedence:
    //   1. the parser's distance-baked physical diameter (2MRS cz > 0 Riso,
    //      GLADE Tully, SDSS petroR50), when it produced a finite positive one;
    //   2. else re-derive from the parser's raw *angular* size against the
    //      distance we actually adopted above — this is what rescues the
    //      blueshifted 2MRS rows, whose cz-baked diameterKpc was null but whose
    //      Riso angular size is real and now pairs with a real seed distance;
    //   3. else the flat DEFAULT_GALAXY_DIAMETER_KPC = 30.
    let diameterKpc = r.diameterKpc !== null && r.diameterKpc > 0 ? r.diameterKpc : null;
    if (diameterKpc === null && r.angularMajorAxisArcsec !== undefined) {
      const fromAngular = arcsecToKpc(r.angularMajorAxisArcsec, adoptedDistMpc);
      if (Number.isFinite(fromAngular) && fromAngular > 0) diameterKpc = fromAngular;
    }
    // `diameterKpc === null` here means both attempts failed — no measured
    // size and no angular size to re-derive one — so the row falls through to
    // the flat DEFAULT_GALAXY_DIAMETER_KPC = 30. Stamp the authoritative
    // fallback signal on that exact distinction (single source of truth,
    // mirroring the orientationIsFallback stamp above) so the load side never
    // has to guess via a lossy `diameterKpc === 30` compare.
    cloud.diameterIsFallback[i] = diameterKpc === null ? 1 : 0;
    cloud.diameterKpc[i] = diameterKpc ?? DEFAULT_GALAXY_DIAMETER_KPC;
    // Per-source classification byte (e.g. Milliquas AGN class
    // letter → 1..6).  Every parser that doesn't carry a class
    // signal leaves r.classByte at 0, so we copy unconditionally.
    cloud.classByte[i] = r.classByte;
    // Milliquas-only parent-survey enum (1=SDSS, 2=2MASX, …).
    // Zero for every non-Milliquas parser.  See sourceClass.ts for
    // the full enum.
    cloud.parentSurveyByte[i] = r.parentSurveyByte;
    // Catalogued spectroscopic redshift, stored separately from
    // position so the InfoCard shows the published catalog value even
    // when the CF4 / HyperLEDA override above replaces position with a
    // measured distance. We read from r.spectroscopicZ (not r.z) so a
    // future override that wants to *change* r.z (e.g. a
    // peculiar-velocity correction) doesn't accidentally leak into the
    // InfoCard's display channel.
    cloud.spectroscopicZ[i] = r.spectroscopicZ;
    cloud.log10StellarMass[i] = estimateLog10StellarMass({
      source: r.source,
      magU: r.magU,
      magG: r.magG,
      magR: r.magR,
      magI: r.magI,
      magZ: r.magZ,
      distMpc: adoptedDistMpc,
    });
  }
  if (overrides !== null && overridesApplied > 0) {
    process.stderr.write(
      `  local-volume override: ${overridesApplied.toLocaleString()} of ${count.toLocaleString()} positions replaced (CF4 / HyperLEDA)\n`,
    );
  }
  return cloud;
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

type ParserFn = (raw: string) => { records: ParsedRecord[]; skipped: number };

/**
 * Find the most recently modified `Skyserver_*.csv` in the given directory.
 *
 * SkyServer's web export names every download with a timestamped filename
 * (e.g. `Skyserver_CrossID5_3_2026 7_59_27 PM.csv`), so when the user
 * downloads a new pull the previous one stays on disk under a different
 * name.  A hard-coded filename in `package.json`'s `build-all` script
 * would silently ignore every new download until someone updated the
 * script — building stale data with no warning.
 *
 * Strategy: glob `Skyserver_*.csv`, sort by mtime descending, return the
 * first entry's path.  Returns undefined when the directory has no match,
 * letting the caller print a clear "missing input" error.
 *
 * Why mtime rather than parsing the filename?  The SkyServer naming
 * scheme has shifted twice already (CrossID vs SQL prefixes, locale-
 * dependent AM/PM markers); mtime is the one signal that's portable
 * across all of them.
 */
function findLatestSdssCsv(dir: string): string | undefined {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return undefined;
  }
  const matches = entries
    .filter((name) => name.startsWith('Skyserver_') && name.endsWith('.csv'))
    .map((name) => {
      const full = join(dir, name);
      const mtime = statSync(full).mtimeMs;
      return { full, mtime };
    })
    .sort((a, b) => b.mtime - a.mtime);
  return matches[0]?.full;
}

/**
 * Parse `--key value` pairs into a flat record. Order is irrelevant; missing
 * flags surface as `undefined` keys at the call site rather than throwing
 * here, so the caller can decide which flags are required.
 */
function readArgs(): Record<string, string> {
  const out: Record<string, string> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      out[a.slice(2)] = argv[i + 1] ?? '';
      i++;
    }
  }
  return out;
}

/**
 * Load a catalog file if a path was supplied; otherwise return an empty
 * record list. Returning `[]` for missing inputs (rather than erroring)
 * lets the CLI run a partial build — e.g. only SDSS + 2MRS while we wait
 * for the GLADE download — which is handy during pipeline development.
 */
function loadOrEmpty(path: string | undefined, parser: ParserFn): ParsedRecord[] {
  if (!path) return [];
  const text = readFileSync(resolve(path), 'utf8');
  const { records, skipped } = parser(text);
  process.stderr.write(
    `  loaded ${records.length.toLocaleString()} records (skipped ${skipped.toLocaleString()})\n`,
  );
  return records;
}

/**
 * Load + parse the Milliquas v8 fixed-width file.
 *
 * Why a Milliquas-specific loader rather than another `loadOrEmpty`
 * call? `loadOrEmpty` returns just `ParsedRecord[]` and reports a flat
 * `skipped` count, but the Milliquas parser surfaces a structured
 * skip breakdown (z=blank vs z=0 vs photo-z vs GAIA3 QSOC) that's
 * worth printing as the operator's eyes-on signal during a build.
 * Wrapping the parser here keeps that reporting close to the load
 * site without forcing `ParserFn` to grow a richer return shape every
 * parser would have to honour.
 *
 * Missing-file tolerance mirrors `loadOrEmpty`: the raw 194 MB
 * upstream file is gitignored, so a fresh checkout won't have it.
 * We return an empty result so `npm run build-tiers` still produces
 * the SDSS/2MRS/GLADE bins for a contributor who hasn't run the
 * `fetch-milliquas` step yet.
 */
function loadMilliquas(path: string | undefined): MilliquasParseResult {
  const empty: MilliquasParseResult = {
    records: [],
    skipped: { zMissing: 0, zNonPositive: 0, photoZRounded: 0, qsocRounded: 0 },
  };
  if (!path) return empty;
  const full = resolve(path);
  if (!existsSync(full)) {
    process.stderr.write(`  ${path} not present — Milliquas bin will be empty\n`);
    return empty;
  }
  const text = readFileSync(full, 'utf8');
  const result = parseMilliquas(text);
  const { records, skipped } = result;
  const skippedTotal =
    skipped.zMissing + skipped.zNonPositive + skipped.photoZRounded + skipped.qsocRounded;
  process.stderr.write(
    `  loaded ${records.length.toLocaleString()} records ` +
      `(skipped ${skippedTotal.toLocaleString()}: ` +
      `z=blank ${skipped.zMissing.toLocaleString()}, ` +
      `z<=0 ${skipped.zNonPositive.toLocaleString()}, ` +
      `photo-z ${skipped.photoZRounded.toLocaleString()}, ` +
      `GAIA3 QSOC ${skipped.qsocRounded.toLocaleString()})\n`,
  );
  return result;
}

/**
 * Load + filter the four DESI DR1 LSS clustering FITS files for ONE patch
 * (the deep cone, the dec-band wedge, …) into a merged `ParsedRecord[]`,
 * stamped with the patch's source and ready to feed into `crossMatch` as one
 * of `desiPatches`.
 *
 * The patch supplies both its membership filter (`patch.makeFilter()`) and the
 * `Source` every kept row is stamped with, so the four-tracer read loop is
 * identical across geometries — a new patch is one `DESI_PATCHES` row, not a
 * cloned loader.
 *
 * Missing-file tolerant, per-tracer: the combined ~773 MB download is
 * gitignored (`npm run fetch-desi`), so a fresh checkout without it must
 * still build every other bin. Each of the four tracers is checked
 * independently — a partial download (e.g. BGS present, QSO not yet
 * fetched) still contributes whatever tracers ARE on disk, rather than
 * an all-or-nothing gate.
 *
 * Buffer→ArrayBuffer gotcha: `readFileSync` returns a `Buffer`, which is
 * a `Uint8Array` *view* over a possibly-pooled underlying `ArrayBuffer`
 * (Node batches small allocations into shared pools for efficiency). The
 * FITS parser wants a real `ArrayBuffer` sized to exactly this file's
 * bytes, not the whole shared pool, so we slice `buf.buffer` down to
 * `buf.byteOffset .. buf.byteOffset + buf.byteLength` explicitly rather
 * than handing `buf.buffer` straight through — the naive `buf.buffer`
 * would (at best) misalign every FITS header-card offset the parser
 * computes, and (at worst) read a different file's neighbouring pool
 * bytes.
 */
function loadDesiPatch(patch: DesiPatch): ParsedRecord[] {
  const keep = patch.makeFilter();
  const records: ParsedRecord[] = [];
  let anyFilePresent = false;

  for (const tracer of Object.keys(DESI_TRACER_FILE_KEYS) as DesiTracer[]) {
    const path = rawDataPath(DESI_TRACER_FILE_KEYS[tracer]);
    if (!existsSync(path)) {
      process.stderr.write(`  [${patch.key}] ${path} not present — ${tracer} tracer skipped\n`);
      continue;
    }
    anyFilePresent = true;
    const buf = readFileSync(path);
    const arrayBuf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const { records: tracerRecords, skipped } = parseDesiClustering(
      arrayBuf,
      tracer,
      patch.source,
      keep,
    );
    process.stderr.write(
      `  [${patch.key}] ${tracer}: ${tracerRecords.length.toLocaleString()} kept ` +
        `(skipped ${skipped.toLocaleString()} data-quality drops)\n`,
    );
    records.push(...tracerRecords);
  }

  if (!anyFilePresent) {
    process.stderr.write(
      `  [${patch.key}] no DESI DR1 files present (run \`npm run fetch-desi\`) — .bin will be empty/skipped\n`,
    );
  }
  return records;
}

/**
 * Streaming variant of `loadOrEmpty` for the GLADE catalog.
 *
 * Why a separate code path for GLADE? The released v2.3 file is ~800 MB.
 * V8 caps each JavaScript string at ~512 MB (`ERR_STRING_TOO_LONG`), so a
 * single `readFileSync(..., 'utf8')` throws before we get a chance to
 * parse anything. Streaming the file through `readline` reads it in
 * 64 KB chunks and surfaces complete lines, which we feed through
 * `parseGladeLine` one at a time — the same row-filter logic the
 * all-at-once `parseGlade` uses, just without the giant string in the
 * middle.
 *
 * SDSS and 2MRS comfortably fit under the string cap (~45 MB and ~10 MB
 * respectively), so they keep the simpler `readFileSync` path.
 */
async function loadGladeStream(
  path: string | undefined,
  options: { specZOnly?: boolean; isotropic?: boolean } = {},
  hyperLeda: HyperLedaShapeMap = new Map(),
  // OUT-parameter: GLADE rows with both a real PGC and a real 2MASX name
  // populate this map as a side-effect of the streaming parse.  The
  // 2MRS post-processing pass in runCli below uses it to patch PGCs
  // into 2MRS records' objID slot, so the InfoCard's NED catalogue
  // link can resolve via `?objname=PGC+<n>` instead of the fuzzy
  // near-position-search fallback.
  //
  // Optional so existing tests / callers that don't need the map can
  // omit it without paying the per-row map-write cost.  We populate
  // the map from the *raw line* regardless of whether parseGladeLine
  // accepted or rejected the row — even rows we skip (quasars,
  // no-distance bookkeeping rows) carry valid 2MASX→PGC mappings that
  // a 2MRS row sharing the same XSC cross-ID can legitimately benefit
  // from.  See parseGlade2masxPgcLine's docstring for the full
  // rationale.
  pgcByMassId?: Map<string, bigint>,
): Promise<ParsedRecord[]> {
  if (!path) return [];

  const records: ParsedRecord[] = [];
  let skipped = 0;

  // crlfDelay: Infinity tells readline to treat \r\n as a single line
  // terminator — important on Windows-converted catalog dumps. The
  // chunked reader transparently handles UTF-8 byte-boundary issues.
  const rl = createInterface({
    input: createReadStream(resolve(path)),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (line.length === 0) continue;
    const rec = parseGladeLine(line, options, hyperLeda);
    if (rec === null) {
      skipped++;
    } else {
      records.push(rec);
    }
    // Harvest the 2MASX→PGC mapping from the same line, independently
    // of whether parseGladeLine accepted it as a renderable record.
    // Single-pass over the file keeps the I/O cost flat regardless of
    // whether the caller supplied a map.
    if (pgcByMassId) {
      const pair = parseGlade2masxPgcLine(line);
      if (pair) pgcByMassId.set(pair.massId, pair.pgc);
    }
  }

  process.stderr.write(
    `  loaded ${records.length.toLocaleString()} records (skipped ${skipped.toLocaleString()})\n`,
  );
  return records;
}

/**
 * The CLI entry point. Kept in its own function so that importing this
 * module from a test does not trigger argv parsing or `process.exit`.
 *
 * Async because the GLADE loader is streaming — see `loadGladeStream`.
 */
async function runCli(): Promise<void> {
  const args = readArgs();

  // Reasonable defaults so `npm run build-all` works with no flags after
  // the user drops fresh catalog files into the canonical paths:
  //   - SDSS: newest `data/raw/sdss/Skyserver_*.csv` by mtime (auto-picked)
  //   - 2MRS: `data/raw/2mrs/2mrs_table3.dat` (filename is stable on Vizier)
  //   - GLADE: `data/raw/glade/glade2.3.dat` (likewise)
  //   - out-dir: `public/data` (Vite serves this at /data/* in the browser)
  // Each can be overridden with the matching --key flag.
  const sdssArg = args.sdss || findLatestSdssCsv(rawDataPath('sdss.dir')) || '';
  const twomrsArg = args.twomrs || rawDataPath('2mrs.table3');
  const gladeArg = args.glade || rawDataPath('glade.v23');
  const milliquasArg = args.milliquas || rawDataPath('milliquas.txt');
  const outDirArg = args['out-dir'] || 'public/data';

  if (sdssArg) {
    process.stderr.write(
      `SDSS source: ${sdssArg}${args.sdss ? '' : '  (auto-detected, latest by mtime)'}\n`,
    );
  } else {
    process.stderr.write(
      'warning: no SDSS CSV supplied AND no Skyserver_*.csv found in data/raw/sdss/ — SDSS bin will be empty\n',
    );
  }

  // Re-bind the args record so the rest of the function (which still reads
  // args.sdss, args.twomrs, etc.) sees the resolved paths uniformly.
  args.sdss = sdssArg;
  args.twomrs = twomrsArg;
  args.glade = gladeArg;
  args.milliquas = milliquasArg;
  args['out-dir'] = outDirArg;

  // `--glade-spec-only` is a value-less boolean flag; readArgs() consumed the
  // next argv entry into its value, but the presence of the key is what we
  // care about.  Treat any non-empty key occurrence as opt-in.
  const gladeSpecOnly = 'glade-spec-only' in args;
  if (gladeSpecOnly) {
    process.stderr.write(
      'GLADE filter: spec-z only (drops 2MPZ photo-z entries to reveal filaments)\n',
    );
  }

  // `--glade-isotropic`: drop rows whose only parent catalogue is SDSS-DR12,
  // which covers ~1/3 of the sky and otherwise creates pencil-beam radial
  // "jets" beyond ~600 Mpc.  Independent of `--glade-spec-only`; user can
  // enable either, both, or neither.  We use `process.argv.includes` here
  // rather than `'glade-isotropic' in args` because the previous-flag
  // treatment is itself a quirk of `readArgs` consuming the next argv slot,
  // and the argv-includes check is the more direct "is the flag set?" test.
  const gladeIsotropic = process.argv.includes('--glade-isotropic');
  if (gladeIsotropic) {
    process.stderr.write(
      'GLADE filter: isotropic (drops SDSS-DR12-only rows to remove pencil-beam jets)\n',
    );
  }

  // Load the optional orientation caches before any parsing kicks off.
  // Both files are produced by separate `tools/fetch*.ts` scripts and may
  // not yet exist on a fresh checkout — that's intentional. A missing cache
  // simply means every 2MRS / GLADE row in this build will fall through to
  // the deterministic `fallbackOrientation` in `recordsToCloud` below; the
  // pipeline keeps working, just with hash-derived disk tilts instead of
  // measured ones. We log loud warnings rather than silently substituting,
  // so the operator sees exactly what they're getting.
  const xscPath = rawDataPath('2mrs.xsc-pa');
  let xsc: XscShapeMap = new Map();
  try {
    xsc = parseXscShapeCsv(readFileSync(xscPath, 'utf8'));
    process.stderr.write(`loaded ${xsc.size.toLocaleString()} 2MASS XSC orientations\n`);
  } catch {
    process.stderr.write(`warning: ${xscPath} not present — 2MRS orientation = fallback only\n`);
  }

  const ledaPath = rawDataPath('hyperleda.pa');
  let leda: HyperLedaShapeMap = new Map();
  try {
    leda = parseHyperLedaCsv(readFileSync(ledaPath, 'utf8'));
    process.stderr.write(`loaded ${leda.size.toLocaleString()} HyperLEDA orientations\n`);
  } catch {
    process.stderr.write(`warning: ${ledaPath} not present — GLADE orientation = fallback only\n`);
  }

  // CF4 + HyperLEDA-mod0 indices for the local-volume distance override
  // (galaxies inside CUTOFF_MPC). loadCf4CatalogIndex is missing-file
  // tolerant — a fresh checkout without the raw CF4 download still
  // produces .bin outputs, just without the override fired.
  const cf4Index = loadCf4CatalogIndex();
  // Curated redshift-independent distances for the blueshifted local-volume
  // galaxies CF4 + HyperLEDA miss. Missing-file tolerant (returns empty map).
  const blueshiftSeed = loadLocalVolumeDistanceSeed();
  if (blueshiftSeed.size > 0) {
    process.stderr.write(`loaded ${blueshiftSeed.size} curated local-volume distance(s)\n`);
  }
  const overrides: LocalVolumeOverrides = { cf4: cf4Index, hyperLeda: leda, blueshiftSeed };

  process.stderr.write('parsing SDSS…\n');
  const sdss = loadOrEmpty(args.sdss, parseSdssCsv);
  process.stderr.write('parsing 2MRS…\n');
  const twoMrs = loadOrEmpty(args.twomrs, (raw) => parseTwoMrs(raw, xsc));
  // 2MASX-name → PGC map, populated as a side effect of the GLADE
  // streaming parse below.  We allocate it in runCli (not inside
  // loadGladeStream) so the post-GLADE 2MRS-patching pass can read it
  // back without a second pass over GLADE's 800 MB file.  Empty when
  // GLADE isn't supplied; the patching loop just no-ops in that case.
  const pgcByMassId = new Map<string, bigint>();

  process.stderr.write('parsing GLADE (streaming)…\n');
  const glade = await loadGladeStream(
    args.glade,
    { specZOnly: gladeSpecOnly, isotropic: gladeIsotropic },
    leda,
    pgcByMassId,
  );

  process.stderr.write('parsing Milliquas…\n');
  const milliquasResult = loadMilliquas(args.milliquas);

  process.stderr.write('parsing DESI DR1 patches (per-geometry filtered)…\n');
  // One record array per patch, in DESI_PATCHES order. Each already carries
  // its own source (stamped by loadDesiPatch), so crossMatch dedups it against
  // the base surveys + its own rows but not against sibling patches, and the
  // per-source bin-emit loop buckets each patch to its own .bin automatically.
  const desiPatches = DESI_PATCHES.map((patch) => loadDesiPatch(patch));

  // ── Cross-pollinate PGCs from GLADE into 2MRS ──────────────────────────
  //
  // 2MRS's source file has no PGC column, so its records initially
  // carry `objID = 0n` and the runtime InfoCard's NED catalogue link
  // falls back to a near-position search — which can land on the
  // wrong galaxy in dense fields.  GLADE's source rows DO carry both
  // PGC (bytes 1-7) and the matching 2MASS XSC name (bytes 68-83);
  // `loadGladeStream` populated `pgcByMassId` from those fields above.
  //
  // Walk the parsed 2MRS records once and patch the objID slot
  // whenever GLADE has a corresponding 2MASX→PGC mapping.  Uncovered
  // rows (the long tail — typically <5 % for this nearby-galaxy
  // catalogue, since GLADE was specifically built to merge 2MASS XSC
  // and HyperLEDA) keep `objID = 0n` and continue to use the
  // near-position fallback URL downstream.
  //
  // We rebuild the record via spread rather than mutating the existing
  // object so the change is visible in any future debugging snapshot
  // of `twoMrs[]` taken before this point — and the spread is cheap
  // at 2MRS's scale (~45 k rows total).
  let twoMrsPatched = 0;
  for (let i = 0; i < twoMrs.length; i++) {
    const r = twoMrs[i]!;
    // r.massId can be absent on records built outside parseTwoMrs
    // (e.g. test fixtures) — defensive check, not load-bearing in the
    // CLI path where parseTwoMrs always populates it.
    if (!r.massId) continue;
    const pgc = pgcByMassId.get(r.massId);
    if (pgc !== undefined) {
      twoMrs[i] = { ...r, objID: pgc };
      twoMrsPatched++;
    }
  }
  if (twoMrs.length > 0) {
    const pct = ((twoMrsPatched / twoMrs.length) * 100).toFixed(1);
    process.stderr.write(
      `  2MRS PGC cross-match: ${twoMrsPatched.toLocaleString()} of ${twoMrs.length.toLocaleString()} matched (${pct}%)\n`,
    );
  }

  // Capture per-source input counts up front so the summary can report
  // the dedup drop rate per survey, not just the merged total.
  const inputCounts: Record<number, number> = {
    [Source.SDSS]: sdss.length,
    [Source.TwoMRS]: twoMrs.length,
    [Source.Glade]: glade.length,
  };
  DESI_PATCHES.forEach((patch, i) => {
    inputCounts[patch.source] = desiPatches[i]!.length;
  });

  process.stderr.write('cross-matching…\n');
  const mergedRaw = crossMatch({ sdss, twoMrs, glade, desiPatches });
  process.stderr.write(`  ${mergedRaw.length.toLocaleString()} records survived dedup\n`);

  // Drop catalog rows that match a famous-galaxy seed position. The famous
  // layer (famous.bin, built later by buildFamous.ts) carries hand-curated
  // entries for ~75 well-known galaxies with their own positions,
  // thumbnails, and metadata. Without this dedup each famous galaxy
  // renders twice — once from the catalog layer, once from the famous
  // layer — and because the local-volume distance override puts the
  // catalog row at the same measured distance as the curated entry
  // (~0.03 Mpc apart for M31), the two billboards overlap on screen.
  //
  // Threshold: 30 arcsec — same scale used by the rest of the build for
  // catalog cross-matches; close enough to catch the local-volume
  // duplicates (M31 / NGC 147 / NGC 185).
  let famousPositions: ReadonlyArray<FamousSkyPosition> = [];
  try {
    const seedRaw = readFileSync(rawDataPath('famous.seed'), 'utf8');
    famousPositions = parseFamousSeed(seedRaw).map((e) => ({ ra: e.ra, dec: e.dec }));
    process.stderr.write(
      `  famous-seed dedup: ${famousPositions.length} reference positions loaded\n`,
    );
  } catch (err) {
    process.stderr.write(
      `  warning: famous seed not loadable (${(err as Error).message}) — skipping famous-vs-catalog dedup\n`,
    );
  }
  const { kept: merged, dropped: famousDropped } = dropFamousMatches(
    mergedRaw,
    famousPositions,
    30,
  );
  if (famousDropped > 0) {
    process.stderr.write(
      `  famous-seed dedup: dropped ${famousDropped.toLocaleString()} catalog rows that match a famous-seed position\n`,
    );
  }

  // Bucket the merged stream back out per source so we can write one
  // file per survey. Using a Map preserves insertion order, which keeps
  // the log output tidy.
  const bySource = new Map<SourceType, ParsedRecord[]>();
  for (const r of merged) {
    let arr = bySource.get(r.source);
    if (!arr) {
      arr = [];
      bySource.set(r.source, arr);
    }
    arr.push(r);
  }

  // Milliquas bypasses crossMatch on purpose.  Two reasons:
  //
  // 1. A Milliquas point and a GLADE host galaxy at the same sky
  //    position are physically *different* objects: an AGN core vs the
  //    integrated host emission.  `crossMatch` deduplicates by (RA,
  //    Dec, redshift), so feeding Milliquas through it would discard
  //    real data — exactly the science the catalogue is here to add.
  //
  // 2. Milliquas is pre-deduplicated upstream against every parent
  //    survey it draws from (SDSS, Veron, NED, …), so a second dedup
  //    pass would just spend CPU re-discovering the empty intersection.
  //
  // The crossMatch bypass above does NOT extend to the famous-seed dedup.
  // Milliquas used to be added straight to the bucket here, which meant it
  // silently skipped `dropFamousMatches` (that runs on the crossMatch output,
  // which Milliquas is deliberately absent from) — so a famous galaxy with an
  // active nucleus rendered twice: once as its curated entry, once as a
  // Milliquas point on top. Centaurus A was the visible case.
  //
  // Measured cost of closing the gap: 20 of ~943k Milliquas rows sit within
  // 30" of a famous-seed position, and only ONE is genuinely a different
  // object — a ~1 Gpc background quasar shining through the Antennae. The
  // rest are the host's own nucleus, scattered in distance only by Milliquas'
  // coarse 3-decimal redshift (z=0.001 quantises to 4.28 Mpc, 0.002 to 8.56,
  // …). Losing one background AGN to de-duplicate 19 is the accepted trade;
  // a redshift-agreement test like `crossMatch` uses would save it, at the
  // cost of a second matching pass for 19 rows.
  if (milliquasResult.records.length > 0) {
    const { kept: milliquasKept, dropped: milliquasFamousDropped } = dropFamousMatches(
      milliquasResult.records,
      famousPositions,
      30,
    );
    if (milliquasFamousDropped > 0) {
      process.stderr.write(
        `  famous-seed dedup: dropped ${milliquasFamousDropped.toLocaleString()} Milliquas rows that match a famous-seed position\n`,
      );
    }
    bySource.set(Source.Milliquas, milliquasKept);
  }

  // Per-source dedup report. Subtracting kept from input gives the number
  // of records dropped as duplicates of a higher-priority survey's row.
  for (const source of [
    Source.SDSS,
    Source.TwoMRS,
    Source.Glade,
    ...DESI_PATCHES.map((patch) => patch.source),
  ]) {
    const kept = (bySource.get(source) ?? []).length;
    const input = inputCounts[source] ?? 0;
    const dropped = input - kept;
    process.stderr.write(
      `  ${SOURCE_REGISTRY[source].label}: ${input.toLocaleString()} in → ${kept.toLocaleString()} kept, ${dropped.toLocaleString()} dropped as duplicate\n`,
    );
  }

  const outDir = args['out-dir']!;
  const TIERS: readonly Tier[] = ['small', 'medium', 'large'];

  // Track filenames already written this run so the tier-agnostic sources
  // (2MRS, Famous) are only encoded + flushed once.  `tierFilenameForSource`
  // returns the same string for those across all three tiers, so we'd
  // otherwise rewrite the same bytes three times.
  const written = new Set<string>();

  for (const [source, records] of bySource) {
    for (const tier of TIERS) {
      const filename = tierFilenameForSource(source, tier);
      if (written.has(filename)) continue;
      written.add(filename);

      // Apply the tier's per-source target, if any.  Missing key = no cap.
      // 0 = exclude (skip writing this file entirely so the runtime can
      // detect "no data for this tier" via 404 rather than an empty cloud).
      const target = tierTarget(source, tier);
      if (target === 0) {
        process.stderr.write(
          `tier ${tier}: ${SOURCE_REGISTRY[source].label} excluded — skipping ${filename}\n`,
        );
        continue;
      }
      // Milliquas needs no special-cased subsample path: the class +
      // parent-survey bytes ride on the records themselves, and
      // `selectTierRecords` preserves per-record fields when it picks
      // the brightest-N slice. When the source defines a
      // `fluxSupplementMagLimit` (GLADE, SDSS) the brightest-N backbone
      // is unioned with an apparent-mag flux supplement to restore the
      // local volume the M_abs cut empties; otherwise it's the pure cut.
      const slice =
        target === undefined
          ? records
          : selectTierRecords(records, target, fluxSupplementMagLimitFor(source));

      const cloud = recordsToCloud(slice, overrides);
      const buf = encodeGalaxyCatalog(cloud);
      const outPath = resolve(outDir, filename);
      writeFileSync(outPath, Buffer.from(buf));
      process.stderr.write(
        `wrote ${cloud.count.toLocaleString()} points to ${outPath} (${buf.byteLength.toLocaleString()} bytes)\n`,
      );
    }
  }
}

// Only run the CLI when this file is invoked directly (e.g. via tsx).
// When vitest imports the module to pull `crossMatch` out for testing,
// `import.meta.url` and the resolved argv[1] differ, so the CLI stays
// dormant. fileURLToPath normalises the URL form Node uses internally
// to a plain absolute path that matches argv[1].
const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  // Top-level await is permitted under module: ESNext, but wrapping in a
  // promise chain keeps Node from converting an unhandled rejection into a
  // silent exit-0 on older versions.
  runCli().catch((err) => {
    process.stderr.write(`error: ${(err as Error).stack ?? (err as Error).message}\n`);
    process.exit(1);
  });
}
