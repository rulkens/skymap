/**
 * effectiveVolpathDivisor — the path tracer's interaction-boost policy: while the
 * camera is changing, march at a coarser divisor than the user asked for (a free
 * win, since a camera change resets the accumulator anyway — see Viewport.tsx's
 * volpathKey comment); settle back SETTLE_MS after the last camera change.
 */

/** Divisor floor while the camera is moving, regardless of the user's own setting. */
export const BOOST_DIVISOR = 4;
/** How long after the last camera change before the boost releases. */
export const SETTLE_MS = 200;

export function effectiveVolpathDivisor(userDivisor: number, msSinceCameraChange: number): number {
  return msSinceCameraChange < SETTLE_MS ? Math.max(userDivisor, BOOST_DIVISOR) : userDivisor;
}
