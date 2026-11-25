import type { CatalogFiles } from '../../../../@types/CatalogFiles';
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

/** Reads and parses the chosen files in the page; nothing is dispatched here. */
export async function parseCatalogFiles(
  files: CatalogFiles,
  settings: CatalogImportSettings,
): Promise<CatalogLoadOutcome> {
  if (files.kind === 'packed') {
    const [bin, metadataText] = await Promise.all([files.bin.arrayBuffer(), files.metadata.text()]);
    try {
      const { points } = loadPackedCatalog(bin, metadataText);
      const weightStats = weightStatsFor(points.weight);
      return {
        kind: 'ready',
        catalog: { points, fileName: files.bin.name, settings: PACKED_SETTINGS, weightStats },
      };
    } catch (err) {
      return { kind: 'problem', message: (err as Error).message, showExample: false };
    }
  }

  const parsed = parseCsvCatalog(await files.file.text(), settings);
  if (!parsed.ok) return { kind: 'problem', message: parsed.problem.message, showExample: true };
  const catalog = {
    points: parsed.points,
    fileName: files.file.name,
    settings,
    weightStats: parsed.weightStats,
  };
  const warning = weightUnitWarning(parsed.weightStats, settings.weight);
  return warning ? { kind: 'warning', message: warning, catalog } : { kind: 'ready', catalog };
}
