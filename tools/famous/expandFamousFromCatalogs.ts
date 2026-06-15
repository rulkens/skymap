#!/usr/bin/env node
/**
 * expandFamousFromCatalogs — one-shot data tool that expands the curated
 * `Famous` catalog from the original 20 hand-picked Messier galaxies to
 * ~75-95 entries by walking the full Messier (M1-110) and Caldwell
 * (C1-109) catalogs and pulling enrichment data from authoritative
 * astronomical APIs.
 *
 * ---
 *
 * ### Why one-shot?
 *
 * The famous catalog only changes when *we* decide it should.  HyperLEDA
 * publishes once a year; Wikipedia's REST API is stable.  We don't want
 * the renderer to depend on either at runtime — the .bin pipeline serves
 * static data.  Running this offline, committing the result, and re-running
 * `build-famous` is the same idempotent flow we use for every other
 * upstream catalog (SDSS, 2MRS, GLADE).
 *
 * ### Why both Messier *and* Caldwell?
 *
 * Messier is the canonical "famous galaxies" list, but it's a Northern-
 * hemisphere bias: Charles Messier observed from Paris, so Centaurus A,
 * Sculptor, NGC 5128 — none are in Messier.  Caldwell (Patrick Moore, 1995)
 * was explicitly designed to fill that gap with the brightest Southern +
 * dim Northern objects Messier missed.  Together they cover the named-by-
 * amateurs galaxy population that any "famous galaxies" list should know.
 *
 * Many entries in both catalogs are *not* galaxies (M1 = Crab Nebula,
 * M45 = Pleiades open cluster, C39 = Esquimo Nebula, etc.).  We filter by
 * HyperLEDA's `objtype == 'G'` — natural and authoritative.  The user
 * never sees these "missed" entries; they're simply not added to the seed.
 *
 * ### Algorithm summary
 *
 *  1. Build the target name list: `M1..M110` and `C1..C109`, mapping each
 *     to its NGC/IC alias via the hard-coded tables below.  Caldwell
 *     entries that map to galaxies-only are present; those mapping to
 *     non-galaxies (`null` in the table) are skipped.
 *  2. For each name, query HyperLEDA `meandata` (with caching).  If
 *     `objtype != 'G'`, skip.  Otherwise extract distance, diameter,
 *     orientation, and magnitudes per the rules below.
 *  3. For each accepted entry, fetch a Wikipedia summary (with caching
 *     and 1 req/s throttling).  Try `Messier_<N>`, then `NGC_<N>`, then
 *     the HyperLEDA-resolved name.  Use the first non-disambiguation
 *     extract; warn + leave description empty if none work.
 *  4. Merge with existing seed entries.  When an existing entry's id
 *     matches, preserve its `id`, `names`, and `description` (the
 *     human-curated prose); overwrite the photometric / size fields
 *     with the HyperLEDA-derived values.
 *  5. Sort by id, write atomically.
 *
 * ### Distance rule (with rationale)
 *
 *   prefer mod0 if e_mod0 < 0.3        (real distance indicator)
 *   else fallback to v3k / H0          (Hubble flow at H0=70)
 *   else skip the entry                (no usable distance)
 *
 * Why this order?  `mod0` is HyperLEDA's mean of redshift-independent
 * distance estimators (Cepheids, TRGB, SBF, …) — accurate to ~1-3% for
 * Local Group + nearby galaxies where Hubble flow fails.  `v3k` is the
 * CMB-frame recession velocity, useful for galaxies past ~30 Mpc where
 * peculiar velocity is small relative to Hubble flow.  Below that
 * threshold, both can be wrong, but `mod0` is wrong less often.
 *
 * ### Magnitude rejection rule
 *
 *   reject any band where e_band > 0.5 mag
 *
 * HyperLEDA aggregates from many upstream sources — some are 50-year-old
 * photographic plates with photometric uncertainty pushing 1+ magnitude.
 * The canonical example is M31's `vt = 6.753 ± 3.548` — V is "actually"
 * 3.4, but the aggregate over all measurements is dragged toward
 * photographic-plate values.  An error bar of 3.5 mag is HyperLEDA
 * telling us "this is garbage" — we listen.
 *
 * ### Curated-description preservation
 *
 * The 20 existing seed entries ship with hand-written 1-3 sentence prose
 * blurbs.  These are *better* than the Wikipedia REST API's `extract`,
 * which is auto-generated and often awkward.  We preserve them by id:
 * if a seed entry already exists, its `description` is never overwritten.
 * Wikipedia is the fallback for newly-added entries only.
 */

