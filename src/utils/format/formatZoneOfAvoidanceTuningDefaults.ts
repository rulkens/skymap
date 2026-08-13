/**
 * Format a live `ZoneOfAvoidanceTuning` as a paste-ready object-literal body
 * for `DEFAULT_ZONE_OF_AVOIDANCE_TUNING` in `defaults.ts`.
 *
 * Emits the WHOLE cluster (unlike `formatMilkyWayTuningDefaults`'s diff) —
 * few enough knobs that a full literal beats a partial diff, and the two
 * Vec3 colours need their own `[r, g, b]` rendering. Rounds to 4 decimals so
 * colour-picker floats' long tails stay readable once pasted.
 */
import type { ZoneOfAvoidanceTuning } from '../../@types/settings/ZoneOfAvoidanceTuning';
import type { Vec3 } from '../../@types/math/Vec3';

const DECIMALS = 4;

function round(n: number): number {
  const scale = 10 ** DECIMALS;
  return Math.round(n * scale) / scale;
}

function formatVec3(v: Readonly<Vec3>): string {
  return `[${v.map(round).join(', ')}]`;
}

export function formatZoneOfAvoidanceTuningDefaults(tuning: ZoneOfAvoidanceTuning): string {
  return [
    `  intensity: ${round(tuning.intensity)},`,
    `  radialFalloff: ${round(tuning.radialFalloff)},`,
    `  edgeSharpness: ${round(tuning.edgeSharpness)},`,
    `  color: ${formatVec3(tuning.color)},`,
    `  labelColor: ${formatVec3(tuning.labelColor)},`,
  ].join('\n');
}
