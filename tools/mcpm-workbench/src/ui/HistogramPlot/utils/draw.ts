import { BAR_GAP_PX } from './BAR_GAP_PX';
import { COUNT_BIN_COUNT } from './COUNT_BIN_COUNT';
import { cssVar } from './cssVar';
import { LINE_AREA_FRACTION } from './LINE_AREA_FRACTION';
import { READOUT_MARGIN_PX } from './READOUT_MARGIN_PX';

export function draw(
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
