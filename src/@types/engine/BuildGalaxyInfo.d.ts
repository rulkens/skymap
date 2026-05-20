import type { SourceType } from '../data/Source';
import type { GalaxyCatalog } from '../data/GalaxyCatalog';
import type { GalaxyInfo } from './GalaxyInfo';

/**
 * Hook the engine provides to the resolver: given a (cloud, localIdx,
 * source) triple, build a GalaxyInfo.  Production wires this to
 * `galaxyInfoBuilder.buildGalaxyInfo` with the engine's live `famousMeta`
 * and `famousXrefs` sidecars in scope; tests pass a stub.
 */
export type BuildGalaxyInfo = (
  cloud: GalaxyCatalog,
  localIdx: number,
  source: SourceType,
) => GalaxyInfo | null;
