/**
 * HistogramPlot — the live convergence readout (task T20): the fork's 17-bin
 * density histogram as bars, plus `meanLogTraceAtPoints`'s time series as a
 * line beneath it. A small canvas, redrawn only when `histogram` changes —
 * Viewport already throttles how often that is (HISTOGRAM_INTERVAL_STEPS).
 *
 * Bin 16 (constants.wesl's `N_HISTOGRAM_BINS - 1`) is not a count — it's the
 * running `atomicMax(1e5 * density)` marker — so only bins 0..15 draw as
 * bars; its value surfaces in the 'M' readout instead (S13, below).
 *
 * S13 fork parity (vendor main.cpp:1589-1622): the four info labels —
 * E (mean), M (top-bin marker), null% and the log base — sit right-aligned
 * beside the bars. They render as absolutely-positioned DOM rows (so each
 * carries a CompactInfoTip hover) but `draw()` still measures the SAME
 * strings with the canvas's own font to reserve the bars' strip width —
 * right alignment keeps a value's width change from nudging anything else
 * (the brief's "no layout jump") in both coordinate spaces.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import CompactInfoTip from '../../../../src/components/common/CompactInfoTip/CompactInfoTip';
import { HISTOGRAM_BASE, HISTOGRAM_BINS } from '../sim/createGridBuffers';
import { useStore } from '../state/useStore';
import { useAppStore } from './storeContext';
import styles from './HistogramPlot.module.css';

const COUNT_BIN_COUNT = HISTOGRAM_BINS - 1; // bins 0..15; bin 16 is the max marker
const MAX_BIN_INDEX = HISTOGRAM_BINS - 1;
const BAR_GAP_PX = 1;
const LINE_AREA_FRACTION = 0.4; // bottom 40% of the canvas is the mean-log-trace line
const READOUT_MARGIN_PX = 4; // mirrored by .readout's 4px offsets in the CSS

function cssVar(el: Element, name: string, fallback: string): string {
  const value = getComputedStyle(el).getPropertyValue(name).trim();
  return value === '' ? fallback : value;
}

/** Fork parity: `precision(4)`/`precision(2)` (std::defaultfloat) — the shortest
 * fixed-or-scientific form carrying exactly `sigFigs` significant digits. */
function formatSignificant(value: number, sigFigs: number): string {
  return Number.isFinite(value) ? value.toPrecision(sigFigs) : '—';
}

/**
 * Sum of the 16 real count bins — every in-grid sampled point increments
 * exactly one of them (histogram.wesl's `histoIndex` is always 0..15), so
 * this sum IS the sampled total the fork calls `norm_coef` (main.cpp:1622)
 * without a second buffer element: `HistogramReadback.sampledCount` already
 * carries the same number, but `recordHistogramSample` doesn't thread it
 * into `HistogramSlice` (it's consumed there, not stored) — re-deriving it
 * from `counts` avoids growing the slice for a value already implicit in it.
 */
function sampledTotal(counts: Uint32Array): number {
  let total = 0;
  for (let i = 0; i < COUNT_BIN_COUNT; i++) total += counts[i] ?? 0;
  return total;
}

/** The E / M / null% / log-base readout rows, shared by the DOM overlay (which
 * renders them with hover tips) and `draw()` (which measures them for layout). */
function readoutLinesFor(counts: Uint32Array, meanLogTraceAtPoints: number): readonly string[] {
  const peak = counts[MAX_BIN_INDEX] ?? 0;
  const nullCount = counts[0] ?? 0;
  const total = sampledTotal(counts);
  const nullPct = total > 0 ? (100 * nullCount) / total : NaN;
  return [
    `E: ${formatSignificant(meanLogTraceAtPoints, 4)}`,
    `M: ${formatSignificant(peak / 1e5, 4)}`,
    total > 0 ? `null: ${formatSignificant(nullPct, 2)}%` : 'null: —',
    `(log ${HISTOGRAM_BASE})`,
  ];
}

const READOUT_TIPS: readonly string[] = [
  'Mean log trace density over the histogram sample points (catalog positions, or random positions with jittered sampling on) — the convergence signal. The line under the bars plots its history; flat means the field has settled.',
  "Running maximum sampled density — the fork's atomicMax marker bin, not a count. The field's hot ceiling; a reference when sizing the path tracer's trace max majorant.",
  "Share of samples in the null bin (density ≤ 1e-5): places the swarm hasn't deposited yet. Expect it to fall as the network grows over the points.",
  'Bin scale — the 16 bars are log-spaced density bins in this base.',
];

