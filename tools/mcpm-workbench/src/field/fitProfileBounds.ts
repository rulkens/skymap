import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { FitProfile } from '../../@types/FitProfile';

/**
 * fitProfileBounds — bounds of the densest `fraction` of a `FitProfile`'s
 * points, evicting the `1 - fraction` fringe stragglers. O(1): a single
 * prefix-array index, since `buildFitProfile` already did the sorting.
 *
 * `fraction = 1` reads the last prefix entry, which is the full min/max —
 * identical to `catalogBounds` bit-for-bit since both fold the same set of
 * points through the same min/max comparisons, just in a different order.
 */
export function fitProfileBounds(
  profile: FitProfile,
  fraction: number,
): { minMpc: Vec3; maxMpc: Vec3; keptCount: number } {
  const { count } = profile;
  if (count === 0) return { minMpc: [0, 0, 0], maxMpc: [0, 0, 0], keptCount: 0 };

  const keptCount = Math.min(count, Math.max(2, Math.ceil(fraction * count)));
  const k = keptCount - 1;

  return {
    minMpc: [
      profile.prefixMin[k * 3]!,
      profile.prefixMin[k * 3 + 1]!,
      profile.prefixMin[k * 3 + 2]!,
    ],
    maxMpc: [
      profile.prefixMax[k * 3]!,
      profile.prefixMax[k * 3 + 1]!,
      profile.prefixMax[k * 3 + 2]!,
    ],
    keptCount,
  };
}
