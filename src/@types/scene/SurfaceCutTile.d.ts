import type { SurfacePatchAnchor } from './SurfacePatchAnchor';

/**
 * SurfaceCutTile — one leaf of `cutSurfaceTiles`'s walk that is actually
 * resident this frame (a leaf with no resident tile anywhere in its
 * ancestor chain is dropped; the base globe covers it instead).
 *
 * `anchor` carries the leaf's angular footprint, not a corner DIRECTION: the
 * direction is derivable from it via `patchOriginRelEyeM`, and two parallel
 * statements of the same corner — one f32-rounded, one not — is exactly the
 * per-patch drift spec §7.1 warns about.
 */
export type SurfaceCutTile = {
  readonly id: { readonly z: number; readonly x: number; readonly y: number };
  readonly anchor: SurfacePatchAnchor;
  readonly resident: {
    readonly slot: number;
    /** This leaf's OWN atlas rect, already flattened by
     *  `cutSurfaceTiles.ts`'s `resolveCutResidency` to the resolved
     *  ancestor's `1 / 2^levelDelta` sub-rect — never the ancestor's raw
     *  slot rect. There is no `levelDelta` to apply downstream; a
     *  flattened rect is the only fact a consumer needs. */
    readonly atlasUvOrigin: readonly [number, number];
    readonly atlasUvScale: readonly [number, number];
    /** `performance.now()` (REAL time) when the resolved tile's bitmap
     *  uploaded — stamped at `surfaceTileSubsystem`'s `uploadBitmap` site.
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
};
