/**
 * The exact bake: `rasterizeCharts` at scale 1 lands every destination texel centre back on a
 * source texel centre, so this is a nearest copy — no blur, no round-trip loss beyond the JPEG
 * encode. The centre assertion is what proves that claim; a scale bug elsewhere would surface here
 * as a throw, not a silently soft atlas.
 */
import { rasterizeCharts } from './rasterizeCharts';
import type { AtlasImage } from '../@types/AtlasImage';
import type { ChartPlacement } from '../@types/ChartPlacement';
import type { PackedAtlas } from '../@types/PackedAtlas';

const TEXEL_CENTRE_EPS = 1e-6;

export function blitChartsExact(
  source: AtlasImage,
  packed: PackedAtlas,
  placements: readonly ChartPlacement[],
  destSizePx: number,
): { atlas: AtlasImage; claims: Int32Array } {
  const rgb = new Uint8Array(destSizePx * destSizePx * 3);
  const lastSrc = source.sizePx - 1;

  const claims = rasterizeCharts(packed, placements, destSizePx, (destIndex, srcXPx, srcYPx) => {
    if (
      Math.abs(srcXPx - Math.floor(srcXPx) - 0.5) > TEXEL_CENTRE_EPS ||
      Math.abs(srcYPx - Math.floor(srcYPx) - 0.5) > TEXEL_CENTRE_EPS
    ) {
      throw new Error(
        `blitChartsExact: source coordinate (${srcXPx}, ${srcYPx}) is not a texel centre`,
      );
    }

    const sx = Math.min(lastSrc, Math.max(0, Math.floor(srcXPx)));
    const sy = Math.min(lastSrc, Math.max(0, Math.floor(srcYPx)));
    const srcOffset = (sy * source.sizePx + sx) * 3;
    const destOffset = destIndex * 3;
    rgb[destOffset] = source.rgb[srcOffset]!;
    rgb[destOffset + 1] = source.rgb[srcOffset + 1]!;
    rgb[destOffset + 2] = source.rgb[srcOffset + 2]!;
  });

  return { atlas: { sizePx: destSizePx, rgb }, claims };
}
