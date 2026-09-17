/**
 * geoTiffImagerySource — a `SurfaceImagerySource` over an arbitrary
 * equirectangular colour GeoTIFF (Viking, HiRISE orthos; spec §4.2). Two
 * pixel shapes share one box-sampling path: an 8-bit RGB(A) file reads
 * through `readGeoTiffRgbWindow`, a single-band UInt16 grey file (a `greyStretch`
 * is given) is linearly stretched and replicated to RGB — both land as one
 * native-resolution RGBA raster that `sharp` then resizes to the requested box,
 * so alpha (0 at no-data) blends at a shrunk box's edges same as every other source.
 */

import sharp from 'sharp';

import type { GeoTiffGrid } from './GeoTiffGrid';
import type { SurfaceImagerySource } from './SurfaceImagerySource';
import { boundsOverlap } from '../utils/textures/boundsOverlap';
import { readGeoTiffRgbWindow } from '../utils/textures/readGeoTiffRgbWindow';

function clamp(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value;
}

/**
 * One window of a single-band UInt16 GeoTIFF, native values intact.
 * `readGeoTiffWindow` (the DEM reader) forces `.toColourspace('b-w')`, which
 * is a no-op relabel for the DEM formats it targets (short/float/int) but a
 * REAL 0..65535 -> 0..255 rescale for UInt16, whose TIFF `PhotometricInterpretation`
 * tags it `grey16` — a "photographic" space sharp always normalises into any
 * OTHER space on output. Naming it `grey16` again is the escape hatch: sharp
 * then treats the conversion as an identity and `raw({depth:'ushort'})` gets
 * the true sample back (confirmed against lovell/sharp#3808's workaround).
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

  return {
    id: opts.id,
    attribution: opts.attribution,
    maxLevel: opts.maxLevel,
    coverage: [grid.bounds],
    provenance: opts.provenance,

    async readBox(box, widthPx, heightPx) {
      if (!boundsOverlap(box, grid.bounds)) return null;

      // Source pixel window covering the box — plain edge arithmetic (no
      // "+0.5"): these are the raster's own pixel EDGES, not lattice posts.
      const left = clamp(Math.round((box.west - grid.bounds.west) / dx), 0, grid.width);
      const right = clamp(Math.round((box.east - grid.bounds.west) / dx), 0, grid.width);
      const top = clamp(Math.round((grid.bounds.north - box.north) / dy), 0, grid.height);
      const bottom = clamp(Math.round((grid.bounds.north - box.south) / dy), 0, grid.height);
      const winWidth = right - left;
      const winHeight = bottom - top;
      if (winWidth <= 0 || winHeight <= 0) return null;

      let rgba: Uint8Array;
      if (opts.greyStretch !== undefined) {
        const [lo, hi] = opts.greyStretch;
        const scale = 255 / (hi - lo);
        const grey = await readUInt16GreyWindow(grid.path, left, top, winWidth, winHeight);
        rgba = new Uint8Array(winWidth * winHeight * 4);
        for (let i = 0; i < grey.length; i++) {
          const value = grey[i]!;
          // 0 is every grey ortho's declared no-data (Gusev, Endeavour); a
          // stretched value never legitimately lands there since `lo` is set
          // above it, so the check never swallows a real dark pixel.
          const noData = value === 0;
          const level = noData ? 0 : clamp(Math.round((value - lo) * scale), 0, 255);
          rgba[i * 4] = level;
          rgba[i * 4 + 1] = level;
          rgba[i * 4 + 2] = level;
          rgba[i * 4 + 3] = noData ? 0 : 255;
        }
      } else {
        rgba = await readGeoTiffRgbWindow(grid.path, left, top, winWidth, winHeight);
        // Byte RGB carries no separate no-data channel unless the file embeds
        // a real mask (which `readGeoTiffRgbWindow` preserves as a non-255
        // alpha already); a pixel that is BOTH fully opaque and exactly black
        // is the declared 0 sentinel (Viking).
        for (let i = 0; i < rgba.length; i += 4) {
          if (rgba[i] === 0 && rgba[i + 1] === 0 && rgba[i + 2] === 0 && rgba[i + 3] === 255) {
            rgba[i + 3] = 0;
          }
        }
      }

      return sharp(rgba, { raw: { width: winWidth, height: winHeight, channels: 4 } })
        .resize(widthPx, heightPx, { fit: 'fill' })
        .raw()
        .toBuffer();
    },
  };
}
