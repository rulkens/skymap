/**
 * BodyFacts — the curated "planetary fact sheet" row set for a Solar-System
 * body (a planet, the Moon, another moon, or Earth), shown in BodyDetailCard.
 *
 * Every field is a pre-formatted display *string*, not a raw number: the values
 * are static curated constants (a planet's mass never changes between builds),
 * so baking the unit + friendly rounding into the datum keeps the card a dumb
 * renderer and lets each body pick the unit that reads best — Earth masses for
 * planets, kilograms for a moon a billion times lighter, "243 Earth days
 * (retrograde)" where a bare number would mislead. This is the deliberate
 * contrast with the famous-star `FamousStarMetaEntry` sidecar, which is fetched
 * async and carries raw numeric fields the card formats: the bodies here are a
 * tiny fixed set, so they compile straight into the bundle with no fetch.
 *
 * Optional fields drop their row entirely when absent (the card family's
 * absent-row pattern) — a moon carries no `moons` count, a rocky world names no
 * gas mix. `parent` is the discriminant: present ⇒ this body is a moon, and the
 * distance / orbital-period rows relabel to speak of its planet rather than the
 * Sun.
 *
 * `wikiTitle` is an EXPLICIT Wikipedia article title per body rather than one
 * derived from the label, because the mapping is genuinely irregular: Mercury's
 * article is `Mercury_(planet)` (the plain slug is the element/god), while
 * Venus's is just `Venus`. Deriving it would need a table of exceptions anyway,
 * so the honest form is to state the title outright at each seed.
 */

export type BodyFacts = {
  /** Mass — Earth masses (M⊕) for planets, kilograms for moons. */
  readonly mass?: string;
  /** Surface gravity relative to Earth (g). */
  readonly gravity?: string;
  /** Sidereal rotation, friendly units; 'Tidally locked' for synchronous moons. */
  readonly dayLength?: string;
  /** Orbital period — around the Sun for planets, around the parent for moons. */
  readonly yearLength?: string;
  /** Orbital distance — AU from the Sun for planets, km from the parent for moons. */
  readonly distance?: string;
  /** The parent planet's name — present only for moons; drives the distance/period labels. */
  readonly parent?: string;
  /** Mean surface temperature (°C). */
  readonly meanTemp?: string;
  /** Number of known moons — planets only. */
  readonly moons?: string;
  /** Axial tilt / obliquity to orbit (degrees) — the "why seasons" number. */
  readonly axialTilt?: string;
  /** Short atmospheric-composition string, e.g. 'CO₂ (96%)', 'None'. */
  readonly atmosphere?: string;
  /** Explicit Wikipedia article title, e.g. 'Mercury_(planet)'. */
  readonly wikiTitle: string;
};
