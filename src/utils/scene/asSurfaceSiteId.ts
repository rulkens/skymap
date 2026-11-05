/**
 * asSurfaceSiteId — stamps an authored site id, the `asSceneBodyId` of a
 * Layer's `site` row. A raw string from a URL goes through `isSurfaceSiteId`.
 */

import type { SurfaceSiteId } from '../../@types/scene/SurfaceSiteId';

export function asSurfaceSiteId(id: string): SurfaceSiteId {
  return id as SurfaceSiteId;
}
