/**
 * famousStarsSeed — parse + validate the hand-curated `famous_stars.seed.json`.
 *
 * The seed file is the single source of truth for every named star skymap
 * draws.  One build tool reads it (`buildFamousStars.ts`) to emit the committed
 * generated render/search table plus the InfoCard meta sidecar, and the Gaia
 * dedup (`buildStars.ts`) reads the same file to subtract curated stars from the
 * Gaia bin.  Centralising parsing + validation here means a single typo in the
 * JSON surfaces as one clear error, not scattered crashes across those consumers.
 *
 * As with `famousSeed.ts`, the schema is small and all-primitive, so we hand-roll
 * fail-loud validation rather than pull in zod/ajv — a throw naming the offending
 * `id` reads clearer than nested validator output.
 *
 * Why are duplicate ids a hard error?  The id keys the generated render row, the
 * meta sidecar lookup, AND the Gaia-dedup `source_id` set.  A duplicate would
 * silently overwrite an entry's row and confuse the dedup fact.
 *
 * Why is `gaiaDr3` a REQUIRED property whose value may be `null`?  The dedup
 * subtracts each entry's Gaia DR3 `source_id` from the star bin.  A *missing*
 * field must not be indistinguishable from an explicit `null`: "not yet resolved"
 * (a curation gap) has to fail loud, while `null` ("SIMBAD confirms no DR3 row" —
 * the Sun, saturated bright stars) is a real, intended value that contributes
 * nothing to subtract.  Making the key required forces every entry to state which
 * it is.  DR3 ids exceed Number.MAX_SAFE_INTEGER, so they live as digit strings.
 */

/**
 * One curated entry — exactly the shape stored in `famous_stars.seed.json`.
 * Co-located here (like `FamousEntry` in `famousSeed.ts`) as the tool-local
 * authoring contract; the runtime render/search projection is a separate,
 * narrower `FamousStarRow` emitted by the build tool.
 *
 * Why a `type` (not `interface`)?  Project convention — see CLAUDE.md.
 */
export type FamousStarEntry = {
  /** kebab-case, stable, URL-safe; the id every artefact keys on. */
  id: string;
  /** Curated display name (e.g. `"Betelgeuse"`).  Equals `names[0]`. */
  commonName: string;
  /**
   * Ordered aliases: `names[0] === commonName` (required).  By convention
   * `names[1]` is the Bayer designation when one exists — but many nearest stars
   * (Barnard's Star, Ross 154, Wolf 359) have none, so `names[1]` is NOT
   * required.  The palette searches all of them; the InfoCard shows `names[0]`
   * as headline and the rest as "also known as".
   */
  names: string[];
  /** IAU constellation (full name, e.g. `"Orion"`).  Palette secondary chip. */
  constellation: string;
  /** J2000 Right Ascension, degrees [0, 360). */
  ra: number;
  /** J2000 Declination, degrees [-90, 90]. */
  dec: number;
  /** Distance, parsecs (>= 0; the Sun's entry is 0).  Curated, never cz-derived. */
  distancePc: number;
  /** Apparent V magnitude. */
  magV: number;
  /** Absolute V magnitude.  Drives point brightness/size + the LOD crossover. */
  absMag: number;
  /** Full MK spectral string (e.g. `"M1-2 Ia-ab"`).  InfoCard + provenance. */
  spectralType: string;
  /**
   * Primary radius, R☉.  REQUIRED — a render input (feeds `radiusM`), always
   * estimable; a guessed 0 would silently corrupt the rendered model.
   */
  radiusSolar: number;
  /**
   * Effective surface temperature, K.  REQUIRED — a render input (drives surface
   * colour via the blackbody util), always estimable.
   */
  temperatureK: number;
  /** Primary mass, M☉.  OPTIONAL — omit when genuinely unknown (never a guess). */
  massSolar?: number;
  /** Bolometric luminosity, L☉.  OPTIONAL — omit when unknown. */
  luminositySolar?: number;
  /** Age, Gyr.  OPTIONAL — omit when unknown (never a guess). */
  ageGyr?: number;
  /** Flattening (a-c)/a, in (0, ~0.5).  OMIT when ≈ spherical.  Achernar ~0.35. */
  oblateness?: number;
  /** Structured variability, when applicable.  Drives InfoCard text. */
  variable?: { type: string; magRange: [number, number] };
  /**
   * Gaia DR3 source_id as a digit STRING (DR3 ids exceed
   * `Number.MAX_SAFE_INTEGER`; a JSON number would silently corrupt them), or
   * `null` when SIMBAD confirms no DR3 row (the Sun; saturated bright stars).
   * REQUIRED on every entry — a MISSING field is a validation error.
   */
  gaiaDr3: string | null;
  /** Optional provenance for a non-obvious resolution (which component, etc.). */
  gaiaDr3Note?: string;
  /**
   * Hipparcos catalog number (HIP), or `null` when the star has no HIP row.
   * Second dedup key alongside `gaiaDr3`: Gaia DR3 lacks the saturated bright
   * stars, so a HIP id lets the native builder subtract them from the HIP-derived
   * side.  REQUIRED on every entry — a MISSING field is a validation error, so a
   * curation gap ("not yet resolved") can never read as an intended `null`.
   */
  hip: number | null;
  /**
   * Additional resolved-component HIP ids for a multi-star famous entry —
   * dedup-only, never the identity. Present only when non-empty.
   *
   * Why does one entry ever need a second HIP? A famous entry is one point on
   * the map (one `hip` identity, one InfoCard), but the sky sometimes packs two
   * catalogued stars into it. Alpha Centauri is the motivating case: Gaia DR3
   * resolves *neither* component A nor B (both saturate the detector), so the
   * only way to keep their bright Hipparcos rows (HIP 71683 = A, HIP 71681 = B)
   * from doubling the scene body is to subtract BOTH from the star bin. The
   * canonical `hip` carries A; `hipCompanions` carries B. The native builder
   * unions these into its HIP dedup set; nothing else reads them (the InfoCard,
   * render row, and Gaia-side dedup all key on the single canonical identity).
   */
  hipCompanions?: number[];
  /** Curated prose, 3–5 sentences, fact-checked. */
  description: string;
};

