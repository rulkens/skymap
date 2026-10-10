import type { DataFamily } from '../@types/DataFamily';
import type { R2Upload } from '../@types/R2Upload';
import { dataFamilyOf } from './dataFamilyOf';

/**
 * Partition the `data/` uploads by family so each family's upload policy
 * travels with its own group. A file no row claims throws before any byte
 * moves: silently skipping it would publish a manifest naming a missing key.
 */
export function groupByDataFamily(
  files: readonly R2Upload[],
): ReadonlyMap<DataFamily, readonly R2Upload[]> {
  const byFamily = new Map<DataFamily, R2Upload[]>();
  for (const file of files) {
    const family = dataFamilyOf(file.r2Key.replace(/^data\//, ''));
    if (family === null) {
      throw new Error(`${file.r2Key}: no DATA_FAMILIES row claims it.`);
    }
    const group = byFamily.get(family);
    if (group === undefined) byFamily.set(family, [file]);
    else group.push(file);
  }
  return byFamily;
}
