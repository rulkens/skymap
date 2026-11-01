import type { SceneBodyId } from '../scene/SceneBodyId';
import type { SurfaceSiteId } from '../scene/SurfaceSiteId';

/** Per-`RungKind` `frame` tag shape; `PoseFrame` indexes this and must spell what it spelled before. */
export type FrameOf = {
  readonly absolute: 'absolute';
  readonly body: { readonly body: SceneBodyId };
  readonly site: { readonly site: SurfaceSiteId };
};
