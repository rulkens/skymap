/**
 * Format a live `ZoneOfAvoidanceTuning` as a paste-ready object-literal body
 * for `DEFAULT_ZONE_OF_AVOIDANCE_TUNING` in `defaults.ts`.
 *
 * Emits the WHOLE cluster (unlike `formatMilkyWayTuningDefaults`'s diff) —
 * few enough knobs that a full literal beats a partial diff. Rounds to 4
 * decimals so colour-picker floats' long tails stay readable once pasted.
 *
 * Walks `DEFAULT_ZONE_OF_AVOIDANCE_TUNING`'s own keys, not the passed
 * object's: the call site hands in a `ZoneOfAvoidanceSettings` (a superset
 * adding `enabled`, which TS accepts since it still satisfies the narrower
 * `ZoneOfAvoidanceTuning` param type), and walking its keys would leak an
 * `enabled: 1,` line the destination literal has no place for.
 */
import type { ZoneOfAvoidanceTuning } from '../../@types/settings/ZoneOfAvoidanceTuning';
import type { Vec3 } from '../../@types/math/Vec3';
import { DEFAULT_ZONE_OF_AVOIDANCE_TUNING } from '../../data/defaults';

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
  for (const key of Object.keys(
    DEFAULT_ZONE_OF_AVOIDANCE_TUNING,
  ) as (keyof ZoneOfAvoidanceTuning)[]) {
    const value = tuning[key];
    lines.push(`  ${key}: ${Array.isArray(value) ? formatVec3(value) : String(round(value))},`);
  }
  return lines.join('\n');
}
