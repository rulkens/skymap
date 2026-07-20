/**
 * formatSweep — render a `SweepReport` as the human-readable sweep table: one
 * row per timed pass showing its median ms at each viewport scale, the fitted
 * log-log exponent, and the bound label, plus a bold whole-frame TOTAL row and
 * the shared ⚠ page-error summary.
 *
 * Like `formatReport`, this is a PURE function of the structured report and an
 * injected `Palette` — it never touches `process`, so the harness decides
 * whether colour is live and the same function renders coloured output to a
 * terminal and plain-but-aligned output to a pipe or a test. That plain-but-
 * aligned shape (with `ansiPalette(false)`: no escape bytes, columns still lined
 * up) is exactly what `formatSweep.test.ts` asserts.
 *
 * ### Reading the table
 *
 * The per-scale medians grow left→right as the viewport (hence pixel count)
 * grows; a pass whose numbers roughly quadruple as area quadruples is
 * fill-bound, one whose numbers barely move is resolution-independent. The
 * `exp` column is the honest quantity behind the label — the slope of ms vs
 * pixels in log-log space (see scalingExponent). The label is coloured by
 * severity: red fill-bound (the passes worth optimising for resolution), yellow
 * mixed, dim vertex/CPU-bound and n/a.
 *
 * ### Alignment
 *
 * The numeric columns are padded through a private `table()` aligner (the same
 * approach `formatReport` uses; kept private here per the brief rather than
 * shared, since the column shapes differ). The label is appended AFTER the
 * aligned block and coloured, so its variable-length colour escapes never
 * disturb the numeric columns' alignment.
 */

import type { SweepReport } from '../../perf/sweepReport';
import type { Palette } from '../cli/ansiPalette';
import { formatPageErrors } from './formatPageErrors';

const ms = (value: number): string => value.toFixed(1);
const exp = (value: number): string => (Number.isNaN(value) ? 'n/a' : value.toFixed(2));

/**
 * table — pad a grid of string cells into aligned columns: each column's width
 * is its widest cell, left-aligned columns `padEnd`, right-aligned (numbers)
 * `padStart`. Returns one joined string per row, all the same length.
 */
function table(rows: readonly (readonly string[])[], align: readonly ('left' | 'right')[]): string[] {
  const widths = align.map((_, c) => Math.max(0, ...rows.map((row) => (row[c] ?? '').length)));
  return rows.map((row) =>
    align
      .map((a, c) => (a === 'right' ? (row[c] ?? '').padStart(widths[c]!) : (row[c] ?? '').padEnd(widths[c]!)))
      .join('  '),
  );
}

/** Colour a bound label by severity — fill-bound is the one worth acting on. */
function labelColorizer(palette: Palette): (label: string) => string {
  return (label: string) =>
    label === 'fragment/fill-bound'
      ? palette.red(label)
      : label === 'mixed'
        ? palette.yellow(label)
        : palette.dim(label);
}

export function formatSweep(report: SweepReport, palette: Palette): string {
  const { scenario, dpr, frames, scales } = report;
  const lines: string[] = [];
  const colorLabel = labelColorizer(palette);

  lines.push(`${scenario}  ${palette.bold('sweep')}  dpr${dpr} · ${frames} frames`);
  lines.push(
    palette.dim('  ' + scales.map((sc) => `${sc.width}×${sc.height} (${sc.pixels}px)`).join('  ')),
  );

  // Numeric grid: label + one ms column per scale + the exponent. The bound
  // label rides alongside (colored) but OUTSIDE the aligner — see module header.
  const scaleHeaders = scales.map((sc) => `${sc.scale}×`);
  const gridRows: string[][] = [['pass', ...scaleHeaders, 'exp']];
  const rowLabels: string[] = ['label'];
  for (const pass of report.passes) {
    gridRows.push([pass.slot, ...pass.perScaleMs.map(ms), exp(pass.exponent)]);
    rowLabels.push(pass.label);
  }
  gridRows.push(['TOTAL', ...report.total.perScaleMs.map(ms), exp(report.total.exponent)]);
  rowLabels.push(report.total.label);

  const align: ('left' | 'right')[] = ['left', ...scales.map(() => 'right' as const), 'right'];
  const grid = table(gridRows, align);

  // Header + rule (label header is plain — nothing to classify).
  const headerLine = `  ${grid[0]!}  ${rowLabels[0]!}`;
  lines.push(headerLine);
  lines.push('  ' + '─'.repeat(headerLine.length - 2));

  // One row per pass, then the bold TOTAL row (last grid entry).
  for (let i = 0; i < report.passes.length; i++) {
    lines.push(`  ${grid[i + 1]!}  ${colorLabel(rowLabels[i + 1]!)}`);
  }
  const totalIdx = grid.length - 1;
  lines.push(`  ${palette.bold(grid[totalIdx]!)}  ${colorLabel(rowLabels[totalIdx]!)}`);

  lines.push(...formatPageErrors(report.pageErrors, palette));

  return lines.join('\n');
}