import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rawDataPath } from '../utils/io/rawDataRegistry';

import { parseFamousSeed, validateFamousEntry, type FamousEntry } from '../parsers/famousSeed';
import {
  parseHyperLedaMeandata,
  hyperLedaMeandataUrl,
  type HyperLedaMeandataRow,
} from '../parsers/hyperledaMeandata';
import { parseWikipediaSummary, wikipediaSummaryUrl } from '../parsers/wikipediaSummary';
import { loadJsonCache } from '../utils/io/loadJsonCache';
import { saveJsonCache } from '../utils/io/saveJsonCache';
import { parseFlags } from '../utils/cli/args';
import { delay } from '../utils/async/delay';

// ──────────────────────────────────────────────────────────────────────
// Constants

/** Hubble constant in km/s/Mpc.  Same as elsewhere in the project. */
const H0_KM_S_MPC = 70;

/** Reject any HyperLEDA magnitude with an aggregate error larger than this. */
const MAX_MAG_ERROR = 0.5;

/** Reject any `mod0` distance modulus with error larger than this. */
const MAX_MOD0_ERROR = 0.3;

/** Polite Wikipedia rate limit: 1 second between sequential requests. */
const WIKIPEDIA_DELAY_MS = 1000;

// ──────────────────────────────────────────────────────────────────────
// Messier → NGC/IC name mapping
//
// The Messier catalog is 110 numbered entries from 1771-1781 (later
// extended posthumously to 110).  Many are non-galaxies — entries here
// are `null` for those, and they get skipped at lookup time.  For
// galaxies, the value is the NGC/IC catalog id used as the HyperLEDA
// query name.  Verified against the SEDS Messier database +
// Wikipedia's "List of Messier objects".
//
// Why hard-code?  The mapping is stable (the catalog hasn't changed in
// 240 years), and a 110-entry table is far smaller than another HTTP
// dependency.  Easier to review in a code review than a parsed CSV.

const MESSIER_TO_NGC: Record<number, string | null> = {
  1: null, // Crab Nebula (SNR)
  2: null, // Globular cluster
  3: null, // Globular cluster
  4: null, // Globular cluster
  5: null, // Globular cluster
  6: null, // Open cluster
  7: null, // Open cluster
  8: null, // Lagoon Nebula
  9: null, // Globular cluster
  10: null, // Globular cluster
  11: null, // Open cluster (Wild Duck)
  12: null, // Globular cluster
  13: null, // Globular cluster (Hercules)
  14: null, // Globular cluster
  15: null, // Globular cluster
  16: null, // Eagle Nebula
  17: null, // Omega Nebula
  18: null, // Open cluster
  19: null, // Globular cluster
  20: null, // Trifid Nebula
  21: null, // Open cluster
  22: null, // Globular cluster
  23: null, // Open cluster
  24: null, // Sagittarius Star Cloud
  25: null, // Open cluster
  26: null, // Open cluster
  27: null, // Dumbbell Nebula
  28: null, // Globular cluster
  29: null, // Open cluster
  30: null, // Globular cluster
  31: 'NGC0224', // Andromeda
  32: 'NGC0221', // M31 satellite
  33: 'NGC0598', // Triangulum
  34: null, // Open cluster
  35: null, // Open cluster
  36: null, // Open cluster
  37: null, // Open cluster
  38: null, // Open cluster
  39: null, // Open cluster
  40: null, // Optical double star
  41: null, // Open cluster
  42: null, // Orion Nebula
  43: null, // Part of Orion Nebula
  44: null, // Beehive cluster
  45: null, // Pleiades
  46: null, // Open cluster
  47: null, // Open cluster
  48: null, // Open cluster
  49: 'NGC4472',
  50: null, // Open cluster
  51: 'NGC5194', // Whirlpool
  52: null, // Open cluster
  53: null, // Globular cluster
  54: null, // Globular cluster
  55: null, // Globular cluster
  56: null, // Globular cluster
  57: null, // Ring Nebula
  58: 'NGC4579',
  59: 'NGC4621',
  60: 'NGC4649',
  61: 'NGC4303',
  62: null, // Globular cluster
  63: 'NGC5055', // Sunflower
  64: 'NGC4826', // Black Eye
  65: 'NGC3623',
  66: 'NGC3627',
  67: null, // Open cluster
  68: null, // Globular cluster
  69: null, // Globular cluster
  70: null, // Globular cluster
  71: null, // Globular cluster
  72: null, // Globular cluster
  73: null, // Asterism
  74: 'NGC0628',
  75: null, // Globular cluster
  76: null, // Little Dumbbell Nebula
  77: 'NGC1068', // Cetus A
  78: null, // Reflection nebula
  79: null, // Globular cluster
  80: null, // Globular cluster
  81: 'NGC3031', // Bode's
  82: 'NGC3034', // Cigar
  83: 'NGC5236', // Southern Pinwheel
  84: 'NGC4374',
  85: 'NGC4382',
  86: 'NGC4406',
  87: 'NGC4486', // Virgo A
  88: 'NGC4501',
  89: 'NGC4552',
  90: 'NGC4569',
  91: 'NGC4548',
  92: null, // Globular cluster
  93: null, // Open cluster
  94: 'NGC4736',
  95: 'NGC3351',
  96: 'NGC3368',
  97: null, // Owl Nebula
  98: 'NGC4192',
  99: 'NGC4254',
  100: 'NGC4321',
  101: 'NGC5457', // Pinwheel
  102: 'NGC5866', // Spindle (disputed; treated as galaxy)
  103: null, // Open cluster
  104: 'NGC4594', // Sombrero
  105: 'NGC3379',
  106: 'NGC4258',
  107: null, // Globular cluster
  108: 'NGC3556',
  109: 'NGC3992',
  110: 'NGC0205', // M31 satellite
};

