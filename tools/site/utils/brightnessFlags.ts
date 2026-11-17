import type { LumaStats } from '../@types/LumaStats';

// Space is black, so only the subject's brightness (p95) is judged. Below this the brightest twentieth
// of the picture never reaches a fifth of white: on a dark page it reads as an empty black box.
const DARK_P95 = 0.2;
// The brightest twentieth sits at white: a lit surface has clipped and lost its detail.
const BURNT_P95 = 0.98;

/** TOO DARK and BURNT flags for a picture as displayed, naming the shot settings to ask for. */
export function brightnessFlags(luma: LumaStats): string[] {
  const p95 = Math.round(luma.p95 * 100);
  if (luma.p95 < DARK_P95)
    return [
      `TOO DARK: the brightest 5% reaches only ${p95}% of white; ask for a higher \`exposure\` (or \`ambient\` for a body in shadow)`,
    ];
  if (luma.p95 >= BURNT_P95)
    return [`BURNT: 5% or more of the picture is clipped at white; ask for a lower \`exposure\``];
  return [];
}
