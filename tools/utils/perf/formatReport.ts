/**
 * formatReport — render a `ScenarioReport` as the human-readable perf report:
 * hand-rolled ANSI-colored, ALIGNED, HEAT-colored tables plus a per-scenario
 * SUMMARY verdict and a collapsed page-error summary.
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
 * ### Scannability: sorting, share bars, heat
 *
 * Each table body is SORTED by median descending, so the biggest cost is the
 * first thing the eye lands on. Every row carries an inline share bar + a `%` of
 * the SECTION's median sum (not the frame-total median, whose per-frame sums come
 * from different frames and wouldn't sum to ~100%), so a pass's slice of the
 * section is legible without arithmetic. Each row's `median`/`p90` cells are
 * HEAT-colored by `heatColor` (dim/green/yellow/red keyed on the median) — the
 * whole numeric row reads as one temperature. The SUMMARY block distils the run
 * to a one-line budget verdict + the hottest pass + a floor caveat.
 *
 * ### Alignment (why colorize AFTER padding)
 *
 * The MERGED / PER-LAYER bodies are rendered through a private `table()` that
 * pads every column to its widest cell (labels left, numbers right) and returns
 * the PADDED CELLS. Padding happens first; the caller then wraps individual
 * padded cells in colorizers before joining with two spaces. Doing it in that
 * order is essential: an ANSI escape inside a cell counts toward `.length`, so
 * colorizing before padding would corrupt every downstream column's width math.
 * The bar cell stays uncolored — it IS the magnitude channel already.
 *
 * Sections per scenario:
 *   - TOTAL — the per-frame GPU pass time. The merged line is the
 *     production-shape number (median | p90 of per-frame sums) plus its implied
 *     fps ceiling (`1000 / median`, or `n/a` when the median is 0), colored by
 *     the `budgetTone` verdict; the per-layer line is the instrumented total,
 *     dimmed and labeled "not representative".
 *   - MERGED — one aligned row per render-step GROUP (`hdr·NEAR0`, …), the
 *     production pass shape, each `<slot> <median> <p90> <share> <%>`.
 *   - PER-LAYER — one aligned row per individual LAYER (`orbit-trails`, …) from
 *     the split run; each layer's cost still carries the fixed per-pass floor.
 *   - EST. PER-PASS FLOOR — emitted only for groups the harness could attribute
 *     (≥2 layers, hence a non-empty `floors`); each shows the estimated shared
 *     floor and every layer's floor-subtracted "real" cost. A single-layer
 *     scenario has no floor to separate, so this section is skipped entirely.
 *   - SUMMARY — the at-a-glance verdict: budget line, hottest merged pass, floor
 *     caveat.
 *   - ⚠ page errors — a trailing summary that de-duplicates `report.pageErrors`
 *     to one line per unique message with its count; nothing when there are none.
 */

import type { ScenarioReport, LayerStat } from '../../perf/scenarioReport';
import type { Palette } from '../cli/ansiPalette';
import { formatPageErrors } from './formatPageErrors';
import { budgetTone } from './budgetTone';
import { heatColor } from './heatColor';
import { shareBar } from './shareBar';

const ms = (value: number): string => value.toFixed(1);

/** Width of each row's inline share bar. */
const SHARE_BAR_WIDTH = 15;

/**
 * table — pad a grid of string cells into aligned columns and return the PADDED
 * CELLS (not pre-joined lines). Each column's width is its widest cell;
 * left-aligned columns `padEnd`, right-aligned (numbers) `padStart`. Returning
 * cells rather than joined rows lets a caller wrap individual padded cells in
 * colorizers (heat) before joining, without the escape bytes corrupting the
 * width math. Callers join a row with `'  '`; every joined row is the same
 * length, so the header can be ruled with `'─'.repeat(row.length)`.
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

export function formatReport(report: ScenarioReport, palette: Palette): string {
  const { scenario, viewport, dpr, frames, tier } = report;
  const lines: string[] = [];

  lines.push(
    `${scenario}  ` +
      palette.dim(
        `(${viewport.width}×${viewport.height} @dpr${dpr}, tier ${tier}, ${frames} frames, median ms | p90)`,
      ),
  );

  const { merged: mergedTotal, perLayer: perLayerTotal } = report.totals;
  // fps is a GPU-bound ceiling from timed passes only — it excludes CPU/present/
  // vsync, so it is an upper bound, not a predicted frame rate. A 0 median
  // (degenerate/empty run) would make 1000/0 = Infinity; print `n/a` instead.
  const fps = mergedTotal.median === 0 ? 'n/a' : String(Math.round(1000 / mergedTotal.median));
  // Color the ceiling by the shared per-frame budget verdict; a degenerate
  // 0-median run is dimmed alongside its n/a (budgetTone has no "no data" tone).
  const fpsColor = mergedTotal.median === 0 ? palette.dim : palette[budgetTone(mergedTotal.median)];
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
    lines.push(
      '  ' + palette.bold(`EST. PER-PASS FLOOR ≈ ${ms(group.floor)} ms  (${group.groupKey})`),
    );
    for (const real of group.reals) {
      lines.push(`    → ${real.slot} ≈ ${ms(real.real)} ms real`);
    }
  }

  pushSummary(lines, palette, report);

  // Page errors are collected during the run, not warned inline, so the report
  // can collapse a storm of identical messages into one counted line each. The
  // summary is shared with formatSweep, hence the extracted helper.
  lines.push(...formatPageErrors(report.pageErrors, palette));

  return lines.join('\n');
}

/**
 * pushTable — render one section as `<label> <median> <p90> <share> <%>`: a bold
 * title, an aligned header + `─`-rule, then a padded row per stat. Rows are
 * SORTED by median descending (biggest cost first). The share fraction is each
 * stat's median over the SECTION's median sum, drawn as an inline bar + a
 * percentage; the numeric cells are heat-colored by the row's own median so the
 * row reads as one temperature. Header/rule and the bar cell stay uncolored.
 */
