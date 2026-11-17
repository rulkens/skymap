/**
 * The selection-kind lookup over the composition the engine built: `createLayers` installs
 * each Layer's static `selection.kinds` at boot, so the lookup imports no composition and
 * cannot close a module-init cycle. A read before install is a boot-order bug, so it throws.
 */

import type { SelectionKindFacts } from '../../../@types/engine/layer/SelectionKindFacts';

let installed: ReadonlyMap<string, SelectionKindFacts> | null = null;

/** Replaces the lookup; `assertSelectionKindsComplete` has already refused a duplicate type. */
export function installSelectionKinds(kinds: readonly SelectionKindFacts[]): void {
  installed = new Map(kinds.map((kind) => [kind.type, kind]));
}

/** The installed facts for `type`; throws before install or for a type no Layer declares. */
export function selectionKindOf(type: string): SelectionKindFacts {
  if (installed === null) {
    throw new Error(`selectionKindOf("${type}"): no kinds installed; createLayers installs them`);
  }
  const kind = installed.get(type);
  if (kind === undefined) throw new Error(`selectionKindOf: no Layer declares kind "${type}"`);
  return kind;
}
