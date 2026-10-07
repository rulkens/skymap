/**
 * parseStructureSeed — parse + validate `data/seeds/structure_anchors.seed.json`.
 *
 * The seed file is the single source of truth for which structures appear as
 * featured labelled POIs in the renderer.
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

import type { Length } from '../../src/@types/data/Length';
import type { NebulaKind } from '../../src/@types/data/structure/NebulaKind';
import type { StructureId } from '../../src/@types/data/structure/StructureId';
import { STRUCTURE_IDS } from '../../src/data/structure/structureIds';
import { STRUCTURE_IDS_BY_SLAB } from '../../src/data/structure/structureIdsBySlab';

const NEBULA_KINDS: readonly string[] = [
  'emission',
  'reflection',
  'planetary',
  'supernova-remnant',
  'dark',
] satisfies readonly NebulaKind[];

// Rows inside the Milky Way have no catalogue in this pipeline, so each names
// the paper its numbers came from; the slab marks exactly those categories.
const SOURCE_REQUIRED: readonly string[] = STRUCTURE_IDS_BY_SLAB.near0;

const LENGTH_UNITS: readonly string[] = ['pc', 'kpc', 'Mpc'] satisfies readonly Length['unit'][];

/**
 * One featured structure from `structure_anchors.seed.json`.
 *
 * Coordinates follow the `SkyCoord` convention: RA in hours [0, 24),
 * Dec in degrees [-90, 90]; distance and radii are unit-tagged `Length`s.
 *
 * `physicalRadius` is the gravitationally-bound virial/core radius for
 * clusters and groups (e.g. the harmonic radius Rh for groups); for
 * superclusters and voids it equals `apparentRadius` (no bound core).
 * `apparentRadius` is the wider "named extent" — for clusters and groups
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
  category: StructureId;
  /** Right Ascension in hours, [0, 24). */
  raHours: number;
  /** Declination in degrees, [-90, 90]. */
  decDeg: number;
  /** Distance, value > 0. */
  distance: Length;
  /**
   * Virial/core radius for clusters and groups; equals `apparentRadius`
   * for superclusters and voids (no bound core concept applies).
   */
  physicalRadius: Length;
  /**
   * Wider "named extent" radius — drives ring sizing, cone-search membership,
   * and the halo half-extent.  >= `physicalRadius` for clusters.
   */
  apparentRadius: Length;
  /** 1–2 sentence curated description shown in the POI info panel. */
  description: string;
  /** What a nebula is; required on `nebula`, rejected on every other category. */
  nebulaKind?: NebulaKind;
  /** Distance is assumed equal to the Galactic Centre's; accepted on `galactic-centre` only. */
  lineOfSightAssumed?: boolean;
  /**
   * Where the row's distance and radii come from (survey, paper or bibcode).
   * Required on the Milky Way categories; build-time documentation only.
   */
  source?: string;
  /** Exact English Wikipedia article title (canonical, after redirects). */
  wikipedia?: string;
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
  if (!(STRUCTURE_IDS as readonly string[]).includes(e.category)) {
    throw new Error(
      `structure seed: ${e.id} has unknown category ${JSON.stringify(e.category)} (expected ${STRUCTURE_IDS.map((id) => `'${id}'`).join(' | ')})`,
    );
  }
  if (!Number.isFinite(e.raHours) || e.raHours < 0 || e.raHours >= 24) {
    throw new Error(
      `structure seed: ${e.id} has out-of-range raHours ${e.raHours} (expected [0, 24))`,
    );
  }
  if (!Number.isFinite(e.decDeg) || e.decDeg < -90 || e.decDeg > 90) {
    throw new Error(
      `structure seed: ${e.id} has out-of-range decDeg ${e.decDeg} (expected [-90, 90])`,
    );
  }
  for (const field of ['distance', 'physicalRadius', 'apparentRadius'] as const) {
    const length = e[field];
    if (!LENGTH_UNITS.includes(length?.unit)) {
      throw new Error(
        `structure seed: ${e.id} has unknown ${field} unit ${JSON.stringify(length?.unit)} (expected ${LENGTH_UNITS.join(' | ')})`,
      );
    }
    if (!Number.isFinite(length.value) || length.value <= 0) {
      throw new Error(`structure seed: ${e.id} has non-positive ${field} ${length.value}`);
    }
  }
  if (typeof e.description !== 'string' || e.description.trim().length === 0) {
    throw new Error(`structure seed: ${e.id} missing description`);
  }
  if (
    e.commonName !== undefined &&
    (typeof e.commonName !== 'string' || e.commonName.length === 0)
  ) {
    throw new Error(`structure seed: ${e.id} has invalid commonName (must be a non-empty string)`);
  }
  if (e.abell !== undefined && (typeof e.abell !== 'string' || e.abell.length === 0)) {
    throw new Error(`structure seed: ${e.id} has invalid abell (must be a non-empty string)`);
  }
  if (e.wikipedia !== undefined && (typeof e.wikipedia !== 'string' || e.wikipedia.length === 0)) {
    throw new Error(`structure seed: ${e.id} has invalid wikipedia (must be a non-empty string)`);
  }
  if (e.category === 'nebula') {
    if (!NEBULA_KINDS.includes(e.nebulaKind as string)) {
      throw new Error(
        `structure seed: ${e.id} needs nebulaKind, got ${JSON.stringify(e.nebulaKind)} (expected ${NEBULA_KINDS.join(' | ')})`,
      );
    }
  } else if (e.nebulaKind !== undefined) {
    throw new Error(`structure seed: ${e.id} has nebulaKind but is not a nebula`);
  }
  if (e.lineOfSightAssumed !== undefined) {
    if (e.category !== 'galactic-centre') {
      throw new Error(`structure seed: ${e.id} has lineOfSightAssumed outside galactic-centre`);
    }
    if (typeof e.lineOfSightAssumed !== 'boolean') {
      throw new Error(`structure seed: ${e.id} has non-boolean lineOfSightAssumed`);
    }
  }
  if (SOURCE_REQUIRED.includes(e.category)) {
    if (typeof e.source !== 'string' || e.source.trim().length === 0) {
      throw new Error(`structure seed: ${e.id} (${e.category}) missing source`);
    }
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
