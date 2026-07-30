/**
 * resolveFocusId — parse a focus-id string (the value of `#focus=<id>`) and
 * resolve it to a SelectionRef against the engine's currently-loaded data.
 *
 * Replaces two old functions:
 *   - `parseFocusHash`       (string → FocusTarget | null)
 *   - `resolveFocusTarget`   (FocusTarget + engine data → (source, localIdx))
 *
 * The FocusTarget union becomes an internal implementation detail here.  The
 * public contract is simply: "give me a focus-id string and the live engine
 * state; I'll return a SelectionRef if the thing is loaded, or null if it
 * isn't".
 *
 * ─── Why null instead of 'tier' / 'unknown' reasons? ────────────────────────
 *
 * The old `resolveFocusTarget` distinguished 'tier' (probably real, wrong tier)
 * from 'unknown' (probably garbage) to drive a UI banner.  That distinction
 * lived in `aliasMap` lookups and conservative defaults for SDSS misses.
 * `ResolveDeps` has no aliasMap, and the reconciler saga (the new call site)
 * loops on `catalogLoaded` until non-null rather than showing a "try a bigger
 * tier" banner — so both 'tier' and 'unknown' collapse to null here.  The saga
 * handles retries; the codec just says "not yet" or "found it".
 *
 * ─── STRUCTURE_IDS: category ids, not instance ids ───────────────────────────
 *
 * STRUCTURE_IDS is ['cluster', 'supercluster', 'void', 'group'] — the four
 * structure CATEGORY ids.  The focusId format is `${category}-${seedId}`, e.g.
 * 'cluster-virgo'.  We check `raw.startsWith(`${cat}-`)` to detect structure
 * tokens.  DO NOT use `isStructureId(raw)` — that checks whether raw IS a
 * category id (e.g. 'cluster'), not whether it starts with one.
 *
 * ─── Ordered decoder table ───────────────────────────────────────────────────
 *
 * The prefixes are recognised by FOCUS_ID_DECODERS, an ORDERED table of rows.
 * Each row is `{ matches, decode }`: `matches` claims the id (by prefix,
 * literal, or character class), and the FIRST claiming row is authoritative —
 * its `decode` result is returned even when null.  A malformed but claimed id
 * (`pgc-abc`, `cluster-virgo m87`, `body-krypton`) therefore resolves to null
 * rather than tumbling into a later row.
 *
 * Order is load-bearing: the famous-id row's `matches` is the permissive
 * `[a-z0-9_-]+` character class, which also accepts structure ids
 * (`cluster-virgo`), the milkyWay literal, and body ids (`body-earth`).  Those
 * specific rows MUST precede the greedy famous row, so famous is the explicit
 * LAST row — a token reaches the famous resolver only after every structured
 * form has declined it.  This ordering lives in the table's row order, not in
 * comment discipline scattered across branches.
 *
 * ─── Performance ────────────────────────────────────────────────────────────
 *
 * Linear scans across loaded clouds (≤1.5 M rows worst case).  Called once on
 * page load (deep-link arrival) and once per Cmd+K paste, so single-digit
 * millisecond costs dominate.  No hash index needed.
 */

import { Source, GALAXY_CATALOG_SOURCES } from '../../data/sources';
import { STRUCTURE_IDS } from '../../data/structure/structureIds';
import { SCENE_BODIES } from '../../data/bodies/sceneBodies';
import { cartesianToRaDec } from '../../utils/math/cartesianToRaDec';
import { MILKY_WAY_FOCUS_ID } from './milkyWayFocusId';
import { BODY_FOCUS_PREFIX } from './bodyFocusId';
import { STAR_FOCUS_PREFIX } from './starFocusId';
import type { SelectionRef } from '../../@types/engine/SelectionRef';
import type { ResolveDeps } from '../../@types/engine/ResolveDeps';
import type { GalaxyCatalogSourceType } from '../../@types/data/galaxyCatalog/GalaxyCatalogSourceType';

/** Strict regex for the pos@ form.  Anchored at both ends — matches focusUrl.ts. */
const POS_RE = /^pos@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/;

/** Character class a bare token must satisfy to be a structure or famous seed id. */
const SAFE_ID_RE = /^[a-z0-9_-]+$/i;

/**
 * One row of the focus-id decoder table.  `matches` decides whether this row
 * claims the id; `decode` maps a claimed id to a SelectionRef (or null when the
 * id is malformed, or its catalog cloud is not yet loaded).  A claiming row is
 * authoritative — the resolver never falls through to a later row once `matches`
 * returns true, so `decode` returning null means "no ref", not "try the next
 * row".
 */
type FocusIdDecoder = {
  readonly matches: (focusId: string) => boolean;
  readonly decode: (focusId: string, deps: ResolveDeps) => SelectionRef | null;
};

/**
 * The decoder rows in resolution order.  See the module header: order is
 * load-bearing (structure / milkyWay / body precede the greedy famous row), so
 * the famous fallback is the explicit final entry.
 */
