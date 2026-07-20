/**
 * formatReport — render a `ScenarioReport` as the human-readable perf report:
 * hand-rolled ANSI-colored, ALIGNED tables plus a collapsed page-error summary.
 *
 * The report format is the harness's user-facing product, so it lives here as a
 * PURE function of the structured `ScenarioReport` rather than inline in the CDP
 * loop: that way the output shape is unit-testable without a browser or a GPU
 * (see `formatReport.test.ts`), and `measurePerf.ts` shrinks to "gather data →
 * print it". Numbers are fixed to one decimal — GPU timings past a tenth of a
 * millisecond are noise the medians already smooth over.
 *
 * ### Color is injected, not detected here
 *
 * A `Palette` (from `../cli/ansiPalette`) is passed in — the formatter never
 * touches `process`. The harness decides whether color is live (a real TTY,
 * `NO_COLOR` unset, not `--json`) and hands us the matching palette; with
 * `ansiPalette(false)` every colorizer is the identity, so the output is plain
 * (no escape bytes) but STILL aligned. That plain-but-aligned shape is exactly
 * what the tests assert, and it's what a pipe or a log file sees.
 *
 * ### Alignment
 *
 * The MERGED / PER-LAYER / FLOOR bodies are rendered through a private `table()`
 * that pads every column to its widest cell (labels left, numbers right), so a
 * column of medians lines up regardless of how long each slot name is. Each
 * table gets a header row and a `─`-rule beneath it.
 *
 * Sections per scenario:
 *   - TOTAL — the per-frame GPU pass time. The merged line is the
 *     production-shape number (median | p90 of per-frame sums) plus its implied
 *     fps ceiling (`1000 / median`, or `n/a` when the median is 0), colored by
 *     whether the median fits the 60fps budget; the per-layer line is the
 *     instrumented total, dimmed and labeled "not representative".
 *   - MERGED — one aligned row per render-step GROUP (`hdr·NEAR0`, …), the
 *     production pass shape, each `<slot> <median> <p90>`.
 *   - PER-LAYER — one aligned row per individual LAYER (`orbit-trails`, …) from
 *     the split run; each layer's cost still carries the fixed per-pass floor.
 *   - EST. PER-PASS FLOOR — emitted only for groups the harness could attribute
 *     (≥2 layers, hence a non-empty `floors`); each shows the estimated shared
 *     floor and every layer's floor-subtracted "real" cost. A single-layer
 *     scenario has no floor to separate, so this section is skipped entirely.
 *   - ⚠ page errors — a trailing summary that de-duplicates `report.pageErrors`
 *     to one line per unique message with its count; nothing when there are none.
 */

import type { ScenarioReport, LayerStat } from '../../perf/scenarioReport';
import type { Palette } from '../cli/ansiPalette';

const ms = (value: number): string => value.toFixed(1);

/** 60fps budget: a frame fits when its merged median GPU time is under this. */
const FRAME_BUDGET_MS = 16.7;
/** Beyond ~30fps the frame is clearly over budget — escalate to red. */
const HALF_BUDGET_MS = 33.3;
/** Keep collapsed page-error messages to one readable line. */
const MAX_ERROR_LEN = 160;

/**
 * table — pad a grid of string cells into aligned columns. Each column's width
 * is its widest cell; left-aligned columns `padEnd`, right-aligned (numbers)
 * `padStart`. Returns one joined string per row, all the same length, so a
 * caller can rule the header with `'─'.repeat(row.length)`.
 */
function table(rows: readonly (readonly string[])[], align: readonly ('left' | 'right')[]): string[] {
  const widths = align.map((_, c) => Math.max(0, ...rows.map((row) => (row[c] ?? '').length)));
  return rows.map((row) =>
    align
      .map((a, c) => (a === 'right' ? (row[c] ?? '').padStart(widths[c]!) : (row[c] ?? '').padEnd(widths[c]!)))
      .join('  '),
  );
}

