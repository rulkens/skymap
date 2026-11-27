import { logicalDataName } from '../../utils/data/logicalDataName';
import type { VolumePyramidFormat } from '../../../src/@types/data/volume/VolumePyramidFormat';

/** A field+format's level-0 part packs among a folder's names, hashed or not. A re-bake with fewer
 *  parts leaves the old tail behind, and `buildDataManifest` would keep listing it as its own file. */
export function brickPartFiles(
  names: readonly string[],
  id: string,
  format: VolumePyramidFormat,
): string[] {
  const part = new RegExp(`^${id}\\.${format}\\.L0\\.p\\d+\\.pack$`);
  return names.filter((name) => part.test(logicalDataName(name)));
}
