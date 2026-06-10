/**
 * parseStructureSeed — parse + validate `data/seeds/structure_anchors.seed.json`.
 *
 * The seed file is the single source of truth for which galaxy clusters,
 * superclusters, voids, and nearby galaxy groups appear as featured labelled
 * POIs in the renderer.
 * Two Plan-2 scripts will read it: `buildClusterPois.ts` (cross-matches
 * catalog coverage and emits the runtime POI list) and `auditClusterCoverage.ts`
 * (verifies MCXC/MSCC catalog density at each anchor).  Centralising parsing
 * here means a typo in the JSON surfaces once, clearly, rather than twice as
 * cryptic downstream crashes.
 *
 * Schema is small enough to hand-roll validation — no zod/ajv.  Fail-loud
 * throws name the offending entry's id so fixing the JSON is frictionless.
 *
 * Why are duplicate ids a hard error?  The id (without category prefix) becomes
 * the URL slug fragment after Plan 2 prepends `<category>-`.  A duplicate
 * would silently shadow one entry in every consumer that keyed on the id.
 */

/** Valid structural categories. */
const VALID_CATEGORIES = ['cluster', 'supercluster', 'void', 'group'] as const;

/**
 * One featured structure from `structure_anchors.seed.json`.
 *
 * Coordinates follow the `SkyCoord` convention: RA in hours [0, 24),
 * Dec in degrees [-90, 90], distances in Mpc.
 *
 * `physicalRadiusMpc` is the gravitationally-bound virial/core radius for
 * clusters and groups (e.g. the harmonic radius Rh for groups); for
 * superclusters and voids it equals `apparentRadiusMpc` (no bound core).
 * `apparentRadiusMpc` is the wider "named extent" — for clusters and groups
 * this is the zero-velocity turnaround radius R0 (physR < appR); for
 * superclusters and voids it matches physR.  Drives ring sizing and
 * cone-search membership.
 */
export type StructureSeedEntry = {
  /** URL-safe lower-kebab id, unique within the file (no category prefix). */
  id: string;
  /** Ordered names; primary first.  The first name drives the POI label. */
  names: string[];
  /** Optional display label distinct from `names[0]` — used in POI overlays. */
  commonName?: string;
  /** Abell/ACO designation where applicable (clusters only). */
  abell?: string;
  /** Structural category. */
  category: (typeof VALID_CATEGORIES)[number];
  /** Right Ascension in hours, [0, 24). */
  raHours: number;
  /** Declination in degrees, [-90, 90]. */
  decDeg: number;
  /** Distance in Mpc, > 0. */
  distMpc: number;
  /**
   * Virial/core radius for clusters and groups; equals `apparentRadiusMpc`
   * for superclusters and voids (no bound core concept applies).
   */
  physicalRadiusMpc: number;
  /**
   * Wider "named extent" radius — drives ring sizing, cone-search membership,
   * and the halo half-extent.  >= `physicalRadiusMpc` for clusters.
   */
  apparentRadiusMpc: number;
  /** 1–2 sentence curated description shown in the POI info panel. */
  description: string;
};

/**
 * Validate a single entry.  Throws with a message naming the offending id
 * on any malformed field.  Returns the entry unchanged so callers can chain.
 */
export function validateStructureSeedEntry(e: StructureSeedEntry): StructureSeedEntry {
  if (typeof e.id !== 'string' || e.id.length === 0) {
    throw new Error(`structure seed: missing id on entry ${JSON.stringify(e).slice(0, 60)}`);
  }
  if (!Array.isArray(e.names) || e.names.length === 0) {
    throw new Error(`structure seed: ${e.id} has empty names array`);
  }
  if (!VALID_CATEGORIES.includes(e.category as (typeof VALID_CATEGORIES)[number])) {
    throw new Error(
      `structure seed: ${e.id} has unknown category ${JSON.stringify(e.category)} (expected 'cluster' | 'supercluster' | 'void' | 'group')`,
    );
  }
  if (!Number.isFinite(e.raHours) || e.raHours < 0 || e.raHours >= 24) {
    throw new Error(`structure seed: ${e.id} has out-of-range raHours ${e.raHours} (expected [0, 24))`);
  }
  if (!Number.isFinite(e.decDeg) || e.decDeg < -90 || e.decDeg > 90) {
    throw new Error(`structure seed: ${e.id} has out-of-range decDeg ${e.decDeg} (expected [-90, 90])`);
  }
  if (!Number.isFinite(e.distMpc) || e.distMpc <= 0) {
    throw new Error(`structure seed: ${e.id} has non-positive distMpc ${e.distMpc}`);
  }
  if (!Number.isFinite(e.physicalRadiusMpc) || e.physicalRadiusMpc <= 0) {
    throw new Error(
      `structure seed: ${e.id} has non-positive physicalRadiusMpc ${e.physicalRadiusMpc}`,
    );
  }
  if (!Number.isFinite(e.apparentRadiusMpc) || e.apparentRadiusMpc <= 0) {
    throw new Error(
      `structure seed: ${e.id} has non-positive apparentRadiusMpc ${e.apparentRadiusMpc}`,
    );
  }
  if (typeof e.description !== 'string' || e.description.trim().length === 0) {
    throw new Error(`structure seed: ${e.id} missing description`);
  }
  if (e.commonName !== undefined && (typeof e.commonName !== 'string' || e.commonName.length === 0)) {
    throw new Error(`structure seed: ${e.id} has invalid commonName (must be a non-empty string)`);
  }
  if (e.abell !== undefined && (typeof e.abell !== 'string' || e.abell.length === 0)) {
    throw new Error(`structure seed: ${e.id} has invalid abell (must be a non-empty string)`);
  }
  return e;
}

/**
 * Parse and validate the entire seed JSON.  Throws on any per-entry problem
 * and on duplicate ids across the file.
 */
export function parseStructureSeed(rawJson: string): StructureSeedEntry[] {
  const parsed = JSON.parse(rawJson);
  if (!Array.isArray(parsed)) {
    throw new Error('structure seed: root must be an array');
  }
  const seen = new Set<string>();
  const out: StructureSeedEntry[] = [];
  for (const e of parsed) {
    const validated = validateStructureSeedEntry(e as StructureSeedEntry);
    if (seen.has(validated.id)) {
      throw new Error(`structure seed: duplicate id "${validated.id}"`);
    }
    seen.add(validated.id);
    out.push(validated);
  }
  return out;
}
