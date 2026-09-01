/**
 * matchEoxSeaColour — recolours EOX's real Sentinel-2 water toward BMNG's
 * synthetic bathymetry blue at bake time, so the z7→z8 band transition (BMNG
 * below, EOX above) doesn't jump hard over open water. Land is untouched: the
 * water score is 0 wherever blue doesn't dominate both other channels, which
 * a per-pixel score alone can't tell from noisy dark water — see the blurred
 * mask below. Constants fitted 2026-09-01 from BMNG z7 tile 68/12 NW quadrant
 * vs EOX-derived z8 tile 136/24 (water = BMNG pixels with b>r+30 && b>80).
 */

import sharp from 'sharp';

const EOX_SEA_MEAN = [17.9, 48.5, 82.0] as const;
const EOX_SEA_STD = [8.1, 20.9, 42.7] as const;
const BMNG_SEA_MEAN = [26.8, 70.4, 126.4] as const;

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export async function matchEoxSeaColour(
  rgba: Uint8Array,
  widthPx: number,
  heightPx: number,
): Promise<Uint8Array> {
  // The water mask is read from a BLURRED copy, not the sharp original: a
  // per-pixel mask mottles on noisy dark water (waves, JPEG blocking) since
  // individual dark-blue texels dip in and out of the blue/dark thresholds.
  const blurred = await sharp(Buffer.from(rgba), {
    raw: { width: widthPx, height: heightPx, channels: 4 },
  })
    .blur(6)
    .raw()
    .toBuffer();

  const out = new Uint8Array(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const br = blurred[i]!;
    const bg = blurred[i + 1]!;
    const bb = blurred[i + 2]!;
    const luma = 0.299 * br + 0.587 * bg + 0.114 * bb;
    // Relative, not absolute, blue-dominance: dark water compresses all three
    // channels toward 0, so a fixed (bb - max(br,bg)) gap shrinks exactly
    // where the BMNG mismatch is largest. Dividing by brightness (floored at
    // 24 so near-black pixels don't blow up the ratio) scores near-black navy
    // fully — spike-checked against Everest shadow / Hong Kong / New York
    // urban darks, which still score 0.
    const rel = (bb - Math.max(br, bg)) / Math.max(bb, 24);
    const blueness = clamp01((rel - 0.08) / 0.18);
    const darkness = clamp01((110 - luma) / 50);
    const score = blueness * darkness;

    for (let c = 0; c < 3; c++) {
      const x = rgba[i + c]!;
      const gain = Math.min(1.0, 12 / Math.max(EOX_SEA_STD[c]!, 4));
      const target = (x - EOX_SEA_MEAN[c]!) * gain + BMNG_SEA_MEAN[c]!;
      out[i + c] = Math.max(0, Math.min(255, Math.round(x * (1 - score) + target * score)));
    }
    out[i + 3] = rgba[i + 3]!;
  }

  return out;
}
