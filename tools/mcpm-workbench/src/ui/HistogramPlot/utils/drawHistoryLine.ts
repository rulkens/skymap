import { cssVar } from './cssVar';
import { historyPoints } from './historyPoints';
import { HISTORY_HALO_WIDTH } from './HISTORY_HALO_WIDTH';
import { HISTORY_INSET_FRACTION } from './HISTORY_INSET_FRACTION';
import { HISTORY_LINE_WIDTH } from './HISTORY_LINE_WIDTH';

/** Strokes the convergence history over the bars, in the canvas's own CSS-pixel box. */
export function drawHistoryLine(canvas: HTMLCanvasElement, history: readonly number[]): void {
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

  // A settled run sits at the scale's floor; the vertical inset lifts it off the
  // bars' baseline so it doesn't read as the axis. The halo inset keeps the ends unclipped.
  const insetX = HISTORY_HALO_WIDTH / 2;
  const insetY = Math.max(insetX, cssHeight * HISTORY_INSET_FRACTION);
  const points = historyPoints(history, cssWidth - 2 * insetX, cssHeight - 2 * insetY);
  if (points.length === 0) return;
  ctx.translate(insetX, insetY);
  ctx.beginPath();
  for (const [x, y] of points) ctx.lineTo(x, y);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // A ground-coloured halo under the line keeps it readable where it crosses a bar.
  ctx.strokeStyle = cssVar(canvas, '--color-bg', '#000');
  ctx.lineWidth = HISTORY_HALO_WIDTH;
  ctx.stroke();
  ctx.strokeStyle = cssVar(canvas, '--color-accent', '#a8d0ff');
  ctx.lineWidth = HISTORY_LINE_WIDTH;
  ctx.stroke();
}
