import type { CatalogContents } from '../../../../@types/CatalogContents';
import type { CatalogImportSettings } from '../../../../@types/CatalogImportSettings';
import type { CatalogLoadOutcome } from '../../../../@types/CatalogLoadOutcome';
import { loadPackedCatalog } from '../../../field/loadPackedCatalog';
import { parseCsvCatalog } from '../../../field/parseCsvCatalog';
import { weightStatsFor } from '../../../field/weightStatsFor';
import { weightUnitWarning } from '../../../field/weightUnitWarning';

// The fork packs positions in Mpc and weights already scaled.
const PACKED_SETTINGS: CatalogImportSettings = {
  format: { kind: 'cartesianMpc' },
  weight: { kind: 'linear', scale: 1 },
};

/** Parses files already read into memory; a packed pair ignores `settings`. Nothing is dispatched here. */
export function parseCatalogContents(
  contents: CatalogContents,
  settings: CatalogImportSettings,
): CatalogLoadOutcome {
  const { fileName } = contents;
  if (contents.kind === 'packed') {
    try {
      const { points } = loadPackedCatalog(contents.bin, contents.metadataText);
      const weightStats = weightStatsFor(points.weight);
      return {
        kind: 'ready',
        catalog: { points, fileName, settings: PACKED_SETTINGS, weightStats },
      };
    } catch (err) {
      return { kind: 'problem', message: (err as Error).message, showExample: false };
    }
  }

  const parsed = parseCsvCatalog(contents.text, settings);
  if (parsed.kind === 'problem') return { ...parsed, showExample: true };
  const catalog = { points: parsed.points, fileName, settings, weightStats: parsed.weightStats };
  const warning = weightUnitWarning(parsed.weightStats, settings.weight);
  return warning ? { kind: 'warning', message: warning, catalog } : { kind: 'ready', catalog };
}
