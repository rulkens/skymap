import type { LonLatBox } from './LonLatBox';

/**
 * EarthImagerySource — the one seam between `buildEarthTiles` and wherever the
 * pixels come from.
 *
 * It lives in the BUILD tool and nowhere else. Whichever imagery source wins,
 * the baked pyramid is byte-identical in shape — our grid, our tile edge, our
 * container, our colour space — so the runtime is source-independent by
 * construction and there is deliberately no runtime tile-provider seam. The
 * variability that genuinely exists is *which source the pyramid was baked
 * from*, and that varies at build time, which is here.
 *
 * The interface is one method wide on purpose. Everything a source could
 * otherwise be asked to know — the tile grid, the level ladder, the build
 * order, the container, the alpha semantics downstream — belongs to the build
 * tool, which is the single home for it. A source is asked one question:
 * "given this piece of the planet, at this pixel size, what does it look
 * like?". An on-disk equirect answers it with a crop and a resize; a WMTS
 * source with a tile fetch and a 2x2 merge; a COG source with an HTTP range
 * read of the nearest overview and a colour grade. None of those shapes leaks
 * past `readBox`.
 *
 * ## The two things `readBox` promises that are easy to get wrong
 *
 * **Row 0 of the returned raster is the box's NORTH edge.** The whole pipeline
 * is north-first: the tile grid's `y` increases south, tiles upload with
 * `flipY: false`, and the reconciliation with the mesh's south-first `v`
 * happens once, in the tile-index arithmetic. A source that returned
 * south-first rows would produce a globe that is subtly, invisibly upside down
 * per tile — which reads as a shader bug two layers away.
 *
 * **Alpha is the land mask, and it is a real channel even when it is
 * uniformly opaque.** The land-only sources of the deep pyramid carry an exact
 * no-data mask, and that mask becomes tile alpha so ocean and coastline
 * resolve to the whole-globe base texture at the true coastline rather than at
 * a tile boundary. A globally-covered source (Blue Marble) has nothing to mask
 * and returns 255 everywhere, but it still returns four channels: the presence
 * of the channel is what the runtime's blend is written against, not its
 * content.
 */
export type EarthImagerySource = {
  readonly id: string;
  /** Verbatim attribution text the licence requires, surfaced in the Splash credits. */
  readonly attribution: string;
  /** Deepest pyramid level with real (non-upsampled) detail. */
  readonly maxLevel: number;
  /** Sample a lon/lat box into an RGBA raster of exactly widthPx x heightPx, graded and
   *  sRGB-encoded, alpha 0 where the source has no land data. Null when the box is
   *  entirely outside coverage, so the caller emits no tile at all. */
  readBox(box: LonLatBox, widthPx: number, heightPx: number): Promise<Uint8Array | null>;
};
