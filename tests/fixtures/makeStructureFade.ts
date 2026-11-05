/**
 * makeStructureFade — the per-category value core hands the structure Layer's
 * producers: every category at `rest`, with per-category overrides.
 */

import { STRUCTURE_IDS } from '../../src/data/structure/structureIds';

import type { StructureId } from '../../src/@types/data/structure/StructureId';

export function makeStructureFade(
  rest = 1,
  over: Partial<Record<StructureId, number>> = {},
): Readonly<Record<StructureId, number>> {
  return Object.fromEntries(STRUCTURE_IDS.map((c) => [c, over[c] ?? rest])) as Record<
    StructureId,
    number
  >;
}
