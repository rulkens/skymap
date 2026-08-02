// Reduces a 64x64 RGBA readback to a mean/max/lit-percentage summary for the
// headless smoke check "did anything render at all" — an unweighted RGB mean
// stands in for luminance since no perceptual weighting is needed for that
// question, and `> 4` separates genuinely lit texels from readback noise
// near black.

export function sampleLuminanceStats(texels: Uint8Array): {
  mean: number;
  max: number;
  litPct: number;
} {
  let s = 0;
  let m = 0;
  let nz = 0;
  const n = texels.length / 4;
  for (let i = 0; i < texels.length; i += 4) {
    const l = (texels[i]! + texels[i + 1]! + texels[i + 2]!) / 3;
    s += l;
    if (l > m) m = l;
    if (l > 4) nz++;
  }
  return {
    mean: +(s / n).toFixed(2),
    max: m,
    litPct: +((100 * nz) / n).toFixed(1),
  };
}
