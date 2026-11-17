/**
 * AntiquePlateRing — a recorded body's ring as the plate engraves it, in the
 * body's radii (the radius its sphere is drawn at), world (equatorial) axes.
 */

export type AntiquePlateRing = {
  /** The engraved ellipses: C inner, B inner, Cassini mid, A outer. */
  readonly lines: readonly [number, number, number, number];
  /** The ring texture's outer edge: coverage up to here is ring, not a line. */
  readonly outer: number;
};
