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
import type { SourceType } from '../data/SourceType';
import type { StarCatalog } from '../data/starCatalog/StarCatalog';

/**
 * Which of the two star draw streams a `draw` call records. The survey stars
 * split at the octree cut: `'leaf'` nodes (childless, real point-source stars)
 * draw full-resolution into the HDR target with the per-fragment hue-preserving
 * knee; `'aggregate'` nodes (interior flux-mip glows) draw LINEAR into the
 * half-res `star-aggregates` offscreen, whose upsample composite applies the
 * knee to the summed field. The renderer keeps a DEDICATED per-source buffer
 * pair per stream (never one shared pair) so the two draws — encoded into
 * different passes in the same frame — cannot clobber each other's data before
 * submit (the writeBuffer/submit ordering landmine).
 */
export type StarDrawStream = 'aggregate' | 'leaf';

export type StarCatalogDrawArgs = {
  /** Which loaded catalog's records buffer to bind. */
  readonly source: SourceType;
  /**
   * Which draw stream this call records — selects the fragment pipeline (leaf =
   * knee'd into HDR, aggregate = linear into the half-res offscreen) and the
   * per-source buffer pair the params are uploaded to.
   */
  readonly stream: StarDrawStream;
  /** Rebased camera-relative view-projection (`narrowMat4(rebaseViewProj(...))`). */
  readonly vp: Float32Array;
  /** Viewport size in physical pixels — feeds the pixel-size-to-clip conversion. */
  readonly viewportPx: Vec2;
  /**
   * How many drawn nodes this stream carries — the count of valid entries in
   * every flat per-node array below. Those arrays are the star cut's REUSED
   * grow-only buffers (see `StarNodeStream`), so their `.length` is the grow-only
   * capacity, NOT the live draw count: read only `[0, drawCount)`.
   */
  readonly drawCount: number;
  /**
   * Per-node record-slice base (`node.firstRecord`) — a flat `Uint32Array`, one
   * `u32` per drawn node, `drawCount` valid entries. The renderer needs only the
   * record base and count off each node, so the cut hands them as two parallel
   * typed arrays with no per-node object (the allocation the flat cut removes).
   */
  readonly firstRecord: Uint32Array;
  /**
   * Per-node instance count (leaf → N real stars in the cell; aggregate → 1) — a
   * flat `Uint32Array` parallel to `firstRecord`. The renderer sums these into
   * the exclusive prefix that routes each instance to its draw slot.
   */
  readonly recordCount: Uint32Array;
  /**
   * Per-node box origin, camera-relative Mpc — a flat `Float32Array` of THREE
   * f32 per node (node `i` at `[3*i]`, `[3*i+1]`, `[3*i+2]`), `3*drawCount` valid
   * entries. The f64 large-minus-large camera subtraction happened in the cut
   * before narrowing to these f32 (the precision seam), so the renderer stays a
   * dumb f32 pipeline.
   */
  readonly originRelCamMpc: Float32Array;
  /** Per-node box edge in Mpc, the in-cell offset unit — a flat `Float32Array`. */
  readonly cellScaleMpc: Float32Array;
  /**
   * Per-node flux-reconstruction multiplier — a flat `Float32Array`: the number
   * of real stars each of the node's records stands in for. A leaf's records are
   * individual stars, so it is `1`; an aggregate's single record stands in for
   * its whole subtree, so it is that subtree's star count. The vertex stage
   * multiplies the record's dequantized *mean*-star flux by this to recover the
   * subtree's summed light (aggregate records store the mean, never the sum — the
   * 7-bit magnitude LUT would clamp a summed encode; see `mergeFluxAggregate`).
   * `1` for a leaf makes the multiply a branchless identity there.
   */
  readonly subtreeStarCount: Float32Array;
  /**
   * Per-node leaf-vs-aggregate flag — a flat `Uint8Array`: 0 = leaf (a
   * point-source star), 1 = aggregate (a subtree collapsed to its flux mip).
   * The vertex stage fills an aggregate's box footprint with its glow but draws
   * a leaf as a floor-sized point — the leaf/aggregate discriminant the record
   * itself deliberately omits. The layer derives it from the owning node's
   * `childMask` (`0 ⇒ leaf`), NOT its `level`: a fat leaf lives at `level > 0`
   * yet is a leaf, so level would misclassify it as an aggregate.
   */
  readonly isAggregate: Uint8Array;
  /**
   * Per-node draw opacity — a flat `Float32Array`: the product of the source
   * crossfade alpha (Task 11's recede band to the procedural Milky-Way cloud,
   * identical for every node this frame) and the node's own LOD fade (0→1 as it
   * enters the octree cut, 1→0 as it leaves). Per node rather than one scalar
   * because the temporal LOD fade is what dissolves the box-pop when the
   * best-first cut swaps a parent aggregate for its children: during the
   * transition BOTH draw, at complementary opacities. The vertex stage forwards
   * `node.opacity` and the fragment multiplies the Gaussian by it, so a node at
   * opacity 0 deposits no light (additive) — the layer keeps a fading-out node
   * in the draw list until it reaches 0. The renderer writes `opacity[i]` into
   * node `i`'s `NodeParams` block.
   */
  readonly opacity: Float32Array;
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
  /**
   * User's aggregate surface-brightness cap (`settings.starCatalogs.
   * aggregateIntensityCap`, default 0.06 = the "Fog cap" slider). A ceiling the
   * vertex stage clamps an AGGREGATE record's peak intensity to (leaves stay
   * uncapped), taming the box-filling glow a near sub-threshold aggregate
   * deposits as fog around the Sun. Deliberately non-physical — light above the
   * ceiling is discarded, not conserved. Source-independent, so it rides the
   * shared camera uniform beside `sizePx` / `brightness` / `glowOverlap`.
   */
  readonly aggregateIntensityCap: number;
  /**
   * The six packed frustum planes for THIS frame's rebased view-projection
   * (`frustumPlanesFromViewProj` — 24 floats, six unit-normalized `(nx,ny,nz,d)`
   * quads), or `null` to disable culling. When non-null the pack loop drops any
   * node whose conservative bounding sphere is provably outside the frustum, so
   * off-screen subtrees cost no vertex work; `null` packs every walked node — the
   * backward-compatible path for callers (and tests) that have no view to build
   * planes from. The planes live in the SAME camera-relative frame as the node
   * origins: the rebase puts the camera at the frame origin, so a node's distance
   * from the eye is simply `length(center)`.
   */
  readonly frustumPlanes: Float32Array | null;
  /**
   * Angular slack in radians per unit camera distance, added to a LEAF node's
   * cull radius. A leaf draws as a fixed-PIXEL dot, so its on-screen footprint
   * spills a world span proportional to how far the node sits (a fixed angular
   * size subtends more world distance the farther away it is). Widening the cull
   * sphere by `length(center) * glowMarginAngleRad` keeps a node whose CENTRE has
   * just crossed a clip plane but whose dot still paints on-screen pixels — the
   * conservative keep that forbids a visible star winking out. The layer derives
   * it from the dot's pixel size and the vertical FOV (Task 5); `0` (the
   * null-planes default) makes the leaf cull radius the bare box half-diagonal.
   * Ignored for aggregate nodes, whose glow spills a world (not angular) slack.
   */
  readonly glowMarginAngleRad: number;
  /**
   * `ReadyFrameContext.viewSlot` (Task 13b) — which view-slot's camera
   * uniform + NodeParams/prefix buffer PAIR this call's writes land in. `0`
   * for the main view; `1..6` for a sky-cubemap capture face. A capture
   * sweep calls `draw` once per face plus once for the real view, all before
   * one `submit()`, so each call needs its own destination (see
   * `createViewSlotUniformRing`'s doc for the race this closes).
   */
  readonly viewSlot: number;
};

