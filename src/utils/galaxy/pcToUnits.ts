/**
 * Parsecs to generator world units. 1 unit = 1.6667 kpc for the Milky Way
 * preset (see `GalaxyFieldComponent`'s header) — restated here as a literal
 * so pc-scale literature radii convert without a runtime dependency.
 */
const KPC_PER_UNIT = 1.6667;

export function pcToUnits(pc: number): number {
  return pc / (KPC_PER_UNIT * 1000);
}
