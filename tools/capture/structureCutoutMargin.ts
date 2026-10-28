import type { StructureId } from '../../src/@types/data/structure/StructureId';

/**
 * Cutout field of view as a multiple of the structure's angular diameter.
 * Globular seed radii are about the half-light radius, so they need 10x. A
 * cluster's or group's seed radius spans the whole system but the cutout
 * shows its core: ~0.4 deg for Coma, ~1 deg for a compact group. Superclusters
 * and voids are rendered in-app and have no row.
 */
export const STRUCTURE_CUTOUT_MARGIN: Readonly<Partial<Record<StructureId, number>>> = {
  'galaxy-cluster': 0.12,
  'galaxy-group': 0.55,
  'open-cluster': 1.3,
  'globular-cluster': 10,
  nebula: 1.3,
  'gc-cluster': 1.3,
  // The 20 kpc seed radius stands for the host galaxy: 0.17 deg for NGC 4993.
  transient: 3,
  // The seed radius is the orbit diagram's, milliarcseconds on the sky, so the
  // cutout clamps to its 0.1 deg floor: a star field with the host at its centre.
  'exoplanet-system': 1,
};
