/**
 * Format the knobs a DebugPanel Milky-Way tuning session moved as paste-ready
 * `MilkyWayTuning` object-literal lines, for promoting a tuned session to
 * `MILKY_WAY_TUNING_DEFAULTS` in `milkyWayCalibration.ts`.
 *
 * Emits ONLY the keys whose value differs from `defaults` — never the whole
 * object. That constant carries a multi-line explanatory comment above every
 * key; pasting a complete literal over it would delete all of that prose, the
 * most valuable content in the file. A tuning session typically moves two or
 * three knobs, so the changed-only form is a small hand-application that
 * leaves the surrounding comments untouched. An empty return means nothing
 * moved — honest feedback, not an error.
 *
 * Keys are walked via `Object.keys(defaults)`, so the emitted lines follow
 * `defaults`'s own property order regardless of how `tuning` happens to be
 * laid out in memory.
 *
 * Number rendering is load-bearing: the output must be a valid TS literal, so
 * every value goes through `String()`, never `toLocaleString()`. The display
 * formatter for the `starCount` slider row (`MILKY_WAY_SLIDER_FIELDS`) uses
 * `toLocaleString()` on purpose — "150,000" reads better in a UI — but that
 * same call here would emit `starCount: 150,000,`, which is a syntax error
 * once pasted into source. The two live one file apart; don't reach for the
 * display one here.
 */
import type { MilkyWayTuning } from '../../@types/settings/MilkyWayTuning';

export function formatMilkyWayTuningDefaults(
  tuning: MilkyWayTuning,
  defaults: MilkyWayTuning,
): string {
  const lines: string[] = [];
  for (const key of Object.keys(defaults) as (keyof MilkyWayTuning)[]) {
    if (tuning[key] !== defaults[key]) {
      lines.push(`  ${key}: ${String(tuning[key])},`);
    }
  }
  return lines.join('\n');
}
