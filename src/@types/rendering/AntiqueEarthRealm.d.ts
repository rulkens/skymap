/**
 * One realm or province the antique look names on Earth (`ANTIQUE_EARTH_REALMS`),
 * as an Amsterdam plate of 1690 lettered it. The table is baked with the map's
 * borders (`tools/antique/earth/sources/realmsSource.ts`), so its anchors sit in
 * the land those borders enclose.
 */

export type AntiqueEarthRealm = {
  /** Label id, unique across every producer: `earthRealm-<key>`. */
  readonly id: string;
  /** Latin capitals as engraved; U stands for the V the label code letters. */
  readonly name: string;
  readonly modern: string;
  /** Label anchor: geodetic latitude, degrees. */
  readonly latDeg: number;
  /** EAST-positive longitude, degrees (`surfacePointBodyFixed`'s convention). */
  readonly lonDeg: number;
  /** Its border rank: 1 a sovereign, 2 a realm within an empire, 3 a province. */
  readonly rank: 1 | 2 | 3;
  /** Reveal level (`antiqueMapReveal.ts`): it fades in over detail level..level + 1. */
  readonly level: number;
};
