/**
 * ANTIQUE_TOWN_REVEAL — how the antique look signs and names a town by tier
 * (`AntiqueEarthTown.tier`), on the map's reveal ladder (`antiqueMapReveal.ts`).
 * Capitals arrive with the continent, towns with the country, villages near city
 * scale. A walled town is drawn in plan only on a regional plate, as Visscher
 * drew Holland (1690); coarser, it prints the profile sign of a small-scale map.
 * Sizes in print units, the sign's full height.
 */

export const ANTIQUE_TOWN_REVEAL = {
  tierLevel: [0, 1, 3, 5],
  planLevel: 4,
  profileUnits: [30, 24, 20, 17],
  planUnits: [34, 26, 20, 17],
  fortressUnits: 22,
  villageUnits: 16,
  hamletUnits: 10,
} as const;

/** `townSigns.wesl`'s kind codes and see flags. */
export const ANTIQUE_TOWN_SIGN_KIND = {
  capital: 0,
  cityPlan: 1,
  fortress: 2,
  town: 3,
  village: 4,
  hamlet: 5,
  bishop: 16,
  archbishop: 32,
} as const;
