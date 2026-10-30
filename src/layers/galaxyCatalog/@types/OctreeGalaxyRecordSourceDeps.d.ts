import type { GalaxyColumns } from '../../../@types/data/galaxyCatalog/GalaxyColumns';
import type { FetchDataBytes } from '../../../@types/loading/FetchDataBytes';
import type { OctreeResidency } from '../../../@types/octree/OctreeResidency';
import type { GalaxyPooledPointRenderer } from './GalaxyPooledPointRenderer';

/** What the octree record source reads beyond its payload: the pool's pick mapping, residency, bytes. */
export type OctreeGalaxyRecordSourceDeps = {
  readonly renderer: Pick<GalaxyPooledPointRenderer, 'recordOrdinal' | 'poolRecordIndex'>;
  readonly residency: Pick<OctreeResidency<GalaxyColumns>, 'chunk'>;
  readonly fetchBytes: FetchDataBytes;
};
