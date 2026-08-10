/**
 * ismMapRingRadius — log-radial mapping from an ISM map ring INDEX
 * (0..rings-1) to a physical radius in generator units. Mirrored, not
 * imported (WGSL cannot import TS), by `ismMapShear.wesl`'s own
 * `ismMapRingRadius()` — the two must stay in lockstep or a texel silently
 * means a different radius on the CPU and GPU sides.
 */
export function ismMapRingRadius(ring: number, rings: number, rMin: number, rMax: number): number {
  const t = ring / Math.max(1, rings - 1);
  return rMin * (rMax / rMin) ** t;
}
