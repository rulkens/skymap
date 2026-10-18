import type { ColumnSchema } from '../../@types/octree/ColumnSchema';
import type { OctreeFamilyRow } from '../../@types/octree/OctreeFamilyRow';
import { SCALE_UNITS } from '../scaleUnits';
import {
  STAR_ABSMAG_MIN,
  STAR_ABSMAG_STEP,
  STAR_COLORIDX_MIN,
  STAR_COLORIDX_STEP,
} from '../starCatalog/starCatalogFormat';

// The q pairs reproduce `lutIndexToAbsMag` / `colorIdxToBpRp` (bin centres), so upload
// re-quantises to the frozen LUT without loss.
export const STAR_COLUMN_SCHEMA: readonly ColumnSchema[] = [
  { id: 'offset', store: 'u16x3', q0: 0, q1: 1 },
  {
    id: 'absMag',
    store: 'u8',
    q0: STAR_ABSMAG_MIN + 0.5 * STAR_ABSMAG_STEP,
    q1: STAR_ABSMAG_STEP,
  },
  {
    id: 'colourIndex',
    store: 'u8',
    q0: STAR_COLORIDX_MIN + 0.5 * STAR_COLORIDX_STEP,
    q1: STAR_COLORIDX_STEP,
  },
];

export const STAR_OCTREE_FAMILY: OctreeFamilyRow = {
  dataPrefix: 'star-catalog/v2',
  schema: STAR_COLUMN_SCHEMA,
  countStat: 'starCount',
  unitMpc: SCALE_UNITS.PC_TO_MPC,
};
