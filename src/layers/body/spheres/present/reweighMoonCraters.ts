/**
 * reweighMoonCraters — the crater table with each named crater's curated print weight
 * (`ANTIQUE_MOON_CRATER_WEIGHTS`, by place id) in place of the bake's; a copy, once.
 */

import type { MoonCraterTable } from '../@types/MoonCraterTable';
import type { MoonNamedCrater } from '../@types/MoonNamedCrater';

export function reweighMoonCraters(
  table: MoonCraterTable,
  named: readonly MoonNamedCrater[],
  weights: Readonly<Record<string, number>>,
): MoonCraterTable {
  const weight = table.weight.slice();
  for (const { id, index } of named) weight[index] = weights[id] ?? weight[index]!;
  return { ...table, weight };
}
