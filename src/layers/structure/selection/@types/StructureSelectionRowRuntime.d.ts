import type { StructureRuntime } from '../../@types/StructureRuntime';
import type { StructureStore } from '../../catalog/@types/StructureStore';

/** The live reads `structureSelectionRow` makes; the runtime satisfies it. */
export type StructureSelectionRowRuntime = {
  readonly store: Pick<StructureStore, 'byId' | 'byCategory'>;
  readonly slot: Pick<StructureRuntime['slot'], 'committed'>;
} & Pick<StructureRuntime, 'pickCodes'>;
