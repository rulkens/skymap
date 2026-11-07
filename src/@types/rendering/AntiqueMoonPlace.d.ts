/**
 * One name the antique look sets on the Moon (`ANTIQUE_MOON_PLACES`): a mare or a
 * Terra centred across what it names, fitted inside `extentDeg` as the eye sees it; a
 * crater on its floor when the name fits there, else just beside its rim. `name` is
 * Riccioli's 1651 form; a `\n` stacks it as his plate did.
 */

export type AntiqueMoonPlace = {
  /** Label id, unique across every producer. */
  readonly id: string;
  readonly name: string;
  /** One ladder across kinds: 1 wins a collision, and reveals a crater at the fewest px. */
  readonly rank: number;
  readonly latDeg: number;
  /** EAST-positive longitude, degrees (`surfacePointBodyFixed`'s convention). */
  readonly lonDeg: number;
} & (
  | { readonly kind: 'crater'; readonly diameterKm: number }
  | {
      readonly kind: 'mare' | 'terra';
      /** [minLat, maxLat, minLon, maxLon], degrees: the IAU box, or the Terra as engraved. */
      readonly extentDeg: readonly [number, number, number, number];
    }
);
