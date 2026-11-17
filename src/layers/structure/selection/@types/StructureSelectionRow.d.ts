import type { StructureInfo } from '../../../../@types/data/structure/StructureInfo';
import type { PlacedRow } from '../../../../@types/engine/selection/PlacedRow';
import type { RecedingFocusRow } from '../../../../@types/engine/selection/RecedingFocusRow';

export type StructureSelectionRow = StructureInfo & PlacedRow & RecedingFocusRow;
