/**
 * emissiveMatte — straight-alpha RGBA for light that adds to whatever is behind
 * it (points, lines, glowing volumes), from its frame on black (RGBA buffer).
 * Such light hides nothing, so a black/white pair reads it as empty; on black
 * the frame already is its premultiplied colour, so alpha = the brightest
 * channel and colour = frame ÷ alpha. Laid OVER a dark ground it matches the
 * app's additive look; `mix-blend-mode: plus-lighter` on the black frame
 * itself is the exact sum.
 */
export function emissiveMatte(black: Uint8Array): Uint8Array {
  const out = new Uint8Array(black.length);
  for (let i = 0; i < black.length; i += 4) {
    const peak = Math.max(black[i]!, black[i + 1]!, black[i + 2]!);
    out[i + 3] = peak;
    if (peak === 0) continue;
    for (let c = 0; c < 3; c++) out[i + c] = Math.round((255 * black[i + c]!) / peak);
  }
  return out;
}
