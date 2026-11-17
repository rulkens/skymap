// A frame with no background pixel cannot be matted: its brightest black/white gap is the subject's own.
const MIN_BACKGROUND_GAP = 16;

/**
 * differenceMatte — the subject's straight-alpha RGBA from the same frame drawn
 * on black and on white (equal-length RGBA buffers). Where the backgrounds differ
 * by the full gap the pixel is empty; where they agree it is opaque, so
 * alpha = 1 − (W − B) / (bgW − bgB), and colour un-mixes the black ground:
 * (B − (1 − alpha)·bgB) / alpha. The ground colours are read off the pixel with
 * the widest gap, so no corner has to be empty and no tone curve has to be known.
 */
export function differenceMatte(black: Uint8Array, white: Uint8Array): Uint8Array {
  if (black.length !== white.length) throw new Error('differenceMatte: frames differ in size');
  let ground = 0;
  let widest = -1;
  for (let i = 0; i < black.length; i += 4) {
    const gap =
      white[i]! + white[i + 1]! + white[i + 2]! - black[i]! - black[i + 1]! - black[i + 2]!;
    if (gap > widest) [widest, ground] = [gap, i];
  }
  const bgB = [black[ground]!, black[ground + 1]!, black[ground + 2]!];
  const span = [0, 1, 2].map((c) => white[ground + c]! - bgB[c]!);
  if (Math.min(...span) < MIN_BACKGROUND_GAP) {
    throw new Error('differenceMatte: no background pixel; the subject fills the frame');
  }
  const out = new Uint8Array(black.length);
  for (let i = 0; i < black.length; i += 4) {
    let covered = 0;
    for (let c = 0; c < 3; c++) covered += (white[i + c]! - black[i + c]!) / span[c]!;
    const alpha = Math.min(1, Math.max(0, 1 - covered / 3));
    out[i + 3] = Math.round(alpha * 255);
    if (out[i + 3] === 0) continue;
    for (let c = 0; c < 3; c++) {
      const colour = (black[i + c]! - (1 - alpha) * bgB[c]!) / alpha;
      out[i + c] = Math.round(Math.min(255, Math.max(0, colour)));
    }
  }
  return out;
}
