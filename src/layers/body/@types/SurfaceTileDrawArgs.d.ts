import type { SurfaceCutTile } from './SurfaceCutTile';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { SurfaceEffect } from '../../../@types/data/SurfaceEffect';
import type { SurfaceTileShading } from '../../../@types/data/SurfaceTileShading';
import type { SurfaceEffectInputs } from './SurfaceEffectInputs';

/**
 * `SurfaceTileRenderer.draw`'s per-frame arguments. `tiles` is the already-culled,
 * residency-resolved `cutSurfaceTiles` cut; no further culling or ancestor
 * fallback happens here. `eyeRelBodyM` / `radiusM` are the f64 ingredients the
 * renderer composes its camera-relative tile origins from, already in the body's
 * fixed axes (`bodyRelativePose`), so no rotation is needed; `vp` is already built
 * about the eye. The tile atlas and effect maps are supplied every draw, not owned.
 */
export type SurfaceTileDrawArgs = {
  readonly tiles: readonly SurfaceCutTile[];
  /** Eye − body centre, in the body's fixed axes, metres, f64 —
   *  `PreparedBodySurfaceFrame.pose.eyeRelBodyM`. */
  readonly eyeRelBodyM: Readonly<Vec3>;
  readonly radiusM: number;
  /** The body slab's own eye-relative view-projection (`view.vp`). */
  readonly vp: Float32Array;
  /** Sun direction in the engaged body's local (unrotated) frame, matching `EarthSurfaceUniforms.sunDirLocal`'s convention. */
  readonly sunDirLocal: Readonly<Vec3>;
  /** The engaged body's registry row: `effects` picks the fragment variant,
   *  `effectInputs` must carry exactly those effects' resources. */
  readonly effects: readonly SurfaceEffect[];
  readonly effectInputs: SurfaceEffectInputs;
  readonly shading: SurfaceTileShading;
  readonly ambientLight: number;
  /** `debug.overlays['surface-lod-overlay']`: tints each fragment by how many pyramid levels its atlas rect fell back from the leaf (the fragment derives the delta from `atlasUvScale`, see surfaceLighting.wesl). */
  readonly debugLodOverlay: boolean;
  /** `terrain-no-displacement` debug toggle: patches flatten onto the datum,
   *  bisecting a terrain artifact without a rebuild (height vs mesh). */
  readonly noDisplacement: boolean;
  /** `terrain-no-skirts` debug toggle: the skirt ring collapses to zero depth. */
  readonly noSkirts: boolean;
  /** The surfaceTileStream's atlas view -- resident high-res patches, sampled at each tile's resolved rect. Not owned by this renderer. */
  readonly surfaceAtlasView: GPUTextureView;
  /** The surfaceTileStream's Terrain-RGB (`rgba8unorm`) HEIGHT atlas, read with
   *  `textureLoad` at each patch's own slot. Mandatory: every vertex position
   *  reads it, so a cut must never be drawn without it. Not owned here. */
  readonly heightAtlasView: GPUTextureView;
};
