import { bmngMonthKey } from './bmngMonthKey';
import { BMNG_VINTAGE } from './bmngVintage';

/** Registry key of the app's Blue Marble equirect: the `BMNG_VINTAGE` month's row. */
export const BMNG_VINTAGE_KEY = bmngMonthKey(Number(BMNG_VINTAGE.stamp.slice(4)));
