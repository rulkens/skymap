import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { LivePointer } from '../../src/@types/live/LivePointer';
import { LIVE_DATASETS } from '../../src/data/live/liveDatasets';
import { livePointerPath } from '../../src/utils/live/livePointerPath';
import type { PublishEntry } from '../@types/live/PublishEntry';

/**
 * The uploads for one built dataset, dated files first and the pointer last: a visitor who reads
 * the new pointer must find its files already there. Throws if a named file was not built or a registered one is not named.
 */
export function writePublishList(id: string, root: string): PublishEntry[] {
  const dataset = LIVE_DATASETS.find((d) => d.id === id);
  if (!dataset) throw new Error(`writePublishList: unknown live dataset "${id}"`);
  const pointerPath = livePointerPath(id);
  const pointer = JSON.parse(readFileSync(join(root, pointerPath), 'utf8')) as LivePointer;
  for (const { name } of dataset.files) {
    if (!(name in pointer.files))
      throw new Error(`writePublishList: ${id} pointer lacks "${name}"`);
  }
  const dated = Object.entries(pointer.files).map(([name, path]): PublishEntry => {
    const file = dataset.files.find((f) => f.name === name);
    if (!file) throw new Error(`writePublishList: ${id} pointer names unregistered file "${name}"`);
    if (!existsSync(join(root, path))) throw new Error(`writePublishList: ${path} was not built`);
    return {
      path,
      key: `data/${path}`,
      contentType: file.contentType,
      cacheControl: 'public, max-age=31536000, immutable',
      gzip: file.gzip,
    };
  });
  const pointerEntry: PublishEntry = {
    path: pointerPath,
    key: `data/${pointerPath}`,
    contentType: 'application/json',
    cacheControl: 'no-cache',
    gzip: false,
  };
  return [...dated, pointerEntry];
}