/**
 * The GPU resources the sibling `starCatalogPickRenderer` must SHARE with the
 * visual star renderer so its own r32uint pick pipeline stays bind-group
 * compatible — the star analogue of the galaxy points pipeline handing its
 * canonical `sourceBgl` to the point `GalaxyPickRenderer`.
 *
 * Two things are shared:
 *
 *   - **The three explicit bind-group layouts** (`cameraBgl` @group(0),
 *     `drawBgl` @group(1), `recordsBgl` @group(2)). The pick renderer builds its
 *     OWN pick pipeline layout from these exact objects, so its pipeline is
 *     group-equivalent to the visual one and the shared records bind group (built
 *     against `recordsBgl`) is valid on it. The pick renderer also builds its own
 *     @group(0)/@group(1) bind groups — over its OWN uniform/params buffers, so
 *     the writeBuffer/submit ordering trap can never let a pick draw scribble on
 *     the visual buffers — against these same layouts.
 *   - **A per-source records bind group lookup.** The record blob is a static
 *     per-source resource the visual renderer uploads ONCE (`upload`); the pick
 *     draw binds it verbatim rather than re-uploading, so the two pipelines pull
 *     the identical record bytes. The lookup is a live function (a tier swap
 *     unloads/reloads a source), returning `null` when the source has no catalog.
 */
export type StarCatalogPickResources = {
  readonly cameraBgl: GPUBindGroupLayout;
  readonly drawBgl: GPUBindGroupLayout;
  readonly recordsBgl: GPUBindGroupLayout;
  /** The @group(2) records bind group for `source`, or `null` if not loaded. */
  recordsBindGroup(source: SourceType): GPUBindGroup | null;
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
