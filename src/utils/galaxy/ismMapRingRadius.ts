/**
 * ismMapRingRadius — log-radial mapping from an ISM map ring INDEX
 * (0..rings-1) to a physical radius in generator units. Shared by the CPU
 * arm-forcing bake (`galaxyIsmMapArmForcing.ts`) and, restated rather than
 * imported (WGSL cannot import TS), `ismMapShear.wesl`'s own `ismMapRingRadius()`
 * — the two have to agree on what texel (ring, az) means or the baked
 * forcing field silently misaligns with the generator it drives.
 */
export function ismMapRingRadius(ring: number, rings: number, rMin: number, rMax: number): number {
  const t = ring / Math.max(1, rings - 1);
  return rMin * (rMax / rMin) ** t;
}
