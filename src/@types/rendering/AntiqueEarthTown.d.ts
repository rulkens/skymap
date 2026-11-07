/**
 * One settlement the antique look signs on Earth (`ANTIQUE_EARTH_TOWNS`): a place that
 * stood in 1690, named as a Dutch-language Amsterdam map of c.1690 engraved it, drawn
 * with a town sign (`townSign.wesl`) and its name beside. `sign` is the regional sign;
 * past the plan-to-profile scale a plan sign prints as `town` (tier 0: `capital`).
 */

export type AntiqueEarthTown = {
  /** Label id, unique across every producer. */
  readonly id: string;
  /** The c.1690 engraved spelling. */
  readonly name: string;
  readonly modern: string;
  /** Geodetic latitude, degrees. */
  readonly latDeg: number;
  /** EAST-positive longitude, degrees (`surfacePointBodyFixed`'s convention). */
  readonly lonDeg: number;
  /** Reveal rung: 0 capital or world city, 1 major city, 2 town, 3 small town or village. */
  readonly tier: 0 | 1 | 2 | 3;
  readonly sign: 'capital' | 'cityPlan' | 'fortress' | 'town' | 'village' | 'hamlet';
  /** c.1690 population: 0 ≥200k, 1 50–200k, 2 10–50k, 3 2–10k, 4 <2k; declutter order in a tier. */
  readonly popClass: 0 | 1 | 2 | 3 | 4;
  /** A cross (bishopric) or double cross (archbishopric) over the sign, after Lubin 1678. */
  readonly see?: 'bishop' | 'archbishop';
};
