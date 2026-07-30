/**
 * bmngQuadrantSource — an `EarthImagerySource` over Blue Marble Next
 * Generation's eight-file quadrant tiling.
 *
 * NASA publishes each BMNG month twice over: as one 21600 x 10800 whole-globe
 * equirect, and as eight 21600 x 21600 quadrants that composite to
 * 86400 x 43200 — about 464 m per texel, four ladder levels deeper than the
 * whole-globe file (z7 against z5). Same imagery, same projection, same
 * grading; the only difference is that the deep version arrives cut into eight
 * pieces, and reassembling it on the fly is the whole of what this module does.
 *
 * ## The quadrant grid
 *
 * Column letters `A B C D` run west to east in 90-degree steps from longitude
 * -180; row digits `1` and `2` are the northern and southern hemispheres. So
 * `A1` is lon [-180, -90] x lat [0, 90] and `D2` is lon [90, 180] x lat
 * [-90, 0]. Row 0 of each file is that file's own NORTH edge, exactly as in the
 * whole-globe equirect, so the north-first raster the tile contract asks for is
 * again a plain crop with no flip anywhere.
 *
 * ## No tile can straddle a quadrant, and that is asserted rather than assumed
 *
 * Quadrant boundaries sit at multiples of 90 degrees, and from z2 upward the
 * tile grid divides 360 into steps that themselves divide 90 (90, 45, 22.5, …),
 * so every tile lies wholly inside one quadrant. That is why this source reads
 * one file per box and never stitches across two. `readBox` throws on a box
 * that spans a boundary instead of quietly reading whichever quadrant its west
 * edge landed in: a partially-wrong crop is a wrong-but-plausible globe, which
 * is the one failure this pipeline cannot detect from its own output.
 *
 * ## Why a band cache, and why it is keyed on the source row range
 *
 * `sharp(file).extract(...)` on a baseline JPEG re-decodes scanlines from row 0
 * on every call, so a naive per-tile crop costs what its region's DEPTH in the
 * file costs: measured on these files, 0.05 s at the top of a quadrant rising to
 * 1.51 s at the bottom, averaging 0.78 s. That is 1h47m for z7's 8192 tiles —
 * correct, and unusable. Extracting a whole tile-row BAND instead (`left: 0`,
 * the quadrant's full width, the tile row's height) costs 0.55 s and 42 MB
 * resident, after which each tile is a sub-crop of memory at about 21 ms. Same
 * pixels, ~5 min for the level.
 *
 * The cache key is `(quadrant, top, height)` of the computed source rect —
 * precisely what consecutive tiles of one tile row share while `left` walks
 * east. Keying on the rect rather than on `(z, y)` is what keeps the level
 * ladder out of this file: the source still answers one question about one box
 * and knows nothing about which level is being baked, or that levels exist.
 *
 * Four bands resident, least-recently-used evicted: one sweep of a tile row
 * crosses all four quadrant columns and then never returns to that row, so four
 * is exactly the working set and the entry a fifth insert drops is the one the
 * sweep has finished with. At z7 that is 4 x 43 MB. A band's height scales with
 * the tile edge measured in source pixels, so a much SHALLOWER deepest level
 * (which is to say a much smaller quadrant set) holds proportionally fatter
 * bands — the point at which a byte budget would have to replace the count.
 */

import { existsSync } from 'node:fs';

import sharp from 'sharp';

import { earthLevelFittingWidth } from '../../src/utils/scene/earthLevelFittingWidth';
import type { EarthImagerySource } from './EarthImagerySource';
import type { LonLatBox } from './LonLatBox';

/** Longitude and latitude extent of one quadrant, in degrees. */
const QUADRANT_SPAN_DEG = 90;

/** Column letters, west to east from longitude -180. */
const QUADRANT_COLUMNS = ['A', 'B', 'C', 'D'] as const;

/** Row digits, north to south from latitude +90. */
const QUADRANT_ROWS = ['1', '2'] as const;

/** One of the eight quadrant names: column letter then row digit. */
export type BmngQuadrant = `${(typeof QUADRANT_COLUMNS)[number]}${(typeof QUADRANT_ROWS)[number]}`;

/** Every quadrant name, as the product of the two axes rather than a hand-written
 *  list, so the grid is stated exactly once. */
const QUADRANT_NAMES: readonly BmngQuadrant[] = QUADRANT_COLUMNS.flatMap((column) =>
  QUADRANT_ROWS.map((row) => `${column}${row}` as const),
);

/**
 * Where a box landed: the quadrant that contains it, plus that quadrant's own
 * north-west corner in degrees — the origin every source-pixel offset inside the
 * file is measured from.
 */
