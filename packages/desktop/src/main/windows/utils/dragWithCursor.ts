import type { BrowserWindow, Point } from 'electron';

/**
 * Moves `win` with the cursor, keeping the offset it had at the start, until the returned stop is
 * called. Polled, not driven by the page's events: the cursor soon leaves a small window it drags.
 */
export function dragWithCursor(win: BrowserWindow, cursor: () => Point): () => void {
  const start = cursor();
  const { x, y } = win.getBounds();
  const timer = setInterval(() => {
    if (win.isDestroyed()) return clearInterval(timer);
    const now = cursor();
    win.setPosition(x + now.x - start.x, y + now.y - start.y);
  }, 16);
  return () => clearInterval(timer);
}
