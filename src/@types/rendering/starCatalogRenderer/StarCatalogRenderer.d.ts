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

import type { Renderer } from '../Renderer';
import type { SourceType } from '../../data/SourceType';
import type { StarCatalog } from '../../data/starCatalog/StarCatalog';
import type { StarCatalogPickResources } from './StarCatalogPickResources';
import type { StarCatalogDrawArgs } from './StarCatalogDrawArgs';

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
   * Draw one source's per-frame cut: one instanced billboard draw over the
   * `drawCount` walked nodes in the flat per-node arrays. No-op if the source has
   * no committed catalog or the cut is empty. The layer gates visibility/opacity
   * before calling — an additive pass drawing nothing is correctly invisible.
   */
  draw(pass: GPURenderPassEncoder, args: StarCatalogDrawArgs): void;
  /**
   * Expose the resources the sibling `starCatalogPickRenderer` shares to stay
   * bind-group compatible: the three explicit BGLs plus a per-source records
   * bind group lookup. See {@link StarCatalogPickResources}. A pure accessor
   * over already-constructed resources — no per-frame cost.
   */
  pickResources(): StarCatalogPickResources;
};
