/**
 * effectiveVolpathDivisor — the interaction-priority quality-window policy: while any
 * UI store write is fresh, coarsen a value the user asked for; settle back SETTLE_MS
 * after the last one. Started as the path tracer's own camera-only boost (a free win —
 * a camera change resets its accumulator anyway); Task FLE fanned it out to the same
 * trigger (Viewport.tsx's `lastInteractionMs`, any UI write) feeding the path tracer
 * AND raymarch divisors — so the name is legacy-scoped, not the function's only
 * caller. The sim step shares only SETTLE_MS: it pauses outright in that window.
 */
import { SETTLE_MS } from './settleMs.constant';
import { BOOST_DIVISOR } from './boostDivisor.constant';

export function effectiveVolpathDivisor(userDivisor: number, msSinceInteraction: number): number {
  return msSinceInteraction < SETTLE_MS ? Math.max(userDivisor, BOOST_DIVISOR) : userDivisor;
}
