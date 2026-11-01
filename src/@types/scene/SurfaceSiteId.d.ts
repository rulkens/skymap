/**
 * SurfaceSiteId — the id of a `SURFACE_FIXED_SITES` row. A site is a mesh body
 * whose id is also its position driver's id, so it is a `SceneBodyId` too.
 */

import type { SceneBodyId } from './SceneBodyId';
import type { Tagged } from '../utils/Tagged';

export type SurfaceSiteId = SceneBodyId & Tagged<string, 'surfaceSiteId'>;
