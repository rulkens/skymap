/**
 * matchEoxSeaColour — recolours EOX's real Sentinel-2 water toward BMNG's
 * synthetic bathymetry blue at bake time, so the z7→z8 band transition (BMNG
 * below, EOX above) doesn't jump hard over open water. The water decision
 * comes from BMNG's own land/water mask, so both bands agree on what is sea;
 * only within a couple of mask pixels (~2-4 km) of its coastline, where the
 * mask is too coarse for z13, does a local darkness test decide per pixel.
 * Constants fitted 2026-09-13 on 2025 raw z13 pixels ±2 mask px from any land,
 * equal-weighted over sjaelland / great-barrier-reef / new-york.
 */

import sharp from 'sharp';

import type { LonLatBounds } from '../../src/@types/scene/LonLatBounds';
import type { GreyRaster } from '../utils/image/GreyRaster';

const EOX_SEA_MEAN = [8.3, 22.9, 27.9] as const;
const BMNG_SEA_MEAN = [26.8, 70.4, 126.4] as const;

/** Mask cells either side of a pixel's own that must agree before the mask
 *  alone is trusted — the mask's coastline is ~1-2 km off at z13. */
const COAST_REACH_CELLS = 2;

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Water is locally darker AND no greener than it is blue: weighting
 *  blue-minus-green in keeps dark forest out and bright tropical lagoons in.
 *  Swept on raw 2025 tiles of 13 regions: ≥98% of mask water (bar the
 *  muddy Río de la Plata, 0%), ≤3% of mask land (bar Hong Kong, 9%). */
function coastalWaterScore(px: Uint8Array, i: number): number {
  const r = px[i]!;
  const g = px[i + 1]!;
  const b = px[i + 2]!;
  return clamp01((50 - (0.299 * r + 0.587 * g + 0.114 * b - 2 * (b - g))) / 20);
}

/** Water fraction (0..1) of mask cell `(cx, cy)` if every cell within
 *  `COAST_REACH_CELLS` shares its value, else -1 (coastal). */
function uniformWaterFraction(mask: GreyRaster, cx: number, cy: number): number {
  const { data, width, height } = mask;
  let v = -1;
  for (let dy = -COAST_REACH_CELLS; dy <= COAST_REACH_CELLS; dy++) {
    const row = Math.min(height - 1, Math.max(0, cy + dy)) * width;
    for (let dx = -COAST_REACH_CELLS; dx <= COAST_REACH_CELLS; dx++) {
      const cell = data[row + ((((cx + dx) % width) + width) % width)]!;
      if (v === -1) v = cell;
      else if (cell !== v) return -1;
    }
  }
  return 1 - v / 255;
}

/** `rgba` is a WGS84 equirect raster spanning `box`, row 0 at its north edge;
 *  `waterMask` is a whole-globe equirect with land 255, water 0. */
export async function matchEoxSeaColour(
  rgba: Uint8Array,
  widthPx: number,
  heightPx: number,
  box: LonLatBounds,
  waterMask: GreyRaster,
): Promise<Uint8Array> {
  // The coastal test reads a BLURRED copy: per-pixel it mottles on noisy dark
  // water (waves, JPEG blocking) and on the dark texels of sunlit land.
  const blurred = await sharp(Buffer.from(rgba), {
    raw: { width: widthPx, height: heightPx, channels: 4 },
  })
    .blur(6)
    .raw()
    .toBuffer();

  // Mask-cell centres sit at half-cell offsets; `cell*` spans every cell a
  // bilinear lookup inside `box` can touch.
  const ppd = waterMask.width / 360;
  const cellX0 = Math.floor((box.west + 180) * ppd - 0.5);
  const cellY0 = Math.floor((90 - box.north) * ppd - 0.5);
  const cellsW = Math.floor((box.east + 180) * ppd - 0.5) - cellX0 + 2;
  const cellsH = Math.floor((90 - box.south) * ppd - 0.5) - cellY0 + 2;
  const cells = new Float32Array(cellsW * cellsH);
  for (let y = 0; y < cellsH; y++) {
    for (let x = 0; x < cellsW; x++) {
      cells[y * cellsW + x] = uniformWaterFraction(waterMask, cellX0 + x, cellY0 + y);
    }
  }

  const out = new Uint8Array(rgba.length);
  for (let py = 0; py < heightPx; py++) {
    const lat = box.north - ((py + 0.5) / heightPx) * (box.north - box.south);
    const fy = (90 - lat) * ppd - 0.5 - cellY0;
    const gy = Math.floor(fy);
    const ty = fy - gy;
    for (let px = 0; px < widthPx; px++) {
      const lon = box.west + ((px + 0.5) / widthPx) * (box.east - box.west);
      const fx = (lon + 180) * ppd - 0.5 - cellX0;
      const gx = Math.floor(fx);
      const tx = fx - gx;
      const i = (py * widthPx + px) * 4;

      // Bilinear over the four surrounding cells, where a coastal cell's
      // corner defers to the colour test: blending the two deciders instead
      // of switching per cell keeps the coastal band from staircasing
      // wherever EOX water is too bright or muddy for the colour test.
      let maskScore = 0;
      let maskWeight = 0;
      for (let k = 0; k < 4; k++) {
        const dx = k & 1;
        const dy = k >> 1;
        const weight = (dx ? tx : 1 - tx) * (dy ? ty : 1 - ty);
        const water = cells[(gy + dy) * cellsW + gx + dx]!;
        if (water < 0) continue;
        maskScore += weight * water;
        maskWeight += weight;
      }
      let score = maskScore;
      if (maskWeight < 1) {
        // The blurred score alone leaves a blur-wide dark rim of unrecoloured
        // water along every shore; the sharp score fills it in, but only
        // where the blur already sees water, so lone dark land texels stay.
        const blurScore = coastalWaterScore(blurred, i);
        const colourScore = blurScore > 0 ? Math.max(blurScore, coastalWaterScore(rgba, i)) : 0;
        score += (1 - maskWeight) * colourScore;
      }
      if (score === 0) {
        out.set(rgba.subarray(i, i + 4), i);
        continue;
      }

      for (let c = 0; c < 3; c++) {
        const shifted = rgba[i + c]! + (BMNG_SEA_MEAN[c]! - EOX_SEA_MEAN[c]!) * score;
        out[i + c] = Math.max(0, Math.min(255, Math.round(shifted)));
      }
      out[i + 3] = rgba[i + 3]!;
    }
  }

  return out;
}
