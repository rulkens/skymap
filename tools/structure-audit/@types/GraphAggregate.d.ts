import type { AreaEdge } from './AreaEdge';
import type { AreaStability } from './AreaStability';
import type { StructureAuditCycle } from './StructureAuditCycle';

/** The file graph folded to areas. `pairFiles` is keyed `"<from area>|<to area>"`, largest cycle first. */
export type GraphAggregate = {
  readonly areaEdges: readonly AreaEdge[];
  readonly pairFiles: Readonly<Record<string, readonly (readonly [string, string, boolean])[]>>;
  readonly stability: readonly AreaStability[];
  readonly sccs: readonly StructureAuditCycle[];
  /** `[file, importer count]` and `[file, import count]`, top N each. */
  readonly fanIn: readonly (readonly [string, number])[];
  readonly fanOut: readonly (readonly [string, number])[];
};
