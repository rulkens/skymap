import type { Finding } from './Finding';
import type { NodeLocation } from './NodeLocation';
import type { PropUseKind } from './PropUseKind';
import type { RefReport } from './RefReport';

/** What one engine query found for a property of an exported type; every prop planner works from this. */
export type FoundPropRefs = {
  readonly report: RefReport<PropUseKind>;
  readonly at: NodeLocation; // the property's name token in the type
  readonly refs: readonly { readonly at: NodeLocation; readonly kind: PropUseKind }[];
  readonly unreported: readonly Finding[]; // quoted mentions the engine does not report
};