/**
 * Extract the HIP integer from a `"HIP n"` alias in an entry's `names[]`, or
 * `null` when none is present.  The seed authors HIP twice — once as a human
 * alias the palette searches, once as the structured `hip` dedup key — so a
 * single parser here lets `validateFamousStarEntry` cross-check the two and
 * catch drift, rather than restating the regex at each call site.
 */
function hipFromAliases(names: string[]): number | null {
  for (const name of names) {
    const match = /^HIP (\d+)$/.exec(name);
    if (match) return Number(match[1]);
  }
  return null;
}

/**
 * Validate a single entry from the seed file.  Throws on any malformed field
 * with a message naming the offending entry's id.  Returns the input unchanged
 * so callers can chain through `validateFamousStarEntry` without re-typing.
 */
export function validateFamousStarEntry(e: FamousStarEntry): FamousStarEntry {
  if (typeof e.id !== 'string' || e.id.length === 0) {
    throw new Error(`famous stars seed: missing id on entry ${JSON.stringify(e).slice(0, 60)}`);
  }
  if (typeof e.commonName !== 'string' || e.commonName.length === 0) {
    throw new Error(`famous stars seed: ${e.id} has empty commonName`);
  }
  if (!Array.isArray(e.names) || e.names.length === 0) {
    throw new Error(`famous stars seed: ${e.id} has empty names array`);
  }
  if (e.names[0] !== e.commonName) {
    throw new Error(
      `famous stars seed: ${e.id} names[0] (${JSON.stringify(e.names[0])}) must equal commonName (${JSON.stringify(e.commonName)})`,
    );
  }
  if (typeof e.constellation !== 'string' || e.constellation.length === 0) {
    throw new Error(`famous stars seed: ${e.id} has empty constellation`);
  }
  if (!Number.isFinite(e.ra) || e.ra < 0 || e.ra >= 360) {
    throw new Error(`famous stars seed: ${e.id} has out-of-range ra ${e.ra}`);
  }
  if (!Number.isFinite(e.dec) || e.dec < -90 || e.dec > 90) {
    throw new Error(`famous stars seed: ${e.id} has out-of-range dec ${e.dec}`);
  }
  // The Sun is 0 pc from itself, so distance is non-negative rather than
  // strictly positive (the one place this schema differs from the galaxy seed).
  if (!Number.isFinite(e.distancePc) || e.distancePc < 0) {
    throw new Error(`famous stars seed: ${e.id} has negative distancePc ${e.distancePc}`);
  }
  // Apparent V spans the Sun (-26.74) at the bright end to the faintest curated
  // naked-ish targets (Proxima at +11.1); [-27, 16] keeps a mistyped value loud
  // without clipping any real entry.
  if (!Number.isFinite(e.magV) || e.magV < -27 || e.magV > 16) {
    throw new Error(
      `famous stars seed: ${e.id} has out-of-range magV ${e.magV} (expected [-27, 16])`,
    );
  }
  // Absolute V runs from luminous supergiants (~-12) to dim M dwarfs (~+17);
  // [-12, 20] leaves headroom while catching a sign/units slip.
  if (!Number.isFinite(e.absMag) || e.absMag < -12 || e.absMag > 20) {
    throw new Error(
      `famous stars seed: ${e.id} has out-of-range absMag ${e.absMag} (expected [-12, 20])`,
    );
  }
  if (typeof e.spectralType !== 'string' || e.spectralType.length === 0) {
    throw new Error(`famous stars seed: ${e.id} has empty spectralType`);
  }
  if (!Number.isFinite(e.radiusSolar) || e.radiusSolar <= 0) {
    throw new Error(`famous stars seed: ${e.id} has non-positive radiusSolar ${e.radiusSolar}`);
  }
  // Blackbody surface colour is only meaningful across stellar temperatures;
  // the wide (1000, 60000) bound keeps a mistyped value loud.
  if (!Number.isFinite(e.temperatureK) || e.temperatureK <= 1000 || e.temperatureK >= 60000) {
    throw new Error(
      `famous stars seed: ${e.id} has out-of-range temperatureK ${e.temperatureK} (expected (1000, 60000))`,
    );
  }
  // Optional physical fields: present + finite + positive, OR absent (genuinely
  // unknown — the InfoCard simply omits the line).  Never required to travel
  // together; a star may have a mass estimate but no age, or vice versa.
  for (const field of ['massSolar', 'luminositySolar', 'ageGyr'] as const) {
    const v = e[field];
    if (v !== undefined && (!Number.isFinite(v) || v <= 0)) {
      throw new Error(`famous stars seed: ${e.id} has non-positive ${field} ${v}`);
    }
  }
  if (e.oblateness !== undefined) {
    if (!Number.isFinite(e.oblateness) || e.oblateness <= 0 || e.oblateness >= 0.5) {
      throw new Error(
        `famous stars seed: ${e.id} has out-of-range oblateness ${e.oblateness} (expected (0, 0.5))`,
      );
    }
  }
  // Optional structured variability: when present, `type` must name the class
  // and `magRange` must be exactly two finite magnitudes, bright-first.
  if (e.variable !== undefined) {
    if (typeof e.variable.type !== 'string' || e.variable.type.length === 0) {
      throw new Error(`famous stars seed: ${e.id} has empty variable.type`);
    }
    const range = e.variable.magRange;
    if (!Array.isArray(range) || range.length !== 2 || !range.every((n) => Number.isFinite(n))) {
      throw new Error(
        `famous stars seed: ${e.id} has invalid variable.magRange ${JSON.stringify(range)} (expected two finite numbers)`,
      );
    }
    if (range[0] > range[1]) {
      throw new Error(
        `famous stars seed: ${e.id} has variable.magRange out of order ${JSON.stringify(range)} (expected [min, max])`,
      );
    }
  }
  // gaiaDr3 must be PRESENT (own property), and either null or an all-digits
  // string.  `!== undefined` alone would let a missing key with an `undefined`
  // prototype value slip through, so we check own-property existence explicitly.
  if (!Object.prototype.hasOwnProperty.call(e, 'gaiaDr3')) {
    throw new Error(`famous stars seed: ${e.id} is missing the required gaiaDr3 field`);
  }
  if (e.gaiaDr3 !== null) {
    if (typeof e.gaiaDr3 !== 'string' || !/^\d+$/.test(e.gaiaDr3)) {
      throw new Error(
        `famous stars seed: ${e.id} has invalid gaiaDr3 ${JSON.stringify(e.gaiaDr3)} (expected all-digits string or null)`,
      );
    }
  }
  // hip mirrors the gaiaDr3 required-field invariant: PRESENT (own property),
  // and either null or a positive integer.  `!== undefined` alone would let a
  // missing key slip through, so we check own-property existence explicitly — a
  // curation gap must fail loud rather than read as an intended "no HIP row".
  if (!Object.prototype.hasOwnProperty.call(e, 'hip')) {
    throw new Error(`famous stars seed: ${e.id} is missing the required hip field`);
  }
  if (e.hip !== null) {
    if (!Number.isInteger(e.hip) || e.hip <= 0) {
      throw new Error(
        `famous stars seed: ${e.id} has invalid hip ${JSON.stringify(e.hip)} (expected positive integer or null)`,
      );
    }
  }
  // When a `"HIP n"` alias is present, the structured `hip` must equal it — the
  // two are hand-authored independently, so this catches a typo drifting them
  // apart.  A non-null `hip` with no alias is allowed (the Alpha-Centauri case:
  // a real HIP exists but the curator listed HD 128620 rather than a HIP alias).
  const aliasHip = hipFromAliases(e.names);
  if (aliasHip !== null && e.hip !== aliasHip) {
    throw new Error(
      `famous stars seed: ${e.id} has hip ${JSON.stringify(e.hip)} disagreeing with its "HIP ${aliasHip}" alias`,
    );
  }
  // Optional companion HIP ids: additional resolved components a multi-star
  // entry contributes to the dedup set. Present only when non-empty, and only
  // when the canonical `hip` exists — a companion enriches an identity, it never
  // stands in for a missing one. Each must be a positive int, distinct from the
  // others and from the entry's own `hip` (a repeat would double-count the same
  // Hipparcos row in the subtraction).
  if (e.hipCompanions !== undefined) {
    if (e.hip === null) {
      throw new Error(
        `famous stars seed: ${e.id} has hipCompanions but a null hip (companions require a canonical hip)`,
      );
    }
    if (!Array.isArray(e.hipCompanions) || e.hipCompanions.length === 0) {
      throw new Error(
        `famous stars seed: ${e.id} has an empty or non-array hipCompanions (omit the key when there are none)`,
      );
    }
    const seenCompanions = new Set<number>();
    for (const c of e.hipCompanions) {
      if (!Number.isInteger(c) || c <= 0) {
        throw new Error(
          `famous stars seed: ${e.id} has invalid hipCompanions member ${JSON.stringify(c)} (expected positive integer)`,
        );
      }
      if (c === e.hip) {
        throw new Error(
          `famous stars seed: ${e.id} has hipCompanions member ${c} equal to its own hip`,
        );
      }
      if (seenCompanions.has(c)) {
        throw new Error(`famous stars seed: ${e.id} has duplicate hipCompanions member ${c}`);
      }
      seenCompanions.add(c);
    }
  }
  if (typeof e.description !== 'string' || e.description.length === 0) {
    throw new Error(`famous stars seed: ${e.id} has empty description`);
  }
  return e;
}

