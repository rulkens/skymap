/**
 * Format a live `ZoneOfAvoidanceTuning` as a paste-ready object-literal body
 * for `DEFAULT_ZONE_OF_AVOIDANCE_TUNING` in `defaults.ts`.
 *
 * Emits the WHOLE cluster (unlike `formatMilkyWayTuningDefaults`'s diff) —
 * few enough knobs that a full literal beats a partial diff. Rounds to 4
 * decimals so colour-picker floats' long tails stay readable once pasted.
 *
 * Walks the live object's own keys, like its Milky-Way sibling: a
 * hand-spelled key list would silently emit an incomplete literal the day a
 * knob is added, and the paste would drop that knob's tuned value.
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
  const lines: string[] = [];
  for (const key of Object.keys(tuning) as (keyof ZoneOfAvoidanceTuning)[]) {
    const value = tuning[key];
    lines.push(`  ${key}: ${Array.isArray(value) ? formatVec3(value) : String(round(value))},`);
  }
  return lines.join('\n');
}
