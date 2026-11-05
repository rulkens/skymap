/**
 * The selection-kind lookup, derived from each Layer's static `selection.kinds`; there is no
 * hand-kept list. Read at call time, never at module evaluation: core modules a Layer's own
 * imports reach import this file, so a module-level fold over `APP_COMPOSITION` would close an
 * import cycle and read the tuple before it exists (the trap `appSources.ts` describes).
 */

import type { SelectionKindFacts } from '../@types/engine/layer/SelectionKindFacts';
import { APP_COMPOSITION } from './app';

let composedKinds: ReadonlyMap<string, SelectionKindFacts> | null = null;

function kindsByType(): ReadonlyMap<string, SelectionKindFacts> {
  if (composedKinds !== null) return composedKinds;
  const byType = new Map<string, SelectionKindFacts>();
  for (const layer of APP_COMPOSITION.layers) {
    for (const kind of layer.selection?.kinds ?? []) {
      if (byType.has(kind.type)) {
        throw new Error(`selectionKindOf: kind "${kind.type}" is declared twice`);
      }
      byType.set(kind.type, kind);
    }
  }
  composedKinds = byType;
  return byType;
}

/** Memoised on first call from APP_COMPOSITION.layers. Throws on an unknown type. */
export function selectionKindOf(type: string): SelectionKindFacts {
  const kind = kindsByType().get(type);
  if (kind === undefined) throw new Error(`selectionKindOf: no Layer declares kind "${type}"`);
  return kind;
}

/** Every composed kind, in composition order; same memo. */
export function selectionKinds(): readonly SelectionKindFacts[] {
  return [...kindsByType().values()];
}

/** Boot check: every runtime row's type has facts; no type declared twice. */
export function assertSelectionKindsComplete(rowTypes: readonly string[]): void {
  const byType = kindsByType();
  const missing = rowTypes.filter((type) => !byType.has(type));
  if (missing.length > 0) {
    throw new Error(`assertSelectionKindsComplete: rows with no kind facts: ${missing.join(', ')}`);
  }
}
