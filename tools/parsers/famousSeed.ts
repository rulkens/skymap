/**
 * famousSeed — parse + validate the hand-curated `famous_galaxies.seed.json`.
 *
 * The seed file is the single source of truth for which galaxies the
 * curated atlas knows about.  Two scripts read it: `fetchFamousImages.ts`
 * (downloads and processes thumbnails) and `buildFamous.ts` (cross-matches
 * against the survey bins and emits the runtime artefacts).  Centralising
 * parsing + validation here means a single typo in the JSON surfaces as
 * one clear error, not two cryptic crashes from two different scripts.
 *
 * The schema is small enough that we hand-roll validation rather than
 * pulling in zod/ajv — six fields, all primitive, fail-loud throws make
 * for clearer error messages than nested validator output.
 *
 * Why are duplicate IDs a hard error?  The id is the URL-safe key that
 * names the WebP file, the cross-ref entry, and the `famousId` lookup
 * key in `galaxyInfoBuilder.ts`.  A duplicate would silently overwrite
 * an entry's images at fetch time and confuse the cross-ref lookup at
 * runtime.
 */

/**
 * One curated entry — exactly the shape stored in `famous_galaxies.seed.json`.
 *
 * Why a `type` (not `interface`)?  Project convention — see CLAUDE.md.
 */
export type FamousEntry = {
  /**
   * URL-safe lower-case identifier (e.g. `'m31'`, `'ngc-5128'`).  Used
   * as the WebP filename and as the cross-ref/meta lookup key.
   */
  id: string;
  /**
   * One or more human-readable names, ordered by preference (primary
   * first).  E.g. `['M31', 'NGC 224', 'Andromeda Galaxy']`.  The command
   * palette searches all names; the InfoCard shows the first as the
   * headline and the rest as "also known as".
   */
  names: string[];
  /**
   * Curated human-friendly display name (e.g. `"Andromeda Galaxy"`).
   * Used as the label text in the POI overlay; falls back to the last
   * name in `names` then `id` when absent.  Optional because most seed
   * entries don't have a widely-recognised common name distinct from
   * their catalog identifier.
   */
  commonName?: string;
  /** Right Ascension in degrees, [0, 360). */
  ra: number;
  /** Declination in degrees, [-90, 90]. */
  dec: number;
  /**
   * Distance in megaparsecs.  Curated value (NED / HyperLEDA), not
   * derived from a tiny redshift.  Famous nearby galaxies (M31, M33)
   * have peculiar velocities that dominate over Hubble flow, so
   * `redshiftToDistanceMpc(z)` would be wildly wrong.
   */
  distanceMpc: number;
  /** Physical isophotal diameter in kpc. */
  diameterKpc: number;
  /** Hubble morphological type as a free-form string (e.g. `'SA(s)b'`). */
  type: string;
  /** 1-3 sentence curated blurb shown in the InfoCard. */
  description: string;
  /**
   * Optional minor/major axis ratio b/a in (0.05, 1].  Populated by the
   * HyperLEDA enrichment script (`expandFamousFromCatalogs.ts`) from
   * `logr25` (b/a = 10^(-logr25)).  Absence is fine — buildFamous keeps
   * the slot at NaN, and the renderer treats it as "round / unknown".
   *
   * The lower bound (0.05) is a sanity guard: HyperLEDA occasionally
   * carries pathological logr25 values for nearly edge-on highly
   * inclined disks where the photometric fit blew up.  Anything below
   * 0.05 (b/a < 5%) means the source data is suspect.
   */
  axisRatio?: number;
  /**
   * Optional position angle in degrees, [0, 180), measured east of
   * north — the standard astronomical convention.  Populated by the
   * HyperLEDA enrichment script from the `pa` column.
   */
  positionAngleDeg?: number;
  /**
   * Optional B-band total apparent magnitude.  Sourced from HyperLEDA
   * `bt`.  When present, buildFamous maps magB → magG (the renderer's
   * SDSS-style g-slot) — same shoehorn convention GLADE uses for its
   * heterogeneous photometric inputs.  Range [-30, 30] (galaxies span
   * roughly -25 to +25; the wider bound keeps malformed entries loud).
   */
  magB?: number;
  /** Optional V-band total apparent mag (HyperLEDA `vt`).  Maps to magR. */
  magV?: number;
  /** Optional K-band total apparent mag (HyperLEDA `kt`).  Maps to magI. */
  magK?: number;
};