type QuadrantPlacement = {
  readonly name: BmngQuadrant;
  readonly westDeg: number;
  readonly northDeg: number;
};

/** One decoded tile-row band: a full-quadrant-width strip of raw pixels.
 *  The channel count is carried from the decode rather than assumed, because
 *  it is what the sub-crop has to reinterpret the buffer with. */
type Band = {
  readonly data: Buffer;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly channels: 3 | 4;
};

const BAND_CACHE_SIZE = 4;

/**
 * Index of the one 90-degree band that both edges of a span fall in, or `null`
 * when the span crosses a boundary or leaves the grid.
 *
 * `nearDeg` and `farDeg` are measured from the axis origin — east from longitude
 * -180, south from latitude +90 — which is what lets one function answer both
 * axes instead of two near-copies that can disagree.
 *
 * The far edge is `ceil - 1` rather than `floor`: a span ENDING on a boundary
 * ends in the band it came from, not in the next one. Get that backwards and
 * every tile touching a seam reads the wrong file.
 */
function soleBandIndex(nearDeg: number, farDeg: number, bands: number): number | null {
  const first = Math.floor(nearDeg / QUADRANT_SPAN_DEG);
  const last = Math.ceil(farDeg / QUADRANT_SPAN_DEG) - 1;
  if (first !== last || first < 0 || first >= bands) return null;
  return first;
}

/** The quadrant containing `box`, or a throw naming the box if it spans two of
 *  them (or falls off the grid, which for a globally-covering source is a caller
 *  bug and not a no-coverage answer). */
function quadrantForBox(box: LonLatBox): QuadrantPlacement {
  const column = soleBandIndex(box.west + 180, box.east + 180, QUADRANT_COLUMNS.length);
  const row = soleBandIndex(90 - box.north, 90 - box.south, QUADRANT_ROWS.length);
  if (column === null || row === null) {
    throw new Error(
      `bmngQuadrantSource: box west ${box.west} east ${box.east} north ${box.north} south ${box.south} ` +
        'does not lie inside a single 90-degree quadrant — this source reads one file per box and cannot stitch across two',
    );
  }
  return {
    name: `${QUADRANT_COLUMNS[column]!}${QUADRANT_ROWS[row]!}`,
    westDeg: -180 + QUADRANT_SPAN_DEG * column,
    northDeg: 90 - QUADRANT_SPAN_DEG * row,
  };
}

