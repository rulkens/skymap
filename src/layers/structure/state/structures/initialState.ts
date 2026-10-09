/**
 * Structure overlay: one item row per category, ring + label default-on
 * except the categories in `OFF_BY_DEFAULT`. Keys are DERIVED from
 * `STRUCTURE_IDS` so the rows can't drift from the structure-id set (famous
 * galaxies bear no ring and so have no row here).
 */

import { STRUCTURE_IDS } from '../../../../data/structure/structureIds';
import type { StructureId } from '../../../../@types/data/structure/StructureId';
import type { StructureItemSettings } from '../../../../@types/settings/StructureItemSettings';
import type { StructureSettings } from '../../../../@types/settings/StructureSettings';

// Nebulae have no rendering of their own yet, so a ring would circle empty sky.
const OFF_BY_DEFAULT: ReadonlySet<StructureId> = new Set(['nebula']);

export const initialState: StructureSettings = {
  items: Object.fromEntries(
    STRUCTURE_IDS.map((c) => {
      const on = !OFF_BY_DEFAULT.has(c);
      return [c, { enabled: on, labelEnabled: on }];
    }),
  ) as Record<StructureId, StructureItemSettings>,
};
