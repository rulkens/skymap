/**
 * canvasPxPerCssPx — device pixels per CSS pixel of a canvas, read off its own two sizes so it
 * is whatever `resizeCanvasToDisplay` gave the backing store (capped DPR, or 1 after the
 * recorder's clipped capture drops it). A hidden canvas (`clientWidth` 0) reads 1.
 */
export function canvasPxPerCssPx(canvas: Pick<HTMLCanvasElement, 'width' | 'clientWidth'>): number {
  return canvas.clientWidth > 0 ? canvas.width / canvas.clientWidth : 1;
}
