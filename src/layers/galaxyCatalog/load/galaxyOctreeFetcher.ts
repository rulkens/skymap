/**
 * galaxyOctreeFetcher — `Fetcher<GalaxyOctreePayload, GalaxyOctreeReq>` for a galaxy row that
 * ships an octree, named from the row's own `binBaseName`: the tier-less index and its info
 * object, fetched together through the data manifest. A missing file throws, so the slot
 * reports the error the way a flat point slot does.
 */
import type { Fetcher } from '../../../@types/loading/Fetcher';
import type { GalaxyOctreeReq } from '../../../@types/loading/GalaxyOctreeReq';
import type { GalaxyOctreePayload } from '../@types/GalaxyOctreePayload';
import { APP_SOURCE_REGISTRY } from '../../../compositions/appSources';
import { decodeOctreeIndex } from '../../../data/octree/decodeOctreeIndex';
import { decodeOctreeInfo } from '../../../data/octree/decodeOctreeInfo';
import { GALAXY_INFO_REQUIRED_COLUMNS } from '../../../data/octree/galaxyOctreeFamily';
import { octreeIndexPath } from '../../../utils/octree/octreeIndexPath';
import { octreeIndexInfoPath } from '../../../utils/octree/octreeIndexInfoPath';
import { octreeFromIndex } from '../../../utils/octree/octreeFromIndex';
import { galaxyColumnsOf } from '../../../utils/galaxy/galaxyColumnsOf';
import { dataUrl, fetchWithProgress } from '../../../services/loading/fetchWithProgress';

export const galaxyOctreeFetcher: Fetcher<GalaxyOctreePayload, GalaxyOctreeReq> = async (
  req,
  signal,
  onProgress,
) => {
  const { binBaseName } = APP_SOURCE_REGISTRY[req.source];
  // The index carries the bar; the info object is a fraction of its size.
  const [indexBuf, infoBuf] = await Promise.all([
    fetchWithProgress(dataUrl(octreeIndexPath('galaxy', binBaseName)), signal, onProgress),
    fetchWithProgress(dataUrl(octreeIndexInfoPath('galaxy', binBaseName)), signal, () => {}),
  ]);
  const index = decodeOctreeIndex(indexBuf);
  if (index.header.family !== 'galaxy') {
    throw new Error(`galaxyOctreeFetcher: ${binBaseName} is a ${index.header.family} octree`);
  }
  return {
    octree: octreeFromIndex(index, galaxyColumnsOf),
    header: index.header,
    info: decodeOctreeInfo(infoBuf, GALAXY_INFO_REQUIRED_COLUMNS).columns,
  };
};
