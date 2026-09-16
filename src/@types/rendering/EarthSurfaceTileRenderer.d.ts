import type { Renderer } from './Renderer';
import type { SurfaceCutTile } from '../scene/SurfaceCutTile';
import type { Vec3 } from '../math/Vec3';

/**
 * `EarthSurfaceTileRenderer.draw`'s per-frame arguments. `tiles` is Task 2's
 * already-culled, already-residency-resolved cut (`cutSurfaceTiles`'s `cut`
 * product) -- this renderer does no further culling or ancestor fallback.
 *
 * `eyeRelBodyM` / `radiusM` are the raw f64 ingredients the renderer composes
 * ITS OWN camera-relative tile origins from (in f64, narrowed once per tile)
 * -- both already expressed in the body's fixed axes by the body-slab pose
 * seam (`bodyRelativePose`), so no separate orientation rotation is needed
 * (unlike the pre-body-slab NEAR0 path). `vp` needs no rebase either: a
 * body-m slab's vp is already built about the eye. The renderer owns neither
 * the tile atlas nor the base globe's material/night/normal/cloud maps --
 * both are supplied as views here every draw (see the renderer's module
 * header).
 */
export type EarthSurfaceTileDrawArgs = {
  readonly tiles: readonly SurfaceCutTile[];
  /** Eye − body centre, in the body's fixed axes, metres, f64 —
   *  `PreparedBodySurfaceFrame.pose.eyeRelBodyM`. */
  readonly eyeRelBodyM: Readonly<Vec3>;
  readonly radiusM: number;
  /** The body slab's own eye-relative view-projection (`view.vp`). */
  readonly vp: Float32Array;
  /** Sun direction in Earth's local (unrotated) frame, matching `EarthSurfaceUniforms.sunDirLocal`'s convention. */
  readonly sunDirLocal: Readonly<Vec3>;
  readonly roughnessBase: number;
  readonly f0: number;
  readonly sunIrradiance: number;
  readonly ambientLight: number;
  readonly oceanRoughness: number;
  readonly cloudShadowStrength: number;
  readonly cloudShellRadius: number;
  /** The `earth-lod-overlay` DebugPanel toggle (`debug.overlays['earth-lod-overlay']`) —
   *  tints each drawn fragment by how many pyramid levels its resolved atlas
   *  rect fell back from the leaf it's shading. Read live each frame, not
   *  cached: the fragment derives the level delta itself from
   *  `atlasUvScale` (see fragment.wesl), so this is the only new fact the
   *  overlay needs. */
  readonly debugLodOverlay: boolean;
  /** `terrain-no-displacement` debug toggle: patches flatten onto the datum,
   *  bisecting a terrain artifact without a rebuild (height vs mesh). */
  readonly noDisplacement: boolean;
  /** `terrain-no-skirts` debug toggle: the skirt ring collapses to zero depth. */
  readonly noSkirts: boolean;
  /** The surfaceTileSubsystem atlas view -- resident high-res patches, sampled at each tile's resolved rect. Not owned by this renderer. */
  readonly surfaceAtlasView: GPUTextureView;
  /** The surfaceTileSubsystem's Terrain-RGB (`rgba8unorm`) HEIGHT atlas, read with
   *  `textureLoad` at each patch's own slot. Mandatory: every vertex position
   *  reads it, so a cut must never be drawn without it. Not owned here. */
  readonly heightAtlasView: GPUTextureView;
  /** The SAME whole-globe maps `earthRenderer` binds -- not owned by this
   *  renderer. The whole-globe NORMAL map is deliberately not among them: a
   *  patch's normal comes from its height cell, and compositing both would
   *  shade the same relief twice (spec §7.2). */
  readonly materialView: GPUTextureView;
  readonly nightView: GPUTextureView;
  readonly cloudsView: GPUTextureView;
};

export type EarthSurfaceTileRenderer = Renderer & {
  /**
   * Rebuild the per-frame `PatchInstance` buffer from `args.tiles` and issue
   * one instanced indexed draw. No-op if `tiles` is empty.
   */
  draw(pass: GPURenderPassEncoder, args: EarthSurfaceTileDrawArgs): void;
};
