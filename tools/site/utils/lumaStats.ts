import type { LumaStats } from '../@types/LumaStats';

/** Mean and 5th/95th percentile of 8-bit grey pixels, as shares of white. */
export function lumaStats(grey: Uint8Array): LumaStats {
  const counts = new Uint32Array(256);
  let sum = 0;
  for (const value of grey) {
    counts[value] = counts[value]! + 1;
    sum += value;
  }
  const percentile = (share: number) => {
    const rank = share * (grey.length - 1);
    let seen = 0;
    for (let value = 0; value < 256; value++) {
      seen += counts[value]!;
      if (seen > rank) return value / 255;
    }
    return 1;
  };
  return { mean: sum / grey.length / 255, p5: percentile(0.05), p95: percentile(0.95) };
}
