/**
 * selectStars — the one place the star-bin's set formula is evaluated, so no
 * downstream stage ever sees a star twice.
 *
 * THE SET FORMULA (computed once, here)
 *
 *   stars = ((gaiaSelected ∖ hipMatched) ∪ hipparcosBright) ∖ famousStarSet
 *
 * The build joins three star populations that overlap:
 *
 *   - `gaiaSelected` — the G-sorted, distance-resolved Gaia rows (the bulk of
 *     the bin).
 *   - `hipparcosBright` — Hipparcos-2 rows with `Hpmag < 4.0`. Gaia saturates
 *     on the very brightest naked-eye stars, so for those the Hipparcos row is
 *     the trustworthy one and WINS over any Gaia row for the same physical star.
 *   - `famousStarSet` — the Gaia `source_id`s the SCENE already draws as named
 *     foreground bodies (the non-null `gaiaDr3` values of the famous-stars seed,
 *     `data/seeds/famous_stars.seed.json`). Drawing them again as bin points
 *     would double-render the same photons, so they are removed from the whole
 *     result.
 *
 * `hipMatched` is NOT "every HIP number that has a map entry" — it is only the
 * HIP numbers actually PRESENT in `hipparcosBright` that ALSO resolve to a Gaia
 * `source_id` via `hipToSourceId`. A bright Hipparcos row replaces the Gaia row
 * it cross-matches; a map entry for a non-bright HIP subtracts nothing (there is
 * no bright row to replace it with).
 *
 * The famous subtraction (`∖ famousStarSet`) applies to the WHOLE union, not
 * just the Gaia side: a Hipparcos-bright row whose Gaia cross-match is famous is
 * also removed. A row is famous through EITHER of two keys — its mapped Gaia
 * `source_id` OR its direct HIP id. The two keys exist because the very
 * brightest scene bodies (Sirius, Vega, Alpha Centauri…) have NO Gaia DR3 row
 * at all, so their bright Hipparcos rows carry no `hipToSourceId` entry and the
 * Gaia-id test alone can never catch them; the HIP id is the reliable key for
 * that bright patch. Both `famousGaiaIds` and `famousHipIds` derive from the one
 * famous-stars seed (`gaiaDr3` and `hipparcos` respectively).
 *
 * WHY DEDUP HERE AND NOWHERE ELSE
 * Placing the subtraction in the encoder means the octree, quantizer, and packer
 * all consume an already-deduplicated list. If any of those stages tried to also
 * dedup, they'd need to know the join keys (`source_id`, HIP) that they
 * otherwise never touch — braiding the set algebra through the whole pipeline.
 * One evaluation, one owner.
 *
 * WHAT THIS FUNCTION DOES *NOT* OWN
 * The `Hpmag < 4.0` cut and the per-row distance drops (Bailer-Jones absent,
 * Hipparcos non-positive parallax) are applied by the CALLERS that build `gaia`
 * and `hipparcosBright`. `SelectStarsResult.drops` still carries all four
 * counters for a single reporting surface, but this function only knows about
 * the two it computes — `famousSubtracted` and `hipGaiaSubtracted`. It returns 0
 * for `noBailerJones` and `hipNonPositivePlx`; the build orchestrator overwrites
 * those from its own parse/resolve stages. (The inputs type carries no caller
 * counts to thread through, so pass-through would be invented surface — the
 * orchestrator that owns those cuts owns their counts.)
 */

import type { Vec3 } from '../../src/@types/math/Vec3';

/**
 * The pre-quantization payload every downstream stage needs: a heliocentric
 * position in parsecs (the inputs arrive already positioned — this function is
 * pure over its inputs and never reprojects RA/Dec), the absolute magnitude and
 * BP−RP colour used for sizing and tinting, plus two build-tag fields the tier
 * truncation reads downstream — the apparent magnitude (its brightest-first
 * sort key) and whether the star is an always-kept supplement.
 *
 * `selectStars` never interprets `appMag`/`isSupplement`; it only forwards them,
 * exactly as it forwards `absMag`/`bpRp`. Carrying them on the row (rather than
 * re-joining them to the deduped output through a side-table) is deliberate: the
 * real build deduplicates ~16.8 M stars, and any per-star `Map`/`Set` keyed on
 * them would blow V8's 2^24-entry cap — see the note on `toStarInput` and the
 * `buildStars` module header.
 */
