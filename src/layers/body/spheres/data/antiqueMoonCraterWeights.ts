/**
 * ANTIQUE_MOON_CRATER_WEIGHTS — a named crater's print weight, over the bake's (which
 * gives nearly every large crater 1, so a ruined walled plain rang as firm as Tycho).
 * The rayed Copernican craters weigh over 1, a heavier rim, the plate's first marks;
 * the old Nectarian and pre-Nectarian walled plains weigh under 0.7, their rims broken
 * into arcs as Riccioli's plate draws a worn wall. Ages after Wilhelms (1987).
 */
export const ANTIQUE_MOON_CRATER_WEIGHTS: Readonly<Record<string, number>> = {
  'moonPlace-tycho': 1.3,
  'moonPlace-copernicus': 1.3,
  'moonPlace-aristarchus': 1.3,
  'moonPlace-kepler': 1.15,
  'moonPlace-ptolemaeus': 0.4,
  'moonPlace-hipparchus': 0.35,
  'moonPlace-albategnius': 0.45,
  'moonPlace-maginus': 0.4,
  'moonPlace-longomontanus': 0.5,
  'moonPlace-clavius': 0.6,
  'moonPlace-wilhelm': 0.4,
  'moonPlace-orontius': 0.35,
  'moonPlace-purbach': 0.4,
  'moonPlace-walther': 0.45,
  'moonPlace-stofler': 0.4,
  'moonPlace-pitatus': 0.4,
  'moonPlace-regiomontanus': 0.4,
  'moonPlace-blancanus': 0.5,
};