export async function bmngQuadrantSource(source: {
  /** Stable identifier recorded in the manifest's `builtFrom`, vintage included. */
  readonly id: string;
  /** Verbatim attribution the licence requires. */
  readonly attribution: string;
  /**
   * Absolute path per quadrant. Paths rather than registry keys because the
   * eight files are one raster whose VINTAGE is the caller's choice, the same
   * reason `equirectFileSource` takes its file as a parameter; keying the record
   * on the quadrant union then makes a forgotten file a compile error instead of
   * a hole in the globe.
   */
  readonly quadrantPaths: Readonly<Record<BmngQuadrant, string>>;
  /**
   * Called once per real band decode, which is to say once per cache MISS. The
   * band cache is the difference between a five-minute deepest level and a
   * two-hour one, so whether it is hitting is worth being observable rather
   * than inferred from wall-clock.
   */
  readonly onBandDecode?: (quadrant: BmngQuadrant, topPx: number) => void;
}): Promise<EarthImagerySource> {
  const missing = QUADRANT_NAMES.filter((name) => !existsSync(source.quadrantPaths[name]));
  if (missing.length > 0) {
    throw new Error(
      `bmngQuadrantSource: ${missing.length} of ${QUADRANT_NAMES.length} quadrant files are missing ` +
        `(${missing.join(', ')}); the first absent path is ${source.quadrantPaths[missing[0]!]}`,
    );
  }

  const edges = await Promise.all(
    QUADRANT_NAMES.map(async (name) => {
      const meta = await sharp(source.quadrantPaths[name], { limitInputPixels: false }).metadata();
      const width = meta.width ?? 0;
      const height = meta.height ?? 0;
      // A quadrant spans 90 degrees of longitude by 90 of latitude, so on a
      // plate-carree grid it is square. Anything else is not this tiling, and
      // every box would silently sample the wrong ground.
      if (width === 0 || width !== height) {
        throw new Error(
          `bmngQuadrantSource: quadrant ${name} is ${width}x${height}, not a square 90-degree plate-carree quadrant`,
        );
      }
      return width;
    }),
  );
  const quadrantEdgePx = edges[0]!;
  const oddOne = edges.findIndex((edge) => edge !== quadrantEdgePx);
  if (oddOne >= 0) {
    throw new Error(
      `bmngQuadrantSource: quadrant ${QUADRANT_NAMES[oddOne]!} is ${edges[oddOne]!} px where ` +
        `${QUADRANT_NAMES[0]!} is ${quadrantEdgePx} px — the eight files have to be one grid`,
    );
  }

  /** Insertion-ordered, so the first key is always the least recently used.
   *  Promises rather than resolved bands: two overlapping calls for one band then
   *  share the single decode instead of racing to do it twice. */
  const bands = new Map<string, Promise<Band>>();

  async function decodeBand(
    placement: QuadrantPlacement,
    topPx: number,
    heightPx: number,
  ): Promise<Band> {
    const { data, info } = await sharp(source.quadrantPaths[placement.name], {
      // A 21600 x 21600 quadrant is 466 Mpx, over sharp's default input ceiling.
      limitInputPixels: false,
    })
      .extract({ left: 0, top: topPx, width: quadrantEdgePx, height: heightPx })
      .raw()
      .toBuffer({ resolveWithObject: true });
    // Colour imagery decodes to 3 or 4 channels. A single-channel (greyscale)
    // band would survive every step below and then `ensureAlpha` into a
    // TWO-channel raster, breaking the one hard promise `readBox` makes about
    // its length — so it fails here instead, where the cause is legible.
    if (info.channels !== 3 && info.channels !== 4) {
      throw new Error(
        `bmngQuadrantSource: quadrant ${placement.name} decoded to ${info.channels} channels; this source expects RGB or RGBA imagery`,
      );
    }
    return { data, widthPx: info.width, heightPx: info.height, channels: info.channels };
  }

  function bandFor(placement: QuadrantPlacement, topPx: number, heightPx: number): Promise<Band> {
    const key = `${placement.name}:${topPx}:${heightPx}`;
    const hit = bands.get(key);
    if (hit !== undefined) {
      // Re-inserting is the LRU touch: Map iteration is insertion-ordered, so
      // moving a hit to the end keeps the eviction candidate at the front.
      bands.delete(key);
      bands.set(key, hit);
      return hit;
    }
    source.onBandDecode?.(placement.name, topPx);
    const pending = decodeBand(placement, topPx, heightPx);
    bands.set(key, pending);
    // A rejected decode must not stay cached, or one transient read error would
    // be replayed for every remaining tile of that band.
    void pending.catch(() => {
      if (bands.get(key) === pending) bands.delete(key);
    });
    while (bands.size > BAND_CACHE_SIZE) bands.delete(bands.keys().next().value!);
    return pending;
  }

  return {
    id: source.id,
    attribution: source.attribution,
    maxLevel: earthLevelFittingWidth(quadrantEdgePx * QUADRANT_COLUMNS.length),

    async readBox(box, widthPx, heightPx) {
      const placement = quadrantForBox(box);
      const pxPerDeg = quadrantEdgePx / QUADRANT_SPAN_DEG;
      // Offsets are measured from the quadrant's own north-west corner, and row 0
      // of the file is its north edge — so the box's NORTH edge maps to the
      // smaller pixel row and the raster comes back north-first, which is what
      // the tile contract asks for.
      const left = Math.round((box.west - placement.westDeg) * pxPerDeg);
      const right = Math.round((box.east - placement.westDeg) * pxPerDeg);
      const top = Math.round((placement.northDeg - box.north) * pxPerDeg);
      const bottom = Math.round((placement.northDeg - box.south) * pxPerDeg);

      const band = await bandFor(placement, top, Math.min(bottom, quadrantEdgePx) - top);

      return (
        sharp(band.data, {
          raw: { width: band.widthPx, height: band.heightPx, channels: band.channels },
        })
          .extract({
            left,
            top: 0,
            width: Math.min(right, quadrantEdgePx) - left,
            height: band.heightPx,
          })
          // `fit: 'fill'` for the same reason as the whole-globe source: the caller
          // asks for a square tile out of a box that is only square at the equator,
          // and the plate-carree stretch toward the poles is the projection rather
          // than an aspect error to preserve.
          .resize(widthPx, heightPx, { fit: 'fill' })
          // Blue Marble covers the whole globe including bathymetry, so alpha is
          // 255 everywhere and this source never declines a box — a `null` from
          // here would be a bug, not a no-data answer. The channel is still
          // returned, because the runtime's blend is written against its presence.
          .ensureAlpha()
          .raw()
          .toBuffer()
      );
    },
  };
}