/**
 * Select the entries that contribute a Gaia dedup id: those whose `gaiaDr3` is a
 * real DR3 `source_id`, dropping the `null` ones (the Sun; saturated bright stars
 * SIMBAD confirms have no DR3 row — a genuine "no row to subtract", not a gap).
 *
 * This selection rule has ONE home because it is applied by two independent build
 * paths — `buildStars.ts` bakes the ids into a `Set<bigint>` for the TS star bin,
 * `buildFamousStars.ts` emits them as a `[u64; N]` Rust const for the native
 * builder.  Were the `e.gaiaDr3 !== null` predicate restated in each, a future
 * clause (say, excluding an id flagged unreliable) could be added to one and
 * silently forgotten in the other, drifting the two star bins apart — and no test
 * binds them (the Rust side lives outside vitest).  Both encoders call this, so
 * the rule can only change in one place.
 *
 * Generic over the entry shape so each caller keeps its own input: the return
 * type narrows `gaiaDr3` from `string | null` to `string`, so callers read
 * `e.gaiaDr3` as a plain string with no non-null assertion.  Preserves seed order
 * (the Rust provenance comments and the emitted array both read in seed order).
 */
export function selectDedupEntries<T extends Pick<FamousStarEntry, 'gaiaDr3'>>(
  entries: readonly T[],
): (T & { gaiaDr3: string })[] {
  return entries.filter((e): e is T & { gaiaDr3: string } => e.gaiaDr3 !== null);
}

