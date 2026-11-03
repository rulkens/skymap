/**
 * shadowLayer — a multiply layer (white = no shadow) from the same frame with
 * and without a cast shadow (equal-length RGBA buffers): per channel
 * with ÷ without, so the ground's own colour cancels and only the darkening
 * is left. A channel that is black without the shadow has nothing to darken.
 */
export function shadowLayer(withShadow: Uint8Array, without: Uint8Array): Uint8Array {
  if (withShadow.length !== without.length) throw new Error('shadowLayer: frames differ in size');
  const out = new Uint8Array(without.length);
  for (let i = 0; i < without.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const ground = without[i + c]!;
      out[i + c] =
        ground === 0 ? 255 : Math.min(255, Math.round((255 * withShadow[i + c]!) / ground));
    }
    out[i + 3] = 255;
  }
  return out;
}
