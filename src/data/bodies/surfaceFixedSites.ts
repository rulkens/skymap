/**
 * SURFACE_FIXED_SITES — the authored landing sites: a body, its host, and where
 * on that host it sits. Empty until the rovers land; the table exists so the
 * driver union and `deriveBodyStates`' phase 1c have one place to read.
 */

import type { SurfaceFixedSite } from '../../@types/scene/SurfaceFixedSite';

export const SURFACE_FIXED_SITES: readonly SurfaceFixedSite[] = [];