// ──────────────────────────────────────────────────────────────────────
// Caldwell → NGC/IC name mapping
//
// Patrick Moore's 1995 supplement.  109 entries.  Sources: SEDS Caldwell
// list + Wikipedia's "Caldwell catalogue".  Galaxies only — non-galaxy
// entries are `null` and get filtered.  Notable galaxies that Messier
// missed: C77 = Centaurus A (NGC5128), C65 = Sculptor (NGC253),
// C101 = NGC6744, etc.

const CALDWELL_TO_NGC: Record<number, string | null> = {
  1: null, // NGC188 (open cluster)
  2: null, // NGC40 (planetary nebula)
  3: 'NGC4236', // edge-on barred spiral
  4: null, // NGC7023 (reflection nebula)
  5: 'IC0342',
  6: null, // NGC6543 (planetary)
  7: 'NGC2403',
  8: null, // NGC559 (open cluster)
  9: null, // Sh2-155 (Cave Nebula)
  10: null, // NGC663 (open cluster)
  11: null, // NGC7635 (Bubble Nebula)
  12: 'NGC6946',
  13: null, // NGC457 (open cluster)
  14: null, // NGC869/884 (Double Cluster)
  15: null, // NGC6826 (planetary)
  16: null, // NGC7243 (open cluster)
  17: 'NGC0147',
  18: 'NGC0185',
  19: null, // IC5146 (Cocoon Nebula)
  20: null, // NGC7000 (North America Nebula)
  21: 'NGC4449',
  22: null, // NGC7662 (Blue Snowball, planetary)
  23: 'NGC0891',
  24: 'NGC1275', // Perseus A
  25: null, // NGC2419 (globular)
  26: 'NGC4244',
  27: null, // NGC6888 (Crescent Nebula)
  28: null, // NGC752 (open cluster)
  29: 'NGC5005',
  30: 'NGC7331',
  31: null, // IC405 (Flaming Star Nebula)
  32: 'NGC4631', // Whale
  33: null, // NGC6992/5 (E. Veil)
  34: null, // NGC6960 (W. Veil)
  35: 'NGC4889',
  36: 'NGC4559',
  37: null, // NGC6885 (open cluster)
  38: 'NGC4565', // Needle
  39: null, // NGC2392 (Eskimo Nebula)
  40: 'NGC3626',
  41: null, // Hyades (open cluster)
  42: null, // NGC7006 (globular)
  43: 'NGC7814',
  44: 'NGC7479',
  45: 'NGC5248',
  46: null, // NGC2261 (Hubble's Variable Nebula)
  47: null, // NGC6934 (globular)
  48: 'NGC2775',
  49: null, // NGC2237 (Rosette Nebula)
  50: null, // NGC2244 (open cluster in Rosette)
  51: 'IC1613',
  52: 'NGC4697',
  53: 'NGC3115', // Spindle
  54: null, // NGC2506 (open cluster)
  55: null, // NGC7009 (Saturn Nebula)
  56: null, // NGC246 (planetary)
  57: 'NGC6822', // Barnard's Galaxy
  58: null, // NGC2360 (open cluster)
  59: null, // NGC3242 (Ghost of Jupiter, planetary)
  60: 'NGC4038', // Antennae A
  61: 'NGC4039', // Antennae B
  62: 'NGC0247',
  63: null, // NGC7293 (Helix Nebula, planetary)
  64: null, // NGC2362 (open cluster)
  65: 'NGC0253', // Sculptor
  66: null, // NGC5694 (globular)
  67: 'NGC1097',
  68: null, // NGC6729 (variable nebula)
  69: null, // NGC6302 (Bug Nebula, planetary)
  70: 'NGC0300',
  71: null, // NGC2477 (open cluster)
  72: 'NGC0055',
  73: null, // NGC1851 (globular)
  74: null, // NGC3132 (Eight-Burst Nebula, planetary)
  75: null, // NGC6124 (open cluster)
  76: null, // NGC6231 (open cluster)
  77: 'NGC5128', // Centaurus A
  78: null, // NGC6541 (globular)
  79: null, // NGC3201 (globular)
  80: null, // NGC5139 (Omega Centauri, globular)
  81: null, // NGC6352 (globular)
  82: null, // NGC6193 (open cluster)
  83: 'NGC4945',
  84: null, // NGC5286 (globular)
  85: null, // IC2391 (Omicron Velorum, open cluster)
  86: null, // NGC6397 (globular)
  87: null, // NGC1261 (globular)
  88: null, // NGC5823 (open cluster)
  89: null, // NGC6087 (S Normae cluster, open)
  90: null, // NGC2867 (planetary)
  91: null, // NGC3532 (open cluster)
  92: null, // NGC3372 (Carina Nebula)
  93: null, // NGC6752 (globular)
  94: null, // NGC4755 (Jewel Box, open cluster)
  95: null, // NGC6025 (open cluster)
  96: null, // NGC2516 (open cluster)
  97: null, // NGC3766 (Pearl Cluster, open)
  98: null, // NGC4609 (open cluster)
  99: null, // Coalsack Nebula
  100: null, // IC2944 (Lambda Cen, open cluster + nebula)
  101: 'NGC6744',
  102: null, // IC2602 (Theta Car, open cluster)
  103: null, // NGC2070 (Tarantula, in LMC)
  104: null, // NGC362 (globular)
  105: null, // NGC4833 (globular)
  106: null, // NGC104 (47 Tuc, globular)
  107: null, // NGC6101 (globular)
  108: null, // NGC4372 (globular)
  109: null, // NGC3195 (planetary)
};

