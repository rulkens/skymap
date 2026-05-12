import type { Source } from '../../data/sources';
import type { PointCloud } from '../data/PointCloud';
import type { PointInfo } from './PointInfo';

/**
 * Hook the engine provides to the resolver: given a (cloud, localIdx,
 * source) triple, build a PointInfo.  Production wires this to
 * `pointInfoBuilder.buildPointInfo` with the engine's live `famousMeta`
 * and `famousXrefs` sidecars in scope; tests pass a stub.
 */
export type BuildPointInfo = (
  cloud: PointCloud,
  localIdx: number,
  source: Source,
) => PointInfo | null;
