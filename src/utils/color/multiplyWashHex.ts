const channels = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

/**
 * A pigment wash laid over paper, as a `#rrggbb`: the multiply blend at `strength`
 * (0 = bare paper, 1 = the full pigment multiplied in). Baked into SVGs, which
 * cannot read CSS blend modes or custom properties.
 */
export function multiplyWashHex(paper: string, pigment: string, strength: number): string {
  const p = channels(paper);
  const w = channels(pigment);
  return `#${p
    .map((c, i) => Math.round(c * (1 - strength + strength * w[i]!) * 255))
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`;
}
