import type { StructureId } from '../../src/@types/data/structure/StructureId';

/**
 * Cutout field of view as a multiple of the structure's angular diameter.
 * Globular seed radii are about the half-light radius, so they need 10x. A
 * cluster's or group's seed radius spans the whole system but the cutout
 * shows its core: ~0.4 deg for Coma, ~1 deg for a compact group. The cosmic
 * rows other than those two are rendered in-app and never read.
 */
export const STRUCTURE_CUTOUT_MARGIN: Readonly<Record<StructureId, number>> = {
  'galaxy-cluster': 0.12,
  supercluster: 1.3,
  void: 1.3,
  'galaxy-group': 0.55,
  'open-cluster': 1.3,
  'globular-cluster': 10,
  nebula: 1.3,
  'gc-cluster': 1.3,
};
