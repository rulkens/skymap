import type { StructureId } from '../../src/@types/data/structure/StructureId';

/**
 * Cutout field of view as a multiple of the structure's angular diameter.
 * A globular cluster's seed radius is about its half-light radius, so the
 * visible cluster is far wider than 1.3x and the default blows out to a disc.
 */
export const STRUCTURE_CUTOUT_MARGIN: Readonly<Record<StructureId, number>> = {
  'galaxy-cluster': 1.3,
  supercluster: 1.3,
  void: 1.3,
  'galaxy-group': 1.3,
  'open-cluster': 1.3,
  'globular-cluster': 10,
  nebula: 1.3,
  'gc-cluster': 1.3,
};
