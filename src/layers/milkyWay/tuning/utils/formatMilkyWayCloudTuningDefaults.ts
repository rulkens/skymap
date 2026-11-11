/**
 * Format the knobs a DebugPanel Milky-Way tuning session moved as paste-ready
 * `MilkyWayCloudTuning` object-literal lines, for promoting a tuned session into
 * `MILKY_WAY_CLOUD_TUNING_DEFAULTS` in `milkyWayCalibration.ts`.
 *
 * Emits ONLY the changed keys — that constant carries an explanatory comment
 * above every key, and a full literal would paste over all of it. `String()`,
 * never `toLocaleString()`: the output must be a valid TS literal, and
 * `MILKY_WAY_CLOUD_SLIDER_FIELDS`'s display formatter emits `150,000` — a syntax
 * error once pasted.
 */
import type { MilkyWayCloudTuning } from '../../../../@types/settings/MilkyWayCloudTuning';

export function formatMilkyWayCloudTuningDefaults(
  tuning: MilkyWayCloudTuning,
  defaults: MilkyWayCloudTuning,
): string {
  const lines: string[] = [];
  for (const key of Object.keys(defaults) as (keyof MilkyWayCloudTuning)[]) {
    if (tuning[key] !== defaults[key]) {
      lines.push(`  ${key}: ${String(tuning[key])},`);
    }
  }
  return lines.join('\n');
}
