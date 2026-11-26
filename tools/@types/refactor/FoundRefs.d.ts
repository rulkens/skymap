import type { NodeLocation } from './NodeLocation';
import type { RefReport } from './RefReport';
import type { SymbolRefKind } from './SymbolRefKind';

/** What one engine query found for an exported symbol; every planner works from this. */
export type FoundRefs = {
  readonly report: RefReport<SymbolRefKind>;
  readonly at: NodeLocation; // the declaration's name token
  readonly refs: readonly NodeLocation[]; // every other reference
};
