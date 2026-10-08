import type { StructureScale } from '../../@types/data/structure/StructureScale';

/**
 * The projection slab whose marker pass draws each scale: Mpc-scale cosmic
 * structures project through COSMO, parsec-scale Milky Way ones need NEAR0's
 * adaptive planes. The only place a scale becomes a slab.
 */
export const SLAB_BY_STRUCTURE_SCALE: Readonly<Record<StructureScale, 'cosmo' | 'near0'>> = {
  cosmic: 'cosmo',
  milkyWay: 'near0',
};
