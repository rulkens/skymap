/**
 * propagateToEpoch — move a row to another epoch by two-body motion: only M changes, by n·Δt with
 * n = k·a^−1.5 (k the Gaussian gravitational constant, rad/day, a in AU). The same model the app runs,
 * so a row moved here decodes to the position the runtime would have computed from its own epoch.
 */
import type { MpcorbRow } from '../@types/asteroids/MpcorbRow';

const GAUSS_K_RAD_PER_DAY = 0.01720209895;
const DEG_PER_RAD = 180 / Math.PI;

export function propagateToEpoch(row: MpcorbRow, epochJd: number): MpcorbRow {
  if (row.epochJd === epochJd) return row;
  const nDegPerDay = GAUSS_K_RAD_PER_DAY * row.aAu ** -1.5 * DEG_PER_RAD;
  const m = (row.meanAnomalyDeg + nDegPerDay * (epochJd - row.epochJd)) % 360;
  return { ...row, epochJd, meanAnomalyDeg: m < 0 ? m + 360 : m };
}
