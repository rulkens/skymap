/**
 * The 2K (and any scale < 1) bake: `shrunk` is the source pre-shrunk by sharp, so a source texel
 * coordinate from `rasterizeCharts` must be re-scaled via `shrunk.sizePx / sourceSizePx` before
 * sampling — the one place a dropped ratio would silently shift the whole atlas.
 */
import { rasterizeCharts } from './rasterizeCharts';
import type { AtlasImage } from '../@types/AtlasImage';
import type { ChartPlacement } from '../@types/ChartPlacement';
import type { PackedAtlas } from '../@types/PackedAtlas';

function sampleBilinear(image: AtlasImage, xPx: number, yPx: number): [number, number, number] {
  const last = image.sizePx - 1;
  const fx = xPx - 0.5;
  const fy = yPx - 0.5;
  const x0 = Math.min(Math.max(Math.floor(fx), 0), last);
  const y0 = Math.min(Math.max(Math.floor(fy), 0), last);
  const x1 = Math.min(x0 + 1, last);
  const y1 = Math.min(y0 + 1, last);
  const tx = fx - Math.floor(fx);
  const ty = fy - Math.floor(fy);

  const at = (x: number, y: number, c: number): number =>
    image.rgb[(y * image.sizePx + x) * 3 + c]!;
  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

  const out: [number, number, number] = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const top = lerp(at(x0, y0, c), at(x1, y0, c), tx);
    const bottom = lerp(at(x0, y1, c), at(x1, y1, c), tx);
    out[c] = lerp(top, bottom, ty);
  }
  return out;
}

export function resampleCharts(
  shrunk: AtlasImage,
  sourceSizePx: number,
  packed: PackedAtlas,
  placements: readonly ChartPlacement[],
  destSizePx: number,
): { atlas: AtlasImage; claims: Int32Array } {
  const ratio = shrunk.sizePx / sourceSizePx;
  const rgb = new Uint8Array(destSizePx * destSizePx * 3);

  const claims = rasterizeCharts(packed, placements, destSizePx, (destIndex, srcXPx, srcYPx) => {
    const [r, g, b] = sampleBilinear(shrunk, srcXPx * ratio, srcYPx * ratio);
    const destOffset = destIndex * 3;
    rgb[destOffset] = Math.round(r);
    rgb[destOffset + 1] = Math.round(g);
    rgb[destOffset + 2] = Math.round(b);
  });

  return { atlas: { sizePx: destSizePx, rgb }, claims };
}