function pushTable(
  lines: string[],
  palette: Palette,
  title: string,
  labelHeader: string,
  stats: readonly LayerStat[],
): void {
  lines.push('  ' + palette.bold(title));

  // Share is of the SECTION's median sum (guard 0 → all shares 0), NOT the
  // frame-total median: per-frame sums come from different frames, so a
  // frame-total denominator wouldn't make the column sum to ~100%.
  const sectionSum = stats.reduce((sum, stat) => sum + stat.median, 0);
  const sorted = [...stats].sort((a, b) => b.median - a.median);

  const header: readonly string[] = [labelHeader, 'median', 'p90', 'share', '%'];
  const bodyRows = sorted.map((stat) => {
    const fraction = sectionSum === 0 ? 0 : stat.median / sectionSum;
    return [
      stat.slot,
      ms(stat.median),
      ms(stat.p90),
      shareBar(fraction, SHARE_BAR_WIDTH),
      `${Math.round(fraction * 100)}%`,
    ];
  });
  const cells = table([header, ...bodyRows], ['left', 'right', 'right', 'left', 'right']);

  const headerLine = cells[0]!.join('  ');
  lines.push('    ' + headerLine);
  lines.push('    ' + '─'.repeat(headerLine.length));
  for (let i = 1; i < cells.length; i++) {
    const colorize = heatColor(sorted[i - 1]!.median, palette);
    const [label, median, p90, bar, pct] = cells[i]!;
    // Colorize the already-padded median/p90 cells; the bar stays plain.
    lines.push('    ' + [label, colorize(median!), colorize(p90!), bar, pct].join('  '));
  }
}

/**
 * pushSummary — the at-a-glance verdict block. Line 1 is the whole-frame budget
 * verdict (colored by `budgetTone`, dimmed when nothing was sampled); line 2
 * names the hottest MERGED pass and its section share; line 3 (only when floors
 * were attributed) is a dimmed caveat about the instrumented total's inflation.
 */
function pushSummary(lines: string[], palette: Palette, report: ScenarioReport): void {
  const { merged: mergedTotal, perLayer: perLayerTotal } = report.totals;
  lines.push('  ' + palette.bold('SUMMARY'));

  const median = mergedTotal.median;
  let verdict: string;
  if (median === 0) {
    verdict = palette.dim('— no timed GPU work sampled.');
  } else {
    const tone = budgetTone(median);
    const fps = Math.round(1000 / median);
    if (tone === 'green') {
      // 16.7 ms is the 60fps frame budget (budgetTone's green boundary); the
      // literal rides along in the display string, so it's spelled inline here.
      const headroom = Math.round((1 - median / 16.7) * 100);
      verdict = palette.green(
        `✓ Fits the 60fps budget with ${headroom}% headroom (${ms(median)} of 16.7 ms).`,
      );
    } else if (tone === 'yellow') {
      verdict = palette.yellow(
        `⚠ Over the 60fps budget (${ms(median)} of 16.7 ms — ~${fps} fps ceiling).`,
      );
    } else {
      verdict = palette.red(`✗ Over the 30fps budget (${ms(median)} ms — ~${fps} fps ceiling).`);
    }
  }
  lines.push('    ' + verdict);

  if (report.merged.length > 0) {
    const hottest = report.merged.reduce((max, stat) => (stat.median > max.median ? stat : max));
    const sectionSum = report.merged.reduce((sum, stat) => sum + stat.median, 0);
    const pct = sectionSum === 0 ? 0 : Math.round((hottest.median / sectionSum) * 100);
    lines.push(
      '    ' +
        `Hottest pass: ${hottest.slot} — ${ms(hottest.median)} ms, ${pct}% of MERGED GPU time.`,
    );
  }

  if (report.floors.length > 0) {
    const floor = report.floors.reduce((sum, group) => sum + group.floor, 0) / report.floors.length;
    // The per-layer strategy pays a timing-pass floor per layer, so its total
    // over-reads merged; report the difference (never negative) as a caveat.
    const inflated = Math.max(0, perLayerTotal.median - mergedTotal.median);
    lines.push(
      '    ' +
        palette.dim(
          `Per-pass floor ≈ ${ms(floor)} ms; instrumented per-layer total inflated ~${ms(inflated)} ms over merged.`,
        ),
    );
  }
}
