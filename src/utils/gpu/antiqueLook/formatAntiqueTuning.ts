/**
 * formatAntiqueTuning — the knobs a debug session moved, as paste-ready lines for
 * `ANTIQUE_TUNING_DEFAULTS`; empty when nothing moved, which disables the copy button.
 * `String()`, not the sliders' readouts: those carry units and would not paste.
 */

import type { AntiqueTuning } from '../../../@types/settings/AntiqueTuning';

export function formatAntiqueTuning(tuning: AntiqueTuning, defaults: AntiqueTuning): string {
  const lines: string[] = [];
  for (const key of Object.keys(defaults) as (keyof AntiqueTuning)[]) {
    if (key === 'rows') continue;
    const value = tuning[key];
    if (value !== defaults[key]) {
      lines.push(`  ${key}: ${typeof value === 'string' ? `'${value}'` : String(value)},`);
    }
  }
  const off = Object.entries(tuning.rows).filter(([, on]) => !on);
  if (off.length > 0) lines.push(`  rows off: ${off.map(([key]) => key).join(', ')}`);
  return lines.join('\n');
}
