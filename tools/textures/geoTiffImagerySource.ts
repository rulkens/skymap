/**
 * geoTiffImagerySource — a `SurfaceImagerySource` over an equirectangular
 * colour GeoTIFF (Viking, HiRISE orthos; spec §4.2): 8-bit RGB(A) via
 * `readGeoTiffRgbWindow`, UInt16 grey (`greyStretch`) stretched to RGB; `sharp`
 * shrinks the window, and a box finer than the raster is sampled bilinearly.
 */

import sharp from 'sharp';

import type { GeoTiffGrid } from './@types/GeoTiffGrid';
import type { SurfaceImagerySource } from './@types/SurfaceImagerySource';
import { boundsOverlap } from '../utils/textures/boundsOverlap';
import { clamp } from '../utils/textures/clamp';
import { readGeoTiffRgbWindow } from '../utils/textures/readGeoTiffRgbWindow';
import { resampleRgbaBilinear } from '../utils/image/resampleRgbaBilinear';

/**
 * One window of a single-band UInt16 GeoTIFF, native values intact. Sharp
 * silently rescales UInt16 0..65535 -> 0..255 on any other colourspace
 * conversion (lovell/sharp#3808); relabelling to `grey16` (its own space)
 * makes the conversion an identity, so `raw({depth:'ushort'})` returns the
 * true sample.
 */
async function readUInt16GreyWindow(
  path: string,
  left: number,
  top: number,
  width: number,
  height: number,
): Promise<Uint16Array> {
  const image = sharp(path, { limitInputPixels: false, unlimited: true });
  const depth = (await image.metadata()).depth;
  if (depth !== 'ushort') {
    throw new Error(`readUInt16GreyWindow: ${path} has depth '${depth}', expected UInt16 grey`);
  }

  const { data, info } = await image
    .extract({ left, top, width, height })
    .toColourspace('grey16')
    .raw({ depth: 'ushort' })
    .toBuffer({ resolveWithObject: true });

  if (info.channels !== 1) {
    throw new Error(`readUInt16GreyWindow: ${path} yielded ${info.channels} channels, expected 1`);
  }
  const bytes = Uint16Array.BYTES_PER_ELEMENT;
  return data.byteOffset % bytes === 0
    ? new Uint16Array(data.buffer, data.byteOffset, width * height)
    : new Uint16Array(data.buffer.slice(data.byteOffset, data.byteOffset + width * height * bytes));
}

