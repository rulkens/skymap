/**
 * Structure overlay: one item row per category, each ring + label
 * default-on. Keys are DERIVED from `STRUCTURE_IDS` so the rows can't
 * drift from the structure-id set (famous galaxies bear no ring and so
 * have no row here).
 */

import { STRUCTURE_IDS } from '../../../../data/structure/structureIds';
import type { StructureId } from '../../../../@types/data/structure/StructureId';
import type { StructureItemSettings } from '../../../../@types/settings/StructureItemSettings';
import type { StructureSettings } from '../../../../@types/settings/StructureSettings';

export const initialState: StructureSettings = {
  items: Object.fromEntries(
    STRUCTURE_IDS.map((c) => [c, { enabled: true, labelEnabled: true }]),
  ) as Record<StructureId, StructureItemSettings>,
};
