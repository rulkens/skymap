import { resolveInside } from '../../files/utils/resolveInside';

/** The mirror sits under the data root with the bucket's leading `data/` stripped; a key may not leave it. */
export function keyToLocalPath(dataRoot: string, key: string): string {
  const path = resolveInside(dataRoot, key.replace(/^data\//, ''));
  if (path === null) throw new Error(`${key}: outside the data mirror`);
  return path;
}
