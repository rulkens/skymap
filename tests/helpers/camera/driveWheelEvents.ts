/**
 * driveWheelEvents — replay a hand-scheduled wheel event timeline against
 * real 16ms frame ticks, applying each event at its own timestamp rather than
 * folding it into the frame loop's own cadence. Some regressions only
 * reproduce at this decoupled cadence — a wheel notch arriving on its own
 * clock while frames still tick every 16ms.
 */

import type { CameraSimHarness } from './CameraSimHarness';

export function driveWheelEvents(
  h: CameraSimHarness,
  events: readonly { readonly t: number; readonly deltaY: number }[],
  endT: number,
  options: {
    readonly cursorPx?: readonly [number, number];
    readonly onFrame?: (t: number) => void;
  } = {},
): void {
  const [xPx, yPx] = options.cursorPx ?? [50, 50];
  let evIdx = 0;
  for (let t = 0; t <= endT; t += 16) {
    while (evIdx < events.length && events[evIdx]!.t <= t) {
      h.push({ kind: 'wheel', deltaY: events[evIdx]!.deltaY, duringGesture: false, xPx, yPx });
      evIdx += 1;
    }
    h.tick(t);
    options.onFrame?.(t);
  }
}
