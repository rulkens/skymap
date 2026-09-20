import type { AreaEdge } from './AreaEdge';
import type { AreaStability } from './AreaStability';
import type { CloneReport } from './CloneReport';
import type { ConventionAudit } from './ConventionAudit';
import type { DeadExportAudit } from './DeadExportAudit';
import type { StateInventory } from './StateInventory';
import type { TestMirror } from './TestMirror';

export type StructureAuditArea = {
  readonly name: string;
  readonly group: string;
  readonly files: number;
  readonly code: number;
};

export type StructureAuditCycle = {
  readonly size: number;
  readonly areas: readonly string[];
  readonly files: readonly string[];
};

/** Everything the page renders, embedded as one JSON literal. */
export type StructureAuditData = {
  readonly generated: string;
  readonly totals: { readonly files: number; readonly edges: number };
  readonly groups: readonly string[];
  readonly areas: readonly StructureAuditArea[];
  readonly areaEdges: readonly AreaEdge[];
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
