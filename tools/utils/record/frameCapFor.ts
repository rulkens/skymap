/**
 * frameCapFor — pads an authored-seconds duration into a runaway-guard frame
 * budget, so a beat/clip stuck on an unmet `waitUntil` readiness gate fails
 * loudly instead of spinning forever.
 *
 *   - ×1.25 — authored length is a lower bound; playback burns extra time on
 *     `waitUntil` gates and load-dissolve tails the static compile can't see.
 *   - +10 flat seconds — sized to the WHOLE take, so a short subject isn't
 *     starved by a percentage of an already-small number.
 */
export function frameCapFor(authoredSec: number, fps: number): number {
  return Math.ceil((authoredSec * 1.25 + 10) * fps);
}
