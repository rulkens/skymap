/**
 * SurfaceTileVerdict — what the stream does with its atlases this frame.
 * `engage` allocates them for that body, standing down any other body's
 * first; `release` frees them, only on a body switch or past
 * `TILE_RELEASE_RADII`, never because the body left the view.
 */

import type { SurfaceTileBodyId } from '../../data/SurfaceTileBodyId';
import type { SceneBodyId } from '../../scene/SceneBodyId';

export type SurfaceTileVerdict =
  | 'keep'
  | { readonly engage: SceneBodyId & SurfaceTileBodyId; readonly tilePx: number }
  | 'release';
