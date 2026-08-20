import type { Renderer } from './Renderer';
import type { SurfaceCutTile } from '../scene/SurfaceCutTile';
import type { Vec3 } from '../math/Vec3';
import type { Mat3 } from '../math/Mat3';

/**
 * `EarthSurfaceTileRenderer.draw`'s per-frame arguments. `tiles` is Task 2's
 * already-culled, already-residency-resolved cut (`cutSurfaceTiles`'s `cut`
 * product) -- this renderer does no further culling or ancestor fallback.
 *
 * `camPosMpc` / `bodyPositionMpc` / `orientation` / `radiusMpc` are the raw
 * f64 ingredients the renderer composes ITS OWN camera-relative tile origins
 * from (in f64, narrowed once per tile) -- unlike `vp`, which the CALLER
 * pre-rebases (`rebaseViewProj` + `narrowMat4`) before calling, mirroring
 * `StarCatalogDrawArgs.vp`. The renderer owns neither the tile atlas nor the
 * base globe's material/night/normal/cloud maps -- both are supplied as
 * views here every draw (see the renderer's module header).
 */
export type EarthSurfaceTileDrawArgs = {
  readonly tiles: readonly SurfaceCutTile[];
  /** Engine frame counter, forwarded to `meshCache.get` for its LRU stamp. */
  readonly frame: number;
  readonly camPosMpc: Readonly<Vec3>;
  readonly bodyPositionMpc: Readonly<Vec3>;
  /** Earth's local-to-world orientation (the same `T·R·S` `R` `composeBodyMvp` embeds). */
  readonly orientation: Readonly<Mat3>;
  readonly radiusMpc: number;
  /** Rebased camera-relative view-projection (`narrowMat4(rebaseViewProj(...))`). */
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
  /** The earthTileSubsystem atlas view -- resident high-res patches, sampled at each tile's resolved rect. Not owned by this renderer. */
  readonly surfaceAtlasView: GPUTextureView;
  /** The SAME whole-globe maps `earthRenderer` binds -- not owned by this renderer. */
  readonly materialView: GPUTextureView;
  readonly nightView: GPUTextureView;
  readonly normalView: GPUTextureView;
  readonly cloudsView: GPUTextureView;
};

export type EarthSurfaceTileRenderer = Renderer & {
  /**
   * Rebuild both per-frame storage buffers from `args.tiles` (via the
   * construction-time `meshCache`) and issue one draw. No-op if `tiles` is
   * empty.
   */
  draw(pass: GPURenderPassEncoder, args: EarthSurfaceTileDrawArgs): void;
};
