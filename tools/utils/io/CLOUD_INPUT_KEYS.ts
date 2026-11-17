import { BMNG_MONTHS } from './BMNG_MONTHS';
import { bmngMonthKey } from './bmngMonthKey';

/**
 * The cloud bake's fixed inputs: the baseline map it matches to and the twelve BMNG months it cuts
 * the ice mask from. `fetch-cloud-inputs` pulls exactly these from the R2 mirror, and `sync-r2`'s
 * "Cloud bake inputs" group is what puts them there.
 */
export const CLOUD_INPUT_KEYS = [
  'textures.earthClouds',
  ...BMNG_MONTHS.map(({ month }) => bmngMonthKey(month)),
] as const;