/**
 * Select the entries that contribute a HIP dedup id: those whose `hip` is a real
 * Hipparcos number, dropping the `null` ones (the Sun; stars with no HIP row).
 * The HIP counterpart of `selectDedupEntries` — a distinct key because the native
 * builder subtracts famous stars from BOTH the Gaia and the HIP-derived sides, and
 * Gaia DR3 lacks exactly the saturated bright stars a HIP id still catches.  Same
 * one-home rationale: the emitter here and any future HIP consumer share the rule,
 * so it can only change in one place.  The return type narrows `hip` from
 * `number | null` to `number`; seed order is preserved for the Rust provenance.
 */
export function selectHipEntries<T extends Pick<FamousStarEntry, 'hip'>>(
  entries: readonly T[],
): (T & { hip: number })[] {
  return entries.filter((e): e is T & { hip: number } => e.hip !== null);
}

/**
 * Parse and validate the entire seed JSON.  Throws on any per-entry problem AND
 * on duplicate ids across the catalog.
 */
export function parseFamousStarsSeed(rawJson: string): FamousStarEntry[] {
  const parsed = JSON.parse(rawJson);
  if (!Array.isArray(parsed)) {
    throw new Error('famous stars seed: root must be an array');
  }
  const seen = new Set<string>();
  const out: FamousStarEntry[] = [];
  for (const e of parsed) {
    validateFamousStarEntry(e as FamousStarEntry);
    const id = (e as FamousStarEntry).id;
    if (seen.has(id)) {
      throw new Error(`famous stars seed: duplicate id "${id}"`);
    }
    seen.add(id);
    out.push(e as FamousStarEntry);
  }
  return out;
}
