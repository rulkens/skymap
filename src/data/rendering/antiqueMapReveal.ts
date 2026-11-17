/**
 * The antique Earth map's reveal ladder. `detail` = log2(print units per km of
 * ground under the eye / ANTIQUE_MAP_DETAIL_BASE): about −0.6 for the whole
 * globe, 2 for Europe from 3,000 km, 4 for the Low Countries from 700 km, 7 for a
 * city from 80 km. A feature baked at level L fades in over detail L..L+1.
 */
export const ANTIQUE_MAP_DETAIL_BASE = 0.06;