// ──────────────────────────────────────────────────────────────────────
// Distance + diameter computation

/**
 * Compute distance in Mpc from a HyperLEDA row using the documented
 * fallback chain.  Returns `null` if neither `mod0` nor `v3k` is usable.
 *
 *   1. mod0 (true distance modulus) if e_mod0 < 0.3
 *      → d_Mpc = 10^((mod0 - 25) / 5)
 *   2. v3k (CMB-frame velocity, km/s) if finite and > 0
 *      → d_Mpc = v3k / H0   (Hubble's law at H0 = 70)
 *   3. null
 *
 * Note that we explicitly allow negative `v3k` to fall through to null:
 * Local Group galaxies (M31, M33) have v3k < 0 because they're falling
 * toward us, and Hubble's law gives nonsense for them.  But all such
 * galaxies have a `mod0` measurement (they're nearby!), so the chain
 * already handles them via step 1.
 */
export function distanceMpcFromHyperLeda(row: HyperLedaMeandataRow): number | null {
  if (Number.isFinite(row.mod0) && Number.isFinite(row.e_mod0) && row.e_mod0 < MAX_MOD0_ERROR) {
    return Math.pow(10, (row.mod0 - 25) / 5);
  }
  if (Number.isFinite(row.v3k) && row.v3k > 0) {
    return row.v3k / H0_KM_S_MPC;
  }
  return null;
}

/**
 * Compute physical diameter in kpc from `logd25` (log10 of D25 in 0.1
 * arcmin) and a distance in Mpc.  Standard small-angle conversion:
 *
 *   arcmin     = 0.1 × 10^logd25
 *   diameter   = arcmin × (π / 180 / 60) × d_Mpc × 1000   [kpc]
 *
 * Returns `null` when either input is non-finite (e.g. galaxy with no
 * isophotal-diameter measurement in HyperLEDA).
 */
export function diameterKpcFromHyperLeda(logd25: number, distanceMpc: number): number | null {
  if (!Number.isFinite(logd25) || !Number.isFinite(distanceMpc) || distanceMpc <= 0) {
    return null;
  }
  const arcmin = 0.1 * Math.pow(10, logd25);
  const diameterKpc = arcmin * (Math.PI / 180 / 60) * distanceMpc * 1000;
  return diameterKpc;
}

