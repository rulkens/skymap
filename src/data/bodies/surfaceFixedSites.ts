/**
 * SURFACE_FIXED_SITES — the authored surface sites: a body, its host, and where
 * on that host it sits. Every row is a Layer's body row (the rovers sit at
 * their current or final position, where the HiRISE site bands can show them:
 * the Mars terrain bake clips each band to a window around these rows).
 * `altitudeM` is the wheel lift above the terrain, not a height above the datum.
 */

import type { SurfaceFixedSite } from '../../@types/scene/SurfaceFixedSite';
import { APP_BODY_REGISTRY } from '../../compositions/appBodies';

export const SURFACE_FIXED_SITES: readonly SurfaceFixedSite[] = APP_BODY_REGISTRY.flatMap((row) =>
  row.position.kind === 'site' ? [row.position.site] : [],
);
