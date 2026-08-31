/**
 * effectiveVolpathDivisor — the interaction-priority quality-window policy: while any
 * UI store write is fresh, coarsen a value the user asked for; settle back SETTLE_MS
 * after the last one. Started as the path tracer's own camera-only boost (a free win —
 * a camera change resets its accumulator anyway); Task FLE fanned it out to the same
 * trigger (Viewport.tsx's `lastInteractionMs`, any UI write) feeding THREE consumers —
 * the path tracer divisor, the raymarch divisor, and (as a synthetic "divisor 1") the
 * sim step cadence — so the name is legacy-scoped, not the function's only caller.
 */

/** Coarsening floor while an interaction is fresh, regardless of the user's own value. */
export const BOOST_DIVISOR = 4;
/** How long after the last interaction before the boost releases. */
export const SETTLE_MS = 200;

export function effectiveVolpathDivisor(userDivisor: number, msSinceInteraction: number): number {
  return msSinceInteraction < SETTLE_MS ? Math.max(userDivisor, BOOST_DIVISOR) : userDivisor;
}
