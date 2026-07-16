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
 * One source's per-frame octree cut, as the layer assembles it. The per-node
 * arrays are parallel — index `i` of `originRelCamMpc` / `cellScaleMpc` /
 * `isAggregate` describes `nodeDraws[i]`: the first two are the node origin +
 * box scale from `starNodeOriginRelCamMpc`, and `isAggregate` is the
 * leaf-vs-aggregate flag (0 = leaf, 1 = aggregate), which the flux-glow vertex
 * stage needs to size a point-source leaf differently from a box-filling
 * aggregate.
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
  /**
   * Per-node flux-reconstruction multiplier (parallel to `nodeDraws`): the
   * number of real stars each of the node's records stands in for. A leaf's
   * records are individual stars, so it is `1`; an aggregate's single record
   * stands in for its whole subtree, so it is that subtree's star count. The
   * vertex stage multiplies the record's dequantized *mean*-star flux by this to
   * recover the subtree's summed light (aggregate records store the mean, never
   * the sum — the 7-bit magnitude LUT would clamp a summed encode; see
   * `mergeFluxAggregate`). `1` for a leaf makes the multiply a branchless
   * identity there.
   */
  readonly subtreeStarCount: readonly number[];
  /**
   * Per-node leaf-vs-aggregate flag (parallel to `nodeDraws`): 0 = leaf (a
   * point-source star), 1 = aggregate (a subtree collapsed to its flux mip).
   * The vertex stage fills an aggregate's box footprint with its glow but draws
   * a leaf as a floor-sized point — the leaf/aggregate discriminant the record
   * itself deliberately omits. The layer derives it from the owning node's
   * `childMask` (`0 ⇒ leaf`), NOT its `level`: a fat leaf lives at `level > 0`
   * yet is a leaf, so level would misclassify it as an aggregate.
   */
  readonly isAggregate: readonly number[];
  /**
   * Per-node draw opacity (parallel to `nodeDraws`): the product of the
   * source crossfade alpha (Task 11's recede band to the procedural Milky-Way
   * cloud, identical for every node this frame) and the node's own LOD fade
   * (0→1 as it enters the octree cut, 1→0 as it leaves). Per node rather than
   * one scalar because the temporal LOD fade is what dissolves the box-pop when
   * the best-first cut swaps a parent aggregate for its children: during the
   * transition BOTH draw, at complementary opacities. The vertex stage forwards
   * `node.opacity` and the fragment multiplies the Gaussian by it, so a node at
   * opacity 0 deposits no light (additive) — the layer keeps a fading-out node
   * in the draw list until it reaches 0. The renderer writes `opacity[i]` into
   * node `i`'s `NodeParams` block.
   */
  readonly opacity: readonly number[];
  /**
   * User's base star-dot size in px (`settings.starCatalogs.sizePx`, default
   * 2.5) — the twin of the galaxy points' `pointSizePx`. Source-independent
   * (identical for every source this frame), so the renderer writes it into
   * the shared camera uniform, where the per-record legibility ramp scales it.
   */
  readonly sizePx: number;
  /**
   * User's star-brightness trim (`settings.starCatalogs.brightness`, default
   * 1.0 = identity) — the twin of the galaxy points' `brightness`. A user
   * exposure trim ON TOP of the shader's calibrated `STAR_FLUX_EXPOSURE`
   * baseline: the vertex stage multiplies the flux-glow peak by it. Also
   * source-independent, so it rides the shared camera uniform beside `sizePx`.
   */
  readonly brightness: number;
  /**
   * User's aggregate glow-overlap spread (`settings.starCatalogs.glowOverlap`,
   * default 1.0 = identity). For AGGREGATE nodes only, the vertex stage
   * multiplies the glow radius by it so far glows overlap their neighbours and
   * the octree-box lattice dissolves; the Gaussian peak is divided by the
   * square, so total luminance is conserved. Leaves (point sources) are
   * untouched. Source-independent, so it rides the shared camera uniform beside
   * `sizePx` / `brightness`.
   */
  readonly glowOverlap: number;
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
