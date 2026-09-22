import type { Vec2 } from '../../../@types/math/Vec2';
import type { SourceType } from '../../../@types/data/SourceType';

/**
 * One source's per-frame LEAF cut, as the pick pass draws it — a subset of the
 * visual `StarCatalogDrawArgs`. Only the leaf stream is pickable (a picked star
 * is always a real-star record; an aggregate glow stands in for a whole
 * subtree), so there is no `stream` field and `isAggregate` is packed 0 for
 * every draw. The per-node arrays are flat + parallel, `drawCount` valid entries:
 * scalar arrays index `i`, the origin vec3 indexes `[3*i]` — the node box origin
 * + edge that reconstruct each record's true world position (the same
 * reconstruction the visual pass and `resolveStarRecord` use, so the pick lands
 * exactly where the sprite drew). Unlike the visual `StarNodeStream`, these are
 * FRESH compacted arrays `starPickLeafDraws` allocates per pick (opacity-0 leaves
 * filtered out): a pick is event-driven, not per-frame, so the allocation is
 * off the hot path.
 */
export type StarCatalogPickDrawArgs = {
  /** Which loaded catalog's records buffer to bind (its shared records bind group). */
  readonly source: SourceType;
  /** Rebased camera-relative view-projection (`narrowMat4(rebaseViewProj(...))`). */
  readonly vp: Float32Array;
  /** Viewport size in physical pixels — feeds the pixel-size-to-clip conversion. */
  readonly viewportPx: Vec2;
  readonly pxPerRad: number;
  /** How many leaf nodes this pick draws — valid entries in each flat array below. */
  readonly drawCount: number;
  /** Per-node record-slice base (`node.firstRecord`) — a flat `Uint32Array`. */
  readonly firstRecord: Uint32Array;
  /** Per-node instance count (leaf → N real stars) — a flat `Uint32Array`. */
  readonly recordCount: Uint32Array;
  /**
   * Per-node box origin, camera-relative Mpc — a flat `Float32Array` of THREE
   * f32 per node (node `i` at `[3*i]`, `[3*i+1]`, `[3*i+2]`).
   */
  readonly originRelCamMpc: Float32Array;
  /** Per-node box edge in Mpc, the in-cell offset unit — a flat `Float32Array`. */
  readonly cellScaleMpc: Float32Array;
  /**
   * User's base star-dot size in px (`settings.starCatalogs.sizePx`). The pick
   * billboard is sized by the same leaf legibility ramp as the visual dot so the
   * clickable area tracks what the eye sees, then floored to a ~3 px minimum in
   * the vertex stage's pick branch so a sub-pixel star stays clickable.
   */
  readonly sizePx: number;
  /**
   * The six frustum planes as `frustumPlanesFromViewProj` packs them (6 × vec4,
   * `Float32Array(24)`), against which each leaf node's bounding sphere is
   * rejected in the pack loop, or `null` to disable culling (pack every node).
   * The pick pass reuses the SAME per-node cull the visual renderer runs so an
   * off-screen leaf never packs a pick instance — but conservatively: a false
   * "inside" merely draws an unclickable off-screen node, a false "outside" would
   * make an ON-screen star unclickable (forbidden), so the leaf cull sphere only
   * ever grows past the true footprint.
   */
  readonly frustumPlanes: Float32Array | null;
  /**
   * The leaf node's on-screen spill as a small-angle radian margin, added to the
   * box half-diagonal as a distance-scaled world slack (`length(center) ·
   * glowMarginAngleRad`) so the cull sphere covers the CLICKABLE footprint — the
   * pick dot plus its 3.5 px pick floor — not just the box. The layer derives it
   * from that footprint (Task 5); a leaf is `isAggregate = 0` here so only this
   * leaf branch of the cull-radius contract applies (no aggregate glow slack).
   */
  readonly glowMarginAngleRad: number;
};
