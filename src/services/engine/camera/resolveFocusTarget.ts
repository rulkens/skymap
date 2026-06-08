/**
 * resolveFocusTarget — pure function that maps a parsed `FocusTarget`
 * (from the URL hash codec) onto a concrete `(source, localIdx)` pair
 * against the engine's currently-loaded data.
 *
 * Why split the codec (`focusUrl`) and the resolver (this file)?  The
 * codec is data-free string-bashing and trivially testable.  Resolution
 * needs the engine's loaded clouds, the famous-meta sidecar, and the
 * PGC alias map — all runtime state.  Keeping them apart means we can
 * unit-test each in isolation: the resolver runs against tiny synthetic
 * 3-row clouds without ever fetching a `.bin` file.
 *
 * ─── The tier-vs-unknown distinction ────────────────────────────────
 *
 * The resolver returns one of three shapes:
 *
 *   - `resolved: true`   — found a cloud row matching the target.
 *   - `reason: 'tier'`   — the target *probably* names a real galaxy,
 *                          but it's not in the user's currently-loaded
 *                          tier/source.  UI: render a banner with
 *                          "load a larger tier or enable SDSS".
 *   - `reason: 'unknown' — we have no evidence this target ever existed.
 *                          UI: silently clear the hash and move on.
 *
 * The distinction matters because deep links land on cold tabs.  A
 * shared `#focus=pgc-12345` from a friend on a powerful machine might
 * miss the recipient's small-tier default; we want them to see "expand
 * your data" rather than "this galaxy doesn't exist".  The alias map
 * (the runtime PGC→names sidecar) acts as the "is this a real PGC at
 * all?" oracle for the PGC branch — if alias-map says yes, it's real,
 * and the user just needs more data.
 *
 * For SDSS we have no equivalent oracle: an SDSS objID either matches a
 * loaded row or it doesn't, with no hint about whether it could be in a
 * larger tier or is simply garbage.  We default to `tier` there
 * (conservative: prefer an actionable nudge over a dead end), and
 * document the choice inline.
 *
 * For the `pos` (RA/Dec) branch there's no oracle at all — only loaded
 * geometry can be searched.  A miss is `unknown`, never `tier`.
 *
 * ─── Performance notes ──────────────────────────────────────────────
 *
 * Linear scans across the loaded clouds (1.5M points worst case).
 * The resolver runs once on page load (deep-link arrival) and once per
 * Cmd+K paste, so single-digit-millisecond costs dominate.  No need for
 * a hash index.  Each cloud's `objIDs` is read from the
 * `BigUint64Array` directly, and the `pos` branch trades a `Math.sqrt`
 * for accumulating squared "angular cost" (Δdec² + cosDec²·Δra²) and
 * comparing against a precomputed squared threshold — same trick the
 * frame-by-frame thumbnail-priority loop in the engine uses.
 */

import type { ResolverInput } from '../../../@types/camera/ResolverInput';
import type { ResolverOutput } from '../../../@types/camera/ResolverOutput';
import { Source } from '../../../data/sources';
import { cartesianToRaDec } from '../../../utils/math/cartesianToRaDec';
import type { SourceType } from '../../../@types/data/SourceType';

/**
 * The 30-arcsec threshold pulled from `tools/buildFamous.ts` —
 * the same fuzzy-radius used when cross-matching Famous galaxies
 * to 2MRS/GLADE.  Reusing it here means a `pos@`-encoded URL
 * stays inside the same astrophysical "is this the same source?"
 * envelope the rest of the pipeline already trusts.
 */
const MATCH_THRESHOLD_ARCSEC = 30;
/** Squared threshold in arcsec² — avoids a Math.sqrt per row. */
const MATCH_THRESHOLD_ARCSEC_SQ = MATCH_THRESHOLD_ARCSEC * MATCH_THRESHOLD_ARCSEC;

/**
 * Resolve a `FocusTarget` to a concrete `(source, localIdx)` location
 * inside the loaded clouds, or report why we couldn't.
 *
 * Pure function: no side effects, no DOM access, no engine imports
 * beyond types.  Safe to call from anywhere — it just walks the input.
 */
