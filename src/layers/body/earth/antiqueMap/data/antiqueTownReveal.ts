/**
 * ANTIQUE_TOWN_REVEAL — how the antique look signs and names a town by tier
 * (`AntiqueEarthTown.tier`), on the map's reveal ladder (`antiqueMapReveal.ts`).
 * Capitals arrive with the continent, towns with the country, villages near city
 * scale. A walled town is drawn in plan only on a regional plate, as Visscher
 * drew Holland (1690); coarser, it prints the profile sign of a small-scale map.
 * Sizes in print units, the sign's full height; name px at the label clamp.
 */

export const ANTIQUE_TOWN_REVEAL = {
  tierLevel: [0, 1, 3, 5],
  planLevel: 4,
  profileUnits: [22, 17, 14, 12],
  planUnits: [30, 22, 16, 14],
  fortressUnits: 18,
  villageUnits: 12,
  hamletUnits: 8,
  namePx: [19, 16, 14, 12],
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