const FOCUS_ID_DECODERS: readonly FocusIdDecoder[] = [
  // pgc-<n> — PGC number into the GLADE / 2MRS clouds.
  {
    matches: (id) => id.startsWith('pgc-'),
    decode: (id, deps) => {
      const n = id.slice(4);
      if (!/^\d+$/.test(n)) return null;
      return resolvePgc(BigInt(n), deps);
    },
  },
  // sdss-<n> — SDSS 64-bit objID into the SDSS cloud.
  {
    matches: (id) => id.startsWith('sdss-'),
    decode: (id, deps) => {
      const n = id.slice(5);
      if (!/^\d+$/.test(n)) return null;
      return resolveSdss(BigInt(n), deps);
    },
  },
  // pos@ra,dec — nearest-neighbour positional fallback.
  {
    matches: (id) => POS_RE.test(id),
    decode: (id, deps) => {
      const posMatch = POS_RE.exec(id)!;
      const raDeg = parseFloat(posMatch[1]!);
      const decDeg = parseFloat(posMatch[2]!);
      if (!Number.isFinite(raDeg) || !Number.isFinite(decDeg)) return null;
      return resolvePos(raDeg, decDeg, deps);
    },
  },
  // structure ids (`${category}-${seedId}`).  The prefix set is derived from
  // STRUCTURE_IDS, so a new structure category extends the decoder for free.
  // Precedes famous because `cluster-virgo` also passes the famous character
  // class.
  {
    matches: (id) => STRUCTURE_IDS.some((cat) => id.startsWith(`${cat}-`)),
    decode: (id) => (SAFE_ID_RE.test(id) ? { type: 'structure', id } : null),
  },
  // milkyWay literal — the singleton, no per-instance data.  The encoders
  // (focusIdOf, urlHashFor) emit the same constant, closing the round-trip.
  {
    matches: (id) => id === MILKY_WAY_FOCUS_ID,
    decode: () => ({ type: 'milkyWay' }),
  },
  // scene bodies (`body-<seedId>`).  SCENE_BODIES is a static import, so an
  // unknown seed is definitively garbage (null forever), never "not loaded yet".
  {
    matches: (id) => id.startsWith(BODY_FOCUS_PREFIX),
    decode: (id) => {
      const seedId = id.slice(BODY_FOCUS_PREFIX.length);
      return SCENE_BODIES.some((b) => b.id === seedId) ? { type: 'body', id: seedId } : null;
    },
  },
  // stars (`star-<recordIndex>`).  The suffix is the bin-stable global
  // star-record index; a digits-only non-negative integer resolves to a
  // positional star ref, anything else is garbage → null.  The `/^\d+$/` gate
  // matches the pgc/sdss idiom above: `Number()` would also accept exponent
  // (`1e3` → 1000) and decimal (`1.5`) forms, so a malformed shared URL could
  // silently focus the wrong star.  Precedes famous because `star-42` also
  // passes the greedy famous character class.
  {
    matches: (id) => id.startsWith(STAR_FOCUS_PREFIX),
    decode: (id) => {
      const n = id.slice(STAR_FOCUS_PREFIX.length);
      return /^\d+$/.test(n) ? { type: 'star', index: Number(n) } : null;
    },
  },
  // famous id — the greedy fallback.  MUST stay last: its character class also
  // accepts every structured form above.  The downstream scan is the authority
  // on whether the id exists in famousGalaxiesMeta; no eager validation here.
  {
    matches: (id) => SAFE_ID_RE.test(id),
    decode: (id, deps) => resolveFamous(id, deps),
  },
];

/**
 * Parse the given focus-id string and resolve it to a SelectionRef using the
 * live engine state in `deps`.  Returns null when the id is malformed, when
 * the relevant catalog cloud is not yet loaded, or when a nearest-neighbour
 * pos@ search finds nothing within the 30-arcsec threshold.
 *
 * Walks FOCUS_ID_DECODERS and returns the first claiming row's decode result.
 */
export function resolveFocusId(focusId: string, deps: ResolveDeps): SelectionRef | null {
  if (!focusId) return null;
  for (const decoder of FOCUS_ID_DECODERS) {
    if (decoder.matches(focusId)) return decoder.decode(focusId, deps);
  }
  return null;
}

// ─── Branch resolvers ────────────────────────────────────────────────────────

/**
 * Famous branch.  Scan `famousGalaxiesMeta` for the curated seed id, then
 * confirm the FamousGalaxy cloud is actually loaded.  If either check fails,
 * return null — the saga will retry once the cloud arrives.
 *
 * Walk order: famousGalaxiesMeta is indexed identically to the FamousGalaxy
 * cloud (same order as famous.bin), so the scan index i is the cloud localIdx.
 */
function resolveFamous(id: string, deps: ResolveDeps): SelectionRef | null {
  for (let i = 0; i < deps.famousGalaxiesMeta.length; i++) {
    if (deps.famousGalaxiesMeta[i]!.id === id) {
      // id found in meta — confirm the cloud is loaded.
      if (!deps.catalogs.get(Source.FamousGalaxy)) return null;
      return { type: 'galaxyCatalog', source: Source.FamousGalaxy, index: i };
    }
  }
  return null;
}

