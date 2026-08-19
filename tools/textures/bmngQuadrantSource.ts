/**
 * bmngQuadrantSource — an `EarthImagerySource` over Blue Marble Next
 * Generation's eight-file quadrant tiling.
 *
 * NASA publishes each BMNG month twice: one 21600x10800 whole-globe equirect,
 * and eight 21600x21600 quadrants that composite to 86400x43200 — about
 * 464 m/texel, four ladder levels deeper than the whole-globe file (z7
 * against z5). Same imagery, projection and grading; reassembling the
 * eight-piece version on the fly is the whole of what this module does.
 *
 * Column letters `A B C D` run west to east in 90-degree steps from longitude
 * -180; row digits `1`/`2` are the northern/southern hemispheres (`A1` = lon
 * [-180,-90] x lat [0,90], `D2` = lon [90,180] x lat [-90,0]). Row 0 of each
 * file is its own NORTH edge, so the tile contract's north-first raster is a
 * plain crop, no flip. Quadrant boundaries sit at multiples of 90 degrees and
 * the tile grid always divides evenly into that, so every tile lies wholly
 * inside one quadrant; `readBox` throws rather than silently reading whichever
 * quadrant a spanning box's west edge landed in.
 *
 * ## The band cache
 *
 * `sharp(file).extract(...)` on a baseline JPEG re-decodes scanlines from row
 * 0 every call, so a naive per-tile crop costs its region's DEPTH in the
 * file: 1h47m for z7's 8192 tiles, measured. Caching a whole tile-row BAND
 * (full quadrant width) instead brings that to ~5 min, each tile then a
 * sub-crop of memory. The key, `(quadrant, top, height)` of the source rect,
 * is what consecutive tiles of one row share — keeping the level ladder out
 * of this file entirely. Four bands resident, LRU-evicted: one sweep crosses
 * all four quadrant columns and never returns, so four is the working set.
 */

import { existsSync } from 'node:fs';

import sharp from 'sharp';

import { earthLevelFittingWidth } from '../../src/utils/scene/earthLevelFittingWidth';
import type { EarthImagerySource } from './EarthImagerySource';
import type { LonLatBounds } from '../../src/@types/scene/LonLatBounds';

/** Longitude and latitude extent of one quadrant, in degrees. */
const QUADRANT_SPAN_DEG = 90;

/** Column letters, west to east from longitude -180. */
const QUADRANT_COLUMNS = ['A', 'B', 'C', 'D'] as const;

/** Row digits, north to south from latitude +90. */
const QUADRANT_ROWS = ['1', '2'] as const;

/** One of the eight quadrant names: column letter then row digit. */
export type BmngQuadrant = `${(typeof QUADRANT_COLUMNS)[number]}${(typeof QUADRANT_ROWS)[number]}`;

/** Every quadrant name, as the product of the two axes rather than a
 *  hand-written list, so the grid is stated exactly once. */
const QUADRANT_NAMES: readonly BmngQuadrant[] = QUADRANT_COLUMNS.flatMap((column) =>
  QUADRANT_ROWS.map((row) => `${column}${row}` as const),
);

/** Where a box landed: the quadrant, plus its own north-west corner in
 *  degrees — the origin every source-pixel offset is measured from. */
type QuadrantPlacement = {
  readonly name: BmngQuadrant;
  readonly westDeg: number;
  readonly northDeg: number;
};

/** One decoded tile-row band. Channel count is carried from the decode
 *  rather than assumed, since the sub-crop has to reinterpret the buffer. */
type Band = {
  readonly data: Buffer;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly channels: 3 | 4;
};

const BAND_CACHE_SIZE = 4;

/**
 * Index of the one 90-degree band both edges of a span fall in, or `null` if
 * the span crosses a boundary or leaves the grid. `nearDeg`/`farDeg` are
 * measured from the axis origin (east from -180, south from +90) so one
 * function answers both axes. The far edge is `ceil - 1`, not `floor`: a span
 * ENDING on a boundary ends in the band it came from — get that backwards
 * and every tile touching a seam reads the wrong file.
 */
function soleBandIndex(nearDeg: number, farDeg: number, bands: number): number | null {
  const first = Math.floor(nearDeg / QUADRANT_SPAN_DEG);
  const last = Math.ceil(farDeg / QUADRANT_SPAN_DEG) - 1;
  if (first !== last || first < 0 || first >= bands) return null;
  return first;
}

/** The quadrant containing `box`, or a throw naming it if it spans two (or
 *  falls off the grid — a caller bug for a globally-covering source, not a
 *  no-coverage answer). */
function quadrantForBox(box: LonLatBounds): QuadrantPlacement {
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
  /** Absolute path per quadrant — paths rather than registry keys because the
   *  eight files are one raster whose VINTAGE is the caller's choice, same as
   *  `equirectFileSource`. Keying on the quadrant union makes a forgotten file
   *  a compile error rather than a hole in the globe. */
  readonly quadrantPaths: Readonly<Record<BmngQuadrant, string>>;
  /** Called once per cache MISS — the band cache is the difference between a
   *  5-minute deepest level and a 2-hour one, worth being observable. */
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
      // A plate-carree quadrant spanning 90deg x 90deg is square; anything
      // else isn't this tiling and would sample the wrong ground.
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

  // Insertion-ordered Map (first key = LRU). Promises rather than resolved
  // bands, so overlapping calls for one band share the single decode.
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
    // A greyscale (1-channel) band would survive silently and `ensureAlpha`
    // into a 2-channel raster below, breaking readBox's RGBA promise.
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
      // Re-insert to move this hit to the end, keeping the LRU at the front.
      bands.delete(key);
      bands.set(key, hit);
      return hit;
    }
    source.onBandDecode?.(placement.name, topPx);
    const pending = decodeBand(placement, topPx, heightPx);
    bands.set(key, pending);
    // Uncache on rejection, or one transient read error replays for every
    // remaining tile of that band.
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
      // Offsets are measured from the quadrant's own north-west corner; row 0
      // is that corner, so the box's north edge lands at the smaller row.
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
          // `fit: 'fill'`: the plate-carree stretch toward the poles is the
          // projection, not an aspect error to preserve (see equirectFileSource).
          .resize(widthPx, heightPx, { fit: 'fill' })
          // Blue Marble has no no-data, so this source never declines a box —
          // ensureAlpha still returns the channel per the readBox contract.
          .ensureAlpha()
          .raw()
          .toBuffer()
      );
    },
  };
}
