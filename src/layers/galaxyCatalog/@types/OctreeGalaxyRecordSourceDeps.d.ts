import type { GalaxyColumns } from '../../../@types/data/galaxyCatalog/GalaxyColumns';
import type { OctreeResidency } from '../../../@types/octree/OctreeResidency';
import type { GalaxyPooledPointRenderer } from './GalaxyPooledPointRenderer';

/** What the octree record source reads beyond its payload: the pool's pick mapping, residency, bytes. */
export type OctreeGalaxyRecordSourceDeps = {
  readonly renderer: Pick<GalaxyPooledPointRenderer, 'recordOrdinal' | 'poolRecordIndex'>;
  readonly residency: OctreeResidency<GalaxyColumns>;
  /** A logical data path's bytes, null on a miss (`fetchDataBytes`, or a test's bake on disk). */
  readonly fetchBytes: (path: string) => Promise<ArrayBuffer | null>;
};
