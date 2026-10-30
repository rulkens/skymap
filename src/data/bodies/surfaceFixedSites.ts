/**
 * SURFACE_FIXED_SITES — the authored surface sites: a body, its host, and where
 * on that host it sits. Every row is a Layer's body row (the rovers sit at
 * their current or final position, where the HiRISE site bands can show them:
 * the Mars terrain bake clips each band to a window around these rows).
 * `altitudeM` is the wheel lift above the terrain, not a height above the datum.
 */

import type { SurfaceFixedSite } from '../../@types/scene/SurfaceFixedSite';
import { LAYER_BODY_ROWS } from '../../compositions/appBodies';

export const SURFACE_FIXED_SITES: readonly SurfaceFixedSite[] = LAYER_BODY_ROWS.flatMap((row) =>
  row.position.kind === 'site' ? [row.position.site] : [],
);
