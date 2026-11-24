/**
 * BodyFacts — the curated fact sheet of a Solar-System body or a mesh body (whale, petunias),
 * shown in BodyDetailCard and compiled into the bundle: a tiny fixed set needs no fetch.
 *
 * Every field but `massKg` is a pre-formatted display string, so each body states the unit that
 * reads best ("243 Earth days (retrograde)"). Mass is a number because the app calculates with it.
 * An absent field drops its card row. `parent` present ⇒ the body is a moon, and the distance and
 * period rows speak of its planet. `wikiTitle` is explicit because the article mapping is irregular
 * (`Mercury_(planet)` but `Venus`).
 */

export type BodyFacts = {
  /** Mass in kg, a number because it is calculated with (Hill radius); `formatBodyMass` picks the card's unit. */
  readonly massKg?: number;
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
  /** One-or-two-sentence narrative blurb, rendered as the card's DescriptionBlock. */
  readonly description?: string;
};
