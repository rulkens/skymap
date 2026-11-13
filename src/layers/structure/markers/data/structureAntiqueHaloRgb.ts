import type { StructureId } from '../../../../@types/data/structure/StructureId';
import type { Vec3 } from '../../../../@types/math/Vec3';

/**
 * The cosmic kinds' halo colour on the antique plate. The plate lays each outline's wash
 * as the colourist's pigment nearest this hue (`regionPigment`, pigments.wesl), so each
 * is the pigment's own rgb: void smalt, cluster carmine, supercluster verdigris.
 */
export const STRUCTURE_ANTIQUE_HALO_RGB: Partial<Record<StructureId, Vec3>> = {
  void: [0.553, 0.604, 0.682],
  'galaxy-cluster': [0.72, 0.28, 0.33],
  supercluster: [0.42, 0.62, 0.5],
};
