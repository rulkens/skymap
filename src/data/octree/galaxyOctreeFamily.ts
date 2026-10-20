import type { ColumnSchema } from '../../@types/octree/ColumnSchema';
import type { OctreeFamilyRow } from '../../@types/octree/OctreeFamilyRow';

// Defaults only: the bake overrides `absMag` from the catalog's own range and writes the schema
// it used into the index header, which is what the decoder reads.
export const GALAXY_COLUMN_SCHEMA: readonly ColumnSchema[] = [
  { id: 'offset', store: 'u16x3', q0: 0, q1: 1 },
  { id: 'absMag', store: 'u8', q0: -26, q1: 18 / 255 },
  { id: 'colourIndex', store: 'u8', q0: 0, q1: 2 / 255 },
  { id: 'axisRatio', store: 'u8', q0: 0, q1: 1 / 255 },
  // /256, not /255: pa lives in [0, 180), and no code is spent on 180°, which is 0° for an axis.
  { id: 'pa', store: 'u8', q0: 0, q1: 180 / 256 },
  { id: 'logSize', store: 'u8', q0: -1, q1: 4 / 255 },
  { id: 'flags', store: 'u8', q0: 0, q1: 1 },
  // log10 w over [−1, 1] as 1..255 with w = 1 at 128: exactly `encodeAngularWeight`'s code.
  { id: 'angularWeight', store: 'u8', q0: -128 / 127, q1: 1 / 127 },
];

export const GALAXY_OCTREE_FAMILY: OctreeFamilyRow = {
  dataPrefix: 'galaxy-octree/v1',
  schema: GALAXY_COLUMN_SCHEMA,
  countStat: 'recordCount',
  unitMpc: 1,
};
