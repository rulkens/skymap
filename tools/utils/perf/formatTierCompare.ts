/**
 * formatTierCompare — render a `TierCompareReport` as the human-readable
 * tier-comparison table: one row per merged pass showing its median ms at each
 * catalog tier (`small`/`medium`/`large`), a bold whole-frame TOTAL row, and the
 * shared ⚠ page-error summary.
 *
 * Like `formatReport` and `formatSweep`, this is a PURE function of the
 * structured report and an injected `Palette` — it never touches `process`, so
 * the harness decides whether colour is live and the same function renders
 * coloured output to a terminal and plain-but-aligned output to a pipe or a
 * test. That plain-but-aligned shape (with `ansiPalette(false)`: no escape
 * bytes, columns still lined up) is exactly what `formatTierCompare.test.ts`
 * asserts.
 *
 * ### Reading the table
 *
 * The per-tier medians grow left→right as the tier loads more galaxies; a pass
 * that goes green→red as the tier climbs is exactly the "this pass is what makes
 * the big tier expensive" signal. Each per-tier ms cell is HEAT-colored PER CELL
 * (not per row) by `heatColor`, because each tier is its own measurement. A
 * `null` cell — the pass produced no samples at that tier (a source excluded
 * from `small`) — renders as `—`, kept uncoloured (there is no ms to classify).
 * Rows are SORTED by their max non-null per-tier median descending, so the pass
 * that dominates the heaviest tier is the first thing the eye lands on.
 *
 * ### Alignment (why colorize AFTER padding)
 *
 * The numeric columns are padded through a private `table()` aligner that
 * returns the PADDED CELLS (the same approach `formatSweep` uses; kept private
 * here since the column shapes differ). Cells are padded FIRST, then the heat
 * colorizer wraps each padded ms cell — an ANSI escape counts toward `.length`,
 * so colorizing before padding would corrupt the width math.
 */

import type { TierCompareReport, TierComparePass } from '../../perf/tierCompareReport';
import type { Palette } from '../cli/ansiPalette';
import { formatPageErrors } from './formatPageErrors';
import { heatColor } from './heatColor';

const ms = (value: number): string => value.toFixed(1);
/** A tier where the pass produced no samples — an em dash, never a false 0.0. */
const NULL_CELL = '—';
const cell = (value: number | null): string => (value === null ? NULL_CELL : ms(value));

/**
 * table — pad a grid of string cells into aligned columns and return the PADDED
 * CELLS (not pre-joined rows): each column's width is its widest cell,
 * left-aligned columns `padEnd`, right-aligned (numbers) `padStart`. Returning
 * cells lets the caller heat-colorize an individual padded ms cell before
 * joining, without the escape bytes disturbing column widths. Callers join a row
 * with `'  '`; every joined row is the same length.
 */
function table(
  rows: readonly (readonly string[])[],
  align: readonly ('left' | 'right')[],
): string[][] {
  const widths = align.map((_, c) => Math.max(0, ...rows.map((row) => (row[c] ?? '').length)));
  return rows.map((row) =>
    align.map((a, c) =>
      a === 'right' ? (row[c] ?? '').padStart(widths[c]!) : (row[c] ?? '').padEnd(widths[c]!),
    ),
  );
}

/** The largest non-null per-tier median — the sort key (−∞ if a pass is all-null). */
function maxNonNull(pass: TierComparePass): number {
  return pass.perTierMs.reduce<number>(
    (max, value) => (value !== null && value > max ? value : max),
    Number.NEGATIVE_INFINITY,
  );
}

export function formatTierCompare(report: TierCompareReport, palette: Palette): string {
  const { scenario, viewport, dpr, frames, tiers } = report;
  const lines: string[] = [];

  lines.push(
    `${scenario}  ${palette.bold('tier compare')}  ` +
      palette.dim(`(${viewport.width}×${viewport.height} @dpr${dpr}, ${frames} frames, median ms)`),
  );

  // Rows sorted by the pass's heaviest tier — the dominant cost reads first.
  const sorted = [...report.passes].sort((a, b) => maxNonNull(b) - maxNonNull(a));

  const gridRows: string[][] = [['pass', ...tiers]];
  for (const pass of sorted) gridRows.push([pass.slot, ...pass.perTierMs.map(cell)]);
  gridRows.push(['TOTAL', ...report.total.perTierMs.map((v) => ms(v))]);

  const align: ('left' | 'right')[] = ['left', ...tiers.map(() => 'right' as const)];
  const grid = table(gridRows, align);
  const tierCount = tiers.length;

  const headerLine = `  ${grid[0]!.join('  ')}`;
  lines.push(headerLine);
  lines.push('  ' + '─'.repeat(headerLine.length - 2));

  // One row per pass: each per-tier ms cell heat-colored by that tier's own
  // median (per cell); a null `—` cell stays plain (no ms to classify).
  for (let i = 0; i < sorted.length; i++) {
    const pass = sorted[i]!;
    const row = grid[i + 1]!.map((padded, c) => {
      if (c < 1 || c > tierCount) return padded;
      // `?? null` collapses the (unreachable, in-bounds) undefined into the
      // same null the printer treats as "no ms to classify" → plain cell.
      const value = pass.perTierMs[c - 1] ?? null;
      return value === null ? padded : heatColor(value, palette)(padded);
    });
    lines.push(`  ${row.join('  ')}`);
  }

  // Bold TOTAL row (last grid entry), heat per cell like the pass rows.
  const totalIdx = grid.length - 1;
  const totalRow = grid[totalIdx]!.map((padded, c) =>
    c >= 1 && c <= tierCount ? heatColor(report.total.perTierMs[c - 1]!, palette)(padded) : padded,
  );
  lines.push(`  ${palette.bold(totalRow.join('  '))}`);

  lines.push(...formatPageErrors(report.pageErrors, palette));

  return lines.join('\n');
}