/**
 * Compute axis ratio b/a from logr25, the HyperLEDA convention:
 *   b/a = 10^(-logr25)
 * Returns null if non-finite or out of (0.05, 1].  The lower bound
 * matches the FamousEntry validator.
 */
export function axisRatioFromLogr25(logr25: number): number | null {
  if (!Number.isFinite(logr25)) return null;
  const ba = Math.pow(10, -logr25);
  if (ba <= 0.05 || ba > 1) return null;
  return ba;
}

// ──────────────────────────────────────────────────────────────────────
// Merging

/**
 * Build a FamousEntry from a HyperLEDA row, optionally merging with an
 * existing entry.  Returns `null` if the row can't yield a usable entry
 * (no distance, no diameter, etc.).
 *
 * Merge rule (existing entry present):
 *  - PRESERVE id, names, description (curated prose stays).
 *  - PRESERVE type if HyperLEDA's `type` is empty (curated wins on tie).
 *  - OVERWRITE distanceMpc, diameterKpc, axisRatio, positionAngleDeg, mags.
 *  - The user explicitly wants the *catalog values* in these slots
 *    because the renderer sizes/orients/colours the point from them.
 *
 * For brand-new entries (no existing match), we populate `description`
 * from the caller-supplied wikipedia summary (passed in separately to
 * keep this function pure/sync — the caller does the I/O).
 */
export function mergeIntoFamousEntry(args: {
  defaultId: string;
  defaultNames: string[];
  row: HyperLedaMeandataRow;
  existing: FamousEntry | undefined;
  wikipediaDescription: string;
}): FamousEntry | null {
  const { defaultId, defaultNames, row, existing, wikipediaDescription } = args;

  // Distance: chain mod0 → v3k → null.  Skip if no usable distance.
  const distanceMpc = distanceMpcFromHyperLeda(row);
  if (distanceMpc === null) return null;

  // Diameter requires distance + logd25.  Skip if either missing.
  const diameterKpc = diameterKpcFromHyperLeda(row.logd25, distanceMpc);
  if (diameterKpc === null || diameterKpc <= 0) return null;

  // RA/Dec are required.  HyperLEDA gives RA in hours; convert to deg.
  const ra = row.al2000 * 15;
  const dec = row.de2000;
  if (!Number.isFinite(ra) || !Number.isFinite(dec)) return null;
  if (ra < 0 || ra >= 360 || dec < -90 || dec > 90) return null;

  // Orientation (optional).
  const axisRatio = axisRatioFromLogr25(row.logr25);
  const pa = Number.isFinite(row.pa) && row.pa >= 0 && row.pa < 180 ? row.pa : null;

  // Magnitudes — reject any with error > 0.5 mag (HyperLEDA's signal
  // that the aggregate is unreliable).  Apply per-band.
  const acceptMag = (m: number, e: number): number | null => {
    if (!Number.isFinite(m)) return null;
    if (!Number.isFinite(e) || e > MAX_MAG_ERROR) return null;
    if (m < -30 || m > 30) return null;
    return m;
  };
  const magB = acceptMag(row.bt, row.e_bt);
  const magV = acceptMag(row.vt, row.e_vt);
  const magK = acceptMag(row.kt, row.e_kt);

  // Build the entry.  Existing entry preserved fields take priority
  // (user-curated prose / id / names) — see merge rule above.
  const out: FamousEntry = {
    id: existing?.id ?? defaultId,
    names: existing?.names ?? defaultNames,
    ra,
    dec,
    distanceMpc,
    diameterKpc,
    type: row.type !== '' ? row.type : (existing?.type ?? ''),
    description: existing?.description ?? wikipediaDescription,
  };
  // Optional enrichment fields — only attach when we have a real value.
  // We intentionally do NOT carry forward the existing entry's
  // axisRatio/pa/mags here: the user wants HyperLEDA's measurements
  // to win for these, since they drive the renderer's appearance.
  if (axisRatio !== null) out.axisRatio = axisRatio;
  if (pa !== null) out.positionAngleDeg = pa;
  if (magB !== null) out.magB = magB;
  if (magV !== null) out.magV = magV;
  if (magK !== null) out.magK = magK;
  return out;
}

// ──────────────────────────────────────────────────────────────────────
// Caching wrappers (used by the CLI; pure functions for testability)

