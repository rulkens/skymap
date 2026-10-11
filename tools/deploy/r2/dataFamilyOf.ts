import { basename, dirname } from 'node:path';
import type { DataFamily } from '../@types/DataFamily';
import { logicalDataName } from '../../utils/data/logicalDataName';
import { DATA_FAMILIES } from './dataFamilies';

/**
 * The family a `public/data/`-relative path belongs to, or null when untracked.
 * Matches by basename at any depth, since each family sits under its own
 * `<family>/v<N>/` epoch folder — except the path-stable `images/` subtree,
 * which is collected separately.
 */
export function dataFamilyOf(dataRelPath: string): DataFamily | null {
  const posixPath = dataRelPath.replace(/\\/g, '/');
  if (posixPath === 'images' || posixPath.startsWith('images/')) return null;

  const name = logicalDataName(basename(posixPath));
  const dir = dirname(posixPath);
  return (
    DATA_FAMILIES.find(
      (row) =>
        (row.dir === null || dir === row.dir || dir.endsWith(`/${row.dir}`)) &&
        row.fileName.test(name),
    ) ?? null
  );
}
