/**
 * formatSpeedOfLight — the ship's speed as a fraction of light's: β to four places up to 0.999,
 * then how far short of light it is, 1 − β. That is taken as 1 / (γ² (1 + β)): at γ ~ 10⁷,
 * 1 − β is ~10⁻¹⁵ and the subtraction would read zero.
 */

import { formatPowerOfTen } from '../format/formatPowerOfTen';

export function formatSpeedOfLight(beta: number, gamma: number): string {
  if (beta <= 0.999) return `β = ${beta.toFixed(4)}`;
  return `1 − β = ${formatPowerOfTen(1 / (gamma * gamma * (1 + beta)), 2)}`;
}