/**
 * Lookup interface for HyperLEDA rows.  The CLI wires up a real
 * fetch + on-disk cache; tests inject a Map-backed fake.  Returns
 * the parsed row or null (no match / soft failure).
 */
export type HyperLedaLookup = (name: string) => Promise<HyperLedaMeandataRow | null>;

/**
 * Lookup interface for Wikipedia summaries.  Same testability pattern.
 * Caller passes a candidate title; the lookup returns either the
 * extract string (possibly empty) or null on hard failure.
 */
export type WikipediaLookup = (title: string) => Promise<string>;

/**
 * Resolve the description for a new entry: try multiple Wikipedia
 * titles in order, return the first non-empty extract, or `''` if
 * all fail.  Logs a single warning per skipped title.
 *
 * Deliberately sequential (not Promise.all) — Wikipedia's REST API
 * is rate-limited at ~200 req/s but they explicitly request "be
 * polite" for non-cached content.  At 1 req/s × ~100 entries that's
 * a 100s upper bound, which is acceptable for a one-shot tool.
 */
export async function resolveWikipediaDescription(
  candidates: readonly string[],
  lookup: WikipediaLookup,
  log: (msg: string) => void,
): Promise<string> {
  for (const title of candidates) {
    if (title.trim().length === 0) continue;
    try {
      const extract = await lookup(title);
      if (extract.trim().length > 0) return extract;
      log(`  no usable Wikipedia extract for "${title}"`);
    } catch (e) {
      log(`  Wikipedia fetch failed for "${title}": ${(e as Error).message}`);
    }
  }
  return '';
}

// ──────────────────────────────────────────────────────────────────────
// Build target list (Messier + Caldwell, deduped)

/**
 * One entry in the build target list — a (name to query, default id,
 * default names) tuple.  When the same NGC name appears in both
 * Messier and Caldwell (rare; e.g. NGC4435/NGC4438 — the Eyes — has
 * dual names but neither is in both catalogs), we prefer the Messier
 * id since it's the older/better-known prefix, and fold the Caldwell
 * label into the names array.
 */
export type Target = {
  /** The canonical HyperLEDA query name (NGC nnnn / IC nnnn). */
  hyperledaName: string;
  /** Stable seed id (e.g. `m31`, `c77`).  Always the Messier id when both apply. */
  defaultId: string;
  /** Default names array used only for new entries. */
  defaultNames: string[];
};

/**
 * Build the deduplicated target list from the Messier + Caldwell
 * tables.  Output is sorted by id for determinism.  Public for tests.
 */
export function buildTargetList(): Target[] {
  const byName = new Map<string, Target>();

  for (let n = 1; n <= 110; n++) {
    const ngc = MESSIER_TO_NGC[n];
    if (ngc === null || ngc === undefined) continue;
    byName.set(ngc, {
      hyperledaName: ngc,
      defaultId: `m${n}`,
      defaultNames: [`M${n}`, ngcDisplayName(ngc)],
    });
  }
  for (let n = 1; n <= 109; n++) {
    const ngc = CALDWELL_TO_NGC[n];
    if (ngc === null || ngc === undefined) continue;
    const existing = byName.get(ngc);
    if (existing !== undefined) {
      // Both Messier and Caldwell point at this galaxy — Messier id wins,
      // but add the C-label as an extra name.
      if (!existing.defaultNames.includes(`C${n}`)) {
        existing.defaultNames.push(`C${n}`);
      }
      continue;
    }
    byName.set(ngc, {
      hyperledaName: ngc,
      defaultId: `c${n}`,
      defaultNames: [`C${n}`, ngcDisplayName(ngc)],
    });
  }

  return [...byName.values()].sort((a, b) => a.defaultId.localeCompare(b.defaultId));
}

/**
 * Format an "NGCnnnn" / "ICnnnn" tag as a human-readable display name
 * with a space and stripped leading zeros — e.g. `NGC0224` → `NGC 224`.
 *
 * Why bother?  The seed file's `names` array is rendered verbatim in the
 * Cmd+K palette + InfoCard.  `NGC 224` is what astronomers say; the
 * zero-padded form is HyperLEDA's internal storage convention.
 */
export function ngcDisplayName(tag: string): string {
  const m = /^([A-Z]+)(\d+)([A-Z]*)$/.exec(tag);
  if (!m) return tag;
  const prefix = m[1];
  const num = parseInt(m[2]!, 10);
  const suffix = m[3] ?? '';
  return `${prefix} ${num}${suffix}`;
}