/**
 * PGC branch.  Scan GLADE then 2MRS — the only sources whose objIDs slot
 * carries a PGC number.  First hit wins; PGCs are unique across the
 * GLADE+2MRS union after cross-match dedup, so the walk order only matters
 * in the narrow partial-load window where one source has the row and the
 * other is still streaming.
 *
 * SDSS and Synthetic are excluded: SDSS uses a 19-digit objID namespace that
 * doesn't overlap PGC numerically in practice, and Synthetic uses sequential
 * 0..N-1 which would produce false-positive matches for small PGCs.
 */
function resolvePgc(pgc: bigint, deps: ResolveDeps): SelectionRef | null {
  for (const source of [Source.Glade, Source.TwoMRS] as const) {
    const cloud = deps.catalogs.get(source);
    if (!cloud) continue;
    const idx = findObjId(cloud.objIDs, pgc);
    if (idx >= 0) return { type: 'galaxyCatalog', source, index: idx };
  }
  // Neither GLADE nor 2MRS had the PGC loaded.  Could be a larger tier or
  // a garbage id, but without an alias map we can't tell — return null so
  // the saga retries (and eventually gives up after all catalogs are loaded).
  return null;
}

/**
 * SDSS branch.  Scan the SDSS cloud for the objID.  Returns null on a miss
 * regardless of whether SDSS was loaded — without an equivalent of the alias
 * map there's no way to distinguish "wrong tier" from "garbage id", so we
 * collapse both to null and let the saga loop.
 */
function resolveSdss(objID: bigint, deps: ResolveDeps): SelectionRef | null {
  const cloud = deps.catalogs.get(Source.SDSS);
  if (!cloud) return null;
  const idx = findObjId(cloud.objIDs, objID);
  if (idx >= 0) return { type: 'galaxyCatalog', source: Source.SDSS, index: idx };
  return null;
}

/**
 * Nearest-neighbour search across ALL galaxy catalog sources within the 30-arcsec
 * threshold (the same envelope `buildFamous.ts` uses for cross-matching).
 *
 * Cloud rows store xyz Cartesian positions in Mpc; we convert per-row via
 * `cartesianToRaDec`.  The angular metric is the great-circle small-angle
 * approximation (squared arcsec to avoid a Math.sqrt per row):
 *
 *   Δθ_arcsec² ≈ ( Δdec² + (cos(dec_target) · Δra_wrap)² ) · 3600²
 *
 * where Δra_wrap = (((ra − ra_t + 540) % 360) − 180) folds RA into [−180, +180]
 * so the 0/360 seam doesn't fake a huge separation.  The +540 shift (rather
 * than +180) handles negative inputs cleanly under JS's signed-% operator.
 *
 * We iterate GALAXY_CATALOG_SOURCES (not just loaded sources) so the nearest
 * match is the same galaxy regardless of which clouds happen to be loaded.
 * Unloaded sources are skipped via the undefined guard.
 */
function resolvePos(raDegT: number, decDegT: number, deps: ResolveDeps): SelectionRef | null {
  const THRESHOLD_SQ = 30 * 30; // 30 arcsec, squared

  const cosDecT = Math.cos((decDegT * Math.PI) / 180);
  let bestSqArcsec = Infinity;
  let bestSource: GalaxyCatalogSourceType | null = null;
  let bestIdx = -1;

  for (const source of GALAXY_CATALOG_SOURCES) {
    // GALAXY_CATALOG_SOURCES includes SourceType values; only galaxy catalog
    // sources are in ResolveDeps.catalogs (get returns undefined for others).
    const cloud = deps.catalogs.get(source as GalaxyCatalogSourceType);
    if (!cloud) continue;

    const positions = cloud.positions;
    const n = cloud.count;
    for (let i = 0; i < n; i++) {
      const x = positions[i * 3 + 0]!;
      const y = positions[i * 3 + 1]!;
      const z = positions[i * 3 + 2]!;
      // cartesianToRaDec returns [ra, dec, 0]; the third slot is always 0.
      const [raDeg, decDeg] = cartesianToRaDec(x, y, z);

      const ddec = decDeg - decDegT;
      const dra = (((raDeg - raDegT + 540) % 360) - 180) * cosDecT;
      const sqArcsec = (ddec * ddec + dra * dra) * 3600 * 3600;

      if (sqArcsec < bestSqArcsec) {
        bestSqArcsec = sqArcsec;
        bestSource = source as GalaxyCatalogSourceType;
        bestIdx = i;
      }
    }
  }

  if (bestSource !== null && bestSqArcsec <= THRESHOLD_SQ) {
    return { type: 'galaxyCatalog', source: bestSource, index: bestIdx };
  }
  return null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Linear scan of a BigUint64Array for an exact bigint match.
 * Returns the first matching index, or -1.
 *
 * Bigint comparison is used (not Number) because SDSS objIDs exceed 2^53.
 * `BigUint64Array[i]` returns a bigint directly, so the === comparison is
 * exact across the full 64-bit range.
 */
function findObjId(haystack: BigUint64Array, needle: bigint): number {
  for (let i = 0; i < haystack.length; i++) {
    if (haystack[i] === needle) return i;
  }
  return -1;
}
