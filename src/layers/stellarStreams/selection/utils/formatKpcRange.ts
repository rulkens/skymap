/** "14–18 kpc": whole kiloparsecs, since the tracks' distances are not known any finer. */
export function formatKpcRange([near, far]: readonly [number, number]): string {
  return `${Math.round(near)}–${Math.round(far)} kpc`;
}