export function geoTiffImagerySource(opts: {
  readonly id: string;
  readonly attribution: string;
  readonly provenance: SurfaceImagerySource['provenance'];
  readonly grid: GeoTiffGrid;
  readonly maxLevel: number;
  /** UInt16 grey only: linear stretch `[lo, hi]` -> `0..255`, replicated to RGB. */
  readonly greyStretch?: readonly [number, number];
}): SurfaceImagerySource {
  const { grid } = opts;
  const dx = (grid.bounds.east - grid.bounds.west) / grid.width;
  const dy = (grid.bounds.north - grid.bounds.south) / grid.height;

  async function readWindow(
    left: number,
    top: number,
    winWidth: number,
    winHeight: number,
  ): Promise<Uint8Array> {
    let rgba: Uint8Array;
    if (opts.greyStretch !== undefined) {
      const [lo, hi] = opts.greyStretch;
      const scale = 255 / (hi - lo);
      const grey = await readUInt16GreyWindow(grid.path, left, top, winWidth, winHeight);
      rgba = new Uint8Array(winWidth * winHeight * 4);
      for (let i = 0; i < grey.length; i++) {
        const value = grey[i]!;
        // 0 is every grey ortho's declared no-data (Gusev, Endeavour),
        // checked on the RAW value before the stretch: `lo` sits above 0,
        // so a real dark pixel's raw DN is never exactly 0.
        const noData = value === 0;
        const level = noData ? 0 : clamp(Math.round((value - lo) * scale), 0, 255);
        rgba[i * 4] = level;
        rgba[i * 4 + 1] = level;
        rgba[i * 4 + 2] = level;
        rgba[i * 4 + 3] = noData ? 0 : 255;
      }
    } else {
      rgba = await readGeoTiffRgbWindow(grid.path, left, top, winWidth, winHeight);
      // Byte RGB carries no separate no-data channel — `readGeoTiffRgbWindow`
      // does not surface a GDAL internal mask (see its own doc) — so a pixel
      // that is BOTH fully opaque and exactly black is treated as the
      // declared 0 sentinel (Viking) instead.
      for (let i = 0; i < rgba.length; i += 4) {
        if (rgba[i] === 0 && rgba[i + 1] === 0 && rgba[i + 2] === 0 && rgba[i + 3] === 255) {
          rgba[i + 3] = 0;
        }
      }
    }
    return rgba;
  }

  return {
    id: opts.id,
    attribution: opts.attribution,
    maxLevel: opts.maxLevel,
    coverage: [grid.bounds],
    provenance: opts.provenance,

    async readBox(box, widthPx, heightPx) {
      if (!boundsOverlap(box, grid.bounds)) return null;
      // A box straddling the raster's edge would otherwise clamp to the
      // available window and get stretched to fill the box — a distorted,
      // silently-wrong tile rather than a caller that needed to clip first.
      if (
        box.west < grid.bounds.west ||
        box.east > grid.bounds.east ||
        box.south < grid.bounds.south ||
        box.north > grid.bounds.north
      ) {
        throw new Error(
          `geoTiffImagerySource: ${opts.id}'s box only partly overlaps its raster bounds`,
        );
      }

      // A box finer than the raster is sampled at its pixel centres: snapping
      // it to whole source pixels makes each deep tile one flat block.
      const upsample =
        (box.east - box.west) / widthPx < dx || (box.north - box.south) / heightPx < dy;
      if (upsample) {
        const x0 = (box.west - grid.bounds.west) / dx - 0.5;
        const y0 = (grid.bounds.north - box.north) / dy - 0.5;
        const xStep = (box.east - box.west) / widthPx / dx;
        const yStep = (box.north - box.south) / heightPx / dy;
        const left = clamp(Math.floor(x0), 0, grid.width - 1);
        const right = clamp(Math.floor(x0 + widthPx * xStep) + 1, 0, grid.width - 1);
        const top = clamp(Math.floor(y0), 0, grid.height - 1);
        const bottom = clamp(Math.floor(y0 + heightPx * yStep) + 1, 0, grid.height - 1);
        return resampleRgbaBilinear({
          rgba: await readWindow(left, top, right - left + 1, bottom - top + 1),
          width: right - left + 1,
          height: bottom - top + 1,
          widthPx,
          heightPx,
          x0: x0 + xStep / 2 - left,
          y0: y0 + yStep / 2 - top,
          xStep,
          yStep,
        });
      }

      // Source pixel window covering the box — plain edge arithmetic (no
      // "+0.5"): these are the raster's own pixel EDGES, not lattice posts.
      const left = clamp(Math.round((box.west - grid.bounds.west) / dx), 0, grid.width);
      const right = clamp(Math.round((box.east - grid.bounds.west) / dx), 0, grid.width);
      const top = clamp(Math.round((grid.bounds.north - box.north) / dy), 0, grid.height);
      const bottom = clamp(Math.round((grid.bounds.north - box.south) / dy), 0, grid.height);
      const winWidth = right - left;
      const winHeight = bottom - top;
      if (winWidth <= 0 || winHeight <= 0) return null;

      return sharp(await readWindow(left, top, winWidth, winHeight), {
        raw: { width: winWidth, height: winHeight, channels: 4 },
      })
        .resize(widthPx, heightPx, { fit: 'fill' })
        .raw()
        .toBuffer();
    },
  };
}
