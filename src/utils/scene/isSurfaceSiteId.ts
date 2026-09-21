/**
 * isSurfaceSiteId — is `id` one of `SURFACE_FIXED_SITES`' own ids. The
 * `decodeFramedPose` counterpart to `isSceneBodyId`, for a `#pose=` site arm.
 */
import { SURFACE_FIXED_SITES } from '../../data/bodies/surfaceFixedSites';

export function isSurfaceSiteId(id: string): boolean {
  return SURFACE_FIXED_SITES.some((s) => s.id === id);
}
