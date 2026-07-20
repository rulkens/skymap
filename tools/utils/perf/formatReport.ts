/**
 * formatReport — render a `ScenarioReport` as the human-readable perf table.
 *
 * The report format is the harness's user-facing product, so it lives here as a
 * PURE function of the structured `ScenarioReport` rather than inline in the CDP
 * loop: that way the output shape is unit-testable without a browser or a GPU
 * (see `formatReport.test.ts`), and `measurePerf.ts` shrinks to "gather data →
 * print it". Numbers are fixed to one decimal — GPU timings past a tenth of a
 * millisecond are noise the medians already smooth over.
 *
 * Three sections per scenario:
 *   - MERGED — one row per render-step GROUP (`hdr·NEAR0`, …), the production
 *     pass shape, each `<slot> … <median> | <p90>`.
 *   - PER-LAYER — one row per individual LAYER (`orbit-trails`, …) from the
 *     split run; each layer's cost still carries the fixed per-pass floor.
 *   - EST. PER-PASS FLOOR — emitted only for groups the harness could attribute
 *     (≥2 layers, hence a non-empty `floors`); each shows the estimated shared
 *     floor and every layer's floor-subtracted "real" cost. A single-layer
 *     scenario has no floor to separate, so `floors` is empty and this section
 *     is skipped entirely.
 */

import type { ScenarioReport, LayerStat } from '../../perf/scenarioReport';

const ms = (value: number): string => value.toFixed(1);

const statRow = (stat: LayerStat): string =>
  `    ${stat.slot} … ${ms(stat.median)} | ${ms(stat.p90)}`;

export function formatReport(report: ScenarioReport): string {
  const { scenario, viewport, dpr, frames } = report;
  const lines: string[] = [];

  lines.push(
    `${scenario}  (${viewport.width}×${viewport.height} @dpr${dpr}, ${frames} frames, median ms | p90)`,
  );

  lines.push('  MERGED (production pass shape)');
  for (const stat of report.merged) lines.push(statRow(stat));

  lines.push('  PER-LAYER (attribution; each row includes ~floor pass overhead)');
  for (const stat of report.perLayer) lines.push(statRow(stat));

  for (const group of report.floors) {
    lines.push(`  EST. PER-PASS FLOOR ≈ ${ms(group.floor)} ms  (${group.groupKey})`);
    for (const real of group.reals) {
      lines.push(`    → ${real.slot} ≈ ${ms(real.real)} ms real`);
    }
  }

  return lines.join('\n');
}
