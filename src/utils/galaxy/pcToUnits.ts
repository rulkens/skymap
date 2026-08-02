/**
 * Parsecs to generator world units. 1 unit = 1.6667 kpc — `galacticCenter.ts`'s
 * own conversion, restated here so the pc-scale literature radii the dust and
 * HII tiers are built from land in world units without each restating it.
 */
const KPC_PER_UNIT = 1.6667;

export function pcToUnits(pc: number): number {
  return pc / (KPC_PER_UNIT * 1000);
}