export function resolveFocusTarget(input: ResolverInput): ResolverOutput {
  const { target } = input;
  switch (target.kind) {
    case 'famous':
      return resolveFamous(target.id, input);
    case 'pgc':
      return resolvePgc(target.pgc, input);
    case 'sdss':
      return resolveSdss(target.objID, input);
    case 'pos':
      return resolvePos(target.raDeg, target.decDeg, input);
    case 'structure':
      // Structures resolve through the structure-table drain in useUrlSync, not
      // the galaxy cloud scan — a structure target never reaches the galaxy
      // resolver in practice. Report unknown defensively so the switch is
      // exhaustive and a stray structure target clears cleanly rather than
      // falling through.
      return { resolved: false, reason: 'unknown' };
  }
}

/**
 * Famous-id branch.  The famous catalog is the only place that uses
 * the curated `id` namespace ("m31", "ngc5128", ...), so resolution
 * is a single linear scan of `famousMeta` and a check that the
 * Famous cloud is actually loaded.
 *
 * Why no `tier` reason here?  Famous lives in exactly one source
 * (`Source.FamousGalaxy`), built by a separate `npm run build-famous`
 * pipeline that always emits the full atlas.  Either it's loaded or
 * it isn't; there's no larger tier to nudge the user toward.
 */
function resolveFamous(id: string, input: ResolverInput): ResolverOutput {
  for (let i = 0; i < input.famousMeta.length; i++) {
    if (input.famousMeta[i]!.id === id) {
      // Found in meta — confirm the cloud is actually loaded.
      const hasCatalog = input.catalogs.some((c) => c.source === Source.FamousGalaxy);
      if (!hasCatalog) return { resolved: false, reason: 'unknown' };
      return { resolved: true, source: Source.FamousGalaxy, localIdx: i };
    }
  }
  return { resolved: false, reason: 'unknown' };
}

/**
 * PGC branch — walks GLADE and 2MRS only.  SDSS uses a different
 * 19-digit objID namespace and never stores PGC in its `objIDs` slot,
 * so including it would risk a false-positive numeric collision.
 * Synthetic uses sequential 0..N-1 for objIDs which would also
 * spuriously match small PGCs, hence the explicit allowlist.
 *
 * Walk order is the natural cloud order (typically GLADE-then-2MRS in
 * load order).  First hit wins; PGCs are unique across the union of
 * GLADE+2MRS post-cross-match, so order only matters in the rare
 * partial-load window where one source has the row and the other is
 * still streaming.
 */
function resolvePgc(pgc: bigint, input: ResolverInput): ResolverOutput {
  for (const { source, catalog } of input.catalogs) {
    if (source !== Source.Glade && source !== Source.TwoMRS) continue;
    const idx = findObjId(catalog.objIDs, pgc);
    if (idx >= 0) return { resolved: true, source, localIdx: idx };
  }
  // Not in any loaded PGC-bearing cloud.  Use the alias map as the
  // "does this PGC exist anywhere in HyperLEDA?" oracle: hit ⇒ user
  // needs a larger tier; miss ⇒ probably garbage.
  if (input.aliasMap.has(pgc)) return { resolved: false, reason: 'tier' };
  return { resolved: false, reason: 'unknown' };
}

/**
 * SDSS branch.  No equivalent of the alias map exists for SDSS
 * objIDs at runtime, so we can't distinguish "real but not in this
 * tier" from "garbage" once the loaded SDSS cloud(s) come up empty.
 *
 * Conservative choice: prefer `tier` over `unknown` whenever any
 * SDSS-shaped query misses.  Rationale: the cost of a false `tier`
 * (showing a "load a larger tier" banner for a typo'd objID) is a
 * harmless extra UI element; the cost of a false `unknown` (silently
 * dropping a valid deep link to a galaxy in a larger SDSS tier) is a
 * confused user with no path forward.  When in doubt, prefer the
 * actionable nudge.
 */
