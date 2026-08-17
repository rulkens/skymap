/**
 * SStarSeed — one transcribed row of Gillessen+ 2017's Galactic-Centre orbit
 * table (VizieR `J/ApJ/837/30/table3`), kept in the units and the reference
 * convention the paper publishes.
 *
 * The fields deliberately name their units (`…Arcsec`, `…Deg`, `…Yr`) rather
 * than matching `OrbitalElements`' Mpc/radians: a seed is a transcription, and
 * every unit AND frame conversion happens once, in `makers/sStar.ts`. The sky
 * angles in particular are astrometric — Ω a position angle North through East,
 * i measured against a left-handed (North, East, away) basis — so converting
 * them anywhere but the maker would mirror the orbits twice over.
 */

export type SStarSeed = {
  /** Stable identifier, the catalogue name lowercased (e.g. `'s2'`). */
  readonly id: string;
  /** Catalogue name as published (e.g. `'S2'`). */
  readonly label: string;
  /** True semi-major axis a as an angle at R₀, in arcsec. 1″ = 8178 AU. */
  readonly semiMajorArcsec: number;
  /** Eccentricity e. Bound rows only, so always below 1. */
  readonly eccentricity: number;
  /** Inclination i, in degrees, astrometric sense (< 90° = prograde on sky). */
  readonly inclinationDeg: number;
  /** Ω, in degrees — a sky position angle, North through East. */
  readonly ascendingNodeDeg: number;
  /** Argument of periapsis ω, in degrees, measured from the ascending node. */
  readonly argPeriapsisDeg: number;
  /** Epoch of pericentre passage Tp, as a fractional Julian year. */
  readonly periapsisEpochYr: number;
  /** Orbital period P, in Julian years of 365.25 days. */
  readonly periodYr: number;
  /** Apparent K-band magnitude — reddened; dereddening is downstream. */
  readonly kMag: number;
  /** The table's `SpT` flag: `e`, `l`, or blank for the two unclassified rows. */
  readonly spectralClass: 'early' | 'late' | 'unknown';
};
