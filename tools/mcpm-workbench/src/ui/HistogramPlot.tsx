/**
 * HistogramPlot — the live convergence readout (task T20): the fork's 17-bin
 * density histogram as bars, plus `meanLogTraceAtPoints`'s time series as a
 * line beneath it. A small canvas, redrawn only when `histogram` changes —
 * Viewport already throttles how often that is (HISTOGRAM_INTERVAL_STEPS).
 *
 * Bin 16 (constants.wesl's `N_HISTOGRAM_BINS - 1`) is not a count — it's the
 * running `atomicMax(1e5 * density)` marker — so only bins 0..15 draw as
 * bars; its value surfaces as the 'peak' caption instead.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { HISTOGRAM_BINS } from '../sim/createGridBuffers';
import { useStore } from '../state/useStore';
import { useAppStore } from './storeContext';
import styles from './HistogramPlot.module.css';

const COUNT_BIN_COUNT = HISTOGRAM_BINS - 1; // bins 0..15; bin 16 is the max marker
const MAX_BIN_INDEX = HISTOGRAM_BINS - 1;
const BAR_GAP_PX = 1;
const LINE_AREA_FRACTION = 0.4; // bottom 40% of the canvas is the mean-log-trace line

function cssVar(el: Element, name: string, fallback: string): string {
  const value = getComputedStyle(el).getPropertyValue(name).trim();
  return value === '' ? fallback : value;
}

function draw(canvas: HTMLCanvasElement, counts: Uint32Array, history: readonly number[]): void {
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

  const barAreaHeight = cssHeight * (1 - LINE_AREA_FRACTION);
  const lineAreaTop = barAreaHeight + 4;
  const lineAreaHeight = cssHeight - lineAreaTop;

  // Bars — bins 0..15, linear height by count. The null bin (index 0, density <=
  // 1e-5 at the sample) is included: a swarm that hasn't reached a point yet shows
  // as a tall bar there, which is itself useful signal, not noise to hide.
  let maxCount = 0;
  for (let i = 0; i < COUNT_BIN_COUNT; i++) maxCount = Math.max(maxCount, counts[i] ?? 0);
  const barWidth = (cssWidth - BAR_GAP_PX * (COUNT_BIN_COUNT - 1)) / COUNT_BIN_COUNT;
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    draw(
      canvas,
      histogram.counts,
      histogram.history.map((sample) => sample.meanLogTraceAtPoints),
    );
  }, [histogram]);

  const peak = histogram.counts[MAX_BIN_INDEX] ?? 0;

  return (
    <div className={styles.root}>
      <div className={styles.canvasBox}>
        <canvas ref={canvasRef} className={styles.canvas} />
      </div>
      <div className={styles.caption}>
        <span>
          mean log trace:{' '}
          <span className={styles.captionValue}>
            {Number.isFinite(histogram.meanLogTraceAtPoints)
              ? histogram.meanLogTraceAtPoints.toFixed(3)
              : '—'}
          </span>
        </span>
        <span>
          peak: <span className={styles.captionValue}>{(peak / 1e5).toFixed(3)}</span>
        </span>
      </div>
    </div>
  );
}

export default HistogramPlot;
