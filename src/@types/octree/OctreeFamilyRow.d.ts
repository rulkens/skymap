import type { ColumnSchema } from './ColumnSchema';
import type { StatId } from './StatId';

/** What differs between octree catalog families: where they live, what they store, how big a grid unit is. */
export type OctreeFamilyRow = {
  /** Data-root folder of the family's indexes; a catalog's chunks sit in `<dataPrefix>/<name>/`. */
  readonly dataPrefix: string;
  /** Render columns in wire order: what an index header's `columns` must equal. */
  readonly schema: readonly ColumnSchema[];
  /** The header stat that totals real records (`Octree.recordCount`). */
  readonly countStat: StatId;
  /** Mpc per grid unit. */
  readonly unitMpc: number;
};
