import type { Vec3 } from '../../../../../../src/@types/math/Vec3';
import type { CatalogPoints } from '../../../../@types/CatalogPoints';
import { buildFitProfile } from '../../../field/buildFitProfile';
import { fitProfileBounds } from '../../../field/fitProfileBounds';

/**
 * resolveAutoFitBounds — the min/max Auto fit hands to `fitBoxToCatalog`.
 * At 100% this returns `catalogBoundsMpc` untouched (today's path) rather
 * than routing through `buildFitProfile`/`fitProfileBounds`, which rank by a
 * different key (L∞-from-median) and would only coincidentally agree.
 */
export function resolveAutoFitBounds(
  points: CatalogPoints | null,
  catalogBoundsMpc: { min: Vec3; max: Vec3 },
  autoFitPercent: number,
): { min: Vec3; max: Vec3 } {
  if (autoFitPercent >= 100 || !points) return catalogBoundsMpc;
  const profile = buildFitProfile(points.positions);
  const { minMpc, maxMpc } = fitProfileBounds(profile, autoFitPercent / 100);
  return { min: minMpc, max: maxMpc };
}
