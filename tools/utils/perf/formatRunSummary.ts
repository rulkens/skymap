/**
 * formatRunSummary — the end-of-run cross-scenario roll-up: one aligned row per
 * measured scenario (merged median ms | implied fps ceiling | budget verdict)
 * plus one row per scenario that FAILED to measure, so a multi-scenario run ends
 * with a single scannable verdict table instead of the reader scrolling back
 * through every per-scenario block.
 *
 * Like the other perf printers this is a PURE function of its inputs and an
 * injected `Palette` — it never touches `process`, so the harness decides
 * whether colour is live and the same function renders coloured output to a
 * terminal and plain-but-aligned output to a pipe or a test.
 *
 * ### Why failed scenarios get a row
 *
 * The harness isolates each scenario (a page crash on one vantage shouldn't
 * abort the run), collecting the names it couldn't measure. A roll-up that
 * silently omitted them would read as "all scenarios measured, all fine" — the
 * most dangerous possible misread. So each failure gets an explicit `✗ failed`
 * row, in the run's scenario order alongside the successes.
 *
 * ### Order + alignment
 *
 * Rows are rendered in the order given (the user's `--scenario` order), NOT
 * re-sorted — the roll-up mirrors the sequence the per-scenario blocks printed
 * in. Cells are padded through a private `table()` (padded-cells approach shared
 * in spirit with `formatReport`); only the verdict cell is colorized, and only
 * AFTER padding, so the tone escape never disturbs the numeric columns' widths.
 * With `ansiPalette(false)` the output is plain but still aligned.
 */

import type { ScenarioReport } from '../../perf/scenarioReport';
import type { Palette } from '../cli/ansiPalette';
import { budgetTone } from './budgetTone';

const ms = (value: number): string => value.toFixed(1);

/**
 * table — pad a grid of string cells into aligned columns and return the PADDED
 * CELLS. Each column's width is its widest cell; left-aligned columns `padEnd`,
 * right-aligned (numbers) `padStart`. Returning cells lets the caller colorize
 * one padded cell before joining without the escape bytes disturbing widths.
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

/** One row's plain cells plus the colorizer for its (only colored) verdict cell. */
type Row = { cells: string[]; verdictColor: (text: string) => string };

/** Build a measured-scenario row: total, fps ceiling, and a budget verdict. */
function reportRow(report: ScenarioReport, palette: Palette): Row {
  const median = report.totals.merged.median;
  if (median === 0) {
    return {
      cells: [report.scenario, ms(median), 'n/a', '— empty'],
      verdictColor: palette.dim,
    };
  }
  const fps = String(Math.round(1000 / median));
  const tone = budgetTone(median);
  const verdict = tone === 'green' ? '✓ 60fps' : tone === 'yellow' ? '⚠ 30–60fps' : '✗ <30fps';
  return { cells: [report.scenario, ms(median), fps, verdict], verdictColor: palette[tone] };
}

export function formatRunSummary(
  reports: readonly ScenarioReport[],
  failed: readonly string[],
  palette: Palette,
): string {
  // Nothing measured and nothing failed → nothing to say. (A single-scenario run
  // suppresses the roll-up upstream; this guard covers the truly-empty case.)
  if (reports.length === 0 && failed.length === 0) return '';

  const header: readonly string[] = ['scenario', 'total', 'fps', 'verdict'];
  const dataRows: Row[] = [
    ...reports.map((report) => reportRow(report, palette)),
    // A failed scenario has no numbers to show — em-dashes, then a red verdict.
    ...failed.map((name) => ({
      cells: [name, '—', '—', '✗ failed'],
      verdictColor: palette.red,
    })),
  ];

  const cells = table(
    [header, ...dataRows.map((row) => row.cells)],
    ['left', 'right', 'right', 'left'],
  );

  const lines: string[] = [];
  lines.push('  ALL SCENARIOS (merged median ms | fps ceiling)');
  const headerLine = cells[0]!.join('  ');
  lines.push('    ' + headerLine);
  lines.push('    ' + '─'.repeat(headerLine.length));
  for (let i = 1; i < cells.length; i++) {
    const { verdictColor } = dataRows[i - 1]!;
    const row = [...cells[i]!];
    // Colorize ONLY the padded verdict cell (last column).
    row[3] = verdictColor(row[3]!);
    lines.push('    ' + row.join('  '));
  }

  return lines.join('\n');
}
