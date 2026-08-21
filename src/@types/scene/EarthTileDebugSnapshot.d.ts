import type { LonLatDeg } from './LonLatDeg';

/**
 * EarthTileDebugSnapshot — a cheap, on-demand read of `earthTileSubsystem`'s
 * residency for the DebugPanel. Built fresh per call (not pushed per-frame),
 * so the panel polls it at a human-readable rate instead of every render.
 * `engaged: false` (atlas never allocated, or destroyed) means every other
 * field is a quiet zero/empty — see `emptyEarthTileDebugSnapshot`.
 */
export type EarthTileDebugSnapshot = {
  readonly engaged: boolean;
  /** Atlas slot count: `(EARTH_TILE_ATLAS_SIDE / tilePx) ** 2`. */
  readonly capacity: number;
  /** Slots currently claimed by a key, loaded or still in flight. */
  readonly used: number;
  /** One row per level with any resident or pending tile, sorted by `z`. */
  readonly levels: ReadonlyArray<{
    readonly z: number;
    readonly resident: number;
    readonly pending: number;
  }>;
  /** The most recent engaged frame's plan shape, or `null` while disengaged. */
  readonly plan: {
    readonly requestCount: number;
    readonly zWin: number;
    /** Planned tiles with no bitmap resident yet. */
    readonly misses: number;
    /** Leaves in the last frame's drawn cut (`earthTileSubsystem`'s
     *  `lastCut`) — unbounded today; a growth watch, not a cap. */
    readonly cutCount: number;
  } | null;
  /** `atlas.allocate` refusals ("atlas full this frame") on the last update. */
  readonly droppedAllocations: number;
  /** `"x,y"` keys resident at the deepest active level, capped at 16. */
  readonly deepestLevelKeys: readonly string[];
  /** Where over the body the last planned frame's camera sat, and the
   *  deepest band level available AT that point — the readout that answers
   *  "am I over a spot with deep imagery?" without cross-referencing bounds
   *  by hand. `null` while disengaged, matching `plan`. */
  readonly subCamera: (LonLatDeg & { readonly coveredMaxLevel: number | null }) | null;
};
