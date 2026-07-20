/**
 * formatPageErrors — collapse a run's raw page-error stream into the trailing
 * `⚠ <count> page error(s): <msg>` summary lines, one per unique message.
 *
 * Page errors are collected during a run rather than warned inline (a noisy page
 * would spam stderr and, in --json mode, risk leaking onto stdout), so the
 * printers get to collapse a storm of identical messages into one counted line
 * each. That summary now serves every report printer — `formatReport` (single
 * scenario), `formatSweep` (viewport sweep), and `formatTierCompare` (tier
 * comparison) — so per the "second use → consolidate" rule it lives here as one
 * shared, PURE helper rather than being copied into each. Colour is injected:
 * the caller hands in a `Palette`, so with
 * `ansiPalette(false)` the lines carry no escape bytes.
 *
 * Returns the lines (each already indented + yellow-wrapped) so a caller can
 * splice them onto its own line array; an empty input yields an empty array, so
 * a clean run adds nothing.
 */

import type { Palette } from '../cli/ansiPalette';

/** Keep collapsed page-error messages to one readable line. */
const MAX_ERROR_LEN = 160;

export function formatPageErrors(errors: readonly string[], palette: Palette): string[] {
  if (errors.length === 0) return [];
  const counts = new Map<string, number>();
  for (const message of errors) counts.set(message, (counts.get(message) ?? 0) + 1);
  const lines: string[] = [];
  for (const [message, count] of counts) {
    const oneLine = message.replace(/\s+/g, ' ');
    const shown =
      oneLine.length > MAX_ERROR_LEN ? oneLine.slice(0, MAX_ERROR_LEN - 1) + '…' : oneLine;
    lines.push('  ' + palette.yellow(`⚠ ${count} page error(s): ${shown}`));
  }
  return lines;
}
