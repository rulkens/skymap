import type { CatalogImportSettings } from '../../@types/CatalogImportSettings';
import type { CatalogLoadOutcome } from '../../@types/CatalogLoadOutcome';
import type { CatalogPreview } from '../../@types/CatalogPreview';
import type { CatalogSource } from '../../@types/CatalogSource';
import { catalogBounds } from '../field/catalogBounds';
import { catalogFromCsvColumns } from '../field/catalogFromCsvColumns';
import { loadPackedCatalog } from '../field/loadPackedCatalog';
import { weightStatsFor } from '../field/weightStatsFor';
import { weightUnitWarning } from '../field/weightUnitWarning';
import { resolveAutoFitBounds } from '../ui/GridBoxPanel/utils/resolveAutoFitBounds';
import { meanStdDev } from '../utils/meanStdDev';

// The fork packs positions in Mpc and weights already scaled.
const PACKED_SETTINGS: CatalogImportSettings = {
  format: { kind: 'cartesianMpc' },
  weight: { kind: 'linear', scale: 1 },
};

/** previewCatalog — what the held files come to under `settings`; a packed pair ignores them. */
export function previewCatalog(
  source: CatalogSource,
  settings: CatalogImportSettings,
  autoFitPercent: number,
): CatalogPreview {
  const outcome = outcomeOf(source, settings);
  const catalog = outcome.kind === 'problem' ? null : outcome.catalog;
  const points = catalog && catalog.points.count > 0 ? catalog.points : null;
  if (!points) return { outcome, bounds: null, weight: null, fitBounds: null };
  const bounds = catalogBounds(points.positions);
  return {
    outcome,
    bounds,
    weight: meanStdDev(points.weight),
    fitBounds: resolveAutoFitBounds(points, bounds, autoFitPercent),
  };
}

function outcomeOf(source: CatalogSource, settings: CatalogImportSettings): CatalogLoadOutcome {
  const { fileName } = source;
  if (source.kind === 'packed') {
    try {
      const { points } = loadPackedCatalog(source.bin, source.metadataText);
      const weightStats = weightStatsFor(points.weight);
      return {
        kind: 'ready',
        catalog: { points, fileName, settings: PACKED_SETTINGS, weightStats },
      };
    } catch (err) {
      return { kind: 'problem', message: (err as Error).message, showExample: false };
    }
  }

  const parsed = catalogFromCsvColumns(source.columns, settings);
  if (parsed.kind === 'problem') return { ...parsed, showExample: true };
  const catalog = { points: parsed.points, fileName, settings, weightStats: parsed.weightStats };
  const warning = weightUnitWarning(parsed.weightStats, settings.weight);
  return warning ? { kind: 'warning', warning, catalog } : { kind: 'ready', catalog };
}
