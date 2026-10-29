/**
 * atmosphereInsideBand — the Mpc band (from the body's centre) inside which a
 * body's atmosphere takes its full-screen inside path: the shell's `inside`
 * and the aerial line its slab row hosts both read it through `hostBandOpen`.
 * The edge sits a ratio OUTSIDE the atmosphere top on purpose: the proxy-mesh
 * outside path degrades within the 128×64 proxy's facet sag (~6e-4 · R), and
 * 1.005 clears that by ~8×; above it the two paths are pixel-identical, so the
 * handoff is invisible. `fullAt: 0` makes the band non-zero exactly below the edge.
 */

import type { FadeBand } from '../../../@types/math/FadeBand';
import { ATMOSPHERE_PARAMS } from './atmosphereParams';
import { SCALE_UNITS } from '../../../data/scaleUnits';

export const INSIDE_PATH_ENTER_RATIO = 1.005;

export function atmosphereInsideBand(bodyId: string): FadeBand | undefined {
  const params = ATMOSPHERE_PARAMS[bodyId];
  if (params === undefined) return undefined;
  return {
    fullAt: 0,
    goneAt: INSIDE_PATH_ENTER_RATIO * params.atmosphereTopKm * SCALE_UNITS.KM_TO_MPC,
  };
}
