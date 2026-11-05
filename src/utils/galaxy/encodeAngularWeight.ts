/**
 * encodeAngularWeight — the SKMP byte-55 codec (pair: `decodeAngularWeight`).
 * Log scale so dimming and boosting get equal resolution: w ∈ [0.1, 10] maps
 * to 1..255 with 1.0 exactly 128; 0 is reserved for "never baked".
 */
export function encodeAngularWeight(w: number): number {
  const raw = Math.round(128 + 127 * Math.log10(w));
  if (!(raw >= 1)) return 1; // also catches NaN and log10(0) = -Infinity
  return raw > 255 ? 255 : raw;
}
