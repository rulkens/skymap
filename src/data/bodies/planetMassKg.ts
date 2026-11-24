/**
 * planetMassKg — the eight planets' masses in kg, keyed by the id each carries in `ORBITAL_ELEMENTS`.
 * Source: NASA planetary fact sheets, https://nssdc.gsfc.nasa.gov/planetary/factsheet/
 */

export const PLANET_MASS_KG: Readonly<Record<string, number>> = {
  mercury: 3.301e23,
  venus: 4.8673e24,
  earth: 5.9722e24,
  mars: 6.4169e23,
  jupiter: 1.89813e27,
  saturn: 5.6832e26,
  uranus: 8.6811e25,
  neptune: 1.02409e26,
};
