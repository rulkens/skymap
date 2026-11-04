import { join } from 'node:path';

/** The mirror sits under the data root with the bucket's leading `data/` stripped. */
export function keyToLocalPath(dataRoot: string, key: string): string {
  return join(dataRoot, key.replace(/^data\//, ''));
}
