/**
 * Star-render photometry constants — the resolved-star knee and flat-emissive
 * brightness, and the ordering invariant that ties them to the bloom threshold.
 *
 * These are the authoritative TS home. Two shaders carry hand-written MIRRORS of
 * the numbers (`?static` WESL linking is pure build-time linking with NO value
 * injection, so a WESL `const` cannot read a TS value): `lib/starKnee.wesl`
 * mirrors `STAR_KNEE`, and `bodies/star/fragment.wesl` mirrors `STAR_EMISSIVE`.
 * A parity test (`tests/services/gpu/shaders/bloomSeedingConstants.parity.test.ts`)
 * reads those `.wesl` files and asserts each value matches the export of the
 * same name, so the two sides cannot drift.
 *
 * ### The bloom-seeding ordering invariant
 *
 * For the resolved Sun to bloom, three values must stay ordered:
 *
 *   DEFAULT_BLOOM_THRESHOLD < STAR_KNEE <= STAR_EMISSIVE
 *
 * The bloom bright-pass threshold has to sit below the star knee (so survey-star
 * cores still clear it and bleed into the glow) and at or below the resolved-star
 * emissive (so the Sun's disc, painted at STAR_EMISSIVE, seeds the glow rather
 * than being prefiltered away). The threshold slider's `max` reads STAR_EMISSIVE
 * so the UI cannot let the user raise the threshold past the Sun's own
 * brightness, which would kill its bloom.
 *
 * This ordering is the ESSENTIAL relationship the values legitimately live in
 * three subsystems (a data default, a shader knee, a shader emissive), so
 * documenting the invariant in one place is the right move. The ACCIDENTAL part
 * removed alongside this home is the set of un-linked literals: the bare `max=12`
 * on the slider and the prose-only restatements of the numbers.
 */

export const STAR_KNEE = 8.0;
export const STAR_EMISSIVE = 12.0;
