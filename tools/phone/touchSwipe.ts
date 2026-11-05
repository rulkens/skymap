import { delay } from '../utils/async/delay';
import type { CdpClient } from './@types/CdpClient';
import type { Point } from './@types/Point';

const STEP_MS = 16;

/**
 * Finger down at `from`, moves spread evenly over `ms`, up at `to`. Real
 * touch events, so the page gets pointer events and native scrolling; a tap
 * is the same call with `from` = `to`.
 */
export async function touchSwipe(
  client: CdpClient,
  sessionId: string,
  from: Point,
  to: Point,
  ms: number,
): Promise<void> {
  const touch = (type: string, p?: Point) =>
    client.call('Input.dispatchTouchEvent', { type, touchPoints: p ? [p] : [] }, sessionId);
  const steps = Math.max(1, Math.round(ms / STEP_MS));
  await touch('touchStart', from);
  for (let i = 1; i <= steps; i++) {
    await delay(ms / steps);
    const t = i / steps;
    await touch('touchMove', { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
  }
  await touch('touchEnd');
}
