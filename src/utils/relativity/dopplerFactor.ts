/**
 * dopplerFactor — relativistic Doppler factor D = ν_seen / ν_emitted for a source seen at angle θ
 * from the direction of travel: D = 1 / (γ (1 − β cos θ)). Ahead D = γ(1 + β), behind γ(1 − β).
 */

export function dopplerFactor(cosTheta: number, beta: number, gamma: number): number {
  return 1 / (gamma * (1 - beta * cosTheta));
}