function resolveSdss(objID: bigint, input: ResolverInput): ResolverOutput {
  for (const { source, catalog } of input.catalogs) {
    if (source !== Source.SDSS) continue;
    const idx = findObjId(catalog.objIDs, objID);
    if (idx >= 0) return { resolved: true, source, localIdx: idx };
  }
  // Whether or not an SDSS cloud was loaded, a miss collapses to
  // `tier`.  See the function header for why.
  return { resolved: false, reason: 'tier' };
}

/**
 * Position branch — nearest-neighbour search across ALL loaded clouds
 * within `MATCH_THRESHOLD_ARCSEC`.  The cloud rows store xyz Cartesian
 * positions in Mpc, not RA/Dec, so we round-trip through
 * `cartesianToRaDec` per row.  At ~1.5M points worst case this is
 * still a single-digit-millisecond pass — fine for a one-shot resolve.
 *
 * The angular metric is the great-circle small-angle approximation:
 *
 *     Δθ_arcsec ≈ 3600 · √( Δdec²  +  (cos(dec) · Δra_wrap)² )
 *
 * where `Δra_wrap = ((ra1 - ra2 + 540) % 360) - 180` folds RA into
 * [-180, +180] so the 0/360 seam doesn't fake a huge separation.
 * The `+540` shift (rather than the more common `+180`) handles
 * negative inputs cleanly under JavaScript's `%` operator, which
 * preserves the sign of the dividend.
 *
 * cos(dec) is taken at the *target* declination — both points are
 * within the threshold, so the cosine difference between target and
 * candidate is negligible (sub-percent for 30 arcsec at any latitude).
 *
 * No `tier` outcome here: there's no oracle that says "a galaxy
 * exists at this position" without consulting loaded geometry.  A
 * miss is always `unknown`.
 */
function resolvePos(raDegT: number, decDegT: number, input: ResolverInput): ResolverOutput {
  const cosDecT = Math.cos((decDegT * Math.PI) / 180);
  let bestSqArcsec = Infinity;
  let bestSource: SourceType | null = null;
  let bestIdx = -1;

  for (const { source, catalog } of input.catalogs) {
    const positions = catalog.positions;
    const n = catalog.count;
    for (let i = 0; i < n; i++) {
      const x = positions[i * 3 + 0]!;
      const y = positions[i * 3 + 1]!;
      const z = positions[i * 3 + 2]!;
      const [raDeg, decDeg] = cartesianToRaDec(x, y, z);

      const ddec = decDeg - decDegT;
      // Wrap Δra into [-180, +180].  The +540 shift is `+360 + 180`
      // and survives negative inputs under JS's signed-`%` operator.
      const dra = (((raDeg - raDegT + 540) % 360) - 180) * cosDecT;

      // arcsec² without sqrt: 3600² scales degrees² → arcsec².
      const sqArcsec = (ddec * ddec + dra * dra) * 3600 * 3600;
      if (sqArcsec < bestSqArcsec) {
        bestSqArcsec = sqArcsec;
        bestSource = source;
        bestIdx = i;
      }
    }
  }

  if (bestSource !== null && bestSqArcsec <= MATCH_THRESHOLD_ARCSEC_SQ) {
    return { resolved: true, source: bestSource, localIdx: bestIdx };
  }
  return { resolved: false, reason: 'unknown' };
}

/**
 * Linear scan of a `BigUint64Array` for an exact bigint match.
 * Returns the first index where the value matches, or -1.
 *
 * Why bigint-typed comparison?  `BigUint64Array[i]` returns a bigint
 * directly; comparing against `Number(needle)` would silently lose
 * precision past 2^53 (a real risk for SDSS objIDs).  Strict bigint
 * `===` is exact across the full 64-bit range.
 */
function findObjId(haystack: BigUint64Array, needle: bigint): number {
  for (let i = 0; i < haystack.length; i++) {
    if (haystack[i] === needle) return i;
  }
  return -1;
}
