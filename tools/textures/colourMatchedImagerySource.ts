/**
 * colourMatchedImagerySource — wrap a regional PRIMARY source so its colour
 * matches the coarser REFERENCE band below `sigmaDeg`, its finer detail left
 * alone. Identity fields are `primary`'s verbatim; only `readBox` changes.
 *
 * Per coverage box, both sources are resampled onto one canvas at
 * `reference.maxLevel + 1`, `colourOffsetFields` measures the local difference
 * per land/water class there, and output pixels get `land * D_land +
 * (1 - land) * D_water` added.
 */

import sharp from 'sharp';

import type { LonLatBounds } from '../../src/@types/scene/LonLatBounds';
import { EARTH_TILE_PX } from '../../src/data/bodies/earthTileParams';
import { earthTileColumns } from '../../src/utils/scene/earthTileColumns';
import type { GreyRaster } from '../utils/image/GreyRaster';
import { earthTileIndicesForBounds } from '../utils/scene/earthTileIndicesForBounds';
import type { EarthImagerySource } from './EarthImagerySource';
import { colourOffsetFields } from './colourOffsetFields';

/** Canvas-space offset fields for one of `primary`'s coverage boxes, plus the
 *  geo-referencing needed to sample them at an output pixel's lon/lat. */
type OffsetField = {
  readonly width: number;
  readonly height: number;
  readonly west: number;
  readonly north: number;
  readonly pxDeg: number;
  readonly land: Float32Array;
  readonly water: Float32Array;
};

/** Degrees spanned by one tile at `z`, in BOTH axes — the equirect raster is
 *  twice as wide as tall, so `180 / rows` equals `360 / columns`. */
function tileStepDeg(z: number): number {
  return 360 / earthTileColumns(z, EARTH_TILE_PX);
}

function tileBounds(z: number, x: number, y: number): LonLatBounds {
  const step = tileStepDeg(z);
  return {
    west: x * step - 180,
    east: (x + 1) * step - 180,
    north: 90 - y * step,
    south: 90 - (y + 1) * step,
  };
}

function intersects(a: LonLatBounds, b: LonLatBounds): boolean {
  return a.west < b.east && a.east > b.west && a.south < b.north && a.north > b.south;
}

/** Land fraction 0..1 at `lon`/`lat`, bilinear over a whole-globe equirect
 *  mask with land 255 and water 0. Cell CENTRES sit at half-cell offsets. */
function landFractionAt(mask: GreyRaster, lon: number, lat: number): number {
  const perDegree = mask.width / 360;
  const fx = Math.min(mask.width - 1, Math.max(0, (lon + 180) * perDegree - 0.5));
  const fy = Math.min(mask.height - 1, Math.max(0, (90 - lat) * perDegree - 0.5));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const x1 = Math.min(mask.width - 1, x0 + 1);
  const y1 = Math.min(mask.height - 1, y0 + 1);
  const top = mask.data[y0 * mask.width + x0]! * (1 - tx) + mask.data[y0 * mask.width + x1]! * tx;
  const bottom =
    mask.data[y1 * mask.width + x0]! * (1 - tx) + mask.data[y1 * mask.width + x1]! * tx;
  return (top * (1 - ty) + bottom * ty) / 255;
}

