import type { StructureInfo } from '../../../../@types/data/structure/StructureInfo';
import type { StructureRef } from './StructureRef';

export type StructureTarget = StructureInfo & { readonly ref: StructureRef };
