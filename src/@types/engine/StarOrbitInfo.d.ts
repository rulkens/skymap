/**
 * StarOrbitInfo — the orbital block of a star's InfoCard, in the units a reader
 * quotes rather than the renderer's Mpc and radians. Its one producer is the
 * S-star seed table (`sStarOrbitInfo`), which is why this stays a core type
 * while the card that renders it lives in the star Layer.
 *
 * `focusLabel` names what the body goes around, so the card states the focus
 * instead of leaving it to be inferred from context. The pericentre appears in
 * two units deliberately: AU is what the S-star literature prints, Schwarzschild
 * radii is what says how close to the horizon the star actually gets.
 */

export type StarOrbitInfo = {
  readonly focusLabel: string;
  readonly periodYr: number;
  readonly eccentricity: number;
  readonly pericentreAu: number;
  readonly pericentreSchwarzschildRadii: number;
  readonly pericentreSpeedKmS: number;
};
