/**
 * The Layer's `sources` field (`Layer.d.ts`'s `Sources` bound): one registry
 * row per structure category, folded into `SOURCE_REGISTRY`.
 */

import type { SourceType } from '../../../@types/data/SourceType';
import type { SourceEntry } from '../../../@types/data/SourceEntry';

import { Source } from '../../../data/source';
import { GALAXY_CLUSTER_ENTRY } from './galaxyCluster';
import { SUPERCLUSTER_ENTRY } from './supercluster';
import { VOID_ENTRY } from './void';
import { GALAXY_GROUP_ENTRY } from './galaxyGroup';
import { OPEN_CLUSTER_ENTRY } from './openCluster';
import { GLOBULAR_CLUSTER_ENTRY } from './globularCluster';
import { NEBULA_ENTRY } from './nebula';
import { GC_CLUSTER_ENTRY } from './gcCluster';

export const STRUCTURE_SOURCE_ROWS = [
  [Source.GalaxyCluster, GALAXY_CLUSTER_ENTRY],
  [Source.Supercluster, SUPERCLUSTER_ENTRY],
  [Source.Void, VOID_ENTRY],
  [Source.GalaxyGroup, GALAXY_GROUP_ENTRY],
  [Source.OpenCluster, OPEN_CLUSTER_ENTRY],
  [Source.GlobularCluster, GLOBULAR_CLUSTER_ENTRY],
  [Source.Nebula, NEBULA_ENTRY],
  [Source.GcCluster, GC_CLUSTER_ENTRY],
] as const satisfies readonly (readonly [SourceType, SourceEntry])[];
