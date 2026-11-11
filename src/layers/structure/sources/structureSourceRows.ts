/**
 * The Layer's `sources` field (`Layer.d.ts`'s `Sources` bound): one registry
 * row per structure category, collected by `compositions/appSources.ts` into `APP_SOURCE_REGISTRY`.
 */

import type { SourceEntry } from '../../../@types/data/SourceEntry';

import { GALAXY_CLUSTER_ENTRY } from './galaxyCluster';
import { SUPERCLUSTER_ENTRY } from './supercluster';
import { VOID_ENTRY } from './void';
import { GALAXY_GROUP_ENTRY } from './galaxyGroup';
import { OPEN_CLUSTER_ENTRY } from './openCluster';
import { GLOBULAR_CLUSTER_ENTRY } from './globularCluster';
import { NEBULA_ENTRY } from './nebula';
import { GC_CLUSTER_ENTRY } from './gcCluster';

export const STRUCTURE_SOURCE_ROWS = [
  GALAXY_CLUSTER_ENTRY,
  SUPERCLUSTER_ENTRY,
  VOID_ENTRY,
  GALAXY_GROUP_ENTRY,
  OPEN_CLUSTER_ENTRY,
  GLOBULAR_CLUSTER_ENTRY,
  NEBULA_ENTRY,
  GC_CLUSTER_ENTRY,
] as const satisfies readonly SourceEntry[];