export type StarInput = {
  position: Vec3;
  absMag: number;
  bpRp: number;
  /** Apparent magnitude — the tier truncation's brightest-first sort key. */
  appMag: number;
  /** GCNS-only faint nearby star, exempt from per-tier apparent-mag truncation. */
  isSupplement: boolean;
};

/** A distance-resolved Gaia row, keyed by its DR3 `source_id`. */
export type GaiaSelectedRow = StarInput & { sourceId: bigint };

/** A distance-resolved Hipparcos-2 bright row (`Hpmag < 4.0`), keyed by HIP number. */
export type HipBrightRow = StarInput & { hip: number };

export type SelectStarsInputs = {
  gaia: readonly GaiaSelectedRow[]; // Gaia rows already G-sorted + distance-resolved
  hipparcosBright: readonly HipBrightRow[]; // hip2 rows with Hpmag < 4.0, distance-resolved
  hipToSourceId: ReadonlyMap<number, bigint>; // from hip2_best_neighbour (HIP → source_id)
  famousGaiaIds: ReadonlySet<bigint>; // non-null gaiaDr3 values from the famous-stars seed
  famousHipIds: ReadonlySet<number>; // flattened hipparcos values from the famous-stars seed
};

export type SelectStarsResult = {
  stars: StarInput[]; // merged, dedup'd (unpacked position + absMag + bpRp, pre-quantization)
  drops: {
    noBailerJones: number; // owned by the caller building `gaia`; 0 here
    hipNonPositivePlx: number; // owned by the caller building `hipparcosBright`; 0 here
    famousSubtracted: number; // rows removed because they matched a FamousStar id
    hipGaiaSubtracted: number; // Gaia rows removed because a bright Hipparcos row wins
  };
};

const toStarInput = (row: StarInput): StarInput => ({
  // `position` is carried through BY REFERENCE, not copied — a defensive copy of
  // all ~16.8 M position arrays would cost gigabytes for no gain, since callers
  // treat these outputs as read-only. The truncation tag rides on the row
  // itself (`appMag`/`isSupplement`), so it survives the dedup with no side-table
  // to re-join against.
  position: row.position,
  absMag: row.absMag,
  bpRp: row.bpRp,
  appMag: row.appMag,
  isSupplement: row.isSupplement,
});

export function selectStars(inputs: SelectStarsInputs): SelectStarsResult {
  const { gaia, hipparcosBright, hipToSourceId, famousGaiaIds, famousHipIds } = inputs;

  // hipMatched: the Gaia source_ids that a PRESENT bright Hipparcos row resolves
  // to. Only bright rows contribute — a map entry for a non-bright HIP is not a
  // replacement and must not subtract a Gaia row.
  const hipMatched = new Set<bigint>();
  for (const row of hipparcosBright) {
    const sourceId = hipToSourceId.get(row.hip);
    if (sourceId !== undefined) hipMatched.add(sourceId);
  }

  const stars: StarInput[] = [];
  let famousSubtracted = 0;
  let hipGaiaSubtracted = 0;

  // (gaiaSelected ∖ hipMatched) ∖ famousStarSet. hipMatched is checked FIRST:
  // a Gaia row replaced by a bright row leaves the set via the inner ∖, so it
  // counts as hipGaiaSubtracted even if it is also famous (the bright row that
  // replaces it then carries the famous subtraction).
  for (const row of gaia) {
    if (hipMatched.has(row.sourceId)) {
      hipGaiaSubtracted++;
      continue;
    }
    if (famousGaiaIds.has(row.sourceId)) {
      famousSubtracted++;
      continue;
    }
    stars.push(toStarInput(row));
  }

  // ∪ hipparcosBright, then ∖ famousStarSet on the union. A bright row is famous
  // through EITHER key: its direct HIP id (the reliable one for the brightest
  // scene bodies, which have no Gaia DR3 row) OR its mapped Gaia id (when the
  // cross-match resolves one). Either match removes the row.
  for (const row of hipparcosBright) {
    if (famousHipIds.has(row.hip)) {
      famousSubtracted++;
      continue;
    }
    const sourceId = hipToSourceId.get(row.hip);
    if (sourceId !== undefined && famousGaiaIds.has(sourceId)) {
      famousSubtracted++;
      continue;
    }
    stars.push(toStarInput(row));
  }

  return {
    stars,
    drops: {
      noBailerJones: 0,
      hipNonPositivePlx: 0,
      famousSubtracted,
      hipGaiaSubtracted,
    },
  };
}
