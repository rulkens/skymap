import type { AreaEdge } from './AreaEdge';
import type { AreaStability } from './AreaStability';
import type { CloneReport } from './CloneReport';
import type { ConventionAudit } from './ConventionAudit';
import type { DeadExportAudit } from './DeadExportAudit';
import type { StateInventory } from './StateInventory';
import type { StructureAuditArea } from './StructureAuditArea';
import type { StructureAuditCycle } from './StructureAuditCycle';
import type { TestMirror } from './TestMirror';

/** Everything the page renders, embedded as one JSON literal; `generated` is the ISO date of the run. */
export type StructureAuditData = {
  readonly generated: string;
  readonly totals: { readonly files: number; readonly edges: number };
  /** Tier names low to high; the page ranks areas by index into this list. */
  readonly groups: readonly string[];
  readonly areas: readonly StructureAuditArea[];
  readonly areaEdges: readonly AreaEdge[];
  /** `"<from area>|<to area>"` → its `[from file, to file, typeOnly]` edges; feeds the matrix cell drill-down. */
  readonly pairFiles: Readonly<Record<string, readonly (readonly [string, string, boolean])[]>>;
  readonly sccs: readonly StructureAuditCycle[];
  readonly sccStats: {
    readonly count: number;
    readonly filesInCycles: number;
    readonly largest: number;
  };
  readonly fanIn: readonly (readonly [string, number])[];
  readonly fanOut: readonly (readonly [string, number])[];
  readonly state: StateInventory;
  readonly audit: {
    readonly conv: ConventionAudit;
    readonly mirror: readonly TestMirror[];
    readonly inst: readonly AreaStability[];
    readonly dead: DeadExportAudit;
    readonly dup: { readonly strict: CloneReport; readonly loose: CloneReport };
  };
};