export function colourMatchedImagerySource(
  primary: EarthImagerySource,
  reference: EarthImagerySource,
  opts: { readonly sigmaDeg: number; readonly waterMaskPath: string },
): EarthImagerySource {
  const canvasLevel = reference.maxLevel + 1;
  if (primary.maxLevel < canvasLevel) {
    throw new Error(
      `colourMatchedImagerySource: ${primary.id} (maxLevel ${primary.maxLevel}) is no finer than ` +
        `the level-${canvasLevel} canvas ${reference.id} implies — nothing to correct.`,
    );
  }

  // Lazy, because `bakeDeepestLevel` probes every box on the globe and the
  // decline path below must stay as cheap as `primary.readBox` makes it.
  let waterMask: Promise<GreyRaster> | undefined;
  const loadWaterMask = async (): Promise<GreyRaster> => {
    const { data, info } = await sharp(opts.waterMaskPath, { limitInputPixels: false })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return {
      data: new Uint8Array(data.buffer, data.byteOffset, data.length),
      width: info.width,
      height: info.height,
    };
  };

  async function buildField(coverage: LonLatBounds): Promise<OffsetField> {
    const rect = earthTileIndicesForBounds(coverage, canvasLevel, EARTH_TILE_PX);
    const width = (rect.xMax - rect.xMin + 1) * EARTH_TILE_PX;
    const height = (rect.yMax - rect.yMin + 1) * EARTH_TILE_PX;
    const pixels = width * height;
    const step = tileStepDeg(canvasLevel);
    const pxDeg = step / EARTH_TILE_PX;
    const west = rect.xMin * step - 180;
    const north = 90 - rect.yMin * step;

    const referenceRgb = new Float32Array(pixels * 3);
    const referenceWeight = new Float32Array(pixels);
    for (let ty = rect.yMin; ty <= rect.yMax; ty++) {
      for (let tx = rect.xMin; tx <= rect.xMax; tx++) {
        const raster = await reference.readBox(
          tileBounds(canvasLevel, tx, ty),
          EARTH_TILE_PX,
          EARTH_TILE_PX,
        );
        if (raster === null) continue;
        const originX = (tx - rect.xMin) * EARTH_TILE_PX;
        const originY = (ty - rect.yMin) * EARTH_TILE_PX;
        for (let y = 0; y < EARTH_TILE_PX; y++) {
          for (let x = 0; x < EARTH_TILE_PX; x++) {
            const from = (y * EARTH_TILE_PX + x) * 4;
            const to = (originY + y) * width + originX + x;
            referenceRgb[to * 3] = raster[from]!;
            referenceRgb[to * 3 + 1] = raster[from + 1]!;
            referenceRgb[to * 3 + 2] = raster[from + 2]!;
            referenceWeight[to] = raster[from + 3]! / 255;
          }
        }
      }
    }

    // The primary reads at its OWN deepest level and box-averages down, so
    // every harvested pixel contributes to the difference exactly once.
    const primaryRgb = new Float32Array(pixels * 3);
    const primaryWeight = new Float32Array(pixels);
    const canvasPxPerTile = EARTH_TILE_PX >> (primary.maxLevel - canvasLevel);
    const block = EARTH_TILE_PX / canvasPxPerTile;
    const primaryRect = earthTileIndicesForBounds(coverage, primary.maxLevel, EARTH_TILE_PX);
    for (let ty = primaryRect.yMin; ty <= primaryRect.yMax; ty++) {
      for (let tx = primaryRect.xMin; tx <= primaryRect.xMax; tx++) {
        const raster = await primary.readBox(
          tileBounds(primary.maxLevel, tx, ty),
          EARTH_TILE_PX,
          EARTH_TILE_PX,
        );
        if (raster === null) continue;
        const originX = tx * canvasPxPerTile - rect.xMin * EARTH_TILE_PX;
        const originY = ty * canvasPxPerTile - rect.yMin * EARTH_TILE_PX;
        for (let y = 0; y < canvasPxPerTile; y++) {
          for (let x = 0; x < canvasPxPerTile; x++) {
            let r = 0;
            let g = 0;
            let b = 0;
            let alpha = 0;
            for (let sy = 0; sy < block; sy++) {
              for (let sx = 0; sx < block; sx++) {
                const from = ((y * block + sy) * EARTH_TILE_PX + x * block + sx) * 4;
                // Alpha-weighted: a source's transparent no-data pixels carry
                // no colour, and averaging their zeros in would darken the
                // coastline the difference is measured against.
                const a = raster[from + 3]! / 255;
                r += raster[from]! * a;
                g += raster[from + 1]! * a;
                b += raster[from + 2]! * a;
                alpha += a;
              }
            }
            const to = (originY + y) * width + originX + x;
            if (alpha > 0) {
              primaryRgb[to * 3] = r / alpha;
              primaryRgb[to * 3 + 1] = g / alpha;
              primaryRgb[to * 3 + 2] = b / alpha;
            }
            primaryWeight[to] = alpha / (block * block);
          }
        }
      }
    }

    const mask = await (waterMask ??= loadWaterMask());
    const covered = new Float32Array(pixels);
    const landFraction = new Float32Array(pixels);
    for (let y = 0; y < height; y++) {
      const lat = north - (y + 0.5) * pxDeg;
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        covered[i] = primaryWeight[i]! * referenceWeight[i]!;
        landFraction[i] = landFractionAt(mask, west + (x + 0.5) * pxDeg, lat);
      }
    }

    const fields = colourOffsetFields({
      width,
      height,
      primary: primaryRgb,
      reference: referenceRgb,
      covered,
      landFraction,
      sigmaPx: opts.sigmaDeg / pxDeg,
    });
    return { width, height, west, north, pxDeg, land: fields.land, water: fields.water };
  }

  const fields = new Map<number, Promise<OffsetField>>();
  function fieldFor(box: LonLatBounds): Promise<OffsetField> | null {
    const index = primary.coverage.findIndex((coverage) => intersects(coverage, box));
    if (index < 0) return null;
    let field = fields.get(index);
    if (field === undefined) {
      field = buildField(primary.coverage[index]!);
      fields.set(index, field);
    }
    return field;
  }

  return {
    id: primary.id,
    attribution: primary.attribution,
    maxLevel: primary.maxLevel,
    coverage: primary.coverage,
    provenance: primary.provenance,

    async readBox(box, widthPx, heightPx) {
      const raster = await primary.readBox(box, widthPx, heightPx);
      if (raster === null) return null;
      const pending = fieldFor(box);
      if (pending === null) return raster;
      const field = await pending;
      const mask = await (waterMask ??= loadWaterMask());

      const out = new Uint8Array(raster);
      for (let py = 0; py < heightPx; py++) {
        const lat = box.north - ((py + 0.5) / heightPx) * (box.north - box.south);
        const fy = Math.min(field.height - 1, Math.max(0, (field.north - lat) / field.pxDeg - 0.5));
        const y0 = Math.floor(fy);
        const y1 = Math.min(field.height - 1, y0 + 1);
        const ty = fy - y0;
        for (let px = 0; px < widthPx; px++) {
          const i = (py * widthPx + px) * 4;
          // Transparent margins are the underfill's ground, not this band's.
          if (raster[i + 3] === 0) continue;
          const lon = box.west + ((px + 0.5) / widthPx) * (box.east - box.west);
          const fx = Math.min(field.width - 1, Math.max(0, (lon - field.west) / field.pxDeg - 0.5));
          const x0 = Math.floor(fx);
          const x1 = Math.min(field.width - 1, x0 + 1);
          const tx = fx - x0;
          const land = landFractionAt(mask, lon, lat);
          const i00 = (y0 * field.width + x0) * 3;
          const i01 = (y0 * field.width + x1) * 3;
          const i10 = (y1 * field.width + x0) * 3;
          const i11 = (y1 * field.width + x1) * 3;
          for (let c = 0; c < 3; c++) {
            // Mix the classes at each corner, THEN interpolate: one bilinear
            // instead of two, and the shoreline blend stays the output
            // pixel's own land fraction rather than a smeared one.
            const d00 = land * field.land[i00 + c]! + (1 - land) * field.water[i00 + c]!;
            const d01 = land * field.land[i01 + c]! + (1 - land) * field.water[i01 + c]!;
            const d10 = land * field.land[i10 + c]! + (1 - land) * field.water[i10 + c]!;
            const d11 = land * field.land[i11 + c]! + (1 - land) * field.water[i11 + c]!;
            const offset =
              (d00 * (1 - tx) + d01 * tx) * (1 - ty) + (d10 * (1 - tx) + d11 * tx) * ty;
            out[i + c] = Math.max(0, Math.min(255, Math.round(raster[i + c]! + offset)));
          }
        }
      }
      return out;
    },
  };
}
