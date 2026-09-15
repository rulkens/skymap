/**
 * ResolvedTileResidency — one leaf's resolved ALBEDO texels, as
 * `cutSurfaceTiles`'s ancestor-fallback climb leaves them. Its own type since
 * the cut went two-product: height is never resolved this way (a leaf samples
 * its OWN height tile or is not drawn at all, spec §5.2), so the climb-and-
 * flatten shape below belongs to albedo alone.
 */
export type ResolvedTileResidency = {
  readonly slot: number;
  /** This leaf's OWN atlas rect, already flattened by
   *  `cutSurfaceTiles.ts`'s `resolveCutResidency` to the resolved
   *  ancestor's `1 / 2^levelDelta` sub-rect — never the ancestor's raw
   *  slot rect. There is no `levelDelta` to apply downstream; a
   *  flattened rect is the only fact a consumer needs. */
  readonly atlasUvOrigin: readonly [number, number];
  readonly atlasUvScale: readonly [number, number];
  /** `performance.now()` (REAL time) when the resolved tile's bitmap
   *  uploaded — stamped at `surfaceTileSubsystem`'s `upload` call site.
   *  Drives the renderer's fade-in weight; never sim time, so a fade runs
   *  even while the sim clock is paused or scaled. */
  readonly readyAtMs: number;
  /** The next resident ancestor strictly ABOVE the resolved tile (a
   *  shallower level, further up the same walk `resolveCutResidency`
   *  already does), flattened into this leaf's own sub-rect the same way
   *  `atlasUvOrigin`/`atlasUvScale` are — the coarser imagery the
   *  renderer fades FROM. `null` when no deeper resident ancestor exists
   *  (the resolved tile IS the shallowest resident one), which the
   *  renderer reads as "nothing to fade from" — full weight, no second
   *  sample needed. */
  readonly fallback: {
    readonly atlasUvOrigin: readonly [number, number];
    readonly atlasUvScale: readonly [number, number];
  } | null;
};