function draw(
  canvas: HTMLCanvasElement,
  counts: Uint32Array,
  history: readonly number[],
  readoutLines: readonly string[],
): void {
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth;
  const cssHeight = canvas.clientHeight;
  if (cssWidth === 0 || cssHeight === 0) return;
  const targetWidth = Math.round(cssWidth * dpr);
  const targetHeight = Math.round(cssHeight * dpr);
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const barColor = cssVar(canvas, '--color-accent-bright', '#5fb0ff');
  const lineColor = cssVar(canvas, '--color-fg-base', '#e8e8e8');
  const dividerColor = cssVar(canvas, '--border-divider', '#3a3a3a');
  const readoutFont =
    `${cssVar(canvas, '--font-size-sm', '10px')} ` +
    cssVar(canvas, '--font-family-mono', 'monospace');

  const barAreaHeight = cssHeight * (1 - LINE_AREA_FRACTION);
  const lineAreaTop = barAreaHeight + 4;
  const lineAreaHeight = cssHeight - lineAreaTop;

  // S13: the readout column is measured BEFORE the bars so they lay out in a
  // narrower strip that leaves the DOM rows their own column (never overlaid on
  // a tall bar). Same strings + same font tokens as `.readout`'s CSS, so the
  // measurement tracks what actually renders. Confined to the bar area only —
  // the mean-trace line beneath is this project's own addition (the fork has no
  // such series), so it keeps the full width.
  ctx.font = readoutFont;
  const readoutWidth = Math.max(...readoutLines.map((line) => ctx.measureText(line).width));
  const barsWidth = Math.max(0, cssWidth - readoutWidth - READOUT_MARGIN_PX * 3);

  // Bars — bins 0..15, linear height by count. The null bin (index 0, density <=
  // 1e-5 at the sample) is included: a swarm that hasn't reached a point yet shows
  // as a tall bar there, which is itself useful signal, not noise to hide.
  let maxCount = 0;
  for (let i = 0; i < COUNT_BIN_COUNT; i++) maxCount = Math.max(maxCount, counts[i] ?? 0);
  const barWidth = (barsWidth - BAR_GAP_PX * (COUNT_BIN_COUNT - 1)) / COUNT_BIN_COUNT;
  ctx.fillStyle = barColor;
  for (let i = 0; i < COUNT_BIN_COUNT; i++) {
    const count = counts[i] ?? 0;
    const h = maxCount > 0 ? (count / maxCount) * (barAreaHeight - 2) : 0;
    const x = i * (barWidth + BAR_GAP_PX);
    ctx.fillRect(x, barAreaHeight - h, barWidth, h);
  }

  // Divider between the bars and the line.
  ctx.strokeStyle = dividerColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, barAreaHeight + 2);
  ctx.lineTo(cssWidth, barAreaHeight + 2);
  ctx.stroke();

  // Line — meanLogTraceAtPoints over the recent history window.
  if (history.length > 1) {
    let min = Infinity;
    let max = -Infinity;
    for (const v of history) {
      if (!Number.isFinite(v)) continue;
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    const span = max > min ? max - min : 1;
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    history.forEach((v, i) => {
      const x = (i / (history.length - 1)) * cssWidth;
      const t = Number.isFinite(v) ? (v - min) / span : 0.5;
      const y = lineAreaTop + lineAreaHeight * (1 - t);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
}

function HistogramPlot(): ReactNode {
  const store = useAppStore();
  const histogram = useStore(store, (s) => s.histogram);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const readoutLines = readoutLinesFor(histogram.counts, histogram.meanLogTraceAtPoints);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    draw(
      canvas,
      histogram.counts,
      histogram.history.map((sample) => sample.meanLogTraceAtPoints),
      readoutLinesFor(histogram.counts, histogram.meanLogTraceAtPoints),
    );
  }, [histogram]);

  return (
    <div className={styles.root}>
      <div className={styles.canvasBox}>
        <canvas ref={canvasRef} className={styles.canvas} />
        <div className={styles.readout}>
          {readoutLines.map((line, i) => (
            <CompactInfoTip key={READOUT_TIPS[i]} label={READOUT_TIPS[i]} align="end">
              <span className={i === 0 ? styles.readoutEmphasis : styles.readoutRow}>{line}</span>
            </CompactInfoTip>
          ))}
        </div>
      </div>
    </div>
  );
}

export default HistogramPlot;
