/**
 * VoyageReadouts — the voyage overlay's readouts as display strings, from `voyageReadouts`: both
 * clocks, the speed, γ, and the distance to the destination as Earth measures it and as the ship
 * does (contracted by γ).
 */

export type VoyageReadouts = {
  readonly shipClock: string;
  readonly earthClock: string;
  readonly speed: string;
  readonly gamma: string;
  readonly aheadEarthLy: string;
  readonly aheadShipLy: string;
};
