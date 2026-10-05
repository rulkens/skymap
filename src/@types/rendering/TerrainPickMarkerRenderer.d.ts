import type { Renderer } from './Renderer';
import type { Vec3 } from '../math/Vec3';

/**
 * TerrainPickMarkerRenderer — one analytic sphere at the terrain pick point,
 * depth-tested against the surface tiles drawn in the same render pass, over a
 * dim depth-blind underlay of itself so the buried part still reads. Every
 * vector is in EYE-RELATIVE body-fixed metres, the frame `vp` already expects
 * (see `devTools/terrainPickMarker/io.wesl`).
 */
export type TerrainPickMarkerRenderer = Renderer & {
  draw(
    pass: GPURenderPassEncoder,
    args: {
      /** The body-m slab's own `view.vp` — eye-relative, f32, reversed-Z. */
      readonly vp: Float32Array;
      /** Pick point minus eye, body-fixed axes, metres. */
      readonly centreRelEyeM: Readonly<Vec3>;
      /** The gauge's world radius, metres — a user-set physical size. */
      readonly radiusM: number;
      /** Camera right/up in the body's fixed axes — the billboard's plane. */
      readonly camRight: Readonly<Vec3>;
      readonly camUp: Readonly<Vec3>;
    },
  ): void;
};
