/**
 * starCatalogFetcher — `Fetcher<Octree, StarCatalogReq>` for every streamed `starCatalog`
 * row, named from the row's own `binBaseName`. The row's `format` picks the file and what `tier`
 * means: `skst` is one `-<tier>.bin` per tier through the async compression codec; `octree` is
 * one tier-less index object (the tier sizes the chunk pool instead). Both adapt to the
 * `Octree` the renderer draws. A seeded catalog (`binBaseName` null) is built in code and
 * has nothing to fetch, so the guard below excludes it.
 */
import type { Fetcher } from '../../../../@types/loading/Fetcher';
import type { StarCatalogReq } from '../@types/StarCatalogReq';
import type { Octree } from '../../../../@types/octree/Octree';
import { STAR_CATALOG_SOURCE_RECORD } from '../../sources/starCatalogSourceRecord';
import {
  decodeSkstCatalog,
  STAR_CATALOG_DATA_PREFIX,
} from '../../../../data/starCatalog/starCatalogFormat';
import { octreeIndexPath } from '../../../../utils/octree/octreeIndexPath';
import { decodeOctreeIndex } from '../../../../data/octree/decodeOctreeIndex';
import { starOctreeFromSkst } from '../utils/starOctreeFromSkst';
import { octreeFromIndex } from '../../../../utils/octree/octreeFromIndex';
import { starColumnsOf } from '../utils/starColumnsOf';
import { dataUrl, fetchWithProgress } from '../../../../services/loading/fetchWithProgress';
import type { StarColumns } from '../@types/StarColumns';

export const starCatalogFetcher: Fetcher<Octree<StarColumns>, StarCatalogReq> = async (
  req,
  signal,
  onProgress,
) => {
  const entry = STAR_CATALOG_SOURCE_RECORD[req.source];
  if (entry.binBaseName === null) {
    throw new Error(`starCatalogFetcher: source ${req.source} is not a streamed star catalog`);
  }
  if (entry.format === 'octree') {
    const buf = await fetchWithProgress(
      dataUrl(octreeIndexPath('star', entry.binBaseName)),
      signal,
      onProgress,
    );
    return octreeFromIndex(decodeOctreeIndex(buf), starColumnsOf);
  }
  const name = `${entry.binBaseName}-${req.tier}.bin`;
  const buf = await fetchWithProgress(
    dataUrl(`${STAR_CATALOG_DATA_PREFIX}/${name}`),
    signal,
    onProgress,
  );
  return starOctreeFromSkst(await decodeSkstCatalog(buf));
};
