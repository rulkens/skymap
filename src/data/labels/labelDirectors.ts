import type { LabelDirectorRow } from '../../@types/rendering/LabelDirectorRow';
import { COSMO, NEAR0 } from '../../services/engine/frame/slabs';

/**
 * The two label directors, one per slab. COSMO hides labels nearer than 10 kpc, where its old
 * clip-space path met its fixed near plane.
 */
export const LABEL_DIRECTORS: readonly LabelDirectorRow[] = [
  {
    slab: COSMO,
    nearHideMpc: 0.01,
  },
  {
    slab: NEAR0,
  },
];
