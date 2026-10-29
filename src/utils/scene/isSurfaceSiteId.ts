/**
 * isSurfaceSiteId — is `id` one of `SURFACE_FIXED_SITES`' own ids. The
 * `decodeFramedPose` counterpart to `isRegistryBodyId`, for a `#pose=` site arm.
 */
import { SURFACE_FIXED_SITES } from '../../data/bodies/surfaceFixedSites';
import type { SurfaceSiteId } from '../../@types/scene/SurfaceSiteId';

export function isSurfaceSiteId(id: string): id is SurfaceSiteId {
  return SURFACE_FIXED_SITES.some((s) => s.id === id);
}
