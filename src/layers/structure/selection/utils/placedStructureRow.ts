import type { StructureInfo } from '../../../../@types/data/structure/StructureInfo';
import type { StructureSelectionRow } from '../@types/StructureSelectionRow';

/**
 * A structure's selection row: the record plus the placement core frames it by. The wider
 * apparent extent is what the close-approach fade reads, so ring and label land past it. Its
 * focus dims everything outside, fading across the [physical, apparent] band.
 */
export function placedStructureRow(record: StructureInfo): StructureSelectionRow {
  const radiusMpc = record.apparentRadiusMpc ?? record.physicalRadiusMpc;
  return {
    ...record,
    positionMpc: record.worldPos,
    radiusMpc,
    focusRegion: {
      center: record.worldPos,
      apparentRadiusMpc: radiusMpc,
      physicalRadiusMpc: record.physicalRadiusMpc,
    },
  };
}