export function formatReport(report: ScenarioReport, palette: Palette): string {
  const { scenario, viewport, dpr, frames } = report;
  const lines: string[] = [];

  lines.push(
    `${scenario}  ` +
      palette.dim(`(${viewport.width}×${viewport.height} @dpr${dpr}, ${frames} frames, median ms | p90)`),
  );

  const { merged: mergedTotal, perLayer: perLayerTotal } = report.totals;
  // fps is a GPU-bound ceiling from timed passes only — it excludes CPU/present/
  // vsync, so it is an upper bound, not a predicted frame rate. A 0 median
  // (degenerate/empty run) would make 1000/0 = Infinity; print `n/a` instead.
  const fps = mergedTotal.median === 0 ? 'n/a' : String(Math.round(1000 / mergedTotal.median));
  // Color the ceiling by budget: green fits 60fps, yellow slips, red is >30fps
  // worth of GPU time; a degenerate 0-median run is dimmed alongside its n/a.
  const fpsColor =
    mergedTotal.median === 0
      ? palette.dim
      : mergedTotal.median < FRAME_BUDGET_MS
        ? palette.green
        : mergedTotal.median < HALF_BUDGET_MS
          ? palette.yellow
          : palette.red;
  lines.push(
    `  ${palette.bold('TOTAL (merged, production)')}   ${ms(mergedTotal.median)} ms/frame | ${ms(mergedTotal.p90)} p90`,
  );
  lines.push(
    `    → ~${fpsColor(fps)} fps GPU-bound ceiling (timed passes only; excludes CPU/present/vsync)`,
  );
  lines.push(
    palette.dim(
      `  TOTAL (per-layer, instrumented — not representative)   ${ms(perLayerTotal.median)} ms/frame | ${ms(perLayerTotal.p90)} p90`,
    ),
  );

  pushTable(lines, palette, 'MERGED (production pass shape)', 'group', report.merged);
  pushTable(
    lines,
    palette,
    'PER-LAYER (attribution; each row includes ~FLOOR pass overhead)',
    'layer',
    report.perLayer,
  );

  for (const group of report.floors) {
    lines.push('  ' + palette.bold(`EST. PER-PASS FLOOR ≈ ${ms(group.floor)} ms  (${group.groupKey})`));
    for (const real of group.reals) {
      lines.push(`    → ${real.slot} ≈ ${ms(real.real)} ms real`);
    }
  }

  // Page errors are collected during the run, not warned inline, so the report
  // can collapse a storm of identical messages into one counted line each.
  if (report.pageErrors.length > 0) {
    const counts = new Map<string, number>();
    for (const message of report.pageErrors) counts.set(message, (counts.get(message) ?? 0) + 1);
    for (const [message, count] of counts) {
      const oneLine = message.replace(/\s+/g, ' ');
      const shown = oneLine.length > MAX_ERROR_LEN ? oneLine.slice(0, MAX_ERROR_LEN - 1) + '…' : oneLine;
      lines.push('  ' + palette.yellow(`⚠ ${count} page error(s): ${shown}`));
    }
  }

  return lines.join('\n');
}

/**
 * pushTable — render one `<label> <median> <p90>` section: a bold title, an
 * aligned header + `─`-rule, then a padded row per stat. The three columns
 * (label left, two numbers right) keep the medians in a straight line no matter
 * how the slot names vary in length.
 */
function pushTable(
  lines: string[],
  palette: Palette,
  title: string,
  labelHeader: string,
  stats: readonly LayerStat[],
): void {
  lines.push('  ' + palette.bold(title));
  const header: readonly string[] = [labelHeader, 'median', 'p90'];
  const rows = [header, ...stats.map((stat) => [stat.slot, ms(stat.median), ms(stat.p90)])];
  const formatted = table(rows, ['left', 'right', 'right']);
  const headerLine = formatted[0]!;
  lines.push('    ' + headerLine);
  lines.push('    ' + '─'.repeat(headerLine.length));
  for (let i = 1; i < formatted.length; i++) lines.push('    ' + formatted[i]!);
}