/**
 * Validate a single entry from the seed file.  Throws on any malformed
 * field with a message naming the offending entry's id.  Returning the
 * input unchanged lets callers chain through `validateFamousEntry`
 * without re-typing the variable.
 */
export function validateFamousEntry(e: FamousEntry): FamousEntry {
  if (typeof e.id !== 'string' || e.id.length === 0) {
    throw new Error(`famous seed: missing id on entry ${JSON.stringify(e).slice(0, 60)}`);
  }
  if (!Array.isArray(e.names) || e.names.length === 0) {
    throw new Error(`famous seed: ${e.id} has empty names array`);
  }
  if (!Number.isFinite(e.ra) || e.ra < 0 || e.ra >= 360) {
    throw new Error(`famous seed: ${e.id} has out-of-range ra ${e.ra}`);
  }
  if (!Number.isFinite(e.dec) || e.dec < -90 || e.dec > 90) {
    throw new Error(`famous seed: ${e.id} has out-of-range dec ${e.dec}`);
  }
  if (!Number.isFinite(e.distanceMpc) || e.distanceMpc <= 0) {
    throw new Error(`famous seed: ${e.id} has non-positive distance ${e.distanceMpc}`);
  }
  if (!Number.isFinite(e.diameterKpc) || e.diameterKpc <= 0) {
    throw new Error(`famous seed: ${e.id} has non-positive diameter ${e.diameterKpc}`);
  }
  if (typeof e.type !== 'string') {
    throw new Error(`famous seed: ${e.id} missing morphological type`);
  }
  if (typeof e.description !== 'string') {
    throw new Error(`famous seed: ${e.id} missing description`);
  }
  if (e.commonName !== undefined) {
    if (typeof e.commonName !== 'string' || e.commonName.length === 0) {
      throw new Error(
        `famous seed: ${e.id} has invalid commonName ${JSON.stringify(e.commonName)} (expected non-empty string)`,
      );
    }
  }
  // Optional enrichment fields.  Each is independently validated:
  // present + finite + in-range, OR absent.  We deliberately do NOT
  // require all four to travel together — HyperLEDA may have orientation
  // but not photometry for a given galaxy, or vice versa.
  if (e.axisRatio !== undefined) {
    if (!Number.isFinite(e.axisRatio) || e.axisRatio <= 0.05 || e.axisRatio > 1) {
      throw new Error(
        `famous seed: ${e.id} has out-of-range axisRatio ${e.axisRatio} (expected (0.05, 1])`,
      );
    }
  }
  if (e.positionAngleDeg !== undefined) {
    if (
      !Number.isFinite(e.positionAngleDeg) ||
      e.positionAngleDeg < 0 ||
      e.positionAngleDeg >= 180
    ) {
      throw new Error(
        `famous seed: ${e.id} has out-of-range positionAngleDeg ${e.positionAngleDeg} (expected [0, 180))`,
      );
    }
  }
  for (const band of ['magB', 'magV', 'magK'] as const) {
    const v = e[band];
    if (v !== undefined) {
      if (!Number.isFinite(v) || v < -30 || v > 30) {
        throw new Error(`famous seed: ${e.id} has out-of-range ${band} ${v} (expected [-30, 30])`);
      }
    }
  }
  return e;
}

/**
 * Parse and validate the entire seed JSON.  Throws on any per-entry
 * problem AND on duplicate ids across the catalog.
 */
export function parseFamousSeed(rawJson: string): FamousEntry[] {
  const parsed = JSON.parse(rawJson);
  if (!Array.isArray(parsed)) {
    throw new Error('famous seed: root must be an array');
  }
  const seen = new Set<string>();
  const out: FamousEntry[] = [];
  for (const e of parsed) {
    validateFamousEntry(e as FamousEntry);
    const id = (e as FamousEntry).id;
    if (seen.has(id)) {
      throw new Error(`famous seed: duplicate id "${id}"`);
    }
    seen.add(id);
    out.push(e as FamousEntry);
  }
  return out;
}
