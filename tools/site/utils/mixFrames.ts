/** `from` faded into `to`: all of `from` at `weight` 0, all of `to` at 1, per byte, so two frames of one size blend pixel by pixel. */
export function mixFrames(from: Uint8Array, to: Uint8Array, weight: number): Uint8Array {
  const out = new Uint8Array(from.length);
  for (let i = 0; i < out.length; i++)
    out[i] = Math.round(from[i]! * (1 - weight) + to[i]! * weight);
  return out;
}
