import type { StructureInfo } from '../../../../@types/data/structure/StructureInfo';
import type { SelectionRow } from '../../../../@types/engine/SelectionRow';

/**
 * A structure's selection row: the record plus the placement core frames it by. The wider
 * apparent extent is what the close-approach fade reads, so ring and label land past it.
 */
export function placedStructureRow(
  record: StructureInfo,
): Extract<SelectionRow, { type: 'structure' }> {
  return {
    ...record,
    positionMpc: record.worldPos,
    radiusMpc: record.apparentRadiusMpc ?? record.physicalRadiusMpc,
  };
}
