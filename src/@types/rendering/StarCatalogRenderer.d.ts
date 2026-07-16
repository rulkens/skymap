/**
 * StarCatalogRenderer — handle for the survey (Gaia bin) stars drawn as
 * additive point sprites into the depthless HDR accumulation.
 *
 * This is the wide-field twin of `StarPointRenderer`: where that renderer
 * draws a handful of hand-seeded neighbourhood stars from a flat instance
 * buffer, this one draws millions of catalogued stars streamed from disk as
 * an in-file octree of cell-quantized 6-byte records. The octree lets the
 * renderer draw a flux mip — near cells refined to their real leaf stars,
 * far/sub-pixel subtrees collapsed to one aggregate record — so the drawn
 * instance count stays inside a per-frame budget regardless of catalog size.
 *
 * ### The upload / draw split (mirrors `catalogStore`)
 *
 * A catalog's record blob is a static, per-source GPU resource: uploaded
 * once, keyed by source code, kept for the session. The per-frame cut over
 * the octree is a different concern — it changes every frame as the camera
 * moves, and it is computed CPU-side by `walkStarOctreeCut` (in the layer,
 * not here). So `upload` commits the records buffer once, `loadedCatalogs`
 * exposes every committed catalog so the layer can walk each octree per
 * frame, and `draw` renders one source's freshly-walked cut. This is the
 * same storage-vs-frame seam `catalogStore` draws for the galaxy points.
 *
 * ### Precision — camera-relative node origins, then f32 narrowing
 *
 * Each drawn node's box origin arrives already rebased into the
 * camera-relative frame in float64 (`starNodeOriginRelCamMpc`), paired with
 * a rebased view-projection, exactly as `StarPointRenderer` receives its
 * anchors. The renderer narrows those small camera-relative values into the
 * per-node uniform with no catastrophic cancellation; the vertex stage
 * reconstructs each record's position from the node origin + the record's
 * in-cell offset. This renderer stays a dumb pipeline: the f64 seam lives in
 * the layer.
 */

import type { Renderer } from './Renderer';
import type { Vec2 } from '../math/Vec2';
import type { Vec3 } from '../math/Vec3';
import type { SourceType } from '../data/SourceType';
import type { StarCatalog } from '../data/starCatalog/StarCatalog';
import type { StarNodeDraw } from '../../services/gpu/renderers/starCatalog/walkStarOctreeCut';

/**
 * One source's per-frame octree cut, as the layer assembles it. The three
 * per-node arrays are parallel — index `i` of `originRelCamMpc` /
 * `cellScaleMpc` is the node origin + box scale for `nodeDraws[i]`, both
 * from `starNodeOriginRelCamMpc`.
 */
export type StarCatalogDrawArgs = {
  /** Which loaded catalog's records buffer to bind. */
  readonly source: SourceType;
  /** Rebased camera-relative view-projection (`narrowMat4(rebaseViewProj(...))`). */
  readonly vp: Float32Array;
  /** Viewport size in physical pixels — feeds the pixel-size-to-clip conversion. */
  readonly viewportPx: Vec2;
  /** The chosen octree nodes to draw this frame (from `walkStarOctreeCut`). */
  readonly nodeDraws: readonly StarNodeDraw[];
  /** Per-node box origin, camera-relative Mpc (parallel to `nodeDraws`). */
  readonly originRelCamMpc: readonly Vec3[];
  /** Per-node box edge in Mpc, the in-cell offset unit (parallel to `nodeDraws`). */
  readonly cellScaleMpc: readonly number[];
  /** Source crossfade alpha (Task 11's band to the procedural Milky-Way cloud). */
  readonly opacity: number;
  /**
   * User's base star-dot size in px (`settings.starCatalogs.sizePx`, default
   * 2.5) — the twin of the galaxy points' `pointSizePx`. Source-independent
   * (identical for every source this frame), so the renderer writes it into
   * the shared camera uniform, where the per-record legibility ramp scales it.
   */
  readonly sizePx: number;
};

export type StarCatalogRenderer = Renderer & {
  /**
   * Commit one catalog's records to a per-source GPU storage buffer (once),
   * keyed by source code, and keep its octree CPU-side for the layer to walk.
   * Replaces any previous upload for the same source.
   */
  upload(source: SourceType, catalog: StarCatalog): void;
  /**
   * Every committed catalog, so the layer can walk each octree per frame —
   * the star-renderer analogue of `catalogStore.entries()`.
   */
  loadedCatalogs(): Iterable<{ source: SourceType; catalog: StarCatalog }>;
  /**
   * Draw one source's per-frame cut: a per-node instanced billboard draw over
   * the walked `nodeDraws`. No-op if the source has no committed catalog or
   * the cut is empty. The layer gates visibility/opacity before calling — an
   * additive pass drawing nothing is correctly invisible.
   */
  draw(pass: GPURenderPassEncoder, args: StarCatalogDrawArgs): void;
};