// ──────────────────────────────────────────────────────────────────────
// Schema-ordered serialisation
//
// We deliberately write fields in the spec'd order
// (id, names, ra, dec, distanceMpc, diameterKpc, type, description,
// axisRatio, positionAngleDeg, magB, magV, magK) so that diffs between
// runs are minimal and reviewable.  JSON.stringify preserves insertion
// order, so the trick is to *build* the object with that order.

/**
 * Re-create a FamousEntry plain object with fields in canonical order.
 * Optional fields are only included when they're set.
 */
export function orderEntryFields(e: FamousEntry): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: e.id,
    names: e.names,
    ra: e.ra,
    dec: e.dec,
    distanceMpc: e.distanceMpc,
    diameterKpc: e.diameterKpc,
    type: e.type,
    description: e.description,
  };
  if (e.axisRatio !== undefined) out.axisRatio = e.axisRatio;
  if (e.positionAngleDeg !== undefined) out.positionAngleDeg = e.positionAngleDeg;
  if (e.magB !== undefined) out.magB = e.magB;
  if (e.magV !== undefined) out.magV = e.magV;
  if (e.magK !== undefined) out.magK = e.magK;
  return out;
}

// ──────────────────────────────────────────────────────────────────────
// CLI runtime
//
// Below this line is the side-effect-laden runtime: argv parsing,
// network fetch, on-disk caching.  The pure functions above are the
// testable surface.

