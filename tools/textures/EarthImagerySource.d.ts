import type { LonLatBounds } from '../../src/@types/scene/LonLatBounds';

/**
 * EarthImagerySource — the one seam between `buildEarthTiles` and wherever
 * the pixels come from. Lives in the BUILD tool only, one method wide: a
 * source only answers "given this piece of the planet, at this pixel size,
 * what does it look like?" — the tile grid, level ladder and container stay
 * the build tool's problem, so the runtime is source-independent regardless
 * of which source baked the pyramid.
 *
 * `readBox` makes two promises easy to get wrong:
 *
 * **Row 0 of the returned raster is the box's NORTH edge.** The pipeline is
 * north-first throughout: tile `y` increases south, tiles upload with
 * `flipY: false`, and reconciliation with the mesh's south-first `v` happens
 * once, in the tile-index arithmetic. A south-first source produces a globe
 * that is per-tile upside down — reading as a shader bug, not a bad flip.
 *
 * **Alpha is the land mask — a real channel even when uniformly opaque.**
 * The deep pyramid's land-only sources carry an exact no-data mask that
 * becomes tile alpha, resolving ocean/coastline at the true coastline rather
 * than a tile boundary. A globally-covered source (Blue Marble) has nothing
 * to mask and returns 255 everywhere, but still returns four channels — the
 * runtime's blend is written against the channel's presence, not its content.
 */
export type EarthImagerySource = {
  readonly id: string;
  /** Verbatim attribution text the licence requires, surfaced in the Splash credits. */
  readonly attribution: string;
  /** Deepest pyramid level with real (non-upsampled) detail. */
  readonly maxLevel: number;
  /** Geographic bounds this source covers. Multiple bounds allow partial-globe sources. */
  readonly coverage: ReadonlyArray<LonLatBounds>;
  /** Sample a lon/lat box into an RGBA raster of exactly widthPx x heightPx, graded and
   *  sRGB-encoded, alpha 0 where the source has no land data. Null when the box is
   *  entirely outside coverage, so the caller emits no tile at all. */
  readBox(box: LonLatBounds, widthPx: number, heightPx: number): Promise<Uint8Array | null>;
};
