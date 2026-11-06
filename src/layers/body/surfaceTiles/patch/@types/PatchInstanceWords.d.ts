import type { Vec2 } from '../../../../../@types/math/Vec2';
import type { Vec3 } from '../../../../../@types/math/Vec3';
import type { Vec4 } from '../../../../../@types/math/Vec4';
import type { SurfacePatchAnchor } from './SurfacePatchAnchor';

/**
 * PatchInstanceWords — one `PatchInstance` record's values, by field, as
 * `writePatchInstance` packs them; `io.wesl`'s struct holds the byte table.
 */
export type PatchInstanceWords = {
  /** From `patchOriginRelEyeM`: the shader rebuilds the patch frame from the
   *  f32 anchor written beside it, so the origin must come from the same
   *  rounded anchor (spec §7.1) or every patch shifts by ~0.13 m. */
  readonly originRelEyeM: Readonly<Vec3>;
  readonly fadeWeight: number;
  readonly anchor: SurfacePatchAnchor;
  /** `(origin.x, origin.y, scale.x, scale.y)` in the albedo atlas. */
  readonly albedoRect: Readonly<Vec4>;
  readonly fallbackRect: Readonly<Vec4>;
  /** Post origin of the leaf's SUB-RECT: its height tile's slot origin plus
   *  `SurfaceCutTile.height.originPosts`. */
  readonly heightSlotOrigin: Readonly<Vec2>;
  /** Pre-packed one bit per edge — see `io.wesl`'s `edgeCoarser` comment. */
  readonly edgeCoarser: number;
  /** Cells across that sub-rect: `128 >> levelDelta`. */
  readonly heightCells: number;
};