async function main(): Promise<void> {
  const _flags = parseFlags(process.argv.slice(2), {
    '--no-cache': 'bool',
    '--dry-run': 'bool',
  });
  const flags = { noCache: _flags['--no-cache'], dryRun: _flags['--dry-run'] };
  const seedPath = rawDataPath('famous.seed');
  const hyperledaCachePath = rawDataPath('hyperleda.famous-cache');
  const wikipediaCachePath = rawDataPath('famous.wikipedia-cache');

  // ── Load existing seed (preserve curated descriptions on merge) ───
  const existingEntries: FamousEntry[] = existsSync(seedPath)
    ? parseFamousSeed(readFileSync(seedPath, 'utf8'))
    : [];
  const existingById = new Map(existingEntries.map((e) => [e.id, e]));
  process.stderr.write(`loaded ${existingEntries.length} existing seed entries\n`);

  // ── Load caches ───────────────────────────────────────────────────
  const hyperledaCache = flags.noCache
    ? {}
    : loadJsonCache<Record<string, string>>(hyperledaCachePath);
  const wikipediaCache = flags.noCache
    ? {}
    : loadJsonCache<Record<string, string>>(wikipediaCachePath);
  process.stderr.write(
    `cache: ${Object.keys(hyperledaCache).length} HyperLEDA, ${Object.keys(wikipediaCache).length} Wikipedia\n`,
  );

  // ── Build lookups ────────────────────────────────────────────────
  const hyperledaLookup: HyperLedaLookup = async (name: string) => {
    let body = hyperledaCache[name];
    if (body === undefined) {
      const res = await fetch(hyperLedaMeandataUrl(name));
      if (!res.ok) {
        process.stderr.write(`  HyperLEDA HTTP ${res.status} for ${name}\n`);
        return null;
      }
      body = await res.text();
      hyperledaCache[name] = body;
      // Persist after every successful fetch so a crash mid-run is recoverable.
      saveJsonCache(hyperledaCachePath, hyperledaCache);
    }
    return parseHyperLedaMeandata(body);
  };

  let lastWikipediaCallMs = 0;
  const wikipediaLookup: WikipediaLookup = async (title: string) => {
    const cached = wikipediaCache[title];
    if (cached !== undefined) {
      return parseWikipediaSummary(cached).extract;
    }
    // Throttle: 1 req/s sequential (Wikipedia REST politeness rule).
    const sinceLast = Date.now() - lastWikipediaCallMs;
    if (sinceLast < WIKIPEDIA_DELAY_MS) {
      await delay(WIKIPEDIA_DELAY_MS - sinceLast);
    }
    const res = await fetch(wikipediaSummaryUrl(title));
    lastWikipediaCallMs = Date.now();
    if (!res.ok) {
      // 404 is normal for not-yet-cached titles — treat as "no extract".
      return '';
    }
    const body = await res.text();
    wikipediaCache[title] = body;
    saveJsonCache(wikipediaCachePath, wikipediaCache);
    return parseWikipediaSummary(body).extract;
  };

  // ── Walk targets ─────────────────────────────────────────────────
  const targets = buildTargetList();
  process.stderr.write(`walking ${targets.length} Messier + Caldwell candidates\n`);

  const merged: FamousEntry[] = [];
  let skippedNotGalaxy = 0;
  let skippedNoData = 0;
  let skippedNoMatch = 0;
  let added = 0;
  let updated = 0;

  for (const t of targets) {
    const row = await hyperledaLookup(t.hyperledaName);
    if (row === null) {
      process.stderr.write(`  ${t.defaultId.padEnd(6)} ${t.hyperledaName} no HyperLEDA match\n`);
      skippedNoMatch++;
      continue;
    }
    if (row.objtype !== 'G') {
      process.stderr.write(
        `  ${t.defaultId.padEnd(6)} ${t.hyperledaName} skip (objtype="${row.objtype}")\n`,
      );
      skippedNotGalaxy++;
      continue;
    }
    const existing = existingById.get(t.defaultId);
    // Wikipedia description: only fetch for new entries (existing ones
    // keep their curated prose).  Try Messier #, NGC #, then HyperLEDA's
    // resolved name as last resort.
    let description = '';
    if (existing === undefined) {
      const candidates: string[] = [];
      const m = /^m(\d+)$/.exec(t.defaultId);
      if (m) candidates.push(`Messier_${m[1]}`);
      const c = /^c(\d+)$/.exec(t.defaultId);
      if (c) candidates.push(`Caldwell_${c[1]}`);
      // ngcDisplay for Wikipedia: "NGC 224" → "NGC_224"
      const ngcAsTitle = ngcDisplayName(t.hyperledaName).replace(/\s+/g, '_');
      candidates.push(ngcAsTitle);
      if (row.objname !== '' && row.objname !== t.hyperledaName) {
        candidates.push(row.objname.replace(/\s+/g, '_'));
      }
      description = await resolveWikipediaDescription(candidates, wikipediaLookup, (s) =>
        process.stderr.write(s + '\n'),
      );
    }

    const entry = mergeIntoFamousEntry({
      defaultId: t.defaultId,
      defaultNames: t.defaultNames,
      row,
      existing,
      wikipediaDescription: description,
    });
    if (entry === null) {
      process.stderr.write(
        `  ${t.defaultId.padEnd(6)} ${t.hyperledaName} skip (no usable distance/diameter)\n`,
      );
      skippedNoData++;
      continue;
    }
    try {
      validateFamousEntry(entry);
    } catch (e) {
      process.stderr.write(
        `  ${t.defaultId.padEnd(6)} ${t.hyperledaName} skip (validation failed: ${(e as Error).message})\n`,
      );
      skippedNoData++;
      continue;
    }
    if (existing !== undefined) updated++;
    else added++;
    merged.push(entry);
    process.stderr.write(
      `  ${t.defaultId.padEnd(6)} ${t.hyperledaName} ${existing ? 'updated' : 'added'}\n`,
    );
  }

  // ── Existing entries with no Messier/Caldwell match: keep them ───
  // The seed may carry curated entries that aren't in our M+C tables
  // (e.g. NGC 5128 if you'd added it manually before).  We don't want
  // to drop them.  Walk the existingById, find any not visited above,
  // and add as-is.
  const visitedIds = new Set(merged.map((e) => e.id));
  for (const e of existingEntries) {
    if (!visitedIds.has(e.id)) {
      merged.push(e);
      process.stderr.write(`  ${e.id.padEnd(6)} (preserved unmatched curated entry)\n`);
    }
  }

  merged.sort((a, b) => a.id.localeCompare(b.id));

  process.stderr.write(
    `\nsummary: ${merged.length} total entries (${added} new, ${updated} updated, ` +
      `${existingEntries.length - updated} preserved-as-is)\n` +
      `skipped: ${skippedNotGalaxy} non-galaxies, ${skippedNoMatch} no HyperLEDA match, ` +
      `${skippedNoData} no usable data\n`,
  );

  // ── Write atomically (write to temp + rename) ────────────────────
  if (flags.dryRun) {
    process.stderr.write(`(dry-run; not writing ${seedPath})\n`);
    return;
  }
  const ordered = merged.map(orderEntryFields);
  const json = JSON.stringify(ordered, null, 2) + '\n';
  const tmp = seedPath + '.tmp';
  writeFileSync(tmp, json);
  renameSync(tmp, seedPath);
  process.stderr.write(`wrote ${merged.length} entries to ${seedPath}\n`);
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`error: ${(err as Error).stack ?? (err as Error).message}\n`);
    process.exit(1);
  });
}
