/**
 * evToExposure — exposure value (stops) → linear exposure multiplier.
 *
 * The inverse of `exposureToEv`: turns the slider's log2 position back into the
 * linear gain the tone-map applies. EV 0 is unity gain, +1 doubles, −1 halves.
 *
 * The slider's ±4 EV range lands on 0.0625×–16×, which sits inside
 * `clampExposure`'s GPU-safety window by construction — so the clamp stays a
 * guard against deep-links and devtools rather than something the UI can trip.
 */

export function evToExposure(ev: number): number {
  return 2 ** ev;
}
