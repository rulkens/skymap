/**
 * weightUnitWarning — a hint when a linear weight column looks like it is in
 * the wrong unit. It never rescales: the column may not be stellar mass at all.
 * The 0.02 is the median of the published SDSS run (stellar mass in 10¹² M☉).
 */
import type { CatalogImportSettings } from '../../@types/CatalogImportSettings';
import type { WeightStats } from '../../@types/WeightStats';
import { formatWeight } from './formatWeight';

const LOG_MASS_RANGE = { min: 5, max: 15 };
const MEDIAN_CEILING = 2;

export function weightUnitWarning(
  stats: WeightStats,
  weight: CatalogImportSettings['weight'],
): string | null {
  if (weight.kind !== 'linear') return null;
  if (stats.min >= LOG_MASS_RANGE.min && stats.max <= LOG_MASS_RANGE.max) {
    return `Weights run from ${formatWeight(stats.min)} to ${formatWeight(stats.max)}, which looks like log₁₀ mass. Choose "log₁₀ of mass in M☉", or load anyway.`;
  }
  if (stats.median > MEDIAN_CEILING) {
    return `Median weight is ${formatWeight(stats.median)}. Built-in catalogs use stellar mass in 10¹² M☉, where the median is near 0.02. For 10⁹ M☉ use a scale of 0.001, or load anyway.`;
  }
  return null;
}
