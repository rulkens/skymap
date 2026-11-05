/**
 * Where a star lies on the website's band of sky, in degrees: `along` the band's great circle, southward
 * from its start and wrapped to 0–360, and `across` it as a Mercator ordinate, east positive.
 */
export type StarBandPosition = {
  along: number;
  across: number;
};
