/**
 * deriveArmSpurCloudCount — the spur cloud's component-budget count; the sprites
 * themselves are GPU-placed (`placeArmSpurCloud.wesl`), but `galaxyFieldMixture.ts`
 * reserves slots against this before sizing the ridge chain.
 */
import type { GalaxyFieldArmRecord } from '../../../../../@types/galaxy/GalaxyFieldArmRecord';
import type { GalaxyDescription } from '../../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyFieldTuning } from '../../mixture/@types/GalaxyFieldTuning';
import { SPUR_CLOUD_MAX_COUNT } from '../data/spurCloudMaxCount';
import { spurFootprintIntegral } from './spurFootprintIntegral';

/**
 * Fixed nominal covering factor. Unlike the arm cloud, spurs carry no
 * `coverage` slider of their own — `sizeScale` and `elongation` (this tier's
 * only density levers) already move the covering fraction inversely, and a
 * feature meant to read as a handful of short feathers doesn't need a second
 * knob for "how many". Calibrated so a mid-disc spur under the shipped
 * defaults reads as a few-sprite feather, not a re-run of the arm cloud.
 */
const SPUR_COVERAGE = 1.1;

/** Sprite radius as a fraction of the LOCAL `armCrossSigma` — same draw range `deriveArmCloudCount.ts` uses. */
const SIZE_MIN_RATIO = 0.35;
const SIZE_MAX_RATIO = 1.0;
const MEAN_SIZE_FRAC_SQ =
  (SIZE_MIN_RATIO ** 2 + SIZE_MIN_RATIO * SIZE_MAX_RATIO + SIZE_MAX_RATIO ** 2) / 3;

/**
 * Component-budget count this tier will spend, summed across every spur —
 * `buildGalaxyFieldMixture` reserves exactly this many slots before sizing
 * the ridge chain, the `deriveArmCloudCount` pattern.
 */
export function deriveArmSpurCloudCount(
  spurArms: readonly GalaxyFieldArmRecord[],
  geometry: GalaxyDescription,
  tuning: GalaxyFieldTuning,
): number {
  const spurTuning = tuning.arms.spurs;
  if (spurArms.length === 0 || spurTuning.elongation <= 0 || spurTuning.sizeScale <= 0) return 0;
  const footprintFactor =
    Math.PI * spurTuning.elongation * spurTuning.sizeScale ** 2 * MEAN_SIZE_FRAC_SQ;
  let total = 0;
  for (const spur of spurArms) total += 2 * spurFootprintIntegral(spur, geometry, tuning);
  return Math.min(
    SPUR_CLOUD_MAX_COUNT,
    Math.max(0, Math.round((SPUR_COVERAGE * total) / footprintFactor)),
  );
}
